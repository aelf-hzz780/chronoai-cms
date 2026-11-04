// Explicit integration suite: real CMS/SQLite/OIDC/HTTP clients and workers,
// isolated local Nyx/Ghost/DEV protocol fixtures; never a live provider account.
import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {request,type APIRequestContext} from 'playwright-core';
import {createLocalExactFlow} from './local-exact-flow-fixture.ts';
import type {Actor} from '../src/policy.ts';

type Flow=Awaited<ReturnType<typeof createLocalExactFlow>>;
type Session={api:APIRequestContext;csrf:string;subject:string};
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const transportAttempts=new WeakMap<Flow,Array<{origin:string;method:string}>>();

function guardNodeTransport(flow:Flow){
  const allowed=new Set(Object.values(flow.fixture.origins).map(value=>new URL(value).origin)),nativeFetch=globalThis.fetch,blocked:Array<{origin:string;method:string}>=[];
  assert.ok([...allowed].every(value=>new URL(value).hostname==='127.0.0.1'));
  transportAttempts.set(flow,blocked);
  globalThis.fetch=async(input,options)=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
    if(!allowed.has(url.origin)){blocked.push({origin:url.origin,method:options?.method??'GET'});throw new Error('LOCAL_HTTP_FIXTURE_ORIGINS_ONLY');}
    return nativeFetch(input,options);
  };
  return ()=>{globalThis.fetch=nativeFetch;};
}

function localUrl(flow:Flow,value:string){
  const url=new URL(value,flow.url);
  assert.ok([flow.url,flow.fixture.baseUrl].some(base=>new URL(base).origin===url.origin),'Test requests must stay on the two isolated loopback servers');
  assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname),'No external HTTP origin is permitted');
  return url.href;
}

async function login(flow:Flow):Promise<Session>{
  const api=await request.newContext();
  try{
    let next=localUrl(flow,'/auth/login?returnTo=%2Fstudio'),complete=false;
    for(let redirects=0;redirects<8;redirects++){
      const response=await api.get(next,{maxRedirects:0});
      if(response.status()===200){assert.equal(new URL(next).origin,new URL(flow.url).origin);assert.equal(new URL(next).pathname,'/studio');complete=true;break;}
      assert.ok([302,303].includes(response.status()),`OIDC redirect returned ${response.status()}`);
      const location=response.headers().location;assert.ok(location);next=localUrl(flow,new URL(location,next).href);
    }
    assert.equal(complete,true,'Official CMS login/callback must complete through the local OIDC provider');
    const response=await api.get(localUrl(flow,'/api/cms/me'),{maxRedirects:0});assert.equal(response.status(),200);
    const me=await response.json();assert.equal(typeof me.csrf,'string');assert.ok(me.workspaces.some((owner:any)=>owner.id===flow.ownerId&&owner.kind==='personal'&&owner.capabilities.canPublish));
    return {api,csrf:me.csrf,subject:me.subject};
  }catch(error){await api.dispose();throw error;}
}

async function post(flow:Flow,session:Session,path:string,body:unknown={},expected=200){
  const response=await session.api.post(localUrl(flow,path),{maxRedirects:0,data:body,headers:{origin:flow.url,'x-csrf-token':session.csrf}});
  const result=await response.json();assert.equal(response.status(),expected,JSON.stringify(result));
  assert.ok(response.headers()['x-trace-id'],'Every CMS command retains a Trace ID');
  return result;
}

async function prepare(flow:Flow,session:Session,label:string){
  const article=await post(flow,session,'/api/cms/articles',{ownerId:flow.ownerId,language:'en',title:`Local exact ${label}`,markdown:`# Local exact ${label}\n\nA local HTTP protocol test with frozen attribution.`,creditedAuthor:flow.creditedAuthor},201);
  const release=await post(flow,session,`/api/cms/articles/${article.id}/releases`,{ownerId:flow.ownerId,revisionId:article.revision.id,creditedAuthor:flow.creditedAuthor,action:'publish',rightsConfirmed:true,idempotencyKey:randomUUID()},202);
  assert.equal(await flow.releaseWorker.once(),true);
  const original=flow.store.get('SELECT state,error_code FROM releases WHERE id=?',release.id)!;
  assert.equal(original.state,'published',JSON.stringify({original,blocked:transportAttempts.get(flow)}));
  const delivery=await post(flow,session,`/api/cms/releases/${release.id}/deliveries`,{target:'dev',connectionId:flow.connectionId,action:'create',format:'full',rightsConfirmed:true,idempotencyKey:randomUUID()},202);
  assert.equal(delivery.state,'approval_needed');
  const approval=await post(flow,session,`/api/cms/deliveries/${delivery.id}/request-approval`);
  assert.equal(approval.state,'pending');assert.equal(typeof approval.reference,'string');
  return {article,release,delivery,reference:approval.reference as string};
}

const providerWrites=(flow:Flow)=>flow.fixture.logs.filter(log=>log.service==='dev'&&log.providerWrite);
const redeems=(flow:Flow)=>flow.fixture.logs.filter(log=>log.service==='nyx'&&log.method==='POST'&&log.path.endsWith('/redeem'));
const deliveryRow=(flow:Flow,id:string)=>flow.store.get('SELECT * FROM deliveries WHERE id=?',id)!;
const jobRows=(flow:Flow,id:string)=>flow.store.all("SELECT state,lease_until FROM jobs WHERE kind='delivery' AND resource_id=?",id);
const actorCipher=(flow:Flow,id:string)=>flow.store.get('SELECT actor_json FROM delivery_payloads WHERE delivery_id=?',id)!.actor_json as string;
const safeHttp=(logs:Flow['fixture']['logs'])=>logs.map(log=>({...log,path:new URL(log.path,'http://local.invalid').pathname}));

function evidence(name:string,flow:Flow,checks:Record<string,unknown>){
  assert.deepEqual(transportAttempts.get(flow),[],'Product remote calls and JWKS reads must make zero external transport attempts');
  return {classification:'LOCAL_HTTP_FIXTURES_NOT_REAL_NYX_OR_DEV',scenario:name,at:new Date().toISOString(),realComponents:['CMS HTTP routes','OIDC signature/PKCE/session/CSRF','SQLite snapshots and queue','NyxAuthority HTTP client','GhostAdapter','DevAdapter','DeliveryWorker'],fixtureComponents:['local OIDC provider','local Nyx approval and redemption protocol','local Ghost HTTP server','local DEV HTTP server'],nodeTransport:{allowedOrigins:Object.values(flow.fixture.origins).map(value=>new URL(value).origin),externalAttempts:0},externalProviderWrites:0,localProviderWrites:providerWrites(flow).length,localRedemptionRequests:redeems(flow).length,checks,http:safeHttp(flow.fixture.logs)};
}

async function scenario(t:TestContext,name:string,run:(context:{flow:Flow;session:Session;freshLogin:()=>Promise<Session>})=>Promise<ReturnType<typeof evidence>>){
  const directory=resolve(process.env.LOCAL_EXACT_EVIDENCE_DIR??'.runtime/local-exact-flow'),runId=randomUUID(),startedAt=new Date().toISOString();
  await mkdir(directory,{recursive:true});
  const base={classification:'LOCAL_HTTP_FIXTURES_NOT_REAL_NYX_OR_DEV',scenario:name,runId,startedAt};
  const save=(value:unknown)=>writeFile(join(directory,`${name}.json`),JSON.stringify(value,null,2)+'\n',{mode:0o600});
  await save({...base,status:'RUNNING'});t.diagnostic(`Local exact scenario ${name}; runId=${runId}`);
  let flow:Flow|undefined,restoreFetch:(()=>void)|undefined,observations:ReturnType<typeof evidence>|undefined;
  const sessions:Session[]=[],failures:Array<{phase:string;error:unknown}>=[];
  const cleanup={apiContextsClosed:false,fixtureClosed:false,fetchRestored:false};
  try{
    flow=await createLocalExactFlow();restoreFetch=guardNodeTransport(flow);
    const activeFlow=flow,freshLogin=async()=>{const session=await login(activeFlow);sessions.push(session);return session;};
    const session=await freshLogin();observations=await run({flow,session,freshLogin});
  }catch(error){failures.push({phase:'execution',error});}
  finally{
    const disposed=await Promise.allSettled(sessions.map(session=>session.api.dispose()));
    cleanup.apiContextsClosed=disposed.every(result=>result.status==='fulfilled');
    for(const result of disposed)if(result.status==='rejected')failures.push({phase:'api-cleanup',error:result.reason});
    try{if(flow)await flow.close();cleanup.fixtureClosed=true;}catch(error){failures.push({phase:'fixture-cleanup',error});}
    try{restoreFetch?.();cleanup.fetchRestored=true;}catch(error){failures.push({phase:'transport-cleanup',error});}
  }
  const safeFailure=({phase,error}:{phase:string;error:unknown})=>({phase,type:error instanceof Error&&['Error','AssertionError','AggregateError','TypeError'].includes(error.name)?error.name:'Error',code:error instanceof assert.AssertionError?'ASSERTION_FAILED':'SCENARIO_OR_CLEANUP_FAILED'});
  await save({...observations,...base,status:failures.length?'FAIL':'PASS',completedAt:new Date().toISOString(),cleanup,failures:failures.map(safeFailure)});
  if(failures.length)throw new AggregateError(failures.map(failure=>failure.error),`Local exact scenario ${name} failed; runId=${runId}`);
}

test('local exact HTTP: pending, wrong-reference and expired authorization never reach provider writes',async t=>scenario(t,'http-approval-boundaries',async({flow,session})=>{
  const pending=await prepare(flow,session,'approval-boundaries');
  const path=`/api/cms/deliveries/${pending.delivery.id}/authorize`;
  assert.equal((await post(flow,session,path,{approvalRef:pending.reference},409)).code,'APPROVAL_NEEDED');
  assert.equal((await post(flow,session,path,{approvalRef:'unrelated-exact-reference'},409)).code,'APPROVAL_NEEDED');
  assert.deepEqual(jobRows(flow,pending.delivery.id),[]);
  await flow.fixture.decide(pending.reference);await flow.fixture.expire(pending.reference);
  assert.equal((await post(flow,session,path,{approvalRef:pending.reference},409)).code,'APPROVAL_NEEDED');
  assert.deepEqual(jobRows(flow,pending.delivery.id),[]);
  const queued=await prepare(flow,session,'expires-after-queue');
  await flow.fixture.decide(queued.reference);await post(flow,session,`/api/cms/deliveries/${queued.delivery.id}/authorize`,{approvalRef:queued.reference});
  assert.equal(deliveryRow(flow,queued.delivery.id).state,'queued');await flow.fixture.expire(queued.reference);
  assert.equal(await flow.deliveryWorker.once(queued.delivery.id),true);
  assert.equal(deliveryRow(flow,queued.delivery.id).state,'approval_needed');assert.equal(deliveryRow(flow,queued.delivery.id).error_code,'APPROVAL_NEEDED');
  assert.equal(providerWrites(flow).length,0);assert.equal(redeems(flow).length,0);
  return evidence('http-approval-boundaries',flow,{pendingRejected:true,wrongReferenceRejected:true,expiredBeforeQueueRejected:true,expiredAfterQueueRejected:true,providerWrites:0,redemptions:0,deliveryIds:[pending.delivery.id,queued.delivery.id]});
}));

test('local exact HTTP: a committed provider write with a lost redemption response recovers read-only using a fresh caller',async t=>scenario(t,'http-lost-response-readonly-recovery',async({flow,session,freshLogin})=>{
  const copy=await prepare(flow,session,'lost-redeem-response');
  await flow.fixture.decide(copy.reference);await post(flow,session,`/api/cms/deliveries/${copy.delivery.id}/authorize`,{approvalRef:copy.reference});
  const frozenActor=actorCipher(flow,copy.delivery.id);flow.fixture.loseNextRedeemResponseAfterWrite=true;
  assert.equal(await flow.deliveryWorker.once(copy.delivery.id),true);
  const uncertain=deliveryRow(flow,copy.delivery.id);assert.equal(uncertain.state,'uncertain');assert.equal(uncertain.error_code,'REMOTE_UNCERTAIN');assert.equal(uncertain.remote_id,null);
  assert.equal(providerWrites(flow).length,1);assert.equal(flow.fixture.posts.size,1);assert.equal(redeems(flow).length,1);
  assert.equal(await flow.deliveryWorker.once(copy.delivery.id),false,'An uncertain outcome cannot be automatically retried');
  const recovery=await freshLogin();assert.equal(recovery.subject,session.subject);
  flow.store.run("UPDATE settings SET value='true' WHERE key='outbound_paused'");
  const before=flow.fixture.logs.length;
  await post(flow,recovery,`/api/cms/deliveries/${copy.delivery.id}/reconcile`);
  assert.equal(await flow.deliveryWorker.once(copy.delivery.id),true);
  const restored=deliveryRow(flow,copy.delivery.id);assert.equal(restored.state,'published');assert.equal(restored.source_verified,1);assert.ok(restored.remote_id&&restored.url);
  assert.equal(providerWrites(flow).length,1);assert.equal(flow.fixture.posts.size,1);assert.equal(redeems(flow).length,1);
  const recoveryRequests=flow.fixture.logs.slice(before).filter(log=>log.service==='dev');
  assert.ok(recoveryRequests.some(log=>log.method==='GET'&&log.path.includes('/articles/me/all')),'Lost receipts must be located through the selected provider account');
  assert.ok(recoveryRequests.some(log=>log.method==='GET'&&log.path.includes(`/articles/${restored.remote_id}`)));
  assert.ok(recoveryRequests.every(log=>log.method==='GET'&&!log.providerWrite));
  assert.ok(actorCipher(flow,copy.delivery.id)===frozenActor,'Fresh recovery must not overwrite the immutable confirmation actor');
  const recoveryActor=flow.store.get("SELECT actor_json FROM recovery_actors WHERE kind='delivery' AND resource_id=?",copy.delivery.id)!;assert.ok(recoveryActor);
  assert.ok(recoveryActor.actor_json!==frozenActor,'Recovery must retain a separate encrypted actor');
  assert.ok(flow.originals.vault.open<Actor>(recoveryActor.actor_json).credential!==flow.originals.vault.open<Actor>(frozenActor).credential,'The recovery actor must come from the fresh OIDC session');
  assert.equal(flow.store.get("SELECT value FROM settings WHERE key='outbound_paused'")!.value,'true');
  assert.equal(await flow.deliveryWorker.once(copy.delivery.id),false);
  return evidence('http-lost-response-readonly-recovery',flow,{deliveryId:copy.delivery.id,requestRef:copy.reference,lostResponseState:uncertain.state,recoveredState:restored.state,remoteId:restored.remote_id,sourceVerified:true,localProviderWrites:1,redemptions:1,recoveryProviderRequests:safeHttp(recoveryRequests),confirmationActorCiphertextSha256:hash(frozenActor),confirmationActorUnchanged:true,recoveryActorAndCredentialDiffer:true,freshOidcRecovery:true,outboundPaused:true});
}));

test('local exact HTTP: the chosen worker leaves another approved task untouched and repetition cannot publish again',async t=>scenario(t,'http-selected-worker-no-repeat',async({flow,session})=>{
  const older=await prepare(flow,session,'older-queued'),chosen=await prepare(flow,session,'chosen-queued');
  for(const copy of [older,chosen]){await flow.fixture.decide(copy.reference);await post(flow,session,`/api/cms/deliveries/${copy.delivery.id}/authorize`,{approvalRef:copy.reference});}
  const olderJobs=jobRows(flow,older.delivery.id),olderActor=actorCipher(flow,older.delivery.id);
  assert.equal(await flow.deliveryWorker.once(chosen.delivery.id),true);assert.equal(deliveryRow(flow,chosen.delivery.id).state,'published');
  assert.equal(deliveryRow(flow,older.delivery.id).state,'queued');assert.deepEqual(jobRows(flow,older.delivery.id),olderJobs);assert.ok(actorCipher(flow,older.delivery.id)===olderActor,'The unrelated confirmation actor must stay unchanged');
  assert.equal(await flow.deliveryWorker.once(chosen.delivery.id),false);
  assert.equal((await post(flow,session,`/api/cms/deliveries/${chosen.delivery.id}/authorize`,{approvalRef:chosen.reference},409)).code,'DELIVERY_STATE');
  assert.equal(providerWrites(flow).length,1);assert.equal(redeems(flow).length,1);assert.equal(flow.fixture.posts.size,1);
  assert.equal(deliveryRow(flow,older.delivery.id).remote_id,null);
  return evidence('http-selected-worker-no-repeat',flow,{chosenDeliveryId:chosen.delivery.id,untouchedDeliveryId:older.delivery.id,chosenState:'published',untouchedState:'queued',olderJobUnchanged:true,olderActorUnchanged:true,repeatedWorkerProcessed:false,repeatedAuthorizationRejected:true,localProviderWrites:1,redemptions:1});
}));
