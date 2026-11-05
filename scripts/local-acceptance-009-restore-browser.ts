/** Confirm restored pages through their original URLs while every source container is stopped. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createServer,type Server} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright-core';
import {BrowserRenderProof} from '../src/render-proof.ts';
import {digest} from '../src/content.ts';
import type {Store} from '../src/store.ts';

export async function verifyRestoredBrowser(root:string,original:Store,source:any,restore:any){
 const plan=JSON.parse(await readFile(join(root,'plan.json'),'utf8'));
 assert.equal(plan.dockerContext,'colima-blogsystem');
 const sourceContainerIds=plan.sites.flatMap((site:any)=>{
  assert.match(site.project,/^blogsystem-local-009-[a-f0-9]{8}-(personal|organization)$/);
  return execFileSync('docker',['--context',plan.dockerContext,'ps','-a','--filter',`label=com.docker.compose.project=${site.project}`,'-q'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
 });
 assert.equal(sourceContainerIds.length,8);
 const sourceContainers=JSON.parse(execFileSync('docker',['--context',plan.dockerContext,'inspect',...sourceContainerIds],{encoding:'utf8'}));
 assert.ok(sourceContainers.every((container:any)=>!container.State.Running),'Source Ghost and MySQL must remain stopped');
 const mappings=new Map<string,string>();
 for(const row of source.results){const group=restore.projects[row.owner==='personal'?0:1];mappings.set(new URL(row.url).origin,row.language==='en'?group.enUrl:group.zhUrl);}
 assert.equal(mappings.size,4);
 const servers:Server[]=[],requests:any[]=[],results:any[]=[],blocked:any[]=[];
 let evidence:any;
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 try{
  for(const [originalOrigin,restoredOrigin] of mappings){
   const server=createServer(async(req,res)=>{
    if(!['GET','HEAD'].includes(req.method??'')){res.writeHead(405);res.end();return;}
    try{
     const target=new URL(restoredOrigin);target.pathname=new URL(req.url??'/',originalOrigin).pathname;target.search=new URL(req.url??'/',originalOrigin).search;
     const response=await fetch(target,{method:req.method,redirect:'manual'});
     const bytes=Buffer.from(await response.arrayBuffer());
     requests.push({originalOrigin,path:target.pathname,targetOrigin:restoredOrigin,status:response.status,sha256:digest(bytes),bytes:bytes.length});
     for(const [key,value] of response.headers)if(!['content-encoding','content-length','transfer-encoding','connection'].includes(key))res.setHeader(key,value);
     res.writeHead(response.status);res.end(req.method==='HEAD'?undefined:bytes);
    }catch(error){requests.push({originalOrigin,error:error instanceof Error?error.name:'UNKNOWN'});res.writeHead(502);res.end();}
   });
   await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(Number(new URL(originalOrigin).port),'127.0.0.1',resolve);});servers.push(server);
  }
  browser=await chromium.launch({headless:true,executablePath:await new BrowserRenderProof().executable(),args:['--disable-gpu']});
  const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
  const allowed=new Set([...mappings.keys(),...mappings.values()]);
  await context.route('**/*',async route=>{const request=route.request();if(!['GET','HEAD'].includes(request.method())||!allowed.has(new URL(request.url()).origin)){blocked.push({origin:new URL(request.url()).origin,method:request.method()});await route.abort();}else await route.continue();});
  for(const row of source.results){
   const latest=original.get('SELECT state FROM releases WHERE article_id=? ORDER BY rowid DESC LIMIT 1',row.articleId)!;
   const page=await context.newPage();
   const imageResponses:Array<Promise<{url:string,status:number,sha256:string}>>=[];
   page.on('response',response=>{if(new URL(response.url()).pathname.startsWith('/content/images/chrono/'))imageResponses.push(response.body().then(bytes=>({url:response.url(),status:response.status(),sha256:digest(bytes)})));});
   try{
    const response=await page.goto(row.url,{waitUntil:'networkidle',timeout:30000});assert.ok(response);
    if(latest.state==='unpublished'){assert.equal(response.status(),404);results.push({owner:row.owner,language:row.language,entry:row.entry,status:404,state:'unpublished',assertion:'Original URL remains unavailable after restore'});continue;}
    assert.equal(response.status(),200);
    assert.ok((await page.content()).includes(`chrono-revision:${row.revisionId}:${row.sourceSha256}`));
    const code=page.locator('pre code').filter({hasText:'const original'}).first();await code.scrollIntoViewIfNeeded();assert.ok(await code.isVisible());
    const imageResults=[];
    for(const asset of original.all('SELECT digest FROM assets WHERE article_id=?',row.articleId)){
     const img=page.locator(`img[src*="/content/images/chrono/${asset.digest}.png"]`);assert.equal(await img.count(),1);await img.scrollIntoViewIfNeeded();
     await img.evaluate(async(element:any)=>{await element.decode();});
     const properties=await img.evaluate((element:any)=>({src:element.src,currentSrc:element.currentSrc,complete:element.complete,naturalWidth:element.naturalWidth,naturalHeight:element.naturalHeight}));
     assert.ok(properties.complete&&properties.naturalWidth>0&&properties.naturalHeight>0);assert.ok(await img.isVisible());
     const originalOrigin=new URL(row.url).origin,restoredOrigin=mappings.get(originalOrigin)!;
     assert.ok([originalOrigin,restoredOrigin].includes(new URL(properties.currentSrc).origin),'Actual image must originate only from its corresponding restored site');
     const response=(await Promise.all(imageResponses)).find(response=>response.url===properties.currentSrc&&response.status===200&&response.sha256===asset.digest);
     assert.ok(response,'Natural browser image response must match the original asset bytes');
     const routed=requests.find(request=>request.originalOrigin===originalOrigin&&request.path===new URL(properties.currentSrc).pathname&&request.status===200&&request.sha256===asset.digest);
     if(new URL(properties.currentSrc).origin===originalOrigin)assert.ok(routed,'Original image URL must route only to the restored volume');
     imageResults.push({...properties,status:200,sha256:asset.digest,targetOrigin:restoredOrigin,route:new URL(properties.currentSrc).origin===originalOrigin?'original-url-relay':'ghost-rendered-restored-url'});
    }
    assert.ok(imageResults.length>0);results.push({owner:row.owner,language:row.language,entry:row.entry,status:200,state:latest.state,markerPreserved:true,codeVisible:true,images:imageResults});
   }finally{await page.close();}
  }
  assert.equal(results.length,8);assert.equal(results.filter(row=>row.status===200).length,6);assert.equal(results.filter(row=>row.status===404).length,2);
  for(const release of original.all("SELECT r.id,r.state,a.digest FROM releases r JOIN assets a ON a.article_id=r.article_id WHERE r.state IN ('cancelled','uncertain')")){
   const image=await fetch(`http://localhost:33568/content/images/chrono/${release.digest}.png`);assert.equal(image.status,404);
  }
  evidence={status:'PASS',performedAt:new Date().toISOString(),model:'Original public URLs mapped through temporary GET/HEAD-only loopback relays to fresh restored volumes; frozen HTML unchanged',sourceContainersStopped:true,sourceVolumesUsedAsFallback:false,sourceContainerCount:sourceContainerIds.length,results,requests,blockedNonFixtureRequests:blocked,privateCancelledAndUncertainImagesRemain404:true};
 }catch(error){
  await writeFile(join(root,`restore-browser-failed-${Date.now()}.json`),JSON.stringify({status:'FAIL',error:error instanceof Error?error.message:String(error),results,requests},null,2)+'\n');throw error;
 }finally{
  await browser?.close();
  await Promise.all(servers.map(server=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))));
 }
 await writeFile(join(root,'restore-browser-verification.json'),JSON.stringify({...evidence,relaysClosedAfterVerification:true},null,2)+'\n');
}
