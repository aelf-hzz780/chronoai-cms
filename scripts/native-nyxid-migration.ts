/** Operator-only migration orchestration. No action runs when imported. */
import {execFileSync,spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {readFile,writeFile,mkdir,rename,lstat,realpath,readdir,copyFile,mkdtemp,rm,open} from 'node:fs/promises';
import {DatabaseSync,backup} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {join,resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {encryptArchive} from '../src/recovery.ts';

export const OFFICIAL_COMMIT='38bae2f7825bfa70d8a9e4e837118d7d9658e6a5';
type Hook={file:string;sha256:string;args:string[]};
export interface MigrationPlan {
  schemaVersion:1;officialCommit:string;cmsCommit:string;dockerContext:string;project:string;issuer:string;
  backendImage:string;frontendImage:string;backendPort:number;frontendPort:number;
  backendEnvFile:string;frontendEnvFile:string;keysDirectory:string;tufDirectory:string;network:string;
  stateDirectory:string;independentAcceptancePath:string;cmsDatabases:string[];workerContainerIds:string[];preservedContainerIds:string[];
  mongo:{containerId:string;dumpConfigPathInContainer:string};backupInputs:Array<{category:'configuration'|'registration';path:string}>;
  checks:Array<{name:string;url:string}>;hooks:{quiescence:Hook;stopPrevious:Hook;verifyPreviousStopped:Hook;switchToOfficial:Hook;switchToPrevious:Hook};
}
export interface CandidateContainer {service:string;id:string;image:string;}
export interface ExclusiveState {phase:string;candidateContainers?:CandidateContainer[];[key:string]:unknown;}
export interface ExclusiveRuntime {
  persist(state:ExclusiveState):Promise<void>;
  stopPrevious():Promise<void>;
  verifyPreviousStopped():Promise<void>;
  startCandidates():Promise<void>;
  candidates():Promise<CandidateContainer[]>;
  stopCandidates():Promise<void>;
  verifyCandidatesStopped():Promise<void>;
  switchToPrevious():Promise<void>;
}
// No route switch may compensate for an overlapping backend lifetime. Stop and
// verify the old process before Docker starts any candidate writer.
export async function stageExclusive(state:ExclusiveState,runtime:ExclusiveRuntime){
  state.phase='STOPPING_PREVIOUS';state.candidateContainers=[];await runtime.persist(state);
  await runtime.stopPrevious();
  await runtime.verifyPreviousStopped();
  state.phase='PREVIOUS_STOPPED';await runtime.persist(state);
  state.phase='STAGING';await runtime.persist(state);
  try{await runtime.startCandidates();}
  finally{state.candidateContainers=await runtime.candidates();await runtime.persist(state);}
  await runtime.verifyPreviousStopped();
  state.phase='STAGED';await runtime.persist(state);
}
// A failed stop or verification cannot fall through to restarting the old
// backend. Database contents are never restored by this rollback.
export async function rollbackExclusive(state:ExclusiveState,runtime:ExclusiveRuntime){
  state.phase='STOPPING_CANDIDATE';await runtime.persist(state);
  await runtime.stopCandidates();
  await runtime.verifyCandidatesStopped();
  state.phase='CANDIDATE_STOPPED';await runtime.persist(state);
  await runtime.switchToPrevious();
  state.phase='ROLLED_BACK_PAUSED';await runtime.persist(state);
}
function requireState(value:unknown,code:string):asserts value {if(!value)throw new Error(code);}
const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const shaFile=async(path:string)=>sha(await readFile(path));
function literal(value:unknown){return typeof value==='string'&&value.length>0&&!/[\x00-\x1f]/.test(value);}
function absolute(value:unknown){return literal(value)&&isAbsolute(value as string);}
function hex(value:unknown,length:number){return typeof value==='string'&&new RegExp(`^[a-f0-9]{${length}}$`).test(value);}
export function validatePlan(p:MigrationPlan){
  requireState(p?.schemaVersion===1&&p.officialCommit===OFFICIAL_COMMIT&&hex(p.cmsCommit,40),'VERSION_LOCK_REQUIRED');
  requireState(p.issuer==='http://localhost:3001','ISSUER_MUST_BE_PRESERVED');
  requireState(literal(p.dockerContext)&&/^cms-native-nyxid-[a-z0-9-]+$/.test(p.project)&&/^[a-zA-Z0-9_.-]+$/.test(p.network),'RUNTIME_TARGET_REQUIRED');
  requireState(/^ghcr\.io\/chronoaiproject\/nyxid\/backend@sha256:[a-f0-9]{64}$/.test(p.backendImage)&&/^ghcr\.io\/chronoaiproject\/nyxid\/frontend@sha256:[a-f0-9]{64}$/.test(p.frontendImage),'OFFICIAL_DIGEST_REQUIRED');
  requireState([p.backendPort,p.frontendPort].every(v=>Number.isInteger(v)&&v>1023&&v<65536)&&p.backendPort!==p.frontendPort,'DISTINCT_LOOPBACK_PORTS_REQUIRED');
  requireState([p.backendEnvFile,p.frontendEnvFile,p.keysDirectory,p.tufDirectory,p.stateDirectory,p.independentAcceptancePath].every(absolute),'ABSOLUTE_PRIVATE_PATHS_REQUIRED');
  requireState(Array.isArray(p.cmsDatabases)&&p.cmsDatabases.length>=2&&p.cmsDatabases.every(absolute)&&new Set(p.cmsDatabases).size===p.cmsDatabases.length,'ALL_CMS_DATABASES_REQUIRED');
  requireState(Array.isArray(p.workerContainerIds)&&p.workerContainerIds.every(v=>hex(v,64))&&Array.isArray(p.preservedContainerIds)&&p.preservedContainerIds.length>=6&&p.preservedContainerIds.every(v=>hex(v,64)),'EXACT_CONTAINER_IDS_REQUIRED');
  requireState(hex(p.mongo?.containerId,64)&&absolute(p.mongo?.dumpConfigPathInContainer),'MONGO_BACKUP_TARGET_REQUIRED');
  requireState(Array.isArray(p.backupInputs)&&p.backupInputs.every(v=>['configuration','registration'].includes(v.category)&&absolute(v.path))&&['configuration','registration'].every(c=>p.backupInputs.some(v=>v.category===c)),'CONFIG_AND_REGISTRATION_BACKUPS_REQUIRED');
  requireState(Array.isArray(p.checks)&&p.checks.length>=3&&p.checks.every(c=>{
    if(!literal(c.name))return false;try{const u=new URL(c.url);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.hash&&!u.search;}catch{return false;}
  }),'READ_ONLY_SERVICE_CHECKS_REQUIRED');
  for(const name of ['quiescence','stopPrevious','verifyPreviousStopped','switchToOfficial','switchToPrevious'] as const){
    const h=p.hooks?.[name];requireState(h&&absolute(h.file)&&hex(h.sha256,64)&&Array.isArray(h.args)&&h.args.every(literal),'REVIEWED_HOOK_REQUIRED');
    requireState(!h.file.endsWith('/native-backend-control.py'),'HISTORICAL_ROLLBACK_FORBIDDEN');
  }
}
export function readPausedDatabase(path:string){
  const db=new DatabaseSync(path,{readOnly:true});
  try{
    requireState(db.prepare("SELECT value FROM settings WHERE key='outbound_paused'").get()?.value==='true','OUTBOUND_MUST_ALREADY_BE_PAUSED');
    requireState(!db.prepare("SELECT 1 FROM jobs WHERE state='running' LIMIT 1").get(),'RUNNING_JOBS_MUST_SETTLE');
    return {outboundPaused:true,runningJobs:0};
  }finally{db.close();}
}
export function validateAcceptance(value:any,p:MigrationPlan){
  requireState(value?.status==='ACCEPTED'&&value.cmsCommit===p.cmsCommit&&value.officialCommit===p.officialCommit&&value.backendImage===p.backendImage&&value.frontendImage===p.frontendImage&&value.reviewerThreadId&&value.reviewerThreadId!==value.developerThreadId&&value.organizationApproval==='PASSED'&&value.realInputsVerified===true&&value.blockers?.length===0,'INDEPENDENT_ACCEPTANCE_REQUIRED');
}
export function composeDefinition(p:MigrationPlan){
  return {services:{
    backend:{image:p.backendImage,pull_policy:'never',restart:'no',env_file:[p.backendEnvFile],environment:{HTTP_BIND_ADDR:'0.0.0.0',PORT:'3001',INTERNAL_BIND_ADDR:'0.0.0.0:3002',JWT_ISSUER:p.issuer,BASE_URL:p.issuer,JWT_PRIVATE_KEY_PATH:'/app/keys/private.pem',JWT_PUBLIC_KEY_PATH:'/app/keys/public.pem',NYXID_SERVER_TUF_STATE_DIR:'/var/lib/nyxid/tuf'},ports:[`127.0.0.1:${p.backendPort}:3001`],volumes:[{type:'bind',source:p.keysDirectory,target:'/app/keys',read_only:true},{type:'bind',source:p.tufDirectory,target:'/var/lib/nyxid/tuf'}],networks:['existing'],mem_limit:'2g'},
    frontend:{image:p.frontendImage,pull_policy:'never',restart:'no',env_file:[p.frontendEnvFile],environment:{BACKEND_URL:'http://backend:3001'},ports:[`127.0.0.1:${p.frontendPort}:8080`],networks:['existing'],mem_limit:'256m'}
  },networks:{existing:{external:true,name:p.network}}};
}
async function privatePath(path:string,directory:boolean){
  const s=await lstat(path);requireState(!s.isSymbolicLink()&&(directory?s.isDirectory():s.isFile()),'PRIVATE_PATH_TYPE');
  requireState((s.mode&0o077)===0,'PRIVATE_PATH_PERMISSIONS');
}
async function writeJson(path:string,value:unknown){
  const temporary=`${path}.${randomUUID()}.tmp`;await writeFile(temporary,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});await rename(temporary,path);
}
async function copyTree(source:string,destination:string){
  const s=await lstat(source);requireState(!s.isSymbolicLink(),'BACKUP_SYMLINK_FORBIDDEN');
  if(s.isDirectory()){await mkdir(destination,{mode:0o700});for(const name of await readdir(source))await copyTree(join(source,name),join(destination,name));}
  else{
    requireState(s.isFile(),'BACKUP_SPECIAL_FILE_FORBIDDEN');const data=await readFile(source);
    requireState(!data.includes(Buffer.from(process.env.NATIVE_MIGRATION_BACKUP_KEY!)),'BACKUP_KEY_MUST_STAY_SEPARATE');
    await writeFile(destination,data,{flag:'wx',mode:0o600});
  }
}
async function treeFingerprint(path:string):Promise<string>{
  const s=await lstat(path);requireState(!s.isSymbolicLink(),'BACKUP_SYMLINK_FORBIDDEN');
  if(s.isFile())return shaFile(path);
  requireState(s.isDirectory(),'BACKUP_SPECIAL_FILE_FORBIDDEN');
  const children=[];for(const name of (await readdir(path)).sort())children.push([name,await treeFingerprint(join(path,name))]);
  return sha(JSON.stringify(children));
}
export async function validateHook(h:Hook){
  requireState((await lstat(h.file)).isFile()&&await shaFile(h.file)===h.sha256,'HOOK_PREIMAGE_CHANGED');
}
export async function migrationLock(path:string){
  const handle=await open(path,'wx',0o600);await handle.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()})+'\n');
  return async()=>{await handle.close();await rm(path);};
}
function execute(args:string[],input?:string){return execFileSync(args[0],args.slice(1),{input,encoding:'utf8',timeout:60_000,maxBuffer:16_000_000,stdio:['pipe','pipe','pipe']});}
async function executeHook(h:Hook,requiredTrueFields:string[]=[]){
  await validateHook(h);
  // Hooks and their configuration are private reviewed inputs; never echo output.
  let output:any;try{output=JSON.parse(execute([h.file,...h.args]));}catch{throw new Error('REVIEWED_HOOK_FAILED');}
  requireState(output.status==='OK'&&output.outboundPaused===true&&output.workersStopped===true&&output.activeWrites===0&&output.pendingNyxidRequests===0,'QUIESCENCE_NOT_PROVEN');
  requireState(requiredTrueFields.every(field=>output[field]===true),'PREVIOUS_BACKEND_STOP_NOT_PROVEN');
}
async function main(){
  const [mode='plan',planPath,...flags]=process.argv.slice(2),trace=randomUUID();
  requireState(['plan','preflight','capture','stage','verify','activate','rollback'].includes(mode)&&planPath,'USAGE: native-nyxid-migration.ts MODE PLAN.json [--execute]');
  requireState(flags.every(v=>v==='--execute'),'UNKNOWN_ARGUMENT');
  const p=JSON.parse(await readFile(planPath,'utf8')) as MigrationPlan;
  if(mode==='plan'){
    let blocker:string|null=null;try{validatePlan(p);}catch(e){blocker=(e as Error).message;}
    process.stdout.write(JSON.stringify({trace,status:blocker?'INPUTS_REQUIRED':'PLAN_READY',blocker,productionChanged:false,stages:['preflight','capture','independent acceptance','stage','verify','activate'],rollback:'restore versions/configuration/routes only; never restore databases or resume outbound',officialCommit:OFFICIAL_COMMIT})+'\n');return;
  }
  validatePlan(p);if(['capture','stage','activate','rollback'].includes(mode))requireState(flags.includes('--execute'),'EXECUTE_FLAG_REQUIRED');
  // A stale lock after interruption requires an operator to verify process exit;
  // never guess that an in-flight switch is safe to repeat.
  const release=await migrationLock(p.stateDirectory+'.lock');
  try{
  const docker=(...args:string[])=>execute(['docker','--context',p.dockerContext,...args]);
  const inspect=(id:string)=>JSON.parse(docker('inspect',id))[0];
  const manifestHash=sha(await readFile(planPath));
  const statePath=join(p.stateDirectory,'state.json'),composePath=join(p.stateDirectory,'compose.json');
  const preserved=()=>p.preservedContainerIds.map(id=>{const d=inspect(id);requireState(d.Id===id&&d.State.Running,'PRESERVED_SERVICE_NOT_RUNNING');return {id,image:d.Image};});
  async function paused(){
    for(const path of p.cmsDatabases)readPausedDatabase(path);
    for(const id of p.workerContainerIds){const d=inspect(id);requireState(d.Id===id&&!d.State.Running,'WORKERS_MUST_ALREADY_BE_STOPPED');}
    await executeHook(p.hooks.quiescence);
    return preserved();
  }
  async function preflight(){
    for(const path of [p.backendEnvFile,p.frontendEnvFile])await privatePath(path,false);
    for(const path of [p.keysDirectory,p.tufDirectory])await privatePath(path,true);
    for(const h of Object.values(p.hooks))await validateHook(h);
    const config=await readFile(p.backendEnvFile,'utf8');
    requireState(!/^\s*(?:export\s+)?(?:RECOVERY_BACKUP_KEY|NATIVE_MIGRATION_BACKUP_KEY)\s*=/m.test(config),'BACKUP_KEY_MUST_STAY_SEPARATE');
    const dbLine=config.split('\n').find(line=>/^DATABASE_URL=/.test(line));
    requireState(dbLine&&!/mongodb(?:\+srv)?:\/\/(?:[^@\s]*@)?(?:localhost|127\.0\.0\.1|\[::1\])(?=[:/])/i.test(dbLine),'CONTAINER_DATABASE_ADDRESS_REQUIRED');
    docker('network','inspect',p.network);
    const mongo=inspect(p.mongo.containerId);requireState(mongo.Id===p.mongo.containerId&&mongo.State.Running,'MONGO_CONTAINER_CHANGED');
    for(const image of [p.backendImage,p.frontendImage]){
      const d=JSON.parse(docker('image','inspect',image))[0];
      requireState(d.RepoDigests?.includes(image),'PINNED_IMAGE_NOT_PRESENT');
      requireState(d.Config?.Labels?.['org.opencontainers.image.revision']===OFFICIAL_COMMIT,'OFFICIAL_IMAGE_REVISION_UNVERIFIED');
    }
    return paused();
  }
  if(mode==='preflight'){await preflight();process.stdout.write(JSON.stringify({trace,status:'PREFLIGHT_PASSED',productionChanged:false})+'\n');return;}
  const compose=(...args:string[])=>docker('compose','-p',p.project,'-f',composePath,...args);
  function candidateContainers():CandidateContainer[]{
    return ['backend','frontend'].flatMap(service=>{
      const id=compose('ps','-a','-q',service).trim();if(!id)return [];
      const d=inspect(id),image=service==='backend'?p.backendImage:p.frontendImage;
      requireState(d.Config?.Image===image&&d.Config?.Labels?.['com.docker.compose.project']===p.project&&d.Config?.Labels?.['com.docker.compose.service']===service,'CANDIDATE_IDENTITY_CHANGED');
      return [{service,id:d.Id,image:d.Image}];
    });
  }
  const verifyPreviousStopped=()=>executeHook(p.hooks.verifyPreviousStopped,['previousBackendStopped','previousPortalStopped','previousAutoRestartDisabled']);
  const exclusiveRuntime:ExclusiveRuntime={
    persist:state=>writeJson(statePath,state),
    stopPrevious:()=>executeHook(p.hooks.stopPrevious,['previousBackendStopped','previousPortalStopped','previousAutoRestartDisabled']),
    verifyPreviousStopped,
    startCandidates:async()=>{compose('up','-d','--no-build','--pull','never','backend','frontend');},
    candidates:async()=>candidateContainers(),
    stopCandidates:async()=>{compose('stop','backend','frontend');},
    verifyCandidatesStopped:async()=>{
      for(const candidate of candidateContainers())requireState(inspect(candidate.id).State.Running===false,'CANDIDATE_BACKEND_STILL_RUNNING');
    },
    switchToPrevious:()=>executeHook(p.hooks.switchToPrevious)
  };
  if(mode==='capture'){
    const before=await preflight();await mkdir(p.stateDirectory,{mode:0o700});await privatePath(p.stateDirectory,true);
    requireState(/^[a-f0-9]{64}$/.test(process.env.NATIVE_MIGRATION_BACKUP_KEY??''),'INDEPENDENT_BACKUP_KEY_REQUIRED');
    const temporary=await mkdtemp(join(tmpdir(),'native-nyxid-capture-'));
    try{
      const payload=join(temporary,'payload');await mkdir(payload,{mode:0o700});
      for(const [i,path] of p.cmsDatabases.entries()){
        const db=new DatabaseSync(path,{readOnly:true});try{await backup(db,join(payload,`cms-${i}.sqlite`));}finally{db.close();}
      }
      const inputs=[p.backendEnvFile,p.frontendEnvFile,p.keysDirectory,p.tufDirectory,...p.backupInputs.map(v=>v.path),...Object.values(p.hooks).map(h=>h.file)];
      const inputFingerprints=[];for(const path of inputs)inputFingerprints.push({path,sha256:await treeFingerprint(path)});
      for(const [i,path] of inputs.entries())await copyTree(await realpath(path),join(payload,`private-${i}`));
      await copyFile(planPath,join(payload,'plan.json'));
      await writeJson(join(payload,'mongo-inspect.json'),inspect(p.mongo.containerId));
      const child=spawn('docker',['--context',p.dockerContext,'exec',p.mongo.containerId,'mongodump',`--config=${p.mongo.dumpConfigPathInContainer}`,'--archive','--gzip','--oplog'],{stdio:['ignore','pipe','pipe']});
      child.stderr.resume();const timeout=setTimeout(()=>child.kill('SIGKILL'),60_000);
      const finished=new Promise<void>((yes,no)=>{child.once('error',()=>no(new Error('MONGO_BACKUP_FAILED')));child.once('exit',code=>code===0?yes():no(new Error('MONGO_BACKUP_FAILED')));});
      try{await Promise.all([finished,pipeline(child.stdout,createWriteStream(join(payload,'mongo.archive.gz'),{flags:'wx',mode:0o600}))]);}
      catch(error){child.kill('SIGKILL');throw error;}
      finally{clearTimeout(timeout);}
      const after=await paused();requireState(JSON.stringify(before)===JSON.stringify(after),'PRESERVED_SERVICE_CHANGED');
      for(const input of inputFingerprints)requireState(await treeFingerprint(input.path)===input.sha256,'BACKUP_INPUT_CHANGED');
      await writeJson(join(payload,'manifest.json'),{trace,createdAt:new Date().toISOString(),manifestHash,officialCommit:OFFICIAL_COMMIT,cmsCommit:p.cmsCommit,inputs:inputFingerprints,databases:p.cmsDatabases,mongoOplogIncluded:true});
      const archive=join(temporary,'payload.tgz');execute(['tar','-czf',archive,'-C',payload,'.']);
      const encrypted=join(p.stateDirectory,'backup.enc');await encryptArchive(archive,encrypted,process.env.NATIVE_MIGRATION_BACKUP_KEY!);
      await writeJson(composePath,composeDefinition(p));
      await writeJson(statePath,{phase:'CAPTURED',trace,manifestHash,backupSha256:await shaFile(encrypted),inputFingerprints,preserved:before,createdAt:new Date().toISOString()});
    }finally{await rm(temporary,{recursive:true,force:true});}
  }else{
    await privatePath(p.stateDirectory,true);const state=JSON.parse(await readFile(statePath,'utf8'));
    requireState(state.manifestHash===manifestHash&&state.backupSha256===await shaFile(join(p.stateDirectory,'backup.enc')),'CAPTURE_PREIMAGE_CHANGED');
    requireState(sha(await readFile(composePath))===sha(JSON.stringify(composeDefinition(p),null,2)+'\n'),'COMPOSE_PREIMAGE_CHANGED');
    const before=await paused();requireState(JSON.stringify(before)===JSON.stringify(state.preserved),'PRESERVED_SERVICE_CHANGED');
    if(mode==='stage'||mode==='activate')validateAcceptance(JSON.parse(await readFile(p.independentAcceptancePath,'utf8')),p);
    if(mode!=='stage')requireState(Array.isArray(state.candidateContainers)&&JSON.stringify(candidateContainers())===JSON.stringify(state.candidateContainers),'CANDIDATE_CONTAINER_CHANGED');
    if(mode==='stage'){
      requireState(state.phase==='CAPTURED','STAGE_STATE_REQUIRED');await preflight();
      for(const input of state.inputFingerprints)requireState(await treeFingerprint(input.path)===input.sha256,'CAPTURE_INPUT_CHANGED');
      requireState(!compose('ps','-a','-q').trim(),'EXISTING_CANDIDATE_FORBIDDEN');
      await stageExclusive(state,exclusiveRuntime);
    }else if(mode==='verify'){
      requireState(['STAGED','VERIFIED','ACTIVATED'].includes(state.phase),'STAGED_CANDIDATE_REQUIRED');
      await verifyPreviousStopped();
      const health=await fetch(`http://127.0.0.1:${p.backendPort}/health`,{signal:AbortSignal.timeout(8000)});requireState(health.ok,'CANDIDATE_HEALTH_FAILED');
      const discovery=await fetch(`http://127.0.0.1:${p.backendPort}/.well-known/openid-configuration`,{signal:AbortSignal.timeout(8000)});requireState(discovery.ok&&(await discovery.json()).issuer===p.issuer,'CANDIDATE_ISSUER_CHANGED');
      const frontend=await fetch(`http://127.0.0.1:${p.frontendPort}/`,{signal:AbortSignal.timeout(8000)});requireState(frontend.ok,'FRONTEND_UNREACHABLE');
      for(const check of p.checks)compose('exec','-T','backend','curl','--fail','--silent','--show-error','--max-time','8','--output','/dev/null',check.url);
      state.phase=state.phase==='ACTIVATED'?'ACTIVATED':'VERIFIED';state.verifiedAt=new Date().toISOString();
    }else if(mode==='activate'){
      requireState(state.phase==='VERIFIED','VERIFIED_CANDIDATE_REQUIRED');
      await verifyPreviousStopped();
      // Exact process incarnation, routing, registration preimages and LAN/OIDC
      // invariants are checked by a separately reviewed deployment-specific hook.
      state.phase='ACTIVATING';await writeJson(statePath,state);await executeHook(p.hooks.switchToOfficial);await verifyPreviousStopped();state.phase='ACTIVATED';
    }else if(mode==='rollback'){
      requireState(['STOPPING_PREVIOUS','PREVIOUS_STOPPED','STAGING','STAGED','VERIFIED','ACTIVATING','ACTIVATED','STOPPING_CANDIDATE','CANDIDATE_STOPPED','ROLLBACK_REQUIRED'].includes(state.phase),'ROLLBACK_STATE_REQUIRED');
      await rollbackExclusive(state,exclusiveRuntime);
    }
    const after=await paused();requireState(JSON.stringify(before)===JSON.stringify(after),'PRESERVED_SERVICE_CHANGED');
    state.updatedAt=new Date().toISOString();await writeJson(statePath,state);
  }
  process.stdout.write(JSON.stringify({trace,status:mode.toUpperCase()+'_COMPLETED',outboundPaused:true,databaseRestored:false})+'\n');
  }finally{await release();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(error=>{process.stderr.write(JSON.stringify({event:'native-migration.failed',trace:randomUUID(),code:error instanceof Error&&/^[A-Z_][A-Z_ :.-]*$/.test(error.message)?error.message:'OPERATION_FAILED',details:'No credentials or subprocess output emitted; inspect private deployment inputs'})+'\n');process.exitCode=1;});
}
