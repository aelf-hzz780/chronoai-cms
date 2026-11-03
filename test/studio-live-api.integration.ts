// Acceptance harness only: real Fastify/SQLite/session/CSRF, isolated identity provider.
// This file is never imported by the production application.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir, readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {fixture} from './helpers.ts';
import {createApp} from '../src/app.ts';
import {AuthManager} from '../src/auth.ts';
import type {Config} from '../src/config.ts';
import {Vault} from '../src/vault.ts';
import {digest} from '../src/content.ts';
import {AppError} from '../src/errors.ts';
import {BrowserRenderProof} from '../src/render-proof.ts';

async function acceptanceServer(port=0){
  const f=fixture(),vault=new Vault(randomBytes(32).toString('hex'));
  for(const actor of Object.values(f.actors))actor.credential=`acceptance-${actor.subject}`;
  f.store.run('INSERT INTO owner_profiles VALUES (?,?)','member','Personal acceptance desk');
  f.store.run('INSERT INTO owner_profiles VALUES (?,?)','org','ChronoAI · acceptance workspace');
  f.store.run('INSERT INTO publishers VALUES (?,?)','org','publisher');
  for(const language of ['en','zh'])f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)',`org-${language}`,'org',language,`https://${language}.example.invalid`,'ACCEPTANCE_ONLY');
  const english=await f.content.create(f.actors.member,{ownerId:'org',language:'en',title:'A calmer place to publish',markdown:'# An intentional publishing workflow\n\nOne workspace. Two independent originals.\n\n| Language | Site |\n| --- | --- |\n| English | EN Ghost |\n| 简体中文 | ZH Ghost |\n',creditedAuthor:'Acceptance author'},'acceptance-seed');
  const chinese=await f.content.create(f.actors.member,{ownerId:'org',language:'zh',title:'让内容发布更清晰',markdown:'# 两种语言，各自发布\n\n中文稿有独立的修订、投稿和 Ghost 站点。\n',creditedAuthor:'Acceptance author'},'acceptance-seed');
  await f.content.linkTranslation(f.actors.member,chinese.id,english.id,english.revision.id,'acceptance-seed');
  await f.content.submit(f.actors.member,english.id,english.revision.id,'acceptance-seed');
  await f.content.submit(f.actors.member,chinese.id,chinese.revision.id,'acceptance-seed');
  const config={publicUrl:'http://127.0.0.1',cmsAudience:'acceptance-cms',clientId:'acceptance-client',issuer:'https://identity.example'} as Config;
  const auth=new AuthManager(config,f.store,vault,f.policy);
  // OIDC cryptography/return behavior has its own real-signature tests. Only the
  // external identity source is replaced here; application session/CSRF is real.
  auth.accessToken=async token=>{
    const actor=Object.values(f.actors).find(actor=>actor.credential===token);
    if(!actor)throw new AppError(401,'INVALID_TOKEN','Unknown acceptance identity');
    await f.policy.scope(actor,'content:read');return actor;
  };
  const app=await createApp({...f,vault,publicUrl:config.publicUrl,auth,authenticate:request=>auth.authenticate(request)});
  app.get('/__acceptance/session/:subject',async(request,reply)=>{
    const subject=(request.params as {subject:string}).subject;
    if(!f.actors[subject])return reply.code(404).send({error:'Unknown fixture actor'});
    const token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');
    f.store.run('INSERT INTO sessions VALUES (?,?,?,?)',digest(token),vault.seal(f.actors[subject]),csrf,new Date(Date.now()+3_600_000).toISOString());
    reply.setCookie('chrono_session',token,{httpOnly:true,sameSite:'lax',path:'/'});
    return reply.redirect('/studio');
  });
  const url=await app.listen({host:'127.0.0.1',port});config.publicUrl=url;
  return {f,app,url,english,chinese,async close(){await app.close();f.store.close();}};
}

if(process.argv.includes('--serve')){
  const server=await acceptanceServer(Number(process.env.STUDIO_ACCEPTANCE_PORT??4174));
  process.stdout.write(`Isolated acceptance only; no real Nyx identity or external publishing.\n${server.url}/__acceptance/session/member\n`);
  const stop=async()=>{await server.close();process.exit(0);};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
}else{
  test('M1 real API browser: session, bilingual navigation, UTF-8 save/refresh, conflict and role boundaries',async t=>{
    const server=await acceptanceServer();t.after(()=>server.close());
    const browser=await chromium.launch({executablePath:await new BrowserRenderProof().executable(),headless:true});t.after(()=>browser.close());
    const context=await browser.newContext({viewport:{width:1440,height:1024}});const page=await context.newPage();
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${server.url}/studio`);await page.locator('#signin').waitFor();
    await page.goto(`${server.url}/__acceptance/session/member`);await page.locator('#workspace').waitFor();
    await page.locator('#workspace').selectOption('org');await page.getByRole('link',{name:'A calmer place to publish',exact:true}).waitFor();
    const evidence=new URL('../docs/evidence/cms-b-m1/',import.meta.url);await mkdir(evidence,{recursive:true});
    await page.screenshot({path:new URL('content.png',evidence).pathname,fullPage:true});
    await page.getByRole('link',{name:'A calmer place to publish',exact:true}).click();await page.locator('#article-title').waitFor();
    // Follow the actual peer, then verify the Chinese article loads from the API.
    const peer=page.locator(`a[href="#/article/${server.chinese.id}"]`).first();await peer.click();
    await page.waitForFunction(()=>document.querySelector<HTMLInputElement>('#article-title')?.value==='让内容发布更清晰');
    await page.locator(`a[href="#/article/${server.english.id}"]`).first().click();
    await page.waitForFunction(()=>document.querySelector<HTMLInputElement>('#article-title')?.value==='A calmer place to publish');
    await page.screenshot({path:new URL('editor.png',evidence).pathname,fullPage:true});
    await page.locator('#locale').selectOption('zh');assert.match(await page.locator('.editor-title-label').innerText(),/English/);
    await page.locator('#locale').selectOption('en');
    const raw='\uFEFF# Browser-imported source\r\n\r\n中文 UTF-8 stays intact.\r\n';
    await page.setInputFiles('#markdown-file',{name:'source.md',mimeType:'text/markdown',buffer:Buffer.from(raw)});
    await page.getByText('Original UTF-8 file loaded.',{exact:false}).waitFor();
    await page.locator('[data-action="save"]').click();await page.waitForFunction(()=>document.querySelector('.editor-state')?.textContent?.includes('Saved'));
    let article=await server.f.content.get(server.f.actors.member,server.english.id);assert.equal(article.revision.markdown,raw);
    await page.reload();await page.locator('#article-title').waitFor();
    await page.locator('#article-title').fill('Metadata-only edit from Studio');await page.locator('[data-action="save"]').click();
    await page.waitForFunction(()=>document.querySelector('.editor-state')?.textContent?.includes('Saved'));
    article=await server.f.content.get(server.f.actors.member,server.english.id);assert.equal(article.revision.markdown,raw);
    const downloading=page.waitForEvent('download');await page.locator('[data-action="export-raw"]').click();const download=await downloading;
    assert.deepEqual(await readFile((await download.path())!),Buffer.from(raw));
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
    await page.setInputFiles('#image-file',{name:'private.png',mimeType:'image/png',buffer:png});
    await page.waitForFunction(()=>document.querySelector<HTMLTextAreaElement>('#markdown')?.value.includes('asset:'));
    await page.locator('[data-action="save"]').click();await page.waitForFunction(()=>document.querySelector('.editor-state')?.textContent?.includes('Saved'));
    article=await server.f.content.get(server.f.actors.member,server.english.id);
    const assetId=/asset:([a-f0-9-]{36})/.exec(article.revision.markdown)![1];
    await page.locator('[data-action="preview-saved"]').click();await page.locator('.saved-preview img').waitFor();
    await page.waitForFunction(()=>document.querySelector<HTMLImageElement>('.saved-preview img')?.naturalWidth===1);
    await page.locator('[data-action="write"]').click();
    const me=await(await context.request.get(`${server.url}/api/cms/me`)).json();
    const forbidden=await context.request.patch(`${server.url}/api/cms/articles/${server.english.id}`,{data:{expectedRevision:article.revision.id,title:'No CSRF'}});
    assert.equal(forbidden.status(),403,'real application rejects missing Origin/CSRF');
    await server.f.content.edit(server.f.actors.member,server.english.id,article.revision.id,{title:'Concurrent accepted edit'},'acceptance-conflict');
    await page.locator('#markdown').fill('Keep this unsaved local text');await page.locator('[data-action="save"]').click();
    await page.locator('.conflict-banner').waitFor();assert.equal(await page.locator('#markdown').inputValue(),'Keep this unsaved local text');
    assert.match(await page.locator('#notice').innerText(),/CONFLICT.*Trace ID/);assert.ok(me.csrf);
    await page.screenshot({path:new URL('conflict.png',evidence).pathname,fullPage:true});
    // An organization Admin may publish submitted material, not edit its author’s draft.
    const adminPage=await context.newPage();await adminPage.goto(`${server.url}/__acceptance/session/admin`);
    await adminPage.locator('#workspace').selectOption('org');await adminPage.goto(`${server.url}/studio#/article/${server.english.id}`);
    await adminPage.locator('#article-title').waitFor();assert.equal(await adminPage.locator('[data-action="save"]').isDisabled(),true);
    assert.equal(await adminPage.locator('#article-title').inputValue(),'A calmer place to publish','only the submitted revision is exposed');
    assert.equal(await adminPage.getByText('Concurrent accepted edit',{exact:true}).count(),0);
    assert.equal((await context.request.get(`${server.url}/api/cms/assets/${assetId}`)).status(),403,'Admin cannot read the new unsubmitted private image');
    await adminPage.setViewportSize({width:390,height:844});
    assert.equal(await adminPage.locator('#workspace').isVisible(),true,'mobile workspace selector remains usable');
    await adminPage.locator('#workspace').selectOption('admin');await adminPage.locator('.empty').waitFor();
    assert.equal(await adminPage.locator('#workspace').inputValue(),'admin');
    await adminPage.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
    await adminPage.screenshot({path:new URL('mobile.png',evidence).pathname,fullPage:true});
    assert.deepEqual(errors,[]);
  });
}
