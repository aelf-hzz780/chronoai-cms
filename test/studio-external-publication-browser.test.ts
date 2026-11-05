import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium,type Route} from 'playwright-core';
import {BrowserRenderProof} from '../src/render-proof.ts';
import {selectStudioOption} from './studio-picker-helper.ts';
import {chooseStudioDialog} from './studio-dialog-helper.ts';

// These browser fixtures prove UI contracts only; no external platform is contacted.
const at='2026-11-05T10:00:00Z';
const owner={id:'solo',name:'Personal workspace',kind:'personal',role:'owner',capabilities:{canWrite:true,canPublish:true,canReadConnections:true,canManagePublishers:false,canReadMetrics:true}};
const request={method:'POST',url:'https://dev.to/api/articles',body:{article:{title:'Frozen original',body_markdown:'Exact body\n\nAuthor: Original Author\n\nOriginal: https://original.invalid/story',canonical_url:'https://original.invalid/story',published:true}}};
function source(){return {id:'release',kind:'release',ownerId:'solo',articleId:'article',language:'en',title:'Frozen original',revisionId:'revision',action:'publish',state:'published',createdAt:at,updatedAt:at,traceId:'source-trace',errorCode:null,url:'https://original.invalid/story',allowedActions:[],snapshot:{revisionId:'revision',title:'Frozen original',markdown:'Exact body',creditedAuthor:'Original Author',digest:'source-digest'},confirmationDigest:null,history:[],copy:null};}
function external(state:string){return {id:'intent',intentId:'intent',deliveryId:'intent',executionMode:'external',revisionId:'revision',ownerId:'solo',releaseId:'release',target:'dev',connectionId:'dev-connection',accountId:'4223973',action:'create',format:'full',digest:'frozen-digest',state,remoteId:state==='published'?'123':null,url:state==='published'?'https://dev.to/author/frozen':null,request,lastSyncAt:state==='published'?at:null,lastVerifiedAt:state==='published'?at:null,syncStatus:state==='published'?'verified':'not_synced',syncErrorCode:null,followUpState:'none',history:[],observations:[]};}
function detail(state:string){const e=external(state);return {...source(),id:'intent',kind:'delivery',action:'create',state,url:e.url,executionMode:'external',allowedActions:state==='published'?['external-sync','external-follow-up']:['external-register','external-reconcile','external-cancel'],confirmationDigest:e.digest,copy:{target:'dev',connectionId:e.connectionId,remoteId:e.remoteId,url:e.url},distribution:{releaseId:'release',target:'dev',connectionId:e.connectionId,accountId:e.accountId,format:'full',sourceUrl:'https://original.invalid/story',sourceDigest:'source-digest'},externalPublication:e,history:[{state,code:null,traceId:'external-trace',createdAt:at}]};}
async function staticAsset(route:Route){const path=new URL(route.request().url()).pathname;if(path==='/studio'){await route.fulfill({contentType:'text/html',body:await readFile(new URL('../web/studio/index.html',import.meta.url),'utf8')});return true;}if(path.startsWith('/studio/assets/')){const relative=path.slice('/studio/assets/'.length);assert.match(relative,/^(?:styles\.css|studio\.css|vendor\/markdown-it\.js|dist\/[a-z0-9-]+\.js)$/);await route.fulfill({contentType:relative.endsWith('.css')?'text/css':'text/javascript',body:await readFile(new URL('../web/studio/'+relative,import.meta.url),'utf8')});return true;}return false;}

test('Studio prepares external materials, registers only remote identity, and refreshes read-only evidence without worker dispatch',async t=>{
 const browser=await chromium.launch({executablePath:await new BrowserRenderProof().executable(),headless:true});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(5000);
 let state='awaiting_external',registrations=0,syncStatus='verified',followUpState='none';const writes:Array<{path:string;body:any}>=[];
 await page.route('**/*',async route=>{if(await staticAsset(route))return;const req=route.request(),path=new URL(req.url()).pathname;
  if(path==='/api/cms/me')return route.fulfill({json:{subject:'solo',csrf:'csrf',workspaces:[owner],organizationDirectory:{status:'available'}}});
  if(path==='/api/cms/targets')return route.fulfill({json:[{name:'dev',automatic:true,automaticActions:['create','update']}]});
  if(path==='/api/cms/owners/solo/connections')return route.fulfill({json:[{id:'dev-connection',target:'dev',label:'DEV author',accountId:'4223973',active:true}]});
  if(path.endsWith('/content-summary'))return route.fulfill({json:{items:[{id:'article',ownerId:'solo',language:'en',revision:{title:'Frozen original'},live:{releaseId:'release',revisionId:'revision',url:source().url}}],total:1}});
  if(path==='/api/cms/articles/article/releases')return route.fulfill({json:[]});
  if(path==='/api/cms/articles/article/deliveries')return route.fulfill({json:writes.length?[{id:'intent',release_id:'release',owner_id:'solo',connection_id:'dev-connection',target:'dev',action:'create',format:'full',digest:'frozen-digest',state,remote_id:external(state).remoteId,url:external(state).url,approval_ref:null,trace_id:'trace',history:[]}]:[]});
  if(path==='/api/cms/owners/solo/tasks')return route.fulfill({json:{items:[],total:0,offset:0,limit:20}});
  if(path==='/api/cms/owners/solo/tasks/release/release')return route.fulfill({json:source()});
  if(path==='/api/cms/owners/solo/tasks/delivery/intent')return route.fulfill({json:{...detail(state),allowedActions:[...detail(state).allowedActions,...(followUpState==='removal_requested'?['external-verify-removal']:[])],externalPublication:{...external(state),syncStatus,followUpState,syncErrorCode:syncStatus==='reauthorization_required'?'REMOTE_AUTHORIZATION':null}}});
  if(path==='/api/cms/external-publications/intent'&&req.method()==='GET')return route.fulfill({json:{...external(state),syncStatus,followUpState,syncErrorCode:syncStatus==='reauthorization_required'?'REMOTE_AUTHORIZATION':null}});
  if(req.method()==='POST'){const body=req.postDataJSON();writes.push({path,body});assert.equal(req.headers()['x-csrf-token'],'csrf');
   if(path==='/api/cms/releases/release/external-publications'){assert.equal(body.connectionId,'dev-connection');assert.equal(body.rightsConfirmed,true);return route.fulfill({status:201,json:external(state)});}
   if(path==='/api/cms/external-publications/intent/register'){registrations++;assert.equal(body.remoteId,'123');assert.ok(body.idempotencyKey);assert.equal('url' in body,false);if(registrations===1)return route.fulfill({status:503,json:{code:'REMOTE_TIMEOUT',message:'Read-back timed out',traceId:'register-timeout'}});assert.equal(body.idempotencyKey,writes.find(w=>w.path.endsWith('/register'))!.body.idempotencyKey);state='published';return route.fulfill({json:external(state)});}
   if(path==='/api/cms/external-publications/intent/sync'){syncStatus='reauthorization_required';return route.fulfill({json:{...external(state),syncStatus,syncErrorCode:'REMOTE_AUTHORIZATION'}});}
   if(path==='/api/cms/external-publications/intent/follow-up'){assert.ok(['removal','verify-removal'].includes(body.action));followUpState='removal_requested';if(body.action==='verify-removal')state='removed';return route.fulfill({json:{...external(state),followUpState}});}
  }
  throw Error('Unexpected external workflow '+req.method()+' '+path);
 });
 await page.goto('https://studio.invalid/studio#/distribution/article');await selectStudioOption(page,'distribution-target','dev');await selectStudioOption(page,'distribution-connection','dev-connection');await page.locator('#distribution-rights').check();
 await page.locator('[data-action="dist-external-prepare"]').click();await chooseStudioDialog(page,'confirm');await page.waitForURL(u=>u.hash==='#/task/delivery/intent');
 await page.locator('#external-payload').waitFor();assert.deepEqual(JSON.parse(await page.locator('#external-payload').inputValue()),request);
 assert.match(await page.locator('.studio-external-publication').innerText(),/CMS does not send this DEV request/);
 assert.equal(await page.locator('[data-action="delivery-authorize"]').count(),0);assert.equal(await page.locator('[data-action="delivery-report"]').count(),0);assert.doesNotMatch(await page.locator('#app').innerText(),/Background workers execute/);
 if(process.env.STUDIO_EXTERNAL_EVIDENCE_DIR){await mkdir(process.env.STUDIO_EXTERNAL_EVIDENCE_DIR,{recursive:true});await page.screenshot({fullPage:true,path:resolve(process.env.STUDIO_EXTERNAL_EVIDENCE_DIR,'external-preview-mobile.png')});}
 await page.locator('#external-remote-id').fill('123');await page.locator('[data-action="delivery-external-register"]').click();await chooseStudioDialog(page,'confirm');await page.getByText('Read-back timed out',{exact:true}).waitFor();assert.equal(await page.locator('#external-remote-id').inputValue(),'123');
 await page.locator('[data-action="delivery-external-register"]').click();await chooseStudioDialog(page,'confirm');await page.locator('.page-heading').getByText('Published',{exact:true}).waitFor();
 await page.locator('[data-action="delivery-external-sync"]').click();await page.locator('.studio-external-publication').getByText('REMOTE_AUTHORIZATION',{exact:true}).waitFor();assert.ok(await page.locator('.studio-external-publication a[href="https://dev.to/author/frozen"]').count());assert.match(await page.locator('.studio-external-publication').innerText(),/last verified evidence is retained/i);
 if(process.env.STUDIO_EXTERNAL_EVIDENCE_DIR)await page.screenshot({fullPage:true,path:resolve(process.env.STUDIO_EXTERNAL_EVIDENCE_DIR,'external-sync-authorization-mobile.png')});
 await page.locator('[data-action="delivery-external-removal"]').click();await chooseStudioDialog(page,'confirm');
 await page.locator('[data-action="delivery-external-verify-removal"]').click();await chooseStudioDialog(page,'confirm');await page.locator('.page-heading').getByText('Removed',{exact:true}).waitFor();
 assert.equal(writes.some(w=>/\/deliveries(?:\/|$)/.test(w.path)),false);assert.equal(writes.some(w=>w.path.includes('dev.to')),false);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
});

test('Studio rejects organization external preparation and cancellation clearly preserves independent remote uncertainty',async t=>{
 const browser=await chromium.launch({executablePath:await new BrowserRenderProof().executable(),headless:true});t.after(()=>browser.close());const page=await browser.newPage();page.setDefaultTimeout(5000);let organization=true,state='awaiting_external';const writes:string[]=[];
 await page.route('**/*',async route=>{if(await staticAsset(route))return;const req=route.request(),path=new URL(req.url()).pathname;
  if(path==='/api/cms/me')return route.fulfill({json:{subject:'solo',csrf:'csrf',workspaces:[{...owner,kind:organization?'organization':'personal'}],organizationDirectory:{status:'available'}}});
  if(path==='/api/cms/targets')return route.fulfill({json:[{name:'dev',automatic:true,automaticActions:['create','update']}]});
  if(path==='/api/cms/owners/solo/connections')return route.fulfill({json:[{id:'dev-connection',target:'dev',label:'Explicit account',accountId:'4223973',active:true}]});
  if(path.endsWith('/content-summary'))return route.fulfill({json:{items:[{id:'article',ownerId:'solo',language:'en',revision:{title:'Frozen original'},live:{releaseId:'release',revisionId:'revision',url:source().url}}],total:1}});
  if(path==='/api/cms/articles/article/releases'||path==='/api/cms/articles/article/deliveries')return route.fulfill({json:[]});
  if(path==='/api/cms/owners/solo/tasks')return route.fulfill({json:{items:[],total:0,offset:0,limit:20}});
  if(path==='/api/cms/owners/solo/tasks/release/release')return route.fulfill({json:source()});
  if(path==='/api/cms/owners/solo/tasks/delivery/intent')return route.fulfill({json:{...detail(state),allowedActions:state==='cancelled'?['external-reconcile']:detail(state).allowedActions}});
  if(path==='/api/cms/external-publications/intent'&&req.method()==='GET')return route.fulfill({json:external(state)});
  if(req.method()==='POST'){writes.push(path);assert.ok(['/api/cms/external-publications/intent/cancel','/api/cms/external-publications/intent/reconcile'].includes(path));state='cancelled';return route.fulfill({json:external(state)});}
  throw Error('Unexpected organization/cancel workflow '+path);
 });
 await page.goto('https://studio.invalid/studio#/distribution/article');await selectStudioOption(page,'distribution-target','dev');await selectStudioOption(page,'distribution-connection','dev-connection');await page.locator('#distribution-rights').check();
 assert.equal(await page.locator('[data-action="dist-external-prepare"]').isDisabled(),true);assert.match(await page.locator('#app').innerText(),/Organization external publication remains unavailable/);assert.deepEqual(writes,[]);
 organization=false;await page.goto('https://studio.invalid/studio#/task/delivery/intent');await page.reload();await page.locator('[data-action="delivery-external-cancel"]').click();assert.match(await page.getByRole('alertdialog').innerText(),/cannot retract a DEV request/);await chooseStudioDialog(page,'confirm');await page.locator('.page-heading').getByText('Cancelled',{exact:true}).waitFor();
 assert.equal(await page.locator('[data-action="delivery-external-register"]').count(),0);await page.locator('[data-action="delivery-external-reconcile"]').click();assert.deepEqual(writes,['/api/cms/external-publications/intent/cancel','/api/cms/external-publications/intent/reconcile']);
});
