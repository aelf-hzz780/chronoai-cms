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
