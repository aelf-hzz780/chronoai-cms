import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fixture} from './helpers.ts';
import {NyxAuthority,operationDigest} from '../src/nyxid.ts';
import {connectionFingerprint} from '../src/connection-proof.ts';
import {PublishingService,ReleaseWorker} from '../src/publishing.ts';
import {DistributionService,DeliveryWorker} from '../src/distribution.ts';
import {DevAdapter,TargetRegistry} from '../src/targets.ts';
import {Vault} from '../src/vault.ts';
import {createApp} from '../src/app.ts';
import {digest} from '../src/content.ts';
import type {Config} from '../src/config.ts';

async function setup(t:any,mode:string|undefined='exact',kind='personal') {
  const f=fixture(),directory=await mkdtemp(join(tmpdir(),'chrono-personal-exact-'));
  const ownerId=kind==='personal'?'solo':'org',actor=kind==='personal'?f.actors.solo:f.actors.admin;
  const owner={kind,issuer:actor.issuer,subject:ownerId};
  const binding:any={id:'selected-connection',target:'dev',owner,slug:'selected-provider',remoteBaseUrl:'https://dev.to/api',accountId:'author',canPublish:true,...(mode===undefined?{}:{executionApproval:mode})};
  const file=join(directory,'connections.json');await writeFile(file,JSON.stringify([binding]));
  const authority=new NyxAuthority({authorityUrl:'https://nyx.example',connectionsFile:file} as Config,f.store),calls:any[]=[];
  const state={actor,approval:'pending',fence:{} as any,statusPatch:{} as any,receipt:undefined as any,generic:true,post:undefined as any,operationGeneration:undefined as number|null|undefined,resultGeneration:1,redeemState:'redeemed'};
  authority.call=async(caller,path,method='GET',body?:any)=>{
    calls.push({subject:caller.subject,credential:caller.credential,path,method,body});
    if(path==='/api/v1/user-services')return {services:[{id:binding.id,slug:binding.slug,is_active:true,state_version:1,credential_source:kind==='personal'?{type:'personal'}:{type:'org',org_id:ownerId,allowed:true}}]};
    if(path==='/api/v1/mcp/config'||path==='/api/v1/delegation/operation-catalog'){
      const endpoint={endpoint_id:state.generic?'nyx_generic_proxy_v1':'article.create',method:'POST',path:state.generic?'':'/articles',parameters:null,request_content_type:'application/json',request_body_schema:state.generic?null:{type:'object'},request_body_required:false,response:null,...(state.operationGeneration===undefined?{}:{operation_generation:state.operationGeneration})};
      return {catalog_digest:'sha256:catalog',exact_view_digest:'sha256:view',services:[{service_id:binding.id,user_service_id:binding.id,is_user_service:true,is_generic_proxy:state.generic,endpoints:[endpoint],operations:[endpoint]}]};
    }
    if(path==='/api/v1/approvals/exact-service/requests'){
      state.fence={...body,request_id:'exact-request',state:'pending',operation_generation:state.resultGeneration,expires_at:new Date(Date.now()+60000).toISOString()};return state.fence;
    }
    if(path.endsWith('/status'))return {...state.fence,state:state.approval,...(state.receipt?{receipt:state.receipt}:{}),...state.statusPatch};
    if(path.endsWith('/redeem')){
      assert.equal(body.idempotency_key,state.fence.idempotency_key);assert.equal(body.operation_generation,state.resultGeneration);
      if(state.redeemState!=='redeemed')return {...state.fence,state:state.redeemState};
      const article=state.fence.arguments.body?.article??state.fence.arguments.article;
      state.post={id:'provider-post',url:'https://dev.to/author/post',user:{user_id:'author'},...article,published_at:new Date().toISOString()};
      const response_body=JSON.stringify(state.post);state.receipt={http_status:201,response_body,response_digest:`sha256:${digest(response_body)}`};state.approval='redeemed';
      return {...state.fence,state:'redeemed',receipt:state.receipt};
    }
    if(path.startsWith('/api/v1/proxy/')){
      if(method==='GET')return state.post;
      state.post={id:'provider-post',url:'https://dev.to/author/post',user:{user_id:'author'},...body.article,published_at:new Date().toISOString()};return state.post;
    }
    throw new Error(`Unexpected fixture route: ${path}`);
  };
  f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site',ownerId,'en','http://localhost:3999','TEST_ONLY');
  const article=await f.content.create(actor,{ownerId,language:'en',title:'Frozen title',markdown:'Frozen content',creditedAuthor:actor.subject},'source-trace');
  const originals=new PublishingService(f.content,new Vault('ab'.repeat(32)));
  const release=await originals.confirm(actor,article.id,{ownerId,revisionId:article.revision.id,creditedAuthor:actor.subject,action:'publish',rightsConfirmed:true,idempotencyKey:'original'},'source-trace');
  const original={async publish(){return {remoteId:'original',url:'http://localhost:3999/original/'};},async verify(){return true;},async reconcile(){return null;},async unpublish(){}};
  await new ReleaseWorker(originals,original).once();
  const service=new DistributionService(originals,authority,new TargetRegistry([new DevAdapter('https://dev.to/api')])),worker=new DeliveryWorker(service,original);
  const app=await createApp({...f,vault:originals.vault,publicUrl:'https://cms.example',distribution:service,authenticate:async()=>state.actor});
  t.after(async()=>{await app.close();f.store.close();await rm(directory,{recursive:true,force:true});});
  const input={target:'dev',connectionId:binding.id,format:'full',action:'create',rightsConfirmed:true,idempotencyKey:'delivery'};
  const confirm=()=>service.request(actor,release.id,input,'confirmation-trace');
  return {...f,ownerId,owner,actor,authority,calls,state,service,worker,app,input,confirm,release,originals,binding,
    async mode(value?:string){if(value===undefined)delete binding.executionApproval;else binding.executionApproval=value;await writeFile(file,JSON.stringify([binding]));}};
}

test('personal exact opt-in freezes the request and exposes request/attach/authorize before a single native redemption',async t=>{
  const f=await setup(t),delivery=await f.confirm();
  assert.equal(delivery.state,'approval_needed');assert.equal(await f.worker.once(),false);
  const saved=f.store.get('SELECT * FROM delivery_payloads WHERE delivery_id=?',delivery.id)!;
  assert.equal(JSON.parse(saved.payload_json).executionApproval,'exact');
  const detail=await f.app.inject({url:`/api/service/owners/solo/tasks/delivery/${delivery.id}`});
  assert.deepEqual(detail.json().allowedActions,['cancel','request-approval','authorize']);
  const requested=await f.app.inject({method:'POST',url:`/api/service/deliveries/${delivery.id}/request-approval`});
  assert.equal(requested.statusCode,200,requested.body);assert.equal(requested.json().reference,'exact-request');
  assert.equal(f.store.get('SELECT approval_ref FROM deliveries WHERE id=?',delivery.id)!.approval_ref,'exact-request');
  const fence=f.state.fence;
  assert.equal(fence.endpoint_id,'nyx_generic_proxy_v1');assert.equal(fence.operation_id,fence.endpoint_id);assert.equal(fence.exact_view_digest,undefined);
  assert.equal(fence.idempotency_key,delivery.id);assert.equal(fence.arguments.method,'POST');assert.equal(fence.arguments.path,'/articles');
  assert.equal(fence.arguments.body.article.title,'Frozen title');assert.match(fence.arguments.body.article.body_markdown,/Frozen content/);
  assert.equal(fence.operation_digest,operationDigest(f.binding.id,fence.endpoint_id,fence.endpoint_contract_digest,fence.arguments));
  const authorize=()=>f.app.inject({method:'POST',url:`/api/service/deliveries/${delivery.id}/authorize`,payload:{approvalRef:'exact-request'}});
  assert.equal((await authorize()).statusCode,409);
  for(const state of ['denied','expired','revoked']){f.state.approval=state;assert.equal((await authorize()).statusCode,409);}
  f.state.approval='approved';f.state.statusPatch={expires_at:new Date(Date.now()-1000).toISOString()};assert.equal((await authorize()).statusCode,409);
  f.state.approval='approved';f.state.statusPatch={idempotency_key:'another-delivery'};
  assert.equal((await authorize()).statusCode,409);assert.equal(f.store.get("SELECT count(*) AS n FROM jobs WHERE kind='delivery'")!.n,0);
  f.state.statusPatch={};await assert.rejects(f.authority.approval(f.actor,f.owner,'exact-request','changed',f.binding.id,'create'),{code:'APPROVAL_NEEDED'});
  assert.equal((await authorize()).statusCode,200);
  assert.equal(f.store.get('SELECT actor_json FROM delivery_payloads WHERE delivery_id=?',delivery.id)!.actor_json,saved.actor_json);
  assert.equal(await f.worker.once(),true);
  assert.equal(f.store.get('SELECT state FROM deliveries WHERE id=?',delivery.id)!.state,'published');
  assert.equal(f.calls.filter(call=>call.path.endsWith('/redeem')).length,1);
  assert.equal(f.calls.filter(call=>call.path.startsWith('/api/v1/proxy/')&&call.method!=='GET').length,0);
});

test('personal exact generic requests preserve raw queries and reject wrong owners, delegated callers and generic organization operations',async t=>{
  const f=await setup(t),request={method:'POST',url:'https://dev.to/api/articles?tag=a&tag=b%2Fc',body:{article:{title:'Exact'}}};
  await f.authority.prepareApproval(f.actor,f.owner,f.binding.id,'dev',request,'query-delivery','content','create');
  assert.deepEqual(f.state.fence.arguments,{method:'POST',path:'/articles?tag=a&tag=b%2Fc',body:request.body});
  await assert.rejects(f.authority.prepareApproval(f.actors.outsider,f.owner,f.binding.id,'dev',request,'other','content','create'),{code:'CONNECTION_MISMATCH'});
  await assert.rejects(f.authority.approval(f.actors.outsider,f.owner,'exact-request','content',f.binding.id,'create'),{code:'CONNECTION_MISMATCH'});
  const delegated={...f.actor,credential:`header.${Buffer.from(JSON.stringify({delegated:true})).toString('base64url')}.signature`};
  await assert.rejects(f.authority.prepareApproval(delegated,f.owner,f.binding.id,'dev',request,'delegated','content','create'),{code:'EXACT_OPERATION_REQUIRED'});
  const org=await setup(t,'exact','organization');
  await assert.rejects(org.authority.prepareApproval(org.actor,org.owner,org.binding.id,'dev',request,'organization','content','create'),{code:'EXACT_OPERATION_REQUIRED'});
  assert.equal(f.calls.filter(call=>call.path==='/api/v1/approvals/exact-service/requests').length,1);
});

test('personal legacy keeps proxy execution, cannot request exact approval and rejects client-controlled mode',async t=>{
  const f=await setup(t);await f.mode();
  await assert.rejects(f.service.request(f.actor,f.release.id,{...f.input,executionApproval:'exact'},'client-mode'),{code:'INVALID_INPUT'});
  const delivery=await f.confirm();assert.equal(delivery.state,'queued');
  assert.equal(JSON.parse(f.store.get('SELECT payload_json FROM delivery_payloads WHERE delivery_id=?',delivery.id)!.payload_json).executionApproval,undefined);
  await assert.rejects(f.service.requestApproval(f.actor,delivery.id,'legacy'),{code:'DELIVERY_STATE'});
  f.store.run("UPDATE deliveries SET state='approval_needed' WHERE id=?",delivery.id);
  const legacyTask=await f.app.inject({url:`/api/service/owners/solo/tasks/delivery/${delivery.id}`});
  assert.deepEqual(legacyTask.json().allowedActions,['cancel']);
  await assert.rejects(f.service.requestApproval(f.actor,delivery.id,'legacy'),{code:'DELIVERY_STATE'});
  f.store.run("UPDATE deliveries SET state='queued' WHERE id=?",delivery.id);
  const request={method:'POST',url:'https://dev.to/api/articles',body:{article:{title:'Legacy'}}};
  await assert.rejects(f.authority.prepareApproval(f.actor,f.owner,f.binding.id,'dev',request,delivery.id,delivery.digest,'create'),{code:'APPROVAL_CONFIGURATION'});
  assert.equal(await f.worker.once(),true);assert.equal(f.calls.filter(call=>call.path.startsWith('/api/v1/proxy/')&&call.method==='POST').length,1);
  assert.equal(f.calls.filter(call=>call.path.endsWith('/redeem')).length,0);
});

test('approval mode is fingerprinted, unknown modes fail closed and old queued work never switches routes',async t=>{
  const f=await setup(t);await f.mode();const delivery=await f.confirm(),legacy=await f.authority.connection(f.actor,f.owner,f.binding.id,'dev');
  await f.mode('exact');const exact=await f.authority.connection(f.actor,f.owner,f.binding.id,'dev');
  assert.notEqual(connectionFingerprint({...legacy,generation:undefined}),connectionFingerprint({...exact,generation:undefined}));
  await f.worker.once();assert.equal(f.store.get('SELECT state,error_code FROM deliveries WHERE id=?',delivery.id)!.error_code,'CONNECTION_CHANGED');
  assert.equal(f.calls.filter(call=>call.method!=='GET').length,0);
  await f.mode('unexpected');await assert.rejects(f.authority.bindings(),{code:'CONNECTION_CONFIGURATION'});
});

test('personal exact cannot queue after mode drift or send without approval, and expired saved actors are not replaced',async t=>{
  const f=await setup(t),delivery=await f.confirm();await f.service.requestApproval(f.actor,delivery.id,'request');f.state.approval='approved';
  await f.mode();await assert.rejects(f.service.authorize(f.actor,delivery.id,'exact-request','drift'),{code:'CONNECTION_CHANGED'});
  await f.mode('exact');const saved=f.store.get('SELECT actor_json FROM delivery_payloads WHERE delivery_id=?',delivery.id)!.actor_json;
  const fresh={...f.actor,credential:'fresh-token'};await f.service.authorize(fresh,delivery.id,'exact-request','authorize');
  f.policy.authority.validate=async actor=>{if(actor.credential!=='fresh-token')throw new Error('Token expired');};
  await f.worker.once();assert.equal(f.store.get('SELECT error_code FROM deliveries WHERE id=?',delivery.id)!.error_code,'IDENTITY_UNAVAILABLE');
  assert.equal(f.store.get('SELECT actor_json FROM delivery_payloads WHERE delivery_id=?',delivery.id)!.actor_json,saved);
  assert.equal(f.calls.filter(call=>call.path.endsWith('/redeem')).length,0);
});

test('personal exact worker refuses missing or revoked approval even when a job is queued',async t=>{
  for(const approved of [false,true]){
    const f=await setup(t),delivery=await f.confirm();
    if(approved){await f.service.requestApproval(f.actor,delivery.id,'request');f.state.approval='approved';await f.service.authorize(f.actor,delivery.id,'exact-request','authorize');f.state.approval='revoked';}
    else{f.store.run("UPDATE deliveries SET state='queued' WHERE id=?",delivery.id);f.store.run('INSERT INTO jobs VALUES (?,?,?,?,?,?)','forced-job','delivery',delivery.id,'queued',null,new Date().toISOString());}
    await f.worker.once();assert.equal(f.store.get('SELECT error_code FROM deliveries WHERE id=?',delivery.id)!.error_code,'APPROVAL_NEEDED');
    assert.equal(f.calls.filter(call=>call.path.endsWith('/redeem')||call.path.startsWith('/api/v1/proxy/')&&call.method!=='GET').length,0);
  }
});

test('exact creation rejects a changed declared operation generation and preserves a declared zero generation',async t=>{
  const f=await setup(t);f.state.generic=false;f.state.operationGeneration=7;f.state.resultGeneration=8;
  const request={method:'POST',url:'https://dev.to/api/articles',body:{article:{title:'Confirmed'}}};
  await assert.rejects(f.authority.prepareApproval(f.actor,f.owner,f.binding.id,'dev',request,'delivery','content','create'),{code:'NYXID_CONTRACT'});
  assert.equal(f.store.get('SELECT count(*) AS n FROM nyx_approvals')!.n,0);
  f.state.operationGeneration=0;f.state.resultGeneration=0;
  assert.equal((await f.authority.prepareApproval(f.actor,f.owner,f.binding.id,'dev',request,'delivery','content','create')).reference,'exact-request');
  assert.equal(f.state.fence.operation_generation,0);
});

test('delegated declared catalogs may omit their generation with null and retain the authoritative create generation',async t=>{
  const f=await setup(t);f.state.generic=false;f.state.operationGeneration=null;f.state.resultGeneration=0;
  const delegated={...f.actor,credential:`header.${Buffer.from(JSON.stringify({delegated:true})).toString('base64url')}.signature`};
  const request={method:'POST',url:'https://dev.to/api/articles',body:{article:{title:'Confirmed'}}};
  assert.equal((await f.authority.prepareApproval(delegated,f.owner,f.binding.id,'dev',request,'delivery','content','create')).reference,'exact-request');
  const sent=f.calls.find(call=>call.path==='/api/v1/approvals/exact-service/requests').body;
  assert.equal(Object.hasOwn(sent,'operation_generation'),false);assert.equal(sent.exact_view_digest,'sha256:view');
  assert.equal(JSON.parse(f.store.get('SELECT fence_json FROM nyx_approvals WHERE reference=?','exact-request')!.fence_json).operation_generation,0);
});

test('personal exact failed or in-progress redemption stays uncertain without a fallback write',async t=>{
  for(const state of ['failed','redeeming']){
    const f=await setup(t),delivery=await f.confirm();await f.service.requestApproval(f.actor,delivery.id,'request');f.state.approval='approved';
    await f.service.authorize(f.actor,delivery.id,'exact-request','authorize');f.state.redeemState=state;await f.worker.once();
    assert.equal(f.store.get('SELECT state FROM deliveries WHERE id=?',delivery.id)!.state,'uncertain');
    assert.equal(f.calls.filter(call=>call.path.endsWith('/redeem')).length,1);
    assert.equal(f.calls.filter(call=>call.path.startsWith('/api/v1/proxy/')&&call.method!=='GET').length,0);
    assert.equal(await f.worker.once(),false);
  }
});
