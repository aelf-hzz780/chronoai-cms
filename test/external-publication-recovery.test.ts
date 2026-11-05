import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture} from './helpers.ts';
import {Store} from '../src/store.ts';
import {Policy,type Actor} from '../src/policy.ts';
import {ContentService} from '../src/content.ts';
import {MediaService} from '../src/media.ts';
import {Vault} from '../src/vault.ts';
import {PublishingService,ReleaseWorker,type OriginalAdapter} from '../src/publishing.ts';
import {DistributionService,DeliveryWorker,type Connections} from '../src/distribution.ts';
import {ExternalPublicationService} from '../src/external-publication.ts';
import {DevAdapter,TargetRegistry,type RemoteRequest} from '../src/targets.ts';
import {encryptArchive,decryptArchive,snapshotPlatform,isolateRestoredPlatform} from '../src/recovery.ts';
import {createApp} from '../src/app.ts';

type Intent=Awaited<ReturnType<ExternalPublicationService['prepare']>>;
const preservedTables=[
  'external_publications','external_publication_observations','external_metrics','delivery_payloads',
  'deliveries','delivery_events','delivery_notes','idempotency','releases','revisions','assets',
] as const;
const rows=(store:Store,table:string)=>store.all(`SELECT * FROM ${table} ORDER BY rowid`);

async function evidence(name:string,details:Record<string,unknown>){
  const directory=process.env.EXTERNAL_RECOVERY_EVIDENCE_DIR;if(!directory)return;
  await mkdir(directory,{recursive:true});
  await writeFile(join(directory,name+'.json'),JSON.stringify({
    status:'PASS',classification:'LOCAL_ENCRYPTED_SQLITE_RESTORE_WITH_HTTP_PROVIDER_FIXTURE',
    at:new Date().toISOString(),requirements:['D9','A49','A50'],
    realComponents:['Store','AES-GCM snapshot/restore','Policy','CMS HTTP routes','ExternalPublicationService','DevAdapter','Workers'],
    fixtureComponents:['identity authority','Ghost original adapter','loopback DEV HTTP responses'],
    realNyxId:false,realDev:false,externalProviderWrites:0,productionRpoRtoVerified:false,...details,
  },null,2)+'\n');
}

/** Provider state is placed by the fixture, never by a CMS write request. */
async function recoveryFixture(t:TestContext){
  const directory=await mkdtemp(join(tmpdir(),'chrono-external-recovery-'));
  const f=fixture(),vault=new Vault(randomBytes(32).toString('hex'));
  const originalActor:Actor={...f.actors.solo,credential:'synthetic-original-'+randomUUID()};
  const freshActor:Actor={...originalActor,credential:'synthetic-fresh-'+randomUUID()};
  const revokedCredentials=new Set<string>();
  f.policy.authority.validate=async actor=>{
    if(revokedCredentials.has(actor.credential)||f.revoked.has(actor.subject))throw new Error('Synthetic identity is no longer valid');
  };
  const posts=new Map<string,Record<string,any>>();
  const requests:Array<{method:string;path:string}>=[];
  const callers:Actor[]=[];
  let restoredStore:Store|undefined;
  let accountId='4223973',originalWrites=0;
  const server=createServer((request,response)=>{
    const method=request.method??'',url=new URL(request.url??'/', 'http://127.0.0.1');
    requests.push({method,path:url.pathname});response.setHeader('content-type','application/json');
    if(method!=='GET'){response.statusCode=405;response.end(JSON.stringify({error:'Fixture never accepts writes'}));return;}
    const id=url.pathname.split('/').at(-1)!;
    if(url.pathname==='/api/articles/me/all'||url.pathname==='/api/articles/me/published')response.end(JSON.stringify([...posts.values()]));
    else if(/^\/api\/articles\/\d+$/.test(url.pathname)&&posts.has(id))response.end(JSON.stringify(posts.get(id)));
    else{response.statusCode=404;response.end(JSON.stringify({error:'Not found'}));}
  });
  t.after(async()=>{server.close();server.closeAllConnections();restoredStore?.close();f.store.close();await rm(directory,{recursive:true,force:true});});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const origin=`http://127.0.0.1:${address.port}`;
  const logicalOrigin='https://dev.fixture.invalid';
  const connections:Connections={
    async connection(_actor,_owner,id,target){
      assert.equal(id,'dev-connection');assert.equal(target,'dev');
      return {id,target,accountId,active:true,canPublish:true,canUpdate:true,executionApproval:'native'};
    },
    async approval(){assert.fail('External record recovery must not grant approval');},
    async execute(actor,input){
      const request=input.request as RemoteRequest;
      const url=new URL(request.url);
      assert.equal(url.origin,logicalOrigin,'Only the configured synthetic provider may be addressed');
      callers.push({...actor});
      const response=await fetch(origin+url.pathname+url.search,{method:request.method,redirect:'error',signal:AbortSignal.timeout(5000)});
      assert.equal(input.readOnly,true,'Recovery reads must be marked read-only');
      return {accountId,status:response.status,body:await response.json()};
    },
  };
  const original:OriginalAdapter={
    async publish(input){originalWrites++;return {remoteId:'ghost-'+input.articleId,url:`https://blog.example/${input.articleId}/`};},
    async verify(){return true;},async reconcile(){return null;},
    async unpublish(){originalWrites++;assert.fail('Recovery must not unpublish the original');},
  };
  const targets=new TargetRegistry([new DevAdapter(logicalOrigin+'/api')]);
  function services(store:Store){
    const policy=new Policy(store,f.policy.authority),content=new ContentService(store,policy);
    const publishing=new PublishingService(content,vault),distribution=new DistributionService(publishing,connections,targets);
    return {policy,content,publishing,distribution,external:new ExternalPublicationService(distribution,original)};
  }
  const source=services(f.store);
  f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site','solo','en','https://blog.example','FIXTURE_KEY_REFERENCE');
  async function newOriginal(label:string,publish=true){
    const article=await source.content.create(originalActor,{ownerId:'solo',language:'en',title:label,markdown:`# ${label}\r\n\r\nFrozen 中文 Markdown.\r\n`,creditedAuthor:'Solo author'},label+'-draft');
    const release=await source.publishing.confirm(originalActor,article.id,{ownerId:'solo',revisionId:article.revision.id,creditedAuthor:'Solo author',action:'publish',rightsConfirmed:true,idempotencyKey:label+'-original'},label+'-confirm');
    if(publish){assert.equal(await new ReleaseWorker(source.publishing,original).once(),true);assert.equal(f.store.get('SELECT state FROM releases WHERE id=?',release.id)!.state,'published');}
    return {article,release};
  }
  const prepareInput=(key:string)=>({target:'dev',connectionId:'dev-connection',action:'create',format:'full',rightsConfirmed:true,idempotencyKey:key});
  async function prepare(label:string){
    const value=await newOriginal(label);const input=prepareInput(label+'-prepare');
    return {...value,input,intent:await source.external.prepare(originalActor,value.release.id,input,label+'-prepare')};
  }
  function place(intent:Intent,id:string){
    const body=intent.request.body.article;
    posts.set(id,{...body,id:Number(id),user:{user_id:Number(accountId)},url:`https://dev.to/fixture/${id}`,published_at:new Date().toISOString(),page_views_count:17,public_reactions_count:3,comments_count:2});
  }
  const first=await prepare('published');place(first.intent,'100');
  await source.external.register(originalActor,first.intent.id,{remoteId:'100',idempotencyKey:'first-register'},'first-register');
  const updateInput={...first.input,action:'update',copyId:first.intent.id,format:'excerpt',excerpt:'Approved correction excerpt',idempotencyKey:'update-prepare'};
  const current=await source.external.prepare(originalActor,first.release.id,updateInput,'update-prepare');place(current,'100');
  await source.external.register(originalActor,current.id,{remoteId:'100',idempotencyKey:'update-register'},'update-register');
  await source.external.sync(originalActor,current.id,'initial-metrics');
  await source.external.followUp(originalActor,current.id,{action:'removal',note:'Operator follow-up must survive recovery'},'removal-note');
  const pending=await prepare('pending'),uncertain=await prepare('uncertain'),cancelled=await prepare('cancelled');
  assert.equal((await source.external.reconcile(originalActor,uncertain.intent.id,'missing-receipt')).state,'uncertain');
  await source.external.cancel(originalActor,cancelled.intent.id,'cancel-before-restore');
  // An unexecuted original proves that the restored outbound pause is effective.
  const queuedOriginal=await newOriginal('queued-original',false);
  f.store.run('INSERT INTO sessions VALUES (?,?,?,?)','old-session',vault.seal(originalActor),'synthetic-csrf','2099-01-01');
  f.store.run('INSERT INTO oidc_states VALUES (?,?,?,?)','old-state','nonce','verifier','2099-01-01');
  const privateImage=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=','base64');
  await new MediaService(source.content).upload(originalActor,first.article.id,'image/png',privateImage.toString('base64'),'private-image');
  const sourceRows=new Map(preservedTables.map(table=>[table,rows(f.store,table)]));
  const sourceAudit=rows(f.store,'audit');
  const database=join(directory,'snapshot.sqlite'),archive=join(directory,'backup.enc'),backupKey=randomBytes(32).toString('hex');
  await snapshotPlatform(f.store,database);await encryptArchive(database,archive,backupKey);
  const restoredPath=join(directory,'restored.sqlite');await decryptArchive(archive,restoredPath,backupKey);
  restoredStore=new Store(restoredPath);isolateRestoredPlatform(restoredStore,'restore-009');
  const restored=services(restoredStore),baselineRequests=requests.length,baselineOriginalWrites=originalWrites;
  return {...f,source,restored,restoredStore,sourceRows,sourceAudit,vault,originalActor,freshActor,revokedCredentials,posts,requests,callers,
    original,first,current,updateInput,pending,uncertain,cancelled,queuedOriginal,place,directory,archive,backupKey,
    baselineRequests,baselineOriginalWrites,originalWrites:()=>originalWrites,setAccount(value:string){accountId=value;}};
}

test('009 D9/A49: encrypted restore preserves nonempty external records, frozen bytes, history and idempotency',async t=>{
  const f=await recoveryFixture(t),store=f.restoredStore;
  for(const [table,expected] of f.sourceRows){assert.ok(expected.length>0,table+' must not pass vacuously');assert.deepEqual(rows(store,table),expected,table+' must survive byte-for-byte');}
  assert.deepEqual(rows(store,'audit').filter(row=>row.trace_id!=='restore-009'),f.sourceAudit);
  assert.deepEqual(rows(store,'deliveries').map(row=>row.state).sort(),['awaiting_external','cancelled','published','superseded','uncertain']);
  assert.equal(store.get('SELECT state FROM releases WHERE id=?',f.queuedOriginal.release.id)!.state,'queued');
  assert.equal(rows(store,'sessions').length,0);assert.equal(rows(store,'oidc_states').length,0);
  assert.equal(store.get("SELECT value FROM settings WHERE key='outbound_paused'")!.value,'true');
  const encrypted=await readFile(f.archive);
  assert.ok(!encrypted.includes(Buffer.from('Approved correction excerpt')));
  assert.ok(!encrypted.includes(Buffer.from(f.sourceRows.get('assets')![0].content)));
  await assert.rejects(decryptArchive(f.archive,join(f.directory,'wrong-key.sqlite'),randomBytes(32).toString('hex')));
  assert.equal(f.requests.length,f.baselineRequests,'Backup/restore must not access the provider');
  assert.equal(await new ReleaseWorker(f.restored.publishing,f.original).once(),false);
  assert.equal(await new DeliveryWorker(f.restored.distribution,f.original).once(),false);
  assert.equal(f.originalWrites(),f.baselineOriginalWrites);
  assert.equal(f.requests.filter(request=>request.method!=='GET').length,0);
  await evidence('preservation',{tableCounts:Object.fromEntries([...f.sourceRows].map(([name,value])=>[name,value.length])),states:rows(store,'deliveries').map(row=>row.state),sessionsInvalidated:true,queuedOriginalPaused:true,frozenRowsAndAuditPreserved:true,wrongBackupKeyRejected:true,providerRequestsDuringRestore:0});
});

test('009 D9/A50: fresh caller recovers receipts and metrics without reusing expired authority or resending',async t=>{
  const f=await recoveryFixture(t),store=f.restoredStore,external=f.restored.external;
  f.revokedCredentials.add(f.originalActor.credential);
  await assert.rejects(external.sync(f.originalActor,f.current.id,'old-caller'),{code:'IDENTITY_UNAVAILABLE'});
  assert.equal(f.requests.length,f.baselineRequests);
  const beforePayload=rows(store,'delivery_payloads'),beforeEvents=rows(store,'delivery_events');
  const result=await external.sync(f.freshActor,f.current.id,'fresh-sync');
  assert.equal(result.state,'published');assert.equal(result.remoteId,'100');assert.equal(result.syncStatus,'verified');assert.equal(result.followUpState,'removal_requested');
  assert.equal(store.get('SELECT views FROM external_metrics WHERE delivery_id=?',f.current.id)!.views,17);
  assert.equal(f.vault.open<Actor>(store.get('SELECT sync_actor_json FROM external_publications WHERE delivery_id=?',f.current.id)!.sync_actor_json).credential,f.freshActor.credential);
  assert.deepEqual(rows(store,'delivery_payloads'),beforePayload,'Confirmation actor/content must not change when read authority refreshes');
  assert.deepEqual(rows(store,'delivery_events'),beforeEvents,'Read-only sync must not append a new publication event');
  for(const row of beforePayload)assert.equal(f.vault.open<Actor>(row.actor_json).credential,f.originalActor.credential);
  f.place(f.uncertain.intent,'200');
  const recovered=await external.reconcile(f.freshActor,f.uncertain.intent.id,'recover-lost-receipt');
  assert.equal(recovered.state,'published');assert.equal(recovered.remoteId,'200');
  f.place(f.cancelled.intent,'300');
  const late=await external.reconcile(f.freshActor,f.cancelled.intent.id,'observe-late-receipt');
  assert.equal(late.state,'cancelled');assert.equal(late.remoteId,'300');
  assert.equal((await external.sync(f.freshActor,f.cancelled.intent.id,'sync-cancelled')).state,'cancelled');
  assert.equal((await external.get(f.freshActor,f.pending.intent.id)).state,'awaiting_external');
  assert.equal((await external.sync(f.freshActor,f.first.intent.id,'historical-sync')).state,'superseded');
  assert.equal((await external.prepare(f.freshActor,f.first.release.id,f.updateInput,'retry-confirmed-update')).id,f.current.id);
  await assert.rejects(external.prepare(f.freshActor,f.first.release.id,{...f.updateInput,excerpt:'Changed input'},'bad-retry'),{code:'CONFLICT'});
  await assert.rejects(external.prepare(f.freshActor,f.uncertain.release.id,{...f.uncertain.input,idempotencyKey:'new-create'},'duplicate'),{code:'DUPLICATE_TARGET'});
  assert.equal(rows(store,'external_publications').length,5);assert.equal(rows(store,'deliveries').length,5);
  assert.deepEqual(rows(store,'delivery_payloads'),beforePayload);
  assert.equal(store.get("SELECT value FROM settings WHERE key='outbound_paused'")!.value,'true');
  assert.equal(await new ReleaseWorker(f.restored.publishing,f.original).once(),false);
  assert.equal(await new DeliveryWorker(f.restored.distribution,f.original).once(),false);
  const recoveryCalls=f.requests.slice(f.baselineRequests);assert.ok(recoveryCalls.length>0);assert.ok(recoveryCalls.every(request=>request.method==='GET'));
  assert.ok(f.callers.slice(f.baselineRequests).every(actor=>actor.credential===f.freshActor.credential));
  assert.equal(f.originalWrites(),f.baselineOriginalWrites);
  await evidence('fresh-caller',{readRequests:recoveryCalls,providerWrites:0,confirmationActorUnchanged:true,frozenPayloadUnchanged:true,lostReceiptRecovered:true,cancelledNeverRepublished:true,supersededNeverRepublished:true,duplicateCreateRejected:true,idempotencyPreserved:true,restoredOutboundPaused:true});
});

test('009 D9/A50: restored CMS and service routes enforce owner/scope/connection and do not revive expired background reads',async t=>{
  const f=await recoveryFixture(t),store=f.restoredStore,external=f.restored.external;
  f.revokedCredentials.add(f.originalActor.credential);
  store.run("UPDATE external_publications SET next_sync_at='2000-01-01T00:00:00Z'");
  const due=await external.syncDue();assert.equal(due.length,1);assert.equal(due[0].syncStatus,'reauthorization_required');
  assert.equal(f.requests.length,f.baselineRequests,'Expired saved read authority must not call the provider');
  let caller:Actor|null=null;
  const app=await createApp({store,policy:f.restored.policy,content:f.restored.content,vault:f.vault,distribution:f.restored.distribution,externalPublications:external,publicUrl:'https://cms.example',authenticate:async()=>caller});
  t.after(()=>app.close());
  const denied=[
    {name:'anonymous',actor:null,status:401},
    {name:'other owner',actor:f.actors.outsider,status:403},
    {name:'read only',actor:{...f.freshActor,scopes:['content:read','connections:read']},status:403},
    {name:'no connection access',actor:{...f.freshActor,scopes:['content:read','publish']},status:403},
    {name:'expired credential',actor:f.originalActor,status:401},
  ];
  const protectedRows=rows(store,'delivery_payloads'),history=rows(store,'delivery_events');
  for(const entry of ['cms','service']){
    for(const scenario of denied){
      caller=scenario.actor;
      const response=await app.inject({method:'POST',url:`/api/${entry}/external-publications/${f.current.id}/sync`});
      assert.equal(response.statusCode,scenario.status,entry+' '+scenario.name+': '+response.body);
      assert.ok(response.headers['x-trace-id']);assert.doesNotMatch(response.body,/synthetic-original-|synthetic-fresh-|actor_json|sync_actor_json/);
      assert.equal(f.requests.length,f.baselineRequests,'Denied access must not reach the provider');
    }
  }
  caller=f.freshActor;f.setAccount('different-account');
  const changed=await external.sync(f.freshActor,f.current.id,'wrong-connection');
  assert.equal(changed.syncErrorCode,'CONNECTION_CHANGED');assert.equal(changed.remoteId,'100');
  assert.equal(f.requests.length,f.baselineRequests,'A changed selected account must not fall back to another account');
  f.setAccount('4223973');
  for(const entry of ['cms','service']){
    const synced=await app.inject({method:'POST',url:`/api/${entry}/external-publications/${f.current.id}/sync`});
    assert.equal(synced.statusCode,200,synced.body);assert.equal(synced.json().syncStatus,'verified');assert.equal(synced.json().remoteId,'100');
    assert.doesNotMatch(synced.body,/synthetic-original-|synthetic-fresh-|actor_json|sync_actor_json/);
  }
  assert.deepEqual(rows(store,'delivery_payloads'),protectedRows);assert.deepEqual(rows(store,'delivery_events'),history);
  assert.equal(store.get("SELECT value FROM settings WHERE key='outbound_paused'")!.value,'true');
  assert.ok(f.requests.every(request=>request.method==='GET'));assert.equal(f.originalWrites(),f.baselineOriginalWrites);
  await evidence('authorization',{deniedCases:denied.map(item=>item.name),entries:['cms','service'],deniedRequests:denied.length*2,changedConnectionNoFallback:true,expiredBackgroundReads:0,freshCallerSyncPassedBothEntries:true,historyAndConfirmationPreserved:true,providerWrites:0});
});
