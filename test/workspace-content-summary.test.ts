import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture} from './helpers.ts';
import {createApp} from '../src/app.ts';
import {Vault} from '../src/vault.ts';
import {PublishingService, ReleaseWorker, type OriginalAdapter} from '../src/publishing.ts';
import {Store} from '../src/store.ts';

const articleInput=(ownerId='org',language='en',title='Submitted title')=>({ownerId,language,title,markdown:'Private Markdown body',creditedAuthor:'Member'});
async function appFixture(t:any) {
  const f=fixture();let actor=f.actors.member;
  const app=await createApp({...f,vault:new Vault('ab'.repeat(32)),publicUrl:'https://cms.example',authenticate:async()=>actor});
  t.after(async()=>{await app.close();f.store.close();});
  return {...f,app,use(subject:string){actor=f.actors[subject];},actor(value:typeof actor){actor=value;}};
}

test('C01: workspace role and scoped capabilities remain separate and both entries preserve me compatibility',async t=>{
  const f=await appFixture(t);f.store.run('INSERT INTO publishers VALUES (?,?)','org','publisher');
  for(const [subject,role] of [['member','member'],['publisher','publisher'],['admin','admin']]){
    f.use(subject!);
    for(const entry of ['cms','service']){
      const response=await f.app.inject({url:`/api/${entry}/me`});assert.equal(response.statusCode,200,response.body);
      const me=response.json(),workspace=me.workspaces.find((w:any)=>w.id==='org');
      assert.equal(me.subject,subject);assert.equal(workspace.role,role);assert.equal(workspace.canPublish,role!=='member');
      assert.deepEqual(workspace.capabilities,{canWrite:true,canPublish:role!=='member',canManagePublishers:role==='admin',canReadConnections:role!=='member',canReadMetrics:true});
      assert.deepEqual(me.organizationDirectory,{status:'available'});
    }
  }
  f.actor({...f.actors.admin,scopes:['content:read']});
  const me=(await f.app.inject({url:'/api/cms/me'})).json(),organization=me.workspaces.find((w:any)=>w.id==='org');
  assert.equal(organization.role,'admin');assert.deepEqual(organization.capabilities,{canWrite:false,canPublish:false,canManagePublishers:false,canReadConnections:false,canReadMetrics:false});
  assert.equal(me.workspaces.find((w:any)=>w.id==='admin').role,'owner');
});

test('C01: organization lookup failure keeps verified personal workspace and never exposes an unverified organization',async t=>{
  const f=await appFixture(t);f.store.run('INSERT INTO owner_profiles VALUES (?,?)','org','Private organization name');
  f.policy.authority.membership=async()=>{throw Error('remote directory failed');};
  const response=await f.app.inject({url:'/api/cms/me'});assert.equal(response.statusCode,200,response.body);
  assert.deepEqual(response.json().workspaces.map((w:any)=>w.id),['member']);
  assert.deepEqual(response.json().organizationDirectory,{status:'unavailable',code:'MEMBERSHIP_UNAVAILABLE'});
  assert.doesNotMatch(response.body,/Private organization name|"org"/);
  f.revoked.add('member');const revoked=await f.app.inject({url:'/api/cms/me'});assert.equal(revoked.statusCode,401);
});

test('C04: safe per-language site configuration is shared between CMS/service and never claims unverified reachability',async t=>{
  const f=await appFixture(t);f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','private-site','member','en','https://blog.example','PRIVATE_KEY_REFERENCE');
  f.store.run('INSERT INTO site_admin_routes VALUES (?,?)','private-site','https://private-admin.example');
  for(const entry of ['cms','service']){
    const response=await f.app.inject({url:`/api/${entry}/owners/member/sites`});assert.equal(response.statusCode,200,response.body);
    assert.deepEqual(response.json(),{ownerId:'member',sites:[{language:'en',configured:true,publicUrl:'https://blog.example',verification:{status:'unknown',checkedAt:null},blockers:[]},{language:'zh',configured:false,publicUrl:null,verification:{status:'unknown',checkedAt:null},blockers:['SITE_REQUIRED']}]});
    assert.doesNotMatch(response.body,/PRIVATE_KEY_REFERENCE|private-admin|key_ref|admin_routes/);
  }
  f.use('outsider');assert.equal((await f.app.inject({url:'/api/cms/owners/member/sites'})).statusCode,403);
});

test('C02: authorization precedes search, counts and pagination; only current authorized pointers are returned',async t=>{
  const f=await appFixture(t),author=f.actors.member;
  const submitted=await f.content.create(author,articleInput(),'trace');await f.content.submit(author,submitted.id,submitted.revision.id,'trace');
  const secret=await f.content.edit(author,submitted.id,submitted.revision.id,{title:'HIDDEN NEW TITLE',markdown:'HIDDEN NEW MARKDOWN'},'trace');
  const hidden=await f.content.create(author,articleInput('org','en','HIDDEN ARTICLE'),'trace');
  const mine=await f.content.create(f.actors.admin,articleInput('org','zh','Admin article'),'trace');
  let membershipCalls=0;const lookup=f.policy.authority.membership.bind(f.policy.authority);f.policy.authority.membership=async(...args)=>{membershipCalls++;return lookup(...args);};
  f.use('admin');const response=await f.app.inject({url:'/api/cms/owners/org/content-summary?limit=1&offset=0'});assert.equal(response.statusCode,200,response.body);
  assert.equal(membershipCalls,1,'One current owner role lookup per summary request');
  const body=response.json();assert.equal(body.total,2);assert.equal(body.items.length,1);assert.deepEqual(body.counts,{all:2,draft:1,submitted:1,published:0,outdated:0});
  const second=(await f.app.inject({url:'/api/service/owners/org/content-summary?limit=1&offset=1'})).json();
  const all=[...body.items,...second.items],item=all.find((a:any)=>a.id===submitted.id);
  assert.equal(item.revision.id,submitted.revision.id);assert.equal(item.revision.title,'Submitted title');assert.equal(item.draft,null);
  assert.deepEqual(item.submission,{revisionId:submitted.revision.id,submittedAt:f.store.get('SELECT created_at FROM submissions WHERE article_id=?',submitted.id)!.created_at,status:'pending',fulfilledByReleaseId:null});
  assert.deepEqual(item.capabilities,{canEdit:false,canSubmit:false,canPublish:true});assert.equal(item.live,null);
  const serialized=JSON.stringify(all);for(const privateValue of [secret.revision.id,hidden.id,'HIDDEN NEW TITLE','HIDDEN NEW MARKDOWN','Private Markdown body','"markdown"'])assert.ok(!serialized.includes(privateValue),privateValue);
  assert.deepEqual(item.states,['submitted']);
  const search=(await f.app.inject({url:'/api/cms/owners/org/content-summary?q=HIDDEN'})).json();assert.equal(search.total,0);assert.equal(search.counts.all,0);
  const filtered=(await f.app.inject({url:'/api/cms/owners/org/content-summary?status=submitted&language=en&q=Submitted'})).json();assert.equal(filtered.total,1);assert.equal(filtered.items[0].id,submitted.id);assert.equal(filtered.counts.all,1);
  f.use('member');const own=(await f.app.inject({url:'/api/cms/owners/org/content-summary?status=draft'})).json();assert.equal(own.total,2);assert.equal(own.items.find((a:any)=>a.id===submitted.id).draft.revisionId,secret.revision.id);
  f.use('outsider');assert.equal((await f.app.inject({url:'/api/cms/owners/org/content-summary'})).statusCode,403);
  assert.equal(mine.language,'zh');
});

test('C02: one source may expose several authorized translations without leaking its hidden working revision',async t=>{
  const f=await appFixture(t),author=f.actors.member;
  const source=await f.content.create(author,articleInput(),'trace');await f.content.submit(author,source.id,source.revision.id,'trace');
  const translations=[];
  for(const title of ['Translation one','Translation two','Private translation']){
    const translation=await f.content.create(author,articleInput('org','zh',title),'trace');await f.content.linkTranslation(author,translation.id,source.id,source.revision.id,'trace');
    if(title!=='Private translation'){await f.content.submit(author,translation.id,translation.revision.id,'trace');translations.push(translation);}
  }
  const hidden=await f.content.edit(author,source.id,source.revision.id,{title:'Hidden source revision'},'trace');
  f.use('admin');const body=(await f.app.inject({url:'/api/cms/owners/org/content-summary'})).json(),item=body.items.find((a:any)=>a.id===source.id);
  assert.equal(item.translations.length,2);assert.deepEqual(new Set(item.translations.map((a:any)=>a.articleId)),new Set(translations.map(a=>a.id)));
  for(const relation of item.translations){assert.equal(relation.sourceArticleId,source.id);assert.equal(relation.sourceRevisionId,source.revision.id);assert.equal(relation.outdated,false);}
  assert.equal(body.counts.outdated,0);assert.ok(!JSON.stringify(body).includes(hidden.revision.id));
  f.use('member');const own=(await f.app.inject({url:'/api/cms/owners/org/content-summary?status=outdated'})).json();assert.equal(own.total,4);assert.equal(own.counts.outdated,4);
  await f.content.submit(author,source.id,hidden.revision.id,'trace');f.use('admin');
  const changed=(await f.app.inject({url:'/api/cms/owners/org/content-summary'})).json();
  assert.equal(changed.items.find((a:any)=>a.id===source.id).translations.length,0,'Historical source pointers are omitted when no longer authorized');
  assert.equal(changed.counts.outdated,0);
});

test('C02: ordinary members receive only live pointers, current revocation applies immediately, and scope never grants a publishing role',async t=>{
  const f=await appFixture(t),author=f.actors.admin;
  const article=await f.content.create(author,articleInput(),'trace');
  f.store.run('INSERT INTO releases VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)','live',article.id,article.revision.id,'org','sealed','publish','published','post','https://blog.example/post/',null,'trace','2026-01-01','2026-01-01');
  const pending=await f.content.edit(author,article.id,article.revision.id,{title:'Hidden pending submission'},'trace');await f.content.submit(author,article.id,pending.revision.id,'trace');
  const draft=await f.content.edit(author,article.id,pending.revision.id,{title:'Hidden current draft'},'trace');
  const response=await f.app.inject({url:'/api/cms/owners/org/content-summary'});assert.equal(response.statusCode,200,response.body);
  const item=response.json().items[0];assert.equal(item.revision.id,article.revision.id);assert.equal(item.draft,null);assert.equal(item.submission,null);assert.deepEqual(item.states,['published']);
  assert.deepEqual(item.capabilities,{canEdit:false,canSubmit:false,canPublish:false});
  for(const hidden of [pending.revision.id,draft.revision.id,'Hidden pending submission','Hidden current draft'])assert.ok(!response.body.includes(hidden));
  f.memberships.delete('member:org');
  for(const entry of ['cms','service'])for(const resource of ['sites','content-summary'])assert.equal((await f.app.inject({url:`/api/${entry}/owners/org/${resource}`})).statusCode,403);
});

test('C02: a historically published source pointer keeps authorized translation metadata stale after a successful source update',async t=>{
  const f=await appFixture(t),author=f.actors.member;f.store.run('INSERT INTO publishers VALUES (?,?)','org','publisher');f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','org-site','org','en','https://blog.example','KEY');
  const source=await f.content.create(author,articleInput(),'trace');await f.content.submit(author,source.id,source.revision.id,'trace');
  const translation=await f.content.create(author,articleInput('org','zh','Translation'),'trace');await f.content.linkTranslation(author,translation.id,source.id,source.revision.id,'trace');await f.content.submit(author,translation.id,translation.revision.id,'trace');
  const service=new PublishingService(f.content,new Vault('ab'.repeat(32))),publisher=f.actors.publisher;
  const worker=new ReleaseWorker(service,{async publish(){return {remoteId:'source',url:'https://blog.example/source/'};},async verify(){return true;},async reconcile(){return null;},async unpublish(){}});
  const confirm=(revisionId:string,action:string,key:string)=>service.confirm(publisher,source.id,{ownerId:'org',revisionId,creditedAuthor:'Member',action,rightsConfirmed:true,idempotencyKey:key},'trace');
  await confirm(source.revision.id,'publish','first');await worker.once();
  const updated=await f.content.edit(author,source.id,source.revision.id,{title:'Updated published source'},'trace');await f.content.submit(author,source.id,updated.revision.id,'trace');
  await confirm(updated.revision.id,'update','second');await worker.once();f.use('publisher');
  const response=await f.app.inject({url:`/api/cms/owners/org/content-summary?articleId=${source.id}`});assert.equal(response.statusCode,200,response.body);
  const summary=response.json();assert.equal(summary.counts.outdated,1);assert.equal(summary.items[0].translations.length,1);
  assert.deepEqual(summary.items[0].translations[0],{articleId:translation.id,language:'zh',sourceArticleId:source.id,sourceRevisionId:source.revision.id,outdated:true});
  const translations=(await f.app.inject({url:'/api/service/owners/org/content-summary?language=zh&status=outdated'})).json();assert.equal(translations.total,1);assert.equal(translations.items[0].id,translation.id);
  await assert.rejects(f.content.get(publisher,source.id,source.revision.id),{code:'FORBIDDEN'},'Historical metadata does not widen the existing body access boundary');
});

test('C02: query validation rejects invalid state, language, pagination and overlong search',async t=>{
  const f=await appFixture(t);
  for(const query of ['status=queued','language=fr','limit=0','limit=101','offset=-1','limit=1.5','articleId=',`articleId=${'x'.repeat(501)}`,`q=${'x'.repeat(501)}`]){
    const response=await f.app.inject({url:`/api/cms/owners/member/content-summary?${query}`});assert.equal(response.statusCode,400,response.body);assert.ok(response.json().traceId);
  }
});

test('C02: articleId filters the authorized owner set and retains complete translation edges beyond pagination',async t=>{
  const f=await appFixture(t),author=f.actors.member;
  const source=await f.content.create(author,articleInput(),'trace');await f.content.submit(author,source.id,source.revision.id,'trace');
  const translation=await f.content.create(author,articleInput('org','zh'),'trace');await f.content.linkTranslation(author,translation.id,source.id,source.revision.id,'trace');await f.content.submit(author,translation.id,translation.revision.id,'trace');
  const hidden=await f.content.create(author,articleInput('org','en','Never submitted'),'trace');
  const personal=await f.content.create(f.actors.solo,articleInput('solo'),'trace');
  f.use('admin');
  for(const entry of ['cms','service']){
    const body=(await f.app.inject({url:`/api/${entry}/owners/org/content-summary?articleId=${source.id}&limit=1`})).json();
    assert.equal(body.total,1);assert.equal(body.counts.all,1);assert.equal(body.items[0].id,source.id);assert.equal(body.items[0].translations[0].articleId,translation.id);
    for(const inaccessible of [personal.id,hidden.id,'not-an-article']){
      const empty=(await f.app.inject({url:`/api/${entry}/owners/org/content-summary?articleId=${inaccessible}`})).json();
      assert.deepEqual(empty.items,[]);assert.equal(empty.total,0);assert.deepEqual(empty.counts,{all:0,draft:0,submitted:0,published:0,outdated:0});
    }
  }
});

test('C02: exact successful revision fulfills durably; a newer submission stays pending and unpublish never revives fulfilled work',async t=>{
  const f=fixture();t.after(()=>f.store.close());f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site','member','en','https://blog.example','KEY');
  const service=new PublishingService(f.content,new Vault('ab'.repeat(32))),actor=f.actors.member;
  const article=await f.content.create(actor,articleInput('member'),'trace');await f.content.submit(actor,article.id,article.revision.id,'trace');
  const confirm=(revisionId:string,action:string,key:string)=>service.confirm(actor,article.id,{ownerId:'member',revisionId,creditedAuthor:'Member',action,rightsConfirmed:true,idempotencyKey:key},'trace');
  const original=await confirm(article.revision.id,'publish','first');
  const newer=await f.content.edit(actor,article.id,article.revision.id,{title:'New submission'},'trace');await f.content.submit(actor,article.id,newer.revision.id,'trace');
  const adapter:OriginalAdapter={async publish(){return {remoteId:'post',url:'https://blog.example/post/'};},async verify(){return true;},async reconcile(){return {remoteId:'post',url:'https://blog.example/post/'};},async unpublish(){}};
  const worker=new ReleaseWorker(service,adapter);await worker.once();
  assert.equal(f.store.get('SELECT release_id FROM submission_fulfillments WHERE article_id=? AND revision_id=?',article.id,article.revision.id)?.release_id,original.id);
  assert.equal(f.store.get('SELECT release_id FROM submission_fulfillments WHERE article_id=? AND revision_id=?',article.id,newer.revision.id),undefined);
  const app=await createApp({...f,vault:service.vault,publicUrl:'https://cms.example',authenticate:async()=>actor});t.after(()=>app.close());
  let summary=(await app.inject({url:'/api/cms/owners/member/content-summary'})).json().items[0];
  assert.equal(summary.submission.status,'pending');assert.deepEqual(summary.states,['submitted','published']);
  const update=await confirm(newer.revision.id,'update','newer');await worker.once();
  assert.equal(f.store.get('SELECT release_id FROM submission_fulfillments WHERE article_id=? AND revision_id=?',article.id,newer.revision.id)?.release_id,update.id);
  await f.content.submit(actor,article.id,newer.revision.id,'again');assert.equal(f.store.get('SELECT count(*) n FROM submission_history WHERE article_id=?',article.id)!.n,3);
  summary=(await app.inject({url:'/api/cms/owners/member/content-summary'})).json().items[0];
  assert.deepEqual(summary.states,['published']);assert.equal(summary.submission.status,'fulfilled');assert.equal(summary.submission.fulfilledByReleaseId,update.id);
  await confirm(newer.revision.id,'unpublish','remove');await worker.once();
  assert.equal(f.store.get('SELECT release_id FROM submission_fulfillments WHERE article_id=? AND revision_id=?',article.id,newer.revision.id)?.release_id,update.id);
  assert.equal(f.store.get('SELECT count(*) n FROM submission_fulfillments WHERE article_id=?',article.id)!.n,2);
  summary=(await app.inject({url:'/api/cms/owners/member/content-summary'})).json().items[0];assert.deepEqual(summary.states,['draft']);assert.equal(summary.submission.status,'fulfilled');
});

test('C02: failed and cancelled publication do not fulfill submissions',async t=>{
  const f=fixture();t.after(()=>f.store.close());f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site','member','en','https://blog.example','KEY');
  const service=new PublishingService(f.content,new Vault('ab'.repeat(32))),actor=f.actors.member;
  const article=await f.content.create(actor,articleInput('member'),'trace');await f.content.submit(actor,article.id,article.revision.id,'trace');
  const confirm=(key:string)=>service.confirm(actor,article.id,{ownerId:'member',revisionId:article.revision.id,creditedAuthor:'Member',action:'publish',rightsConfirmed:true,idempotencyKey:key},'trace');
  const cancelled=await confirm('cancelled');await service.cancel(actor,cancelled.id,'trace');
  await confirm('failed');await new ReleaseWorker(service,{async publish(){throw Error('rejected');},async verify(){return false;},async reconcile(){return null;},async unpublish(){}}).once();
  assert.equal(f.store.get('SELECT count(*) n FROM submission_fulfillments')!.n,0);
});

test('C02: additive versioned migration preserves legacy pointers and trusts only successful non-unpublish releases',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'cms-submission-migration-')),path=join(directory,'cms.sqlite');t.after(()=>rmSync(directory,{recursive:true,force:true}));
  let store=new Store(path);store.createOwner('owner','personal','issuer','subject');
  store.run('INSERT INTO articles VALUES (?,?,?,?,?,?)','article','owner','en','subject',null,'2026-01-01');
  for(const id of ['success','old-success','failed','unknown','unpublish'])store.run('INSERT INTO revisions VALUES (?,?,?,?,?,?,?,?)',id,'article',id,Buffer.from(id),id,'Author','subject','2026-01-01');
  store.run('UPDATE articles SET current_revision=? WHERE id=?','unknown','article');store.run('INSERT INTO submissions VALUES (?,?,?,?)','article','unknown','subject','2026-01-02');
  for(const [id,state,action] of [['success','published','publish'],['old-success','superseded','update'],['failed','failed','publish'],['unknown','uncertain','publish'],['unpublish','superseded','unpublish']])store.run('INSERT INTO releases VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',id,'article',id,'owner','sealed',action,state,'remote','https://blog.example/post/',null,'trace','2026-01-03','2026-01-04');
  store.db.exec('DROP TABLE IF EXISTS submission_fulfillments; DROP TABLE IF EXISTS submission_history; DELETE FROM migrations WHERE version>=2');store.close();
  store=new Store(path);
  assert.equal(store.get('SELECT revision_id FROM submissions WHERE article_id=?','article')!.revision_id,'unknown');
  assert.deepEqual(store.all('SELECT revision_id FROM submission_fulfillments ORDER BY revision_id').map(r=>r.revision_id),['old-success','success']);
  assert.equal(store.get('SELECT count(*) n FROM submission_history')!.n,1);assert.ok(store.get('SELECT 1 FROM migrations WHERE version=2'));store.close();
  store=new Store(path);assert.equal(store.get('SELECT count(*) n FROM submission_fulfillments')!.n,2);assert.equal(store.get('SELECT count(*) n FROM submission_history')!.n,1);store.close();
});

test('C01/C02/C04: service OpenAPI describes concrete safe DTOs, nullable pointers and documented filters',async t=>{
  const f=await appFixture(t),spec=(await f.app.inject({url:'/openapi.json'})).json();
  const me=spec.paths['/api/service/me'].get.responses['200'].content['application/json'].schema;
  assert.ok(me.required.includes('organizationDirectory'));assert.ok(me.properties.workspaces.items.required.includes('capabilities'));
  const operation=spec.paths['/api/service/owners/{id}/content-summary'].get,schema=operation.responses['200'].content['application/json'].schema;
  assert.equal(schema.type,'object');assert.deepEqual(schema.properties.items.items.properties.states.items.enum,['draft','submitted','published','outdated']);
  assert.equal(schema.properties.items.items.properties.revision.additionalProperties,false);assert.ok(!('markdown' in schema.properties.items.items.properties.revision.properties));
  assert.ok(schema.properties.items.items.properties.submission.anyOf.some((variant:any)=>variant.type==='null'));
  assert.deepEqual(operation.parameters.find((p:any)=>p.name==='status').schema.enum,['all','draft','submitted','published','outdated']);
  const sites=spec.paths['/api/service/owners/{id}/sites'].get.responses['200'].content['application/json'].schema;
  assert.equal(sites.properties.sites.items.properties.verification.properties.status.enum[0],'unknown');
});
