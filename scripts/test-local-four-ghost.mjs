/** Operator-only local harness: no production application receives Docker access. */
import {execFileSync} from 'node:child_process';
import {mkdir,rm,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {sourceFingerprint} from './source-fingerprint.ts';
const context='colima-blogsystem',image='ghost@sha256:4195f6c405e40230cd10c0770425cf500c1f542a96e9f6584c11649c150e5a89';
const name=`blogsystem-integration-${randomUUID().slice(0,8)}`,directory=resolve('.runtime',name);await mkdir(directory,{recursive:true,mode:0o700});
const archive=join(directory,'code.tgz'),fingerprint=await sourceFingerprint();
execFileSync('tar',['-czf',archive,'src','web','test','node_modules','package.json','.runtime/dev-personal-state.json','.runtime/dev-organization-state.json'],{env:{...process.env,COPYFILE_DISABLE:'1'},stdio:['ignore','ignore','pipe']});
const docker=(...args)=>execFileSync('docker',['--context',context,...args],{encoding:'utf8',maxBuffer:4_000_000,stdio:['ignore','pipe','pipe']});
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty=execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim().length>0;
try {
  const mounts=[];for(const owner of ['personal','organization'])for(const language of ['en','zh'])mounts.push('--mount',`type=volume,source=blogsystem-dev-${owner}_content-${language},target=/mounted/${owner}-${language}`);
  docker('create','--pull','never','--name',name,'--network','blogsystem-dev-personal_en',...mounts,'-e',`INTEGRATION_BUILD_REVISION=${revision}`,'-e',`INTEGRATION_WORKTREE_DIRTY=${dirty}`,'--entrypoint','sh',image,'-c','apk add --no-cache chromium >/tmp/chromium-install.log 2>&1 && mkdir -p /app && tar -xzf /tmp/code.tgz -C /app && cd /app && exec node --experimental-strip-types test/ghost-container.mjs');
  for(const network of ['blogsystem-dev-personal_zh','blogsystem-dev-organization_en','blogsystem-dev-organization_zh'])docker('network','connect',network,name);
  docker('cp',archive,`${name}:/tmp/code.tgz`);
  process.stdout.write(docker('start','--attach',name));
  const status=docker('inspect','--format','{{.State.ExitCode}}',name).trim();
  if(status!=='0')throw new Error(`Integration helper exited ${status}`);
  docker('cp',`${name}:/app/.runtime/four-ghost-evidence.json`,join(directory,'evidence.json'));
  for(const file of ['four-ghost-platform.sqlite','integration-platform.env'])docker('cp',`${name}:/app/.runtime/${file}`,join(directory,file));
  const evidence=JSON.parse(await readFile(join(directory,'evidence.json'),'utf8'));evidence.sourceFingerprint=fingerprint;evidence.harness='cached official Ghost Node 22.23.4; same platform source; native filesystem shared volumes; host application supported runtime remains Node 24.18';
  await writeFile(join(directory,'evidence.json'),JSON.stringify(evidence,null,2));
  process.stdout.write(JSON.stringify({status:'passed',evidence:join(directory,'evidence.json')})+'\n');
} catch(error) {
  try {process.stderr.write(docker('logs',name).slice(-6000));}catch{}
  throw error;
} finally {
  try {docker('rm','-f',name);}catch{}
  await rm(archive,{force:true});
}
