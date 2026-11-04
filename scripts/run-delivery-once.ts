/** Operator-only bounded delivery runner. The default preflight opens SQLite read-only. */
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {parseArgs} from 'node:util';
import {AppError,requireValue,text} from '../src/errors.ts';

function argumentsForRun(args:string[]){
  let parsed;
  try{parsed=parseArgs({args,strict:true,allowPositionals:false,tokens:true,options:{delivery:{type:'string'},execute:{type:'boolean'},'dry-run':{type:'boolean'}}});}
  catch{throw new AppError(400,'INVALID_INPUT','Use --delivery <id> with optional --execute or --dry-run');}
  const options=parsed.tokens.filter(token=>token.kind==='option').map(token=>token.name);
  requireValue(new Set(options).size===options.length&&!(parsed.values.execute&&parsed.values['dry-run']),400,'INVALID_INPUT','Specify each option once and choose either execute or dry-run');
  const id=text(parsed.values.delivery,'delivery');
  requireValue(id===id.trim()&&!/[\x00-\x1f\x7f]/.test(id),400,'INVALID_INPUT','Invalid delivery identifier');
  return {id,execute:parsed.values.execute===true};
}

function publicLink(value:unknown){
  if(typeof value!=='string')return null;
  try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?`${url.origin}${url.pathname}`:null;}
  catch{return null;}
}

function preflight(database:string,id:string){
  const db=new DatabaseSync(database,{readOnly:true});
  try{
    const row=db.prepare(`SELECT d.id,d.owner_id,d.connection_id,d.target,d.action,d.digest,d.state,d.remote_id,d.url,d.source_verified,d.error_code,d.trace_id,
      j.state AS job_state,j.lease_until,
      EXISTS (SELECT 1 FROM recovery_actors a WHERE a.kind='delivery' AND a.resource_id=d.id) AS recovery_actor
      FROM deliveries d LEFT JOIN jobs j ON j.kind='delivery' AND j.resource_id=d.id WHERE d.id=?`).get(id);
    requireValue(row,404,'NOT_FOUND','Delivery not found');
    const outboundPaused=db.prepare("SELECT value FROM settings WHERE key='outbound_paused'").get()?.value!=='false';
    const expired=row.job_state==='running'&&typeof row.lease_until==='string'&&row.lease_until<=new Date().toISOString();
    const recovery=row.state==='uncertain'||expired;
    const eligible=(row.job_state==='queued'||expired)&&(!outboundPaused||(recovery&&row.recovery_actor===1));
    return {outboundPaused,eligible,requiresReadOnlyReconciliation:recovery,delivery:{id:row.id,ownerId:row.owner_id,connectionId:row.connection_id,target:row.target,action:row.action,digest:row.digest,state:row.state,remoteId:row.remote_id,url:publicLink(row.url),sourceVerified:row.source_verified===1,errorCode:row.error_code,traceId:row.trace_id,jobState:row.job_state??null}};
  }finally{db.close();}
}

async function execute(database:string,id:string,traceId:string){
  // No runtime imports, migrations, credential reads or network calls occur during preflight.
  const [{loadConfig},{Store},{Vault},{Policy},{ContentService},{NyxAuthority},{PublishingService},{GhostAdapter},{DistributionService,DeliveryWorker},{createTargets},{MetricsService}]=await Promise.all([
    import('../src/config.ts'),import('../src/store.ts'),import('../src/vault.ts'),import('../src/policy.ts'),import('../src/content.ts'),import('../src/nyxid.ts'),import('../src/publishing.ts'),import('../src/ghost.ts'),import('../src/distribution.ts'),import('../src/targets.ts'),import('../src/metrics.ts'),
  ]);
  const config=loadConfig(),store=new Store(database);
  try{
    const nyx=new NyxAuthority(config,store),content=new ContentService(store,new Policy(store,nyx));
    const metrics=new MetricsService(content,{enabled:config.analyticsEnabled,requireConsent:config.requireConsent,secret:config.trackingSecret});
    const originals=new PublishingService(content,new Vault(config.encryptionKey));
    const ghost=new GhostAdapter(store,config.publicMediaDirectory,config.allowLoopback,process.env,{metrics,publicUrl:config.publicUrl,requireConsent:config.requireConsent});
    const owner=store.get('SELECT owner_id FROM deliveries WHERE id=?',id);requireValue(owner,404,'NOT_FOUND','Delivery not found');
    store.audit('operator-cli',owner.owner_id,'operator.delivery.once',id,traceId);
    return await new DeliveryWorker(new DistributionService(originals,nyx,createTargets()),ghost).once(id);
  }finally{store.close();}
}

const traceId=randomUUID();
try{
  const input=argumentsForRun(process.argv.slice(2)),database=resolve(process.env.DATABASE_PATH??'.runtime/platform.sqlite');
  const before=preflight(database,input.id);
  if(!input.execute)process.stdout.write(JSON.stringify({mode:'preflight',traceId,...before})+'\n');
  else{
    requireValue(before.eligible,409,'DELIVERY_NOT_RUNNABLE','Selected delivery is not runnable; inspect its state, lease and outbound pause');
    const processed=await execute(database,input.id,traceId);
    process.stdout.write(JSON.stringify({mode:'execute',traceId,processed,...preflight(database,input.id)})+'\n');
    if(!processed)process.exitCode=2;
  }
}catch(error){
  const known=error instanceof AppError;
  process.stderr.write(JSON.stringify({code:known?error.code:'INTERNAL',message:known?error.message:'Delivery operation failed; inspect the protected runtime with this Trace ID',traceId})+'\n');
  process.exitCode=1;
}
