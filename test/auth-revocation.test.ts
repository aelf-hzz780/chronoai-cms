// Local signed issuer/introspection and isolated outbound adapters; no NyxID/Ghost/provider calls.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {AuthManager} from '../src/auth.ts';
import {NyxAuthority} from '../src/nyxid.ts';
import {Policy} from '../src/policy.ts';
import {Store} from '../src/store.ts';
import {ContentService,digest} from '../src/content.ts';
import {PublishingService,ReleaseWorker,type OriginalAdapter} from '../src/publishing.ts';
import {DistributionService,DeliveryWorker} from '../src/distribution.ts';
import {TargetRegistry,type Target} from '../src/targets.ts';
import {Vault} from '../src/vault.ts';
import {loadConfig,type Config} from '../src/config.ts';

const cmsMap={'content:read':['profile'],'content:write':['proxy'],publish:['proxy']};
const lineage={consents:[],source_session_id:'original-session',delegation_jti:null};
const serviceMap={'content:read':['account:read'],'content:write':['account:read','proxy:*'],publish:['account:read','proxy:*']};
test('R030/R031: persisted callers and workers enforce current bindings and signed source lineage',async t=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256'),jwk={...await exportJWK(publicKey),kid:'local-r030'};
 const revokedTokens=new Set<string>();
 let base='';
 const server=createServer(async(req,res)=>{
  res.setHeader('content-type','application/json');
  if(req.url==='/.well-known/openid-configuration')return res.end(JSON.stringify({issuer:base,authorization_endpoint:base+'/authorize',token_endpoint:base+'/token',jwks_uri:base+'/jwks',code_challenge_methods_supported:['S256']}));
  if(req.url==='/jwks')return res.end(JSON.stringify({keys:[jwk]}));
  if(req.url==='/introspect'){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const token=new URLSearchParams(Buffer.concat(chunks).toString()).get('token')!;
   const p=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
   return res.end(JSON.stringify({active:!revokedTokens.has(token),sub:p.sub,iss:p.iss,scope:p.scope,exp:p.exp}));
  }
  res.statusCode=404;res.end('{}');
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const directory=await mkdtemp(join(tmpdir(),'blog-r030-'));t.after(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});});
 const env={PUBLIC_URL:'http://localhost:3199',ALLOW_LOOPBACK_HTTP:'true',NYXID_ISSUER:base,NYXID_API_URL:base,NYXID_CLIENT_ID:'cms',NYXID_CMS_AUDIENCE:'shared',NYXID_SERVICE_AUDIENCE:'service',NYXID_TOKEN_AUDIENCE:'delegation',NYXID_SERVICE_ID:'registered',NYXID_SERVICE_SLUG:'blog',NYXID_INTROSPECTION_URL:base+'/introspect',ENCRYPTION_KEY:'ab'.repeat(32),TRACKING_SECRET:'local-only',NYXID_CMS_CAPABILITY_SCOPES_JSON:JSON.stringify(cmsMap),NYXID_SERVICE_CAPABILITY_SCOPES_JSON:JSON.stringify(serviceMap),NYXID_SERVICE_CLIENT_IDS:'direct'};
 const vault=new Vault(env.ENCRYPTION_KEY);
 const sign=(claims:any,audience:string,seconds=600)=>new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:'local-r030'}).setIssuer(base).setSubject('person').setAudience(audience).setIssuedAt().setExpirationTime(`${seconds}s`).setJti(crypto.randomUUID()).sign(privateKey);
 const scenarios: {name:string;entry:'cms'|'direct'|'propagated';allowed?:boolean;raw?:boolean;legacyLineage?:unknown;recovery?:boolean;revokeBeforeWrite?:boolean;change?:(c:Config)=>void}[]=[
  {name:'direct baseline',entry:'direct',allowed:true},
  {name:'remove publish key',entry:'direct',change:c=>{delete c.serviceOperationScopes!.publish;}},
  {name:'remove whole service map',entry:'direct',change:c=>{delete c.serviceOperationScopes;}},
  {name:'remove direct client',entry:'direct',change:c=>{c.serviceClientIds=[];}},
  {name:'raw baseline',entry:'direct',raw:true,allowed:true},
  {name:'raw remove client',entry:'direct',raw:true,change:c=>{c.serviceClientIds=[];}},
  {name:'direct audience change',entry:'direct',change:c=>{c.serviceAudience='other';}},
  {name:'cms baseline',entry:'cms',allowed:true},
  {name:'cms client change',entry:'cms',change:c=>{c.clientId='other';}},
  {name:'cms audience change',entry:'cms',change:c=>{c.cmsAudience='other';}},
  {name:'cms legacy client change',entry:'cms',change:c=>{delete c.cmsOperationScopes;delete c.serviceOperationScopes;c.operationScopes=cmsMap;c.clientId='other';}},
  {name:'cms compatible legacy',entry:'cms',allowed:true,change:c=>{delete c.cmsOperationScopes;delete c.serviceOperationScopes;c.operationScopes=cmsMap;}},
  {name:'cms raw fallback',entry:'cms',change:c=>{delete c.cmsOperationScopes;}},
  {name:'propagated delayed baseline',entry:'propagated',allowed:true},
  {name:'propagated remove map',entry:'propagated',change:c=>{delete c.serviceOperationScopes;}},
  {name:'propagated service change',entry:'propagated',change:c=>{c.serviceId='other';}},
  {name:'propagated slug change',entry:'propagated',change:c=>{c.serviceSlug='other';}},
  {name:'propagated identity audience change',entry:'propagated',change:c=>{c.serviceAudience='other';}},
  {name:'propagated delegation audience change',entry:'propagated',change:c=>{c.nyxAudience='other';}},
  {name:'legacy key without lineage',entry:'propagated',legacyLineage:null},
  {name:'empty lineage',entry:'propagated',legacyLineage:{consents:[]}},
  {name:'malformed consent lineage',entry:'propagated',legacyLineage:{consents:[{client_id:'x'}]}},
  {name:'blank session lineage',entry:'propagated',legacyLineage:{consents:[],source_session_id:''}},
  {name:'legacy key recovery actor cannot replace source',entry:'propagated',legacyLineage:null,recovery:true},
  {name:'valid lineage recovery',entry:'propagated',allowed:true,recovery:true},
  {name:'lineage revoked at final write',entry:'propagated',revokeBeforeWrite:true},
  {name:'issuer change',entry:'direct',change:c=>{c.issuer='other';}},
 ];
 for(const scenario of scenarios)for(const kind of ['release','delivery'])await t.test(`${scenario.name}: ${kind}`,async()=>{
  let config=loadConfig({...env,DATABASE_PATH:join(directory,`${scenarios.indexOf(scenario)}-${kind}.sqlite`)});if(scenario.raw)delete config.serviceOperationScopes;
  function open(c:Config){const store=new Store(c.database),authority=new NyxAuthority(c,store),policy=new Policy(store,authority),content=new ContentService(store,policy),auth=new AuthManager(c,store,vault,policy),pub=new PublishingService(content,vault);return {store,policy,content,auth,pub};}
  let f=open(config);let writes=0,atBoundary=false;
  const revoke=()=>{if(atBoundary&&scenario.revokeBeforeWrite)revokedTokens.add(credential);};
  const original:OriginalAdapter={async publish(input){revoke();await input.beforeWrite!();writes++;return {remoteId:'local',url:'http://localhost:3198/local/'};},async verify(){return true;},async reconcile(){return null;},async unpublish(){throw Error('unexpected');}};
  const result={state:'published' as const,remoteId:'copy',url:'https://local.invalid/copy',sourceVerified:true};
  const target:Target={name:'local',automatic:true,automaticActions:['create'],async write(_p,_c,send){revoke();await send({method:'POST',url:'https://local.invalid/copy'});return result;},async reconcile(){return result;}};
  const connections={async connection(){return {id:'local',accountId:'person',active:true};},async approval(){return {};},async execute(_actor:any,input:any){input.beforeDispatch();writes++;return {accountId:'person',status:201,body:{}};}};
  const distribution=()=>new DistributionService(f.pub,connections,new TargetRegistry([target]));
  const scope=scenario.entry==='cms'?'openid profile proxy':scenario.raw?'content:read content:write publish':'account:read proxy:*';
  const credential=await sign({scope,token_type:'access',...(scenario.entry==='propagated'?{delegated:true,act:{sub:'blog'},oauth_lineage:lineage}:{client_id:scenario.entry==='cms'?'cms':'direct'})},scenario.entry==='cms'?'shared':scenario.entry==='propagated'?'delegation':'service');
  const identity=scenario.entry==='propagated'?await sign({nyx_service_id:'registered'},'service',2):undefined;
  const actor=identity?await f.auth.propagated(identity,credential):await f.auth.accessToken(credential,scenario.entry==='cms'?'shared':'service',scenario.entry==='cms'?'cms':'service');
  f.store.createOwner('owner','personal',base,'person');f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site','owner','en','http://localhost:3198','NO_KEY');
  const article=await f.content.create(actor,{ownerId:'owner',language:'en',title:scenario.name,markdown:'Local fixture only',creditedAuthor:'person'},'r030-'+scenario.name);
  const release=await f.pub.confirm(actor,article.id,{revisionId:article.revision.id,ownerId:'owner',creditedAuthor:'person',action:'publish',rightsConfirmed:true,idempotencyKey:'release'},'r030-'+scenario.name);
  let id=release.id;
  if(kind==='delivery'){await new ReleaseWorker(f.pub,original).once();assert.equal(writes,1);const delivery=await distribution().request(actor,release.id,{target:'local',connectionId:'local',format:'full',action:'create',rightsConfirmed:true,idempotencyKey:'delivery'},'r030-'+scenario.name);id=delivery.id;}
  if('legacyLineage' in scenario){
   const legacy=await sign({scope,token_type:'access',delegated:true,act:{sub:'blog'},oauth_lineage:scenario.legacyLineage},'delegation');
   const legacyActor={...actor,credential:legacy,oauth_lineage:lineage,sourceKeyId:'untrusted-self-report'};
   await f.policy.scope(legacyActor,'content:read');
   await assert.rejects(f.pub.confirm(legacyActor,article.id,{...release,idempotencyKey:'forged'},'r031'),{code:'SOURCE_AUTHORITY_UNPROVEN'});
   const forged=await f.content.create(legacyActor,{ownerId:'owner',language:'en',title:'Draft remains available',markdown:'No command authority from read proof',creditedAuthor:'person'},'r031');
   assert.ok(forged.id);
   if(kind==='release')f.store.run('UPDATE releases SET actor_json=? WHERE id=?',vault.seal(legacyActor),id);
   else f.store.run('UPDATE delivery_payloads SET actor_json=? WHERE delivery_id=?',vault.seal(legacyActor),id);
  }
  if(scenario.recovery){
   f.store.run(`UPDATE ${kind==='release'?'releases':'deliveries'} SET state='uncertain' WHERE id=?`,id);
   if('legacyLineage' in scenario)await assert.rejects(kind==='release'?f.pub.reconcile(actor,id,'r031'):distribution().reconcile(actor,id,'r031'),{code:'SOURCE_AUTHORITY_UNPROVEN'});
   f.store.run('INSERT INTO recovery_actors VALUES (?,?,?,?)',kind,id,vault.seal(actor),'r031');
  }
  if(scenario.entry==='cms')f.store.run('INSERT INTO sessions VALUES (?,?,?,?)',digest('session'),vault.seal(actor),'csrf',new Date(Date.now()+600000).toISOString());
  f.store.close();config={...config};scenario.change?.(config);f=open(config);writes=0;atBoundary=true;
  try{
   if(identity&&scenario.allowed){await new Promise(resolve=>setTimeout(resolve,2100));await assert.rejects(f.auth.propagated(identity,credential));}
   if(scenario.entry==='cms'){
    const session=f.auth.authenticate({url:'/api/cms/me',method:'GET',cookies:{chrono_session:'session'},headers:{}} as any).then(a=>f.policy.publish(a!,'owner'));
    if(scenario.allowed)await session;else await assert.rejects(session);
   }
   if(kind==='release')await new ReleaseWorker(f.pub,original).once();else await new DeliveryWorker(distribution(),original).once();
   assert.equal(writes,scenario.allowed&&!scenario.recovery?1:0,'outbound writes after current authorization check');
   assert.equal(f.store.get(`SELECT state FROM ${kind==='release'?'releases':'deliveries'} WHERE id=?`,id)!.state,scenario.recovery?(kind==='release'?'uncertain':(scenario.allowed?'published':'uncertain')):scenario.allowed?'published':'blocked');
   if('legacyLineage' in scenario)assert.equal(f.store.get(`SELECT error_code FROM ${kind==='release'?'releases':'deliveries'} WHERE id=?`,id)!.error_code,'SOURCE_AUTHORITY_UNPROVEN');
  }finally{f.store.close();}
 });
});
