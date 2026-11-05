import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers.ts';
import {Vault} from '../src/vault.ts';
import {PublishingService, ReleaseWorker} from '../src/publishing.ts';
import {DistributionService, DeliveryWorker} from '../src/distribution.ts';
import {DevAdapter, TargetRegistry} from '../src/targets.ts';
import {ExternalPublicationService} from '../src/external-publication.ts';
import {AppError} from '../src/errors.ts';

async function setup(owner='solo') {
  const f=fixture(),actor=owner==='org'?f.actors.admin:f.actors.solo;
  f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site',owner,'en','https://blog.example','KEY');
  const article=await f.content.create(actor,{ownerId:owner,language:'en',title:'External exact copy',markdown:'Frozen body',creditedAuthor:actor.subject},'t');
  const originals=new PublishingService(f.content,new Vault('ab'.repeat(32)));
  const release=await originals.confirm(actor,article.id,{ownerId:owner,revisionId:article.revision.id,creditedAuthor:actor.subject,action:'publish',rightsConfirmed:true,idempotencyKey:'original'},'t');
  let live=true,originalReads=0;
  const original={async publish(){return {remoteId:'ghost1',url:'https://blog.example/original/'};},async verify(){originalReads++;return live;},async reconcile(){return null;},async unpublish(){}};
  await new ReleaseWorker(originals,original).once();
  let account='4223973',hook:undefined|(()=>Promise<void>),status=200;
  const posts=new Map<string,any>(),calls:any[]=[];
  const connection=()=>({id:'dev-connection',target:'dev',accountId:account,active:true,canPublish:true,canUpdate:true,executionApproval:'native'});
  const connections={async connection(){return connection();},async approval(){return {};},async execute(_actor:any,input:any){calls.push(input);if(hook){const run=hook;hook=undefined;await run();}const url=new URL(input.request.url),parts=url.pathname.split('/'),id=parts.at(-1)!;return {accountId:account,status,body:id==='all'||id==='published'?[...posts.values()]:posts.get(id)};}};
  const distribution=new DistributionService(originals,connections,new TargetRegistry([new DevAdapter('https://dev.to/api')]));
  const service=new ExternalPublicationService(distribution,original,{syncIntervalMs:1000});
  const input={target:'dev',connectionId:'dev-connection',action:'create',format:'full',rightsConfirmed:true,idempotencyKey:'prepare'};
  const prepare=()=>service.prepare(actor,release.id,input,'prepare-trace');
  const place=(intent:any,id='100')=>{const body=intent.request.body.article;posts.set(id,{...body,id:Number(id),url:`https://dev.to/author/article-${id}`,user:{user_id:Number(account)},published_at:new Date().toISOString(),public_reactions_count:3,comments_count:2,page_views_count:10});return id;};
  return {...f,actor,article,release,original,distribution,service,input,prepare,place,posts,calls,originalReads:()=>originalReads,setLive(v:boolean){live=v;},setAccount(v:string){account=v;},setStatus(v:number){status=v;},onRead(fn:()=>Promise<void>){hook=fn;}};
}
const registration=(remoteId='100',idempotencyKey='register')=>({remoteId,idempotencyKey});

test('external prepare freezes verified source and exact DEV request without a worker job',async t=>{
 const f=await setup();t.after(()=>f.store.close());const before=f.originalReads(),intent=await f.prepare();
 assert.equal(intent.executionMode,'external');assert.equal(intent.state,'awaiting_external');assert.equal(intent.revisionId,f.article.revision.id);assert.equal(intent.request.method,'POST');assert.equal(intent.request.body.article.published,true);assert.match(intent.request.body.article.body_markdown,/Author: solo/);assert.match(intent.request.body.article.body_markdown,/chrono-delivery:/);assert.ok(f.originalReads()>before);
 assert.equal(f.store.get("SELECT count(*) n FROM jobs WHERE kind='delivery'")!.n,0);assert.equal((await f.prepare()).id,intent.id);
 await assert.rejects(f.service.prepare(f.actor,f.release.id,{...f.input,format:'excerpt',excerpt:'different'},'t'),{code:'CONFLICT'});
 f.setLive(false);await assert.rejects(f.service.prepare(f.actor,f.release.id,{...f.input,idempotencyKey:'new'},'t'),{code:'ORIGINAL_NOT_LIVE'});
});
test('external registration independently verifies and records the platform URL; retries converge',async t=>{
 const f=await setup();t.after(()=>f.store.close());const intent=await f.prepare();f.place(intent);const result=await f.service.register(f.actor,intent.id,registration(),'register-trace');
 assert.equal(result.state,'published');assert.equal(result.url,'https://dev.to/author/article-100');assert.equal(result.remoteId,'100');assert.equal(result.syncStatus,'verified');assert.ok(result.lastVerifiedAt);
 assert.equal((await f.service.register(f.actor,intent.id,registration(),'retry')).id,intent.id);
 await assert.rejects(f.service.register(f.actor,intent.id,registration('101'),'t'),{code:'CONFLICT'});
 assert.ok(f.calls.every(c=>c.request.method==='GET'&&c.readOnly));assert.equal(f.store.get('SELECT count(*) n FROM deliveries')!.n,1);
});
for(const [name,mutate] of Object.entries({account:(p:any):unknown=>p.user.user_id=1,title:(p:any):unknown=>p.title='wrong',body:(p:any):unknown=>p.body_markdown='wrong',canonical:(p:any):unknown=>p.canonical_url='https://wrong.example',draft:(p:any)=>{p.published=false;p.published_at=null;},organization:(p:any):unknown=>p.organization={id:123},remoteId:(p:any):unknown=>p.id=101}))test(`external registration rejects ${name} mismatch`,async t=>{
 const f=await setup();t.after(()=>f.store.close());const intent=await f.prepare();f.place(intent);mutate(f.posts.get('100'));await assert.rejects(f.service.register(f.actor,intent.id,registration(),'t'),{code:'REMOTE_RESULT_UNPROVEN'});assert.equal((await f.service.get(f.actor,intent.id)).url,null);
});
for(const url of ['http://dev.to/a/b','https://evil.example/a','https://dev.to.evil.example/a','https://name@dev.to/a','https://dev.to:8443/a','https://dev.to/a#fragment','https://dev.to/a?redirect=1'])test(`external registration rejects untrusted URL ${url}`,async t=>{
 const f=await setup();t.after(()=>f.store.close());const intent=await f.prepare();f.place(intent);f.posts.get('100').url=url;await assert.rejects(f.service.register(f.actor,intent.id,registration(),'t'),{code:'REMOTE_URL_UNTRUSTED'});
});
test('external owner access and organization mode fail closed',async t=>{
 const f=await setup();t.after(()=>f.store.close());const intent=await f.prepare();await assert.rejects(f.service.register(f.actors.outsider,intent.id,registration(),'t'),{code:'FORBIDDEN'});
 const org=await setup('org');t.after(()=>org.store.close());await assert.rejects(org.prepare(),{code:'EXTERNAL_ORGANIZATION_UNSUPPORTED'});assert.equal(org.store.get('SELECT count(*) n FROM deliveries')!.n,0);
});
test('external register rechecks connection, owner and cancellation after remote await',async t=>{
 for(const event of ['connection','owner','cancel']){const f=await setup();t.after(()=>f.store.close());const intent=await f.prepare();f.place(intent);f.onRead(async()=>{if(event==='connection')f.setAccount('other');if(event==='owner')f.revoked.add('solo');if(event==='cancel')await f.service.cancel(f.actor,intent.id,'cancel');});await assert.rejects(f.service.register(f.actor,intent.id,registration(),'t'));assert.equal(f.store.get('SELECT url FROM deliveries WHERE id=?',intent.id)!.url,null);}
});
test('external concurrent prepare and register retries are idempotent',async t=>{
 const f=await setup();t.after(()=>f.store.close());const [a,b]=await Promise.all([f.prepare(),f.prepare()]);assert.equal(a.id,b.id);f.place(a);const [x,y]=await Promise.all([f.service.register(f.actor,a.id,registration(),'a'),f.service.register(f.actor,a.id,registration(),'b')]);assert.equal(x.url,y.url);assert.equal(f.store.get('SELECT count(*) n FROM deliveries')!.n,1);
});
test('external missing receipt reconciles every candidate; zero or multiple matches never resend',async t=>{
 const f=await setup();t.after(()=>f.store.close());const intent=await f.prepare();const zero=await f.service.reconcile(f.actor,intent.id,'zero');assert.equal(zero.state,'uncertain');assert.equal(zero.syncErrorCode,'REMOTE_RESULT_UNPROVEN');f.place(intent,'100');f.place(intent,'101');await assert.rejects(f.service.reconcile(f.actor,intent.id,'many'),{code:'MULTIPLE_REMOTE_MATCHES'});assert.equal((await f.service.get(f.actor,intent.id)).state,'uncertain');f.posts.delete('101');const one=await f.service.reconcile(f.actor,intent.id,'one');assert.equal(one.state,'published');assert.equal(one.remoteId,'100');assert.ok(f.calls.every(c=>c.request.method==='GET'));
});
test('external sync preserves last valid evidence for drift, 429, expired authorization, and is read only',async t=>{
 const f=await setup();t.after(()=>f.store.close());const intent=await f.prepare();f.place(intent);await f.service.register(f.actor,intent.id,registration(),'t');const verified=(await f.service.get(f.actor,intent.id)).lastVerifiedAt;
 f.posts.get('100').title='changed remotely';let result=await f.service.sync(f.actor,intent.id,'changed');assert.equal(result.syncStatus,'changed');assert.equal(result.lastVerifiedAt,verified);assert.equal(result.state,'published');
 f.setStatus(429);result=await f.service.sync(f.actor,intent.id,'429');assert.equal(result.syncErrorCode,'REMOTE_RATE_LIMIT');assert.equal(result.url,'https://dev.to/author/article-100');f.setStatus(401);result=await f.service.sync(f.actor,intent.id,'401');assert.equal(result.syncStatus,'reauthorization_required');assert.ok(f.calls.every(c=>c.request.method==='GET'));
});
test('external scheduled reads do not keep expired delegation alive or fall back accounts',async t=>{
 const f=await setup();t.after(()=>f.store.close());const intent=await f.prepare();f.place(intent);await f.service.register(f.actor,intent.id,registration(),'t');f.revoked.add('solo');f.store.run("UPDATE external_publications SET next_sync_at='2000-01-01T00:00:00.000Z'");const count=f.calls.length;await f.service.syncDue();assert.equal(f.calls.length,count);assert.equal(f.store.get('SELECT sync_status FROM external_publications')!.sync_status,'reauthorization_required');
});
test('external cancelled intent never becomes a new worker job or permits a replacement create',async t=>{
 const f=await setup();t.after(()=>f.store.close());const intent=await f.prepare();f.place(intent);const cancelled=await f.service.cancel(f.actor,intent.id,'t');assert.equal(cancelled.state,'cancelled');assert.equal(cancelled.remoteCancellationGuaranteed,false);await assert.rejects(f.service.register(f.actor,intent.id,registration(),'t'),{code:'EXTERNAL_INTENT_STATE'});await assert.rejects(f.service.prepare(f.actor,f.release.id,{...f.input,idempotencyKey:'replacement'},'t'),{code:'DUPLICATE_TARGET'});
 await assert.rejects(f.distribution.reconcile(f.actor,intent.id,'t'),{code:'EXTERNAL_EXECUTION_ONLY'});assert.equal(await new DeliveryWorker(f.distribution,f.original).once(),false);
});
test('external old blocked or uncertain tasks cannot be registered through the new mode',async t=>{
 const f=await setup();t.after(()=>f.store.close());const old=await f.distribution.request(f.actor,f.release.id,f.input,'old');for(const state of ['blocked','uncertain']){f.store.run('UPDATE deliveries SET state=? WHERE id=?',state,old.id);await assert.rejects(f.service.register(f.actor,old.id,registration(),'t'),{code:'EXTERNAL_INTENT_REQUIRED'});}assert.equal(f.store.get('SELECT count(*) n FROM external_publications')!.n,0);
});
test('external correction and removal follow-up do not mutate the remote publication',async t=>{
 const f=await setup();t.after(()=>f.store.close());const intent=await f.prepare();f.place(intent);await f.service.register(f.actor,intent.id,registration(),'t');const count=f.calls.length;const result=await f.service.followUp(f.actor,intent.id,{action:'removal',note:'Remove with original account'},'t');assert.equal(result.followUpState,'removal_requested');assert.equal(result.state,'published');assert.equal(f.calls.length,count);
});

test('external removal is confirmed only by selected-account 404/410 and current authorization',async t=>{
 for(const status of [404,410]){const f=await setup();t.after(()=>f.store.close());const intent=await f.prepare();f.place(intent);await f.service.register(f.actor,intent.id,registration(),'t');await f.service.followUp(f.actor,intent.id,{action:'removal'},'t');f.setStatus(status);const result=await f.service.followUp(f.actor,intent.id,{action:'verify-removal'},'t');assert.equal(result.state,'removed');assert.equal(result.followUpState,'removed');assert.equal(result.url,'https://dev.to/author/article-100');assert.ok(result.lastVerifiedAt);assert.ok(f.calls.every(c=>c.request.method==='GET'));}
 for(const scenario of ['unauthorized','changed-account','revoked-after-read']){const f=await setup();t.after(()=>f.store.close());const intent=await f.prepare();f.place(intent);await f.service.register(f.actor,intent.id,registration(),'t');await f.service.followUp(f.actor,intent.id,{action:'removal'},'t');f.setStatus(scenario==='unauthorized'?401:404);if(scenario==='changed-account')f.setAccount('new-account');if(scenario==='revoked-after-read')f.onRead(async()=>{f.revoked.add('solo');});await assert.rejects(f.service.followUp(f.actor,intent.id,{action:'verify-removal'},'t'));assert.equal(f.store.get('SELECT state FROM deliveries WHERE id=?',intent.id)!.state,'published');}
});
test('external cancellation records a late copy only as an observation, never resurrects the lifecycle',async t=>{
 const f=await setup();t.after(()=>f.store.close());const intent=await f.prepare();await f.service.cancel(f.actor,intent.id,'t');f.place(intent);const result=await f.service.reconcile(f.actor,intent.id,'late');assert.equal(result.state,'cancelled');assert.equal(result.remoteId,'100');assert.equal(result.syncStatus,'verified');const synced=await f.service.sync(f.actor,intent.id,'t');assert.equal(synced.state,'cancelled');
});
test('external old API and accidental worker jobs cannot take over or re-publish external copies',async t=>{
 const f=await setup();t.after(()=>f.store.close());const intent=await f.prepare();await assert.rejects(f.distribution.cancel(f.actor,intent.id,'t'),{code:'EXTERNAL_EXECUTION_ONLY'});await assert.rejects(f.distribution.report(f.actor,intent.id,'published','https://dev.to/author/article-100','t'));f.place(intent);await f.service.register(f.actor,intent.id,registration(),'t');await assert.rejects(f.distribution.request(f.actor,f.release.id,{...f.input,action:'update',copyId:intent.id,idempotencyKey:'old-update'},'t'),{code:'EXTERNAL_EXECUTION_ONLY'});
 const before=f.calls.length;f.store.run("INSERT INTO jobs VALUES ('accidental','delivery',?,'queued',NULL,'2000-01-01T00:00:00Z')",intent.id);assert.equal(await new DeliveryWorker(f.distribution,f.original).once(),true);assert.equal(f.calls.length,before);assert.equal((await f.service.get(f.actor,intent.id)).state,'published');
});
test('external correction freezes a new payload and sync never revives its superseded predecessor',async t=>{
 const f=await setup();t.after(()=>f.store.close());const first=await f.prepare();f.place(first);await f.service.register(f.actor,first.id,registration(),'t');const next=await f.service.prepare(f.actor,f.release.id,{...f.input,action:'update',copyId:first.id,idempotencyKey:'correction'},'t');assert.equal(next.request.method,'PUT');assert.ok(next.request.url.endsWith('/100'));f.place(next);await f.service.register(f.actor,next.id,registration('100','corrected'),'t');assert.equal((await f.service.get(f.actor,first.id)).state,'superseded');await f.service.sync(f.actor,first.id,'old-sync');assert.equal((await f.service.get(f.actor,first.id)).state,'superseded');assert.equal((await f.service.get(f.actor,next.id)).state,'published');
});
test('external concurrent synchronization preserves current generation and valid evidence',async t=>{
 const f=await setup();t.after(()=>f.store.close());const intent=await f.prepare();f.place(intent);await f.service.register(f.actor,intent.id,registration(),'t');const [a,b]=await Promise.all([f.service.sync(f.actor,intent.id,'a'),f.service.sync(f.actor,intent.id,'b')]);assert.equal(a.state,'published');assert.equal(b.state,'published');assert.equal((await f.service.get(f.actor,intent.id)).syncStatus,'verified');assert.equal(f.store.all('SELECT * FROM external_publication_observations WHERE delivery_id=?',intent.id).length,2);
});

test('external publication rejects stale draft and future publication timestamps',async t=>{
 for(const mutate of [(p:any)=>{p.published=false;},(p:any)=>{p.published_at='2999-01-01T00:00:00Z';},(p:any)=>{p.published_at='invalid';}]){const f=await setup();t.after(()=>f.store.close());const intent=await f.prepare();f.place(intent);mutate(f.posts.get('100'));await assert.rejects(f.service.register(f.actor,intent.id,registration(),'t'),{code:'REMOTE_RESULT_UNPROVEN'});}
});
test('external timeout retains uncertain status and lost receipt recovers without writes',async t=>{
 const f=await setup();t.after(()=>f.store.close());const intent=await f.prepare();f.place(intent);f.onRead(async()=>{throw new AppError(502,'REMOTE_UNCERTAIN','Read timed out');});await assert.rejects(f.service.register(f.actor,intent.id,registration(),'timeout'),{code:'REMOTE_UNCERTAIN'});assert.equal((await f.service.get(f.actor,intent.id)).state,'uncertain');assert.equal((await f.service.reconcile(f.actor,intent.id,'recover')).state,'published');assert.ok(f.calls.every(c=>c.request.method==='GET'));
});
test('external idempotency conflicts are retained after rejected receipts and concurrent differing ids',async t=>{
 const f=await setup();t.after(()=>f.store.close());const intent=await f.prepare();f.place(intent);f.posts.get('100').title='wrong';await assert.rejects(f.service.register(f.actor,intent.id,registration(),'bad'));await assert.rejects(f.service.register(f.actor,intent.id,registration('101'),'conflict'),{code:'CONFLICT'});
 const g=await setup();t.after(()=>g.store.close());const other=await g.prepare();g.place(other,'100');g.place(other,'101');const results=await Promise.allSettled([g.service.register(g.actor,other.id,registration('100','same'),'a'),g.service.register(g.actor,other.id,registration('101','same'),'b')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='CONFLICT').length,1);
});
test('external frozen payload cannot be mutated, and failed API calls cannot rewrite evidence after a concurrent change',async t=>{
 const f=await setup();t.after(()=>f.store.close());const intent=await f.prepare();const saved=JSON.parse(f.store.get('SELECT payload_json FROM delivery_payloads WHERE delivery_id=?',intent.id)!.payload_json);saved.markdown='tampered';f.store.run('UPDATE delivery_payloads SET payload_json=? WHERE delivery_id=?',JSON.stringify(saved),intent.id);await assert.rejects(f.service.register(f.actor,intent.id,registration(),'tampered'),{code:'EXTERNAL_SNAPSHOT_CHANGED'});assert.equal(f.calls.length,0);
 const g=await setup();t.after(()=>g.store.close());const second=await g.prepare();g.place(second);await g.service.register(g.actor,second.id,registration(),'t');g.onRead(async()=>{await g.service.followUp(g.actor,second.id,{action:'removal'},'changed');throw new AppError(502,'REMOTE_RATE_LIMIT','Later failed read');});const result=await g.service.sync(g.actor,second.id,'stale');assert.equal(result.followUpState,'removal_requested');assert.equal(result.syncStatus,'verified');
});
test('external old authorization entrypoints and expired accidental jobs remain isolated',async t=>{
 const f=await setup();t.after(()=>f.store.close());const intent=await f.prepare();await assert.rejects(f.distribution.requestApproval(f.actor,intent.id,'t'),{code:'EXTERNAL_EXECUTION_ONLY'});await assert.rejects(f.distribution.authorize(f.actor,intent.id,'ref','t'),{code:'EXTERNAL_EXECUTION_ONLY'});await f.service.cancel(f.actor,intent.id,'t');f.store.run("INSERT INTO jobs VALUES ('expired-external','delivery',?,'running','2000-01-01T00:00:00Z','2000-01-01T00:00:00Z')",intent.id);await new DeliveryWorker(f.distribution,f.original).once();assert.equal((await f.service.get(f.actor,intent.id)).state,'cancelled');assert.equal(f.calls.length,0);
});

test('verified removal settles superseded copies while a pending independent update still blocks new create',async t=>{
 const f=await setup();t.after(()=>f.store.close());const first=await f.prepare();f.place(first);await f.service.register(f.actor,first.id,registration(),'t');const second=await f.service.prepare(f.actor,f.release.id,{...f.input,action:'update',copyId:first.id,idempotencyKey:'update'},'t');f.place(second);await f.service.register(f.actor,second.id,registration('100','updated'),'t');const pending=await f.service.prepare(f.actor,f.release.id,{...f.input,action:'update',copyId:second.id,idempotencyKey:'pending'},'t');await f.service.followUp(f.actor,second.id,{action:'removal'},'t');f.setStatus(404);await f.service.followUp(f.actor,second.id,{action:'verify-removal'},'t');assert.equal((await f.service.get(f.actor,first.id)).state,'removed');assert.equal((await f.service.get(f.actor,pending.id)).state,'awaiting_external');await assert.rejects(f.service.prepare(f.actor,f.release.id,{...f.input,idempotencyKey:'new-create'},'t'),{code:'DUPLICATE_TARGET'});
});


test('external prepare retries revalidate the live Ghost original and previews do not grant execution',async t=>{
 const f=await setup();t.after(()=>f.store.close());const intent=await f.prepare();assert.equal(intent.executionAllowed,true);assert.equal((await f.service.get(f.actor,intent.id)).executionAllowed,false);f.setLive(false);await assert.rejects(f.prepare(),{code:'ORIGINAL_NOT_LIVE'});assert.equal((await f.service.get(f.actor,intent.id)).state,'awaiting_external');
});


test('external synchronization failures mark existing metrics unavailable without replacing values or evidence time',async t=>{
 for(const failure of [401,429,'content_changed']){const f=await setup();t.after(()=>f.store.close());const intent=await f.prepare();f.place(intent);await f.service.register(f.actor,intent.id,registration(),'t');await f.service.sync(f.actor,intent.id,'metrics-ok');const before=f.store.get('SELECT * FROM external_metrics WHERE delivery_id=?',intent.id)!;assert.equal(before.views,10);assert.equal(before.error_code,null);if(typeof failure==='number')f.setStatus(failure);else f.posts.get('100').title='remotely changed';await f.service.sync(f.actor,intent.id,'metrics-fail');const after=f.store.get('SELECT * FROM external_metrics WHERE delivery_id=?',intent.id)!;assert.equal(after.error_code,failure===401?'REMOTE_AUTHORIZATION':failure===429?'REMOTE_RATE_LIMIT':'REMOTE_RESULT_UNPROVEN');assert.equal(after.views,before.views);assert.equal(after.reactions,before.reactions);assert.equal(after.comments,before.comments);assert.equal(after.updated_at,before.updated_at);}
});


test('manual external sync never returns a frozen payload after caller authority is revoked during a read',async t=>{
 const f=await setup();t.after(()=>f.store.close());const intent=await f.prepare();f.place(intent);await f.service.register(f.actor,intent.id,registration(),'t');await f.service.sync(f.actor,intent.id,'initial');const before=f.store.get('SELECT * FROM external_publications WHERE delivery_id=?',intent.id)!;const metrics=f.store.get('SELECT * FROM external_metrics WHERE delivery_id=?',intent.id)!;f.onRead(async()=>{f.revoked.add('solo');});await assert.rejects(f.service.sync(f.actor,intent.id,'revoked'),{code:'IDENTITY_UNAVAILABLE'});const after=f.store.get('SELECT * FROM external_publications WHERE delivery_id=?',intent.id)!;assert.equal(after.sync_status,'reauthorization_required');assert.equal(after.sync_error_code,'IDENTITY_UNAVAILABLE');assert.equal(after.last_verified_at,before.last_verified_at);assert.equal(f.store.get('SELECT url FROM deliveries WHERE id=?',intent.id)!.url,'https://dev.to/author/article-100');assert.equal(f.store.get('SELECT updated_at FROM external_metrics WHERE delivery_id=?',intent.id)!.updated_at,metrics.updated_at);
});
