import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,chmod} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {chromium,type Browser,type BrowserContext,type Page} from 'playwright-core';
import {BrowserRenderProof} from '../src/render-proof.ts';
import {digest} from '../src/content.ts';
import {createLocalExactFlow} from './local-exact-flow-fixture.ts';
import {chooseStudioDialog} from './studio-dialog-helper.ts';
import {selectStudioOption} from './studio-picker-helper.ts';

// Explicit integration harness: real CMS/OIDC/SQLite/UI/workers with local
// protocol fixtures. It neither contacts nor proves acceptance by real providers.
const title='Local protocol simulation: exact personal publishing';
const markdown='# Isolated local publishing proof\n\nThis article exists only in local protocol fixtures.\n\nThe confirmed source, credited author and exact destination stay bound through approval.\n';
type NetworkEvent={method:string;origin:string;path:string};

test('local protocol simulation completes personal Studio publication and exact DEV delivery without external traffic or duplicate writes',{timeout:120_000},async()=>{
 const evidence=resolve(process.env.LOCAL_EXACT_EVIDENCE_DIR??'.runtime/local-exact-flow','happy-path');
 await mkdir(evidence,{recursive:true,mode:0o700});
 const report:any={runId:randomUUID(),classification:'LOCAL_PROTOCOL_SIMULATION_REAL_CMS_UI_HTTP_AND_WORKERS',status:'RUNNING',realNyxUsed:false,realGhostUsed:false,realDevUsed:false,realProviderWrites:0,formalAcceptance:'NOT_ACCEPTED',startedAt:new Date().toISOString(),stages:[],screenshots:[]};
 const record=(stage:string,details:Record<string,unknown>={})=>report.stages.push({stage,at:new Date().toISOString(),...details});
 const save=async()=>{await writeFile(join(evidence,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});await chmod(join(evidence,'report.json'),0o600);};
 await save();
 const allowed=new Set<string>(),blockedBrowser:NetworkEvent[]=[],blockedServer:NetworkEvent[]=[],browserRequests:NetworkEvent[]=[],serverRequests:NetworkEvent[]=[];
 const originalFetch=globalThis.fetch;
 let cleanupServer:Awaited<ReturnType<typeof createLocalExactFlow>>|undefined,cleanupBrowser:Browser|undefined,failure:unknown;
 try{
 const server=cleanupServer=await createLocalExactFlow();
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
 let cliSequence=0;
 async function runDeliveryCli(id:string){
  const sequence=++cliSequence,guardPath=join(server.directory,`cli-guard-${sequence}.mjs`),networkPath=join(server.directory,`cli-network-${sequence}.json`);
  await writeFile(guardPath,`import{writeFileSync}from'node:fs';
const allowed=new Set(${JSON.stringify([...allowed])}),network={requests:[],blocked:[]},original=globalThis.fetch;
globalThis.fetch=async(input,init)=>{const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url),entry={method:init?.method??(input instanceof Request?input.method:'GET'),origin:url.origin,path:url.pathname};if(!allowed.has(url.origin)){network.blocked.push(entry);throw Error('External CLI transport blocked by local integration harness');}network.requests.push(entry);return original(input,init);};
process.on('exit',()=>writeFileSync(${JSON.stringify(networkPath)},JSON.stringify(network),{mode:0o600}));
`,{mode:0o600});
  const result=await new Promise<{exitCode:number|null;stdout:string;stderr:string}>((resolveResult,reject)=>{
   const child=spawn(process.execPath,['--import',guardPath,fileURLToPath(new URL('../scripts/run-delivery-once.ts',import.meta.url)),'--delivery',id,'--execute'],{env:{PATH:process.env.PATH??'/usr/bin:/bin',...server.environment},stdio:['ignore','pipe','pipe']});
   let stdout='',stderr='',timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},40_000);
   child.stdout.on('data',chunk=>{stdout+=String(chunk);});child.stderr.on('data',chunk=>{stderr+=String(chunk);});
   child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('close',exitCode=>{clearTimeout(timer);if(timedOut)reject(new Error('Local delivery CLI exceeded its bounded runtime'));else resolveResult({exitCode,stdout,stderr});});
  });
  const parseLines=(value:string)=>value.split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
  const network=JSON.parse(await readFile(networkPath,'utf8'));assert.deepEqual(network.blocked,[]);assert.ok(network.requests.every((request:NetworkEvent)=>allowed.has(request.origin)));
  const receipt=parseLines(result.stdout).at(-1),errors=parseLines(result.stderr);return {exitCode:result.exitCode,receipt,errors,network};
 }
  await page.goto(server.url+'/studio');await page.locator('#signin').waitFor();await page.locator('#signin').click();
  await page.locator('#workspace-trigger').waitFor();await page.locator('#app[aria-busy="false"]').waitFor();
  const identityResponse=await context.request.get(server.url+'/api/cms/me');assert.equal(identityResponse.status(),200);const identity=await identityResponse.json();
  assert.equal(identity.subject,'fixture-solo');assert.ok(identity.workspaces.some((workspace:any)=>workspace.id===server.ownerId&&workspace.kind==='personal'&&workspace.capabilities.canPublish));
  assert.ok(browserRequests.some(request=>request.path==='/auth/login'));assert.ok(browserRequests.some(request=>request.path==='/auth/callback'));
  record('real_cms_oidc_session_from_local_identity_fixture',{subject:identity.subject,ownerId:server.ownerId});await screenshot('01-studio-local-session.png');

  await page.locator('[data-action="new"]').click();await page.locator('#article-title').waitFor();
  await page.locator('#article-title').fill(title);await page.locator('#credited-author').fill(server.creditedAuthor);await page.locator('#markdown').fill(markdown);
  await page.locator('[data-action="save"]').click();await page.waitForURL(url=>url.hash.startsWith('#/article/'));
  await page.waitForFunction(()=>document.querySelector('.editor-state')?.textContent?.includes('Saved'));
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
  await page.locator('#distribution-rights').check();await screenshot('05-exact-delivery-confirmation.png');await page.locator('[data-action="dist-confirm"]').click();await chooseStudioDialog(page);
  await page.waitForURL(url=>url.hash.startsWith('#/task/delivery/'));const deliveryId=new URL(page.url()).hash.split('/').at(-1)!;
  const pending=await task('delivery',deliveryId);assert.equal(pending.state,'approval_needed');assert.ok(pending.allowedActions.includes('request-approval'));
  assert.equal(server.store.get("SELECT count(*) AS n FROM jobs WHERE kind='delivery' AND resource_id=?",deliveryId)!.n,0);assert.equal(localDevWrites(),0);
  await page.locator('[data-action="delivery-request-approval"]').click();await page.waitForFunction(()=>Boolean(document.querySelector<HTMLInputElement>('#approval-reference')?.value));
  const reference=await page.locator('#approval-reference').inputValue();assert.equal(server.store.get('SELECT approval_ref FROM deliveries WHERE id=?',deliveryId)!.approval_ref,reference);
  assert.equal(localDevWrites(),0,'approval creation cannot execute the provider');record('exact_request_created_without_provider_effect',{deliveryId,reference});await screenshot('06-local-exact-request-pending.png');

  await server.fixture.decide(reference);assert.equal(localDevWrites(),0,'approval decision cannot execute the provider');
  await page.locator('#approval-rights').check();await page.locator('[data-action="delivery-authorize"]').click();await chooseStudioDialog(page);
  await page.waitForFunction(()=>document.querySelector('.page-heading .badge')?.textContent?.trim()==='Queued');
  assert.equal(server.store.get('SELECT state FROM deliveries WHERE id=?',deliveryId)!.state,'queued');assert.equal(localDevWrites(),0);
  const executed=await runDeliveryCli(deliveryId);assert.equal(executed.exitCode,0,JSON.stringify(executed.errors));assert.equal(executed.receipt.mode,'execute');assert.equal(executed.receipt.processed,true);assert.equal(executed.receipt.delivery.state,'published');assert.equal(executed.receipt.delivery.sourceVerified,true);
  const delivered=await task('delivery',deliveryId);assert.equal(delivered.state,'published',JSON.stringify({state:delivered.state,errorCode:delivered.errorCode}));
  assert.equal(localDevWrites(),1);assert.equal(server.fixture.posts.size,1);assert.ok(delivered.copy?.remoteId);assert.ok(delivered.copy?.url);
  const exactRedemptions=()=>server.fixture.logs.filter(entry=>entry.service==='nyx'&&entry.method==='POST'&&entry.path===`/api/v1/approvals/exact-service/requests/${reference}/redeem`).length;
  assert.equal(exactRedemptions(),1);assert.equal(server.fixture.logs.filter(entry=>entry.service==='nyx'&&entry.method==='POST'&&entry.path.startsWith('/api/v1/proxy/')).length,0);
  const history=delivered.history.map((entry:any)=>entry.state);for(const expected of ['approval_needed','queued','sending','published'])assert.ok(history.includes(expected),`history must include ${expected}`);
  record('real_delivery_cli_redeemed_exact_request_over_local_http',{deliveryId,reference,state:delivered.state,remoteId:delivered.copy.remoteId,url:delivered.copy.url,history,cliReceipt:executed.receipt});
  await page.reload();await page.locator(`a[href=${JSON.stringify(delivered.copy.url)}]`).first().waitFor();assert.match(await page.locator('.page-heading .badge').innerText(),/Published/);await screenshot('07-delivery-published-history.png');

  await publicPage.goto(delivered.copy.url);await publicPage.getByRole('heading',{name:title,exact:true}).waitFor();
  const publicBody=await publicPage.locator('body').innerText();assert.match(publicBody,/This article exists only in local protocol fixtures/);assert.ok(publicBody.includes(server.creditedAuthor));
  assert.equal(await publicPage.locator('link[rel="canonical"]').getAttribute('href'),release.url);assert.ok(await publicPage.locator(`a[href=${JSON.stringify(release.url)}]`).count()>0);
  assert.equal((await anonymous.cookies(server.url)).length,0);await screenshot('08-anonymous-dev-fixture.png',publicPage);
  const writesBefore=localDevWrites(),postsBefore=server.fixture.posts.size,repeated=await runDeliveryCli(deliveryId);assert.equal(repeated.exitCode,1);assert.equal(repeated.errors.at(-1)?.code,'DELIVERY_NOT_RUNNABLE');assert.equal(localDevWrites(),writesBefore);assert.equal(server.fixture.posts.size,postsBefore);
  assert.equal(exactRedemptions(),1);
  assert.deepEqual(blockedBrowser,[]);assert.deepEqual(blockedServer,[]);assert.ok(browserRequests.every(request=>allowed.has(request.origin)));assert.deepEqual(pageErrors,[]);
  record('repeat_same_task_cli_does_not_dispatch',{code:repeated.errors.at(-1)?.code,localDevWrites:localDevWrites(),localDevPosts:server.fixture.posts.size});
  Object.assign(report,{status:'VERIFIED_PENDING_CLEANUP',articleId,releaseId,deliveryId,approvalReference:reference,localDevWrites:localDevWrites(),localDevPosts:server.fixture.posts.size,externalBrowserAttempts:0,externalServerAttempts:0,externalCliAttempts:0,cliRequests:[...executed.network.requests,...repeated.network.requests]});
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
