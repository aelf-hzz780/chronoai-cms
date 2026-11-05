import {test} from 'node:test';
import assert from 'node:assert/strict';
import {externalSyncConfig,runExternalSync} from '../src/external-sync.ts';
import {AppError} from '../src/errors.ts';
import {fixture} from './helpers.ts';
import type {Actor} from '../src/policy.ts';
import {Vault} from '../src/vault.ts';
import {PublishingService,ReleaseWorker} from '../src/publishing.ts';
import {DistributionService} from '../src/distribution.ts';
import {DevAdapter,TargetRegistry} from '../src/targets.ts';
import {ExternalPublicationService} from '../src/external-publication.ts';

test('external synchronization validates configured bounds without enabling a delivery worker',()=>{
  assert.deepEqual(externalSyncConfig({}),{intervalMs:900_000,pollMs:30_000,batchSize:20});
  for(const env of [{EXTERNAL_SYNC_INTERVAL_MS:'0'},{EXTERNAL_SYNC_POLL_MS:'NaN'},{EXTERNAL_SYNC_BATCH_SIZE:'101'}])assert.throws(()=>externalSyncConfig(env),/External sync/);
});

test('read-only scheduler is sequential, records safe trace errors and stops on cancellation',async()=>{
  const abort=new AbortController(),events:any[]=[];let calls=0,active=0,maxActive=0;
  await runExternalSync({async syncDue(limit){assert.equal(limit,3);active++;maxActive=Math.max(active,maxActive);calls++;await Promise.resolve();active--;if(calls===1)throw new AppError(503,'READ_SOURCE_UNAVAILABLE','private token must not appear');}},abort.signal,{intervalMs:60_000,pollMs:1000,batchSize:3},event=>events.push(event),async()=>{if(calls===2)abort.abort();});
  assert.equal(calls,2);assert.equal(maxActive,1);assert.equal(events.length,1);assert.equal(events[0].code,'READ_SOURCE_UNAVAILABLE');assert.ok(events[0].traceId);assert.doesNotMatch(JSON.stringify(events),/private token/);
});

test('an already stopped scheduler performs zero reads or writes',async()=>{
  await runExternalSync({async syncDue(){assert.fail('must not run');}},AbortSignal.abort(),externalSyncConfig({}));
});

function scheduledCopyFixture(){
  const f=fixture(),originals=new PublishingService(f.content,new Vault('ab'.repeat(32)));
  f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site','solo','en','https://blog.example','KEY');
  const original={async publish(){return {remoteId:'ghost',url:'https://blog.example/original/'};},async verify(){return true;},async reconcile(){return null;},async unpublish(){}};
  const posts=new Map<string,any>(),calls:{credential:string;method:string}[]=[];
  let onRead:undefined|(()=>Promise<void>);
  const connection={id:'dev-connection',target:'dev',accountId:'4223973',active:true,canPublish:true,canUpdate:true,executionApproval:'native'};
  const connections={async connection(){return connection;},async approval(){return {};},async execute(actor:Actor,input:any){
    calls.push({credential:actor.credential,method:input.request.method});
    if(onRead){const run=onRead;onRead=undefined;await run();}
    const id=new URL(input.request.url).pathname.split('/').at(-1)!;
    return {accountId:connection.accountId,status:200,body:id==='all'||id==='published'?[...posts.values()]:posts.get(id)};
  }};
  const service=new ExternalPublicationService(new DistributionService(originals,connections,new TargetRegistry([new DevAdapter('https://dev.to/api')])),original,{syncIntervalMs:60_000});
  async function publishedCopy(actor:Actor,remoteId:string){
    const article=await f.content.create(actor,{ownerId:'solo',language:'en',title:`Source ${remoteId}`,markdown:`Frozen content ${remoteId}`,creditedAuthor:actor.subject},'create');
    const release=await originals.confirm(actor,article.id,{ownerId:'solo',revisionId:article.revision.id,creditedAuthor:actor.subject,action:'publish',rightsConfirmed:true,idempotencyKey:`original-${remoteId}`},'publish');
    await new ReleaseWorker(originals,original).once();
    const intent=await service.prepare(actor,release.id,{target:'dev',connectionId:connection.id,action:'create',format:'full',rightsConfirmed:true,idempotencyKey:`prepare-${remoteId}`},'prepare');
    posts.set(remoteId,{...intent.request.body.article,id:Number(remoteId),url:`https://dev.to/author/article-${remoteId}`,user:{user_id:Number(connection.accountId)},published_at:new Date().toISOString(),public_reactions_count:3,comments_count:2,page_views_count:10});
    await service.register(actor,intent.id,{remoteId,idempotencyKey:`register-${remoteId}`},'register');
    return intent.id;
  }
  return {...f,originals,service,calls,publishedCopy,onRead(run:()=>Promise<void>){onRead=run;}};
}

for(const stillDue of [false,true])test(`008-IR04: scheduled batches ${stillDue?'use fresh credentials for a rescheduled due copy':'skip a queued copy refreshed with a new credential'}`,async t=>{
  const f=scheduledCopyFixture();t.after(()=>f.store.close());
  const firstActor={...f.actors.solo,credential:'first-valid'},oldActor={...f.actors.solo,credential:'old-valid'},freshActor={...f.actors.solo,credential:'fresh-valid'};
  let expired=false;f.policy.authority.validate=async actor=>{if(expired&&actor.credential===oldActor.credential)throw new Error('expired');};
  const first=await f.publishedCopy(firstActor,'100'),second=await f.publishedCopy(oldActor,'101');
  f.store.run("UPDATE external_publications SET next_sync_at='2000-01-01T00:00:00.000Z' WHERE delivery_id=?",first);
  f.store.run("UPDATE external_publications SET next_sync_at='2001-01-01T00:00:00.000Z' WHERE delivery_id=?",second);
  let refreshed:ReturnType<typeof f.store.get>;
  f.onRead(async()=>{
    expired=true;await f.service.sync(freshActor,second,'manual-refresh');
    if(stillDue)f.store.run("UPDATE external_publications SET next_sync_at='2001-01-01T00:00:00.000Z' WHERE delivery_id=?",second);
    refreshed=f.store.get('SELECT * FROM external_publications WHERE delivery_id=?',second);
  });
  const results=await f.service.syncDue();
  const after=f.store.get('SELECT * FROM external_publications WHERE delivery_id=?',second)!;
  assert.equal(after.sync_status,'verified');assert.equal(after.sync_error_code,null);
  if(stillDue){assert.equal(after.generation,refreshed!.generation+1);assert.ok(Date.parse(after.next_sync_at)-Date.now()<120_000);}
  else assert.deepEqual(after,refreshed,'The queued stale batch entry must not replace the fresh observation or defer its next read');
  assert.equal(f.originals.vault.open<Actor>(after.sync_actor_json).credential,freshActor.credential);
  assert.deepEqual(results.map(result=>result.id),stillDue?[first,second]:[first]);
  assert.ok(f.calls.every(call=>call.method==='GET'));
});

test('008-IR04: an expired in-flight credential cannot overwrite a concurrent manual refresh',async t=>{
  const f=scheduledCopyFixture();t.after(()=>f.store.close());
  const oldActor={...f.actors.solo,credential:'old-valid'},freshActor={...f.actors.solo,credential:'fresh-valid'};
  const id=await f.publishedCopy(oldActor,'100');
  f.store.run("UPDATE external_publications SET next_sync_at='2000-01-01T00:00:00.000Z' WHERE delivery_id=?",id);
  let refreshed:ReturnType<typeof f.store.get>,renew=true;
  f.policy.authority.validate=async actor=>{if(renew&&actor.credential===oldActor.credential){renew=false;await f.service.sync(freshActor,id,'manual-refresh');refreshed=f.store.get('SELECT * FROM external_publications WHERE delivery_id=?',id);throw new Error('expired');}};
  await f.service.syncDue();
  assert.deepEqual(f.store.get('SELECT * FROM external_publications WHERE delivery_id=?',id),refreshed,'A failure only describes the credential and generation used by that read');
  assert.equal(refreshed!.sync_status,'verified');assert.equal(refreshed!.sync_error_code,null);
  assert.ok(f.calls.every(call=>call.method==='GET'));
});
