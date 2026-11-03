import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers.ts';
import {Vault} from '../src/vault.ts';
import {PublishingService,ReleaseWorker} from '../src/publishing.ts';
import {DistributionService} from '../src/distribution.ts';
import {TargetRegistry,DevAdapter,AssistedAdapter} from '../src/targets.ts';
import {createApp} from '../src/app.ts';
import {AppError} from '../src/errors.ts';
import {commandRequest} from '../src/command-authority.ts';
import {render} from '../src/render.ts';
import {assistedMarkdown} from '../src/assisted-proof.ts';
import {Store} from '../src/store.ts';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

async function followupFixture(t:any,owner='org'){
  const f=fixture(),actor=owner==='org'?f.actors.admin:f.actors.solo,vault=new Vault('ab'.repeat(32));let current=actor,version='one',lost=false;
  f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site',owner,'en','https://blog.example','KEY');
  const article=await f.content.create(actor,{ownerId:owner,language:'en',title:'Frozen original',markdown:'Original confirmed content',creditedAuthor:'Writer'},'draft');
  const originals=new PublishingService(f.content,vault),release=await originals.confirm(actor,article.id,{ownerId:owner,revisionId:article.revision.id,creditedAuthor:'Writer',action:'publish',rightsConfirmed:true,idempotencyKey:'original'},'original');
  await new ReleaseWorker(originals,{async publish(){return {remoteId:'post',url:'https://blog.example/post/'};},async verify(){return true;},async reconcile(){return null;},async unpublish(){}}).once();
  let outbound=0;const service=new DistributionService(originals,{async connection(_actor,requestedOwner,id,target){if(lost)throw new AppError(409,'CONNECTION_DISABLED','Selected connection lost');return {id,owner:requestedOwner,target,slug:target,accountId:'account',generation:version,remoteBaseUrl:`https://${target}.example/api`,active:true};},async approval(){return {};},async execute(){outbound++;throw Error('No outbound provider write expected');}},new TargetRegistry([new DevAdapter('https://dev.to/api'),new AssistedAdapter('medium'),new AssistedAdapter('hackernoon')]),{async verify(){return true;}});
  const app=await createApp({...f,vault,distribution:service,publicUrl:'https://cms.example',authenticate:async()=>current});t.after(async()=>{await app.close();f.store.close();});
  const intent=(target='dev',extra:Record<string,unknown>={})=>({target,connectionId:`${owner}-${target}`,format:'excerpt',excerpt:'Frozen private excerpt',action:'create',rightsConfirmed:true,...extra});
  const plan=(extra:Record<string,unknown>={})=>app.inject({method:'POST',url:`/api/cms/releases/${release.id}/distribution-plans`,payload:{...intent(),notBeforeAt:new Date(Date.now()+60_000).toISOString(),idempotencyKey:'plan',...extra}});
  const confirm=(planId:string,extra:Record<string,unknown>={})=>app.inject({method:'POST',url:`/api/cms/releases/${release.id}/deliveries`,payload:{...intent(),planId,idempotencyKey:'confirm',...extra}});
  return {...f,app,service,originals,actor,article,release,vault,intent,plan,confirm,use(subject:string){current=f.actors[subject];},setActor(actor:typeof current){current=actor;},drift(){version='two';},lose(){lost=true;},outbound(){return outbound;},due(id:string){f.store.run('UPDATE distribution_plans SET not_before_at=? WHERE id=?',new Date(Date.now()-1).toISOString(),id);}};
}

test('C07: plan freezes real content, persists scheduled/due tasks, and creates no outbound jobs or approvals',async t=>{
  const f=await followupFixture(t),before=f.store.get('SELECT count(*) n FROM jobs')!.n,response=await f.plan();assert.equal(response.statusCode,201,response.body);const plan=response.json();assert.equal(plan.state,'scheduled');assert.equal(plan.deliveryId,null);
  assert.equal(f.store.get('SELECT count(*) n FROM jobs')!.n,before);assert.equal(f.store.get('SELECT count(*) n FROM deliveries')!.n,0);assert.equal(f.outbound(),0);
  const detail=(await f.app.inject({url:`/api/cms/owners/org/tasks/plan/${plan.id}`})).json();assert.equal(detail.snapshot.markdown,'Frozen private excerpt');assert.equal(detail.confirmationDigest,null);assert.equal(detail.plan.releaseId,f.release.id);assert.equal(detail.plan.target,'dev');assert.equal(detail.plan.consumedDeliveryId,null);
  const task=(await f.app.inject({url:'/api/service/owners/org/tasks?kind=plan&state=scheduled'})).json();assert.equal(task.total,1);assert.equal(task.items[0].plan.notBeforeAt,plan.notBeforeAt);
  f.due(plan.id);const due=(await f.app.inject({url:'/api/cms/owners/org/tasks?kind=plan&state=due'})).json();assert.equal(due.total,1);assert.ok(due.items[0].allowedActions.includes('confirm'));
  f.use('member');const member=(await f.app.inject({url:`/api/cms/owners/org/tasks/plan/${plan.id}`})).json();assert.equal(member.snapshot,null);assert.equal(member.plan.connectionId,null);assert.doesNotMatch(JSON.stringify(member),/Frozen private excerpt|account/);
});
test('C07: confirmation is due-only, exact, atomically consumed once, and still requires current exact approval',async t=>{
  const f=await followupFixture(t),plan=(await f.plan()).json(),before=f.store.get('SELECT count(*) n FROM jobs')!.n;
  let response=await f.confirm(plan.id);assert.equal(response.statusCode,409,response.body);assert.equal(response.json().code,'PLAN_NOT_DUE');assert.equal(f.store.get('SELECT count(*) n FROM jobs')!.n,before);
  f.due(plan.id);assert.equal((await f.confirm(plan.id,{excerpt:'Changed excerpt'})).statusCode,409);
  response=await f.confirm(plan.id);assert.equal(response.statusCode,202,response.body);const delivery=response.json();assert.equal(delivery.state,'approval_needed');assert.equal(delivery.approval_ref,null);assert.equal(f.store.get('SELECT delivery_id FROM distribution_plans WHERE id=?',plan.id)!.delivery_id,delivery.id);
  assert.equal((await f.confirm(plan.id)).json().id,delivery.id);assert.equal(f.store.get('SELECT count(*) n FROM deliveries')!.n,1);
  const another=await f.confirm(plan.id,{idempotencyKey:'different-confirm'});assert.equal(another.statusCode,409);assert.equal(f.store.get('SELECT count(*) n FROM deliveries')!.n,1);
  const conflict=await f.app.inject({method:'POST',url:`/api/cms/releases/${f.release.id}/deliveries`,payload:{...f.intent(),idempotencyKey:'confirm'}});assert.equal(conflict.statusCode,409,'The same delivery idempotency key cannot omit its planId');
});
test('C07: stale source, revoked permission, lost/drifted connection and wrong owner never consume or enqueue a plan',async t=>{
  const f=await followupFixture(t),plan=(await f.plan()).json();f.due(plan.id);const before=f.store.get('SELECT count(*) n FROM jobs')!.n;
  f.store.run("UPDATE releases SET state='superseded' WHERE id=?",f.release.id);assert.equal((await f.confirm(plan.id)).statusCode,409);f.store.run("UPDATE releases SET state='published' WHERE id=?",f.release.id);
  f.use('member');assert.equal((await f.confirm(plan.id)).statusCode,403);f.use('admin');f.drift();assert.equal((await f.confirm(plan.id)).statusCode,409);
  f.lose();assert.equal((await f.confirm(plan.id)).statusCode,409);assert.equal(f.store.get('SELECT delivery_id FROM distribution_plans WHERE id=?',plan.id)!.delivery_id,null);assert.equal(f.store.get('SELECT count(*) n FROM jobs')!.n,before);
  assert.equal((await f.confirm(plan.id,{ownerId:'solo'})).statusCode,403);
});
test('C07: cancel is durable and update/remove preserve one exact copy instead of choosing a newer matching destination',async t=>{
  const f=await followupFixture(t),copy=await f.service.request(f.actor,f.release.id,{...f.intent('medium'),idempotencyKey:'manual'},'manual');f.store.run("UPDATE deliveries SET state='published',url='https://medium.com/@writer/copy',remote_id='copy-one' WHERE id=?",copy.id);
  const response=await f.plan({...f.intent('medium',{action:'remove',copyId:copy.id}),idempotencyKey:'remove-plan'});assert.equal(response.statusCode,201,response.body);const plan=response.json();f.due(plan.id);
  const detail=(await f.app.inject({url:`/api/cms/owners/org/tasks/plan/${plan.id}`})).json();assert.equal(detail.plan.copyId,copy.id);
  f.store.run("UPDATE deliveries SET remote_id='replacement-copy' WHERE id=?",copy.id);const confirm=await f.confirm(plan.id,{...f.intent('medium',{action:'remove',copyId:copy.id})});assert.equal(confirm.statusCode,409);assert.equal(f.store.get('SELECT delivery_id FROM distribution_plans WHERE id=?',plan.id)!.delivery_id,null);
  const cancelled=await f.app.inject({method:'POST',url:`/api/service/distribution-plans/${plan.id}/cancel`,payload:{}});assert.equal(cancelled.statusCode,200,cancelled.body);assert.equal(cancelled.json().state,'cancelled');assert.equal((await f.confirm(plan.id,{...f.intent('medium',{action:'remove',copyId:copy.id})})).statusCode,409);
});
test('C07: invalid time and source command paths fail before plan persistence, and same create intent is idempotent',async t=>{
  const f=await followupFixture(t),when=new Date(Date.now()+60_000).toISOString();for(const notBeforeAt of ['invalid','2020-01-01T00:00:00Z'])assert.equal((await f.plan({notBeforeAt})).statusCode,400);
  const first=await f.plan({notBeforeAt:when}),again=await f.plan({notBeforeAt:when});assert.equal(again.json().id,first.json().id);assert.equal(f.store.get('SELECT count(*) n FROM distribution_plans')!.n,1);
  f.setActor({...f.actor,commandAuthority:{token:'unused',request:commandRequest('POST','/api/service/wrong',Buffer.from('{}'),'application/json',null)}});assert.equal((await f.plan({notBeforeAt:when,idempotencyKey:'wrong-command'})).statusCode,403);
});
test('C07: connection drift during the final authority await is detected before atomic plan consumption',async t=>{
  const f=await followupFixture(t),plan=(await f.plan()).json();f.due(plan.id);let read=false;
  const connection=f.service.connections.connection.bind(f.service.connections);f.service.connections.connection=async(...args)=>{const result=await connection(...args);read=true;return result;};f.policy.authority.validate=async()=>{if(read)f.drift();};
  const response=await f.confirm(plan.id);assert.equal(response.statusCode,409,response.body);assert.equal(f.store.get('SELECT delivery_id FROM distribution_plans WHERE id=?',plan.id)!.delivery_id,null);assert.equal(f.store.get('SELECT count(*) n FROM deliveries')!.n,0);
});

test('C08: old-source manual observation verifies frozen content only, fixes the known copy once, and never restores publication or writes a job',async t=>{
  const f=await followupFixture(t),copy=await f.service.request(f.actor,f.release.id,{...f.intent('medium'),idempotencyKey:'copy'},'copy');f.store.run("UPDATE releases SET state='superseded' WHERE id=?",f.release.id);
  const payload=JSON.parse(f.store.get('SELECT payload_json FROM delivery_payloads WHERE delivery_id=?',copy.id)!.payload_json),page=`<article><h1>${payload.title}</h1>${render(assistedMarkdown(payload))}</article>`,before=f.store.get('SELECT count(*) n FROM jobs')!.n;
  t.mock.method(globalThis,'fetch',async(url:any,options:any)=>{assert.equal(String(url),'https://medium.com/@writer/copy');assert.equal(options.method??'GET','GET');assert.equal(options.redirect,'error');return new Response(page);});
  const response=await f.app.inject({method:'POST',url:`/api/cms/deliveries/${copy.id}/verify-observation`,payload:{url:'https://medium.com/@writer/copy'}});assert.equal(response.statusCode,200,response.body);assert.equal(response.json().proof,'content_attribution');assert.equal(response.json().followUpRequired,true);assert.equal(response.json().sourceState,'superseded');
  assert.equal(f.store.get('SELECT state FROM releases WHERE id=?',f.release.id)!.state,'superseded');const known=f.store.get('SELECT * FROM deliveries WHERE id=?',copy.id)!;assert.equal(known.state,'manual_action_needed');assert.equal(known.source_verified,null);assert.equal(known.url,'https://medium.com/@writer/copy');assert.equal(known.remote_id,'https://medium.com/@writer/copy');assert.equal(f.store.get('SELECT count(*) n FROM jobs')!.n,before);assert.equal(f.outbound(),0);
  const details=(await f.app.inject({url:`/api/service/owners/org/tasks/delivery/${copy.id}`})).json();assert.equal(details.observations.length,1);assert.equal(details.observations[0].actor,'admin');
  assert.equal((await f.app.inject({method:'POST',url:`/api/cms/deliveries/${copy.id}/verify-observation`,payload:{url:'https://medium.com/@writer/different'}})).statusCode,409);
});
test('C08: malicious URL, failed content/render proof, copy races and departed authority leave no false success or URL',async t=>{
  const f=await followupFixture(t),copy=await f.service.request(f.actor,f.release.id,{...f.intent('medium'),idempotencyKey:'copy'},'copy');f.store.run("UPDATE releases SET state='unpublished' WHERE id=?",f.release.id);
  let reads=0;t.mock.method(globalThis,'fetch',async()=>{reads++;return new Response('<article><h1>Changed</h1>Wrong text</article>');});
  for(const url of ['http://medium.com/post','https://medium.com:444/post','https://medium.com.evil.example/post','https://user:pw@medium.com/post','https://medium.com/post#fragment','https://127.0.0.1/post'])assert.equal((await f.app.inject({method:'POST',url:`/api/cms/deliveries/${copy.id}/verify-observation`,payload:{url}})).statusCode,400,url);
  assert.equal(reads,0);const failed=await f.app.inject({method:'POST',url:`/api/cms/deliveries/${copy.id}/verify-observation`,payload:{url:'https://medium.com/@writer/post'}});assert.equal(failed.statusCode,409);assert.equal(f.store.get('SELECT count(*) n FROM delivery_observations')!.n,0);assert.equal(f.store.get('SELECT url FROM deliveries WHERE id=?',copy.id)!.url,null);
  const payload=JSON.parse(f.store.get('SELECT payload_json FROM delivery_payloads WHERE delivery_id=?',copy.id)!.payload_json),page=`<article><h1>${payload.title}</h1>${render(assistedMarkdown(payload))}</article>`;t.mock.method(globalThis,'fetch',async()=>new Response(page));f.service.renderer={async verify(){f.store.run("UPDATE deliveries SET state='cancelled' WHERE id=?",copy.id);return true;}};
  assert.equal((await f.app.inject({method:'POST',url:`/api/cms/deliveries/${copy.id}/verify-observation`,payload:{url:'https://medium.com/@writer/post'}})).statusCode,409);assert.equal(f.store.get('SELECT count(*) n FROM delivery_observations')!.n,0);
  f.use('member');assert.equal((await f.app.inject({method:'POST',url:`/api/cms/deliveries/${copy.id}/verify-observation`,payload:{url:'https://medium.com/@writer/post'}})).statusCode,403);
});
test('C09: report note persists current actor/time/trace, is not proof, and stays private from ordinary source readers',async t=>{
  const f=await followupFixture(t),copy=await f.service.request(f.actor,f.release.id,{...f.intent('medium'),idempotencyKey:'copy'},'copy');
  const response=await f.app.inject({method:'POST',url:`/api/cms/deliveries/${copy.id}/report`,payload:{state:'submitted',note:'Private editorial follow-up'}});assert.equal(response.statusCode,200,response.body);
  const detail=(await f.app.inject({url:`/api/cms/owners/org/tasks/delivery/${copy.id}`})).json();assert.equal(detail.notes.length,1);assert.equal(detail.notes[0].note,'Private editorial follow-up');assert.equal(detail.notes[0].actor,'admin');assert.ok(detail.notes[0].traceId&&detail.notes[0].createdAt);assert.equal(f.store.get('SELECT source_verified FROM deliveries WHERE id=?',copy.id)!.source_verified,null);
  assert.equal((await f.app.inject({method:'POST',url:`/api/cms/deliveries/${copy.id}/report`,payload:{state:'reviewing',note:'x'.repeat(2001)}})).statusCode,400);assert.equal(f.store.get('SELECT count(*) n FROM delivery_notes')!.n,1);
  f.use('member');const hidden=(await f.app.inject({url:`/api/cms/owners/org/tasks/delivery/${copy.id}`})).json();assert.deepEqual(hidden.notes,[]);assert.deepEqual(hidden.observations,[]);assert.doesNotMatch(JSON.stringify(hidden),/Private editorial follow-up/);
});
test('C09: a separate historical note leaves published delivery and remote identity unchanged after its original is down',async t=>{
  const f=await followupFixture(t),copy=await f.service.request(f.actor,f.release.id,{...f.intent('medium'),idempotencyKey:'copy'},'copy');f.store.run("UPDATE releases SET state='superseded' WHERE id=?",f.release.id);f.store.run("UPDATE deliveries SET state='published',remote_id='copy',url='https://medium.com/@writer/copy' WHERE id=?",copy.id);
  const before=f.store.get('SELECT state,remote_id,url,updated_at,source_verified FROM deliveries WHERE id=?',copy.id)!;
  const note=await f.app.inject({method:'POST',url:`/api/service/deliveries/${copy.id}/notes`,payload:{note:'Needs correction after source update'}});assert.equal(note.statusCode,201,note.body);assert.equal(note.json().actor,'admin');assert.equal(note.json().note,'Needs correction after source update');assert.deepEqual(f.store.get('SELECT state,remote_id,url,updated_at,source_verified FROM deliveries WHERE id=?',copy.id),before);
  f.use('member');assert.equal((await f.app.inject({method:'POST',url:`/api/cms/deliveries/${copy.id}/notes`,payload:{note:'Not allowed'}})).statusCode,403);assert.equal(f.outbound(),0);
});
test('C07–09: migration v4 preserves old data, plans, append-only notes and observations through reopening',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'cms-followup-migration-')),path=join(directory,'cms.sqlite');t.after(()=>rm(directory,{recursive:true,force:true}));
  let store=new Store(path);store.createOwner('owner','personal','issuer','subject');store.db.exec('DROP TABLE IF EXISTS distribution_plans; DROP TABLE IF EXISTS delivery_notes; DROP TABLE IF EXISTS delivery_observations; DELETE FROM migrations WHERE version=4');store.close();store=new Store(path);assert.ok(store.get('SELECT 1 FROM migrations WHERE version=4'));assert.equal(store.get('SELECT subject FROM owners WHERE id=?','owner')!.subject,'subject');
  store.run('INSERT INTO articles VALUES (?,?,?,?,?,?)','article','owner','en','subject',null,'2026-01-01');store.run('INSERT INTO revisions VALUES (?,?,?,?,?,?,?,?)','revision','article','Title',Buffer.from('Body'),'digest','Author','subject','2026-01-01');
  store.run('INSERT INTO releases VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)','release','article','revision','owner','sealed','publish','superseded','remote','https://blog.example/post',null,'trace','2026-01-01','2026-01-01');
  store.run('INSERT INTO deliveries(id,release_id,owner_id,connection_id,target,action,format,digest,state,trace_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)','delivery','release','owner','connection','medium','create','full','digest','published','trace','2026-01-01','2026-01-01');
  store.run('INSERT INTO distribution_plans VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)','plan','release','revision','owner','medium','connection','remove','full','delivery','intent','{}','2027-01-01','scheduled',null,'subject','trace','2026-01-01','2026-01-01');
  store.run('INSERT INTO delivery_notes VALUES (?,?,?,?,?,?)','note','delivery','Persisted note','subject','trace','2026-01-01');store.run('INSERT INTO delivery_observations VALUES (?,?,?,?,?,?,?,?,?)','observation','delivery','https://medium.com/@author/post','content_attribution','superseded',1,'subject','trace','2026-01-01');
  store.close();store=new Store(path);assert.equal(store.get('SELECT copy_id FROM distribution_plans WHERE id=?','plan')!.copy_id,'delivery');assert.equal(store.get('SELECT note FROM delivery_notes WHERE id=?','note')!.note,'Persisted note');assert.equal(store.get('SELECT source_state FROM delivery_observations WHERE id=?','observation')!.source_state,'superseded');store.close();
});

test('C07–09: OpenAPI exposes planId consumption, plan task metadata, observation proof limits and independent notes',async t=>{
  const f=await followupFixture(t),spec=(await f.app.inject({url:'/openapi.json'})).json(),confirm=spec.paths['/api/service/releases/{id}/deliveries'].post;
  assert.ok(confirm.requestBody.content['application/json'].schema.properties.planId);
  assert.deepEqual(spec.paths['/api/service/releases/{id}/distribution-plans'].post.responses['201'].content['application/json'].schema.properties.state.enum,['scheduled','due','confirmed','cancelled']);
  const detail=spec.paths['/api/service/owners/{id}/tasks/{kind}/{taskId}'].get.responses['200'].content['application/json'].schema;assert.ok(detail.properties.plan);assert.ok(detail.properties.notes);assert.equal(detail.properties.observations.items.properties.proof.const,'content_attribution');
  assert.equal(spec.paths['/api/service/deliveries/{id}/notes'].post.requestBody.content['application/json'].schema.properties.note.maxLength,2000);
});
