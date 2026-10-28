/** Operator-only encrypted backup and isolated restore; never exposed to the CMS. */
import {spawn,execFileSync} from 'node:child_process';
import {createReadStream,createWriteStream} from 'node:fs';
import {readFile,writeFile,mkdtemp,mkdir,rm,readdir,stat} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {setTimeout} from 'node:timers/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Store} from '../src/store.ts';
import {digest} from '../src/content.ts';
import {snapshotPlatform,isolateRestoredPlatform,encryptArchive,decryptArchive} from '../src/recovery.ts';
import {requireValue} from '../src/errors.ts';
import {sourceFingerprint} from './source-fingerprint.ts';
interface Plan {dockerContext:string;databasePath:string;platformConfig:string;extraFiles?:string[];sites:Array<{project:string;envFile:string;restoreProject?:string;enPort?:number;zhPort?:number}>;}
const [mode,planPath,destination]=process.argv.slice(2),trace=randomUUID();
requireValue(['capture','restore'].includes(mode) && planPath && destination,400,'USAGE','node scripts/recovery.ts capture|restore PLAN.json OUTPUT_OR_DIRECTORY');
const plan=JSON.parse(await readFile(planPath,'utf8')) as Plan,key=process.env.RECOVERY_BACKUP_KEY??'';
requireValue(plan.dockerContext && Array.isArray(plan.sites) && /^[a-f0-9]{64}$/.test(key),400,'RECOVERY_CONFIGURATION','Explicit Docker context, site groups and independent RECOVERY_BACKUP_KEY are required');
const working=await mkdtemp(join(tmpdir(),'chrono-recovery-')),composeFile=resolve('infra/ghost/compose.yaml');
let restoreOverride:string|undefined;
function docker(...args:string[]) {return execFileSync('docker',['--context',plan.dockerContext,...args],{encoding:'utf8',maxBuffer:8_000_000,stdio:['ignore','pipe','pipe']});}
function compose(project:string,envFile:string,...args:string[]){return ['compose','--env-file',envFile,'-f',composeFile,...(restoreOverride?['-f',restoreOverride]:[]),'-p',project,...args];}
async function streamCommand(args:string[],file:string,direction:'capture'|'restore') {
  const child=spawn('docker',['--context',plan.dockerContext,...args],{stdio:['pipe','pipe','pipe']});
  child.stderr.resume();const finished=new Promise<void>((yes,no)=>{child.once('error',no);child.once('exit',code=>code===0?yes():no(new Error(`Docker stream failed (${code}); trace=${trace}`)));});
  await Promise.all([finished,direction==='capture'?pipeline(child.stdout,createWriteStream(file,{flags:'wx',mode:0o600})):pipeline(createReadStream(file),child.stdin)]);
  if(direction==='capture')child.stdin.end();else child.stdout.resume();
}
function envValues(content:string){return Object.fromEntries(content.split('\n').filter(line=>line && !line.startsWith('#')).map(line=>{const split=line.indexOf('=');return[line.slice(0,split),line.slice(split+1)];}));}
async function waitHealthy(project:string,envFile:string,service:string) {
  const started=Date.now();
  while(Date.now()-started<180_000) {
    const id=docker(...compose(project,envFile,'ps','-q',service)).trim();
    if(id && docker('inspect','--format','{{.State.Health.Status}}',id).trim()==='healthy')return;
    if(Math.floor((Date.now()-started)/2000)%8===0)process.stdout.write(JSON.stringify({event:'recovery.wait',project,service,trace})+'\n');
    await setTimeout(2000);
  }throw new Error(`Recovery health deadline; trace=${trace}`);
}
try {
  if(mode==='capture') {
    const payload=join(working,'payload');await mkdir(payload,{mode:0o700});
    const source=new Store(plan.databasePath);try{await snapshotPlatform(source,join(payload,'platform.sqlite'));}finally{source.close();}
    const config=await readFile(plan.platformConfig);requireValue(!config.toString().includes('RECOVERY_BACKUP_KEY='),400,'BACKUP_KEY_SEPARATION','Do not bundle the independent backup key');await writeFile(join(payload,'platform.env'),config,{mode:0o600});
    for(const [index,path]of (plan.extraFiles??[]).entries())await writeFile(join(payload,`extra-${index}`),await readFile(path),{mode:0o600});
    for(const [index,site]of plan.sites.entries()) {
      requireValue(/^[a-z0-9][a-z0-9-]+$/.test(site.project),400,'RECOVERY_CONFIGURATION','Invalid project name');
      await writeFile(join(payload,`ghost-${index}.env`),await readFile(site.envFile),{mode:0o600});
      for(const lang of ['en','zh']) {
        await streamCommand(compose(site.project,site.envFile,'exec','-T',`db-${lang}`,'sh','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump --user=root --single-transaction --set-gtid-purged=OFF --no-tablespaces --routines --triggers ghost'),join(payload,`ghost-${index}-${lang}.sql`),'capture');
        await streamCommand(compose(site.project,site.envFile,'exec','-T',`ghost-${lang}`,'tar','-czf','-','-C','/var/lib/ghost/content','.'),join(payload,`ghost-${index}-${lang}.tgz`),'capture');
      }
    }
    const files=[];for(const name of await readdir(payload))files.push({name,sha256:digest(await readFile(join(payload,name))),bytes:(await stat(join(payload,name))).size});
    const manifest={version:1,createdAt:new Date().toISOString(),buildRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceFingerprint:await sourceFingerprint(),trace,projects:plan.sites.map(s=>s.project),files,extraFileNames:(plan.extraFiles??[]).map(p=>p.split('/').at(-1))};
    await writeFile(join(payload,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
    const archive=join(working,'archive.tgz');execFileSync('tar',['-czf',archive,'-C',payload,'.']);await encryptArchive(archive,resolve(destination),key);
    process.stdout.write(JSON.stringify({event:'backup.complete',path:resolve(destination),files:files.length,outboundPaused:true,trace})+'\n');
  } else {
    const archive=join(working,'archive.tgz');requireValue(process.env.RECOVERY_ARCHIVE,400,'RECOVERY_CONFIGURATION','Set RECOVERY_ARCHIVE to the encrypted bundle');await decryptArchive(process.env.RECOVERY_ARCHIVE,archive,key);
    const names=execFileSync('tar',['-tzf',archive],{encoding:'utf8'}).trim().split('\n');requireValue(names.every(n=>n==='./'||/^\.\/[a-zA-Z0-9_.-]+$/.test(n)),400,'BACKUP_PATH','Unexpected backup archive entry');
    const payload=join(working,'payload');await mkdir(payload,{mode:0o700});execFileSync('tar',['-xzf',archive,'-C',payload]);
    const manifest=JSON.parse(await readFile(join(payload,'manifest.json'),'utf8'));requireValue(manifest.version===1 && manifest.projects.length===plan.sites.length,400,'BACKUP_FORMAT','Restore plan must account for every publication');
    for(const file of manifest.files)requireValue(/^[a-zA-Z0-9_.-]+$/.test(file.name) && digest(await readFile(join(payload,file.name)))===file.sha256,409,'BACKUP_INTEGRITY','Backup file checksum mismatch');
    const target=resolve(destination);await mkdir(target,{mode:0o700}); // Exclusive destination: never restore over existing data.
    restoreOverride=join(target,'restore-compose.yaml');
    await writeFile(restoreOverride,'services:\n  db-en:\n    command: ["--performance-schema=OFF", "--innodb-buffer-pool-size=32M", "--max-connections=20"]\n  db-zh:\n    command: ["--performance-schema=OFF", "--innodb-buffer-pool-size=32M", "--max-connections=20"]\n',{mode:0o600});
    const ports=new Set<number>();
    for(const [index,site]of plan.sites.entries()) {
      const project=site.restoreProject;requireValue(project && /^blogsystem-restore-[a-z0-9-]+$/.test(project) && !manifest.projects.includes(project),400,'RESTORE_ISOLATION','Use a new blogsystem-restore-* project');
      for(const port of [site.enPort,site.zhPort]){requireValue(port && Number.isInteger(port) && port>1023 && port<65536 && !ports.has(port),400,'RESTORE_ISOLATION','Distinct unprivileged loopback ports are required');ports.add(port);}
      for(const volume of ['database-en','database-zh','content-en','content-zh']){let exists=false;try{docker('volume','inspect',`${project}_${volume}`);exists=true;}catch{}requireValue(!exists,409,'RESTORE_ISOLATION','Target volume already exists; choose a new project');}
      requireValue(!docker(...compose(project,site.envFile,'ps','-a','-q')).trim(),409,'RESTORE_ISOLATION','Target project already has containers');
      const values=envValues(await readFile(join(payload,`ghost-${index}.env`),'utf8'));
      requireValue(/^ghost@sha256:[a-f0-9]{64}$/.test(values.GHOST_IMAGE) && /^mysql@sha256:[a-f0-9]{64}$/.test(values.MYSQL_IMAGE),400,'BACKUP_FORMAT','Digest-pinned official images required');
      docker('image','inspect',values.GHOST_IMAGE);docker('image','inspect',values.MYSQL_IMAGE);
    }
    await writeFile(join(target,'platform.sqlite'),await readFile(join(payload,'platform.sqlite')),{flag:'wx',mode:0o600});
    await writeFile(join(target,'platform.env'),await readFile(join(payload,'platform.env')),{flag:'wx',mode:0o600});
    for(const file of manifest.files.filter((f:any)=>f.name.startsWith('extra-')))await writeFile(join(target,file.name),await readFile(join(payload,file.name)),{flag:'wx',mode:0o600});
    const platform=new Store(join(target,'platform.sqlite'));try{isolateRestoredPlatform(platform,trace);}finally{platform.close();}
    const projects=[];
    for(const [index,site]of plan.sites.entries()) {
      const project=site.restoreProject!,values=envValues(await readFile(join(payload,`ghost-${index}.env`),'utf8'));
      Object.assign(values,{GHOST_EN_PORT:String(site.enPort),GHOST_ZH_PORT:String(site.zhPort),GHOST_EN_URL:`http://localhost:${site.enPort}`,GHOST_ZH_URL:`http://localhost:${site.zhPort}`});
      const envFile=join(target,`ghost-${index}.env`);await writeFile(envFile,Object.entries(values).map(([k,v])=>`${k}=${v}\n`).join(''),{mode:0o600,flag:'wx'});
      docker(...compose(project,envFile,'up','-d','--pull','never','db-en','db-zh'));
      for(const lang of ['en','zh']) {
        await waitHealthy(project,envFile,`db-${lang}`);
        await streamCommand(compose(project,envFile,'exec','-T',`db-${lang}`,'sh','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --user=root ghost'),join(payload,`ghost-${index}-${lang}.sql`),'restore');
        const volume=`${project}_content-${lang}`;docker('volume','create',volume);
        await streamCommand(['run','--rm','-i','--pull','never','--network','none','--mount',`type=volume,source=${volume},target=/restore`,'--entrypoint','tar',values.GHOST_IMAGE,'-xzf','-','-C','/restore'],join(payload,`ghost-${index}-${lang}.tgz`),'restore');
      }
      docker(...compose(project,envFile,'up','-d','--pull','never','ghost-en','ghost-zh'));
      for(const lang of ['en','zh'])await waitHealthy(project,envFile,`ghost-${lang}`);
      projects.push({project,enUrl:values.GHOST_EN_URL,zhUrl:values.GHOST_ZH_URL});
    }
    await writeFile(join(target,'restore-report.json'),JSON.stringify({trace,restoredAt:new Date().toISOString(),backupCreatedAt:manifest.createdAt,buildRevision:manifest.buildRevision,sourceFingerprint:manifest.sourceFingerprint,checksumsVerified:true,outboundPaused:true,oldSessionsInvalidated:true,projects,remaining:'Rebind isolated URLs and secrets; reconcile uncertain effects before explicitly resuming outbound. Production RPO/RTO not established.'},null,2));
    process.stdout.write(JSON.stringify({event:'restore.complete',report:join(target,'restore-report.json'),outboundPaused:true,trace})+'\n');
  }
}catch(error){process.stderr.write(JSON.stringify({event:'recovery.failed',trace,code:error instanceof Error?error.name:'UNKNOWN'})+'\n');process.exitCode=1;}
finally{await rm(working,{recursive:true,force:true});}
