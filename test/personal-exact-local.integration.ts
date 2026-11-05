import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,chmod} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium,type Browser,type BrowserContext,type Page} from 'playwright-core';
import {BrowserRenderProof} from '../src/render-proof.ts';
import {digest} from '../src/content.ts';
import {createLocalExactFlow} from './local-exact-flow-fixture.ts';
import {chooseStudioDialog} from './studio-dialog-helper.ts';
import {selectStudioOption} from './studio-picker-helper.ts';

// Explicit integration harness: real CMS/OIDC/SQLite/UI and Ghost worker with local
// protocol fixtures. It neither contacts nor proves acceptance by real providers.
const title='Local protocol simulation: personal external publication';
const markdown='# Isolated local publishing proof\n\nThis article exists only in local protocol fixtures.\n\nThe confirmed source, credited author and exact destination stay bound through independent execution and CMS read-back.\n';
type NetworkEvent={method:string;origin:string;path:string};

test('local protocol simulation completes personal Studio external preparation, independent DEV execution and read-only registration without duplicate writes',{timeout:120_000},async()=>{
 const evidence=resolve(process.env.LOCAL_EXACT_EVIDENCE_DIR??'.runtime/local-exact-flow','happy-path');
 await mkdir(evidence,{recursive:true,mode:0o700});
 const report:any={runId:randomUUID(),classification:'LOCAL_PROTOCOL_SIMULATION_REAL_CMS_UI_HTTP_EXTERNAL_REGISTRATION',status:'RUNNING',realNyxUsed:false,realGhostUsed:false,realDevUsed:false,realProviderWrites:0,formalAcceptance:'NOT_ACCEPTED',startedAt:new Date().toISOString(),stages:[],screenshots:[]};
 const record=(stage:string,details:Record<string,unknown>={})=>report.stages.push({stage,at:new Date().toISOString(),...details});
 const save=async()=>{await writeFile(join(evidence,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});await chmod(join(evidence,'report.json'),0o600);};
 await save();
 const allowed=new Set<string>(),blockedBrowser:NetworkEvent[]=[],blockedServer:NetworkEvent[]=[],browserRequests:NetworkEvent[]=[],serverRequests:NetworkEvent[]=[];
 const originalFetch=globalThis.fetch;
 let cleanupServer:Awaited<ReturnType<typeof createLocalExactFlow>>|undefined,cleanupBrowser:Browser|undefined,failure:unknown;
 try{
 const server=cleanupServer=await createLocalExactFlow({externalPublication:true});
 for(const value of Object.values(server.fixture.origins))allowed.add(new URL(value).origin);allowed.add(new URL(server.url).origin);
 for(const origin of allowed)assert.equal(new URL(origin).hostname,'127.0.0.1','every actual transport origin must be an isolated loopback fixture');
 globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url);
  const entry={method:init?.method??(input instanceof Request?input.method:'GET'),origin:url.origin,path:url.pathname};
  if(!allowed.has(url.origin)){blockedServer.push(entry);throw new Error('External server transport blocked by local integration harness');}
  serverRequests.push(entry);return originalFetch(input,init);
 };
 const browser=cleanupBrowser=await chromium.launch({executablePath:await new BrowserRenderProof().executable(),headless:true});
 async function localContext():Promise<BrowserContext>{
  const context=await browser.newContext({viewport:{width:1440,height:1050},serviceWorkers:'block'});
  context.on('request',request=>{const url=new URL(request.url());browserRequests.push({method:request.method(),origin:url.origin,path:url.pathname});});
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url()),entry={method:request.method(),origin:url.origin,path:url.pathname};
   if(!allowed.has(url.origin)){blockedBrowser.push(entry);return route.abort('blockedbyclient');}
   return route.continue();
  });
  await context.routeWebSocket('**',socket=>{const url=new URL(socket.url());blockedBrowser.push({method:'WEBSOCKET',origin:url.origin,path:url.pathname});socket.close();});
  return context;
 }
 const context=await localContext(),page=await context.newPage(),pageErrors:string[]=[];page.on('pageerror',error=>pageErrors.push(error.message));
 async function screenshot(name:string,selected:Page=page){const path=join(evidence,name);await selected.screenshot({path,fullPage:true});await chmod(path,0o600);report.screenshots.push(name);}
 async function task(kind:'release'|'delivery',id:string){const response=await context.request.get(`${server.url}/api/cms/owners/${server.ownerId}/tasks/${kind}/${id}`);assert.equal(response.status(),200);return response.json();}
 const localDevWrites=()=>server.fixture.logs.filter(entry=>entry.service==='dev'&&entry.providerWrite).length;
  await page.goto(server.url+'/studio');await page.locator('#signin').waitFor();await page.locator('#signin').click();
  await page.locator('#workspace-trigger').waitFor();await page.locator('#app[aria-busy="false"]').waitFor();
  const identityResponse=await context.request.get(server.url+'/api/cms/me');assert.equal(identityResponse.status(),200);const identity=await identityResponse.json();
  assert.equal(identity.subject,'fixture-solo');assert.ok(identity.workspaces.some((workspace:any)=>workspace.id===server.ownerId&&workspace.kind==='personal'&&workspace.capabilities.canPublish));
  assert.ok(browserRequests.some(request=>request.path==='/auth/login'));assert.ok(browserRequests.some(request=>request.path==='/auth/callback'));
  record('real_cms_oidc_session_from_local_identity_fixture',{subject:identity.subject,ownerId:server.ownerId});await screenshot('01-studio-local-session.png');

  await page.locator('[data-action="new"]').click();await page.locator('#article-title').waitFor();
  await page.locator('#article-title').fill(title);await page.locator('#credited-author').fill(server.creditedAuthor);await page.locator('#markdown').fill(markdown);
  await page.locator('[data-action="save"]').click();await page.waitForURL(url=>url.hash.startsWith('#/article/'));
  await page.locator('.editor-state').getByText('Draft saved',{exact:true}).waitFor();
  const articleId=new URL(page.url()).hash.split('/').at(-1)!;
  const stored=server.store.get('SELECT a.language,v.id AS revision_id,v.title,v.markdown,v.credited_author FROM articles a JOIN revisions v ON v.id=a.current_revision WHERE a.id=?',articleId)!;
  assert.ok(stored);assert.equal(stored.language,'en');assert.equal(stored.title,title);assert.equal(Buffer.from(stored.markdown).toString('utf8'),markdown);assert.equal(stored.credited_author,server.creditedAuthor);
  record('studio_created_and_saved_english_article',{articleId,revisionId:stored.revision_id,sourceDigest:digest(markdown)});await screenshot('02-saved-article.png');

  await page.locator('[data-action="review-publication"]').click();await page.locator('#publication-rights').waitFor();
  assert.equal(await page.locator('[data-action="confirm-original"]').isDisabled(),true);assert.match(await page.locator('.studio-confirm-preview').innerText(),/isolated local publishing proof/i);
  await page.locator('#publication-rights').check();await screenshot('03-original-confirmation.png');await page.locator('[data-action="confirm-original"]').click();
  await page.waitForURL(url=>url.hash.startsWith('#/task/release/'));const releaseId=new URL(page.url()).hash.split('/').at(-1)!;
  assert.equal(server.store.get('SELECT state FROM releases WHERE id=?',releaseId)!.state,'queued');assert.equal(await server.releaseWorker.once(),true);
  const release=await task('release',releaseId);assert.equal(release.state,'published',JSON.stringify({state:release.state,errorCode:release.errorCode}));assert.equal(release.revisionId,stored.revision_id);
  record('real_release_worker_published_to_local_ghost_fixture',{releaseId,state:release.state,url:release.url});
  const anonymous=await localContext(),publicPage=await anonymous.newPage();
  await publicPage.goto(release.url);await publicPage.getByRole('heading',{name:title,exact:true}).waitFor();
  assert.match(await publicPage.locator('body').innerText(),/This article exists only in local protocol fixtures/);assert.ok((await publicPage.locator('body').innerText()).includes(server.creditedAuthor));
  assert.equal((await anonymous.cookies(server.url)).length,0,'public verification must not reuse CMS authentication');await screenshot('04-anonymous-ghost-fixture.png',publicPage);

  await page.goto(`${server.url}/studio#/distribution/${articleId}`);await page.locator('#distribution-target-trigger').waitFor();
  await selectStudioOption(page,'distribution-target','dev');await selectStudioOption(page,'distribution-connection',server.connectionId);await selectStudioOption(page,'distribution-format','full');
  await page.locator('#distribution-rights').check();await screenshot('05-external-materials-confirmation.png');await page.locator('[data-action="dist-external-prepare"]').click();await chooseStudioDialog(page);
  await page.waitForURL(url=>url.hash.startsWith('#/task/delivery/'));const deliveryId=new URL(page.url()).hash.split('/').at(-1)!;
  const pending=await task('delivery',deliveryId);assert.equal(pending.state,'awaiting_external');assert.equal(pending.executionMode,'external');assert.ok(pending.allowedActions.includes('external-register'));
  assert.equal(server.store.get("SELECT count(*) AS n FROM jobs WHERE kind='delivery' AND resource_id=?",deliveryId)!.n,0);assert.equal(localDevWrites(),0);assert.equal(await server.deliveryWorker.once(),false);
  await page.locator('#external-payload').waitFor();const frozenRequest=JSON.parse(await page.locator('#external-payload').inputValue());
  assert.equal(frozenRequest.method,'POST');assert.equal(frozenRequest.url,'https://dev.local.invalid/api/articles');assert.equal(frozenRequest.body.article.published,true);assert.equal(frozenRequest.body.article.title,title);assert.equal(frozenRequest.body.article.canonical_url,release.url);assert.ok(frozenRequest.body.article.body_markdown.includes(server.creditedAuthor));assert.ok(frozenRequest.body.article.body_markdown.includes(markdown.trim()));
  assert.equal(await page.locator('[data-action="delivery-authorize"]').count(),0);assert.match(await page.locator('.studio-external-publication').innerText(),/CMS does not send this DEV request/);
  record('cms_prepared_frozen_external_materials_without_worker_job',{deliveryId,state:pending.state,revisionId:pending.revisionId,accountId:pending.distribution.accountId,connectionId:pending.distribution.connectionId,requestDigest:digest(JSON.stringify(frozenRequest)),localDevWrites:0});await screenshot('06-external-payload-awaiting-independent-execution.png');

  const written=await server.fixture.executeExternal(frozenRequest);assert.ok(written.id);assert.equal(localDevWrites(),1);assert.equal(server.fixture.posts.size,1);assert.equal(server.store.get('SELECT state FROM deliveries WHERE id=?',deliveryId)!.state,'awaiting_external','An independent tool success never becomes CMS evidence automatically');
  assert.equal(server.fixture.logs.filter(entry=>entry.service==='nyx'&&entry.path.endsWith('/redeem')).length,0,'External execution must not use CMS nested exact redemption');
  assert.equal(server.fixture.logs.filter(entry=>entry.service==='nyx'&&entry.method==='POST'&&entry.path==='/api/v1/proxy/s/fixture-dev/articles').length,1);
  record('independent_local_tool_called_local_nyx_proxy_and_dev',{remoteId:String(written.id),logicalPlatformUrl:written.url,localDevWrites:1,realNyxBotUsed:false,localToolCredentialSeparateFromCms:true});

  const readsBeforeRegister=server.fixture.logs.length;
  await page.locator('#external-remote-id').fill(String(written.id));const registrationResponse=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname===`/api/cms/external-publications/${deliveryId}/register`);
  await page.locator('[data-action="delivery-external-register"]').click();await chooseStudioDialog(page);const response=await registrationResponse;assert.equal(response.status(),200,await response.text());assert.ok(response.headers()['x-trace-id']);const registrationBody=response.request().postDataJSON();assert.deepEqual(Object.keys(registrationBody).sort(),['idempotencyKey','remoteId']);
  const delivered=await task('delivery',deliveryId);assert.equal(delivered.state,'published',JSON.stringify({state:delivered.state,errorCode:delivered.errorCode}));assert.equal(delivered.copy.remoteId,String(written.id));assert.equal(delivered.copy.url,written.url);assert.equal(delivered.externalPublication.syncStatus,'verified');
  const registerRequests=server.fixture.logs.slice(readsBeforeRegister).filter(entry=>entry.service==='dev');assert.ok(registerRequests.some(entry=>entry.method==='GET'&&entry.path===`/api/articles/${written.id}`));assert.ok(registerRequests.every(entry=>entry.method==='GET'&&!entry.providerWrite));
  const history=delivered.history.map((entry:any)=>entry.state);for(const expected of ['awaiting_external','published'])assert.ok(history.includes(expected));assert.ok(history.every((state:string)=>!['approval_needed','queued','sending'].includes(state)));
  record('cms_independently_verified_registered_exact_remote_copy',{deliveryId,state:delivered.state,remoteId:delivered.copy.remoteId,url:delivered.copy.url,history,providerReadbackRequests:registerRequests.length});
  await page.reload();await page.locator(`a[href=${JSON.stringify(delivered.copy.url)}]`).first().waitFor();assert.match(await page.locator('.page-heading .badge').innerText(),/Published/);await screenshot('07-external-copy-registered-history.png');

  // The returned HTTPS URL is a logical platform identity; browser transport stays
  // on the loopback server that implements that fixture page, never on the Internet.
  const localPublicUrl=server.fixture.origins.dev+new URL(delivered.copy.url).pathname;
  await publicPage.goto(localPublicUrl);await publicPage.getByRole('heading',{name:title,exact:true}).waitFor();
  const publicBody=await publicPage.locator('body').innerText();assert.match(publicBody,/This article exists only in local protocol fixtures/);assert.ok(publicBody.includes(server.creditedAuthor));
  assert.equal(await publicPage.locator('link[rel="canonical"]').getAttribute('href'),release.url);assert.ok(await publicPage.locator(`a[href=${JSON.stringify(release.url)}]`).count()>0);
  assert.equal((await anonymous.cookies(server.url)).length,0);await screenshot('08-anonymous-dev-fixture.png',publicPage);

  const readsBeforeSync=server.fixture.logs.length;await page.locator('[data-action="delivery-external-sync"]').click();await page.locator('#notice').getByText('CMS state refreshed. Review the latest observation below.',{exact:true}).waitFor();
  const synced=await task('delivery',deliveryId);assert.equal(synced.externalPublication.syncStatus,'verified');assert.ok(synced.externalPublication.lastSyncAt);assert.ok(synced.externalPublication.lastVerifiedAt);
  const metric=server.store.get('SELECT views,reactions,comments,error_code FROM external_metrics WHERE delivery_id=?',deliveryId)!;assert.deepEqual({...metric},{views:17,reactions:3,comments:2,error_code:null});
  const syncReads=server.fixture.logs.slice(readsBeforeSync).filter(entry=>entry.service==='dev');assert.ok(syncReads.some(entry=>entry.path==='/api/articles/me/published'));assert.ok(syncReads.every(entry=>entry.method==='GET'&&!entry.providerWrite));
  const repeat=await context.request.post(`${server.url}/api/cms/external-publications/${deliveryId}/register`,{data:registrationBody,headers:{origin:server.url,'x-csrf-token':identity.csrf}});assert.equal(repeat.status(),200,await repeat.text());assert.equal((await repeat.json()).state,'published');
  assert.equal(await server.deliveryWorker.once(),false);assert.equal(localDevWrites(),1);assert.equal(server.fixture.posts.size,1);assert.equal(server.store.get("SELECT count(*) n FROM jobs WHERE kind='delivery'")!.n,0);await screenshot('09-external-copy-readonly-sync.png');
  assert.deepEqual(blockedBrowser,[]);assert.deepEqual(blockedServer,[]);assert.ok(browserRequests.every(request=>allowed.has(request.origin)));assert.deepEqual(pageErrors,[]);
  record('repeated_registration_and_sync_never_dispatch',{localDevWrites:localDevWrites(),localDevPosts:server.fixture.posts.size,readOnlySyncRequests:syncReads.length,views:metric.views,workerJobs:0});
  Object.assign(report,{status:'VERIFIED_PENDING_CLEANUP',articleId,releaseId,deliveryId,executionMode:'external',realNyxBotUsed:false,logicalDevUrl:delivered.copy.url,localDevPageUrl:localPublicUrl,localDevWrites:localDevWrites(),localDevPosts:server.fixture.posts.size,externalBrowserAttempts:0,externalServerAttempts:0,localCmsDevWrites:0});
 }catch(error){failure=error;}
 finally{
  const cleanupErrors:unknown[]=[],cleanup={browser:'not_created',fetch:'pending',fixture:'not_created'};
  if(cleanupBrowser)try{await cleanupBrowser.close();cleanup.browser='closed';}catch(error){cleanup.browser='failed';cleanupErrors.push(error);}
  try{globalThis.fetch=originalFetch;cleanup.fetch='restored';}catch(error){cleanup.fetch='failed';cleanupErrors.push(error);}
  if(cleanupServer)try{await cleanupServer.close();cleanup.fixture='closed';}catch(error){cleanup.fixture='failed';cleanupErrors.push(error);}
  if(cleanupErrors.length)failure=new AggregateError([...(failure?[failure]:[]),...cleanupErrors],'Local integration cleanup failed');
  report.status=failure?'FAIL_LOCAL_PROTOCOL_SIMULATION':'PASS_LOCAL_END_TO_END_PROTOCOL_SIMULATION';
  if(failure)report.failure={name:failure instanceof Error?failure.name:'Error',lastCompletedStage:report.stages.at(-1)?.stage??'setup',cleanupErrors:cleanupErrors.length};
  Object.assign(report,{finishedAt:new Date().toISOString(),cleanup,allowedLocalOrigins:[...allowed],blockedBrowser,blockedServer,browserRequests,serverRequests,fixtureRequests:cleanupServer?.fixture.logs.map(entry=>({...entry,path:entry.path.split('?')[0]}))??[]});await save();
 }
 if(failure)throw failure;
});
