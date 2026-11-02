// Safe Ghost adapter fixture: mocked GETs, private temp directories, no live stack.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fixture} from './helpers.ts';
import {Vault} from '../src/vault.ts';
import {PublishingService,ReleaseWorker} from '../src/publishing.ts';
import {GhostAdapter} from '../src/ghost.ts';
import {MediaService} from '../src/media.ts';
import {AppError} from '../src/errors.ts';
import {createApp} from '../src/app.ts';

async function mediaFixture(t:any){
 const f=fixture(),directory=await mkdtemp(join(tmpdir(),'blog-media-authority-')),vault=new Vault('ab'.repeat(32)),pub=new PublishingService(f.content,vault);
 t.after(async()=>{f.store.close();await rm(directory,{recursive:true,force:true});});
 f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site','solo','en','http://localhost:3999','KEY');f.store.run('INSERT INTO author_mappings VALUES (?,?,?)','site','solo','author');
 let article=await f.content.create(f.actors.solo,{ownerId:'solo',language:'en',title:'Confirmed images',markdown:'Exact body',creditedAuthor:'solo'},'draft');
 const media=new MediaService(f.content),assets=[];
 for(let i=0;i<2;i++)assets.push(await media.upload(f.actors.solo,article.id,'image/png',Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.from([i])]).toString('base64'),'asset'));
 article=await f.content.edit(f.actors.solo,article.id,article.revision.id,{markdown:'Exact body\n\n'+assets.map(a=>a.markdown).join('\n\n')},'revision');
 const release=await pub.confirm(f.actors.solo,article.id,{ownerId:'solo',revisionId:article.revision.id,creditedAuthor:'solo',rightsConfirmed:true,action:'publish',idempotencyKey:'original'},'original');
 const ghost=new GhostAdapter(f.store,directory,true,{},undefined,{async verify(){return true;}}),result={remoteId:'known',url:'http://localhost:3999/post/'};
 const input=pub.input(release),html=ghost.controlledHtml(input);let corrupt=false;
 ghost.current=async()=>({id:'known',url:result.url,title:input.title,status:'published',html,authors:[{id:'author'}]});
 t.mock.method(globalThis,'fetch',async(url:any,options:any)=>{
  assert.ok(!options?.method||options.method==='GET','Fixture never permits a Ghost/provider write');
  if(String(url)===result.url)return new Response(`<html lang="en"><h1>${input.title}</h1>${ghost.publisherHtml(input)}${corrupt?'Changed':html}</html>`);
  const image=ghost.images(input).find(i=>i.url===String(url));assert.ok(image);
  try{return new Response(await readFile(join(directory,'site',image.filename)),{headers:{'content-type':image.mime}});}catch(error:any){if(error.code==='ENOENT')return new Response('',{status:404});throw error;}
 });
 const publicFiles=async()=>{try{return await readdir(join(directory,'site'));}catch(error:any){if(error.code==='ENOENT')return [];throw error;}};
 return {...f,vault,pub,ghost,input,result,release,article,directory,publicFiles,setCorrupt:(value:boolean)=>{corrupt=value;}};
}

test('R031: Ghost verify cannot create public image files or mappings',async t=>{
 const f=await mediaFixture(t);let authorityChecks=0;
 f.input.beforeWrite=async()=>{authorityChecks++;throw new AppError(403,'SOURCE_REVOKED','Revoked');};
 assert.equal(await f.ghost.verify(f.input,f.result),false,'Missing public images cannot pass a read-only verification');
 assert.equal(authorityChecks,0,'Read verification never requests new-write authority');assert.deepEqual(await f.publicFiles(),[]);assert.equal(f.store.get('SELECT count(*) n FROM asset_publications')!.n,0);
});

test('R031: accepted Ghost write then source revocation leaves recognizable state without exposing images',async t=>{
 const f=await mediaFixture(t);let ghostWrites=0,revoked=false;
 f.policy.authority.validate=async()=>{if(revoked)throw new AppError(403,'SOURCE_REVOKED','Revoked');};
 f.ghost.publish=async input=>{await input.beforeWrite!();ghostWrites++;revoked=true;return f.result;};
 await new ReleaseWorker(f.pub,f.ghost).once();const row=f.store.get('SELECT * FROM releases WHERE id=?',f.release.id)!;
 assert.equal(ghostWrites,1);assert.equal(row.state,'verifying');assert.equal(row.remote_id,f.result.remoteId);assert.deepEqual(await f.publicFiles(),[]);assert.equal(f.store.get('SELECT count(*) n FROM asset_publications')!.n,0);
});

for(const entry of ['cms','service'])test(`R031: ${entry} explicit media completion repairs only confirmed images without resending Ghost`,async t=>{
 const f=await mediaFixture(t);let ghostWrites=0;
 f.ghost.publish=async()=>{ghostWrites++;throw Error('Must not resend Ghost');};
 f.store.run("UPDATE releases SET state='verifying',remote_id=?,url=? WHERE id=?",f.result.remoteId,f.result.url,f.release.id);f.store.run("UPDATE jobs SET state='done' WHERE resource_id=?",f.release.id);
 const app=await createApp({...f,vault:f.vault,publicUrl:'http://localhost:3599',authenticate:async()=>f.actors.solo});t.after(()=>app.close());
 const operation=(await app.inject({url:'/openapi.json'})).json().paths['/api/service/releases/{id}/materialize-media'].post;assert.equal(operation.operationId,'materializeOriginalMedia');assert.equal(operation.responses['202'].content['application/json'].schema.type,'object');assert.deepEqual(operation.requestBody.content['application/json'].schema.required,['ownerId','revisionId','rightsConfirmed','idempotencyKey']);
 const endpoint=`/api/${entry}/releases/${f.release.id}/materialize-media`,body={ownerId:'solo',revisionId:f.release.revision_id,rightsConfirmed:true,idempotencyKey:'media-one'};
 for(const input of [{...body,rightsConfirmed:false},{...body,revisionId:'wrong'},{...body,ownerId:'org'}])assert.ok((await app.inject({method:'POST',url:endpoint,payload:input})).statusCode>=400);
 assert.equal(f.store.get('SELECT count(*) n FROM release_media_requests')!.n,0);
 const beforeCipher=f.store.get('SELECT actor_json FROM releases WHERE id=?',f.release.id)!.actor_json;
 const response=await app.inject({method:'POST',url:endpoint,payload:body});assert.equal(response.statusCode,202,response.body);
 const replay=await app.inject({method:'POST',url:endpoint,payload:body});assert.equal(replay.statusCode,202,replay.body);assert.equal(replay.json().id,response.json().id);
 await new ReleaseWorker(f.pub,f.ghost).once();const row=f.store.get('SELECT * FROM releases WHERE id=?',f.release.id)!;
 assert.equal(row.state,'published');assert.equal(ghostWrites,0);assert.equal((await f.publicFiles()).length,2);assert.equal(f.store.get('SELECT actor_json FROM releases WHERE id=?',f.release.id)!.actor_json,beforeCipher);
 const request=f.store.get('SELECT * FROM release_media_requests WHERE id=?',response.json().id)!;assert.equal(request.state,'complete');assert.equal(request.public_files,2);assert.equal(f.store.get('SELECT count(*) n FROM projections')!.n,0);
 f.store.run('DELETE FROM asset_publications');
 const paths=f.ghost.images(f.input).map(image=>join(f.directory,'site',image.filename)),before=await Promise.all(paths.map(path=>stat(path)));
 f.store.run("UPDATE releases SET state='uncertain' WHERE id=?",f.release.id);await f.pub.reconcile(f.actors.solo,f.release.id,'read-existing');await new ReleaseWorker(f.pub,f.ghost).once();
 assert.equal(f.store.get('SELECT state FROM releases WHERE id=?',f.release.id)!.state,'published');assert.equal(f.store.get('SELECT count(*) n FROM asset_publications')!.n,2);assert.equal(f.store.get('SELECT count(*) n FROM projections')!.n,0);assert.deepEqual((await Promise.all(paths.map(path=>stat(path)))).map(s=>s.mtimeMs),before.map(s=>s.mtimeMs));
});

test('R031: partial media publication remains recorded and fresh authority can complete it',async t=>{
 const f=await mediaFixture(t);f.store.run("UPDATE releases SET state='verifying',remote_id=?,url=? WHERE id=?",f.result.remoteId,f.result.url,f.release.id);f.store.run("UPDATE jobs SET state='done' WHERE resource_id=?",f.release.id);
 let checks=0,revoked=false;f.policy.authority.validate=async()=>{checks++;if(revoked)throw new AppError(403,'SOURCE_REVOKED','Revoked');};
 const originalMaterialize=(f.ghost as any).materialize?.bind(f.ghost);
 (f.ghost as any).materialize=async(input:any,result:any)=>{const record=input.onMaterialized;input.onMaterialized=(assetId:string)=>{record?.(assetId);revoked=true;};return originalMaterialize(input,result);};
 const first=await (f.pub as any).materializeMedia(f.actors.solo,f.release.id,{ownerId:'solo',revisionId:f.release.revision_id,rightsConfirmed:true,idempotencyKey:'first'},'first');
 await new ReleaseWorker(f.pub,f.ghost).once();const request=f.store.get('SELECT * FROM release_media_requests WHERE id=?',first.id)!;
 assert.equal(request.state,'partial');assert.equal(request.public_files,1);assert.equal((await f.publicFiles()).length,1);assert.equal(f.store.get('SELECT state FROM releases WHERE id=?',f.release.id)!.state,'verifying');assert.ok(checks>1);
 revoked=false;(f.ghost as any).materialize=originalMaterialize;
 const second=await (f.pub as any).materializeMedia(f.actors.solo,f.release.id,{ownerId:'solo',revisionId:f.release.revision_id,rightsConfirmed:true,idempotencyKey:'second'},'second');await new ReleaseWorker(f.pub,f.ghost).once();
 assert.equal(f.store.get('SELECT state FROM releases WHERE id=?',f.release.id)!.state,'published');assert.equal(f.store.get('SELECT public_files FROM release_media_requests WHERE id=?',first.id)!.public_files,1);assert.equal(f.store.get('SELECT public_files FROM release_media_requests WHERE id=?',second.id)!.public_files,1);
});

for(const scenario of ['body changed','remote changed','paused','paused before rename','site drift','version drift','lease lost','revoked before rename'])test(`R031: media completion blocks ${scenario} without exposing image bytes`,async t=>{
 const f=await mediaFixture(t);f.store.run("UPDATE releases SET state='verifying',remote_id=?,url=? WHERE id=?",f.result.remoteId,f.result.url,f.release.id);f.store.run("UPDATE jobs SET state='done' WHERE resource_id=?",f.release.id);
 const request=await f.pub.materializeMedia(f.actors.solo,f.release.id,{ownerId:'solo',revisionId:f.release.revision_id,rightsConfirmed:true,idempotencyKey:scenario},'guard');
 if(scenario==='body changed')f.setCorrupt(true);
 if(scenario==='remote changed')f.ghost.reconcile=async()=>({...f.result,remoteId:'another'});
 if(scenario==='paused'){
  f.store.run("UPDATE settings SET value='true' WHERE key='outbound_paused'");
  await assert.rejects(f.pub.materializeMedia(f.actors.solo,f.release.id,{ownerId:'solo',revisionId:f.release.revision_id,rightsConfirmed:true,idempotencyKey:'new'},'paused'),{code:'OUTBOUND_PAUSED'});
 }
 const changedRevision=scenario==='version drift'?await f.content.edit(f.actors.solo,f.article.id,f.article.revision.id,{title:'Unconfirmed revision'},'new-version'):null;
 let checks=0;
 const validate=f.policy.authority.validate.bind(f.policy.authority);
 f.policy.authority.validate=async(...args)=>{
  await validate(...args);checks++;
  // Worker access, first materialize check, then the post-staging check.
  if(checks!==3)return;
  if(scenario==='paused before rename')f.store.run("UPDATE settings SET value='true' WHERE key='outbound_paused'");
  if(scenario==='site drift')f.store.run("UPDATE sites SET url='http://localhost:4001' WHERE id='site'");
  if(scenario==='version drift')f.store.run("UPDATE releases SET revision_id=? WHERE id=?",changedRevision!.revision.id,f.release.id);
  if(scenario==='lease lost')f.store.run("UPDATE jobs SET lease_until='2000-01-01' WHERE resource_id=?",f.release.id);
  if(scenario==='revoked before rename'){const stages=(await readdir(f.directory)).filter(name=>name.startsWith('.private-media-'));assert.equal(stages.length,1);assert.equal((await stat(join(f.directory,stages[0]!))).mode&0o777,0o700);throw new AppError(403,'SOURCE_REVOKED','Revoked at final check');}
 };
 await new ReleaseWorker(f.pub,f.ghost).once();assert.deepEqual(await f.publicFiles(),[]);assert.equal(f.store.get('SELECT count(*) n FROM asset_publications')!.n,0);
 assert.ok(!['published'].includes(f.store.get('SELECT state FROM releases WHERE id=?',f.release.id)!.state));
 assert.equal(f.store.get('SELECT public_files FROM release_media_requests WHERE id=?',request.id)!.public_files,0);
 assert.deepEqual((await readdir(f.directory)).filter(name=>name.startsWith('.private-media-')),[],'Private staging is removed on every exit');
});

test('R031: legacy recovery metadata and its correction cannot use the recovering CMS actor',async t=>{
 const f=await mediaFixture(t);const {AlternateService,AlternateWorker}=await import('../src/alternates.ts');
 f.store.run("UPDATE releases SET state='published',remote_id=?,url=? WHERE id=?",f.result.remoteId,f.result.url,f.release.id);
 const recovered=f.vault.seal(f.actors.solo);let writes=0;
 for(const id of ['legacy-recovery','legacy-correction']){
  f.store.run('INSERT INTO projections VALUES (?,?,?,?,?,?,?)',id,f.article.id,'solo',recovered,'queued',null,'original');
  f.store.run('INSERT INTO jobs VALUES (?,?,?,?,?,?)',id,'projection',id,'queued',null,new Date().toISOString());
  if(id==='legacy-correction')f.store.run('INSERT INTO projection_retries VALUES (?,?,?)',id,0,new Date().toISOString());
 }
 const worker=new AlternateWorker(new AlternateService(f.pub),{async alternates(input){await input.beforeWrite!();writes++;}});
 while(await worker.once()){}assert.equal(writes,0);
 for(const id of ['legacy-recovery','legacy-correction'])assert.equal(f.store.get('SELECT error_code FROM projections WHERE id=?',id)!.error_code,'RECOVERY_READ_ONLY');
 await new AlternateService(f.pub).request(f.actors.solo,f.article.id,'explicit-fresh-command');await worker.once();assert.equal(writes,1);
});
