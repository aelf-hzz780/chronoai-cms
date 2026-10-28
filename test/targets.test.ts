import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DevAdapter,HashnodeAdapter,copyBody,type CopyPayload} from '../src/targets.ts';
const payload:CopyPayload={deliveryId:'d',ownerKind:'organization',title:'Confirmed',markdown:'Hello\n\n```js\n  x();\n```',sourceUrl:'https://original.example/article/',sourceDigest:'source',creditedAuthor:'Credited author',language:'en',format:'full',action:'create',accountId:'account',connectionFingerprint:'fingerprint'};
const connection={accountId:'account',organizationId:'org',publicationId:'publication',canPublish:true,canUpdate:true,pro:true};
test('DEV contract builds the exact account/org copy and rejects replaced body, canonical, author and unpublished copies',async()=>{
  const adapter=new DevAdapter('https://dev.to/api');let sent:any;
  await adapter.write(payload,connection,async request=>{sent=request;return{id:1,url:'https://dev.to/a/post'};});
  assert.equal(sent.body.article.organization_id,'org');assert.equal(sent.body.article.canonical_url,payload.sourceUrl);assert.equal(sent.body.article.body_markdown,copyBody(payload));
  const good={id:1,url:'https://dev.to/a/post',title:payload.title,published_at:new Date().toISOString(),user:{user_id:'account'},organization:{id:'org'},canonical_url:payload.sourceUrl,body_markdown:copyBody(payload)};
  assert.equal(adapter.normalize(good,payload,connection)?.sourceVerified,true);
  for(const changes of [{body_markdown:copyBody(payload).replace('Hello','Replaced')},{canonical_url:'https://wrong.example'},{user:{user_id:'other'}},{organization:{id:'other'}},{published_at:null}])assert.equal(adapter.normalize({...good,...changes},payload,connection),null);
  await assert.rejects(adapter.write({...payload,action:'remove',remoteId:'1'},connection,async()=>{}),{code:'MANUAL_REMOVAL_REQUIRED'});
});
test('Hashnode contract uses canonicalUrl readback, full body and author/publication; remove/update target the known id',async()=>{
  const adapter=new HashnodeAdapter('https://gql-beta.hashnode.com');
  const good={id:'p',url:'https://publication.hashnode.dev/post',title:payload.title,canonicalUrl:payload.sourceUrl,publishedAt:new Date().toISOString(),author:{id:'account'},publication:{id:'publication'},content:{markdown:copyBody(payload)}};
  assert.equal((await adapter.reconcile({...payload,remoteId:'p'},connection,async request=>{assert.match(request.body!.query,/canonicalUrl/);return{data:{post:good}};}))?.state,'published');
  for(const changes of [{canonicalUrl:'https://wrong.example'},{author:{id:'other'}},{publication:{id:'other'}},{content:{markdown:copyBody(payload).replace('Hello','Changed')}},{publishedAt:null}])assert.equal(await adapter.reconcile({...payload,remoteId:'p'},connection,async()=>({data:{post:{...good,...changes}}})),null);
  for(const action of ['update','remove'])assert.equal(adapter.request({...payload,action,remoteId:'p'},connection).body!.variables.input.id,'p');
  await assert.rejects(adapter.write(payload,{...connection,pro:false},async()=>{}),{code:'PLAN_OR_PERMISSION_REQUIRED'});
});

test('provider metrics read only supported authorized counters; absent views remain null',async()=>{
  const dev=new DevAdapter('https://dev.to/api');const calls:any[]=[];
  const metrics=await dev.metrics({...payload,remoteId:'1'},connection,async request=>{calls.push(request);return request.url.includes('/me/published')?[{id:1,page_views_count:12}]:{user:{user_id:'account'},organization:{id:'org'},public_reactions_count:3,comments_count:0};});
  assert.deepEqual([metrics.views,metrics.reactions,metrics.comments],[12,3,0]);assert.ok(calls.every(c=>c.method==='GET'));
  const hash=new HashnodeAdapter('https://gql-beta.hashnode.com');const unavailable=await hash.metrics({...payload,remoteId:'p'},connection,async request=>{assert.match(request.body!.query,/^query/);return{data:{post:{id:'p',publication:{id:'publication'},author:{id:'account'},views:null,reactionCount:2,responseCount:1}}};});assert.equal(unavailable.views,null);assert.equal(unavailable.reactions,2);
});
