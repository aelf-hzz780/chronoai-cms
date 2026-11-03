// Explicit local synthetic-content acceptance; no real Nyx identity or external
// destination accounts. Created posts are unpublished, never deleted, in finally.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {chromium,request,type APIRequestContext} from 'playwright-core';
import {fixture} from './helpers.ts';
import {Vault} from '../src/vault.ts';
import {createApp} from '../src/app.ts';
import {PublishingService,ReleaseWorker} from '../src/publishing.ts';
import {GhostAdapter} from '../src/ghost.ts';
import {MetricsService} from '../src/metrics.ts';
import {AlternateService,AlternateWorker} from '../src/alternates.ts';
import {BrowserRenderProof} from '../src/render-proof.ts';

test('B theme receives real CMS originals, bilingual links and consent controls on local Ghost',async()=>{
  assert.ok(process.env.GHOST_LOCAL_STATE,'Explicit local Ghost state is required');
  const saved=JSON.parse(await readFile(process.env.GHOST_LOCAL_STATE,'utf8'));
  const themeEvidence=JSON.parse(await readFile(new URL('../docs/evidence/ghost-b-local/result.json',import.meta.url),'utf8'));
  const f=fixture(),vault=new Vault(randomBytes(32).toString('hex'));
  const metrics=new MetricsService(f.content,{enabled:true,requireConsent:true,secret:randomBytes(32).toString('hex')});
  const app=await createApp({...f,vault,metrics,publicUrl:'http://127.0.0.1',authenticate:async r=>f.actors[r.headers.authorization?.slice(7)??'']??null});
  const address=await app.listen({host:'127.0.0.1',port:0});
  const environment:NodeJS.ProcessEnv={RENDER_ASSET_ORIGINS:process.env.RENDER_ASSET_ORIGINS??'https://cdn.jsdelivr.net'},administrators:Array<{api:APIRequestContext;previous:string}>=[];
  const mediaRoot=await mkdtemp(join(tmpdir(),'cms-ghost-acceptance-'));
  const publisher=new PublishingService(f.content,vault),ghost=new GhostAdapter(f.store,mediaRoot,true,environment,{metrics,publicUrl:address,requireConsent:true});
  const worker=new ReleaseWorker(publisher,ghost),links=new AlternateWorker(new AlternateService(publisher),ghost);
  const browser=await chromium.launch({executablePath:await new BrowserRenderProof().executable(),headless:true});
  const run=randomUUID(),published:any[]=[],evidence=new URL('../docs/evidence/cms-ghost-local/',import.meta.url);let report:unknown;
  await mkdir(evidence,{recursive:true});
  const drain=async()=>{for(let i=0;i<20;i++){if(!await links.once())return;}assert.fail('Projection queue exceeded bounded acceptance drain');};
  try{
    for(const language of ['en','zh']){
      const site=saved.sites[language],origin=new URL(site.url);
      assert.ok(origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname)&&origin.port&&!origin.username&&!origin.password);
      const api=await request.newContext({baseURL:origin.origin,extraHTTPHeaders:{Origin:origin.origin,'Accept-Version':'v6.0'},maxRedirects:0});
      assert.equal((await api.post('/ghost/api/admin/session/',{data:{username:site.email,password:site.password}})).status(),201);
      const current=await api.get('/ghost/api/admin/themes/active/');assert.equal(current.status(),200);
      const previous=(await current.json()).themes[0].name;administrators.push({api,previous});
      const theme=themeEvidence.sites.find((s:any)=>s.language===language).fixtureTheme;
      assert.equal((await api.put(`/ghost/api/admin/themes/${encodeURIComponent(theme)}/activate/`)).status(),200);
      const siteId=`acceptance-${language}`,key=`ACCEPTANCE_${language.toUpperCase()}`;environment[key]=site.key;
      f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)',siteId,'solo',language,site.url,key);
      f.store.run('INSERT INTO author_mappings VALUES (?,?,?)',siteId,'BlogSystem Local Operator',site.owner_id);
      const markdown=`# ${language==='en'?'A verified publishing workflow':'经过核验的发布流程'}\r\n\r\n| Language | Owner |\r\n| --- | --- |\r\n| ${language} | personal |\r\n\r\n\`\`\`ts\r\nconst version = '${run}';\r\n\`\`\`\r\n`;
      const created=await app.inject({method:'POST',url:'/api/cms/articles',headers:{authorization:'Bearer solo'},payload:{ownerId:'solo',language,title:`B local acceptance ${language} ${run}`,markdown,creditedAuthor:'BlogSystem Local Operator'}});
      assert.equal(created.statusCode,201);const article=created.json();
      if(language==='zh')await f.content.linkTranslation(f.actors.solo,article.id,published[0].article.id,published[0].article.revision.id,'local-link');
      const confirmed=await app.inject({method:'POST',url:`/api/cms/articles/${article.id}/releases`,headers:{authorization:'Bearer solo'},payload:{ownerId:'solo',revisionId:article.revision.id,creditedAuthor:'BlogSystem Local Operator',action:'publish',rightsConfirmed:true,idempotencyKey:`${run}-${language}`}});
      assert.equal(confirmed.statusCode,202);const releaseId=confirmed.json().id;
      published.push({language,article,releaseId});
      assert.equal(await worker.once(),true);
      const live=f.store.get('SELECT * FROM releases WHERE id=?',releaseId)!;
      published.at(-1).url=live.url;
      assert.equal(live.state,'published',JSON.stringify({language,state:live.state,code:live.error_code}));
      await drain();
    }
    assert.equal(f.store.get("SELECT count(*) n FROM projections WHERE state<>'complete'")!.n,0);
    for(const item of published){
      const other=published.find(p=>p.language!==item.language)!;
      const context=await browser.newContext(),page=await context.newPage();
      try{
        await page.goto(item.url,{waitUntil:'networkidle'});
        assert.equal(await page.locator('html').getAttribute('lang'),item.language);
        assert.equal(await page.locator(`link[rel=alternate][hreflang=${other.language}]`).getAttribute('href'),other.url);
        assert.equal(await page.locator('nav[aria-label=Translations] a').getAttribute('href'),other.url);
        assert.equal(await page.locator('[data-chrono-owner=solo]').count(),1);
        assert.equal(await page.locator('.reading-body table').count(),1);
        const views=()=>f.store.get('SELECT count(*) n FROM observations WHERE article_id=?',item.article.id)!.n;
        assert.equal(views(),0,'No collection before consent');
        const allow=page.getByRole('button',{name:item.language==='en'?'Allow analytics':'允许统计',exact:true});
        const decline=page.getByRole('button',{name:item.language==='en'?'Decline analytics':'拒绝统计',exact:true});
        const collected=page.waitForResponse(r=>r.url().startsWith(`${address}/track/`)&&r.status()===200);
        await allow.click();await collected;assert.equal(views(),1);
        await decline.click();await page.reload({waitUntil:'networkidle'});assert.equal(views(),1,'Withdrawal stops future collection');
        assert.equal(new URL(page.url()).pathname,new URL(item.url).pathname,'Consent controls do not navigate');
        await page.screenshot({path:new URL(`${item.language}-published.png`,evidence).pathname,fullPage:true});
        const metric=(await app.inject({url:`/api/cms/metrics?ownerId=solo&article=${item.article.id}`,headers:{authorization:'Bearer solo'}})).json();
        assert.equal(metric.readership.pageViews.value,1);
        for(const signal of ['globalPrivacyControl','doNotTrack']){
          const privateContext=await browser.newContext();
          await privateContext.addInitScript(name=>Object.defineProperty(navigator,name,{get:()=>name==='doNotTrack'?'1':true}),signal);
          try{const privatePage=await privateContext.newPage();await privatePage.goto(item.url,{waitUntil:'networkidle'});assert.equal(await privatePage.getByRole('button',{name:item.language==='en'?'Allow analytics':'允许统计',exact:true}).count(),0);assert.equal(views(),1);}finally{await privateContext.close();}
        }
      }finally{await context.close();}
    }
    await app.close();
    for(const item of published){const page=await browser.newPage();try{await page.goto(item.url,{waitUntil:'networkidle'});assert.equal(await page.locator('.story-heading h1').innerText(),item.article.revision.title);assert.equal(await page.locator('.reading-body table').count(),1);}finally{await page.close();}}
    report={level:'local-real-CMS-API-and-Ghost',run,authority:'isolated fixture; real Nyx deferred',consent:{allow:true,decline:true,withdraw:true,gpc:true,dnt:true},translations:'bidirectional verified links',cmsOfflineReading:true,privateImagePromotion:'not exercised by this run',posts:published.map(p=>({articleId:p.article.id,releaseId:p.releaseId,language:p.language,url:p.url})),cleanup:'test posts unpublished; previous themes restored after validation'};
  }finally{
    const cleanupErrors:unknown[]=[];
    for(const item of published)try{
      const row=f.store.get('SELECT * FROM releases WHERE id=?',item.releaseId)!;
      if(row.remote_id&&row.url){const input=publisher.input(row),post=await ghost.current(input);assert.ok(post?.html?.includes(ghost.marker(input)),'Cleanup is limited to this exact synthetic post');await ghost.unpublish(input);assert.equal((await fetch(row.url)).status,404);}
    }catch(error){cleanupErrors.push(error);}
    for(const {api,previous}of administrators)try{assert.equal((await api.put(`/ghost/api/admin/themes/${encodeURIComponent(previous)}/activate/`)).status(),200);}catch(error){cleanupErrors.push(error);}finally{await api.dispose();}
    await browser.close();await app.close();f.store.close();
    if(cleanupErrors.length)throw new AggregateError(cleanupErrors,'Local acceptance cleanup requires review');
  }
  await writeFile(new URL('result.json',evidence),JSON.stringify(report,null,2)+'\n');
});
