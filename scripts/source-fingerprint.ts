/** Hash reviewable source only; runtime data and credentials are never included. */
import {readdir,readFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function sourceFingerprint(root=process.cwd()) {
  const paths=['package.json','package-lock.json','tsconfig.json','.env.example'];
  try{const config=await lstat(join(root,'tsconfig.studio.json'));if(config.isFile())paths.push('tsconfig.studio.json');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const excludedDirectories=new Set(['node_modules','dist','__pycache__']);
  const excludedFiles=/\.(?:pyc|zip|tgz|tar|gz|bz2|xz|7z|rar|sqlite(?:3)?(?:-wal|-shm)?|db(?:-wal|-shm)?|log|pem|key|p12|pfx|crt|cert)$/i;
  async function walk(directory: string) {
    if(!(await lstat(join(root,directory))).isDirectory())throw Error('Source roots must be regular directories');
    for(const entry of await readdir(join(root,directory),{withFileTypes:true})) {
      if(entry.name.startsWith('.')||excludedDirectories.has(entry.name)||excludedFiles.test(entry.name)||/^id_(?:rsa|ecdsa|ed25519)(?:\.pub)?$/.test(entry.name))continue;
      const path=`${directory}/${entry.name}`;
      if(entry.isDirectory())await walk(path);else if(entry.isFile())paths.push(path);
    }
  }
  for(const directory of ['src','web','scripts','test','infra'])await walk(directory);
  try{await walk('themes');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  return manifest(root,paths);
}
async function manifest(root:string,paths:string[]){
  const files:Array<{path:string;sha256:string}>=[];
  for(const path of paths.sort()){
    const entry=await lstat(join(root,path));if(!entry.isFile())throw Error('Fingerprint inputs must be regular files');
    files.push({path,sha256:createHash('sha256').update(await readFile(join(root,path))).digest('hex')});
  }
  return {algorithm:'sha256',manifestDigest:createHash('sha256').update(JSON.stringify(files)).digest('hex'),files};
}
/** Separate evidence for deployable browser output; never mixed into source identity. */
export async function studioAssetsFingerprint(root=process.cwd()){
  const paths:string[]=[];
  for(const file of ['web/studio/index.html','web/studio/styles.css','web/studio/studio.css','web/studio/vendor/markdown-it.js']){try{if((await lstat(join(root,file))).isFile())paths.push(file);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
  async function walk(directory:string){if(!(await lstat(join(root,directory))).isDirectory())throw Error('Asset roots must be regular directories');for(const entry of await readdir(join(root,directory),{withFileTypes:true})){const path=`${directory}/${entry.name}`;if(entry.isDirectory()&&/^[a-zA-Z0-9_-]+$/.test(entry.name))await walk(path);else if(entry.isFile()&&/^[a-zA-Z0-9_-]+\.js$/.test(entry.name))paths.push(path);}}
  try{await walk('web/studio/dist');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  return manifest(root,paths);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)process.stdout.write(JSON.stringify(process.argv.includes('--assets')?{source:await sourceFingerprint(),studioAssets:await studioAssetsFingerprint()}:await sourceFingerprint(),null,2)+'\n');
