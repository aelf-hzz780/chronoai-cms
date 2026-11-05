/** Real official NyxID authorization + CMS HTTP/Worker + isolated Ghost acceptance.
 * All destinations must be loopback; keys are read from private files and never logged.
 * No NyxBot UI, external distribution, or production environment claim is made.
 */
import assert from 'node:assert/strict';
import {createServer,request as httpRequest,type Server} from 'node:http';
import {readFile,writeFile,mkdtemp,mkdir,rename} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {loadConfig} from '../src/config.ts';
import {Store} from '../src/store.ts';
import {Vault} from '../src/vault.ts';
import {Policy} from '../src/policy.ts';
import {NyxAuthority} from '../src/nyxid.ts';
import {AuthManager} from '../src/auth.ts';
import {ContentService,digest} from '../src/content.ts';
import {PublishingService,ReleaseWorker} from '../src/publishing.ts';
import {GhostAdapter} from '../src/ghost.ts';
import {DistributionService} from '../src/distribution.ts';
import {TargetRegistry} from '../src/targets.ts';
import {createApp} from '../src/app.ts';

const execute=promisify(execFile);
type Name='personal'|'admin'|'publisher'|'member';
interface Command {executable:string;args:string[];}
interface ActorFixture {subject:string;pairPath?:string;agentKeyPath?:string;}
interface SiteFixture {url:string;adminKeyPath:string;authorId:string;}
interface Manifest {
 officialCommit:string;cmsCommit?:string;organizationId:string;env:NodeJS.ProcessEnv;
 actors:Record<Name,ActorFixture>;refresh?:Command;renderEnv?:NodeJS.ProcessEnv;
 ghost:{sites?:{personal:SiteFixture;organization:SiteFixture};url?:string;adminKeyPath?:string;authorId?:string};
 membershipCommands?:{remove:Command;restore:Command};
 ingress?:{mode:'official-proxy';apiBase:string;listenHost?:string;listenPort:number;configureCommand?:Command};
}
interface Capture {site:string;method:string;path:string;at:string;bodySha256:string;http?:number;}
const [manifestPath,resultPath]=process.argv.slice(2);
assert.ok(manifestPath&&resultPath,'Usage: node scripts/native-nyxid-ghost-probe.ts manifest.json result.json');
const manifest:Manifest=JSON.parse(await readFile(manifestPath,'utf8'));
const result=resolve(resultPath);await mkdir(dirname(result),{recursive:true});
const directory=await mkdtemp(join(dirname(result),'cms-ghost-native-'));
const run=randomUUID(),captures:Capture[]=[],servers:Server[]=[];
let store:Store|undefined,app:Awaited<ReturnType<typeof createApp>>|undefined;
const evidence:any={schemaVersion:1,at:new Date().toISOString(),run,officialCommit:manifest.officialCommit,cmsCommit:manifest.cmsCommit??null,
 level:'OFFICIAL_NYXID_AND_REAL_CMS_WORKER_AND_LOCAL_GHOST',formalAcceptance:false,productionChanged:false,
 ingress:manifest.ingress?.mode??'official-issued-pair-replay',authority:'real signature/JWKS/introspection and native organization membership',
 fakeAuthority:false,fakeGhost:false,renderer:'real BrowserRenderProof',cases:[],httpChecks:[],releaseApiReadbacks:[],ghostWrites:captures,
 sourceIngressPolicyScope:'CMS source ingress control plane only; no conclusion about external-distribution RequireApproval',
 connectionBindings:{configuration:'isolated empty bindings file',count:0,externalInventoryExercised:false},
 notExercised:['real NyxBot conversation','CMS browser OAuth session path','official NyxID approval UI','external distribution','external-distribution RequireApproval enforcement','real DEV account','production migration'],
 sqlite:join(directory,'cms.sqlite'),vaultKeyFile:join(directory,'vault-key.json')};
async function command(spec:Command,extra:string[]=[]){
 assert.equal(typeof spec.executable,'string');assert.ok(Array.isArray(spec.args)&&spec.args.every(x=>typeof x==='string'));
 try{await execute(spec.executable,[...spec.args,...extra],{timeout:60000,maxBuffer:1024*1024});}
 catch{throw new Error('Private fixture command failed; inspect its own sanitized evidence');}
}
async function refresh(){if(manifest.refresh&&!manifest.ingress)await command(manifest.refresh);}
function loopback(url:string){const u=new URL(url);assert.equal(u.protocol,'http:');assert.ok(['localhost','127.0.0.1','[::1]'].includes(u.hostname));assert.ok(!u.username&&!u.password&&!u.hash);return u;}
async function recorder(name:string,target:string){
 const origin=loopback(target);
 const server=createServer(async(incoming,outgoing)=>{
  try{
   const bytes:Buffer[]=[];for await(const chunk of incoming)bytes.push(Buffer.from(chunk));
   const body=Buffer.concat(bytes),method=incoming.method??'GET';
   assert.ok(incoming.url?.startsWith('/ghost/api/admin/'));
   const capture:Capture={site:name,method,path:incoming.url!,at:new Date().toISOString(),bodySha256:digest(body)};
   if(!['GET','HEAD','OPTIONS'].includes(method))captures.push(capture);
   const upstream=httpRequest(new URL(incoming.url!,origin),{method,headers:{...incoming.headers,host:origin.host}},response=>{
    capture.http=response.statusCode;outgoing.writeHead(response.statusCode??502,response.headers);response.pipe(outgoing);
   });
   upstream.on('error',()=>{if(!outgoing.headersSent)outgoing.writeHead(502);outgoing.end();});
   incoming.on('aborted',()=>upstream.destroy());outgoing.on('close',()=>{if(!outgoing.writableEnded)upstream.destroy();});
   upstream.end(body);
  }catch{outgoing.writeHead(502);outgoing.end();}
 });
 await new Promise<void>((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',()=>yes());});servers.push(server);
 const address=server.address();assert.ok(address&&typeof address==='object');return `http://127.0.0.1:${address.port}`;
}
async function persist(){const temporary=result+'.tmp';await writeFile(temporary,JSON.stringify(evidence,null,2)+'\n',{mode:0o600});await rename(temporary,result);}
try{
 const configFile=join(directory,'connections.json');await writeFile(configFile,'[]',{mode:0o600});
 const key=randomBytes(32).toString('hex');await writeFile(evidence.vaultKeyFile,JSON.stringify({key}),{mode:0o600});
 const config=loadConfig({...manifest.env,NYXID_CONNECTIONS_FILE:configFile,DATABASE_PATH:evidence.sqlite,
  ENCRYPTION_KEY:key,TRACKING_SECRET:randomBytes(32).toString('hex')});
 store=new Store(config.database);const database=store,vault=new Vault(key),authority=new NyxAuthority(config,database),policy=new Policy(database,authority),
  content=new ContentService(database,policy),auth=new AuthManager(config,database,vault,policy),publishing=new PublishingService(content,vault),
  distribution=new DistributionService(publishing,authority,new TargetRegistry([]));
 const owners={personal:`personal-${digest(`${config.issuer}\n${manifest.actors.personal.subject}`).slice(0,32)}`,organization:`native-org-${digest(manifest.organizationId).slice(0,24)}`};
 database.createOwner(owners.personal,'personal',config.issuer,manifest.actors.personal.subject);
 database.createOwner(owners.organization,'organization',config.issuer,manifest.organizationId);
 const fallback=manifest.ghost as SiteFixture,sites=manifest.ghost.sites??{personal:fallback,organization:fallback};
 for(const site of Object.values(sites))loopback(site.url);
 evidence.ownerSiteIsolation=sites.personal.url!==sites.organization.url;
 if(!evidence.ownerSiteIsolation)evidence.notExercised.push('separate personal/organization Ghost origins');
 const environment:NodeJS.ProcessEnv={...process.env,...manifest.renderEnv};
 const author='Native NyxID Ghost Probe';
 for(const name of ['personal','organization'] as const){
  const site=sites[name],saved=JSON.parse(await readFile(site.adminKeyPath,'utf8'));
  const adminKey=typeof saved==='string'?saved:saved.key;assert.ok(typeof adminKey==='string'&&/^[a-f0-9]+:[a-f0-9]{64}$/.test(adminKey),'Invalid local Ghost key format');
  const ref=`NATIVE_PROBE_${name.toUpperCase()}`;environment[ref]=adminKey;
  database.run('INSERT INTO sites VALUES (?,?,?,?,?)',name,owners[name],'en',site.url,ref);
  database.run('INSERT INTO site_admin_routes VALUES (?,?)',name,await recorder(name,site.url));
  database.run('INSERT INTO author_mappings VALUES (?,?,?)',name,author,site.authorId);
 }
 const ghost=new GhostAdapter(database,join(directory,'media'),true,environment),worker=new ReleaseWorker(publishing,ghost);
 app=await createApp({store:database,vault,policy,content,distribution,auth,publicUrl:config.publicUrl,authenticate:r=>auth.authenticate(r)});
 const address=await app.listen({host:manifest.ingress?.listenHost??'127.0.0.1',port:manifest.ingress?.listenPort??0});
 evidence.cmsHttpAddress=address;
 if(manifest.ingress?.configureCommand)await command(manifest.ingress.configureCommand,[address]);
 async function api(name:Name,method:string,path:string,expected:number,payload?:unknown){
  const actor=manifest.actors[name];let headers:Record<string,string>={'content-type':'application/json'},url:string;
  if(manifest.ingress){
   assert.ok(actor.agentKeyPath);const value=JSON.parse(await readFile(actor.agentKeyPath,'utf8'));
   const token=typeof value==='string'?value:value.key??value.full_key;assert.equal(typeof token,'string');headers.authorization=`Bearer ${token}`;
   url=manifest.ingress.apiBase.replace(/\/$/,'')+'/api/service'+path;
  }else{
   assert.ok(actor.pairPath);const pair=JSON.parse(await readFile(actor.pairPath,'utf8'));
   headers={...headers,'x-nyxid-identity-token':pair.identity,'x-nyxid-delegation-token':pair.delegation};url=address+'/api/service'+path;
  }
  const response=await fetch(url,{method,headers,...(payload===undefined?{}:{body:JSON.stringify(payload)}),redirect:'error',signal:AbortSignal.timeout(20000)});
  const body=await response.json() as any;
  evidence.httpChecks.push({at:new Date().toISOString(),actor:name,method,path,status:response.status,expected,traceId:response.headers.get('x-trace-id')??body.traceId??null,...(response.status>=400?{code:body.code}: {})});
  assert.equal(response.status,expected,`${name} ${method} ${path}: ${body.code??body.error??response.status}`);return body;
 }
 async function scenario(name:string,work:()=>Promise<Record<string,unknown>>){
  evidence.currentStage=name;await refresh();const writesBefore=captures.length;
  const detail=await work();evidence.cases.push({name,status:'PASS',writesBefore,writesAfter:captures.length,...detail});await persist();
 }
 async function create(actor:Name,owner:'personal'|'organization',label:string){
  return api(actor,'POST','/articles',201,{ownerId:owners[owner],language:'en',title:`Native ${label} ${run}`,
   markdown:`# Native authorization ${label}\n\nFrozen content ${run}.\n\nNo external account is used.\n`,creditedAuthor:author});
 }
 async function confirm(actor:Name,article:any,owner:'personal'|'organization',label:string){
  const release=await api(actor,'POST',`/articles/${article.id}/releases`,202,{ownerId:owners[owner],revisionId:article.revision.id,
   creditedAuthor:author,rightsConfirmed:true,action:'publish',idempotencyKey:`${run}-${label}`});
  const saved=database.get('SELECT * FROM releases WHERE id=?',release.id)!;
  const retained=vault.open<any>(saved.actor_json);
  assert.equal(retained.subject,manifest.actors[actor].subject);assert.equal(retained.credentialSource,'service-delegation');
  assert.ok(retained.confirmedCommand);assert.equal(retained.commandAuthority,undefined);
  return {release,savedActorHash:digest(saved.actor_json)};
 }
 async function readReleaseApi(row:Record<string,any>){
  const actor:Name=row.owner_id===owners.personal?'personal':'admin',path=`/owners/${row.owner_id}/tasks/release/${row.id}`;
  const task=await api(actor,'GET',path,200);
  const expected={id:row.id,kind:'release',ownerId:row.owner_id,articleId:row.article_id,revisionId:row.revision_id,
   state:row.state,errorCode:row.error_code??null,url:row.url??null,traceId:row.trace_id};
  assert.deepEqual(Object.fromEntries(Object.keys(expected).map(field=>[field,task[field]])),expected,'CMS task API must match the persisted release');
  assert.ok(typeof task.traceId==='string'&&task.traceId.length>0,'Task payload must preserve the release trace ID');
  assert.equal(task.snapshot?.revisionId,row.revision_id,'Task API must expose the confirmed revision');
  const check={at:new Date().toISOString(),actor,path,status:'PASS',releaseId:task.id,state:task.state,errorCode:task.errorCode,
   url:task.url,traceId:task.traceId,traceSource:'CMS task payload',databaseMatchedFields:Object.keys(expected),confirmedRevisionMatched:true};
  evidence.releaseApiReadbacks.push(check);return check;
 }
 async function publish(releaseId:string){
  const before=captures.length;assert.equal(await worker.once(),true);
  const row=database.get('SELECT * FROM releases WHERE id=?',releaseId)!;
  assert.equal(row.state,'published',`Worker: ${row.state}/${row.error_code}`);
  const input=publishing.input(row),post=await ghost.current(input);
  assert.equal(post?.id,row.remote_id);assert.equal(post.status,'published');assert.ok(post.html.includes(ghost.marker(input)));
  const response=await fetch(row.url);assert.equal(response.status,200);const page=await response.text();
  assert.ok(page.includes(ghost.marker(input)));assert.ok(page.includes(ghost.publisherHtml(input)));
  assert.equal(captures.length-before,1,'Exactly one Ghost create write');
  return {releaseId,articleId:row.article_id,remoteId:row.remote_id,url:row.url,workerState:row.state,readback:true,cmsApiReadback:await readReleaseApi(row)};
 }
 async function absent(releaseId:string,expectedState:string,actorHash:string){
  const retainedRow=database.get('SELECT * FROM releases WHERE id=?',releaseId)!;
  const retained=vault.open<any>(retainedRow.actor_json);
  await authority.validate(retained,'queued-write');
  const credentialCheck={at:new Date().toISOString(),status:'PASS',purpose:'queued-write',source:retained.credentialSource,traceId:retainedRow.trace_id};
  const before=captures.length;await worker.once();const row=database.get('SELECT * FROM releases WHERE id=?',releaseId)!;
  assert.equal(row.state,expectedState);
  if(expectedState==='blocked')assert.equal(row.error_code,'FORBIDDEN','Loss case must fail business authorization, not token expiry');assert.equal(digest(row.actor_json),actorHash,'Frozen actor audit must not be overwritten');
  assert.equal(await ghost.current(publishing.input(row)),null);assert.equal(captures.length,before,'No Ghost write after losing authority');
  assert.equal((await fetch(`${publishing.input(row).site.url}/chrono-${row.article_id}/`)).status,404);
  return {releaseId,articleId:row.article_id,workerState:row.state,errorCode:row.error_code,ghostPostAbsent:true,actorAuditUnchanged:true,retainedCredentialValidImmediatelyBeforeWorker:credentialCheck,cmsApiReadback:await readReleaseApi(row)};
 }
 await scenario('official-native-identities-and-current-roles',async()=>{
  for(const name of ['personal','admin','publisher','member'] as Name[]){const me=await api(name,'GET','/me',200);assert.equal(me.subject,manifest.actors[name].subject);}
  assert.equal(database.get('SELECT 1 FROM publishers WHERE subject=?',manifest.actors.personal.subject),undefined);
  await api('admin','PUT',`/owners/${owners.organization}/publishers/${manifest.actors.publisher.subject}`,200,{enabled:true});
  await api('member','PUT',`/owners/${owners.organization}/publishers/${manifest.actors.member.subject}`,403,{enabled:true});
  return {personalHasNoCmsPublisher:true,adminGrantedPublisher:true,memberCannotSelfGrant:true};
 });
 await scenario('official-proxy-connections-authorization-with-empty-bindings',async()=>{
  for(const actor of ['personal','admin','publisher'] as Name[]){
   const owner=actor==='personal'?owners.personal:owners.organization;
   assert.deepEqual(await api(actor,'GET',`/owners/${owner}/connections`,200),[],'Isolated connection bindings must stay empty');
  }
  const denied=await api('member','GET',`/owners/${owners.organization}/connections`,403);
  assert.equal(denied.code,'FORBIDDEN','Organization Member must not read publishing connections');
  return {personalAllowed:true,adminAllowed:true,publisherAllowed:true,memberDenied:true,bindingsEmpty:true,externalInventoryExercised:false};
 });
 await scenario('personal-without-organization-publisher-publishes',async()=>{
  const article=await create('personal','personal','personal');const {release}=await confirm('personal',article,'personal','personal');return publish(release.id);
 });
 await scenario('organization-admin-publishes-without-external-exact-approval',async()=>{
  const article=await create('admin','organization','admin');const {release}=await confirm('admin',article,'organization','admin');return publish(release.id);
 });
 await scenario('organization-member-submits-publisher-publishes',async()=>{
  const before=captures.length,article=await create('member','organization','publisher');
  await api('member','POST',`/articles/${article.id}/submit`,200,{revisionId:article.revision.id});
  await api('member','POST',`/articles/${article.id}/releases`,403,{ownerId:owners.organization,revisionId:article.revision.id,creditedAuthor:author,
   rightsConfirmed:true,action:'publish',idempotencyKey:`${run}-member-denied`});assert.equal(captures.length,before);
  const {release}=await confirm('publisher',article,'organization','publisher');return {...await publish(release.id),memberPublicationDenied:true};
 });
 await scenario('queued-publisher-revocation-blocks-real-worker',async()=>{
  const article=await create('publisher','organization','revoke-publisher');const {release,savedActorHash}=await confirm('publisher',article,'organization','revoke-publisher');
  await api('admin','PUT',`/owners/${owners.organization}/publishers/${manifest.actors.publisher.subject}`,200,{enabled:false});
  const result=await absent(release.id,'blocked',savedActorHash);
  await api('admin','PUT',`/owners/${owners.organization}/publishers/${manifest.actors.publisher.subject}`,200,{enabled:true});
  assert.equal(await worker.once(),false,'Restoring role does not revive a blocked job');return {...result,roleRestorationDoesNotRevive:true};
 });
 await scenario('queued-cancellation-blocks-real-worker',async()=>{
  const article=await create('publisher','organization','cancel');const {release,savedActorHash}=await confirm('publisher',article,'organization','cancel');
  await api('publisher','POST',`/releases/${release.id}/cancel`,200,{});return absent(release.id,'cancelled',savedActorHash);
 });
 if(manifest.membershipCommands){
  let removed=false;
  try{
   await scenario('queued-native-membership-removal-blocks-real-worker',async()=>{
    const article=await create('publisher','organization','remove-member');const {release,savedActorHash}=await confirm('publisher',article,'organization','remove-member');
    await command(manifest.membershipCommands!.remove,[manifest.actors.publisher.subject]);removed=true;
    const result=await absent(release.id,'blocked',savedActorHash);
    await command(manifest.membershipCommands!.restore,[manifest.actors.publisher.subject]);removed=false;
    assert.equal(await worker.once(),false,'Restoring native membership does not revive a blocked job');return {...result,nativeMembershipRestorationDoesNotRevive:true};
   });
  }finally{if(removed)await command(manifest.membershipCommands.restore,[manifest.actors.publisher.subject]);}
 }else evidence.notExercised.push('queued native membership removal');
 evidence.status='PASS';delete evidence.currentStage;evidence.totalGhostWrites=captures.length;
 evidence.summary={publishedOriginals:3,thirdPartyWrites:0,queuedLossCases:manifest.membershipCommands?3:2,
  organizationGhostRequiresExternalExactApproval:false,sourceProofRequired:false,
  connectionsHttpChecks:4,releaseApiReadbacks:evidence.releaseApiReadbacks.length,
  additionalAcceptanceAssertions:8+4*evidence.releaseApiReadbacks.length,
  acceptanceAssertionBreakdown:{connections:'4 HTTP status + 3 empty arrays + 1 FORBIDDEN code',releaseReadback:'per release: HTTP status + persisted fields + nonempty trace ID + confirmed revision'}};
}catch(error){
 evidence.status='FAIL';evidence.error={code:(error as any).code??'PROBE_ASSERTION_OR_UPSTREAM_FAILURE',message:(error as any).code==='ERR_ASSERTION'?(error as Error).message:'Probe or fixture failure; no raw upstream/private data is recorded'};process.exitCode=1;
}finally{
 await app?.close();store?.close();
 for(const server of servers){server.closeAllConnections();await new Promise<void>(yes=>server.close(()=>yes()));}
}
await persist();console.log(JSON.stringify({status:evidence.status,cases:evidence.cases.length,result,ghostWrites:captures.length,thirdPartyWrites:0}));
