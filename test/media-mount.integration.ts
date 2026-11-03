// Run only through scripts/test-media-mounts.mjs: new disposable Docker volumes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,symlink,writeFile,rename,readFile,stat,readdir,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture} from './helpers.ts';
import {GhostAdapter} from '../src/ghost.ts';
import {MediaService} from '../src/media.ts';
import {PublishingService,ReleaseWorker} from '../src/publishing.ts';
import {Vault} from '../src/vault.ts';

assert.equal(process.env.ISOLATED_MEDIA_MOUNT_TEST,'true','Use the isolated Docker harness');
const media='/platform/media',ids=['personal-en','personal-zh','organization-en','organization-zh'];
await mkdir(media,{recursive:true});
const privatePaths:Record<string,string>={};
for(const id of ids){
 const target=`/mounted/${id}/images/chrono`;await mkdir(target,{recursive:true});
 privatePaths[id]=`/mounted/${id}/.chrono-private-staging`;await mkdir(privatePaths[id]!,{mode:0o700});await symlink(target,join(media,id));
}
const environment={GHOST_MEDIA_STAGING_JSON:JSON.stringify(privatePaths)};
test('isolated topology reproduces the old cross-mount rename failure in private paths',async()=>{
 await mkdir('/platform/old-private',{mode:0o700});await writeFile('/platform/old-private/probe','private bytes',{mode:0o600});
 await assert.rejects(rename('/platform/old-private/probe',join(privatePaths[ids[0]!]!,'old-probe')),{code:'EXDEV'});
 console.log(JSON.stringify({platformDev:(await stat('/platform')).dev,siteDev:(await stat('/mounted/personal-en')).dev,oldRename:'EXDEV'}));
});
for(const id of ids)for(const mode of ['normal','explicit'])test(`${id}: ${mode} image publication succeeds through its site symlink with atomic rename`,async t=>{
 const f=fixture(),vault=new Vault('ab'.repeat(32)),pub=new PublishingService(f.content,vault);t.after(()=>f.store.close());
 const language=id.endsWith('-en')?'en':'zh',organization=id.startsWith('organization'),owner=organization?'org':'solo',actor=organization?f.actors.publisher:f.actors.solo;
 if(organization)f.store.run('INSERT INTO publishers VALUES (?,?)','org',actor.subject);
 f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)',id,owner,language,'http://localhost:3999','KEY');f.store.run('INSERT INTO author_mappings VALUES (?,?,?)',id,actor.subject,'author');
 let article=await f.content.create(actor,{ownerId:owner,language,title:id+' '+mode,markdown:'Exact mounted image body',creditedAuthor:actor.subject},'draft');
 const asset=await new MediaService(f.content).upload(actor,article.id,'image/png',Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.from(id+' '+mode)]).toString('base64'),'asset');
 article=await f.content.edit(actor,article.id,article.revision.id,{markdown:'Exact mounted image body\n\n'+asset.markdown},'edit');
 const release=await pub.confirm(actor,article.id,{ownerId:owner,revisionId:article.revision.id,creditedAuthor:actor.subject,rightsConfirmed:true,action:'publish',idempotencyKey:'original'},'original');
 const ghost=new GhostAdapter(f.store,media,true,environment,undefined,{async verify(){return true;}}),input=pub.input(release),result={remoteId:'accepted',url:'http://localhost:3999/post/'};
 const html=ghost.controlledHtml(input);let ghostWrites=0;
 ghost.current=async()=>({id:'accepted',url:result.url,title:input.title,status:'published',html,authors:[{id:'author'}]});
 ghost.publish=async value=>{await value.beforeWrite!();ghostWrites++;return result;};
 t.mock.method(globalThis,'fetch',async(url:any,options:any)=>{
  assert.ok(!options?.method||options.method==='GET');if(String(url)===result.url)return new Response(`<html lang="${language}"><h1>${input.title}</h1>${ghost.publisherHtml(input)}${html}</html>`);
  const image=ghost.images(input).find(image=>image.url===String(url));assert.ok(image);
  try{return new Response(await readFile(join(media,id,image.filename)),{headers:{'content-type':image.mime}});}catch(error:any){if(error.code==='ENOENT')return new Response('',{status:404});throw error;}
 });
 if(mode==='explicit'){
  f.store.run("UPDATE releases SET state='verifying',remote_id=?,url=? WHERE id=?",result.remoteId,result.url,release.id);f.store.run("UPDATE jobs SET state='done' WHERE resource_id=?",release.id);
  await pub.materializeMedia(actor,release.id,{ownerId:owner,revisionId:article.revision.id,rightsConfirmed:true,idempotencyKey:'media'},'media');
 }
 await new ReleaseWorker(pub,ghost).once();const row=f.store.get('SELECT * FROM releases WHERE id=?',release.id)!;assert.equal(row.state,'published',JSON.stringify({state:row.state,errorCode:row.error_code,remoteId:row.remote_id}));assert.equal(ghostWrites,mode==='normal'?1:0);
 assert.deepEqual(await readFile(join(media,id,ghost.images(input)[0]!.filename)),Buffer.from(f.store.get('SELECT content FROM assets WHERE id=?',asset.id)!.content));
 assert.equal(f.store.get('SELECT count(*) n FROM asset_publications')!.n,1);assert.deepEqual(await readdir(privatePaths[id]!),[]);
 if(mode==='explicit'){assert.equal(f.store.get('SELECT public_files FROM release_media_requests')!.public_files,1);assert.equal(f.store.get('SELECT count(*) n FROM projections')!.n,0);}
});
test('reject different device, different mount with same device, and publicly served staging',async()=>{
 const {MediaStaging}=await import('../src/media-staging.ts'),f=fixture();try{
  for(const id of ids)f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)',id,id.startsWith('personal')?'solo':'org',id.endsWith('-en')?'en':'zh','http://localhost:3999','KEY');
  await mkdir('/dev/shm/blog-private',{mode:0o700});
  assert.notEqual((await stat('/dev/shm/blog-private')).dev,(await stat('/mounted/personal-en')).dev);
  assert.equal((await stat('/mounted/personal-en')).dev,(await stat('/mounted/personal-zh')).dev,'Different Docker mounts share their backing device in this topology');
  for(const [directory,code]of [['/dev/shm/blog-private','MEDIA_STAGING_FILESYSTEM'],[privatePaths['personal-zh']!,'MEDIA_STAGING_FILESYSTEM'],['/mounted/personal-en/images/private','MEDIA_STAGING_PUBLIC']] as const){
   await mkdir(directory,{recursive:true,mode:0o700});await chmod(directory,0o700);
   const staging=new MediaStaging(f.store,media,{GHOST_MEDIA_STAGING_JSON:JSON.stringify({'personal-en':directory})});await assert.rejects(staging.resolve('personal-en'),{code});
  }
 }finally{f.store.close();}
});
