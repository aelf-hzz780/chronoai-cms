// Isolated browser contracts: fixture responses only, no external content writes.
import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium,type Route} from 'playwright-core';
import {BrowserRenderProof} from '../src/render-proof.ts';

const capabilities={canWrite:true,canPublish:true,canManagePublishers:false,canReadConnections:true,canReadMetrics:true};
const identity={subject:'writer',csrf:'browser-csrf',organizationDirectory:{status:'available'},workspaces:[{id:'owner-a',name:'Personal desk',kind:'personal',role:'owner',capabilities},{id:'owner-b',name:'Team desk',kind:'organization',role:'publisher',capabilities}]};
function article(owner='owner-a',markdown='Saved body',revision='revision-1'){return {id:'article-a',ownerId:owner,language:'en',creator:'writer',revision:{id:revision,title:owner==='owner-a'?'Original title':'Team title',markdown,creditedAuthor:'Writer',digest:'digest',createdAt:'2026-11-03T00:00:00Z'},translation:null};}
function summary(a:ReturnType<typeof article>){return {...a,states:['draft'],draft:{revisionId:a.revision.id},submission:null,live:null,translations:[],capabilities:{canEdit:true,canSubmit:true,canPublish:true},updatedAt:a.revision.createdAt};}
function content(a:ReturnType<typeof article>){return {items:[summary(a)],total:1,limit:20,offset:0,counts:{all:1,draft:1,submitted:0,published:0,outdated:0}};}
async function staticAsset(route:Route):Promise<boolean>{const path=new URL(route.request().url()).pathname;
 if(path==='/studio'){await route.fulfill({contentType:'text/html',headers:{'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-src 'self'; base-uri 'none'"},body:await readFile(new URL('../web/studio/index.html',import.meta.url),'utf8')});return true;}
 if(path.startsWith('/studio/assets/')){const relative=path.slice('/studio/assets/'.length);assert.match(relative,/^(?:styles\.css|studio\.css|vendor\/markdown-it\.js|dist\/[a-z0-9-]+\.js)$/);await route.fulfill({contentType:path.endsWith('.css')?'text/css':'text/javascript',body:await readFile(new URL('../web/studio/'+relative,import.meta.url),'utf8')});return true;}return false;
}
async function newBrowser(t:TestContext){const browser=await chromium.launch({executablePath:await new BrowserRenderProof().executable(),headless:true});t.after(()=>browser.close());return browser;}

test('studio browser preserves imported bytes, metadata-only saves, conflict text and preview isolation',async t=>{
 const browser=await newBrowser(t);const page=await browser.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const raw='\uFEFF# Original\r\n\r\nExact UTF-8 body\r\n';let current=article('owner-a',raw);let patches=0;const savedBodies:unknown[]=[];
 await page.route('**/*',async route=>{if(await staticAsset(route))return;const request=route.request();const url=new URL(request.url());const path=url.pathname;
  if(path==='/api/cms/me')return route.fulfill({json:identity});
  if(path==='/api/cms/articles/import'){assert.equal(request.headers()['x-csrf-token'],'browser-csrf');assert.equal(url.searchParams.get('ownerId'),'owner-a');assert.deepEqual(request.postDataBuffer(),Buffer.from(raw));current={...current,revision:{...current.revision,title:url.searchParams.get('title')!}};return route.fulfill({status:201,json:current});}
  if(path==='/api/cms/articles/article-a'&&request.method()==='PATCH'){savedBodies.push(request.postDataJSON());patches++;if(patches===2)return route.fulfill({status:409,json:{code:'CONFLICT',message:'Revision changed',traceId:'conflict-browser-trace'}});assert.equal(Object.hasOwn(request.postDataJSON(),'markdown'),false,'changing title does not normalize imported bytes');current={...current,revision:{...current.revision,id:'revision-2',title:request.postDataJSON().title}};return route.fulfill({json:current});}
  if(path==='/api/cms/articles/article-a')return route.fulfill({json:current});
  if(path.endsWith('/content-summary'))return route.fulfill({json:content(current)});
  if(path.endsWith('/revisions'))return route.fulfill({json:[{id:current.revision.id,title:current.revision.title,digest:'digest',credited_author:'Writer',created_at:current.revision.createdAt}]});
  if(path.endsWith('/markdown-file'))return route.fulfill({json:{articleId:'article-a',revisionId:current.revision.id,filename:'article.md',mediaType:'text/markdown',encoding:'base64',byteLength:Buffer.byteLength(raw),sha256:createHash('sha256').update(raw).digest('hex'),data:Buffer.from(raw).toString('base64')}});
  if(path.endsWith('/preview'))return route.fulfill({json:{revisionId:current.revision.id,private:true,html:'<p>Saved preview</p><script>window.previewLeaked=true</script><img src="https://evil.invalid/private.png"><a href="javascript:alert(1)">bad</a>'}});
  throw new Error('Unexpected fixture request '+request.method()+' '+path);
 });
 await page.goto('https://studio.invalid/studio#/new/en');await page.locator('#article-title').fill('Imported article');await page.locator('#credited-author').fill('Writer');
 await page.setInputFiles('#markdown-file',{name:'original.md',mimeType:'text/markdown',buffer:Buffer.from(raw)});
 await page.getByText('Original UTF-8 file loaded.',{exact:false}).waitFor();await page.locator('[data-action="save"]').click();
 await page.waitForURL(url=>url.hash==='#/article/article-a');await page.locator('#article-title').fill('Metadata edit');await page.locator('[data-action="save"]').click();await page.waitForFunction(()=>document.querySelector('.field-value')?.textContent==='revision-2');
 const downloading=page.waitForEvent('download');await page.locator('[data-action="export-raw"]').click();const download=await downloading;assert.deepEqual(await readFile((await download.path())!),Buffer.from(raw),'saved original download is byte-for-byte identical');
 await page.locator('[data-action="preview-saved"]').click();await page.locator('.saved-preview').getByText('Saved preview',{exact:true}).waitFor();assert.equal(await page.locator('.saved-preview script,.saved-preview img,.saved-preview a[href]').count(),0);
 await page.locator('[data-action="write"]').click();await page.locator('#markdown').fill('My retained local draft');await page.locator('[data-action="save"]').click();await page.locator('.conflict-banner').waitFor();
 assert.equal(await page.locator('#markdown').inputValue(),'My retained local draft');assert.match(await page.locator('#notice').innerText(),/CONFLICT.*conflict-browser-trace/);assert.equal(await page.locator('[data-action="save"]').isDisabled(),true);assert.equal(savedBodies.length,2);assert.deepEqual(errors,[]);
});

test('studio browser switches owners without accepting a late former-workspace response and separates UI locale',async t=>{
 const browser=await newBrowser(t);const page=await browser.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));let delayed:Route|null=null;
 await page.route('**/*',async route=>{if(await staticAsset(route))return;const path=new URL(route.request().url()).pathname;if(path==='/api/cms/me')return route.fulfill({json:identity});if(path==='/api/cms/owners/owner-a/content-summary'){delayed=route;return;}if(path==='/api/cms/owners/owner-b/content-summary')return route.fulfill({json:content(article('owner-b'))});throw Error('Unexpected request '+path);});
 await page.goto('https://studio.invalid/studio#/content');await page.locator('#workspace').selectOption('owner-b');await page.getByRole('link',{name:'Team title',exact:true}).waitFor();
 if(delayed)await (delayed as Route).fulfill({json:content(article('owner-a'))}).catch(()=>{/* The browser may have already aborted this old request. */});
 await page.locator('#locale').selectOption('zh');assert.equal(await page.locator('#article-language').inputValue(),'en');assert.equal(await page.getByRole('link',{name:'Original title',exact:true}).count(),0);assert.equal(await page.getByRole('link',{name:'Team title',exact:true}).count(),1);assert.equal(await page.locator('#workspace').inputValue(),'owner-b');assert.deepEqual(errors,[]);
});

test('studio workspace selection remains visible and operable at phone and tablet widths',async t=>{
 const browser=await newBrowser(t);
 for(const width of [390,820]){
  const page=await browser.newPage({viewport:{width,height:844}});
  await page.route('**/*',async route=>{if(await staticAsset(route))return;const path=new URL(route.request().url()).pathname;if(path==='/api/cms/me')return route.fulfill({json:identity});if(path==='/api/cms/owners/owner-a/content-summary')return route.fulfill({json:content(article('owner-a'))});if(path==='/api/cms/owners/owner-b/content-summary')return route.fulfill({json:content(article('owner-b'))});throw Error('Unexpected request '+path);});
  await page.goto('https://studio.invalid/studio#/content');await page.getByRole('link',{name:'Original title',exact:true}).waitFor();
  assert.equal(await page.locator('#workspace').isVisible(),true,`workspace selector is visible at ${width}px`);
  await page.locator('#workspace').selectOption('owner-b');await page.getByRole('link',{name:'Team title',exact:true}).waitFor();assert.equal(await page.locator('#workspace').inputValue(),'owner-b');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,`no page overflow at ${width}px`);await page.close();
 }
});
