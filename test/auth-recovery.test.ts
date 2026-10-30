// Local signed issuer and isolated adapters. No NyxID/Ghost/provider network.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {generateKeyPair,exportJWK,SignJWT,decodeJwt} from 'jose';
import {Store} from '../src/store.ts';
import {Vault} from '../src/vault.ts';
import {loadConfig} from '../src/config.ts';
import {Policy} from '../src/policy.ts';
import {NyxAuthority} from '../src/nyxid.ts';
import {AuthManager} from '../src/auth.ts';
import {ContentService} from '../src/content.ts';
import {PublishingService,ReleaseWorker,type OriginalAdapter} from '../src/publishing.ts';
import {DistributionService,DeliveryWorker} from '../src/distribution.ts';
import {TargetRegistry,type Target} from '../src/targets.ts';
import {RemoteError} from '../src/http-client.ts';

test('R033: current caller recovers uncertain results after source expiry/revocation without new writes',async t=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256'),jwk={...await exportJWK(publicKey),kid:'r033-local'};
 const revoked=new Set<string>(),roles=new Map<string,string>();let base='';
 const server=createServer(async(req,res)=>{
  res.setHeader('content-type','application/json');
  if(req.url==='/.well-known/openid-configuration')return res.end(JSON.stringify({issuer:base,authorization_endpoint:base+'/authorize',token_endpoint:base+'/token',jwks_uri:base+'/jwks',code_challenge_methods_supported:['S256']}));
  if(req.url==='/jwks')return res.end(JSON.stringify({keys:[jwk]}));
  if(req.url==='/introspect'){
   const chunks=[];for await(const c of req)chunks.push(c);
   const p=decodeJwt(new URLSearchParams(Buffer.concat(chunks).toString()).get('token')!);
   return res.end(JSON.stringify({active:!revoked.has(p.jti!),sub:p.sub,iss:base,scope:p.scope,exp:p.exp}));
  }
  if(req.url==='/api/v1/orgs'){
   const p=decodeJwt(req.headers.authorization!.slice(7)),role=roles.get(p.sub!);
   return res.end(JSON.stringify({orgs:role?[{id:'organization',your_role:role}]:[]}));
  }
  res.statusCode=404;res.end('{}');
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
 const config=loadConfig({PUBLIC_URL:'http://localhost:3497',ALLOW_LOOPBACK_HTTP:'true',NYXID_ISSUER:base,NYXID_API_URL:base,NYXID_CLIENT_ID:'cms',NYXID_CMS_AUDIENCE:'cms',NYXID_SERVICE_AUDIENCE:'service',NYXID_TOKEN_AUDIENCE:'delegation',NYXID_SERVICE_ID:'registered',NYXID_SERVICE_SLUG:'blog',NYXID_INTROSPECTION_URL:base+'/introspect',ENCRYPTION_KEY:'cd'.repeat(32),TRACKING_SECRET:'local-only',NYXID_CMS_CAPABILITY_SCOPES_JSON:JSON.stringify({'content:read':['profile'],publish:['proxy']}),NYXID_SERVICE_CAPABILITY_SCOPES_JSON:JSON.stringify({'content:read':['account:read'],'content:write':['proxy:*'],publish:['proxy:*']})});
 const sign=(claims:any,subject:string,audience:string,lifetime='10m')=>new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:jwk.kid}).setIssuer(base).setSubject(subject).setAudience(audience).setIssuedAt().setExpirationTime(lifetime).setJti(crypto.randomUUID()).sign(privateKey);
 for(const kind of ['release','delivery'])for(const withdrawal of ['expiry','revocation'])await t.test(`${kind}: original ${withdrawal}`,async()=>{
  const store=new Store(':memory:'),vault=new Vault(config.encryptionKey),authority=new NyxAuthority(config,store),policy=new Policy(store,authority),auth=new AuthManager(config,store,vault,policy),content=new ContentService(store,policy),pub=new PublishingService(content,vault);
  try{
   roles.set('publisher','member');roles.set('admin','admin');
   const sourceToken=await sign({token_type:'access',scope:'account:read proxy:*',delegated:true,act:{sub:'blog'},oauth_lineage:{consents:[],source_session_id:'original-session',delegation_jti:null}},'publisher','delegation',withdrawal==='expiry'?'3s':'10m');
   const identity=await sign({nyx_service_id:'registered'},'publisher','service','60s');
   const source=await auth.propagated(identity,sourceToken);
   // A valid current delegated caller without queued-write lineage can still
   // inspect the exact result. It must never inherit permission to resend.
   const currentToken=withdrawal==='expiry'?await sign({token_type:'access',scope:'openid profile proxy',client_id:'cms'},'admin','cms'):await sign({token_type:'access',scope:'account:read proxy:*',delegated:true,act:{sub:'blog'}},'admin','delegation');
   const current=withdrawal==='expiry'?await auth.accessToken(currentToken,'cms','cms'):await auth.propagated(await sign({nyx_service_id:'registered'},'admin','service','60s'),currentToken);
   store.createOwner('org','organization',base,'organization');store.run('INSERT INTO publishers VALUES (?,?)','org','publisher');store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site','org','en','http://localhost:3498','NO_KEY');
   const article=await content.create(source,{ownerId:'org',language:'en',title:'R033 read-only recovery',markdown:'Local only',creditedAuthor:'publisher'},'create');
   const release=await pub.confirm(source,article.id,{ownerId:'org',revisionId:article.revision.id,action:'publish',creditedAuthor:'publisher',rightsConfirmed:true,idempotencyKey:'original'},'original-confirmation');
   let writes=0,reads=0,drift=false,readOnly=false;
   const result={remoteId:'known-original',url:'http://localhost:3498/existing/'};
   const original:OriginalAdapter={async publish(input){await input.beforeWrite!();writes++;if(kind==='release')throw new RemoteError('REMOTE_UNCERTAIN','Accepted; response lost',true);return result;},async unpublish(input){await input.beforeWrite!();writes++;},async verify(){return true;},async reconcile(input){assert.equal(input.ownerId,'org');assert.equal(input.revisionId,article.revision.id);await assert.rejects(input.beforeWrite!(),{code:'RECOVERY_READ_ONLY'});reads++;return result;}};
   const copy={state:'published' as const,remoteId:'known-copy',url:'https://local.invalid/copy',sourceVerified:true};
   const target:Target={name:'local',automatic:true,automaticActions:['create'],async write(_p,_c,send){await send({method:'POST',url:'https://local.invalid/copy'});return copy;},async reconcile(_p,_c,send){await assert.rejects(send({method:'POST',url:'https://local.invalid/copy'}),{code:'RECOVERY_READ_ONLY'});await send({method:'GET',url:'https://local.invalid/copy/known-copy'});return copy;}};
   const connections={async connection(actor:any,owner:any,id:string){assert.equal(owner.subject,'organization');assert.equal(id,'connection');assert.equal(actor.subject,readOnly?'admin':'publisher');return {id,accountId:drift?'wrong-account':'account',active:true};},async approval(){return {};},async execute(actor:any,input:any){input.beforeDispatch();if(input.readOnly){assert.equal(actor.subject,'admin');assert.equal(input.connectionId,'connection');assert.equal(input.request.method,'GET');reads++;return {accountId:'account',status:200,body:copy};}writes++;throw new RemoteError('REMOTE_UNCERTAIN','Accepted; response lost',true);}};
   const distribution=new DistributionService(pub,connections,new TargetRegistry([target]));
   let id=release.id;
   const rw=new ReleaseWorker(pub,original),dw=new DeliveryWorker(distribution,original);
   if(kind==='release')await rw.once();else{
    await rw.once();writes=0;
    const delivery=await distribution.request(source,release.id,{target:'local',connectionId:'connection',format:'full',action:'create',rightsConfirmed:true,idempotencyKey:'copy'},'delivery-confirmation');id=delivery.id;
    await distribution.authorize(source,id,'local-approval','authorize');await dw.once();
   }
   const table=kind==='release'?'releases':'deliveries',cipher=()=>kind==='release'?store.get('SELECT actor_json FROM releases WHERE id=?',id)!.actor_json:store.get('SELECT actor_json FROM delivery_payloads WHERE delivery_id=?',id)!.actor_json;
   const originalCipher=cipher();assert.equal(store.get(`SELECT state FROM ${table} WHERE id=?`,id)!.state,'uncertain');assert.equal(writes,1);
   const reconcile=()=>kind==='release'?pub.reconcile(current,id,'current-recovery'):distribution.reconcile(current,id,'current-recovery');
   const once=()=>kind==='release'?rw.once():dw.once();
   if(withdrawal==='expiry')await new Promise(resolve=>setTimeout(resolve,Math.max(0,decodeJwt(sourceToken).exp!*1000-Date.now()+30)));else revoked.add(decodeJwt(sourceToken).jti!);
   await policy.publish(current,'org','access');
   await assert.rejects(policy.publish(source,'org'));
   if(withdrawal==='revocation')await assert.rejects(policy.publish(current,'org'),{code:'SOURCE_AUTHORITY_UNPROVEN'});
   readOnly=true;store.run("UPDATE settings SET value='true' WHERE key='outbound_paused'");
   // Both the request and already-persisted recovery Actor use current authority.
   await reconcile();revoked.add(decodeJwt(currentToken).jti!);
   await assert.rejects(reconcile(),{code:'IDENTITY_UNAVAILABLE'});await once();assert.equal(reads,0);
   revoked.delete(decodeJwt(currentToken).jti!);
   roles.delete('admin');await assert.rejects(reconcile(),{code:'FORBIDDEN'});roles.set('admin','admin');
   await reconcile();roles.delete('admin');await once();assert.equal(reads,0);roles.set('admin','admin');
   if(kind==='delivery'){
    await reconcile();drift=true;await once();assert.equal(reads,0);assert.equal(store.get('SELECT error_code FROM deliveries WHERE id=?',id)!.error_code,'CONNECTION_CHANGED');drift=false;
   }
   await reconcile();assert.equal(await once(),true);
   assert.equal(reads,1);assert.equal(writes,1,'No new write during recovery, even when the adapter attempts one');
   assert.equal(store.get(`SELECT state FROM ${table} WHERE id=?`,id)!.state,'published');
   assert.equal(cipher(),originalCipher,'Original confirmation cipher remains immutable audit evidence');
   assert.equal(store.get("SELECT trace_id FROM audit WHERE resource_id=? AND action=? ORDER BY rowid DESC LIMIT 1",id,kind==='release'?'original.reconcile.request':'delivery.reconcile.request')!.trace_id,'current-recovery');
   assert.equal(store.get("SELECT value FROM settings WHERE key='outbound_paused'")!.value,'true');
   await assert.rejects(policy.publish(source,'org'),'Recovery must not revive the original source for new writes');
  }finally{store.close();}
 });
});
