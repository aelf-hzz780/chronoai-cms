// Synthetic authority and adapter; no NyxID, Ghost or provider network.
import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fixture} from './helpers.ts';
import {Store} from '../src/store.ts';
import {Vault} from '../src/vault.ts';
import {Policy} from '../src/policy.ts';
import {ContentService} from '../src/content.ts';
import {PublishingService,ReleaseWorker,type OriginalAdapter} from '../src/publishing.ts';
import {snapshotPlatform,isolateRestoredPlatform} from '../src/recovery.ts';

async function pendingMediaFixture(t:TestContext,publicFiles=0) {
  const f=fixture(),vault=new Vault('ab'.repeat(32)),pub=new PublishingService(f.content,vault);
  t.after(()=>f.store.close());
  f.store.run('INSERT INTO publishers VALUES (?,?)','org','publisher');
  f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site','org','en','http://localhost:3999','UNUSED');
  const article=await f.content.create(f.actors.admin,{ownerId:'org',language:'en',title:'Recovery media',markdown:'Immutable confirmed source',creditedAuthor:'admin'},'create');
  const release=await pub.confirm(f.actors.admin,article.id,{ownerId:'org',revisionId:article.revision.id,creditedAuthor:'admin',rightsConfirmed:true,action:'publish',idempotencyKey:'original'},'original-confirm');
  const result={remoteId:'known-post',url:'http://localhost:3999/known/'};
  f.store.run("UPDATE releases SET state='uncertain',remote_id=?,url=? WHERE id=?",result.remoteId,result.url,release.id);
  f.store.run("UPDATE jobs SET state='done' WHERE resource_id=?",release.id);
  const confirmation={ownerId:'org',revisionId:article.revision.id,rightsConfirmed:true,idempotencyKey:'original-media'};
  const request=await pub.materializeMedia(f.actors.admin,release.id,confirmation,'media-confirm');
  f.store.run('UPDATE release_media_requests SET public_files=? WHERE id=?',publicFiles,request.id);
  const originalMedia=f.store.get('SELECT * FROM release_media_requests WHERE id=?',request.id)!;
  const originalActor=f.store.get('SELECT actor_json FROM releases WHERE id=?',release.id)!.actor_json;
  const revision=f.store.get('SELECT * FROM revisions WHERE id=?',article.revision.id)!;
  return {...f,pub,vault,article,release,result,confirmation,request,originalMedia,originalActor,revision};
}

function assertEvidence(f:Awaited<ReturnType<typeof pendingMediaFixture>>,store:Store) {
  const {state,error_code,updated_at,...before}=f.originalMedia;
  const {state:afterState,error_code:afterError,updated_at:afterUpdated,...after}=store.get('SELECT * FROM release_media_requests WHERE id=?',f.request.id)!;
  assert.deepEqual(after,before,'State repair must preserve Actor, revision, confirmation digest, Trace ID and public count');
  assert.equal(store.get('SELECT actor_json FROM releases WHERE id=?',f.release.id)!.actor_json,f.originalActor);
  assert.deepEqual(store.get('SELECT * FROM revisions WHERE id=?',f.article.revision.id),f.revision);
}

for(const publicFiles of [0,1])test(`restore terminates queued media (${publicFiles} public) and permits current read-only recovery then fresh authorized completion`,async t=>{
  const f=await pendingMediaFixture(t,publicFiles),directory=await mkdtemp(join(tmpdir(),'chrono-media-recovery-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const path=join(directory,'snapshot.sqlite');await snapshotPlatform(f.store,path);
  const restored=new Store(path);t.after(()=>restored.close());isolateRestoredPlatform(restored,'restore');
  const old=restored.get('SELECT * FROM release_media_requests WHERE id=?',f.request.id)!;
  assert.equal(old.state,publicFiles?'partial':'blocked');assert.equal(old.error_code,'RESTORED_RECONCILIATION_REQUIRED');assertEvidence(f,restored);
  f.revoked.add('admin');
  const service=new PublishingService(new ContentService(restored,new Policy(restored,f.policy.authority)),f.vault);
  let reads=0,materializations=0,images=publicFiles;
  const adapter:OriginalAdapter={
    async publish(){assert.fail('Must not resend Ghost');},async unpublish(){assert.fail('Must not change Ghost');},
    async reconcile(input){await assert.rejects(input.beforeWrite!(),{code:'RECOVERY_READ_ONLY'});reads++;return f.result;},
    async verify(){return images===2;},
    async materialize(input){materializations++;while(images<2){await input.beforeMaterialize!();input.onMaterialized!(`asset-${images++}`);}return true;}
  };
  const worker=new ReleaseWorker(service,adapter);
  await service.reconcile(f.actors.publisher,f.release.id,'current-readonly');await worker.once();
  assert.equal(reads,1);assert.equal(materializations,0);assert.equal(images,publicFiles);assertEvidence(f,restored);
  assert.equal(restored.get("SELECT value FROM settings WHERE key='outbound_paused'")!.value,'true');
  restored.run("UPDATE settings SET value='false' WHERE key='outbound_paused'");
  await assert.rejects(service.materializeMedia(f.actors.admin,f.release.id,{...f.confirmation,idempotencyKey:'revoked'},'revoked'),{code:'IDENTITY_UNAVAILABLE'});
  await assert.rejects(service.materializeMedia(f.actors.member,f.release.id,{...f.confirmation,idempotencyKey:'unauthorized'},'unauthorized'),{code:'FORBIDDEN'});
  const fresh=await service.materializeMedia(f.actors.publisher,f.release.id,{...f.confirmation,idempotencyKey:'fresh'},'fresh-command');
  assert.notEqual(fresh.id,f.request.id,'A fresh command must not reuse historical confirmation');
  await worker.once();assert.equal(images,2);assert.equal(materializations,1);assert.equal(reads,2);
  assert.equal(restored.get('SELECT state FROM releases WHERE id=?',f.release.id)!.state,'published');
  assert.equal(restored.get('SELECT state FROM release_media_requests WHERE id=?',fresh.id)!.state,'complete');
  assert.equal(restored.get('SELECT public_files FROM release_media_requests WHERE id=?',fresh.id)!.public_files,2-publicFiles);
  assertEvidence(f,restored);
});

test('running media cannot be captured, and crash isolation leaves terminal history after successful read-only recognition',async t=>{
  const f=await pendingMediaFixture(t,1),directory=await mkdtemp(join(tmpdir(),'chrono-media-crash-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  f.store.run("UPDATE release_media_requests SET state='running' WHERE id=?",f.request.id);
  f.store.run("UPDATE jobs SET state='running',lease_until='2000-01-01' WHERE resource_id=?",f.release.id);
  await assert.rejects(snapshotPlatform(f.store,join(directory,'rejected.sqlite')),{code:'WORKER_ACTIVE'});
  // A crash database is a separate isolation input, not a successful clean capture.
  isolateRestoredPlatform(f.store,'crash-isolate');
  assert.equal(f.store.get('SELECT state FROM release_media_requests WHERE id=?',f.request.id)!.state,'partial');
  assert.equal(f.store.get('SELECT state FROM jobs WHERE resource_id=?',f.release.id)!.state,'done');
  f.revoked.add('admin');await f.pub.reconcile(f.actors.publisher,f.release.id,'current-readonly');
  const worker=new ReleaseWorker(f.pub,{async publish(){assert.fail();},async unpublish(){assert.fail();},async reconcile(){return f.result;},async verify(){return true;},async materialize(){assert.fail('Read-only must not materialize');}});
  await worker.once();assert.equal(f.store.get('SELECT state FROM releases WHERE id=?',f.release.id)!.state,'published');
  assert.equal(f.store.get("SELECT count(*) n FROM release_media_requests WHERE state IN ('queued','running')")!.n,0);assertEvidence(f,f.store);
});

for(const paused of [false,true])for(const revoked of [false,true])test(`explicit read-only reconcile supersedes pending media: paused=${paused}, old source revoked=${revoked}`,async t=>{
  const f=await pendingMediaFixture(t);
  if(revoked)f.revoked.add('admin');
  f.store.run("UPDATE settings SET value=? WHERE key='outbound_paused'",String(paused));
  await f.pub.reconcile(f.actors.publisher,f.release.id,'current-readonly');
  assert.equal(f.store.get('SELECT state FROM release_media_requests WHERE id=?',f.request.id)!.state,'blocked');
  assert.equal(f.store.get('SELECT error_code FROM release_media_requests WHERE id=?',f.request.id)!.error_code,'READ_ONLY_RECONCILIATION_REQUESTED');
  let reads=0;
  await new ReleaseWorker(f.pub,{async publish(){assert.fail();},async unpublish(){assert.fail();},async reconcile(){reads++;return f.result;},async verify(){return false;},async materialize(){assert.fail('Read-only must not materialize');}}).once();
  assert.equal(reads,1);assert.equal(f.store.get('SELECT error_code FROM releases WHERE id=?',f.release.id)!.error_code,'REMOTE_RESULT_UNPROVEN');assertEvidence(f,f.store);
});

test('read-only request cannot override an active worker or mutate media without current publication access',async t=>{
  const f=await pendingMediaFixture(t,1),before=f.store.get('SELECT * FROM release_media_requests WHERE id=?',f.request.id);
  await assert.rejects(f.pub.reconcile(f.actors.member,f.release.id,'unauthorized'),{code:'FORBIDDEN'});
  f.store.run("UPDATE jobs SET state='running',lease_until='2099-01-01' WHERE resource_id=?",f.release.id);
  await assert.rejects(f.pub.reconcile(f.actors.publisher,f.release.id,'active'),{code:'IN_PROGRESS'});
  assert.deepEqual(f.store.get('SELECT * FROM release_media_requests WHERE id=?',f.request.id),before);
  assert.equal(f.store.get('SELECT count(*) n FROM recovery_actors')!.n,0);
});
