// Signed local authority + isolated SQLite/adapters. This is not a live NyxID claim.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {CallerAuthorization} from '../src/caller-authorization.ts';
import {AuthManager} from '../src/auth.ts';
import {fixture} from './helpers.ts';
import {Vault} from '../src/vault.ts';
import {PublishingService,ReleaseWorker,type OriginalAdapter} from '../src/publishing.ts';
import {DistributionService,DeliveryWorker} from '../src/distribution.ts';
import {TargetRegistry} from '../src/targets.ts';
import type {Config} from '../src/config.ts';

test('native caller: signed service origin supports queued commands without patched source proof',async t=>{
 const f=fixture();t.after(()=>f.store.close());const pair=await generateKeyPair('RS256');
 const config={issuer:f.actors.solo.issuer,serviceId:'registered',serviceSlug:'cms-service',serviceAudience:'service',nyxAudience:'nyxid',cmsAudience:'cms',clientId:'cms',serviceOperationScopes:{'content:read':['account:read'],publish:['proxy:*']}} as unknown as Config;
 const callers=new CallerAuthorization(config);callers.discovery={};callers.keys=createLocalJWKSet({keys:[await exportJWK(pair.publicKey)]}) as typeof callers.keys;
 const sign=(claims:any,aud='nyxid')=>new SignJWT({scope:'account:read proxy:*',token_type:'access',delegated:true,delegation_origin:'service',act:{sub:'cms-service'},...claims}).setProtectedHeader({alg:'RS256'}).setIssuer(config.issuer).setSubject('solo').setAudience(aud).setIssuedAt().setExpirationTime('5m').sign(pair.privateKey);
 const binding={kind:'propagated' as const,serviceId:'registered',serviceSlug:'cms-service',identityAudience:'service',delegationAudience:'nyxid'};
 const credential=await sign({});const payload=await callers.access(credential,'nyxid'),actor=callers.actor(payload,credential,binding);
 assert.equal((actor as any).credentialSource,'service-delegation');
 assert.equal((await callers.restore(actor,'queued-write')).current.subject,'solo');
 await assert.rejects(callers.restore({...actor,credential:await sign({},'other')},'queued-write'));
 await assert.rejects(callers.restore({...actor,credential:await sign({act:{sub:'other'}})},'queued-write'));
 await assert.rejects(callers.restore({...actor,credentialSource:'oauth-delegation'} as any,'queued-write'));
 for(const claims of [{delegation_origin:undefined},{delegation_origin:'unknown'},{delegation_origin:'service',client_id:'receiving'},{delegation_origin:'oauth'}]){
  const token=await sign(claims),p=await callers.access(token,'nyxid');assert.throws(()=>callers.actor(p,token,binding));
 }
 const legacy={...actor,commandAuthority:{token:'legacy',request:{}}} as any;
 await assert.rejects(callers.restore(legacy,'queued-write'),{code:'LEGACY_COMMAND_RECONFIRMATION_REQUIRED'});
 const auth=new AuthManager(config,f.store,new Vault('ab'.repeat(32)),f.policy);
 await assert.rejects(auth.authenticate({url:'/api/service/me',headers:{'x-nyxid-command-authority':'old'},cookies:{}} as any),{code:'LEGACY_COMMAND_RECONFIRMATION_REQUIRED'});
});

test('native read paths use request access, while execution retains current business checks and frozen destination',async t=>{
 const f=fixture();t.after(()=>f.store.close());const vault=new Vault('ab'.repeat(32)),pub=new PublishingService(f.content,vault);
 f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site','solo','en','http://localhost:39000','TEST_KEY_REFERENCE');
 let purposes:string[]=[];f.policy.authority.validate=async(_a,purpose)=>{purposes.push(purpose!);};
 const dist=new DistributionService(pub,{async connection(){return {};},async approval(){return {};},async execute(){throw Error('unexpected');},async listConnections(){return [];}},new TargetRegistry([]));
 await dist.availableConnections(f.actors.solo,'solo');assert.deepEqual(purposes,['access','access']);
 const a=await f.content.create(f.actors.solo,{ownerId:'solo',language:'en',title:'Frozen',markdown:'Exact body',creditedAuthor:'solo'},'draft');
 const r=await pub.confirm(f.actors.solo,a.id,{ownerId:'solo',revisionId:a.revision.id,creditedAuthor:'solo',rightsConfirmed:true,action:'publish',idempotencyKey:'first'},'confirm');
 const cipher=f.store.get('SELECT actor_json FROM releases WHERE id=?',r.id)!.actor_json;
 assert.ok(vault.open<any>(cipher).confirmedCommand);
 f.store.run("UPDATE sites SET url='http://localhost:39001' WHERE id='site'");
 let writes=0;const adapter:OriginalAdapter={async publish(i){await i.beforeWrite!();writes++;return {remoteId:'x',url:'http://localhost:39000/x'};},async unpublish(){throw Error('unexpected');},async verify(){return true;},async reconcile(){return null;}};
 await new ReleaseWorker(pub,adapter).once();assert.equal(writes,0);assert.equal(f.store.get('SELECT state FROM releases WHERE id=?',r.id)!.state,'blocked');
 assert.equal(f.store.get('SELECT actor_json FROM releases WHERE id=?',r.id)!.actor_json,cipher);
});

test('native release freezes an existing remote target and rechecks the fence after asynchronous authorization',async t=>{
 for(const mutation of ['remote-target','admin-route-after-auth'])await t.test(mutation,async t=>{
  const f=fixture();t.after(()=>f.store.close());const vault=new Vault('ab'.repeat(32)),pub=new PublishingService(f.content,vault);
  f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site','solo','en','http://localhost:39000','TEST_REF');
  const article=await f.content.create(f.actors.solo,{ownerId:'solo',language:'en',title:'Original',markdown:'Original content',creditedAuthor:'solo'},'draft');
  const input={ownerId:'solo',revisionId:article.revision.id,creditedAuthor:'solo',rightsConfirmed:true,action:'publish',idempotencyKey:'original'};
  const prior=await pub.confirm(f.actors.solo,article.id,input,'prior');
  f.store.run("UPDATE releases SET state='published',remote_id='original',url='http://localhost:39000/original' WHERE id=?",prior.id);
  f.store.run("UPDATE jobs SET state='done' WHERE resource_id=?",prior.id);
  const next=await pub.confirm(f.actors.solo,article.id,{...input,action:'unpublish',idempotencyKey:'remove'},'next');
  if(mutation==='remote-target')f.store.run("UPDATE releases SET remote_id='different' WHERE id=?",next.id);
  let writes=0,inFinalCheck=false;
  f.policy.authority.validate=async()=>{if(inFinalCheck)f.store.run('INSERT OR REPLACE INTO site_admin_routes VALUES (?,?)','site','http://localhost:39001');};
  const adapter:OriginalAdapter={async publish(){throw Error('unexpected');},async unpublish(i){inFinalCheck=true;await i.beforeWrite!();writes++;},async verify(){return true;},async reconcile(){return null;}};
  await new ReleaseWorker(pub,adapter).once();assert.equal(writes,0);assert.equal(f.store.get('SELECT state FROM releases WHERE id=?',next.id)!.state,'blocked');
 });
});

test('native delivery freezes body and remote account target and retains a final local Publisher fence',async t=>{
 for(const mutation of ['payload','remote-target','publisher-final-check','cancel'])await t.test(mutation,async t=>{
  const f=fixture();t.after(()=>f.store.close());const vault=new Vault('ab'.repeat(32)),pub=new PublishingService(f.content,vault),actor=f.actors.publisher;
  f.store.run('INSERT INTO publishers VALUES (?,?)','org',actor.subject);
  f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site','org','en','http://localhost:39000','TEST_REF');
  const article=await f.content.create(actor,{ownerId:'org',language:'en',title:'Organization original',markdown:'Frozen body',creditedAuthor:actor.subject},'draft');
  const release=await pub.confirm(actor,article.id,{ownerId:'org',revisionId:article.revision.id,creditedAuthor:actor.subject,rightsConfirmed:true,action:'publish',idempotencyKey:'original'},'original');
  f.store.run("UPDATE releases SET state='published',remote_id='original',url='http://localhost:39000/original' WHERE id=?",release.id);
  f.store.run("UPDATE jobs SET state='done' WHERE resource_id=?",release.id);
  let writes=0;
  const connections={async connection(){return {id:'connection',accountId:'org-account',active:true};},async approval(){return {};},async execute(_actor:any,input:any){await input.beforeWrite();if(mutation==='publisher-final-check')f.store.run('DELETE FROM publishers WHERE owner_id=? AND subject=?','org',actor.subject);input.beforeDispatch();writes++;return {accountId:'org-account',status:201,body:{}};}};
  const result={state:'published' as const,remoteId:'copy',url:'https://example.invalid/copy',sourceVerified:true};
  const target={name:'local',automatic:true,automaticActions:['create','update'],async write(_p:any,_c:any,send:any){await send({method:'POST',url:'https://example.invalid/articles'});return result;},async reconcile(){return result;}};
  const dist=new DistributionService(pub,connections,new TargetRegistry([target]));
  const input={target:'local',connectionId:'connection',format:'full',action:'create',rightsConfirmed:true,idempotencyKey:'copy'};
  let d=await dist.request(actor,release.id,input,'delivery');
  if(mutation==='remote-target'){
   f.store.run("UPDATE deliveries SET state='published',remote_id='copy',url='https://example.invalid/copy' WHERE id=?",d.id);
   d=await dist.request(actor,release.id,{...input,action:'update',copyId:d.id,idempotencyKey:'update'},'update');
  }
  await dist.authorize(actor,d.id,'approved-fixture','approval');
  const cipher=f.store.get('SELECT actor_json FROM delivery_payloads WHERE delivery_id=?',d.id)!.actor_json;
  if(mutation==='payload'){
   const payload=JSON.parse(f.store.get('SELECT payload_json FROM delivery_payloads WHERE delivery_id=?',d.id)!.payload_json);payload.markdown='Unconfirmed replacement';
   f.store.run('UPDATE delivery_payloads SET payload_json=? WHERE delivery_id=?',JSON.stringify(payload),d.id);
  }
  if(mutation==='remote-target')f.store.run("UPDATE deliveries SET remote_id='other-copy' WHERE id=?",d.id);
  if(mutation==='cancel')await dist.cancel(actor,d.id,'cancel');
  const original:OriginalAdapter={async publish(){throw Error('unexpected');},async unpublish(){throw Error('unexpected');},async verify(){return true;},async reconcile(){return null;}};
  await new DeliveryWorker(dist,original).once();assert.equal(writes,0);
  assert.equal(f.store.get('SELECT state FROM deliveries WHERE id=?',d.id)!.state,mutation==='cancel'?'cancelled':'blocked');
  assert.equal(f.store.get('SELECT actor_json FROM delivery_payloads WHERE delivery_id=?',d.id)!.actor_json,cipher);
 });
});
