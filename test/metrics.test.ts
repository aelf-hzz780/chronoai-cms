import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.ts';
import { MetricsService } from '../src/metrics.ts';
import { PublishingService, ReleaseWorker } from '../src/publishing.ts';
import { Vault } from '../src/vault.ts';

test('A41/A42/A43/A44/A45/A46: signed published-only collection, filters, privacy, isolation and explicit unavailability', async t => {
  const f = fixture(); t.after(() => f.store.close());
  f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)', 'solo-en', 'solo', 'en', 'http://localhost:3999', 'KEY');
  const a = await f.content.create(f.actors.solo, { ownerId: 'solo', language: 'en', title: 'Metrics', markdown: 'x', creditedAuthor: 'Solo' }, 'trace');
  const metrics = new MetricsService(f.content, { enabled: true, requireConsent: true, secret: 'test-analytics-only' });
  assert.equal(await metrics.collect(metrics.token(a.id, 'draft'), { consent: true, ip: '127.0.0.1', userAgent: 'test', referral: 'https://dev.to/example?secret=never-store', campaign: 'dev' }), false);
  const pub = new PublishingService(f.content, new Vault('ab'.repeat(32)));
  const release = await pub.confirm(f.actors.solo, a.id, { revisionId: a.revision.id, ownerId: 'solo', creditedAuthor: 'Solo', action: 'publish', rightsConfirmed: true, idempotencyKey: 'metric-pub' }, 'trace');
  await new ReleaseWorker(pub, { async publish() { return { remoteId: 'r', url: 'http://localhost:3999/post' }; }, async verify() { return true; }, async reconcile() { return null; }, async unpublish() {} }).once();
  const token = metrics.token(a.id, release.id), visit = { consent: true, ip: '127.0.0.1', userAgent: 'test', referral: 'https://dev.to/example?secret=never-store', campaign: 'dev' };
  assert.equal(await metrics.collect(token, { ...visit, consent: false }), false);
  assert.equal(await metrics.collect(token, { ...visit, doNotTrack: true }), false);
  assert.equal(await metrics.collect(token + 'forged', visit), false);
  assert.equal(await metrics.collect(token, visit), true); assert.equal(await metrics.collect(token, visit), true);
  const result = await metrics.query(f.actors.solo, 'solo', {});
  assert.equal(result.readership.pageViews.value, 2); assert.equal(result.readership.estimatedDailyVisitors.value, 1);
  assert.equal(result.referrals[0].referral, 'dev.to');
  assert.equal((await metrics.query(f.actors.solo, 'solo', { language: 'zh' })).readership.pageViews.value, 0);
  assert.equal((await metrics.query(f.actors.solo, 'solo', { destination: 'dev' })).readership.pageViews.availability, 'Unavailable');
  await assert.rejects(metrics.query(f.actors.admin, 'solo', {}), { code: 'FORBIDDEN' });
  const disabled = new MetricsService(f.content, { enabled: false, requireConsent: true, secret: 'test' });
  assert.equal((await disabled.query(f.actors.solo, 'solo', {})).readership.pageViews.value, null);
  assert.ok(!JSON.stringify(f.store.all('SELECT * FROM observations')).includes('never-store'));
  assert.ok(!JSON.stringify(f.store.all('SELECT * FROM observations')).includes('127.0.0.1'));
});

test('real-length tracker URLs are accepted and missing external counters stay Unavailable instead of zero',async t=>{
  const f=fixture();const {createApp}=await import('../src/app.ts');const metrics=new MetricsService(f.content,{enabled:true,requireConsent:true,secret:'test-secret'});const app=await createApp({...f,vault:new Vault('ab'.repeat(32)),publicUrl:'https://cms.example',metrics,authenticate:async()=>f.actors.solo});t.after(async()=>{await app.close();f.store.close();});
  const token=metrics.token('a'.repeat(36),'r'.repeat(36));assert.ok(token.length>100);const response=await app.inject({url:`/track/${token}.gif?consent=1`});assert.equal(response.statusCode,200);assert.equal(response.headers['content-type'],'image/gif');
  f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site','solo','en','http://localhost:3999','KEY');const a=await f.content.create(f.actors.solo,{ownerId:'solo',language:'en',title:'External metrics',markdown:'body',creditedAuthor:'Solo'},'trace');
  const publication=new PublishingService(f.content,new Vault('ab'.repeat(32))),release=await publication.confirm(f.actors.solo,a.id,{ownerId:'solo',revisionId:a.revision.id,creditedAuthor:'Solo',action:'publish',rightsConfirmed:true,idempotencyKey:'ext'},'trace');
  const now=new Date().toISOString();f.store.run('INSERT INTO deliveries(id,release_id,owner_id,connection_id,target,action,format,digest,state,remote_id,trace_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)','copy',release.id,'solo','connection','dev','create','full','digest','published','remote','trace',now,now);
  assert.equal((await metrics.query(f.actors.solo,'solo',{destination:'dev'})).readership.pageViews.value,null);
  f.store.run('INSERT INTO external_metrics VALUES (?,?,?,?,?,?,?)','copy',9,2,0,'authorized contract test',now,null);
  const result=await metrics.query(f.actors.solo,'solo',{destination:'dev'});assert.equal(result.readership.pageViews.value,9);assert.equal(result.externalEngagement.comments,0);assert.match(result.externalEngagement.metrics.views.coverage.counter_window,/lifetime/);
  f.store.run('UPDATE external_metrics SET views=NULL WHERE delivery_id=?','copy');assert.equal((await metrics.query(f.actors.solo,'solo',{destination:'dev'})).readership.pageViews.value,null);
});
test('R015/R016: delivery dates differ from original dates, and collection gaps expose unavailable coverage without blocking GIF',async t=>{
  const f=fixture(),vault=new Vault('ab'.repeat(32));t.after(()=>f.store.close());
  f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site','solo','en','http://localhost:3999','KEY');
  const a=await f.content.create(f.actors.solo,{ownerId:'solo',language:'en',title:'Dates',markdown:'body',creditedAuthor:'Solo'},'trace');const service=new PublishingService(f.content,vault);
  const release=await service.confirm(f.actors.solo,a.id,{ownerId:'solo',revisionId:a.revision.id,creditedAuthor:'Solo',action:'publish',rightsConfirmed:true,idempotencyKey:'dates'},'trace');
  f.store.run("UPDATE releases SET state='published',created_at='2026-10-01T12:00:00.000Z' WHERE id=?",release.id);
  f.store.run('INSERT INTO deliveries(id,release_id,owner_id,connection_id,target,action,format,digest,state,remote_id,trace_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)','date-copy',release.id,'solo','connection','dev','create','full','digest','published','remote','trace','2026-10-02T12:00:00.000Z','2026-10-02T12:00:00.000Z');
  const metrics=new MetricsService(f.content,{enabled:true,requireConsent:true,secret:'test'});
  assert.deepEqual((await metrics.query(f.actors.solo,'solo',{destination:'dev',from:'2026-10-02',to:'2026-10-02'})).distribution.value.map(row=>({...row})),[{state:'published',count:1}]);assert.equal((await metrics.query(f.actors.solo,'solo',{destination:'dev',from:'2026-10-01',to:'2026-10-01'})).distribution.value.length,0);
  const {createApp}=await import('../src/app.ts');const app=await createApp({...f,vault,metrics,publicUrl:'https://cms.example',authenticate:async()=>f.actors.solo});t.after(()=>app.close());
  const run=f.store.run.bind(f.store);f.store.run=(sql,...args)=>{if(sql.startsWith('INSERT INTO observations'))throw Error('write failed');return run(sql,...args);};
  assert.equal((await app.inject({url:`/track/${metrics.token(a.id,release.id)}.gif?consent=1`})).statusCode,200);f.store.run=run;
  const result=await metrics.query(f.actors.solo,'solo',{});assert.equal(result.readership.pageViews.value,null);assert.equal(result.readership.pageViews.availability,'Unavailable');assert.match(result.readership.pageViews.reason!,/incomplete/);assert.ok('collectionGaps' in result.readership.pageViews.coverage);assert.equal(result.readership.pageViews.coverage.collectionGaps,1);
  assert.equal((await metrics.query(f.actors.solo,'solo',{language:'zh'})).readership.pageViews.availability,'Available');
});

for(const failure of ['published-lookup','all-collection-writes','all-database-writes'])test(`R016: ${failure} coverage survives closing and reopening a disk database`,async t=>{
  const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
  const {backup}=await import('node:sqlite'),{Store}=await import('../src/store.ts'),{Policy}=await import('../src/policy.ts'),{ContentService}=await import('../src/content.ts');
  const f=fixture(),directory=await mkdtemp(join(tmpdir(),'chrono-coverage-')),database=join(directory,'platform.sqlite');
  f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site','solo','en','http://localhost:3999','KEY');
  const a=await f.content.create(f.actors.solo,{ownerId:'solo',language:'en',title:'Coverage',markdown:'body',creditedAuthor:'solo'},'trace');
  const service=new PublishingService(f.content,new Vault('ab'.repeat(32))),release=await service.confirm(f.actors.solo,a.id,{ownerId:'solo',revisionId:a.revision.id,creditedAuthor:'solo',action:'publish',rightsConfirmed:true,idempotencyKey:'coverage'},'trace');
  f.store.run("UPDATE releases SET state='published' WHERE id=?",release.id);
  await backup(f.store.db,database);f.store.close();
  let store=new Store(database);t.after(async()=>{store.close();await rm(directory,{recursive:true,force:true});});
  const content=()=>new ContentService(store,new Policy(store,f.policy.authority)),config={enabled:true,requireConsent:true,secret:'test-only'},metrics=new MetricsService(content(),config);
  const get=store.get.bind(store),run=store.run.bind(store);
  store.get=(sql,...args)=>{if(failure==='published-lookup'&&sql.startsWith('SELECT r.id,a.id AS article'))throw Error('lookup unavailable');return get(sql,...args);};
  store.run=(sql,...args)=>{if(failure==='all-database-writes'||failure==='all-collection-writes'&&/^INSERT INTO (observations|collection_gaps)/.test(sql))throw Error('write unavailable');return run(sql,...args);};
  await assert.rejects(metrics.collect(metrics.token(a.id,release.id),{consent:true,ip:'127.0.0.1',userAgent:'test'}));
  store.get=get;store.run=run;store.close();store=new Store(database);
  const restarted=new MetricsService(content(),config),result=await restarted.query(f.actors.solo,'solo',{});
  assert.equal(result.readership.pageViews.value,null);assert.equal(result.readership.pageViews.availability,'Unavailable');assert.ok('collectionGaps' in result.readership.pageViews.coverage);assert.equal(result.readership.pageViews.coverage.collectionGaps,1);
  assert.equal((await restarted.query(f.actors.solo,'solo',{language:'zh'})).readership.pageViews.value,0);
  const {snapshotPlatform}=await import('../src/recovery.ts');const destination=join(directory,'snapshot.sqlite');await snapshotPlatform(store,destination);
  const checkpointed=(await restarted.query(f.actors.solo,'solo',{})).readership.pageViews.coverage;assert.ok('collectionGaps' in checkpointed);assert.equal(checkpointed.collectionGaps,1);
  const restored=new Store(destination);try{assert.equal(restored.get('SELECT count(*) AS n FROM collection_attempts')!.n,1);}finally{restored.close();}
});


test('R017: successful sidecar visit clears checkpointed attempts during a concurrent snapshot',async t=>{
  const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{backup}=await import('node:sqlite');
  const {Store}=await import('../src/store.ts'),{Policy}=await import('../src/policy.ts'),{ContentService}=await import('../src/content.ts'),{snapshotPlatform}=await import('../src/recovery.ts');
  const f=fixture(),directory=await mkdtemp(join(tmpdir(),'chrono-checkpoint-')),database=join(directory,'platform.sqlite');
  f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site','solo','en','http://localhost:3999','KEY');
  const a=await f.content.create(f.actors.solo,{ownerId:'solo',language:'en',title:'Checkpoint',markdown:'body',creditedAuthor:'solo'},'trace');
  const service=new PublishingService(f.content,new Vault('ab'.repeat(32))),release=await service.confirm(f.actors.solo,a.id,{ownerId:'solo',revisionId:a.revision.id,creditedAuthor:'solo',action:'publish',rightsConfirmed:true,idempotencyKey:'checkpoint'},'trace');
  f.store.run("UPDATE releases SET state='published' WHERE id=?",release.id);await backup(f.store.db,database);f.store.close();
  const store=new Store(database),second=new Store(database),content=new ContentService(store,new Policy(store,f.policy.authority)),config={enabled:true,requireConsent:true,secret:'test-only'},metrics=new MetricsService(content,config);
  t.after(async()=>{store.close();second.close();await rm(directory,{recursive:true,force:true});});
  const run=store.run.bind(store),get=store.get.bind(store);let first=true,pending:Promise<void>|undefined;
  store.run=(sql,...args)=>{if(first&&sql.startsWith('INSERT INTO collection_attempts')){first=false;throw Error('initial write unavailable');}return run(sql,...args);};
  store.get=(sql,...args)=>{if(!pending&&sql.startsWith('SELECT r.id,a.id AS article'))pending=snapshotPlatform(second,join(directory,'snapshot.sqlite'));return get(sql,...args);};
  assert.equal(await metrics.collect(metrics.token(a.id,release.id),{consent:true,ip:'127.0.0.1',userAgent:'test'}),true);
  await pending;store.run=run;store.get=get;
  assert.equal(store.get('SELECT count(*) AS n FROM observations')!.n,1);assert.equal(store.get('SELECT count(*) AS n FROM collection_attempts')!.n,0);
  assert.equal((await metrics.query(f.actors.solo,'solo',{})).readership.pageViews.value,1);
});
