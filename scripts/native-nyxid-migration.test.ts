import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {OFFICIAL_COMMIT,validatePlan,validateAcceptance,readPausedDatabase,composeDefinition,validateHook,migrationLock,stageExclusive,rollbackExclusive,type MigrationPlan,type ExclusiveRuntime,type ExclusiveState} from './native-nyxid-migration.ts';
const hook=(name:string)=>({file:`/private/${name}`,sha256:'e'.repeat(64),args:[]});
const plan=():MigrationPlan=>({schemaVersion:1,officialCommit:OFFICIAL_COMMIT,cmsCommit:'a'.repeat(40),dockerContext:'test-context',project:'cms-native-nyxid-fixture',issuer:'http://localhost:3001',backendImage:`ghcr.io/chronoaiproject/nyxid/backend@sha256:${'b'.repeat(64)}`,frontendImage:`ghcr.io/chronoaiproject/nyxid/frontend@sha256:${'c'.repeat(64)}`,backendPort:33003,frontendPort:33000,backendEnvFile:'/private/backend.env',frontendEnvFile:'/private/frontend.env',keysDirectory:'/private/keys',tufDirectory:'/private/tuf',network:'fixture-network',stateDirectory:'/private/state',independentAcceptancePath:'/private/review.json',cmsDatabases:['/private/a.sqlite','/private/b.sqlite'],workerContainerIds:[],preservedContainerIds:Array.from({length:6},(_,i)=>String(i).repeat(64)),mongo:{containerId:'d'.repeat(64),dumpConfigPathInContainer:'/private/mongodump.yml'},backupInputs:[{category:'configuration',path:'/private/config'},{category:'registration',path:'/private/registration'}],checks:[{name:'cms-a',url:'http://host.docker.internal:3457/health'},{name:'cms-b',url:'http://host.docker.internal:3458/health'},{name:'agent',url:'http://host.docker.internal:8088/health'}],hooks:{quiescence:hook('quiescence'),stopPrevious:hook('stopPrevious'),verifyPreviousStopped:hook('verifyPreviousStopped'),switchToOfficial:hook('switchToOfficial'),switchToPrevious:hook('switchToPrevious')}});

test('migration requires exact official image identities and preserves the established issuer',()=>{
  validatePlan(plan());
  for(const patch of [{backendImage:'ghcr.io/chronoaiproject/nyxid/backend:latest'},{issuer:'http://host.docker.internal:3001'},{officialCommit:'0'.repeat(40)}])assert.throws(()=>validatePlan({...plan(),...patch}));
  const p=plan();p.hooks.switchToPrevious.file='/private/native-backend-control.py';assert.throws(()=>validatePlan(p),/HISTORICAL_ROLLBACK_FORBIDDEN/);
});
test('staging uses only explicit loopback ports, no local builds, and durable existing key/TUF paths',()=>{
  const p=plan(),c=composeDefinition(p);assert.deepEqual(c.services.backend.ports,['127.0.0.1:33003:3001']);assert.deepEqual(c.services.frontend.ports,['127.0.0.1:33000:8080']);
  assert.equal(c.services.backend.environment.HTTP_BIND_ADDR,'0.0.0.0');assert.equal(c.services.backend.environment.JWT_ISSUER,p.issuer);assert.equal(c.services.backend.image,p.backendImage);assert.equal(c.services.backend.pull_policy,'never');assert.equal('build' in c.services.backend,false);assert.equal(c.services.backend.volumes[1].source,p.tufDirectory);
});
test('independent acceptance cannot omit organization approval or approve a different artifact',()=>{
  const p=plan(),approval={status:'ACCEPTED',cmsCommit:p.cmsCommit,officialCommit:p.officialCommit,backendImage:p.backendImage,frontendImage:p.frontendImage,reviewerThreadId:'review',developerThreadId:'development',organizationApproval:'PASSED',realInputsVerified:true,blockers:[]};
  validateAcceptance(approval,p);
  for(const patch of [{organizationApproval:'BLOCKED'},{reviewerThreadId:'development'},{cmsCommit:'f'.repeat(40)},{blockers:['M0']},{realInputsVerified:false}])assert.throws(()=>validateAcceptance({...approval,...patch},p),/INDEPENDENT_ACCEPTANCE_REQUIRED/);
});
test('pause preflight does not write, resume or normalize interrupted jobs',async()=>{
  const d=await mkdtemp(join(tmpdir(),'native-migration-test-')),path=join(d,'cms.sqlite'),db=new DatabaseSync(path);
  try{
    db.exec("CREATE TABLE settings(key TEXT,value TEXT);CREATE TABLE jobs(state TEXT);INSERT INTO settings VALUES('outbound_paused','false')");
    assert.throws(()=>readPausedDatabase(path),/OUTBOUND_MUST_ALREADY_BE_PAUSED/);assert.equal(db.prepare('SELECT value FROM settings').get()?.value,'false');
    db.exec("UPDATE settings SET value='true';INSERT INTO jobs VALUES('running')");assert.throws(()=>readPausedDatabase(path),/RUNNING_JOBS_MUST_SETTLE/);assert.equal(db.prepare('SELECT state FROM jobs').get()?.state,'running');
    db.exec("UPDATE jobs SET state='uncertain'");assert.deepEqual(readPausedDatabase(path),{outboundPaused:true,runningJobs:0});assert.equal(db.prepare('SELECT state FROM jobs').get()?.state,'uncertain');
  }finally{db.close();await rm(d,{recursive:true,force:true});}
});
test('reviewed deployment hook changes are rejected before invocation',async()=>{
  const d=await mkdtemp(join(tmpdir(),'native-migration-hook-')),file=join(d,'hook');
  try{await writeFile(file,'original');const h={file,sha256:createHash('sha256').update('original').digest('hex'),args:[]};await validateHook(h);await writeFile(file,'changed');await assert.rejects(validateHook(h),/HOOK_PREIMAGE_CHANGED/);}finally{await rm(d,{recursive:true,force:true});}
});
test('concurrent migration operations cannot share an active lock',async()=>{
  const d=await mkdtemp(join(tmpdir(),'native-migration-lock-')),path=join(d,'migration.lock');
  try{const release=await migrationLock(path);await assert.rejects(migrationLock(path),{code:'EEXIST'});await release();const again=await migrationLock(path);await again();}finally{await rm(d,{recursive:true,force:true});}
});

function exclusiveFixture(){
  const events:string[]=[],saved:ExclusiveState[]=[],running={previous:true,candidate:false,created:false,outboundPaused:true};
  let failAt:string|undefined;
  function event(name:string){events.push(name);assert.equal(running.previous&&running.candidate,false,'two backend writers overlapped');if(failAt===name)throw new Error(name);}
  const runtime:ExclusiveRuntime={
    persist:async state=>{saved.push(structuredClone(state));event(`state:${state.phase}`);},
    stopPrevious:async()=>{event('stop:previous');running.previous=false;},
    verifyPreviousStopped:async()=>{event('inspect:previous-stopped');assert.equal(running.previous,false);},
    startCandidates:async()=>{event('docker:up');assert.equal(running.previous,false);running.candidate=true;running.created=true;event('docker:up-started');},
    candidates:async()=>{event('docker:inspect-identities');return running.created?[{service:'backend',id:'candidate-id',image:'official-image'}]:[];},
    stopCandidates:async()=>{event('docker:stop');running.candidate=false;},
    verifyCandidatesStopped:async()=>{event('docker:inspect-stopped');assert.equal(running.candidate,false);},
    switchToPrevious:async()=>{event('start:previous');assert.equal(running.candidate,false);running.previous=true;}
  };
  return {runtime,events,saved,running,fail:(name?:string)=>{failAt=name;}};
}
test('stage stops and independently verifies the previous backend before docker up',async()=>{
  const f=exclusiveFixture(),state:ExclusiveState={phase:'CAPTURED'};await stageExclusive(state,f.runtime);
  assert.deepEqual(f.events.filter(v=>!v.startsWith('state:')),['stop:previous','inspect:previous-stopped','docker:up','docker:up-started','docker:inspect-identities','inspect:previous-stopped']);
  assert.equal(state.phase,'STAGED');assert.equal(f.running.previous,false);assert.equal(f.running.candidate,true);assert.equal(f.running.outboundPaused,true);
  assert.equal(f.saved.find(v=>v.phase==='STAGING')?.candidateContainers?.length,0);assert.equal(state.candidateContainers?.[0]?.id,'candidate-id');
});
test('a failed previous stop or stop verification cannot start a candidate backend',async()=>{
  for(const failAt of ['stop:previous','inspect:previous-stopped']){
    const f=exclusiveFixture(),state:ExclusiveState={phase:'CAPTURED'};f.fail(failAt);await assert.rejects(stageExclusive(state,f.runtime),new RegExp(failAt));
    assert.equal(f.events.includes('docker:up'),false);assert.equal(f.running.candidate,false);assert.equal(state.phase,'STOPPING_PREVIOUS');assert.equal(f.running.outboundPaused,true);
  }
});
test('partial docker startup records candidate identity and rolls back by stopping it before old backend restart',async()=>{
  const f=exclusiveFixture(),state:ExclusiveState={phase:'CAPTURED'};f.fail('docker:up-started');await assert.rejects(stageExclusive(state,f.runtime),/docker:up-started/);
  assert.equal(state.phase,'STAGING');assert.equal(state.candidateContainers?.[0]?.id,'candidate-id');assert.equal(f.running.previous,false);assert.equal(f.running.candidate,true);
  f.fail();f.events.length=0;await rollbackExclusive(state,f.runtime);
  assert.deepEqual(f.events.filter(v=>!v.startsWith('state:')),['docker:stop','docker:inspect-stopped','start:previous']);
  assert.equal(state.phase,'ROLLED_BACK_PAUSED');assert.equal(f.running.previous,true);assert.equal(f.running.candidate,false);assert.equal(f.running.outboundPaused,true);
});
test('failed candidate stop or stopped-state inspection never restarts previous backend',async()=>{
  for(const failAt of ['docker:stop','docker:inspect-stopped']){
    const f=exclusiveFixture();f.running.previous=false;f.running.candidate=true;f.running.created=true;f.fail(failAt);
    const state:ExclusiveState={phase:'ACTIVATED'};await assert.rejects(rollbackExclusive(state,f.runtime),new RegExp(failAt));
    assert.equal(f.events.includes('start:previous'),false);assert.equal(f.running.previous,false);assert.equal(state.phase,'STOPPING_CANDIDATE');assert.equal(f.running.outboundPaused,true);
    f.fail();await rollbackExclusive(state,f.runtime);assert.equal(state.phase,'ROLLED_BACK_PAUSED');
  }
});
test('failed previous restart leaves both backends stopped and rollback can resume',async()=>{
  const f=exclusiveFixture();f.running.previous=false;f.running.candidate=true;f.running.created=true;f.fail('start:previous');
  const state:ExclusiveState={phase:'VERIFIED'};await assert.rejects(rollbackExclusive(state,f.runtime),/start:previous/);
  assert.equal(state.phase,'CANDIDATE_STOPPED');assert.equal(f.running.previous,false);assert.equal(f.running.candidate,false);assert.equal(f.running.outboundPaused,true);
  f.fail();await rollbackExclusive(state,f.runtime);assert.equal(state.phase,'ROLLED_BACK_PAUSED');assert.equal(f.running.previous,true);
});

// NR-MIGRATION-02: a new OS process sees the last durable STAGING state. No
// stageExclusive finally block is run by this fixture before invoking the CLI.
async function interruptedCliFixture(recorded:'empty'|'missing'|'partial'='empty',wrongLabel=false){
  const root=await mkdtemp(join(tmpdir(),'native-migration-nr02-')),p=plan(),hash=(v:string)=>createHash('sha256').update(v).digest('hex');
  const json=async(path:string,value:unknown)=>writeFile(path,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  p.stateDirectory=join(root,'state');await mkdir(p.stateDirectory,{mode:0o700});await mkdir(join(root,'bin'),{mode:0o700});
  p.cmsDatabases=[join(root,'a.sqlite'),join(root,'b.sqlite')];
  for(const path of p.cmsDatabases){const db=new DatabaseSync(path);db.exec("CREATE TABLE settings(key TEXT,value TEXT);CREATE TABLE jobs(state TEXT);INSERT INTO settings VALUES('outbound_paused','true')");db.close();}
  const fakeState=join(root,'fake-docker.json');
  const hookFile=join(root,'hook'),hookText=`#!${process.execPath}\nconst fs=require('node:fs');const file=process.env.NATIVE_MIGRATION_TEST_STATE;const d=JSON.parse(fs.readFileSync(file,'utf8'));const action=process.argv[2];d.events.push('hook:'+action);if(action==='switchToPrevious'){if(d.containers.some(c=>c.State.Running))process.exit(8);d.previousRunning=true;}fs.writeFileSync(file,JSON.stringify(d));process.stdout.write(JSON.stringify({status:'OK',outboundPaused:true,workersStopped:true,activeWrites:0,pendingNyxidRequests:0,previousBackendStopped:true,previousPortalStopped:true,previousAutoRestartDisabled:true}));\n`;
  await writeFile(hookFile,hookText,{mode:0o700});
  for(const name of Object.keys(p.hooks) as Array<keyof MigrationPlan['hooks']>)p.hooks[name]={file:hookFile,sha256:hash(hookText),args:[name]};
  const manifest=join(root,'manifest.json');await json(manifest,p);const manifestHash=hash(await readFile(manifest,'utf8'));
  const attempt={version:1,id:'5a263a52-03e7-4a42-8dc7-4bca35d979db',manifestHash,images:{backend:`sha256:${'a'.repeat(64)}`,frontend:`sha256:${'b'.repeat(64)}`}};
  const containers=['backend','frontend'].map((service,index)=>({Id:String(index+7).repeat(64),Image:attempt.images[service as 'backend'|'frontend'],Config:{Image:service==='backend'?p.backendImage:p.frontendImage,Labels:{'com.docker.compose.project':p.project,'com.docker.compose.service':service,'com.docker.compose.project.config_files':join(p.stateDirectory,'compose.json'),'io.chronoai.cms-native-migration.attempt':wrongLabel?'another-run':attempt.id,'io.chronoai.cms-native-migration.manifest':manifestHash}},State:{Running:true}}));
  const state:any={phase:'STAGING',manifestHash,backupSha256:hash('synthetic encrypted backup'),preserved:p.preservedContainerIds.map(id=>({id,image:'preserved-image'})),candidateAttempt:attempt};
  if(recorded!=='missing')state.candidateContainers=recorded==='partial'?[{service:'backend',id:containers[0].Id,image:containers[0].Image}]:[];
  await writeFile(join(p.stateDirectory,'backup.enc'),'synthetic encrypted backup',{mode:0o600});
  await json(join(p.stateDirectory,'state.json'),state);
  await json(join(p.stateDirectory,'compose.json'),(composeDefinition as (p:MigrationPlan,attempt:any)=>unknown)(p,attempt));
  await json(fakeState,{events:[],containers,previousRunning:false,preservedIds:p.preservedContainerIds});
  const dockerText=`#!${process.execPath}\nconst fs=require('node:fs');const file=process.env.NATIVE_MIGRATION_TEST_STATE;const d=JSON.parse(fs.readFileSync(file,'utf8'));const a=process.argv.slice(2);if(a[0]==='--context')a.splice(0,2);let out;
if(a[0]==='inspect'){const id=a[1];const c=d.containers.find(c=>c.Id===id);d.events.push('inspect:'+id+':'+(c?c.State.Running:'preserved'));out=c?[c]:d.preservedIds.includes(id)?[{Id:id,Image:'preserved-image',State:{Running:true}}]:null;if(!out)process.exit(4);}
else if(a[0]==='ps'){const f=a[a.indexOf('--filter')+1];const [key,...rest]=f.slice(6).split('=');out=d.containers.filter(c=>c.Config.Labels[key]===rest.join('=')).map(c=>c.Id).join('\\n');d.events.push('docker:ps');}
else if(a[0]==='compose'&&a.includes('ps')){const service=a.at(-1);out=d.containers.filter(c=>c.Config.Labels['com.docker.compose.service']===service).map(c=>c.Id).join('\\n');}
else if(a[0]==='stop'){const id=a.at(-1),c=d.containers.find(c=>c.Id===id);if(!c)process.exit(5);c.State.Running=false;d.events.push('stop:'+id);out=id;}
else if(a[0]==='compose'&&a.includes('stop')){d.events.push('unsafe-compose-stop');process.exit(6);}
else{d.events.push('unexpected:'+a.join(' '));fs.writeFileSync(file,JSON.stringify(d));process.exit(7);}
fs.writeFileSync(file,JSON.stringify(d));process.stdout.write(typeof out==='string'?out:JSON.stringify(out));\n`;
  await writeFile(join(root,'bin','docker'),dockerText,{mode:0o700});
  return {root,p,containers,fakeState,manifest,run:()=>spawnSync(process.execPath,[fileURLToPath(new URL('./native-nyxid-migration.ts',import.meta.url)),'rollback',manifest,'--execute'],{encoding:'utf8',env:{...process.env,PATH:join(root,'bin')+':'+process.env.PATH,NATIVE_MIGRATION_TEST_STATE:fakeState},timeout:20_000}),read:async()=>JSON.parse(await readFile(fakeState,'utf8')),state:async()=>JSON.parse(await readFile(join(p.stateDirectory,'state.json'),'utf8'))};
}
test('NR-MIGRATION-02 restarted CLI recovers owned containers from durable STAGING without completed identity bookkeeping',async()=>{
  for(const recorded of ['empty','missing','partial'] as const){
    const f=await interruptedCliFixture(recorded);
    try{
      const result=f.run();assert.equal(result.status,0,result.stderr);const d=await f.read(),state=await f.state();
      assert.equal(state.phase,'ROLLED_BACK_PAUSED');assert.equal(state.candidateContainers.length,2);assert.equal(state.identityRecovery.defect,'NR-MIGRATION-02');assert.equal(d.previousRunning,true);assert.equal(d.containers.some((c:any)=>c.State.Running),false);
      const restart=d.events.indexOf('hook:switchToPrevious');assert.ok(restart>=0);
      for(const c of f.containers){const stopped=d.events.indexOf('stop:'+c.Id),verified=d.events.lastIndexOf('inspect:'+c.Id+':false');assert.ok(stopped>=0&&stopped<restart);assert.ok(verified>stopped&&verified<restart);}
      assert.equal(d.events.includes('unsafe-compose-stop'),false);
    }finally{await rm(f.root,{recursive:true,force:true});}
  }
});
test('NR-MIGRATION-02 restarted CLI refuses a same-project foreign run without stopping containers or restoring previous backend',async()=>{
  const f=await interruptedCliFixture('empty',true);
  try{
    const result=f.run();assert.equal(result.status,1);assert.match(result.stderr,/CANDIDATE_IDENTITY_UNPROVEN_MANUAL_RECOVERY_REQUIRED/);const d=await f.read();
    assert.equal(d.events.some((v:string)=>v.startsWith('stop:')||v==='unsafe-compose-stop'||v==='hook:switchToPrevious'),false);assert.equal(d.previousRunning,false);assert.equal(d.containers.every((c:any)=>c.State.Running),true);assert.equal((await f.state()).phase,'STAGING');
  }finally{await rm(f.root,{recursive:true,force:true});}
});
test('NR-MIGRATION-02 restarted CLI requires all durable identity anchors, not project or image name alone',async()=>{
  for(const field of ['manifest-label','image-id','compose-path','duplicate-service','legacy-attempt'] as const){
    const f=await interruptedCliFixture();
    try{
      const d=await f.read();
      if(field==='legacy-attempt'){const state=await f.state();delete state.candidateAttempt;await writeFile(join(f.p.stateDirectory,'state.json'),JSON.stringify(state));}
      else{
        const c=d.containers[1];
        if(field==='manifest-label')c.Config.Labels['io.chronoai.cms-native-migration.manifest']='f'.repeat(64);
        if(field==='image-id')c.Image='sha256:'+'f'.repeat(64);
        if(field==='compose-path')c.Config.Labels['com.docker.compose.project.config_files']='/another/chat/compose.json';
        if(field==='duplicate-service'){c.Config.Labels['com.docker.compose.service']='backend';c.Config.Image=f.p.backendImage;c.Image=d.containers[0].Image;}
        await writeFile(f.fakeState,JSON.stringify(d));
      }
      const result=f.run();assert.equal(result.status,1,field);assert.match(result.stderr,/CANDIDATE_IDENTITY_UNPROVEN_MANUAL_RECOVERY_REQUIRED/,field);
      const after=await f.read();assert.equal(after.events.some((v:string)=>v.startsWith('stop:')||v==='unsafe-compose-stop'||v==='hook:switchToPrevious'),false,field);assert.equal(after.previousRunning,false,field);assert.equal((await f.state()).phase,'STAGING',field);
    }finally{await rm(f.root,{recursive:true,force:true});}
  }
});
