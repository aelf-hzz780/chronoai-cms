/** Isolated official NyxID generated tools; unknown IDs, no provider dispatch. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {decodeJwt} from 'jose';
import {openApi} from '../src/openapi.ts';
import {loadConfig} from '../src/config.ts';
import {Store} from '../src/store.ts';
import {Vault} from '../src/vault.ts';
import {Policy} from '../src/policy.ts';
import {NyxAuthority} from '../src/nyxid.ts';
import {AuthManager} from '../src/auth.ts';
import {ContentService} from '../src/content.ts';
import {PublishingService} from '../src/publishing.ts';
import {DistributionService} from '../src/distribution.ts';
import {TargetRegistry} from '../src/targets.ts';
import {ConnectionAttemptService} from '../src/connection-attempts.ts';
import {WorkspaceReadService} from '../src/workspace-read.ts';
import {createApp} from '../src/app.ts';
const [manifestFile,fixtureFile,out]=process.argv.slice(2);assert.ok(manifestFile&&fixtureFile&&out);
const directory=resolve(out);await mkdir(directory,{recursive:true,mode:0o700});
const manifest=JSON.parse(await readFile(manifestFile,'utf8')),fixture=JSON.parse(await readFile(fixtureFile,'utf8'));
const base=new URL(fixture.nyxidUrl).origin,relay=new URL(fixture.cmsRelayUrl).origin,port=manifest.ingress.listenPort;
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Use only an isolated local NyxID fixture');
assert.ok(Number.isInteger(port)&&port>1023&&port<65536);
assert.equal(manifest.env.NYXID_API_URL,base);
const slug='cms-009-bodyless-'+randomUUID().slice(0,8),schema=openApi(relay);
const result:any={status:'RUNNING',runId:slug,officialCommit:manifest.officialCommit,cmsCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceOpenapiSha256:createHash('sha256').update(await readFile(new URL('../src/openapi.ts',import.meta.url))).digest('hex'),providerWrites:0,cases:[],ingress:[],existingServiceModified:false,approvalPolicyModified:false};
let app:any,store:Store|undefined,agent:any,service:any,token:string|undefined,session:string|undefined,rpcId=0;
async function api(path:string,method='GET',body?:unknown,auth=token){
 const response=await fetch(base+path,{method,headers:{...(auth?{authorization:'Bearer '+auth}:{}),...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
 const text=await response.text();let data:any;try{data=JSON.parse(text);}catch{data={};}
 if(!response.ok)throw Error(`NyxID ${method} ${path.split('?')[0]} HTTP ${response.status} ${data.code??data.error??''}`);
 return data;
}
async function rpc(method:string,params:any){
 const response=await fetch(base+'/mcp',{method:'POST',headers:{'x-api-key':agent.full_key,'content-type':'application/json',accept:'application/json, text/event-stream',...(session?{'mcp-session-id':session}:{})},body:JSON.stringify({jsonrpc:'2.0',id:++rpcId,method,params}),signal:AbortSignal.timeout(30000)});
 const next=response.headers.get('mcp-session-id');if(next)session=next;
 const raw=await response.text();let data:any;try{data=JSON.parse(raw);}catch{const line=raw.split('\n').find(x=>x.startsWith('data:'));data=line?JSON.parse(line.slice(5)):{};}
 assert.equal(response.status,200,`MCP ${method} HTTP ${response.status}: ${typeof data.error==='string'?data.error:data.error?.message??data.message??raw.slice(0,180)}`);assert.ok(!data.error,`MCP error ${data.error?.code}`);return data.result;
}
try{
 const health=await api('/health');assert.ok(typeof health.commit==='string'&&manifest.officialCommit.startsWith(health.commit));
 token=(await api('/api/v1/auth/login','POST',{email:fixture.admin.email,password:fixture.admin.password,client:'token'},undefined)).access_token;
 // Ordinary catalog APIs avoid fetching a private URL. The caller must already
 // have legitimate catalog authority; this harness never changes platform roles.
 const caller=await api('/api/v1/users/me');result.catalogAuthority={role:caller.role,isAdmin:caller.is_admin,canManageCatalog:caller.capabilities?.manage_catalog===true};
 const catalog=await api('/api/v1/services','POST',{name:slug,slug,service_type:'http',base_url:relay,auth_method:'none',service_category:'internal',visibility:'private'});
 assert.equal(catalog.slug,slug);result.catalogServiceId=catalog.id;result.registrationMethod='official catalog operation API';
 await api('/api/v1/services/'+catalog.id,'PUT',{identity_propagation_mode:'jwt',identity_jwt_audience:slug,inject_delegation_token:true,delegation_token_scope:'account:read proxy:*'});
 const imported:any[]=[];
 for(const [path,methods]of Object.entries(schema.paths))for(const [method,operation]of Object.entries(methods) as [string,any][]){
  const body=operation.requestBody,media=body?.content?.['application/json']?'application/json':Object.keys(body?.content??{})[0];
  const success=Object.entries(operation.responses).find(([status])=>/^2\d\d$/.test(status))?.[1] as any;
  const contentTypes=Object.keys(success?.content??{}),binary=contentTypes.length>0&&contentTypes.every(type=>success.content[type].schema?.format==='binary');
  imported.push(await api('/api/v1/services/'+catalog.id+'/endpoints','POST',{
   name:operation.operationId.toLowerCase(),description:operation.summary,method:method.toUpperCase(),path,parameters:operation.parameters,
   ...(body?{request_body_schema:body.content[media].schema,request_content_type:media,request_body_required:body.required===true}:{request_body_required:false}),
   response_description:success?.description,response:{content_types:contentTypes,binary_artifact:binary},
  }));
 }
 const discovered=(await api('/api/v1/services/'+catalog.id+'/endpoints')).endpoints;
 assert.equal(discovered.length,imported.length);result.importedOperationCount=discovered.length;
 result.importedMetadata=discovered.map((operation:any)=>({name:operation.name,method:operation.method,path:operation.path,requestBodyRequired:operation.request_body_required,requestBodyPresent:operation.request_body_schema!=null||operation.request_content_type!=null}));
 service=await api('/api/v1/keys','POST',{label:slug,service_slug:slug});
 agent=await api('/api/v1/api-keys','POST',{name:slug,scopes:'proxy',allowed_service_ids:[service.id],allow_all_services:false,allow_auto_connected_services:false,expires_at:new Date(Date.now()+3600_000).toISOString()});
 assert.equal(agent.allow_all_services,false);assert.equal(agent.allow_auto_connected_services,false);assert.deepEqual(agent.allowed_service_ids,[service.id]);
 await writeFile(join(directory,'fixture.private.json'),JSON.stringify({catalog,service,agent}),{mode:0o600});
 const bindings=join(directory,'bindings.private.json');await writeFile(bindings,'[]',{mode:0o600});
 // Catalog-backed connections scope Agent Keys by UserService ID, while the
 // signed identity assertion binds nyx_service_id to the catalog service ID.
 const config=loadConfig({...manifest.env,NYXID_SERVICE_AUDIENCE:slug,NYXID_SERVICE_ID:catalog.id,NYXID_SERVICE_SLUG:slug,NYXID_CONNECTIONS_FILE:bindings,DATABASE_PATH:join(directory,'cms.sqlite'),ENCRYPTION_KEY:randomBytes(32).toString('hex'),TRACKING_SECRET:randomBytes(32).toString('hex')});
 store=new Store(config.database);const vault=new Vault(config.encryptionKey),nyx=new NyxAuthority(config,store),policy=new Policy(store,nyx),content=new ContentService(store,policy),auth=new AuthManager(config,store,vault,policy),publishing=new PublishingService(content,vault),distribution=new DistributionService(publishing,nyx,new TargetRegistry([]));
 const connectionAttempts=new ConnectionAttemptService(new WorkspaceReadService(policy),nyx,vault,config);
 app=await createApp({store,vault,policy,content,distribution,connectionAttempts,auth,publicUrl:relay,authenticate:r=>auth.authenticate(r)});
 app.addHook('onRequest',async(request:any)=>{
  if(!request.url.startsWith('/api/service'))return;
  const identity=request.headers['x-nyxid-identity-token'],delegation=request.headers['x-nyxid-delegation-token'];
  const claims=(token:unknown)=>typeof token==='string'?decodeJwt(token):{};
  const i=claims(identity),d=claims(delegation);
  result.identityChecks??=[];result.identityChecks.push({identityPresent:typeof identity==='string',delegationPresent:typeof delegation==='string',identityAudienceMatches:i.aud===slug,serviceIdMatches:i.nyx_service_id===config.serviceId,identityIssuerMatches:i.iss===config.issuer,delegationAudienceMatches:d.aud===config.nyxAudience,delegationIssuerMatches:d.iss===config.issuer,subjectMatches:i.sub===d.sub,actorMatches:(d.act as any)?.sub===slug,delegationOrigin:d.delegation_origin,tokenType:d.token_type,delegated:d.delegated,sourceScopes:d.scope,identityLifetime:Number(i.exp)-Number(i.iat)});
 });
 app.addHook('onResponse',async(request:any,reply:any)=>{if(request.url.startsWith('/api/service'))result.ingress.push({method:request.method,path:request.url,status:reply.statusCode,bodyAbsent:request.body===undefined,contentType:request.headers['content-type']??null,traceId:request.id});});
 await app.listen({host:'127.0.0.1',port});
 await rpc('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'CMS local acceptance 009',version:'1'}});
 const listed=await rpc('tools/list',{});assert.ok(Array.isArray(listed.tools));
 result.generatedToolCount=listed.tools.filter((t:any)=>t.name.startsWith(slug+'__')).length;
 assert.equal(result.generatedToolCount,imported.length);
 const names=['cancelConnectionAttempt','cancelOriginal','reconcileOriginal','cancelDistributionPlan','requestExactApproval','cancelDistribution','reconcileDistribution','refreshExternalMetrics','syncPublishedAlternates'];
 for(const operation of names){
  const tool=listed.tools.find((t:any)=>t.name===slug+'__'+operation.toLowerCase());assert.ok(tool,`Missing typed operation ${operation}`);
  const props=tool.inputSchema.properties??{};assert.ok(!('body' in props));
  const args:any={};for(const key of Object.keys(props))if(key==='id'||key==='attemptId')args[key]='missing-009-'+randomUUID();
  const before=result.ingress.length;let approval:any,completed=false;
  // Official MCP can hold a write while the owner decides. Decide the exact
  // fixture request concurrently through the normal approval API.
  const pendingCall=rpc('tools/call',{name:tool.name,arguments:args})
   .then(output=>({output,error:undefined as unknown}),error=>({output:undefined,error}))
   .finally(()=>{completed=true;});
  for(let poll=0;!completed&&poll<40;poll++){
   const requests=(await api('/api/v1/approvals/requests?status=pending')).requests;
   const resourceId=args.id??args.attemptId;
   const pending=requests.filter((request:any)=>request.service_slug===slug&&request.http_method==='POST'&&typeof request.resource==='string'&&typeof resourceId==='string'&&request.resource.includes(resourceId));
   assert.ok(pending.length<=1,`${operation}: multiple approvals matched one fixture request`);
   if(pending.length===1){
    const decision=await api('/api/v1/approvals/requests/'+pending[0].id+'/decide','POST',{approved:true,duration_sec:60});
    approval={requestId:pending[0].id,mode:pending[0].approval_mode,decisionStatus:decision.status??decision.request?.status??'approved'};
    break;
   }
   await Promise.race([pendingCall,new Promise(resolve=>setTimeout(resolve,250))]);
  }
  const called=await pendingCall;if(called.error)throw called.error;
  let output=called.output;
  if(result.ingress.length===before&&approval)output=await rpc('tools/call',{name:tool.name,arguments:args});
  const observed=result.ingress.slice(before);assert.equal(observed.length,1,`${operation}: must reach CMS exactly once`);
  const ingress=observed[0];assert.ok([403,404].includes(ingress.status),`${operation}: CMS HTTP ${ingress.status}`);assert.equal(ingress.method,'POST');assert.equal(ingress.bodyAbsent,true);
  const text=output.content?.find((x:any)=>x.type==='text')?.text??'';assert.ok(!text.includes('must include at least one body field'));
  result.cases.push({operation,tool:tool.name,arguments:args,status:'PASS',cmsHttpStatus:ingress.status,traceId:ingress.traceId,bodyAbsent:true,genericToolUsed:false,providerWrites:0,...(approval?{approval}:{})});
 }
 result.status='PASS';result.scopedAgentKey={allowAllServices:false,allowAutoConnectedServices:false,allowedServiceCount:1};
}catch(error){result.status='FAIL';result.error={message:(error as Error).message.slice(0,250)};process.exitCode=1;}
finally{
 await app?.close();store?.close();
 if(agent&&token){try{await api('/api/v1/api-keys/'+agent.id,'DELETE');result.disposableKeyDeleted=true;}catch{result.disposableKeyDeleted=false;result.status='FAIL';process.exitCode=1;}}
 result.finishedAt=new Date().toISOString();await writeFile(join(directory,'result.json'),JSON.stringify(result,null,2)+'\n');
}
console.log(JSON.stringify({status:result.status,cases:result.cases.length,imported:result.importedOperationCount,evidence:join(directory,'result.json')}));
