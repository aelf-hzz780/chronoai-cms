import {chooseStudioDialog} from './studio-dialog-helper.ts';
// Isolated frontend workflow fixtures. Real Fastify/session acceptance is a separate root check.
import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium,type Route} from 'playwright-core';
import {BrowserRenderProof} from '../src/render-proof.ts';
const asset='11111111-1111-4111-8111-111111111111';
const caps={canWrite:true,canPublish:true,canManagePublishers:false,canReadConnections:true,canReadMetrics:true};
const me={subject:'writer',csrf:'session-csrf',organizationDirectory:{status:'available'},workspaces:[{id:'owner',name:'Team journal',kind:'organization',role:'publisher',capabilities:caps}]};
const article={id:'article',ownerId:'owner',language:'en',creator:'writer',revision:{id:'revision-1',title:'Frozen original',markdown:`Saved frozen body\n\n![private](asset:${asset})`,creditedAuthor:'Credited Writer',digest:'saved-digest',createdAt:'2026-11-03T00:00:00Z'},translation:null};
const summary={...article,states:['draft'],draft:{revisionId:'revision-1'},submission:null,live:null,translations:[],capabilities:{canEdit:true,canSubmit:true,canPublish:true},updatedAt:article.revision.createdAt};
const pageOf=(items:unknown[])=>({items,total:items.length,limit:20,offset:0,counts:{all:1,draft:1,submitted:0,published:0,outdated:0}});
const release={id:'release-1',article_id:'article',revision_id:'revision-1',owner_id:'owner',action:'publish',state:'queued',url:null,remote_id:null,created_at:article.revision.createdAt,updated_at:article.revision.createdAt,error_code:null,trace_id:'release-trace'};
function task(kind='release',state='queued',id='release-1'){return {id,kind,ownerId:'owner',articleId:'article',language:'en',title:'Frozen original',revisionId:kind==='projection'?null:'revision-1',action:kind==='media'?'materialize-media':kind==='projection'?'sync-links':'publish',state,createdAt:article.revision.createdAt,updatedAt:article.revision.createdAt,traceId:'task-trace',errorCode:null,url:null,allowedActions:[],snapshot:kind==='projection'?null:{revisionId:'revision-1',title:'Frozen original',markdown:article.revision.markdown,creditedAuthor:'Credited Writer',digest:'frozen-digest'},confirmationDigest:null,history:[{state,code:null,traceId:'history-trace',createdAt:article.revision.createdAt}],copy:null,mediaHistory:[]};}
async function launch(t:TestContext){const browser=await chromium.launch({executablePath:await new BrowserRenderProof().executable(),headless:true});t.after(()=>browser.close());return browser;}
async function staticAsset(route:Route){const path=new URL(route.request().url()).pathname;if(path==='/studio'){await route.fulfill({contentType:'text/html',headers:{'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-src 'self'; base-uri 'none'"},body:await readFile(new URL('../web/studio/index.html',import.meta.url),'utf8')});return true;}if(path.startsWith('/studio/assets/')){const relative=path.slice('/studio/assets/'.length);assert.match(relative,/^(?:styles\.css|studio\.css|vendor\/markdown-it\.js|dist\/[a-z0-9-]+\.js)$/);await route.fulfill({contentType:relative.endsWith('.css')?'text/css':'text/javascript',body:await readFile(new URL('../web/studio/'+relative,import.meta.url),'utf8')});return true;}return false;}
async function image(route:Route){await route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')});}

test('Studio saves before confirmation with CSRF, preserves key on unknown retry and scopes task images',async t=>{
 const browser=await launch(t);const page=await browser.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const writes:Array<{path:string;body:any}>=[];let reads=0;let current=structuredClone(article);let patches=0;
 await page.route('**/*',async route=>{if(await staticAsset(route))return;const req=route.request(),url=new URL(req.url()),path=url.pathname;
  if(path==='/api/cms/me')return route.fulfill({json:me});
  if(req.method()==='PATCH'){assert.equal(path,'/api/cms/articles/article');assert.equal(req.postDataJSON().expectedRevision,'revision-1');patches++;current={...current,revision:{...current.revision,id:'revision-2',markdown:req.postDataJSON().markdown}};return route.fulfill({json:current});}
  if(req.method()==='POST'){assert.equal(req.headers()['x-csrf-token'],'session-csrf');writes.push({path,body:req.postDataJSON()});assert.equal(path,'/api/cms/articles/article/releases');if(writes.length===1)return route.fulfill({status:503,json:{code:'UNKNOWN_RESULT',message:'Result not known',traceId:'unknown-trace'}});return route.fulfill({status:202,json:{...release,revision_id:'revision-2'}});}
  if(path==='/api/cms/articles/article'){if(url.searchParams.has('revision'))assert.equal(url.searchParams.get('revision'),'revision-2');return route.fulfill({json:current});}
  if(path.endsWith('/content-summary'))return route.fulfill({json:pageOf([{...summary,revision:current.revision,draft:{revisionId:current.revision.id}}])});
  if(path.endsWith('/revisions'))return route.fulfill({json:[{id:'revision-1',title:'Frozen original',credited_author:'Credited Writer',digest:'saved-digest',created_at:article.revision.createdAt}]});
  if(path.endsWith('/sites'))return route.fulfill({json:{ownerId:'owner',sites:[{language:'en',configured:true,publicUrl:'https://journal.invalid',verification:{status:'unknown',checkedAt:null},blockers:[]}]}});
  if(path.endsWith('/releases'))return route.fulfill({json:[]});
  if(path.endsWith('/preview'))return route.fulfill({json:{html:`<p>${current.revision.markdown}</p><p><img src="/api/cms/assets/${asset}" alt="private"></p>`,revisionId:current.revision.id,private:true}});
  if(path==='/api/cms/owners/owner/tasks/release/release-1'){reads++;return route.fulfill({json:{...task(),revisionId:'revision-2',snapshot:{...task().snapshot,revisionId:'revision-2',markdown:current.revision.markdown}}});}
  if(path===`/api/cms/assets/${asset}`||path===`/api/cms/owners/owner/tasks/release/release-1/assets/${asset}`)return image(route);
  throw Error('Unexpected fixture '+req.method()+' '+path);
 });
 await page.goto('https://studio.invalid/studio#/article/article');await page.locator('#markdown').fill(`Current edits are saved before publication\n\n![private](asset:${asset})`);await page.locator('[data-action="review-publication"]').click();
 await page.locator('#publication-rights').waitFor();assert.match(await page.locator('.review-summary').innerText(),/Reachability unknown/);assert.match(await page.locator('.studio-confirm-preview').innerText(),/Current edits are saved before publication/);assert.equal(patches,1);assert.equal(writes.length,0,'preview does not publish');
 assert.equal(await page.locator('[data-action="confirm-original"]').isDisabled(),true);await page.locator('#publication-rights').check();await page.locator('[data-action="confirm-original"]').click();await page.getByText('The result is unknown.',{exact:false}).waitFor();
 await page.locator('[data-action="confirm-original"]').click();await page.waitForURL(url=>url.hash==='#/task/release/release-1');await page.locator('.studio-task-preview img').waitFor();
 assert.equal(writes.length,2);assert.equal(writes[0]!.body.idempotencyKey,writes[1]!.body.idempotencyKey);assert.deepEqual({...writes[1]!.body,idempotencyKey:undefined},{ownerId:'owner',revisionId:'revision-2',creditedAuthor:'Credited Writer',action:'publish',rightsConfirmed:true,idempotencyKey:undefined});
 assert.equal(await page.locator('.studio-task-preview img').getAttribute('src'),`/api/cms/owners/owner/tasks/release/release-1/assets/${asset}`);assert.match(await page.locator('#notice').innerText(),/queued.*not yet verified/);
 await page.evaluate(()=>{location.hash='#/article/article';});await page.locator('#markdown').waitFor();assert.equal(await page.locator('#markdown').inputValue(),`Current edits are saved before publication\n\n![private](asset:${asset})`);const previousReads=reads;await page.waitForTimeout(2300);assert.equal(reads,previousReads,'leaving the task clears its polling timer');assert.deepEqual(errors,[]);
});

test('Studio release commands re-read state, keep reconciliation read-only and require separate exact media rights',async t=>{
 const browser=await launch(t);const page=await browser.newPage({viewport:{width:390,height:844}});const writes:Array<{path:string;body:any}>=[];let state='verifying';
 await page.route('**/*',async route=>{if(await staticAsset(route))return;const req=route.request(),path=new URL(req.url()).pathname;if(path==='/api/cms/me')return route.fulfill({json:me});
  if(path==='/api/cms/owners/owner/tasks/release/release-1')return route.fulfill({json:{...task('release',state),allowedActions:['reconcile','materialize-media']}});
  if(req.method()==='POST'){writes.push({path,body:req.postDataJSON()});if(path.endsWith('/reconcile')){state='uncertain';return route.fulfill({json:{id:'release-1',state:'published'}});}assert.equal(path,'/api/cms/releases/release-1/materialize-media');return route.fulfill({status:202,json:{id:'media-1',release_id:'release-1',revision_id:'revision-1',state:'queued'}});}
  if(path==='/api/cms/owners/owner/tasks/media/media-1')return route.fulfill({json:{...task('media','partial','media-1'),mediaHistory:[{id:'media-1',state:'partial',publicFiles:1,errorCode:'IMAGE_PENDING',traceId:'media-trace',createdAt:article.revision.createdAt,updatedAt:article.revision.createdAt}]}});
  if(path.includes('/tasks/')&&path.endsWith('/assets/'+asset))return image(route);throw Error('Unexpected fixture '+path);
 });
 await page.goto('https://studio.invalid/studio#/task/release/release-1');await page.locator('[data-action="task-reconcile"]').click();await page.getByText('Result uncertain',{exact:true}).first().waitFor();assert.equal(writes.length,1);assert.deepEqual(writes[0]!.body,{});assert.equal(await page.locator('.page-heading .badge').innerText(),'Result uncertain','stale POST state never overwrites the fresh GET');
 assert.equal(await page.locator('[data-action="task-materialize"]').isDisabled(),true);await page.locator('#media-rights').check();await page.locator('[data-action="task-materialize"]').click();await chooseStudioDialog(page,'cancel');assert.equal(writes.length,1);
 await page.locator('[data-action="task-materialize"]').click();assert.match(await page.getByRole('alertdialog').innerText(),/owner.*\nrelease-1.*\nrevision-1/);await chooseStudioDialog(page);await page.waitForURL(url=>url.hash==='#/task/media/media-1');await page.getByText('1 public files',{exact:true}).waitFor();assert.equal(writes.length,2);assert.equal(writes[1]!.body.ownerId,'owner');assert.equal(writes[1]!.body.revisionId,'revision-1');assert.equal(writes[1]!.body.rightsConfirmed,true);assert.match(writes[1]!.body.idempotencyKey,/^[a-f0-9-]{36}$/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
});

test('Studio respects hidden delivery snapshots, projection absence and strict preview image scope',async t=>{
 const browser=await launch(t);const page=await browser.newPage();const requested:string[]=[];
 await page.route('**/*',async route=>{if(await staticAsset(route))return;const path=new URL(route.request().url()).pathname;requested.push(path);if(path==='/api/cms/me')return route.fulfill({json:{...me,workspaces:[{...me.workspaces[0],capabilities:{...caps,canPublish:false}}]}});
  if(path==='/api/cms/owners/owner/tasks/delivery/delivery-1')return route.fulfill({json:{...task('delivery','manual_action_needed','delivery-1'),snapshot:null,allowedActions:['materialize-media','reconcile'],copy:{target:'dev',connectionId:null,remoteId:null,url:null}}});
  if(path==='/api/cms/owners/owner/tasks/projection/projection-1')return route.fulfill({json:task('projection','complete','projection-1')});throw Error('Unexpected private fallback '+path);
 });
 await page.goto('https://studio.invalid/studio#/task/delivery/delivery-1');await page.getByText('This task has no visible frozen content.',{exact:false}).waitFor();assert.equal(await page.locator('.saved-preview').count(),0);assert.equal(await page.locator('[data-action="task-reconcile"],[data-action="task-materialize"]').count(),0);assert.equal(requested.some(path=>path.includes('/articles/')),false);
 const accepted=await page.evaluate(async id=>{const modulePath='/studio/assets/dist/components.js';const {sanitizePreview}=await import(modulePath);const base='/api/cms/owners/owner/tasks/release/release-1/assets/';const html=sanitizePreview(`<img src="${base}${id}"><img src="/api/cms/assets/${id}"><img src="/api/cms/owners/other/tasks/release/release-1/assets/${id}"><img src="https://evil.invalid/${id}">`,{ownerId:'owner',kind:'release',id:'release-1'});const template=document.createElement('template');template.innerHTML=html;return [...template.content.querySelectorAll('img')].map(image=>image.getAttribute('src'));},asset);assert.deepEqual(accepted,[`/api/cms/owners/owner/tasks/release/release-1/assets/${asset}`]);
 await page.evaluate(()=>{location.hash='#/task/projection/projection-1';});await page.getByText('Translation-link tasks project current verified public relationships.',{exact:false}).waitFor();assert.equal(await page.locator('.saved-preview').count(),0);
});

test('Leaving a pending task confirmation aborts the dialog without a stale write',async t=>{
 const browser=await launch(t),page=await browser.newPage();const writes:string[]=[];
 await page.route('**/*',async route=>{if(await staticAsset(route))return;const req=route.request(),path=new URL(req.url()).pathname;
  if(path==='/api/cms/me')return route.fulfill({json:me});
  if(path==='/api/cms/owners/owner/tasks/release/release-1')return route.fulfill({json:{...task('release','queued'),allowedActions:['cancel']}});
  if(path==='/api/cms/owners/owner/tasks')return route.fulfill({json:{items:[],total:0,limit:20,offset:0}});
  if(path.endsWith('/assets/'+asset))return image(route);
  if(req.method()==='POST'){writes.push(path);return route.fulfill({json:{id:'release-1'}});}throw Error('Unexpected abort request '+path);
 });
 await page.goto('https://studio.invalid/studio#/task/release/release-1');await page.locator('[data-action="task-cancel"]').click();await page.getByRole('alertdialog').waitFor();assert.deepEqual(writes,[]);
 await page.evaluate(()=>{location.hash='#/tasks';});await page.locator('#task-filters').waitFor();assert.equal(await page.locator('dialog').count(),0);assert.deepEqual(writes,[]);
});
