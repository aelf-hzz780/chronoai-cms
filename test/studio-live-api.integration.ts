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
  test('WP06 real API browser: current membership, grant/revoke, unavailable counters and read-only settings',async t=>{
    const server=await acceptanceServer();t.after(()=>server.close());
    const browser=await chromium.launch({executablePath:await new BrowserRenderProof().executable(),headless:true});t.after(()=>browser.close());
    const context=await browser.newContext({viewport:{width:1440,height:1024}}),page=await context.newPage();
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    const evidence=new URL('../docs/evidence/cms-b-wp06/',import.meta.url);await mkdir(evidence,{recursive:true});
    await page.goto(`${server.url}/__acceptance/session/admin`);await page.locator('#workspace').selectOption('org');
    await page.goto(`${server.url}/studio#/members`);await page.locator('.studio-member-directory').waitFor();
    await page.locator('[data-action="member-select"][data-identity="member"][data-enabled="true"]').click();
    assert.equal(server.f.store.get('SELECT 1 FROM publishers WHERE owner_id=? AND subject=?','org','member'),undefined,'selection alone does not grant authority');
    await page.locator('[data-action="member-confirm"]').click();
    await page.locator('[data-action="member-select"][data-identity="member"][data-enabled="false"]').waitFor();
    assert.ok(server.f.store.get('SELECT 1 FROM publishers WHERE owner_id=? AND subject=?','org','member'));
    await page.screenshot({path:new URL('members.png',evidence).pathname,fullPage:true});
    // A current directory outage must not prevent explicit revocation of a known subject.
    server.f.policy.authority.organizationMembers=async()=>{throw new Error('Acceptance directory outage');};
    await page.locator('[data-action="refresh"]').click();await page.locator('.studio-member-unavailable').waitFor();
    await page.locator('#revoke-identity').fill('member');await page.locator('#manual-member-revoke button').click();
    await page.locator('[data-action="member-confirm"]').click();
    await page.waitForFunction(()=>!document.querySelector('.studio-member-confirm'));
    assert.equal(server.f.store.get('SELECT 1 FROM publishers WHERE owner_id=? AND subject=?','org','member'),undefined);
    await page.goto(`${server.url}/studio#/analytics`);await page.locator('#analytics-filters').waitFor();
    await page.locator('#metric-destination').selectOption('dev');await page.locator('#analytics-filters button').click();
    await page.waitForFunction(()=>document.querySelector('.studio-metric-definition')?.textContent?.includes('capture time'));
    const metrics=await(await context.request.get(`${server.url}/api/cms/metrics?ownerId=org&destination=dev`)).json();
    assert.equal(metrics.externalEngagement.metrics.views.value,null);
    assert.equal(await page.locator('[data-metric="views"] strong').innerText(),'Unavailable');
    assert.equal(await page.locator('.studio-trend').count(),0,'external lifetime captures do not invent a daily traffic chart');
    await page.screenshot({path:new URL('analytics.png',evidence).pathname,fullPage:true});
    await page.goto(`${server.url}/studio#/settings`);await page.locator('#settings-locale').waitFor();
    assert.equal(await page.locator('.studio-settings-layout input').count(),0,'unsupported workspace settings have no false editable inputs');
    assert.match(await page.locator('.studio-settings-layout').innerText(),/https:\/\/en.example.invalid/);
    assert.match(await page.locator('.studio-settings-layout').innerText(),/https:\/\/zh.example.invalid/);
    await page.locator('#settings-locale').selectOption('zh');await page.locator('h1').filter({hasText:'站点与工作区'}).waitFor();
    await page.screenshot({path:new URL('settings-zh.png',evidence).pathname,fullPage:true});
    await page.goto(`${server.url}/studio#/guide`);await page.locator('.studio-guide-grid').waitFor();
    assert.match(await page.locator('.studio-guide-grid').innerText(),/Ghost/);
    // Losing Admin after page entry must block the actual API, not just hide a button.
    server.f.memberships.set('admin:org','member');
    assert.equal((await context.request.get(`${server.url}/api/cms/owners/org/members`)).status(),403);
    await page.goto(`${server.url}/studio#/members`);
    await page.waitForFunction(()=>document.querySelector('#notice')?.textContent?.includes('FORBIDDEN')||document.querySelector('.empty')?.textContent?.includes('当前工作区能力'));
    assert.equal(await page.locator('[data-action="member-confirm"]').count(),0);
    assert.deepEqual(errors,[]);
  });
  test('WP03 real API browser: frozen original confirmation, task readback and safe cancellation',async t=>{
    const server=await acceptanceServer();t.after(()=>server.close());
    const browser=await chromium.launch({executablePath:await new BrowserRenderProof().executable(),headless:true});t.after(()=>browser.close());
    const context=await browser.newContext({viewport:{width:1440,height:1024}}),page=await context.newPage();
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${server.url}/__acceptance/session/publisher`);await page.locator('#workspace').selectOption('org');
    await page.getByRole('link',{name:'A calmer place to publish',exact:true}).click();
    await page.locator('[data-action="review-publication"]').click();await page.locator('#publication-rights').waitFor();
    assert.equal(await page.locator('[data-action="confirm-original"]').isDisabled(),true);
    assert.match(await page.locator('.review-summary').innerText(),/English.*Ghost/s);
    assert.match(await page.locator('.studio-confirm-preview').innerText(),/One workspace. Two independent originals./);
    const evidence=new URL('../docs/evidence/cms-b-wp03/',import.meta.url);await mkdir(evidence,{recursive:true});
    await page.screenshot({path:new URL('publication-review.png',evidence).pathname,fullPage:true});
    await page.locator('#publication-rights').check();await page.locator('[data-action="confirm-original"]').click();
    await page.waitForURL(url=>url.hash.startsWith('#/task/release/'));await page.locator('.studio-task-preview').waitFor();
    const id=new URL(page.url()).hash.split('/').at(-1)!;
    const row=server.f.store.get('SELECT * FROM releases WHERE id=?',id)!;
    assert.equal(row.owner_id,'org');assert.equal(row.article_id,server.english.id);assert.equal(row.revision_id,server.english.revision.id);assert.equal(row.state,'queued');
    assert.equal(server.f.store.get("SELECT count(*) n FROM jobs WHERE kind='release' AND resource_id=? AND state='queued'",id)!.n,1);
    assert.match(await page.locator('.page-heading .badge').innerText(),/Queued/);
    // A later author's submitted revision must not rewrite this confirmed task.
    const newer=await server.f.content.edit(server.f.actors.member,server.english.id,server.english.revision.id,{markdown:'New submission after confirmation'},'wp03-newer');
    await server.f.content.submit(server.f.actors.member,newer.id,newer.revision.id,'wp03-newer');
    await page.reload();await page.locator('.studio-task-preview').waitFor();
    assert.match(await page.locator('.studio-task-preview').innerText(),/One workspace. Two independent originals./);
    assert.doesNotMatch(await page.locator('.studio-task-preview').innerText(),/New submission after confirmation/);
    await page.screenshot({path:new URL('queued-task.png',evidence).pathname,fullPage:true});
    page.once('dialog',dialog=>dialog.accept());await page.locator('[data-action="task-cancel"]').click();
    await page.waitForFunction(()=>document.querySelector('.page-heading .badge')?.textContent==='Cancelled');
    assert.equal(server.f.store.get('SELECT state FROM releases WHERE id=?',id)!.state,'cancelled');
    assert.equal(server.f.store.get("SELECT state FROM jobs WHERE kind='release' AND resource_id=?",id)!.state,'cancelled');
    await page.goto(`${server.url}/studio#/tasks?articleId=${server.english.id}`);await page.locator('.studio-task-table').waitFor();
    assert.match(await page.locator('.studio-task-table').innerText(),/Cancelled/);
    const mobile=await context.newPage();await mobile.setViewportSize({width:390,height:844});
    await mobile.goto(`${server.url}/studio#/tasks?articleId=${server.english.id}`);await mobile.locator('#workspace').selectOption('org');
    await mobile.goto(`${server.url}/studio#/tasks?articleId=${server.english.id}`);await mobile.locator('.studio-task-table').waitFor();
    assert.equal(await mobile.locator('#workspace').isVisible(),true);assert.equal(await mobile.locator('.sidebar').count(),1);
    assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await mobile.screenshot({path:new URL('tasks-mobile.png',evidence).pathname,fullPage:true});
    assert.deepEqual(errors,[]);
  });
}
