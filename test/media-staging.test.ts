// Local filesystem boundaries only. No Ghost/NyxID calls.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,symlink,rm,chmod,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fixture} from './helpers.ts';
import {MediaStaging} from '../src/media-staging.ts';

async function layout(t:any){
 const f=fixture(),root=await mkdtemp(join(tmpdir(),'blog-staging-'));t.after(async()=>{f.store.close();await rm(root,{recursive:true,force:true});});
 const media=join(root,'public'),content=join(root,'content'),target=join(content,'images','chrono'),privateRoot=join(content,'.chrono-private-staging');
 await mkdir(media);await mkdir(target,{recursive:true});await mkdir(privateRoot,{mode:0o700});await symlink(target,join(media,'site'));
 f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site','solo','en','http://localhost:3999','KEY');
 const environment={GHOST_MEDIA_STAGING_JSON:JSON.stringify({site:privateRoot})};
 return {...f,root,media,content,target,privateRoot,environment,staging:new MediaStaging(f.store,media,environment)};
}
test('per-site private staging resolves symlinks and supports a single filesystem',async t=>{
 const f=await layout(t),location=await f.staging.resolve('site');assert.equal(location.target,await realpath(f.target));assert.equal(location.privateRoot,await realpath(f.privateRoot));await f.staging.assertUnchanged(location);
});
for(const kind of ['missing','malformed','relative','unprovisioned','public target','public sibling','public files','other site','public alias','world readable'])test(`private staging rejects ${kind}`,async t=>{
 const f=await layout(t);let path=f.privateRoot,code='MEDIA_STAGING_CONFIGURATION';
 if(kind==='missing')delete (f.environment as any).GHOST_MEDIA_STAGING_JSON;
 else if(kind==='malformed')f.environment.GHOST_MEDIA_STAGING_JSON='[';
 else{
  if(kind==='relative')path='relative/staging';
  if(kind==='unprovisioned')path=join(f.root,'not-created');
  if(kind==='public target'){path=f.target;code='MEDIA_STAGING_PUBLIC';}
  if(kind==='public sibling'){path=join(f.content,'images','private');await mkdir(path,{mode:0o700});code='MEDIA_STAGING_PUBLIC';}
  if(kind==='public files'){path=join(f.content,'files','private');await mkdir(path,{recursive:true,mode:0o700});code='MEDIA_STAGING_PUBLIC';}
  if(kind==='other site'){path=join(f.root,'other-content','images','chrono');await mkdir(path,{recursive:true,mode:0o700});f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','other','solo','zh','http://localhost:4000','KEY');await symlink(path,join(f.media,'other'));code='MEDIA_STAGING_PUBLIC';}
  if(kind==='public alias'){path=join(f.root,'alias');await symlink(f.target,path);code='MEDIA_STAGING_PUBLIC';}
  if(kind==='world readable'){await chmod(path,0o755);code='MEDIA_STAGING_PERMISSIONS';}
  f.environment.GHOST_MEDIA_STAGING_JSON=JSON.stringify({site:path});
 }
 await assert.rejects(f.staging.resolve('site'),{code});
});
test('replacing a site symlink invalidates its captured filesystem layout',async t=>{
 const f=await layout(t),location=await f.staging.resolve('site'),newTarget=join(f.root,'new-public');await mkdir(newTarget);
 await rm(join(f.media,'site'));await symlink(newTarget,join(f.media,'site'));
 await assert.rejects(f.staging.assertUnchanged(location),{code:'MEDIA_STAGING_LAYOUT'});
});

test('symlinked Ghost images ancestor cannot hide the served files root',async t=>{
 const f=await layout(t),storage=join(f.root,'image-storage');
 const {rename}=await import('node:fs/promises');await rename(join(f.content,'images'),storage);await symlink(storage,join(f.content,'images'));
 const unsafe=join(f.content,'files','private');await mkdir(unsafe,{recursive:true,mode:0o700});
 f.environment.GHOST_MEDIA_STAGING_JSON=JSON.stringify({site:unsafe});
 await assert.rejects(f.staging.resolve('site'),{code:'MEDIA_STAGING_LAYOUT'});
});
test('a benign private staging alias remains supported in the standard Ghost layout',async t=>{
 const f=await layout(t),alias=join(f.root,'private-alias');await symlink(f.privateRoot,alias);f.environment.GHOST_MEDIA_STAGING_JSON=JSON.stringify({site:alias});
 const location=await f.staging.resolve('site');assert.equal(location.privateRoot,await realpath(f.privateRoot));await f.staging.assertUnchanged(location);f.staging.assertUnchangedSync(location);
});
test('the original single-volume public directory remains supported',async t=>{
 const f=await layout(t);await rm(join(f.media,'site'));await mkdir(join(f.media,'site'));
 const location=await f.staging.resolve('site');assert.equal(location.target,await realpath(join(f.media,'site')));f.staging.assertUnchangedSync(location);
});
test('final guard rejects ambiguous Ghost ancestry even when canonical target is unchanged',async t=>{
 const f=await layout(t),location=await f.staging.resolve('site'),aliasContent=join(f.root,'other-content');
 await mkdir(aliasContent);await symlink(join(f.content,'images'),join(aliasContent,'images'));
 await rm(join(f.media,'site'));await symlink(join(aliasContent,'images','chrono'),join(f.media,'site'));
 assert.equal(await realpath(join(f.media,'site')),location.target);
 assert.throws(()=>f.staging.assertUnchangedSync(location),{code:'MEDIA_STAGING_LAYOUT'});
});
test('chained site aliases with no reliable Ghost logical boundary fail closed',async t=>{
 const f=await layout(t),alias=join(f.root,'site-alias');await symlink(f.target,alias);await rm(join(f.media,'site'));await symlink(alias,join(f.media,'site'));
 await assert.rejects(f.staging.resolve('site'),{code:'MEDIA_STAGING_LAYOUT'});
});
test('a site alias without a logical images/chrono boundary fails closed',async t=>{
 const f=await layout(t),unknown=join(f.root,'unknown-public-layout');await mkdir(unknown);await rm(join(f.media,'site'));await symlink(unknown,join(f.media,'site'));
 await assert.rejects(f.staging.resolve('site'),{code:'MEDIA_STAGING_LAYOUT'});
});
