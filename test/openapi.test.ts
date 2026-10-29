import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers.ts';
import {createApp} from '../src/app.ts';
import {Vault} from '../src/vault.ts';
import {PublishingService} from '../src/publishing.ts';
import {DistributionService} from '../src/distribution.ts';
import {TargetRegistry,AssistedAdapter} from '../src/targets.ts';

test('R022: declared success statuses, JSON shapes and binary media match actual service responses',async t=>{
  const f=fixture(),vault=new Vault('ab'.repeat(32)),originals=new PublishingService(f.content,vault);
  const distribution=new DistributionService(originals,{
    async listConnections(){return [{id:'solo-medium',target:'medium',active:true}];},
    async connection(_actor:any,owner:any,id:string,target:string){return {id,owner,target,active:true,accountId:'solo',canPublish:true,canRemove:true};},
  } as any,new TargetRegistry([new AssistedAdapter('medium')]));
  const app=await createApp({...f,vault,distribution,publicUrl:'https://cms.example',authenticate:async()=>f.actors.solo});
  t.after(async()=>{await app.close();f.store.close();});
  const spec=(await app.inject({url:'/openapi.json'})).json(),operations=Object.values(spec.paths).flatMap((methods:any)=>Object.values(methods)) as any[];
  async function observe(name:string,request:any,status=200,bytes?:Buffer){
    const response=await app.inject(request);assert.equal(response.statusCode,status,response.body);
    const operation=operations.find(op=>op.operationId===name),success=operation.responses[response.statusCode];assert.ok(success,`${name} must advertise HTTP ${response.statusCode}`);
    const mime=String(response.headers['content-type']).split(';')[0]!,schema=success.content[mime]?.schema;assert.ok(schema,`${name} must advertise ${mime}`);
    if(bytes){assert.equal(schema.type,'string');assert.equal(schema.format,'binary');assert.deepEqual(response.rawPayload,bytes);}
    else{const body=response.json();assert.equal(schema.type,Array.isArray(body)?'array':typeof body,name);if(Array.isArray(body))assert.equal(schema.items.type,'object');}
    return response;
  }
  const source='\uFEFF# Original\r\n',article=(await observe('createArticle',{method:'POST',url:'/api/service/articles',payload:{ownerId:'solo',language:'en',title:'Original',markdown:source,creditedAuthor:'Solo'}},201)).json();
  await observe('importMarkdownFile',{method:'POST',url:'/api/service/articles/import?ownerId=solo&language=en&title=Imported&creditedAuthor=Solo',headers:{'content-type':'text/markdown'},payload:Buffer.from(source)},201);
  for(const [mime,bytes] of [
    ['image/png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=','base64')],
    ['image/jpeg',Buffer.from([0xff,0xd8,0xff,0xd9])],['image/gif',Buffer.from('GIF89a')],['image/webp',Buffer.from('RIFF0000WEBP')],
  ] as const){
    const asset=(await observe('uploadPrivateImage',{method:'POST',url:`/api/service/articles/${article.id}/assets`,payload:{mime,base64:bytes.toString('base64')}},201)).json();
    await observe('getPrivateImage',{url:`/api/service/assets/${asset.id}`},200,bytes);
  }
  await observe('downloadMarkdown',{url:`/api/service/articles/${article.id}/markdown?revision=${article.revision.id}`},200,Buffer.from(source));
  f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site','solo','en','http://localhost:3999','KEY');
  const release=(await observe('confirmOriginal',{method:'POST',url:`/api/service/articles/${article.id}/releases`,payload:{ownerId:'solo',revisionId:article.revision.id,creditedAuthor:'Solo',action:'publish',rightsConfirmed:true,idempotencyKey:'contract-original'}},202)).json();
  // Only local fixture state is seeded; no Ghost request or worker dispatch.
  f.store.run("UPDATE releases SET state='published',remote_id='original',url='http://localhost:3999/original/' WHERE id=?",release.id);
  await observe('confirmDistribution',{method:'POST',url:`/api/service/releases/${release.id}/deliveries`,payload:{target:'medium',connectionId:'solo-medium',action:'create',format:'full',rightsConfirmed:true,idempotencyKey:'contract-copy'}},202);
  for(const [name,url] of [
    ['listArticles','/articles?ownerId=solo'],['listRevisions',`/articles/${article.id}/revisions`],['listOriginals',`/articles/${article.id}/releases`],['listDestinations','/targets'],['listOwnerConnections','/owners/solo/connections'],['listDistribution',`/articles/${article.id}/deliveries`],['readAudit','/owners/solo/audit'],['getPublishedAlternatesStatus',`/articles/${article.id}/link-status`],
  ])await observe(name!,{url:`/api/service${url}`});
  await f.content.edit(f.actors.solo,article.id,article.revision.id,{markdown:'# Newer'},'edit');
  const preview=await observe('previewArticle',{url:`/api/service/articles/${article.id}/preview?revision=${article.revision.id}`});assert.equal(preview.json().revisionId,article.revision.id);assert.match(preview.json().html,/Original/);
  const parameter=operations.find(op=>op.operationId==='previewArticle').parameters.find((p:any)=>p.name==='revision');assert.equal(parameter?.in,'query');assert.equal(parameter?.required,false);
});

test('R022: advertised removed report follows actual known-copy removal guards and response',async t=>{
  const f=fixture(),vault=new Vault('ab'.repeat(32)),originals=new PublishingService(f.content,vault),distribution=new DistributionService(originals,{async connection(_actor:any,owner:any,id:string,target:string){return {id,owner,target,active:true,accountId:'solo',canPublish:true,canRemove:true};}} as any,new TargetRegistry([new AssistedAdapter('medium')]));
  const app=await createApp({...f,vault,distribution,publicUrl:'https://cms.example',authenticate:async()=>f.actors.solo});t.after(async()=>{await app.close();f.store.close();});
  const operation=(await app.inject({url:'/openapi.json'})).json().paths['/api/service/deliveries/{id}/report'].post;
  assert.ok(operation.requestBody.content['application/json'].schema.properties.state.enum.includes('removed'));
  f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site','solo','en','http://localhost:3999','KEY');
  const article=await f.content.create(f.actors.solo,{ownerId:'solo',language:'en',title:'Original',markdown:'Original',creditedAuthor:'Solo'},'create');
  const release=await originals.confirm(f.actors.solo,article.id,{ownerId:'solo',revisionId:article.revision.id,creditedAuthor:'Solo',action:'publish',rightsConfirmed:true,idempotencyKey:'original'},'confirm');
  f.store.run("UPDATE releases SET state='published',remote_id='original',url='http://localhost:3999/original/' WHERE id=?",release.id);
  const request={target:'medium',connectionId:'solo-medium',format:'full',rightsConfirmed:true};
  const copy=await distribution.request(f.actors.solo,release.id,{...request,action:'create',idempotencyKey:'copy'},'copy');
  const report=(id:string)=>app.inject({method:'POST',url:`/api/service/deliveries/${id}/report`,payload:{state:'removed'}});
  assert.equal((await report(copy.id)).statusCode,409,'A create action cannot be marked removed');
  f.store.run("UPDATE deliveries SET state='published',remote_id='copy',url='https://medium.com/@solo/known' WHERE id=?",copy.id);
  const removal=await distribution.request(f.actors.solo,release.id,{...request,action:'remove',copyId:copy.id,idempotencyKey:'remove'},'remove');let gone=false;
  t.mock.method(globalThis,'fetch',async(url:any,options:any)=>{assert.equal(String(url),'https://medium.com/@solo/known');assert.equal(options?.method??'GET','GET');return new Response('',{status:gone?404:200});});
  assert.equal((await report(removal.id)).statusCode,409,'A known copy still publicly present cannot be marked removed');gone=true;
  const response=await report(removal.id);assert.equal(response.statusCode,200,response.body);assert.equal(response.json().state,'removed');assert.equal(operation.responses['200'].content['application/json'].schema.type,typeof response.json());
  assert.equal(f.store.get('SELECT state FROM deliveries WHERE id=?',copy.id)!.state,'removed');
});
