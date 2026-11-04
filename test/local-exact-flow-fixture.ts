// LOCAL PROTOCOL FIXTURE ONLY. These servers are not NyxID, Ghost, or DEV deployments.
// Production CMS/auth/authority/adapters/workers run unchanged against loopback HTTP.
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Fastify,{type FastifyInstance,type FastifyRequest} from 'fastify';
import {generateKeyPair,exportJWK,SignJWT,jwtVerify} from 'jose';
import {Store} from '../src/store.ts';
import {Vault} from '../src/vault.ts';
import {Policy} from '../src/policy.ts';
import {ContentService} from '../src/content.ts';
import {AuthManager} from '../src/auth.ts';
import {NyxAuthority} from '../src/nyxid.ts';
import {loadConfig} from '../src/config.ts';
import {createApp} from '../src/app.ts';
import {PublishingService,ReleaseWorker} from '../src/publishing.ts';
import {DistributionService,DeliveryWorker} from '../src/distribution.ts';
import {DevAdapter,TargetRegistry} from '../src/targets.ts';
import {GhostAdapter} from '../src/ghost.ts';
import {render} from '../src/render.ts';

type Json=Record<string,any>;
export interface LocalFixtureLog {at:string;service:'nyx'|'ghost'|'dev';method:string;path:string;providerWrite:boolean;}
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
// Independent protocol oracle; intentionally does not import product canonical/digest helpers.
function canonical(value:any):string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
const fingerprint=(value:any)=>'sha256:'+sha(canonical(value));
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const now=()=>new Date().toISOString();
function fail(status:number,message:string):never {throw Object.assign(new Error(message),{statusCode:status});}
function demand(value:unknown,message:string,status=400):asserts value {if(!value)fail(status,message);}

export async function createLocalExactFlow(){
  const directory=await mkdtemp(join(tmpdir(),'chrono-local-exact-'));
  const servers:FastifyInstance[]=[];let store:Store|undefined,closed=false;
  const logs:LocalFixtureLog[]=[],approvals=new Map<string,Json>(),posts=new Map<string,Json>(),ghostPosts=new Map<string,Json>();
  const subject='fixture-solo',clientId='fixture-cms',connectionId='fixture-dev-connection',creditedAuthor='Local Fixture Author';
  const logicalDevBase='https://dev.local.invalid/api',slug='fixture-dev',accountId='fixture-author';
  const ghostKeyId=randomBytes(12).toString('hex'),ghostSecret=randomBytes(32),controlSecret=randomBytes(32).toString('hex');
  const keys=await generateKeyPair('RS256'),jwk={...await exportJWK(keys.publicKey),kid:'local-fixture-key'};
  const codes=new Map<string,Json>(),issued=new Set<string>();let latestAccess='';
  const origins={cms:'',nyx:'',ghost:'',dev:''};
  const fixture={baseUrl:'',origins,logs,approvals,posts,ghostPosts,loseNextRedeemResponseAfterWrite:false,
    async decide(reference:string){
      demand(latestAccess,'Complete fixture OAuth before deciding',409);
      const response=await fetch(origins.nyx+'/api/v1/approvals/requests/'+encodeURIComponent(reference)+'/decide',{method:'POST',headers:{authorization:'Bearer '+latestAccess,'content-type':'application/json'},body:JSON.stringify({approved:true})});
      demand(response.ok,'Fixture decision failed: '+response.status,response.status);return response.json();
    },
    async expire(reference:string){
      const response=await fetch(origins.nyx+'/__fixture/expire/'+encodeURIComponent(reference),{method:'POST',headers:{'x-local-fixture-control':controlSecret}});
      demand(response.ok,'Fixture expiry failed: '+response.status,response.status);return response.json();
    }
  };
  async function close(){
    if(closed)return;closed=true;
    const results=await Promise.allSettled(servers.map(server=>server.close())),errors=results.filter(result=>result.status==='rejected').map(result=>result.reason);
    try{store?.close();}catch(error){errors.push(error);}
    try{await rm(directory,{recursive:true,force:true});}catch(error){errors.push(error);}
    if(errors.length)throw new AggregateError(errors,'Local fixture cleanup failed');
  }
  function server(service:LocalFixtureLog['service']){
    const app=Fastify({logger:false,bodyLimit:4_000_000,forceCloseConnections:true});servers.push(app);
    app.addHook('onRequest',async request=>{logs.push({at:now(),service,method:request.method,path:new URL(request.url,'http://127.0.0.1').pathname,providerWrite:service==='dev'&&!['GET','HEAD','OPTIONS'].includes(request.method)});});
    app.setErrorHandler((error:any,_request,reply)=>reply.code(error.statusCode??500).send({error:'LOCAL_FIXTURE_PROTOCOL',message:error.message}));return app;
  }
  async function bearer(request:FastifyRequest){
    const header=request.headers.authorization;demand(typeof header==='string'&&header.startsWith('Bearer '),'Fixture bearer required',401);
    const token=header.slice(7);demand(issued.has(token),'Unknown fixture token',401);
    try{const {payload}=await jwtVerify(token,keys.publicKey,{issuer:origins.nyx,audience:clientId,algorithms:['RS256']});demand(payload.sub===subject&&payload.client_id===clientId&&payload.token_type==='access','Fixture caller binding',401);return payload;}
    catch{fail(401,'Invalid fixture token');}
  }
  const endpoint={endpoint_id:'nyx_generic_proxy_v1',method:'POST',path:'',parameters:null,request_content_type:'application/json',request_body_schema:null,request_body_required:false,response:null};
  const endpointContractDigest=fingerprint({contract_version:'nyxid-exact-endpoint.v1',...endpoint});
  const catalogDigest=fingerprint({fixture:'local-exact-v1',endpoint});
  function publicApproval(record:Json){const {caller,...result}=record;return result;}
  function recordFor(request:FastifyRequest){const id=(request.params as Json).reference;const record=approvals.get(id);demand(record,'Unknown fixture approval',404);return record;}
  function sameCaller(record:Json,caller:Json){demand(record.caller.sub===caller.sub&&record.caller.client_id===caller.client_id,'Approval caller mismatch',403);}
  try{
    const dev=server('dev');
    dev.post('/api/articles',async(request,reply)=>{
      const article=(request.body as Json)?.article;demand(article&&typeof article.title==='string'&&typeof article.body_markdown==='string'&&article.published===true,'Invalid local DEV article');
      demand(new URL(article.canonical_url).origin===origins.ghost,'Original must stay on fixture Ghost');
      const id=String(posts.size+1),post={...article,id,url:origins.dev+'/fixture-author/'+id,user:{user_id:accountId},published_at:now()};posts.set(id,post);return reply.code(201).send(post);
    });
    dev.get('/api/articles/me/all',async()=>[...posts.values()]);
    dev.get('/api/articles/:id',async request=>{const post=posts.get((request.params as Json).id);demand(post,'Unknown local DEV article',404);return post;});
    dev.get('/fixture-author/:id',async(request,reply)=>{const post=posts.get((request.params as Json).id);demand(post,'Unknown local DEV article',404);return reply.type('text/html').send('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>'+escape(post.title)+'</title><link rel="canonical" href="'+escape(post.canonical_url)+'"></head><body><aside>LOCAL DEV PROTOCOL FIXTURE — no external publication</aside><article><h1>'+escape(post.title)+'</h1>'+render(post.body_markdown,new Set())+'</article></body></html>');});
    origins.dev=await dev.listen({host:'127.0.0.1',port:0});

    const ghost=server('ghost');
    ghost.addHook('preHandler',async request=>{
      if(!request.url.startsWith('/ghost/api/admin/'))return;
      const token=request.headers.authorization;demand(typeof token==='string'&&token.startsWith('Ghost '),'Ghost fixture credential required',401);
      try{const verified=await jwtVerify(token.slice(6),ghostSecret,{audience:'/admin/',algorithms:['HS256']});demand(verified.protectedHeader.kid===ghostKeyId,'Ghost key binding',401);}catch{fail(401,'Invalid Ghost fixture credential');}
    });
    ghost.get('/ghost/api/admin/posts/',async request=>{
      const filter=(request.query as Json).filter;demand(typeof filter==='string'&&filter.startsWith('slug:'),'Exact Ghost slug filter required');return {posts:[...ghostPosts.values()].filter(post=>post.slug===filter.slice(5))};
    });
    ghost.post('/ghost/api/admin/posts/',async(request,reply)=>{
      const input=(request.body as Json)?.posts?.[0];demand(input&&typeof input.slug==='string'&&typeof input.html==='string'&&input.status==='published','Invalid local Ghost post');
      demand(![...ghostPosts.values()].some(post=>post.slug===input.slug),'Duplicate fixture Ghost slug',409);
      const id=randomUUID(),post={...input,id,url:origins.ghost+'/'+input.slug+'/',updated_at:now(),authors:input.authors.map((id:string)=>({id}))};ghostPosts.set(id,post);return reply.code(201).send({posts:[post]});
    });
    ghost.put('/ghost/api/admin/posts/:id/',async request=>{
      const post=ghostPosts.get((request.params as Json).id),input=(request.body as Json)?.posts?.[0];demand(post&&input,'Unknown local Ghost post',404);
      demand(!input.updated_at||input.updated_at===post.updated_at,'Ghost fixture update conflict',409);Object.assign(post,input,{updated_at:now(),...(input.authors?{authors:input.authors.map((id:string)=>({id}))}:{})});return {posts:[post]};
    });
    ghost.get('/:slug/',async(request,reply)=>{
      const post=[...ghostPosts.values()].find(post=>post.slug===(request.params as Json).slug&&post.status==='published');demand(post,'Unknown local Ghost page',404);
      const language=post.tags?.some((tag:Json)=>tag.name==='#language-zh')?'zh':'en';
      return reply.type('text/html').send('<!doctype html><html lang="'+language+'"><head><meta charset="utf-8"><title>'+escape(post.title)+'</title>'+(post.codeinjection_head??'')+'</head><body><aside>LOCAL GHOST PROTOCOL FIXTURE — no external publication</aside><main><article><h1>'+escape(post.title)+'</h1>'+post.html+'</article>'+(post.codeinjection_foot??'')+'</main></body></html>');
    });
    origins.ghost=await ghost.listen({host:'127.0.0.1',port:0});

    const nyx=server('nyx');
    nyx.addContentTypeParser('application/x-www-form-urlencoded',{parseAs:'string'},(_request,body,done)=>done(null,Object.fromEntries(new URLSearchParams(String(body)))));
    nyx.get('/.well-known/openid-configuration',async()=>({issuer:origins.nyx,authorization_endpoint:origins.nyx+'/authorize',token_endpoint:origins.nyx+'/token',jwks_uri:origins.nyx+'/jwks',code_challenge_methods_supported:['S256']}));
    nyx.get('/jwks',async()=>({keys:[jwk]}));
    nyx.get('/authorize',async(request,reply)=>{
      const q=request.query as Json;demand(q.client_id===clientId&&q.redirect_uri===origins.cms+'/auth/callback'&&q.response_type==='code'&&q.code_challenge_method==='S256'&&typeof q.code_challenge==='string'&&typeof q.state==='string'&&typeof q.nonce==='string','Fixture OAuth binding');
      demand(q.scope==='openid profile proxy','Fixture exact scope');const code=randomBytes(24).toString('base64url');codes.set(code,{...q,expiresAt:Date.now()+60000});const callback=new URL(q.redirect_uri);callback.search=new URLSearchParams({code,state:q.state}).toString();return reply.redirect(callback.href);
    });
    nyx.post('/token',async request=>{
      const body=request.body as Json,code=codes.get(body?.code);demand(code&&code.expiresAt>Date.now()&&body.grant_type==='authorization_code'&&body.client_id===clientId&&body.redirect_uri===code.redirect_uri&&typeof body.code_verifier==='string','Fixture OAuth code binding',401);
      demand(createHash('sha256').update(body.code_verifier).digest('base64url')===code.code_challenge,'Fixture PKCE mismatch',401);codes.delete(body.code);
      const sign=(payload:Json,audience:string)=>new SignJWT(payload).setProtectedHeader({alg:'RS256',kid:jwk.kid}).setIssuer(origins.nyx).setSubject(subject).setAudience(audience).setIssuedAt().setExpirationTime('30m').setJti(randomUUID()).sign(keys.privateKey);
      const access=await sign({scope:code.scope,client_id:clientId,token_type:'access'},clientId);issued.add(access);latestAccess=access;
      const id=await sign({nonce:code.nonce,at_hash:Buffer.from(sha(access),'hex').subarray(0,16).toString('base64url')},clientId);return {token_type:'Bearer',access_token:access,id_token:id,expires_in:1800,scope:code.scope};
    });
    nyx.post('/introspect',async request=>{
      const body=request.body as Json;if(body?.client_id!==clientId||!issued.has(body.token))return {active:false};
      try{const {payload}=await jwtVerify(body.token,keys.publicKey,{issuer:origins.nyx,audience:clientId,algorithms:['RS256']});return {...payload,active:true};}catch{return {active:false};}
    });
    nyx.get('/api/v1/orgs',async request=>{await bearer(request);return {orgs:[]};});
    nyx.get('/api/v1/user-services',async request=>{await bearer(request);return {services:[{id:connectionId,slug,is_active:true,state_version:1,credential_source:{type:'personal'}}]};});
    nyx.get('/api/v1/mcp/config',async request=>{await bearer(request);return {catalog_digest:catalogDigest,services:[{service_id:connectionId,is_user_service:true,is_generic_proxy:true,endpoints:[endpoint]}]};});
    nyx.post('/api/v1/approvals/exact-service/requests',async request=>{
      const caller=await bearer(request),body=request.body as Json,args=body?.arguments;
      demand(body.user_service_id===connectionId&&body.endpoint_id===endpoint.endpoint_id&&body.operation_id===endpoint.endpoint_id&&body.catalog_digest===catalogDigest&&body.endpoint_contract_digest===endpointContractDigest&&typeof body.idempotency_key==='string','Fixture exact endpoint/catalog binding');
      demand(args?.method==='POST'&&args.path==='/articles'&&args.body?.article&&Object.keys(args).sort().join(',')==='body,method,path','Fixture exact provider operation');
      const expected=fingerprint({contract_version:'nyxid-exact-operation.v1',user_service_id:connectionId,endpoint_id:endpoint.endpoint_id,endpoint_contract_digest:endpointContractDigest,arguments:args});demand(body.operation_digest===expected,'Fixture operation digest mismatch');
      const existing=[...approvals.values()].find(record=>record.idempotency_key===body.idempotency_key);if(existing){sameCaller(existing,caller);demand(existing.operation_digest===expected,'Fixture idempotency conflict',409);return publicApproval(existing);}
      const record={...structuredClone(body),request_id:randomUUID(),operation_generation:1,state:'pending',expires_at:new Date(Date.now()+300000).toISOString(),caller:{sub:caller.sub,client_id:caller.client_id}};approvals.set(record.request_id,record);return publicApproval(record);
    });
    nyx.get('/api/v1/approvals/exact-service/requests/:reference/status',async request=>{const caller=await bearer(request),record=recordFor(request);sameCaller(record,caller);if(record.state!=='redeemed'&&Date.parse(record.expires_at)<=Date.now())record.state='expired';return publicApproval(record);});
    nyx.post('/api/v1/approvals/requests/:reference/decide',async request=>{const caller=await bearer(request),record=recordFor(request);sameCaller(record,caller);demand(record.state==='pending'&&Date.parse(record.expires_at)>Date.now(),'Fixture approval no longer pending',409);demand((request.body as Json)?.approved===true,'Fixture decision must approve');record.state='approved';return publicApproval(record);});
    nyx.post('/__fixture/expire/:reference',async request=>{demand(request.headers['x-local-fixture-control']===controlSecret,'Fixture control required',403);const record=recordFor(request);demand(record.state!=='redeemed','Cannot expire redeemed fixture',409);record.expires_at=new Date(Date.now()-1000).toISOString();record.state='expired';return publicApproval(record);});
    nyx.post('/api/v1/approvals/exact-service/requests/:reference/redeem',async(request,reply)=>{
      const caller=await bearer(request),record=recordFor(request),body=request.body as Json;sameCaller(record,caller);
      for(const key of ['catalog_digest','operation_digest','operation_id','operation_generation','idempotency_key'])demand(body?.[key]===record[key],'Fixture redemption fence mismatch: '+key,409);
      if(record.state==='redeemed')return publicApproval(record);
      demand(record.state==='approved'&&Date.parse(record.expires_at)>Date.now(),'Fixture approval not executable',409);record.state='redeeming';
      const response=await fetch(origins.dev+'/api/articles',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(record.arguments.body),redirect:'error'}),responseBody=await response.text();
      record.receipt={http_status:response.status,response_body:responseBody,response_digest:'sha256:'+sha(responseBody)};record.state=response.ok?'redeemed':'failed';
      if(fixture.loseNextRedeemResponseAfterWrite){fixture.loseNextRedeemResponseAfterWrite=false;reply.hijack();reply.raw.destroy();return;}
      return publicApproval(record);
    });
    nyx.get('/api/v1/proxy/s/:slug/*',async(request,reply)=>{
      await bearer(request);const params=request.params as Json,q=request.query as Json;demand(params.slug===slug&&q._nyxid_via===connectionId,'Fixture exact proxy selector');
      demand(/^articles\/(?:[0-9]+|me\/all)$/.test(params['*']),'Fixture read route denied',403);
      const target=new URL(origins.dev+'/api/'+params['*']);for(const [key,value]of Object.entries(q))if(key!=='_nyxid_via')target.searchParams.set(key,String(value));
      const response=await fetch(target,{redirect:'error'});return reply.code(response.status).type('application/json').send(await response.text());
    });
    origins.nyx=await nyx.listen({host:'127.0.0.1',port:0});fixture.baseUrl=origins.nyx;

    const ownerId='personal-'+sha(origins.nyx+'\n'+subject).slice(0,32),connectionsFile=join(directory,'connections.json');
    await writeFile(connectionsFile,JSON.stringify([{id:connectionId,target:'dev',owner:{kind:'personal',issuer:origins.nyx,subject},slug,remoteBaseUrl:logicalDevBase,accountId,label:'LOCAL FIXTURE DEV',canPublish:true,executionApproval:'exact'}]),{mode:0o600});
    const environment:NodeJS.ProcessEnv={DATABASE_PATH:join(directory,'cms.sqlite'),PUBLIC_URL:'http://127.0.0.1',HOST:'127.0.0.1',PORT:'3100',NYXID_ISSUER:origins.nyx,NYXID_API_URL:origins.nyx,NYXID_INTROSPECTION_URL:origins.nyx+'/introspect',NYXID_CLIENT_ID:clientId,NYXID_CMS_AUDIENCE:clientId,NYXID_SERVICE_AUDIENCE:'fixture-service',NYXID_OAUTH_SCOPES:'openid profile proxy',NYXID_CMS_CAPABILITY_SCOPES_JSON:JSON.stringify({'content:read':['profile'],'content:write':['proxy'],publish:['proxy'],'metrics:read':['proxy'],'roles:write':['proxy'],'connections:read':['proxy']}),NYXID_CONNECTIONS_FILE:connectionsFile,ENCRYPTION_KEY:randomBytes(32).toString('hex'),TRACKING_SECRET:randomBytes(32).toString('hex'),PUBLIC_MEDIA_DIRECTORY:join(directory,'media'),ALLOW_LOOPBACK_HTTP:'true',DEV_API_URL:logicalDevBase,FIXTURE_GHOST_KEY:ghostKeyId+':'+ghostSecret.toString('hex'),...(process.env.RENDER_BROWSER_EXECUTABLE?{RENDER_BROWSER_EXECUTABLE:process.env.RENDER_BROWSER_EXECUTABLE}:{})};
    const config=loadConfig(environment);store=new Store(config.database);await chmod(config.database,0o600);
    store.createOwner(ownerId,'personal',origins.nyx,subject);store.run('INSERT INTO owner_profiles VALUES (?,?)',ownerId,'LOCAL FIXTURE personal workspace');
    store.run('INSERT INTO sites VALUES (?,?,?,?,?)','fixture-ghost-en',ownerId,'en',origins.ghost,'FIXTURE_GHOST_KEY');
    store.run('INSERT INTO author_mappings VALUES (?,?,?)','fixture-ghost-en',creditedAuthor,'fixture-ghost-author');
    const vault=new Vault(config.encryptionKey),authority=new NyxAuthority(config,store),policy=new Policy(store,authority),content=new ContentService(store,policy),auth=new AuthManager(config,store,vault,policy);
    const originals=new PublishingService(content,vault),distribution=new DistributionService(originals,authority,new TargetRegistry([new DevAdapter(logicalDevBase)])),original=new GhostAdapter(store,config.publicMediaDirectory,true,environment);
    const dependencies={store,policy,content,vault,publicUrl:config.publicUrl,auth,distribution,authenticate:(request:FastifyRequest)=>auth.authenticate(request)};
    const app=await createApp(dependencies);servers.push(app);
    app.addHook('onSend',async(request,_reply,payload)=>{
      if(!['/studio','/studio/'].includes(request.url.split('?')[0]!))return payload;
      const html=Buffer.isBuffer(payload)?payload.toString('utf8'):typeof payload==='string'?payload:null;
      return html===null?payload:html.replace('<body>','<body><aside id="local-fixture-notice" style="position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#ffe9b4;padding:8px;text-align:center;font:12px sans-serif">LOCAL PROTOCOL FIXTURE / 本地模拟：身份、Ghost、DEV 均隔离；不会公开发文。</aside>');
    });
    origins.cms=await app.listen({host:'127.0.0.1',port:0});config.publicUrl=origins.cms;dependencies.publicUrl=origins.cms;environment.PUBLIC_URL=origins.cms;environment.PORT=String(new URL(origins.cms).port);
    assert.ok(Object.values(origins).every(value=>new URL(value).hostname==='127.0.0.1'));
    return {url:origins.cms,store,config,environment,directory,ownerId,subject,creditedAuthor,connectionId,content,auth,authority,originals,distribution,original,releaseWorker:new ReleaseWorker(originals,original),deliveryWorker:new DeliveryWorker(distribution,original),fixture,close};
  }catch(error){try{await close();}catch(cleanupError){throw new AggregateError([error,cleanupError],'Local fixture startup and cleanup failed');}throw error;}
}
