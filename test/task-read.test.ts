import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers.ts';
import {createApp} from '../src/app.ts';
import {Vault} from '../src/vault.ts';
import {MediaService} from '../src/media.ts';
import {digest} from '../src/content.ts';
import {NyxAuthority} from '../src/nyxid.ts';
import type {Config} from '../src/config.ts';

const input=(ownerId='org')=>({ownerId,language:'en',title:'Confirmed source',markdown:'Confirmed text',creditedAuthor:'Member'});
async function taskFixture(t:any){
  const f=fixture();let actor=f.actors.admin;const vault=new Vault('ab'.repeat(32));
  const app=await createApp({...f,vault,publicUrl:'https://cms.example',authenticate:async()=>actor});t.after(async()=>{await app.close();f.store.close();});
  f.store.run('INSERT INTO publishers VALUES (?,?)','org','publisher');
  const article=await f.content.create(f.actors.member,input(),'create');
  let serial=0;
  const release=(state='queued',revision=article.revision.id,action='publish')=>{
    const id=`release-${++serial}`,date=`2026-10-${String(serial).padStart(2,'0')}T00:00:00.000Z`;
    f.store.run('INSERT INTO releases VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',id,article.id,revision,'org','PRIVATE_ACTOR',action,state,state==='queued'?null:'remote',state==='queued'?null:'https://blog.example/post/',null,'release-trace',date,date);
    f.store.run('INSERT INTO jobs VALUES (?,?,?,?,?,?)',`job-${id}`,'release',id,state==='queued'?'queued':'done',null,date);
    f.store.audit('publisher','org',`original.${state}`,id,'history-trace',{code:null,credential:'DO_NOT_EXPOSE',token:'PRIVATE_APPROVAL'});
    return id;
  };
  const delivery=(releaseId:string,state='queued',markdown='Frozen excerpt body')=>{
    const id=`delivery-${++serial}`,date=`2026-10-${String(serial).padStart(2,'0')}T00:00:00.000Z`;
    f.store.run('INSERT INTO deliveries VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,releaseId,'org','PRIVATE_CONNECTION','dev','create','excerpt','exact-confirmation-digest',state,null,null,'PRIVATE_APPROVAL',null,null,'delivery-trace',date,date);
    f.store.run('INSERT INTO delivery_payloads VALUES (?,?,?)',id,'PRIVATE_ACTOR',JSON.stringify({title:'Frozen copy title',markdown,creditedAuthor:'Frozen author',sourceDigest:article.revision.digest,accountId:'PRIVATE_ACCOUNT',connectionFingerprint:'PRIVATE_CONNECTION_FINGERPRINT',unexpected:'DO_NOT_EXPOSE'}));
    f.store.run('INSERT INTO delivery_events VALUES (?,?,?,?,?,?)',`event-${id}`,id,state,null,'event-trace',date);
    return id;
  };
  const media=(releaseId:string)=>{
    const id=`media-${++serial}`,date=`2026-10-${String(serial).padStart(2,'0')}T00:00:00.000Z`;
    f.store.run('INSERT INTO release_media_requests VALUES (?,?,?,?,?,?,?,?,?,?,?)',id,releaseId,article.revision.id,'media-confirmation','PRIVATE_ACTOR','media-trace','partial',1,'IMAGE_UNVERIFIED',date,date);return id;
  };
  const projection=()=>{
    const id=`projection-${++serial}`,date=`2026-10-${String(serial).padStart(2,'0')}T00:00:00.000Z`;
    f.store.run('INSERT INTO projections VALUES (?,?,?,?,?,?,?)',id,article.id,'org','PRIVATE_ACTOR','queued',null,'projection-trace');f.store.run('INSERT INTO jobs VALUES (?,?,?,?,?,?)',`job-${id}`,'projection',id,'queued',null,date);return id;
  };
  return {...f,app,vault,article,release,delivery,media,projection,use(subject:string){actor=f.actors[subject];},actor(value:typeof actor){actor=value;}};
}

test('C03: shared task lists authorize before filtering/counting/paging and never return actor/payload secrets or hidden drafts',async t=>{
  const f=await taskFixture(t),first=f.release(),live=f.release('published'),copy=f.delivery(live),media=f.media(first),projection=f.projection();
  const edited=await f.content.edit(f.actors.member,f.article.id,f.article.revision.id,{title:'HIDDEN NEW DRAFT',markdown:'HIDDEN MARKDOWN'},'edit');
  let lookups=0;const previous=f.policy.authority.membership.bind(f.policy.authority);f.policy.authority.membership=async(...args)=>{lookups++;return previous(...args);};
  for(const entry of ['cms','service']){
    lookups=0;const response=await f.app.inject({url:`/api/${entry}/owners/org/tasks?limit=2&offset=1`});assert.equal(response.statusCode,200,response.body);assert.equal(lookups,1);
    const body=response.json();assert.equal(body.total,5);assert.equal(body.items.length,2);assert.equal(body.limit,2);assert.equal(body.offset,1);
    for(const item of body.items){for(const key of ['id','kind','ownerId','articleId','language','title','revisionId','action','state','createdAt','updatedAt','traceId','errorCode','url','allowedActions'])assert.ok(key in item,key);}
    assert.doesNotMatch(response.body,new RegExp([edited.revision.id,'HIDDEN NEW DRAFT','HIDDEN MARKDOWN','PRIVATE_ACTOR','payload_json','actor_json'].join('|')));
    const filtered=(await f.app.inject({url:`/api/${entry}/owners/org/tasks?kind=delivery&state=queued&language=en&articleId=${f.article.id}`})).json();assert.equal(filtered.total,1);assert.equal(filtered.items[0].id,copy);
    const plan=(await f.app.inject({url:`/api/${entry}/owners/org/tasks?kind=plan`})).json();assert.equal(plan.total,0);assert.deepEqual(plan.items,[]);
  }
  assert.ok(media&&projection);
});

test('C03: creator and current Publisher may read exact confirmed old revisions; other members need exact successful publication evidence',async t=>{
  const f=await taskFixture(t),privateRelease=f.release(),copy=f.delivery(privateRelease),media=f.media(privateRelease),projection=f.projection();
  const current=await f.content.edit(f.actors.member,f.article.id,f.article.revision.id,{title:'Current private draft'},'edit');await f.content.submit(f.actors.member,f.article.id,current.revision.id,'submit');
  for(const subject of ['member','publisher','admin']){
    f.use(subject);const detail=await f.app.inject({url:`/api/cms/owners/org/tasks/release/${privateRelease}`});assert.equal(detail.statusCode,200,detail.body);assert.equal(detail.json().snapshot.revisionId,f.article.revision.id);assert.equal(detail.json().snapshot.markdown,'Confirmed text');assert.equal(detail.json().confirmationDigest,null);
  }
  f.memberships.set('outsider:org','member');f.use('outsider');
  const empty=(await f.app.inject({url:'/api/cms/owners/org/tasks'})).json();assert.equal(empty.total,0);
  for(const [kind,id] of [['release',privateRelease],['delivery',copy],['media',media],['projection',projection]])assert.equal((await f.app.inject({url:`/api/cms/owners/org/tasks/${kind}/${id}`})).statusCode,403);
  f.release('superseded');const visible=(await f.app.inject({url:'/api/cms/owners/org/tasks'})).json();assert.equal(visible.total,4,'The projection still has no exact frozen revision proof');
  const detail=(await f.app.inject({url:`/api/service/owners/org/tasks/delivery/${copy}`})).json();assert.equal(detail.copy.connectionId,null);assert.equal(detail.snapshot,null);assert.equal(detail.confirmationDigest,null);assert.doesNotMatch(JSON.stringify(detail),/PRIVATE_ACTOR|PRIVATE_CONNECTION|PRIVATE_ACCOUNT|PRIVATE_APPROVAL|DO_NOT_EXPOSE|payload_json|actor_json/);
  f.memberships.delete('outsider:org');assert.equal((await f.app.inject({url:`/api/cms/owners/org/tasks/release/${privateRelease}`})).statusCode,403);
});

test('C03: source publication never exposes a Publisher private excerpt to ordinary members or the original creator',async t=>{
  const f=await taskFixture(t),source=f.release('published'),media=new MediaService(f.content),bytes=Buffer.from('89504e470d0a1a0a00','hex');
  const image=await media.upload(f.actors.member,f.article.id,'image/png',bytes.toString('base64'),'image');
  const markdown=`Publisher private excerpt\n${image.markdown}`,copy=f.delivery(source,'queued',markdown);f.memberships.set('outsider:org','member');
  for(const subject of ['member','outsider']){
    f.use(subject);const response=await f.app.inject({url:`/api/cms/owners/org/tasks/delivery/${copy}`});assert.equal(response.statusCode,200,response.body);assert.equal(response.json().snapshot,null);assert.equal(response.json().confirmationDigest,null);assert.doesNotMatch(response.body,/Publisher private excerpt|exact-confirmation-digest/);
    assert.equal((await f.app.inject({url:`/api/cms/owners/org/tasks/delivery/${copy}/assets/${image.id}`})).statusCode,403);
  }
  f.use('publisher');assert.equal((await f.app.inject({url:`/api/cms/owners/org/tasks/delivery/${copy}`})).json().snapshot.markdown,markdown);
  f.store.run("UPDATE deliveries SET state='published' WHERE id=?",copy);f.use('member');let detail=(await f.app.inject({url:`/api/cms/owners/org/tasks/delivery/${copy}`})).json();assert.equal(detail.snapshot.markdown,markdown);assert.equal(detail.snapshot.digest,digest(markdown));assert.equal(detail.confirmationDigest,'exact-confirmation-digest');
  f.store.run('INSERT INTO delivery_events VALUES (?,?,?,?,?,?)','published-proof',copy,'published',null,'published-trace','2026-10-10');f.store.run("UPDATE deliveries SET state='superseded' WHERE id=?",copy);
  f.use('outsider');detail=(await f.app.inject({url:`/api/service/owners/org/tasks/delivery/${copy}`})).json();assert.equal(detail.snapshot.markdown,markdown);assert.equal(detail.copy.connectionId,null);
});

test('C03: safe snapshots/history and current capability hints never pretend a projection is fixed content or a running job cancellable',async t=>{
  const f=await taskFixture(t),release=f.release(),copy=f.delivery(release,'approval_needed'),projection=f.projection();
  f.use('publisher');let detail=(await f.app.inject({url:`/api/cms/owners/org/tasks/release/${release}`})).json();assert.deepEqual(detail.allowedActions,['cancel']);assert.ok(detail.history.some((e:any)=>e.traceId==='history-trace'));assert.doesNotMatch(JSON.stringify(detail),/DO_NOT_EXPOSE|PRIVATE_APPROVAL/);
  f.store.run("UPDATE jobs SET state='running' WHERE resource_id=?",release);detail=(await f.app.inject({url:`/api/cms/owners/org/tasks/release/${release}`})).json();assert.deepEqual(detail.allowedActions,[]);
  f.store.run("UPDATE jobs SET state='done' WHERE resource_id=?",release);f.store.run("UPDATE releases SET state='uncertain',remote_id='known',url='https://blog.example/post/' WHERE id=?",release);
  detail=(await f.app.inject({url:`/api/cms/owners/org/tasks/release/${release}`})).json();assert.deepEqual(detail.allowedActions,['reconcile','materialize-media']);
  const delivery=(await f.app.inject({url:`/api/cms/owners/org/tasks/delivery/${copy}`})).json();assert.deepEqual(delivery.allowedActions,['cancel','request-approval','authorize']);assert.equal(delivery.copy.connectionId,'PRIVATE_CONNECTION');assert.equal(delivery.snapshot.title,'Frozen copy title');assert.equal(delivery.snapshot.creditedAuthor,'Frozen author');
  const projected=(await f.app.inject({url:`/api/cms/owners/org/tasks/projection/${projection}`})).json();assert.equal(projected.snapshot,null);assert.equal(projected.revisionId,null);assert.equal(projected.action,'sync-links');
  f.actor({...f.actors.publisher,scopes:['content:read']});detail=(await f.app.inject({url:`/api/cms/owners/org/tasks/release/${release}`})).json();assert.deepEqual(detail.allowedActions,[]);
});

test('C03: task assets bind to exact task Markdown and survive a newer submitted revision without opening unrelated images',async t=>{
  const f=await taskFixture(t),mediaService=new MediaService(f.content),bytes=Buffer.from('89504e470d0a1a0a00','hex');
  const image=await mediaService.upload(f.actors.member,f.article.id,'image/png',bytes.toString('base64'),'image'),unreferenced=await mediaService.upload(f.actors.member,f.article.id,'image/png',bytes.toString('base64'),'other-image');
  const withImage=await f.content.edit(f.actors.member,f.article.id,f.article.revision.id,{markdown:`Confirmed text\n${image.markdown}`},'with-image'),release=f.release('verifying',withImage.revision.id);
  const newer=await f.content.edit(f.actors.member,f.article.id,withImage.revision.id,{markdown:'New submitted draft without image'},'newer');await f.content.submit(f.actors.member,f.article.id,newer.revision.id,'submit');
  f.use('publisher');assert.equal((await f.app.inject({url:`/api/cms/assets/${image.id}`})).statusCode,403);
  for(const entry of ['cms','service']){
    const response=await f.app.inject({url:`/api/${entry}/owners/org/tasks/release/${release}/assets/${image.id}`});assert.equal(response.statusCode,200,response.body);assert.deepEqual(response.rawPayload,bytes);assert.match(String(response.headers['content-type']),/image\/png/);
    assert.equal((await f.app.inject({url:`/api/${entry}/owners/org/tasks/release/${release}/assets/${unreferenced.id}`})).statusCode,403);
  }
  const excerpt=f.delivery(release,'queued',`Published URL only: https://blog.example/image.png`);assert.equal((await f.app.inject({url:`/api/cms/owners/org/tasks/delivery/${excerpt}/assets/${image.id}`})).statusCode,403);
  for(const markdown of [`Literal asset:${image.id}`,`\`![image](asset:${image.id})\``,`![image](/api/cms/assets/${image.id})`]){
    const notReferenced=f.delivery(release,'queued',markdown);assert.equal((await f.app.inject({url:`/api/cms/owners/org/tasks/delivery/${notReferenced}/assets/${image.id}`})).statusCode,403);
  }
  const materialization=f.media(release);f.store.run('UPDATE release_media_requests SET revision_id=? WHERE id=?',withImage.revision.id,materialization);
  assert.equal((await f.app.inject({url:`/api/cms/owners/org/tasks/media/${materialization}/assets/${image.id}`})).statusCode,200);
  const foreign=await f.content.create(f.actors.solo,input('solo'),'solo');const other=await mediaService.upload(f.actors.solo,foreign.id,'image/png',bytes.toString('base64'),'solo-image');assert.equal((await f.app.inject({url:`/api/cms/owners/org/tasks/release/${release}/assets/${other.id}`})).statusCode,403);
  f.memberships.delete('publisher:org');assert.equal((await f.app.inject({url:`/api/cms/owners/org/tasks/release/${release}/assets/${image.id}`})).statusCode,403);
});

test('C03: invalid filters, wrong-owner detail and unknown tasks do not reveal data',async t=>{
  const f=await taskFixture(t),id=f.release();
  for(const query of ['kind=invalid','language=fr','limit=0','limit=101','offset=-1','state=','articleId='])assert.equal((await f.app.inject({url:`/api/cms/owners/org/tasks?${query}`})).statusCode,400,query);
  assert.equal((await f.app.inject({url:`/api/cms/owners/admin/tasks/release/${id}`})).statusCode,404);
  for(const kind of ['plan','release'])assert.equal((await f.app.inject({url:`/api/cms/owners/org/tasks/${kind}/not-a-task`})).statusCode,404);
});

test('C03: failed, uncertain and unpublish records are not successful publication proof; corrupt delivery snapshots fail safely',async t=>{
  const f=await taskFixture(t),id=f.release(),copy=f.delivery(id);
  f.release('failed');f.release('uncertain');f.release('superseded',f.article.revision.id,'unpublish');f.memberships.set('outsider:org','member');f.use('outsider');
  assert.equal((await f.app.inject({url:'/api/cms/owners/org/tasks'})).json().total,0);
  f.use('publisher');f.store.run('UPDATE delivery_payloads SET payload_json=? WHERE delivery_id=?','{PRIVATE_ACCOUNT',copy);
  const response=await f.app.inject({url:`/api/cms/owners/org/tasks/delivery/${copy}`});assert.equal(response.statusCode,503);assert.equal(response.json().code,'TASK_SNAPSHOT_UNAVAILABLE');assert.ok(response.json().traceId);assert.doesNotMatch(response.body,/PRIVATE_ACCOUNT/);
});

test('C03: declared task DTOs describe exact snapshot/confirmation digests and task-scoped image media',async t=>{
  const f=await taskFixture(t),spec=(await f.app.inject({url:'/openapi.json'})).json();
  const list=spec.paths['/api/service/owners/{id}/tasks'].get;assert.equal(list.operationId,'listOwnerTasks');assert.ok(list.responses['200'].content['application/json'].schema.properties.items);
  const detail=spec.paths['/api/service/owners/{id}/tasks/{kind}/{taskId}'].get,schema=detail.responses['200'].content['application/json'].schema;
  assert.ok(schema.required.includes('confirmationDigest'));assert.ok(schema.properties.snapshot.anyOf.some((part:any)=>part.type==='null'));assert.ok(!('payload_json' in schema.properties));assert.ok(!('actor_json' in schema.properties));
  assert.deepEqual(detail.parameters.find((parameter:any)=>parameter.name==='kind').schema.enum,['release','delivery','media','projection','plan']);
  assert.equal(spec.paths['/api/service/owners/{id}/tasks/{kind}/{taskId}/assets/{assetId}'].get.responses['200'].content['image/png'].schema.format,'binary');
});

test('C01: directory reuses one bulk inventory, fails closed on its outage, and supports legacy authorities',async t=>{
  const f=await taskFixture(t);for(let i=0;i<8;i++)f.store.createOwner(`org-${i}`,'organization',f.actors.admin.issuer,`org-${i}`);
  let calls=0;f.policy.authority.organizationRoles=async()=>{calls++;return new Map([['org','admin'],['org-1','member']]);};f.policy.authority.membership=async()=>{throw Error('Per-owner lookup must not run');};
  let response=await f.app.inject({url:'/api/cms/me'});assert.equal(response.statusCode,200,response.body);assert.equal(calls,1);assert.deepEqual(response.json().workspaces.map((w:any)=>w.id),['admin','org','org-1']);
  f.policy.authority.organizationRoles=async()=>{throw Error('Inventory unavailable');};response=await f.app.inject({url:'/api/cms/me'});assert.equal(response.statusCode,200,response.body);assert.deepEqual(response.json().workspaces.map((w:any)=>w.id),['admin']);assert.equal(response.json().organizationDirectory.status,'unavailable');
  delete f.policy.authority.organizationRoles;f.policy.authority.membership=async(_actor,organization)=>organization==='org'?'admin':null;response=await f.app.inject({url:'/api/cms/me'});assert.equal(response.statusCode,200);assert.equal(response.json().organizationDirectory.status,'available');
});

test('C01: production organization inventory is strictly checked and unknown roles never grant membership',async()=>{
  const f=fixture(),authority=new NyxAuthority({} as Config);try{
    let calls=0,value:unknown={orgs:[{id:'a',your_role:'admin'},{id:'b',your_role:'member'},{id:'c',your_role:'viewer'}]};authority.call=async()=>{calls++;return value;};
    assert.deepEqual(await authority.organizationRoles(f.actors.admin),new Map([['a','admin'],['b','member']]));assert.equal(calls,1);
    for(const invalid of [{orgs:null},{orgs:[null]},{orgs:[{id:'',your_role:'admin'}]},{orgs:[{id:'a'}]},{orgs:[{id:'a',your_role:'admin'},{id:'a',your_role:'member'}]}]){value=invalid;await assert.rejects(authority.organizationRoles(f.actors.admin),{code:'NYXID_CONTRACT'});}
  }finally{f.store.close();}
});
