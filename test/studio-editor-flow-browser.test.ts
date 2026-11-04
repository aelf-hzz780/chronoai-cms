import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium,type Route} from 'playwright-core';
import {BrowserRenderProof} from '../src/render-proof.ts';
import {selectStudioOption} from './studio-picker-helper.ts';
import {chooseStudioDialog} from './studio-dialog-helper.ts';

async function fixture(t:TestContext,options:{publisher?:boolean;personal?:boolean;existing?:boolean;otherAuthor?:boolean;saveError?:number;siteError?:boolean;linkError?:boolean;delaySave?:boolean;submitError?:boolean;live?:boolean}={}){
 const browser=await chromium.launch({executablePath:await new BrowserRenderProof().executable(),headless:true});t.after(()=>browser.close());const page=await browser.newPage();page.setDefaultTimeout(7000);
 const writes:Array<{path:string;body:any}>=[];const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 let current={id:'article-a',ownerId:'owner-a',language:'en',creator:options.otherAuthor?'other':'writer',revision:{id:'revision-1',title:'Draft title',markdown:'Draft body',creditedAuthor:'Writer',digest:'digest',createdAt:'2026-11-04T00:00:00Z'},translation:null};
 let submitted=false,submittedRevision:string|null=null,submitFailed=false,linkFailed=false,held:Route|undefined;
 const caps={canWrite:true,canPublish:!!options.publisher,canManagePublishers:false,canReadConnections:false,canReadMetrics:false};
 const me={subject:'writer',csrf:'flow-csrf',organizationDirectory:{status:'available'},workspaces:[{id:'owner-a',name:'Writing team',kind:options.personal?'personal':'organization',role:options.publisher?'publisher':'member',capabilities:caps},{id:'owner-b',name:'Other desk',kind:'personal',role:'owner',capabilities:caps}]};
 const summary=()=>({...current,states:submitted?['submitted']:['draft'],draft:{revisionId:current.revision.id},submission:submitted?{revisionId:submittedRevision,status:'pending',submittedAt:current.revision.createdAt,fulfilledByReleaseId:null}:null,live:options.live?{releaseId:'old-release',revisionId:'live-revision',url:'https://published.invalid/story'}:null,translations:[],capabilities:{canEdit:!options.otherAuthor,canSubmit:!options.otherAuthor,canPublish:!!options.publisher},updatedAt:current.revision.createdAt});
 const content=()=>({items:options.existing||writes.some(w=>w.path==='/articles')?[summary()]:[],total:1,limit:20,offset:0,counts:{all:1,draft:submitted?0:1,submitted:submitted?1:0,published:0,outdated:0}});
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;
  if(path==='/studio')return route.fulfill({contentType:'text/html',body:await readFile(new URL('../web/studio/index.html',import.meta.url),'utf8')});
  if(path.startsWith('/studio/assets/')){const relative=path.slice('/studio/assets/'.length);assert.match(relative,/^(?:styles\.css|studio\.css|vendor\/markdown-it\.js|dist\/[a-z0-9-]+\.js)$/);return route.fulfill({contentType:relative.endsWith('.css')?'text/css':'text/javascript',body:await readFile(new URL('../web/studio/'+relative,import.meta.url),'utf8')});}
  const api=path.replace('/api/cms','');
  if(api==='/me')return route.fulfill({json:me});
  if(/^\/owners\/owner-[ab]\/sites$/.test(api))return options.siteError?route.fulfill({status:503,json:{code:'SITE_READ_UNAVAILABLE',message:'Site lookup unavailable',traceId:'site-trace'}}):route.fulfill({json:{ownerId:api.split('/')[2],sites:[{language:'en',configured:false,publicUrl:null,verification:{status:'unknown',checkedAt:null},blockers:['SITE_REQUIRED']},{language:'zh',configured:true,publicUrl:'https://zh.invalid',verification:{status:'unknown',checkedAt:null},blockers:[]}]}});
  if(/^\/owners\/owner-[ab]\/content-summary$/.test(api))return route.fulfill({json:content()});
  if(api==='/articles/source')return route.fulfill({json:{...current,id:'source',language:'zh'}});
  if(req.method()!=='GET'){
   assert.equal(req.headers()['x-csrf-token'],'flow-csrf');const body=req.postDataJSON();writes.push({path:api,body});
   if(api==='/articles'||(api==='/articles/article-a'&&req.method()==='PATCH')){
    if(options.saveError)return route.fulfill({status:options.saveError,json:{code:options.saveError===409?'CONFLICT':options.saveError===401?'UNAUTHENTICATED':'SAVE_FAILED',message:'Save failed',traceId:'save-trace'}});
    current={...current,revision:{...current.revision,id:'revision-2',title:body.title,markdown:body.markdown??current.revision.markdown,creditedAuthor:body.creditedAuthor}};
    if(options.delaySave){held=route;return;}return route.fulfill({json:current});
   }
   if(api.endsWith('/translation')){if(options.linkError&&!linkFailed){linkFailed=true;return route.fulfill({status:503,json:{code:'LINK_FAILED',message:'Link failed'}});}return route.fulfill({json:current});}
   if(api.endsWith('/submit')){assert.equal(body.revisionId,current.revision.id);if(options.submitError&&submitted&&!submitFailed){submitFailed=true;return route.fulfill({status:503,json:{code:'SUBMIT_FAILED',message:'Submission failed'}});}submitted=true;submittedRevision=body.revisionId;return route.fulfill({json:{revisionId:current.revision.id}});}
   throw Error('Unexpected write '+req.method()+' '+api);
  }
  if(api==='/articles/article-a')return route.fulfill({json:current});
  if(api==='/articles/article-a/revisions')return route.fulfill({json:[{id:current.revision.id,title:current.revision.title,digest:'digest',credited_author:'Writer',created_at:current.revision.createdAt}]});
  if(api==='/articles/article-a/releases')return route.fulfill({json:[]});
  if(api==='/articles/article-a/preview'){assert.equal(url.searchParams.get('revision'),current.revision.id);return route.fulfill({json:{revisionId:current.revision.id,private:true,html:'<p>'+current.revision.markdown+'</p>'}});}
  throw Error('Unexpected read '+api);
 });
 return {page,writes,errors,release:async()=>{assert.ok(held);await held.fulfill({json:current});},current:()=>current};
}
async function fill(page:Awaited<ReturnType<typeof fixture>>['page']){await page.locator('#article-title').fill('My new article');await page.locator('#credited-author').fill('Writer');await page.locator('#markdown').fill('The current working text');}

test('Member submits a new draft in one action, then sees who reviews it in editor and library',async t=>{
 const {page,writes}=await fixture(t);await page.goto('https://studio.invalid/studio#/new/en');await fill(page);
 assert.equal(await page.locator('[data-action="submit"]').innerText(),'Submit for review');
 await page.locator('[data-action="submit"]').click();await page.locator('#app[aria-busy="false"] [data-action="submit"]').waitFor();
 assert.deepEqual(writes.map(w=>w.path),['/articles','/articles/article-a/submit']);assert.equal(writes[1].body.revisionId,'revision-2');
 assert.match(await page.locator('.editor-review-guidance').innerText(),/administrator or publisher/i);
 await page.evaluate(()=>{location.hash='#/content';});await page.locator('.content-table').waitFor();assert.match(await page.locator('.content-table').innerText(),/administrator or publisher/i);
 assert.equal(writes.some(w=>w.path.includes('/releases')),false);
});

test('Publishers save current edits before the explicit confirmation page; reviewing another author never patches',async t=>{
 for(const otherAuthor of [false,true]){
  const {page,writes}=await fixture(t,{publisher:true,existing:true,otherAuthor});await page.goto('https://studio.invalid/studio#/article/article-a');
  if(!otherAuthor)await page.locator('#markdown').fill('The newly saved body');
  await page.locator('[data-action="review-publication"]').click();await page.locator('#publication-rights').waitFor();
  assert.deepEqual(writes.map(w=>w.path),otherAuthor?[]:['/articles/article-a']);assert.match(page.url(),new RegExp('revision='+ (otherAuthor?'revision-1':'revision-2')));
  assert.match(await page.locator('.studio-confirm-preview').innerText(),otherAuthor?/Draft body/:/The newly saved body/);assert.equal(writes.some(w=>w.path.endsWith('/releases')),false);await page.close();
 }
});

test('A clean submitted draft is not saved again, but changed text can be resubmitted',async t=>{
 const {page,writes}=await fixture(t,{existing:true});await page.goto('https://studio.invalid/studio#/article/article-a');await page.locator('[data-action="submit"]').click();await page.locator('.editor-review-guidance').waitFor();
 assert.deepEqual(writes.map(w=>w.path),['/articles/article-a/submit']);assert.equal(await page.locator('[data-action="submit"]').isDisabled(),true);
 await page.locator('#markdown').fill('A later private change');assert.equal(await page.locator('[data-action="submit"]').isEnabled(),true);await page.locator('[data-action="submit"]').click();await page.locator('#app[aria-busy="false"] [data-action="submit"]').waitFor();
 assert.deepEqual(writes.map(w=>w.path),['/articles/article-a/submit','/articles/article-a','/articles/article-a/submit']);assert.equal(writes.at(-1)!.body.revisionId,'revision-2');
});

test('Failed saves stop the chain and preserve text or the classified sign-in state',async t=>{
 for(const saveError of [409,401,503]){const {page,writes}=await fixture(t,{existing:true,saveError});await page.goto('https://studio.invalid/studio#/article/article-a');await page.locator('#markdown').fill('Keep this text');await page.locator('[data-action="submit"]').click();
  await page.locator(saveError===401?'.studio-auth-card .error':'#notice .error').waitFor();assert.deepEqual(writes.map(w=>w.path),['/articles/article-a']);
  if(saveError!==401)assert.equal(await page.locator('#markdown').inputValue(),'Keep this text');if(saveError===409)assert.equal(await page.locator('[data-action="submit"]').isDisabled(),true);await page.close();}
});

test('Translation retry keeps the created article and links before submission without a second create',async t=>{
 const {page,writes}=await fixture(t,{linkError:true});await page.goto('https://studio.invalid/studio#/new/en?source=source&revision=revision-1');await fill(page);await page.locator('[data-action="submit"]').click();await page.locator('#notice .error').waitFor();
 assert.match(page.url(),/#\/article\/article-a/);assert.deepEqual(writes.map(w=>w.path),['/articles','/articles/article-a/translation']);
 await page.locator('[data-action="submit"]').click();await page.locator('#app[aria-busy="false"] [data-action="submit"]').waitFor();
 assert.deepEqual(writes.map(w=>w.path),['/articles','/articles/article-a/translation','/articles/article-a/translation','/articles/article-a/submit']);
});

test('Double clicks and a workspace switch cannot continue a late save into submission',async t=>{
 const {page,writes,release}=await fixture(t,{delaySave:true});await page.goto('https://studio.invalid/studio#/new/en');await fill(page);
 await page.locator('[data-action="submit"]').evaluate((button:HTMLButtonElement)=>{button.click();button.click();});await page.waitForFunction(()=>document.querySelector('#app')?.getAttribute('aria-busy')==='true');
 await selectStudioOption(page,'workspace','owner-b');await chooseStudioDialog(page);await page.locator('#app[aria-busy="false"] .content-table').waitFor();await release();await page.waitForTimeout(150);
 assert.deepEqual(writes.map(w=>w.path),['/articles']);assert.match(page.url(),/#\/content/);assert.equal(await page.locator('#workspace').inputValue(),'owner-b');
});

test('Site guidance uses article language, permits drafting, and distinguishes missing from unavailable',async t=>{
 for(const siteError of [false,true]){const {page,writes}=await fixture(t,{siteError});await page.goto('https://studio.invalid/studio#/new/en');await page.locator('#app[aria-busy="false"] #markdown').waitFor();await selectStudioOption(page,'locale','zh');
  assert.match(await page.locator('.editor-site-guidance').innerText(),siteError?/暂时无法读取/:/English.*尚未配置/s);
  assert.match(await page.locator('.editor-site-guidance').innerText(),/草稿/);await fill(page);await page.locator('[data-action="submit"]').click();await page.locator('#app[aria-busy="false"] [data-action="submit"]').waitFor();assert.equal(writes.at(-1)!.path,'/articles/article-a/submit');await page.close();}
});


test('A failed submission keeps the new saved revision private while the earlier published version remains live',async t=>{
 const {page,writes}=await fixture(t,{existing:true,submitError:true,live:true});await page.goto('https://studio.invalid/studio#/article/article-a');await page.locator('[data-action="submit"]').click();await page.locator('.editor-review-guidance').waitFor();
 assert.match(await page.locator('.editor-review-guidance').innerText(),/previously published version remains live/i);
 await page.locator('#markdown').fill('New saved version awaiting a successful submission');await page.locator('[data-action="submit"]').click();await page.locator('#notice .error').waitFor();
 assert.match(await page.locator('.editor-review-guidance').innerText(),/Newer changes are private/);assert.equal(await page.locator('[data-action="submit"]').isEnabled(),true);
 await page.locator('[data-action="submit"]').click();await page.locator('#app[aria-busy="false"] [data-action="submit"]').waitFor();
 assert.deepEqual(writes.map(w=>w.path),['/articles/article-a/submit','/articles/article-a','/articles/article-a/submit','/articles/article-a/submit']);assert.equal(writes.at(-1)!.body.revisionId,'revision-2');assert.doesNotMatch(await page.locator('.editor-review-guidance').innerText(),/Newer changes are private/);
});
