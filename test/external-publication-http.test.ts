import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../src/app.ts';
import {fixture} from './helpers.ts';
import {Vault} from '../src/vault.ts';
import {PublishingService,ReleaseWorker} from '../src/publishing.ts';
import {DistributionService} from '../src/distribution.ts';
import {ExternalPublicationService} from '../src/external-publication.ts';
import {DevAdapter,TargetRegistry} from '../src/targets.ts';
import {openApi} from '../src/openapi.ts';

test('008-IR05: generated external actions require only path identity while content commands retain required bodies',()=>{
  const spec=openApi('https://cms.example');
  for(const action of ['reconcile','sync','cancel']){
    const operation=spec.paths[`/api/service/external-publications/{id}/${action}`].post;
    assert.equal(Object.hasOwn(operation,'requestBody'),false,`${action} must not require an unrepresentable empty body`);
    assert.deepEqual(operation.parameters,[{name:'id',in:'path',required:true,schema:{type:'string'}}]);
    assert.deepEqual(operation.security,[{NyxIdentity:[],NyxDelegation:[]},{Bearer:[]}]);
  }
  for(const [path,required] of [
    ['/releases/{id}/external-publications',['target','connectionId','action','format','rightsConfirmed','idempotencyKey']],
    ['/external-publications/{id}/register',['remoteId','idempotencyKey']],
    ['/external-publications/{id}/follow-up',['action']],
  ] as const){
    const body=spec.paths['/api/service'+path].post.requestBody;
    assert.equal(body.required,true);assert.deepEqual(body.content['application/json'].schema.required,required);
  }
});

test('external publication operations require identity on both entries and fail closed when unconfigured',async t=>{
  const f=fixture();let authenticated=false;
  const app=await createApp({...f,vault:new Vault('ab'.repeat(32)),publicUrl:'https://cms.example',authenticate:async()=>authenticated?f.actors.solo:null});
  t.after(async()=>{await app.close();f.store.close();});
  const operations=[['POST','/releases/source/external-publications'],['GET','/external-publications/intent'],...['register','reconcile','sync','cancel','follow-up'].map(action=>['POST',`/external-publications/intent/${action}`])];
  for(const entry of ['cms','service'])for(const [method,path] of operations){
    authenticated=false;
    const request={method:method as 'GET'|'POST',url:`/api/${entry}${path}`,...(method==='POST'&&!/\/(reconcile|sync|cancel)$/.test(path!)?{payload:{}}:{})};
    const anonymous=await app.inject(request);assert.equal(anonymous.statusCode,401,anonymous.body);
    authenticated=true;
    const unavailable=await app.inject(request);assert.equal(unavailable.statusCode,503,unavailable.body);assert.equal(unavailable.json().code,'EXTERNAL_PUBLICATION_UNAVAILABLE');assert.ok(unavailable.json().traceId);
  }
});

test('external HTTP lifecycle shares exact content, safe history and concrete OpenAPI contracts across CMS and NyxID',async t=>{
  const f=fixture(),actor=f.actors.solo,vault=new Vault('ab'.repeat(32)),publishing=new PublishingService(f.content,vault);
  f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site','solo','en','https://blog.example','KEY');
  const article=await f.content.create(actor,{ownerId:'solo',language:'en',title:'Exact HTTP publication',markdown:'Approved connection procedure.',creditedAuthor:'Solo'},'create');
  const release=await publishing.confirm(actor,article.id,{ownerId:'solo',revisionId:article.revision.id,creditedAuthor:'Solo',action:'publish',rightsConfirmed:true,idempotencyKey:'source'},'source');
  const original={async publish(){return {remoteId:'ghost',url:'https://blog.example/original/'};},async verify(){return true;},async reconcile(){return null;},async unpublish(){assert.fail('read only');}};
  await new ReleaseWorker(publishing,original).once();
  let post:any,status=200;const methods:string[]=[],bodylessRequests:Array<{body:unknown;contentType:string|undefined}>=[];
  const connections={async connection(){return {id:'connection',target:'dev',accountId:'4223973',active:true,canPublish:true,canUpdate:true,executionApproval:'native'};},async approval(){assert.fail('no approval bridging');},async execute(_actor:any,input:any){methods.push(input.request.method);assert.equal(input.readOnly,true);return {accountId:'4223973',status,body:input.request.url.includes('/me/published')?[{id:123,page_views_count:7}]:input.request.url.includes('/me/all')?[post]:post};}};
  const distribution=new DistributionService(publishing,connections,new TargetRegistry([new DevAdapter('https://dev.to/api')])),externalPublications=new ExternalPublicationService(distribution,original);
  const app=await createApp({...f,vault,distribution,externalPublications,publicUrl:'https://cms.example',authenticate:async request=>{
    if(request.method==='POST'&&/\/external-publications\/[^/]+\/(reconcile|sync|cancel)$/.test(request.url))bodylessRequests.push({body:request.body,contentType:request.headers['content-type']});
    return request.headers.authorization==='outsider'?f.actors.outsider:actor;
  }});
  t.after(async()=>{await app.close();f.store.close();});
  const spec=(await app.inject({url:'/openapi.json'})).json();
  function contract(schema:any,value:any,path='result'){
    if(schema.anyOf){assert.ok(schema.anyOf.some((variant:any)=>{try{contract(variant,value,path);return true;}catch{return false;}}),path);return;}
    if(value===null){assert.ok(schema.type==='null'||Array.isArray(schema.type)&&schema.type.includes('null'),path);return;}
    if(schema.const!==undefined)assert.equal(value,schema.const,path);
    if(schema.enum)assert.ok(schema.enum.includes(value),path);
    if(Array.isArray(value)){assert.equal(schema.type,'array',path);for(const item of value)contract(schema.items,item,path+'[]');return;}
    if(typeof value==='object'){assert.equal(schema.type,'object',path);for(const key of schema.required??[])assert.ok(key in value,path+'.'+key);for(const [key,item] of Object.entries(value)){assert.ok(schema.properties?.[key],path+'.'+key+' undeclared');contract(schema.properties[key],item,path+'.'+key);}return;}
    assert.ok(schema.type===typeof value||schema.type==='integer'&&Number.isInteger(value)||Array.isArray(schema.type)&&schema.type.includes(typeof value),path);
  }
  async function call(entry:string,path:string,schemaPath:string,body?:any,expected=200,method:'GET'|'POST'=body===undefined?'GET':'POST'){
    const response=await app.inject({method,url:`/api/${entry}${path}`,...(body===undefined?{}:{payload:body})});assert.equal(response.statusCode,expected,response.body);
    contract(spec.paths['/api/service'+schemaPath][method.toLowerCase()].responses[expected].content['application/json'].schema,response.json());return response.json();
  }
  const prepared=await call('cms',`/releases/${release.id}/external-publications`,'/releases/{id}/external-publications',{target:'dev',connectionId:'connection',action:'create',format:'full',rightsConfirmed:true,idempotencyKey:'prepare'},201);
  const path=`/external-publications/${prepared.id}`;
  assert.equal(prepared.executionMode,'external');assert.equal(prepared.revisionId,article.revision.id);assert.equal(f.store.get("SELECT count(*) count FROM jobs WHERE kind='delivery'")!.count,0);
  post={...prepared.request.body.article,id:123,user:{user_id:4223973},url:'https://dev.to/solo/verified',published_at:new Date().toISOString(),public_reactions_count:2,comments_count:1};
  const registered=await call('service',path+'/register','/external-publications/{id}/register',{remoteId:'123',idempotencyKey:'receipt'});
  assert.equal(registered.state,'published');assert.deepEqual(await call('cms',path,'/external-publications/{id}'),registered);
  assert.deepEqual(await call('cms',path+'/register','/external-publications/{id}/register',{remoteId:'123',idempotencyKey:'receipt'}),registered);
  const bad=await app.inject({method:'POST',url:'/api/service'+path+'/register',payload:{remoteId:'124',idempotencyKey:'receipt'}});assert.equal(bad.statusCode,409);
  assert.equal((await app.inject({url:'/api/cms'+path,headers:{authorization:'outsider'}})).statusCode,403);
  const publishedPost=post;
  for(const entry of ['cms','service']){
    const sync=await call(entry,path+'/sync','/external-publications/{id}/sync',undefined,200,'POST');assert.equal(sync.state,'published');assert.equal(sync.syncStatus,'verified');assert.equal(sync.url,registered.url);assert.ok(sync.observations.at(-1).traceId);
    const draft=await f.content.create(actor,{ownerId:'solo',language:'en',title:'Cancel '+entry,markdown:'Unsent copy.',creditedAuthor:'Solo'},'cancel-source');
    const source=await publishing.confirm(actor,draft.id,{ownerId:'solo',revisionId:draft.revision.id,creditedAuthor:'Solo',action:'publish',rightsConfirmed:true,idempotencyKey:'cancel-source-'+entry},'cancel-source');
    await new ReleaseWorker(publishing,original).once();
    const unsent=await call(entry,`/releases/${source.id}/external-publications`,'/releases/{id}/external-publications',{target:'dev',connectionId:'connection',action:'create',format:'full',rightsConfirmed:true,idempotencyKey:'cancel-copy-'+entry},201),reads=methods.length;
    const cancelled=await call(entry,`/external-publications/${unsent.id}/cancel`,'/external-publications/{id}/cancel',undefined,200,'POST');assert.equal(cancelled.state,'cancelled');assert.equal(cancelled.remoteCancellationGuaranteed,false);assert.equal(methods.length,reads);
    const remoteId=entry==='cms'?124:125;post={...publishedPost,...unsent.request.body.article,id:remoteId,url:`https://dev.to/solo/late-${remoteId}`};
    const reconciled=await call(entry,`/external-publications/${unsent.id}/reconcile`,'/external-publications/{id}/reconcile',undefined,200,'POST');assert.equal(reconciled.state,'cancelled');assert.equal(reconciled.syncStatus,'verified');assert.equal(reconciled.remoteId,String(remoteId));
    post=publishedPost;
  }
  assert.equal(bodylessRequests.length,6);assert.ok(bodylessRequests.every(request=>request.body===undefined&&request.contentType===undefined));
  assert.equal(f.store.get("SELECT count(*) count FROM jobs WHERE kind='delivery'")!.count,0);
  await call('service',path+'/follow-up','/external-publications/{id}/follow-up',{action:'removal',note:'Follow up with original account'});
  status=404;const removed=await call('cms',path+'/follow-up','/external-publications/{id}/follow-up',{action:'verify-removal'});assert.equal(removed.state,'removed');assert.ok(methods.length>0&&methods.every(method=>method==='GET'));
  assert.doesNotMatch(JSON.stringify(removed),/actor_json|sync_actor_json|test-only|connection_json/);
});
