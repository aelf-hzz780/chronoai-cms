import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers.ts';
import {createApp} from '../src/app.ts';
import {Vault} from '../src/vault.ts';

test('external tasks expose identical frozen state and read-only observations through both entries without worker actions or credentials',async t=>{
 const f=fixture();let actor=f.actors.solo;const article=await f.content.create(actor,{ownerId:'solo',language:'en',title:'Frozen title',markdown:'Frozen text',creditedAuthor:'Original author'},'trace');
 const app=await createApp({...f,vault:new Vault('ab'.repeat(32)),publicUrl:'https://cms.example',authenticate:async()=>actor});t.after(async()=>{await app.close();f.store.close();});
 const at='2026-11-05T10:00:00Z';
 f.store.run('INSERT INTO releases VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)','release',article.id,article.revision.id,'solo','DO_NOT_EXPOSE_ACTOR','publish','published','ghost-id','https://original.example/story',null,'trace',at,at);
 for(const id of ['external','legacy']){
  f.store.run('INSERT INTO deliveries VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,'release','solo','connection','dev','create','full','digest',id==='external'?'awaiting_external':'uncertain',null,null,null,null,null,'trace',at,at);
  f.store.run('INSERT INTO delivery_payloads VALUES (?,?,?)',id,'DO_NOT_EXPOSE_ACTOR',JSON.stringify({title:'Frozen copy',markdown:'Frozen text',creditedAuthor:'Original author',format:'full',sourceUrl:'https://original.example/story',sourceDigest:'source-digest',accountId:'4223973'}));
  f.store.run('INSERT INTO delivery_events VALUES (?,?,?,?,?,?)','event-'+id,id,id==='external'?'awaiting_external':'uncertain',null,'history-trace',at);
 }
 f.store.run('INSERT INTO jobs VALUES (?,?,?,?,?,?)','legacy-job','delivery','legacy','uncertain',null,at);
 f.store.run('INSERT INTO external_publications VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)','external',article.revision.id,'external','DO_NOT_EXPOSE_REQUEST','DO_NOT_EXPOSE_CONNECTION','DO_NOT_EXPOSE_SYNC_ACTOR',at,at,'reauthorization_required','REMOTE_AUTHORIZATION',at,'none',0);
 f.store.run('INSERT INTO external_publication_observations VALUES (?,?,?,?,?,?,?,?)','observation','external','unavailable','REMOTE_AUTHORIZATION','123','https://dev.to/author/post','observation-trace',at);
 let previous:any;
 for(const entry of ['cms','service']){
  const response=await app.inject({url:`/api/${entry}/owners/solo/tasks/delivery/external`});assert.equal(response.statusCode,200,response.body);const detail=response.json();
  assert.equal(detail.executionMode,'external');assert.deepEqual(detail.allowedActions,['external-register','external-reconcile','external-cancel']);assert.equal(detail.snapshot.title,'Frozen copy');assert.equal(detail.revisionId,article.revision.id);
  assert.equal(detail.externalPublication.syncStatus,'reauthorization_required');assert.equal(detail.externalPublication.lastVerifiedAt,at);assert.equal(detail.externalPublication.observations[0].traceId,'observation-trace');assert.equal(detail.history[0].state,'awaiting_external');assert.doesNotMatch(response.body,/DO_NOT_EXPOSE|request_json|sync_actor_json|connection_json/);
  if(previous)assert.deepEqual(detail,previous);previous=detail;
  const list=(await app.inject({url:`/api/${entry}/owners/solo/tasks?kind=delivery`})).json();assert.equal(list.items.find((item:any)=>item.id==='external').executionMode,'external');assert.equal(list.items.find((item:any)=>item.id==='legacy').executionMode,undefined);
  const legacy=(await app.inject({url:`/api/${entry}/owners/solo/tasks/delivery/legacy`})).json();assert.deepEqual(legacy.allowedActions,['reconcile']);
 }
 f.store.run("UPDATE deliveries SET state='published',remote_id='123',url='https://dev.to/author/post' WHERE id='external'");
 let detail=(await app.inject({url:'/api/cms/owners/solo/tasks/delivery/external'})).json();assert.deepEqual(detail.allowedActions,['external-sync','external-follow-up']);assert.equal(detail.url,'https://dev.to/author/post');
 f.store.run("UPDATE deliveries SET state='cancelled' WHERE id='external'");f.store.run("UPDATE external_publications SET follow_up_state='removal_requested' WHERE delivery_id='external'");
 detail=(await app.inject({url:'/api/cms/owners/solo/tasks/delivery/external'})).json();assert.deepEqual(detail.allowedActions,['external-reconcile','external-sync','external-follow-up','external-verify-removal']);
 actor={...actor,scopes:['content:read']};detail=(await app.inject({url:'/api/cms/owners/solo/tasks/delivery/external'})).json();assert.deepEqual(detail.allowedActions,[]);assert.equal(detail.distribution.accountId,null);assert.equal(detail.copy.connectionId,null);
 actor=f.actors.outsider;assert.equal((await app.inject({url:'/api/cms/owners/solo/tasks/delivery/external'})).statusCode,403);
});
