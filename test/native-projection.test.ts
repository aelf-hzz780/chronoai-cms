import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers.ts';
import {Vault} from '../src/vault.ts';
import {PublishingService,ReleaseWorker} from '../src/publishing.ts';
import {AlternateService,AlternateWorker} from '../src/alternates.ts';
import {RemoteError} from '../src/http-client.ts';

async function setup(t:any){
  const f=fixture();t.after(()=>f.store.close());
  const pub=new PublishingService(f.content,new Vault('ab'.repeat(32))),alts=new AlternateService(pub);
  f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','en','solo','en','http://localhost:39001','KEY');
  f.store.run('INSERT INTO site_admin_routes VALUES (?,?)','en','http://localhost:39002');
  f.store.run('INSERT INTO author_mappings VALUES (?,?,?)','en','solo','author');
  const article=await f.content.create(f.actors.solo,{ownerId:'solo',language:'en',title:'Frozen',markdown:'Frozen content',creditedAuthor:'solo'},'draft');
  const release=await pub.confirm(f.actors.solo,article.id,{ownerId:'solo',revisionId:article.revision.id,creditedAuthor:'solo',action:'publish',rightsConfirmed:true,idempotencyKey:'first'},'confirm');
  await new ReleaseWorker(pub,{async publish(input){await input.beforeWrite!();return {remoteId:'original',url:'http://localhost:39001/post/'};},async verify(){return true;},async reconcile(){return null;},async unpublish(){}}).once();
  const projection=f.store.get('SELECT * FROM projections')!;
  return {...f,pub,alts,article,release,projection};
}

test('derived and explicit projections never follow changed site, admin route, credited author or existing post identities',async t=>{
  for(const explicit of [false,true])for(const field of ['site','admin-route','author','remote-id']){
    const f=await setup(t);let writes=0;
    const worker=new AlternateWorker(f.alts,{async alternates(input){await input.beforeWrite!();writes++;}});
    let projection=f.projection;
    if(explicit){await worker.once();writes=0;projection=await f.alts.request(f.actors.solo,f.article.id,'explicit');}
    if(field==='site')f.store.run("UPDATE sites SET url='http://localhost:39101' WHERE id='en'");
    if(field==='admin-route')f.store.run("UPDATE site_admin_routes SET base_url='http://localhost:39102' WHERE site_id='en'");
    if(field==='author')f.store.run("UPDATE author_mappings SET ghost_author_id='replacement' WHERE site_id='en'");
    if(field==='remote-id')f.store.run("UPDATE releases SET remote_id='another-post' WHERE id=?",f.release.id);
    await worker.once();
    assert.equal(writes,0,`${explicit?'explicit':'derived'} ${field} must not dispatch`);
    assert.equal(f.store.get('SELECT error_code FROM projections WHERE id=?',projection.id)!.error_code,'PROJECTION_SCOPE_CHANGED');
    assert.equal(f.store.get('SELECT count(*) n FROM projection_retries')!.n,0);
  }
});

test('projection rechecks frozen configuration after the final asynchronous permission check',async t=>{
  const f=await setup(t);let inFinalCheck=false,writes=0;
  f.policy.authority.validate=async()=>{await Promise.resolve();if(inFinalCheck)f.store.run("UPDATE site_admin_routes SET base_url='http://localhost:39102' WHERE site_id='en'");};
  await new AlternateWorker(f.alts,{async alternates(input){inFinalCheck=true;await input.beforeWrite!();writes++;}}).once();
  assert.equal(writes,0);assert.equal(f.store.get('SELECT error_code FROM projections WHERE id=?',f.projection.id)!.error_code,'PROJECTION_SCOPE_CHANGED');
});

test('a durable metadata correction retains its original scope across worker restart and cannot adopt a new route',async t=>{
  const f=await setup(t);let writes=0;
  await new AlternateWorker(f.alts,{async alternates(input){await input.beforeWrite!();writes++;throw new RemoteError('REMOTE_UNCERTAIN','Response lost',true);}}).once();
  assert.equal(writes,1);
  const correction=f.store.get('SELECT * FROM projection_retries')!;assert.ok(correction);
  f.store.run("UPDATE site_admin_routes SET base_url='http://localhost:39102' WHERE site_id='en'");
  await new AlternateWorker(f.alts,{async alternates(input){await input.beforeWrite!();writes++;}}).once();
  assert.equal(writes,1);assert.equal(f.store.get('SELECT error_code FROM projections WHERE id=?',correction.projection_id)!.error_code,'PROJECTION_SCOPE_CHANGED');
});

test('projection scope cannot expand to a new translation but may remove retired targets and their links',async t=>{
  const f=await setup(t);
  f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','zh','solo','zh','http://localhost:39003','KEY');
  f.store.run('INSERT INTO author_mappings VALUES (?,?,?)','zh','solo','author');
  const translation=await f.content.create(f.actors.solo,{ownerId:'solo',language:'zh',title:'Translation',markdown:'Confirmed translation',creditedAuthor:'solo'},'draft-zh');
  await f.content.linkTranslation(f.actors.solo,translation.id,f.article.id,f.article.revision.id,'link');
  const release=await f.pub.confirm(f.actors.solo,translation.id,{ownerId:'solo',revisionId:translation.revision.id,creditedAuthor:'solo',action:'publish',rightsConfirmed:true,idempotencyKey:'translation'},'confirm-zh');
  await new ReleaseWorker(f.pub,{async publish(input){await input.beforeWrite!();return {remoteId:'translation',url:'http://localhost:39003/post/'};},async verify(){return true;},async reconcile(){return null;},async unpublish(){}}).once();
  const writes:{articleId:string;links:any[]}[]=[];
  const worker=new AlternateWorker(f.alts,{async alternates(input,links){await input.beforeWrite!();writes.push({articleId:input.articleId,links});}});
  await worker.once();assert.equal(writes.length,0);
  assert.equal(f.store.get('SELECT error_code FROM projections WHERE id=?',f.projection.id)!.error_code,'PROJECTION_SCOPE_CHANGED');
  await worker.once();assert.equal(writes.length,2,'The newly confirmed translation authorizes its own exact affected set');
  const request=await f.alts.request(f.actors.solo,f.article.id,'explicit-full-scope');writes.length=0;
  f.store.run("UPDATE releases SET state='unpublished' WHERE id=?",release.id);
  await new AlternateWorker(f.alts,{async alternates(input,links){await input.beforeWrite!();writes.push({articleId:input.articleId,links});}}).once();
  assert.deepEqual(writes,[{articleId:f.article.id,links:[]}]);
  assert.equal(f.store.get('SELECT state FROM projections WHERE id=?',request.id)!.state,'complete');
});
