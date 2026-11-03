// Isolated browser UI contract: all routes are fulfilled locally; no live stack.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {BrowserRenderProof} from '../src/render-proof.ts';

test('R031 CMS media action confirms the selected old release and shows partial progress',async t=>{
 const browser=await chromium.launch({executablePath:await new BrowserRenderProof().executable(),headless:true});t.after(()=>browser.close());
 const page=await browser.newPage(),errors:string[]=[],writes:Array<{url:string;body:any}>=[];
 page.on('pageerror',error=>errors.push(error.message));
 const article={id:'article',ownerId:'owner',language:'en',creator:'person',revision:{id:'new-edit',title:'Newest editor version',markdown:'New body',creditedAuthor:'person',createdAt:'2026-11-02'}};
 let canPublish=true,known=true;const release={id:'old-release',owner_id:'owner',revision_id:'old-confirmed-revision',state:'verifying',action:'publish',remote_id:'known',url:'https://ghost.invalid/post/',created_at:'2026-11-01',media_history:[{state:'partial',public_files:1,error_code:'IDENTITY_UNAVAILABLE',trace_id:'partial-trace'}]};
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  if(request.method()==='POST'){
   writes.push({url:path,body:request.postDataJSON()});
   assert.equal(path,'/api/cms/releases/old-release/materialize-media');
   return route.fulfill({json:{id:'request',state:'queued',public_files:0,trace_id:'media-trace'}});
  }
  if(path==='/')return route.fulfill({contentType:'text/html',body:await readFile(new URL('../web/index.html',import.meta.url),'utf8')});
  if(path==='/app.js'||path==='/style.css')return route.fulfill({contentType:path.endsWith('js')?'text/javascript':'text/css',body:await readFile(new URL('../web'+path,import.meta.url),'utf8')});
  let result:unknown;
  if(path==='/api/cms/me')result={subject:'person',csrf:'local-csrf',workspaces:[{id:'owner',kind:'personal',canPublish}]};
  else if(path==='/api/cms/articles')result=[article];
  else if(path==='/api/cms/articles/article/revisions')result=[{id:'new-edit',title:article.revision.title}];
  else if(path==='/api/cms/articles/article/releases')result=[{...release,...(!known?{remote_id:null,url:null}:{})}];
  else if(path==='/api/cms/articles/article/deliveries'||path==='/api/cms/owners/owner/connections'||path==='/api/cms/targets')result=[];
  else throw Error('Unexpected browser request: '+path);
  return route.fulfill({json:result});
 });
 await page.goto('https://cms.invalid/');await page.locator('#articles button').click();
 await page.waitForFunction(()=>document.getElementById('releases')!.textContent!.includes('本次已公开 1 张'));
 assert.match(await page.locator('#releases').innerText(),/partial.*本次已公开 1 张.*IDENTITY_UNAVAILABLE.*partial-trace/);
 await page.locator('details').filter({has:page.locator('#release-id')}).locator('summary').click();await page.selectOption('#release-id','old-release');
 await page.click('#materialize-media');await page.waitForFunction(()=>document.getElementById('notice')!.textContent!.includes('图片公开权利'));assert.equal(writes.length,0);
 await page.check('#rights');page.once('dialog',async dialog=>{assert.match(dialog.message(),/old-release.*old-confirmed-revision/);await dialog.dismiss();});await page.click('#materialize-media');
 await page.waitForLoadState('networkidle');assert.equal(writes.length,0,'Cancel sends no command');
 page.once('dialog',async dialog=>{assert.match(dialog.message(),/不会重发 Ghost/);await dialog.accept();});await page.click('#materialize-media');
 await page.waitForFunction(()=>document.getElementById('notice')!.textContent!.includes('图片补齐请求：queued'));
 assert.equal(writes.length,1);assert.equal(writes[0]!.body.ownerId,'owner');assert.equal(writes[0]!.body.revisionId,'old-confirmed-revision');assert.equal(writes[0]!.body.rightsConfirmed,true);assert.match(writes[0]!.body.idempotencyKey,/^[a-f0-9-]{36}$/);
 assert.match(await page.locator('#notice').innerText(),/partial/);known=false;await page.click('#materialize-media');await page.waitForFunction(()=>document.getElementById('notice')!.textContent!.includes('尚未认回原文'));assert.equal(writes.length,1);
 canPublish=false;await page.reload();await page.waitForFunction(()=>(document.getElementById('materialize-media') as HTMLButtonElement).disabled);assert.deepEqual(errors,[]);
});
