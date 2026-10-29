import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.ts';
import { Vault } from '../src/vault.ts';
import { PublishingService, ReleaseWorker } from '../src/publishing.ts';
import { DistributionService, DeliveryWorker } from '../src/distribution.ts';
import { TargetRegistry, DevAdapter, HashnodeAdapter, AssistedAdapter } from '../src/targets.ts';
import { RemoteError } from '../src/http-client.ts';

async function setup(owner = 'org') {
  const f = fixture(), actor = owner === 'org' ? f.actors.admin : f.actors.solo;
  f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)', 'site', owner, 'en', 'http://localhost:3999', 'KEY');
  const article = await f.content.create(actor, { ownerId: owner, language: 'en', title: 'Distribute', markdown: 'Exact confirmed content', creditedAuthor: actor.subject }, 'trace');
  const originals = new PublishingService(f.content, new Vault('ab'.repeat(32)));
  const release = await originals.confirm(actor, article.id, { ownerId: owner, revisionId: article.revision.id, creditedAuthor: actor.subject, action: 'publish', rightsConfirmed: true, idempotencyKey: 'original' }, 'trace');
  const original = { async publish() { return { remoteId: 'original', url: 'http://localhost:3999/original/' }; }, async verify() { return true; }, async reconcile() { return null; }, async unpublish() {} };
  await new ReleaseWorker(originals, original).once();
  const calls: any[] = []; let approved = false, uncertain = false;
  const connections = { async connection(_actor:any, requestedOwner:any, id:string, target:string) { assert.equal(id, `${owner}-${target}`); return { id, owner: requestedOwner, target, active: true, accountId: 'account', organizationId: owner === 'org' ? 'dev-org' : undefined, publicationId: 'hash-publication', pro: true, canPublish: true, canUpdate: true, canRemove: true }; },
    async approval(_actor:any, _owner:any, reference:string, digest:string) { if (!approved || reference !== digest) throw new RemoteError('APPROVAL_NEEDED','Exact approval required'); return {}; },
    async execute(_actor:any, input:any) { calls.push(input); if (uncertain) throw new RemoteError('REMOTE_UNCERTAIN','Sent, outcome unknown',true); return { accountId: 'account', status: 200, body: input.request.method === 'GET' ? [] : { id: 'dev-copy', url: 'https://dev.to/account/copy', canonical_url: 'http://localhost:3999/original/', body_markdown: input.request.body?.article?.body_markdown } }; } };
  const registry = new TargetRegistry([new DevAdapter('https://dev.to/api'), new HashnodeAdapter('https://gql-beta.hashnode.com'), new AssistedAdapter('medium'), new AssistedAdapter('hackernoon')]);
  const service = new DistributionService(originals, connections, registry);
  const worker = new DeliveryWorker(service, original);
  return { ...f, actor, article, release, service, worker, calls, approve() { approved = true; }, makeUncertain() { uncertain = true; } };
}

test('A27/A28/A29/A33: exact owner connection and payload approval, original freshness and cancellation', async t => {
  const f = await setup(); t.after(() => f.store.close());
  const request = { target: 'dev', connectionId: 'org-dev', format: 'full', action: 'create', rightsConfirmed: true, idempotencyKey: 'delivery' };
  const delivery = await f.service.request(f.actor, f.release.id, request, 'trace');
  assert.equal(delivery.state, 'approval_needed'); await f.worker.once(); assert.equal(f.calls.length, 0);
  await assert.rejects(f.service.authorize(f.actor, delivery.id, 'generic-grant', 'trace'));
  f.approve(); await f.service.authorize(f.actor, delivery.id, delivery.digest, 'trace');
  f.store.run("UPDATE releases SET state='superseded' WHERE id=?", f.release.id);
  await f.worker.once(); assert.equal(f.calls.length, 0); assert.equal(f.store.get('SELECT state FROM deliveries WHERE id=?', delivery.id)?.state, 'blocked');
});

test('A35/A36/A37/A38: uncertain writes do not duplicate; assisted targets retain separate manual state', async t => {
  const f = await setup('solo'); t.after(() => f.store.close());
  const delivery = await f.service.request(f.actor, f.release.id, { target: 'dev', connectionId: 'solo-dev', format: 'excerpt', excerpt: 'An excerpt', action: 'create', rightsConfirmed: true, idempotencyKey: 'auto' }, 'trace');
  const assisted = await f.service.request(f.actor, f.release.id, { target: 'medium', connectionId: 'solo-medium', format: 'full', action: 'create', rightsConfirmed: true, idempotencyKey: 'manual' }, 'trace');
  assert.equal(assisted.state, 'manual_action_needed'); assert.match((await f.service.package(f.actor, assisted.id)).markdown, /Original/);
  f.makeUncertain(); await f.worker.once(); assert.equal(f.calls.length, 1);
  assert.equal(f.store.get('SELECT state FROM deliveries WHERE id=?', delivery.id)?.state, 'uncertain');
  await f.worker.once(); assert.equal(f.calls.length, 1);
  await f.service.reconcile(f.actor, delivery.id, 'trace'); await f.worker.once();
  assert.equal(f.calls.filter(c => c.request.method !== 'GET').length, 1);
  await assert.rejects(f.service.cancel(f.actor, delivery.id, 'trace'), { code: 'ALREADY_SENT' });
  await f.service.report(f.actor, assisted.id, 'submitted', null, 'trace');
  assert.equal(f.store.get('SELECT state FROM deliveries WHERE id=?', assisted.id)?.state, 'submitted');
});

test('distribution confirmation is idempotent and cancellation cannot be resurrected by a late approval',async t=>{
  const f=await setup();t.after(()=>f.store.close());const request={target:'dev',connectionId:'org-dev',format:'full',action:'create',rightsConfirmed:true,idempotencyKey:'same'};
  const first=await f.service.request(f.actor,f.release.id,request,'trace');assert.equal((await f.service.request(f.actor,f.release.id,request,'trace')).id,first.id);
  await assert.rejects(f.service.request(f.actor,f.release.id,{...request,format:'excerpt',excerpt:'different'},'trace'),{code:'CONFLICT'});
  f.approve();const old=f.service.connections.approval;f.service.connections.approval=async(...args)=>{await f.service.cancel(f.actor,first.id,'concurrent-cancel');return old(...args);};
  await assert.rejects(f.service.authorize(f.actor,first.id,first.digest,'trace'),{code:'DELIVERY_STATE'});assert.equal(f.store.get('SELECT state FROM deliveries WHERE id=?',first.id)!.state,'cancelled');
});
test('lost author connection retains a manual removal follow-up on the known copy, without account fallback',async t=>{
  const f=await setup('solo');t.after(()=>f.store.close());
  const original=await f.service.request(f.actor,f.release.id,{target:'dev',connectionId:'solo-dev',format:'full',action:'create',rightsConfirmed:true,idempotencyKey:'copy'},'trace');
  f.store.run("UPDATE deliveries SET state='published',remote_id='known-copy',url='https://dev.to/account/known' WHERE id=?",original.id);
  f.service.connections.connection=async()=>{throw new RemoteError('CONNECTION_DISABLED','Original author no longer connected');};
  const followup=await f.service.request(f.actor,f.release.id,{target:'dev',connectionId:'solo-dev',format:'full',action:'remove',copyId:original.id,rightsConfirmed:true,idempotencyKey:'remove'},'trace');
  assert.equal(followup.state,'manual_action_needed');assert.equal(followup.remote_id,'known-copy');assert.equal(f.store.get("SELECT count(*) AS n FROM jobs WHERE kind='delivery' AND resource_id=?",followup.id)!.n,0);assert.match((await f.service.package(f.actor,followup.id)).instructions,/original author/);
  await f.service.report(f.actor,followup.id,'submitted','https://dev.to/account/known','trace');
  t.mock.method(globalThis,'fetch',async()=>new Response('',{status:410}));
  await f.service.report(f.actor,followup.id,'removed',null,'trace');
  assert.equal(f.store.get('SELECT state FROM deliveries WHERE id=?',original.id)!.state,'removed');
});
test('a cancelled assisted submission cannot be reported as published or submitted',async t=>{
  const f=await setup('solo');t.after(()=>f.store.close());const copy=await f.service.request(f.actor,f.release.id,{target:'medium',connectionId:'solo-medium',format:'full',action:'create',rightsConfirmed:true,idempotencyKey:'manual-cancel'},'trace');
  await f.service.cancel(f.actor,copy.id,'trace');await assert.rejects(f.service.report(f.actor,copy.id,'submitted',null,'trace'),{code:'INVALID_INPUT'});
});
test('disabled destination keeps exact known-copy removal follow-up and settles the old published record',async t=>{
  const f=await setup('solo');t.after(()=>f.store.close());
  const copy=await f.service.request(f.actor,f.release.id,{target:'dev',connectionId:'solo-dev',format:'full',action:'create',rightsConfirmed:true,idempotencyKey:'known'},'trace');
  const url='https://dev.to/account/known';f.store.run("UPDATE deliveries SET state='published',remote_id='known',url=? WHERE id=?",url,copy.id);
  f.service.targets.disabled.add('dev');
  const followup=await f.service.request(f.actor,f.release.id,{target:'dev',connectionId:'solo-dev',format:'full',action:'remove',copyId:copy.id,rightsConfirmed:true,idempotencyKey:'disabled-remove'},'trace');
  assert.equal(followup.state,'manual_action_needed');assert.match((await f.service.package(f.actor,followup.id)).instructions,/original author/);
  await assert.rejects(f.service.report(f.actor,followup.id,'submitted','https://hackernoon.com/wrong','trace'),{code:'INVALID_INPUT'});
  await f.service.report(f.actor,followup.id,'submitted',url,'trace');
  t.mock.method(globalThis,'fetch',async()=>new Response('',{status:404}));
  await f.service.report(f.actor,followup.id,'removed',url,'trace');
  assert.equal(f.store.get('SELECT state FROM deliveries WHERE id=?',copy.id)!.state,'removed');
  assert.equal(f.store.get("SELECT count(*) AS n FROM jobs WHERE resource_id=?",followup.id)!.n,0);
});
test('assisted publication cannot settle when the original is unpublished during remote verification',async t=>{
  const f=await setup('solo');t.after(()=>f.store.close());
  const copy=await f.service.request(f.actor,f.release.id,{target:'medium',connectionId:'solo-medium',format:'full',action:'create',rightsConfirmed:true,idempotencyKey:'race'},'trace');
  t.mock.method(globalThis,'fetch',async()=>{f.store.run("UPDATE releases SET state='unpublished' WHERE id=?",f.release.id);return new Response(`<article><h1>Distribute</h1><p>Exact confirmed content</p><p>Author: solo</p><p>Original: <a href="http://localhost:3999/original/">http://localhost:3999/original/</a></p></article>`);});
  await assert.rejects(f.service.report(f.actor,copy.id,'published','https://medium.com/@author/post','trace'),{code:'ORIGINAL_NOT_LIVE'});
  assert.equal(f.store.get('SELECT state FROM deliveries WHERE id=?',copy.id)!.state,'manual_action_needed');
});
test('R008: source becomes unpublished during the last connection or native execution await; no write is allowed',async t=>{
  for(const at of ['connection','execute']){
    const f=await setup('solo');t.after(()=>f.store.close());let reads=0;
    const old=f.service.connections.connection;f.service.connections.connection=async(...args)=>{const connection=await old(...args);if(++reads===3 && at==='connection')f.store.run("UPDATE releases SET state='unpublished' WHERE id=?",f.release.id);return connection;};
    if(at==='execute')f.service.connections.execute=async(_actor,input:any)=>{f.store.run("UPDATE releases SET state='unpublished' WHERE id=?",f.release.id);input.beforeDispatch();f.calls.push(input);return {};};
    const delivery=await f.service.request(f.actor,f.release.id,{target:'dev',connectionId:'solo-dev',format:'full',action:'create',rightsConfirmed:true,idempotencyKey:at},'trace');await f.worker.once();
    assert.equal(f.calls.length,0);assert.equal(f.store.get('SELECT error_code FROM deliveries WHERE id=?',delivery.id)!.error_code,'ORIGINAL_NOT_LIVE');
  }
});
test('R009: an accepted provider write missing its remote identity remains uncertain and blocks another create',async t=>{
  const f=await setup('solo');t.after(()=>f.store.close());
  f.service.connections.execute=async(_actor,input:any)=>{f.calls.push(input);return{accountId:'account',status:201,body:{accepted:true}};};
  const request={target:'dev',connectionId:'solo-dev',format:'full',action:'create',rightsConfirmed:true,idempotencyKey:'accepted'};
  const delivery=await f.service.request(f.actor,f.release.id,request,'trace');await f.worker.once();assert.equal(f.store.get('SELECT state FROM deliveries WHERE id=?',delivery.id)!.state,'uncertain');
  await assert.rejects(f.service.request(f.actor,f.release.id,{...request,idempotencyKey:'new'},'trace'),{code:'DUPLICATE_TARGET'});assert.equal(f.calls.length,1);
});
test('R011: assisted verification requires visible approved content, credited author and source anchor, never metadata/comments',async t=>{
  const f=await setup('solo');t.after(()=>f.store.close());
  const copy=await f.service.request(f.actor,f.release.id,{target:'medium',connectionId:'solo-medium',format:'full',action:'create',rightsConfirmed:true,idempotencyKey:'manual-proof'},'trace');
  const good='<article><h1>Distribute</h1><p>Exact confirmed content</p><p>Author: solo</p><p>Original: <a href="http://localhost:3999/original/">http://localhost:3999/original/</a></p></article>';
  for(const body of ['<title>Distribute</title><!-- http://localhost:3999/original/ --><article>Unrelated body by another author</article>',good.replace('Author: solo','Author: other'),`<template>${good}</template>`,good.replace('Exact confirmed content','Unrelated body')]){
    t.mock.method(globalThis,'fetch',async()=>new Response(body));await assert.rejects(f.service.report(f.actor,copy.id,'published','https://medium.com/@author/test','trace'),{code:'PUBLICATION_UNVERIFIED'});assert.equal(f.store.get('SELECT state FROM deliveries WHERE id=?',copy.id)!.state,'manual_action_needed');t.mock.restoreAll();
  }
  t.mock.method(globalThis,'fetch',async()=>new Response(good));assert.equal((await f.service.report(f.actor,copy.id,'published','https://medium.com/@author/test','trace'))!.state,'published');
});
test('R014: paused outbound admits explicit uncertain delivery reconciliation but cannot execute new creates',async t=>{
  const f=await setup('solo');t.after(()=>f.store.close());f.makeUncertain();
  const input={target:'dev',connectionId:'solo-dev',format:'full',action:'create',rightsConfirmed:true,idempotencyKey:'pause'};
  const delivery=await f.service.request(f.actor,f.release.id,input,'trace');await f.worker.once();const writes=f.calls.length;
  f.store.run("UPDATE settings SET value='true' WHERE key='outbound_paused'");await f.service.reconcile(f.actor,delivery.id,'recovery');assert.equal(await f.worker.once(),true);assert.equal(f.calls.length,writes+1);assert.equal(f.calls.at(-1).readOnly,true);
  const fresh=await f.content.create(f.actor,{ownerId:'solo',language:'en',title:'Queued',markdown:'body',creditedAuthor:'solo'},'trace');
  const queued=await f.service.originals.confirm(f.actor,fresh.id,{ownerId:'solo',revisionId:fresh.revision.id,creditedAuthor:'solo',action:'publish',rightsConfirmed:true,idempotencyKey:'new-original'},'trace');
  assert.equal(await new ReleaseWorker(f.service.originals,{async publish(){throw Error('Must not send');},async verify(){return true;},async reconcile(){return null;},async unpublish(){throw Error('Must not send');}}).once(),false);assert.equal(f.store.get('SELECT state FROM releases WHERE id=?',queued.id)!.state,'queued');
});
