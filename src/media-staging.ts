import {realpath,stat,readFile} from 'node:fs/promises';
import {realpathSync,readlinkSync,lstatSync,statSync,readFileSync,type Stats} from 'node:fs';
import {resolve,isAbsolute,dirname,basename,join,sep} from 'node:path';
import type {Store} from './store.ts';
import {AppError,requireValue} from './errors.ts';

export interface MediaLocation {siteId:string;target:string;privateRoot:string;identity:string;}
const contains=(parent:string,child:string)=>parent===child||child.startsWith(parent.endsWith(sep)?parent:parent+sep);
const overlaps=(a:string,b:string)=>contains(a,b)||contains(b,a);
const unescapeMount=(value:string)=>value.replace(/\\([0-7]{3})/g,(_match,octal:string)=>String.fromCharCode(parseInt(octal,8)));
const identityOf=(configured:string,target:string,publicStat:Stats,privateRoot:string,privateStat:Stats,mount:string|null)=>JSON.stringify([configured,target,publicStat.dev,publicStat.ino,privateRoot,privateStat.dev,privateStat.ino,privateStat.uid,privateStat.mode,mount]);

// Retain the logical images/chrono boundary before realpath erases symlinked
// ancestry. Custom/chained site layouts require an explicit future design.
function siteTarget(path:string) {
  let logical=path,alias=false;
  try{logical=resolve(dirname(path),readlinkSync(path));alias=true;}catch(error){if((error as NodeJS.ErrnoException).code!=='EINVAL')throw error;}
  requireValue(!lstatSync(logical).isSymbolicLink(),503,'MEDIA_STAGING_LAYOUT','Chained site symlinks have no supported Ghost served-root boundary');
  const nativeLayout=basename(logical)==='chrono'&&basename(dirname(logical))==='images';
  requireValue(!alias||nativeLayout,503,'MEDIA_STAGING_LAYOUT','Site aliases must directly identify the supported Ghost images/chrono layout');
  const canonical=realpathSync(path);
  if(nativeLayout){
    const content=realpathSync(dirname(dirname(logical)));
    requireValue(realpathSync(dirname(logical))===join(content,'images')&&canonical===join(content,'images','chrono'),503,'MEDIA_STAGING_LAYOUT','Symlinked Ghost images/chrono ancestry has no supported served-root boundary');
  }
  return canonical;
}

// Docker bind mounts can share st_dev yet still reject rename with EXDEV.
// Linux mount identity supplements, rather than replaces, the device check.
async function mountIdentity(path:string) {
  if(process.platform!=='linux')return null;
  let table:string;
  try{table=await readFile('/proc/self/mountinfo','utf8');}catch{throw new AppError(503,'MEDIA_STAGING_FILESYSTEM','Linux Worker must be able to read /proc/self/mountinfo');}
  return findMount(table,path);
}
function findMount(table:string,path:string) {
  const mounts=table.trim().split('\n').map(line=>{
    const fields=line.split(' ');return {id:fields[0]!,path:unescapeMount(fields[4]!)};
  }).filter(mount=>contains(mount.path,path)).sort((a,b)=>b.path.length-a.path.length);
  requireValue(mounts.length,503,'MEDIA_STAGING_FILESYSTEM','Cannot determine media mount identity');
  return mounts[0]!.id;
}
export class MediaStaging {
  store:Store;mediaRoot:string;environment:NodeJS.ProcessEnv;
  constructor(store:Store,mediaRoot:string,environment:NodeJS.ProcessEnv){this.store=store;this.mediaRoot=mediaRoot;this.environment=environment;}
  configured(siteId:string) {
    let values:unknown;
    try{values=JSON.parse(this.environment.GHOST_MEDIA_STAGING_JSON??'null');}catch{throw new AppError(503,'MEDIA_STAGING_CONFIGURATION','GHOST_MEDIA_STAGING_JSON must map site IDs to provisioned private absolute directories');}
    requireValue(values&&typeof values==='object'&&!Array.isArray(values),503,'MEDIA_STAGING_CONFIGURATION','Configure GHOST_MEDIA_STAGING_JSON before publishing new images');
    const directory=(values as Record<string,unknown>)[siteId];
    requireValue(typeof directory==='string'&&isAbsolute(directory)&&directory.length<=4096&&!directory.includes('\0'),503,'MEDIA_STAGING_CONFIGURATION','Configure an absolute private staging directory for this site');
    return resolve(directory);
  }
  async publicRoots() {
    const roots=new Set([resolve(this.mediaRoot),await realpath(this.mediaRoot)]);
    for(const site of this.store.all('SELECT id FROM sites')){
      const path=resolve(this.mediaRoot,site.id);roots.add(path);
      let canonical:string;
      try{canonical=siteTarget(path);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}
      roots.add(canonical);
      // Native Ghost content volumes expose images, media, files and themes.
      // Protect their whole served roots, including siblings of images/chrono.
      if(basename(canonical)==='chrono'&&basename(dirname(canonical))==='images'){
        const content=dirname(dirname(canonical));
        for(const name of ['images','media','files','themes']){
          const root=join(content,name);roots.add(root);
          try{roots.add(await realpath(root));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
        }
      }
    }
    return roots;
  }
  async resolve(siteId:string):Promise<MediaLocation> {
    const configured=this.configured(siteId);
    try{
      const [target,privateRoot]=await Promise.all([realpath(join(this.mediaRoot,siteId)),realpath(configured)]);
      const [publicStat,privateStat,roots]=await Promise.all([stat(target),stat(privateRoot),this.publicRoots()]);
      requireValue(publicStat.isDirectory()&&privateStat.isDirectory(),503,'MEDIA_STAGING_CONFIGURATION','Provision both the public media and private staging directories');
      requireValue([...roots].every(root=>!overlaps(root,configured)&&!overlaps(root,privateRoot)),503,'MEDIA_STAGING_PUBLIC','Private staging must be outside every public media root and Ghost served content path');
      requireValue((privateStat.mode&0o777)===0o700&&privateStat.uid===process.getuid?.(),503,'MEDIA_STAGING_PERMISSIONS','Private staging must be owned by the Worker Unix user with mode 0700');
      const [publicMount,privateMount]=await Promise.all([mountIdentity(target),mountIdentity(privateRoot)]);
      requireValue(publicStat.dev===privateStat.dev&&publicMount===privateMount,503,'MEDIA_STAGING_FILESYSTEM','Private staging and the site target must share a filesystem and mount for atomic rename');
      const identity=identityOf(configured,target,publicStat,privateRoot,privateStat,publicMount);
      return {siteId,target,privateRoot,identity};
    }catch(error){
      if(error instanceof AppError)throw error;
      if(['ENOENT','ENOTDIR','EACCES','EPERM'].includes((error as NodeJS.ErrnoException).code??''))throw new AppError(503,'MEDIA_STAGING_CONFIGURATION','Provision and grant the Worker access to its configured media and private staging directories');
      throw error;
    }
  }
  async assertUnchanged(location:MediaLocation) {
    const current=await this.resolve(location.siteId);
    requireValue(current.identity===location.identity,409,'MEDIA_STAGING_CHANGED','Media symlink, directory or mount changed before publication');
  }
  // Keep the final authority await followed by synchronous guards and rename.
  // Resolve the configured symlinks again; never rename through an unchecked alias.
  assertUnchangedSync(location:MediaLocation) {
    try{
    const configured=this.configured(location.siteId),target=siteTarget(join(this.mediaRoot,location.siteId)),privateRoot=realpathSync(configured);
    const publicStat=statSync(target),privateStat=statSync(privateRoot);
    const mounts=process.platform==='linux'?readFileSync('/proc/self/mountinfo','utf8'):null;
    const publicMount=mounts===null?null:findMount(mounts,target),privateMount=mounts===null?null:findMount(mounts,privateRoot);
    const identity=identityOf(configured,target,publicStat,privateRoot,privateStat,publicMount);
    requireValue(identity===location.identity&&publicMount===privateMount,409,'MEDIA_STAGING_CHANGED','Media symlink, directory or mount changed during authorization');
    }catch(error){if(error instanceof AppError)throw error;throw new AppError(409,'MEDIA_STAGING_CHANGED','Media filesystem could not be revalidated during authorization');}
  }
}
