import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
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
