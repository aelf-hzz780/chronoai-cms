// Deprecated patched-protocol baseline; preserved as historical R031 evidence, not a native acceptance claim.
// Modeled V1 issuer/authority. Isolated SQLite and safe adapters, no real NyxID,
// Ghost or provider access. Actual upstream revocation needs separate validation.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPair,exportJWK,SignJWT,decodeJwt} from 'jose';
import {AuthManager} from '../src/auth.ts';
import {NyxAuthority} from '../src/nyxid.ts';
import {Policy,type Actor} from '../src/policy.ts';
import {Store} from '../src/store.ts';
import {ContentService} from '../src/content.ts';
import {PublishingService,ReleaseWorker,type OriginalAdapter} from '../src/publishing.ts';
import {DistributionService,DeliveryWorker} from '../src/distribution.ts';
import {AlternateService,AlternateWorker} from '../src/alternates.ts';
import {TargetRegistry,type Target} from '../src/targets.ts';
import {Vault} from '../src/vault.ts';
import {loadConfig} from '../src/config.ts';
import {createApp} from '../src/app.ts';
import {commandRequest,projectionCommand,assertCommandBinding} from '../src/command-authority.ts';
import {digest} from '../src/content.ts';
import {RemoteError} from '../src/http-client.ts';

test('R031 V1 consumer: exact ingress, durable command binding and both worker boundaries',async t=>{
 const pair=await generateKeyPair('RS256'),jwk={...await exportJWK(pair.publicKey),kid:'key-command-test'};
 let base='',sourceActive=true,onlineFailure='',checks=0;const revokedProofs=new Set<string>();
 const server=createServer(async(req,res)=>{
  res.setHeader('content-type','application/json');
  if(req.url==='/.well-known/openid-configuration')return res.end(JSON.stringify({issuer:base,authorization_endpoint:base+'/authorize',token_endpoint:base+'/token',jwks_uri:base+'/jwks',code_challenge_methods_supported:['S256']}));
  if(req.url==='/jwks')return res.end(JSON.stringify({keys:[jwk]}));
  if(req.url==='/introspect'){
   const chunks=[];for await(const c of req)chunks.push(c);
   const form=new URLSearchParams(Buffer.concat(chunks).toString()),p=decodeJwt(form.get('token')!);
   if(form.get('token_type_hint')==='command_authority'){
    checks++;assert.equal(form.get('service_id'),'catalog');assert.equal(form.get('client_secret'),'test-secret');
    if(onlineFailure==='503'){res.statusCode=503;return res.end('{}');}
    if(onlineFailure==='malformed')return res.end('{');
    return res.end(JSON.stringify(sourceActive&&!revokedProofs.has(p.jti!)?{...p,active:true,token_type:'command_authority',scope:'proxy',independent_commands:onlineFailure!=='wrong flags',authority_version:1,permissions:[],...(onlineFailure==='wrong service'?{user_service_id:'another-connection'}:{})}:{active:false}));
   }
   return res.end(JSON.stringify({active:true,sub:p.sub,iss:p.iss,scope:p.scope}));
  }
  if(req.url==='/api/v1/orgs')return res.end(JSON.stringify({orgs:[{id:'organization',your_role:'member'}]}));
  res.statusCode=404;res.end('{}');
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const directory=await mkdtemp(join(tmpdir(),'blog-command-workers-'));t.after(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});});
 const config=loadConfig({PUBLIC_URL:'http://localhost:3597',ALLOW_LOOPBACK_HTTP:'true',NYXID_ISSUER:base,NYXID_API_URL:base,NYXID_CLIENT_ID:'cms',NYXID_CLIENT_SECRET:'test-secret',NYXID_CMS_AUDIENCE:'cms',NYXID_SERVICE_AUDIENCE:'service',NYXID_TOKEN_AUDIENCE:'delegation',NYXID_SERVICE_ID:'catalog',NYXID_SERVICE_SLUG:'blog',NYXID_INTROSPECTION_URL:base+'/introspect',ENCRYPTION_KEY:'de'.repeat(32),TRACKING_SECRET:'local-only',NYXID_SERVICE_CAPABILITY_SCOPES_JSON:JSON.stringify({'content:read':['account:read'],'content:write':['proxy:*'],publish:['proxy:*']})});
 const sign=(claims:Record<string,unknown>,aud:string,typ='JWT',lifetime=300)=>new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:jwk.kid,typ}).setIssuer(base).setSubject('person').setAudience(aud).setIssuedAt().setExpirationTime(`${lifetime}s`).setJti(crypto.randomUUID()).sign(pair.privateKey);
 const delegation=await sign({token_type:'access',delegated:true,act:{sub:'blog'},scope:'account:read proxy:*'},'delegation'),identity=await sign({nyx_service_id:'catalog'},'service','JWT',60);
 const headers={'x-nyxid-identity-token':identity,'x-nyxid-delegation-token':delegation};
 const issue=async(path:string,body:string,options:{method?:string;contentType?:string|null;idempotencyKey?:string|null;claims?:Record<string,unknown>}={})=>{
  const descriptor=commandRequest(options.method??'POST',path,Buffer.from(body),options.contentType===undefined?'application/json':options.contentType,options.idempotencyKey??null);
  const token=await sign({authority_version:1,user_service_id:'personal-http-connection',delegation_sha256:digest(delegation),command_request:descriptor,source:{key_id:'key',credential_id:'child',credential_incarnation:digest('original')},...options.claims},'catalog','nyxid-command-authority+jwt',240);
  return {token,descriptor};
 };
 function open(path:string){const store=new Store(path),vault=new Vault(config.encryptionKey),authority=new NyxAuthority(config,store),policy=new Policy(store,authority),content=new ContentService(store,policy),auth=new AuthManager(config,store,vault,policy),pub=new PublishingService(content,vault);return {store,vault,policy,content,auth,pub};}
 for(const kind of ['release','delivery'])for(const scenario of ['valid child','valid key','key deleted','scope narrowed','child revoked','child rotated','wrong service','wrong flags','503','malformed','final revocation','dispatch revocation'].filter(name=>kind==='delivery'||name!=='dispatch revocation'))await t.test(`${kind}: ${scenario}`,async()=>{
  sourceActive=true;onlineFailure='';checks=0;let writes=0,atBoundary=false;
  const path=join(directory,`${kind}-${scenario}.sqlite`);let f=open(path);
  const actor=await f.auth.propagated(identity,delegation);f.store.createOwner('owner','personal',base,'person');f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site','owner','en','http://localhost:3598','NO_KEY');
  const article=await f.content.create(actor,{ownerId:'owner',language:'en',title:'Command source',markdown:'Local fixture',creditedAuthor:'person'},'draft');
  const releaseInput={ownerId:'owner',revisionId:article.revision.id,creditedAuthor:'person',action:'publish',rightsConfirmed:true,idempotencyKey:'original'};
  let app=await createApp({...f,publicUrl:config.publicUrl,auth:f.auth,authenticate:r=>f.auth.authenticate(r)});
  const releasePath=`/api/service/articles/${article.id}/releases`,body=JSON.stringify(releaseInput),proof=await issue(releasePath,body,scenario==='valid key'?{claims:{source:{key_id:'key',credential_id:null,credential_incarnation:digest('original')}}}:{});
  const confirmation=await app.inject({method:'POST',url:releasePath,payload:body,headers:{...headers,'content-type':'application/json','x-nyxid-command-authority':proof.token}});
  assert.equal(confirmation.statusCode,202,confirmation.body);const release=confirmation.json();
  const saved=f.vault.open<Actor>(f.store.get('SELECT actor_json FROM releases WHERE id=?',release.id)!.actor_json);assert.equal(saved.commandAuthority!.token,proof.token);
  const boundary=()=>{if(atBoundary&&scenario==='final revocation')sourceActive=false;};
  const result={remoteId:'original',url:'http://localhost:3598/original/'};
  const original:OriginalAdapter={async publish(input){boundary();await input.beforeWrite!();writes++;return result;},async unpublish(input){await input.beforeWrite!();writes++;},async verify(){return true;},async reconcile(){return result;}};
  const copy={state:'published' as const,remoteId:'copy',url:'https://local.invalid/copy',sourceVerified:true};
  const target:Target={name:'local',automatic:true,automaticActions:['create'],async write(_p,_c,send){boundary();await send({method:'POST',url:'https://local.invalid/copy'});return copy;},async reconcile(){return copy;}};
  const connections={async connection(){return {id:'connection',accountId:'person',active:true};},async approval(){return {};},async execute(_a:Actor,input:any){if(atBoundary&&scenario==='dispatch revocation')sourceActive=false;await input.beforeWrite?.();input.beforeDispatch();writes++;return {accountId:'person',status:201,body:{}};}};
  const distribution=()=>new DistributionService(f.pub,connections,new TargetRegistry([target]));
  let id=release.id;
  if(kind==='delivery'){
   await new ReleaseWorker(f.pub,original).once();assert.equal(writes,1);writes=0;
   await app.close();app=await createApp({...f,publicUrl:config.publicUrl,distribution:distribution(),auth:f.auth,authenticate:r=>f.auth.authenticate(r)});
   const deliveryPath=`/api/service/releases/${release.id}/deliveries`,b=JSON.stringify({target:'local',connectionId:'connection',format:'full',action:'create',rightsConfirmed:true,idempotencyKey:'copy'}),p=await issue(deliveryPath,b,scenario==='valid key'?{claims:{source:{key_id:'key',credential_id:null,credential_incarnation:digest('original')}}}:{});
   const confirmation=await app.inject({method:'POST',url:deliveryPath,payload:b,headers:{...headers,'content-type':'application/json','x-nyxid-command-authority':p.token}});assert.equal(confirmation.statusCode,202,confirmation.body);id=confirmation.json().id;
  }
  await app.close();f.store.close();f=open(path);atBoundary=true;
  if(['key deleted','scope narrowed','child revoked','child rotated'].includes(scenario))sourceActive=false;
  if(['wrong service','wrong flags','503','malformed'].includes(scenario))onlineFailure=scenario;
  const before=checks;
  try{
   if(kind==='release')await new ReleaseWorker(f.pub,original).once();else await new DeliveryWorker(distribution(),original).once();
   const row=f.store.get(`SELECT * FROM ${kind==='release'?'releases':'deliveries'} WHERE id=?`,id)!;
   assert.ok(checks>before,'Authority is rechecked after reopening the saved database');assert.equal(writes,['valid child','valid key'].includes(scenario)?1:0);
   assert.equal(row.state,['valid child','valid key'].includes(scenario)?'published':'blocked');
   if(!['valid child','valid key'].includes(scenario))assert.equal(row.error_code,'IDENTITY_UNAVAILABLE');
   if(kind==='release'&&['valid child','valid key'].includes(scenario)){
    const projection=f.store.get('SELECT * FROM projections ORDER BY rowid DESC LIMIT 1')!;
    assertCommandBinding(f.store,saved,projectionCommand(projection));let metadataWrites=0;
    await new AlternateWorker(new AlternateService(f.pub),{async alternates(input){await input.beforeWrite!();metadataWrites++;}}).once();assert.equal(metadataWrites,1);
   }
  }finally{f.store.close();}
 });

 await t.test('key recovery queues no metadata; separate media and sync commands use fresh authority',async()=>{
  sourceActive=true;onlineFailure='';const f=open(':memory:');
  const app=await createApp({...f,publicUrl:config.publicUrl,auth:f.auth,authenticate:r=>f.auth.authenticate(r)});
  try{
   const actor=await f.auth.propagated(identity,delegation);f.store.createOwner('owner','personal',base,'person');f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site','owner','en','http://localhost:3598','NO_KEY');
   const article=await f.content.create(actor,{ownerId:'owner',language:'en',title:'Recover key command',markdown:'Exact old revision',creditedAuthor:'person'},'draft');
   const send=async(path:string,input:unknown,proof?:string)=>app.inject({method:'POST',url:path,payload:JSON.stringify(input),headers:{...headers,'content-type':'application/json',...(proof?{'x-nyxid-command-authority':proof}:{})}});
   const originalPath=`/api/service/articles/${article.id}/releases`,body={ownerId:'owner',revisionId:article.revision.id,creditedAuthor:'person',rightsConfirmed:true,action:'publish',idempotencyKey:'old'};
   const proof=await issue(originalPath,JSON.stringify(body)),confirmed=await send(originalPath,body,proof.token);assert.equal(confirmed.statusCode,202,confirmed.body);const release=confirmed.json();
   let ghostWrites=0,mediaWrites=0,metadataWrites=0;const result={remoteId:'accepted',url:'http://localhost:3598/accepted/'};
   const original:OriginalAdapter={async publish(input){await input.beforeWrite!();ghostWrites++;throw new RemoteError('REMOTE_UNCERTAIN','Accepted but response lost',true);},async verify(){return true;},async reconcile(){return result;},async unpublish(){throw Error('unexpected');},async materialize(input){await input.beforeMaterialize!();mediaWrites++;return true;}};
   const worker=new ReleaseWorker(f.pub,original);await worker.once();assert.equal(ghostWrites,1);
   revokedProofs.add(decodeJwt(proof.token).jti!);const cipher=f.store.get('SELECT actor_json FROM releases WHERE id=?',release.id)!.actor_json;
   assert.equal((await send(`/api/service/releases/${release.id}/reconcile`,{})).statusCode,200);await worker.once();
   assert.equal(ghostWrites,1);assert.equal(mediaWrites,0);assert.equal(f.store.get('SELECT count(*) n FROM projections')!.n,0);
   // Seed the known accepted-but-missing-images state to exercise the explicit
   // command. The real Ghost/file behavior is covered in media-authority.test.
   f.store.run("UPDATE releases SET state='verifying' WHERE id=?",release.id);
   const mediaPath=`/api/service/releases/${release.id}/materialize-media`,mediaBody={ownerId:'owner',revisionId:article.revision.id,rightsConfirmed:true,idempotencyKey:'fresh-media'};
   assert.equal((await send(mediaPath,mediaBody)).statusCode,403);assert.ok((await send(mediaPath,mediaBody,proof.token)).statusCode>=400);
   const mediaProof=await issue(mediaPath,JSON.stringify(mediaBody)),media=await send(mediaPath,mediaBody,mediaProof.token);assert.equal(media.statusCode,202,media.body);
   assert.notEqual(decodeJwt(mediaProof.token).jti,decodeJwt(proof.token).jti);assert.equal((await send(mediaPath,mediaBody,mediaProof.token)).json().id,media.json().id);
   assert.equal(f.store.get('SELECT kind FROM command_authorities WHERE jti=?',decodeJwt(mediaProof.token).jti!)!.kind,'release-media');
   await worker.once();assert.equal(mediaWrites,1);assert.equal(ghostWrites,1);assert.equal(f.store.get('SELECT actor_json FROM releases WHERE id=?',release.id)!.actor_json,cipher);assert.equal(f.store.get('SELECT count(*) n FROM projections')!.n,0);
   const syncPath=`/api/service/articles/${article.id}/sync-links`;assert.equal((await send(syncPath,{})).statusCode,403);
   const sync=await issue(syncPath,'{}');assert.equal((await send(syncPath,{},sync.token)).statusCode,200);
   await new AlternateWorker(new AlternateService(f.pub),{async alternates(input){await input.beforeWrite!();metadataWrites++;}}).once();assert.equal(metadataWrites,1);
  }finally{await app.close();f.store.close();}
 });

 await t.test('organization Publisher and exact approval retain the original request source',async()=>{
  sourceActive=true;onlineFailure='';const f=open(':memory:');let writes=0;
  const result={remoteId:'org-original',url:'http://localhost:3598/org/'};
  const original:OriginalAdapter={async publish(input){await input.beforeWrite!();writes++;return result;},async unpublish(){throw Error('unexpected');},async verify(){return true;},async reconcile(){return result;}};
  const copy={state:'published' as const,remoteId:'copy',url:'https://local.invalid/copy',sourceVerified:true};
  const target:Target={name:'local',automatic:true,automaticActions:['create'],async write(_p,_c,send){await send({method:'POST',url:'https://local.invalid/copy'});return copy;},async reconcile(){return copy;}};
  const connections={async connection(){return {id:'connection',accountId:'organization',active:true};},async approval(_a:Actor,_o:unknown,reference:string){assert.equal(reference,'exact-approved');return {};},async execute(_a:Actor,input:any){await input.beforeWrite?.();input.beforeDispatch();writes++;return {accountId:'organization',status:201,body:{}};}};
  const distribution=new DistributionService(f.pub,connections,new TargetRegistry([target]));
  const app=await createApp({...f,publicUrl:config.publicUrl,distribution,auth:f.auth,authenticate:r=>f.auth.authenticate(r)});
  const send=async(path:string,input:unknown,claims:Record<string,unknown>={})=>{const body=JSON.stringify(input),proof=await issue(path,body,{claims});return {proof,response:await app.inject({method:'POST',url:path,payload:body,headers:{...headers,'content-type':'application/json','x-nyxid-command-authority':proof.token}})};};
  try{
   const actor=await f.auth.propagated(identity,delegation);f.store.createOwner('org','organization',base,'organization');f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','org-site','org','en','http://localhost:3598','NO_KEY');
   const article=await f.content.create(actor,{ownerId:'org',language:'en',title:'Organization',markdown:'Exact source',creditedAuthor:'person'},'org-draft');
   const path=`/api/service/articles/${article.id}/releases`,input={ownerId:'org',revisionId:article.revision.id,creditedAuthor:'person',action:'publish',rightsConfirmed:true,idempotencyKey:'org-release'};
   assert.equal((await send(path,input)).response.statusCode,403,'Ordinary member is not a Publisher even with valid command authority');
   f.store.run('INSERT INTO publishers VALUES (?,?)','org','person');const release=(await send(path,input)).response;assert.equal(release.statusCode,202,release.body);
   await new ReleaseWorker(f.pub,original).once();assert.equal(writes,1);writes=0;
   const request=await send(`/api/service/releases/${release.json().id}/deliveries`,{target:'local',connectionId:'connection',format:'full',action:'create',rightsConfirmed:true,idempotencyKey:'org-copy'});assert.equal(request.response.statusCode,202,request.response.body);
   const delivery=request.response.json();assert.equal(delivery.state,'approval_needed');
   const cipher=f.store.get('SELECT actor_json FROM delivery_payloads WHERE delivery_id=?',delivery.id)!.actor_json;
   const authorized=await send(`/api/service/deliveries/${delivery.id}/authorize`,{approvalRef:'exact-approved'},{source:{key_id:'another-key',credential_id:null,credential_incarnation:digest('another-incarnation')}});assert.equal(authorized.response.statusCode,200,authorized.response.body);
   assert.equal(f.store.get('SELECT actor_json FROM delivery_payloads WHERE delivery_id=?',delivery.id)!.actor_json,cipher,'Authorization cannot replace the original publishing authority');
   revokedProofs.add(decodeJwt(request.proof.token).jti!);
   await new DeliveryWorker(distribution,original).once();assert.equal(writes,0);assert.equal(f.store.get('SELECT state FROM deliveries WHERE id=?',delivery.id)!.state,'blocked');
   const syncPath=`/api/service/articles/${article.id}/sync-links`,sync=await issue(syncPath,'',{contentType:null});
   const response=await app.inject({method:'POST',url:syncPath,headers:{...headers,'x-nyxid-command-authority':sync.token}});assert.equal(response.statusCode,200,response.body);
   const projection=f.store.get('SELECT * FROM projections WHERE id=?',response.json().id)!;assertCommandBinding(f.store,f.vault.open<Actor>(projection.actor_json),projectionCommand(projection));
   const replay=await app.inject({method:'POST',url:syncPath,headers:{...headers,'x-nyxid-command-authority':sync.token}});assert.equal(replay.statusCode,409,replay.body);assert.equal(replay.json().code,'COMMAND_AUTHORITY_REUSED');
  }finally{await app.close();f.store.close();}
 });
 await t.test('ingress binds exact original bytes, query, content type and idempotency header',async()=>{
  sourceActive=true;onlineFailure='';const f=open(':memory:');const app=await createApp({...f,publicUrl:config.publicUrl,auth:f.auth,authenticate:r=>f.auth.authenticate(r)});
  try{
   const actor=await f.auth.propagated(identity,delegation);f.store.createOwner('owner','personal',base,'person');f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site','owner','en','http://localhost:3598','NO_KEY');
   const article=await f.content.create(actor,{ownerId:'owner',language:'en',title:'Bytes',markdown:'Original',creditedAuthor:'person'},'draft'),path=`/api/service/articles/${article.id}/releases?trace=%E4%B8%AD`;
   const body=' { "ownerId": "owner", "revisionId": '+JSON.stringify(article.revision.id)+', "creditedAuthor": "person", "action": "publish", "rightsConfirmed": true, "idempotencyKey": "bytes" }\n';
   const proof=await issue(path,body,{contentType:'application/json; charset=utf-8',idempotencyKey:'exact-key'});
   const h={...headers,'content-type':'application/json; charset=utf-8','idempotency-key':'exact-key','x-nyxid-command-authority':proof.token};
   for(const [url,payload,extra] of [[path,JSON.stringify(JSON.parse(body)),{}],[path+'&different=1',body,{}],[path,body,{'content-type':'application/json'}],[path,body,{'idempotency-key':'changed'}]] as const){
    const r=await app.inject({method:'POST',url,payload,headers:{...h,...extra}});assert.ok(r.statusCode>=400,r.body);assert.equal(f.store.get('SELECT count(*) n FROM releases')!.n,0);
   }
   const missing=await app.inject({method:'POST',url:path,payload:body,headers:{...headers,'content-type':'application/json; charset=utf-8','idempotency-key':'exact-key'}});assert.equal(missing.statusCode,403);
   const valid=await app.inject({method:'POST',url:path,payload:body,headers:h});assert.equal(valid.statusCode,202,valid.body);
   const replay=await app.inject({method:'POST',url:path,payload:body,headers:h});assert.equal(replay.json().id,valid.json().id);assert.equal(f.store.get('SELECT count(*) n FROM releases')!.n,1);
   for(const name of ['x-nyxid-command-authority','content-type','idempotency-key']){
    const duplicate=await app.inject({method:'POST',url:path,payload:body,headers:{...h,[name]:[h[name as keyof typeof h],h[name as keyof typeof h]]}});assert.ok(duplicate.statusCode>=400,duplicate.body);
   }
  }finally{await app.close();f.store.close();}
 });
});
