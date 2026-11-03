import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers.ts';
import {createApp} from '../src/app.ts';
import {Vault} from '../src/vault.ts';
import {PublishingService,ReleaseWorker} from '../src/publishing.ts';
import {DistributionService} from '../src/distribution.ts';
import {TargetRegistry,DevAdapter,AssistedAdapter} from '../src/targets.ts';
import {MetricsService} from '../src/metrics.ts';
import {AppError} from '../src/errors.ts';

/** Independent response-shape checker: validates real HTTP samples, not DTO literals. */
function matches(schema:any,value:any,path='$'):void{
  if(schema.anyOf){assert.ok(schema.anyOf.some((variant:any)=>{try{matches(variant,value,path);return true;}catch{return false;}}),`${path}: no permitted variant`);return;}
  if(schema.enum)assert.ok(schema.enum.includes(value),`${path}: value outside enum`);if('const' in schema)assert.equal(value,schema.const,path);
  const types=Array.isArray(schema.type)?schema.type:[schema.type];
  assert.ok(types.some((type:any)=>type==='null'?value===null:type==='array'?Array.isArray(value):type==='object'?value!==null&&typeof value==='object'&&!Array.isArray(value):type==='integer'?Number.isInteger(value):type===undefined||typeof value===type),`${path}: wrong type`);
  if(value===null)return;
  if(Array.isArray(value)){assert.ok(schema.items,`${path}: missing item contract`);for(const [index,item] of value.entries())matches(schema.items,item,`${path}[${index}]`);}
  else if(typeof value==='object'){
    assert.ok(schema.properties&&Object.keys(schema.properties).length,`${path}: generic object is not a DTO`);
    assert.ok(Array.isArray(schema.required)&&schema.required.length,`${path}: no required fields`);
    for(const key of schema.required)assert.ok(key in value,`${path}.${key}: required`);
    for(const [key,item] of Object.entries(value)){const property=schema.properties[key];if(property)matches(property,item,`${path}.${key}`);else assert.ok(schema.additionalProperties!==false,`${path}.${key}: undeclared`);}
  }
}
test('C10: real article, release/media, delivery/package/approval, directory, metrics and error samples satisfy concrete response contracts',async t=>{
  const f=fixture(),vault=new Vault('ab'.repeat(32)),publishing=new PublishingService(f.content,vault),metrics=new MetricsService(f.content,{enabled:true,requireConsent:true,secret:'fixture'});let actor=f.actors.solo,authenticated=true;
  const distribution=new DistributionService(publishing,{async connection(_actor,owner,id,target){return {id,target,owner,accountId:'frozen-account',active:true,canPublish:true,organizationId:owner.kind==='organization'?'org-account':undefined,slug:target,remoteBaseUrl:'https://provider.example'};},async listConnections(){return [{id:'solo-medium',target:'medium',label:'Personal account',accountId:'frozen-account',active:true},{id:'disabled',target:'dev',label:'Unavailable account',accountId:'other',active:false,reason:'Reconnect exact account'}];},async approval(){return {};},async prepareApproval(){return {reference:'exact-reference',state:'pending',expiresAt:new Date(Date.now()+60_000).toISOString()};},async execute(){throw Error('No provider writes');}},new TargetRegistry([new DevAdapter('https://dev.to/api'),new AssistedAdapter('medium')]),{async verify(){return true;}});
  const app=await createApp({...f,vault,distribution,metrics,publicUrl:'https://cms.example',authenticate:async()=>authenticated?actor:null});t.after(async()=>{await app.close();f.store.close();});const spec=(await app.inject({url:'/openapi.json'})).json();
  const operations=Object.values(spec.paths).flatMap((methods:any)=>Object.values(methods)) as any[];
  async function observe(name:string,request:any,status=200){const response=await app.inject(request);assert.equal(response.statusCode,status,response.body);const operation=operations.find(operation=>operation.operationId===name),schema=operation.responses[status].content?.['application/json']?.schema;assert.ok(schema,`${name}: missing concrete JSON schema`);matches(schema,response.json(),name);return response.json();}
  const article=await observe('createArticle',{method:'POST',url:'/api/service/articles',payload:{ownerId:'solo',language:'en',title:'Original',markdown:'Original content',creditedAuthor:'Writer'}},201);
  await observe('getArticle',{url:`/api/service/articles/${article.id}`});await observe('listArticles',{url:'/api/service/articles?ownerId=solo'});await observe('listRevisions',{url:`/api/service/articles/${article.id}/revisions`});await observe('previewArticle',{url:`/api/service/articles/${article.id}/preview`});await observe('submitDraft',{method:'POST',url:`/api/service/articles/${article.id}/submit`,payload:{revisionId:article.revision.id}});
  f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site','solo','en','https://blog.example','KEY');
  const release=await observe('confirmOriginal',{method:'POST',url:`/api/service/articles/${article.id}/releases`,payload:{ownerId:'solo',revisionId:article.revision.id,creditedAuthor:'Writer',action:'publish',rightsConfirmed:true,idempotencyKey:'original'}},202);
  await observe('listOriginals',{url:`/api/service/articles/${article.id}/releases`});
  await new ReleaseWorker(publishing,{async publish(){return {remoteId:'post',url:'https://blog.example/post/'};},async verify(){return true;},async reconcile(){return null;},async unpublish(){}}).once();
  const copy=await observe('confirmDistribution',{method:'POST',url:`/api/service/releases/${release.id}/deliveries`,payload:{target:'medium',connectionId:'solo-medium',action:'create',format:'excerpt',excerpt:'Frozen excerpt',rightsConfirmed:true,idempotencyKey:'copy'}},202);
  await observe('getAssistedPackage',{url:`/api/service/deliveries/${copy.id}/package`});await observe('listDistribution',{url:`/api/service/articles/${article.id}/deliveries`});await observe('listDestinations',{url:'/api/service/targets'});await observe('listOwnerConnections',{url:'/api/service/owners/solo/connections'});
  await metrics.collect(metrics.token(article.id,release.id),{consent:true,ip:'192.0.2.1',userAgent:'fixture',referral:'https://dev.to/reader',campaign:'fixture'});
  await observe('queryMetrics',{url:'/api/service/metrics?ownerId=solo'});await observe('queryMetrics',{url:'/api/service/metrics?ownerId=solo&destination=dev'});await observe('getPublishedAlternatesStatus',{url:`/api/service/articles/${article.id}/link-status`});
  const automatic=await observe('confirmDistribution',{method:'POST',url:`/api/service/releases/${release.id}/deliveries`,payload:{target:'dev',connectionId:'solo-dev',action:'create',format:'full',rightsConfirmed:true,idempotencyKey:'automatic'}},202);f.store.run("UPDATE deliveries SET state='published',remote_id='dev-copy',url='https://dev.to/writer/copy' WHERE id=?",automatic.id);
  await observe('refreshExternalMetrics',{method:'POST',url:`/api/service/deliveries/${automatic.id}/metrics/refresh`,payload:{}});
  distribution.connections.execute=async(_actor,input:any)=>{assert.equal(input.readOnly,true);return {accountId:'frozen-account',status:200,body:input.request.url.includes('/me/published')?[{id:'dev-copy',page_views_count:7}]:{user:{user_id:'frozen-account'},public_reactions_count:2,comments_count:0}};};
  await observe('refreshExternalMetrics',{method:'POST',url:`/api/service/deliveries/${automatic.id}/metrics/refresh`,payload:{}});await observe('queryMetrics',{url:'/api/service/metrics?ownerId=solo&destination=dev'});
  f.store.run("UPDATE releases SET state='verifying' WHERE id=?",release.id);
  await observe('materializeOriginalMedia',{method:'POST',url:`/api/service/releases/${release.id}/materialize-media`,payload:{ownerId:'solo',revisionId:article.revision.id,rightsConfirmed:true,idempotencyKey:'media'}},202);await observe('listOriginals',{url:`/api/service/articles/${article.id}/releases`});await observe('reconcileOriginal',{method:'POST',url:`/api/service/releases/${release.id}/reconcile`,payload:{}});
  actor=f.actors.admin;await observe('setPublishingPermission',{method:'PUT',url:'/api/service/owners/org/publishers/publisher',payload:{enabled:true}});
  const organization=await observe('createArticle',{method:'POST',url:'/api/service/articles',payload:{ownerId:'org',language:'en',title:'Organization',markdown:'Organization content',creditedAuthor:'Writer'}},201);f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','org-site','org','en','https://org-blog.example','KEY');
  const orgRelease=await observe('confirmOriginal',{method:'POST',url:`/api/service/articles/${organization.id}/releases`,payload:{ownerId:'org',revisionId:organization.revision.id,creditedAuthor:'Writer',action:'publish',rightsConfirmed:true,idempotencyKey:'org-original'}},202);f.store.run("UPDATE releases SET state='published',remote_id='org-post',url='https://org-blog.example/post/' WHERE id=?",orgRelease.id);
  const orgCopy=await observe('confirmDistribution',{method:'POST',url:`/api/service/releases/${orgRelease.id}/deliveries`,payload:{target:'dev',connectionId:'org-dev',action:'create',format:'full',rightsConfirmed:true,idempotencyKey:'org-copy'}},202);
  await observe('requestExactApproval',{method:'POST',url:`/api/service/deliveries/${orgCopy.id}/request-approval`,payload:{}});await observe('requestExactApproval',{method:'POST',url:`/api/service/deliveries/${orgCopy.id}/request-approval`,payload:{}});await observe('attachExactApproval',{method:'POST',url:`/api/service/deliveries/${orgCopy.id}/authorize`,payload:{approvalRef:'exact-reference'}});
  const invalid=await app.inject({url:'/api/service/metrics?ownerId=org&language=invalid'});assert.equal(invalid.statusCode,400);const error=spec.paths['/api/service/metrics'].get.responses['400'].content['application/json'].schema;matches(error,invalid.json(),'error');
  authenticated=false;await observe('getArticle',{url:`/api/service/articles/${article.id}`},401);authenticated=true;actor=f.actors.outsider;await observe('getArticle',{url:`/api/service/articles/${article.id}`},403);actor=f.actors.solo;await observe('getArticle',{url:'/api/service/articles/missing'},404);await observe('editArticle',{method:'PATCH',url:`/api/service/articles/${article.id}`,payload:{expectedRevision:'wrong',title:'Rejected edit'}},409);
  const articleSchema=spec.paths['/api/service/articles/{id}'].get.responses['200'].content['application/json'].schema;assert.throws(()=>matches(articleSchema,{...article,revision:undefined}));assert.throws(()=>matches(articleSchema,{...article,id:12}));
});

test('C10: disconnected DEV update package describes exact-account manual follow-up without HackerNoon editorial instructions',async t=>{
  const f=fixture(),vault=new Vault('ab'.repeat(32)),publishing=new PublishingService(f.content,vault);f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site','solo','en','https://blog.example','KEY');
  const article=await f.content.create(f.actors.solo,{ownerId:'solo',language:'en',title:'Original',markdown:'Content',creditedAuthor:'Writer'},'create'),release=await publishing.confirm(f.actors.solo,article.id,{ownerId:'solo',revisionId:article.revision.id,creditedAuthor:'Writer',action:'publish',rightsConfirmed:true,idempotencyKey:'original'},'original');f.store.run("UPDATE releases SET state='published',remote_id='post',url='https://blog.example/post/' WHERE id=?",release.id);
  const distribution=new DistributionService(publishing,{async connection(_actor,owner,id,target){return {id,owner,target,accountId:'exact-account',active:true};},async approval(){return {};},async execute(){throw Error('No provider write');}},new TargetRegistry([new DevAdapter('https://dev.to/api')]));
  const create={target:'dev',connectionId:'dev-original',format:'full',rightsConfirmed:true},copy=await distribution.request(f.actors.solo,release.id,{...create,action:'create',idempotencyKey:'copy'},'copy');f.store.run("UPDATE deliveries SET state='published',remote_id='known-copy',url='https://dev.to/writer/known-copy' WHERE id=?",copy.id);distribution.connections.connection=async()=>{throw new AppError(409,'CONNECTION_DISABLED','Disconnected');};
  const update=await distribution.request(f.actors.solo,release.id,{...create,action:'update',copyId:copy.id,idempotencyKey:'update'},'update'),app=await createApp({...f,vault,distribution,publicUrl:'https://cms.example',authenticate:async()=>f.actors.solo});t.after(async()=>{await app.close();f.store.close();});
  const response=await app.inject({url:`/api/cms/deliveries/${update.id}/package`});assert.equal(response.statusCode,200,response.body);assert.equal(response.json().state,'manual_action_needed');assert.doesNotMatch(response.json().instructions,/HackerNoon|company-domain|editorial/i);assert.match(response.json().instructions,/reconnect/i);assert.match(response.json().instructions,/exact.*account/i);assert.equal(response.json().knownCopyUrl,'https://dev.to/writer/known-copy');
});
