/** Isolated filesystem integration only; never mounts existing Ghost volumes. */
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {sourceFingerprint} from './source-fingerprint.ts';
const context='colima-blogsystem',image='blogsystem-review-runtime:node24-chromium-20261029';
const name=`blogsystem-media-mount-${randomUUID().slice(0,8)}`,directory=resolve('.runtime',name),archive=join(directory,'code.tgz');
await mkdir(directory,{recursive:true,mode:0o700});
const docker=(...args)=>execFileSync('docker',['--context',context,...args],{encoding:'utf8',maxBuffer:4_000_000,stdio:['ignore','pipe','pipe']});
const ids=['platform','personal-en','personal-zh','organization-en','organization-zh'],volumes=ids.map(id=>`${name}-${id}`);
let output='';
try{
 await writeFile(join(directory,'source-fingerprint.json'),JSON.stringify(await sourceFingerprint(),null,2)+'\n');
 execFileSync('tar',['-czf',archive,'src','test','node_modules','package.json'],{env:{...process.env,COPYFILE_DISABLE:'1'},stdio:['ignore','ignore','pipe']});
 for(const volume of volumes)docker('volume','create','--label',`blogsystem-isolated-media-test=${name}`,volume);
 const mounts=ids.flatMap((id,index)=>['--mount',`type=volume,source=${volumes[index]},target=${id==='platform'?'/platform':`/mounted/${id}`}`]);
 docker('create','--pull','never','--network','none','--name',name,...mounts,'-e','ISOLATED_MEDIA_MOUNT_TEST=true','--entrypoint','sh',image,'-c','mkdir -p /app && tar -xzf /tmp/code.tgz -C /app && cd /app && exec node --test test/media-mount.integration.ts');
 docker('cp',archive,`${name}:/tmp/code.tgz`);output=docker('start','--attach',name);
 const status=Number(docker('inspect','--format','{{.State.ExitCode}}',name));
 await writeFile(join(directory,'test.log'),output);await writeFile(join(directory,'mounts.json'),docker('inspect','--format','{{json .Mounts}}',name));
 process.stdout.write(output);if(status!==0)throw Error(`Isolated media mount test exited ${status}`);
 process.stdout.write(`Evidence: ${directory}\n`);
} catch(error){
 try{const logs=docker('logs',name);await writeFile(join(directory,'test.log'),logs);process.stderr.write(logs);}catch{}
 throw error;
} finally{
 try{docker('rm','-f',name);}catch{}
 for(const volume of volumes){try{docker('volume','rm',volume);}catch{}}
 await rm(archive,{force:true});
}
