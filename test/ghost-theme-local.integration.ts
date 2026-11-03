// Opt-in local acceptance only. Uploads a fixture theme, then restores the exact
// original active theme in finally; never writes posts, members or credentials.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium,request,type APIRequestContext} from 'playwright-core';
import {BrowserRenderProof} from '../src/render-proof.ts';

test('local EN/ZH Ghost renders B theme and restores the previous active theme',async()=>{
  const statePath=process.env.GHOST_LOCAL_STATE,archivePath=process.env.GHOST_THEME_FIXTURE;
  assert.ok(statePath&&archivePath,'Explicit local state and fixture archive paths are required');
  assert.ok(archivePath.endsWith('.fixture.zip'),'Only a fixture package is allowed in this acceptance harness');
  const state=JSON.parse(await readFile(statePath,'utf8'));
  const archive=await readFile(archivePath),backupDir=await mkdtemp(join(tmpdir(),'ghost-b-theme-backup-'));
  const evidence=new URL('../docs/evidence/ghost-b-local/',import.meta.url);await mkdir(evidence,{recursive:true});
  const browser=await chromium.launch({executablePath:await new BrowserRenderProof().executable(),headless:true});
  const results:Record<string,unknown>[]=[];
  const json=async(api:APIRequestContext,path:string)=>{const r=await api.get(path);assert.equal(r.status(),200,`GET ${path}`);return r.json();};
  try{
    for(const language of ['en','zh']){
      const site=state.sites[language],origin=new URL(site.url);
      assert.ok(origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname)&&origin.port&&origin.pathname==='/'&&!origin.username&&!origin.password,'Only explicit loopback Ghost sites are allowed');
      const api=await request.newContext({baseURL:origin.origin,extraHTTPHeaders:{Origin:origin.origin,'Accept-Version':'v6.0'},maxRedirects:0});
      let previous:string|undefined,activated=false;
      try{
        const login=await api.post('/ghost/api/admin/session/',{data:{username:site.email,password:site.password}});
        assert.equal(login.status(),201,'Local staff session');
        const themes=(await json(api,'/ghost/api/admin/themes/')).themes;
        previous=themes.find((theme:{active:boolean})=>theme.active)?.name;assert.ok(previous,'Existing active theme must be known');
        const before=(await json(api,`/ghost/api/admin/posts/${encodeURIComponent(site.post.id)}/?formats=html`)).posts[0];
        const bodyHash=createHash('sha256').update(before.html).digest('hex');
        const backup=await api.get(`/ghost/api/admin/themes/${encodeURIComponent(previous)}/download/`);assert.equal(backup.status(),200);
        await writeFile(join(backupDir,`${language}-${previous}.zip`),await backup.body(),{mode:0o600});
        const name=`chronoai-b-local-${Date.now()}-${language}.fixture.zip`;
        const uploaded=await api.post('/ghost/api/admin/themes/upload/',{multipart:{file:{name,mimeType:'application/zip',buffer:archive}}});
        assert.equal(uploaded.status(),200,'Theme upload');
        const uploadedName=(await uploaded.json()).themes[0].name;
        assert.ok(uploadedName!==previous,'Fixture must not replace the original theme');
        const activate=await api.put(`/ghost/api/admin/themes/${encodeURIComponent(uploadedName)}/activate/`);assert.equal(activate.status(),200);activated=true;
        const context=await browser.newContext({viewport:{width:1440,height:1000}});
        try{
          const page=await context.newPage(),privateRequests:string[]=[],errors:string[]=[];
          page.on('request',r=>{if(/\/api\/(cms|service)\//.test(r.url()))privateRequests.push(r.url());});
          page.on('pageerror',e=>errors.push(e.name));
          await page.goto(origin.origin,{waitUntil:'networkidle'});await page.locator('.journal-header').waitFor();
          assert.equal(await page.locator('html').getAttribute('lang'),language);
          assert.ok(await page.locator('.story-card').count()>0,'Native post feed');
          await page.screenshot({path:new URL(`${language}-home.png`,evidence).pathname,fullPage:true});
          await page.goto(before.url,{waitUntil:'networkidle'});await page.locator('.reading-body').waitFor();
          assert.equal(await page.locator('.story-heading h1').innerText(),before.title);
          assert.equal(await page.locator('link[rel=canonical]').count(),1);
          assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),before.url);
          assert.ok((await page.locator('.story-byline .byline-authors').innerText()).trim().length>0);
          assert.ok(await page.locator('.reading-body pre code').count()>0);
          assert.ok(await page.locator('.reading-body table').count()>0);
          assert.ok((await page.locator('.back-link').innerText()).includes(language==='en'?'All stories':'全部文章'));
          await page.screenshot({path:new URL(`${language}-post.png`,evidence).pathname,fullPage:true});
          await page.setViewportSize({width:390,height:844});
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal page overflow');
          await page.screenshot({path:new URL(`${language}-mobile.png`,evidence).pathname,fullPage:true});
          const sitemap=await context.request.get(`${origin.origin}/sitemap.xml`);assert.equal(sitemap.status(),200);
          assert.deepEqual(privateRequests,[]);assert.deepEqual(errors,[]);
          const after=(await json(api,`/ghost/api/admin/posts/${encodeURIComponent(site.post.id)}/?formats=html`)).posts[0];
          assert.equal(after.url,before.url);assert.equal(createHash('sha256').update(after.html).digest('hex'),bodyHash);
          results.push({language,origin:origin.origin,postUrl:before.url,previousTheme:previous,fixtureTheme:uploadedName,bodyUnchanged:true,canonical:true,locale:true,author:true,mobile:true,privateCmsRequests:0});
        }finally{await context.close();}
      }finally{
        if(activated&&previous){const restored=await api.put(`/ghost/api/admin/themes/${encodeURIComponent(previous)}/activate/`);assert.equal(restored.status(),200,'Restore original theme');assert.equal((await json(api,'/ghost/api/admin/themes/active/')).themes[0].name,previous);}
        await api.dispose();
      }
    }
  }finally{await browser.close();}
  const report={level:'local-ghost-real-template-rendering',nyxLive:false,fixtureArchiveSha256:createHash('sha256').update(archive).digest('hex'),originalThemesRestored:true,backups:backupDir,sites:results};
  await writeFile(new URL('result.json',evidence),JSON.stringify(report,null,2)+'\n');
  process.stdout.write(JSON.stringify(report)+'\n');
});
