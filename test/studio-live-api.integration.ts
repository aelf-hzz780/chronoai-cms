// Acceptance harness only: real Fastify/SQLite/session/CSRF, isolated identity provider.
// This file is never imported by the production application.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {fixture} from './helpers.ts';
import {createApp} from '../src/app.ts';
import {AuthManager} from '../src/auth.ts';
import type {Config} from '../src/config.ts';
import {Vault} from '../src/vault.ts';
import {digest} from '../src/content.ts';
import {AppError} from '../src/errors.ts';
import {BrowserRenderProof} from '../src/render-proof.ts';
import {PublishingService,ReleaseWorker} from '../src/publishing.ts';
import {DistributionService} from '../src/distribution.ts';
import {TargetRegistry,DevAdapter,HashnodeAdapter,AssistedAdapter} from '../src/targets.ts';
import {NyxAuthority} from '../src/nyxid.ts';
import {ConnectionAttemptService} from '../src/connection-attempts.ts';
import {WorkspaceReadService} from '../src/workspace-read.ts';

const evidenceDirectory=(name:string)=>pathToFileURL(resolve(process.env.STUDIO_EVIDENCE_DIR??'.runtime/studio-acceptance',name)+'/');

function acceptanceServices(f:ReturnType<typeof fixture>,vault:Vault,config:Config){
  // This adapter is an explicit external-provider fixture. Real CMS services,
  // policy, queue persistence and HTTP routes still run without interception.
  const targets=['dev','hashnode','medium','hackernoon'];
  const bindings=(owner:any)=>targets.map(target=>({id:`${owner.subject}-${target}`,owner,target,slug:`fixture-${target}`,accountId:`fixture-${owner.subject}-account`,generation:'fixture-generation-1',active:true,canPublish:true,canUpdate:true,organizationId:owner.kind==='organization'?'fixture-org':undefined,publicationId:'fixture-publication',remoteBaseUrl:target==='dev'?'https://dev.to/api':'https://gql.hashnode.com'}));
  const approvals=new Map<string,{digest:string;connectionId:string;action:string;accepted:boolean}>();
  const originals=new PublishingService(f.content,vault);
  const connections={
    async connection(_actor:any,owner:any,id:string,target:string){const value=bindings(owner).find(binding=>binding.id===id&&binding.target===target);if(!value)throw new AppError(403,'CONNECTION_MISMATCH','Unknown acceptance connection');return value;},
    async listConnections(_actor:any,owner:any){return bindings(owner).map(({id,target,accountId,active})=>({id,target,label:`Local fixture · ${target}`,accountId,active}));},
    async execute(){throw new Error('External provider writes are disabled in the local acceptance preview');},
    async prepareApproval(_actor:any,_owner:any,connectionId:string,_target:string,_request:any,deliveryId:string,contentDigest:string,action:string){const reference=`fixture-approval-${deliveryId}`;approvals.set(reference,{digest:contentDigest,connectionId,action,accepted:false});return {reference,state:'pending',expiresAt:new Date(Date.now()+900_000).toISOString()};},
    async approval(_actor:any,_owner:any,reference:string,contentDigest:string,connectionId:string,action:string){const value=approvals.get(reference);if(!value?.accepted||value.digest!==contentDigest||value.connectionId!==connectionId||value.action!==action)throw new AppError(403,'APPROVAL_INVALID','This exact fixture approval has not been accepted');return {};}
  };
  const distribution=new DistributionService(originals,connections,new TargetRegistry([new DevAdapter('https://dev.to/api'),new HashnodeAdapter('https://gql.hashnode.com'),new AssistedAdapter('medium'),new AssistedAdapter('hackernoon')]));
  config.connectionSetup={managementUrl:'https://identity.example/services',ttlSeconds:900,targets:{dev:{enabled:true,serviceSlug:'fixture-dev',scopes:['write:articles']}}};
  const nyx=new NyxAuthority(config,f.store);
  nyx.bindings=async()=>f.store.all('SELECT * FROM owners').flatMap(owner=>bindings({kind:owner.kind,issuer:owner.issuer,subject:owner.subject}));
  nyx.call=async(actor,path,method='GET',_body?:any)=>{
    if(path==='/api/v1/user-services')return {services:(await nyx.bindings()).filter(binding=>binding.owner.subject===actor.subject||binding.owner.kind==='organization').map(binding=>({id:binding.id,slug:binding.slug,is_active:true,state_version:1,credential_source:binding.owner.kind==='organization'?{type:'org',org_id:binding.owner.subject,allowed:true}:{type:'personal'}}))};
    if(path==='/api/v1/connect-links'&&method==='POST')return {id:'fixture-link',connect_url:'https://identity.example/connect?token=fixture-only',expires_at:new Date(Date.now()+900_000).toISOString()};
    if(path.startsWith('/api/v1/connect-links/fixture-link'))return {id:'fixture-link',status:path.endsWith('/cancel')?'cancelled':'pending',service_slug:'fixture-dev',service_name:'DEV',scopes:['write:articles'],expires_at:new Date(Date.now()+900_000).toISOString()};
    throw new Error('Unexpected acceptance identity request');
  };
  const connectionAttempts=new ConnectionAttemptService(new WorkspaceReadService(f.policy),nyx,vault,config);
  return {originals,distribution,connectionAttempts,acceptApproval(reference:string){const value=approvals.get(reference);assert.ok(value);value.accepted=true;},async publish(article:any){const release=await originals.confirm(f.actors.admin,article.id,{ownerId:'org',revisionId:article.revision.id,creditedAuthor:article.revision.creditedAuthor,action:'publish',rightsConfirmed:true,idempotencyKey:`acceptance-${article.id}`},'acceptance-original');await new ReleaseWorker(originals,{async publish(input){return {remoteId:`fixture-${input.articleId}`,url:`https://${input.language}.example.invalid/${input.articleId}/`};},async verify(){return true;},async reconcile(){return null;},async unpublish(){}}).once();return f.store.get('SELECT * FROM releases WHERE id=?',release.id)!;}};
}

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
  const services=acceptanceServices(f,vault,config);
  const app=await createApp({...f,vault,...services,publicUrl:config.publicUrl,auth,authenticate:request=>auth.authenticate(request)});
  if(process.argv.includes('--serve')){
    app.get('/__acceptance/notice.css',async(_request,reply)=>reply.type('text/css').send('#acceptance-notice{position:fixed;z-index:100;bottom:0;left:0;right:0;margin:0;padding:10px 16px;background:#eee8ff;color:#3f2477;border-top:1px solid #d3c5ff;font:12px/1.6 system-ui,sans-serif}body{padding-bottom:58px}'));
    app.addHook('onSend',async(request,_reply,payload)=>{
      if(!['/studio','/studio/'].includes(request.url.split('?')[0]!))return payload;
      const html=Buffer.isBuffer(payload)?payload.toString('utf8'):typeof payload==='string'?payload:null;
      if(html===null)return payload;
      return html.replace('</head>','<link rel="stylesheet" href="/__acceptance/notice.css"></head>').replace('<body>','<body><aside id="acceptance-notice" role="status">LOCAL ACCEPTANCE / 本地验收：真实 CMS API 与隔离数据库；身份、连接与外部发布结果为测试 fixture。不会向外部平台发文。</aside>');
    });
  }
  app.get('/__acceptance/session/:subject',async(request,reply)=>{
    const subject=(request.params as {subject:string}).subject;
    if(!f.actors[subject])return reply.code(404).send({error:'Unknown fixture actor'});
    const token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');
    f.store.run('INSERT INTO sessions VALUES (?,?,?,?)',digest(token),vault.seal(f.actors[subject]),csrf,new Date(Date.now()+3_600_000).toISOString());
    reply.setCookie('chrono_session',token,{httpOnly:true,sameSite:'lax',path:'/'});
    return reply.redirect('/studio');
  });
  const url=await app.listen({host:'127.0.0.1',port});config.publicUrl=url;
  return {f,app,url,english,chinese,...services,async close(){await app.close();f.store.close();}};
}

if(process.argv.includes('--serve')){
  const server=await acceptanceServer(Number(process.env.STUDIO_ACCEPTANCE_PORT??4174));
  assert.match((await server.app.inject('/studio')).body,/id="acceptance-notice"/,'The actual buffered HTML must clearly identify the local fixture preview');
  const release=await server.publish(server.english);await server.publish(server.chinese);
  const manual=await server.distribution.request(server.f.actors.admin,release.id,{target:'medium',connectionId:'org-medium',action:'create',format:'full',rightsConfirmed:true,idempotencyKey:'preview-manual'},'preview-fixture');
  await server.distribution.report(server.f.actors.admin,manual.id,'reviewing',null,'preview-fixture','Local acceptance fixture: awaiting an editorial decision.');
  await server.distribution.request(server.f.actors.admin,release.id,{target:'dev',connectionId:'org-dev',action:'create',format:'excerpt',excerpt:'One workspace. Two independent originals. A deliberate confirmation before every destination.',rightsConfirmed:true,idempotencyKey:'preview-automatic'},'preview-fixture');
  await server.distribution.createPlan(server.f.actors.admin,release.id,{target:'hackernoon',connectionId:'org-hackernoon',action:'create',format:'full',rightsConfirmed:true,idempotencyKey:'preview-plan',notBeforeAt:new Date(Date.now()+86_400_000).toISOString()},'preview-fixture');
  process.stdout.write(`Isolated acceptance only; no real Nyx identity or external publishing.\n${server.url}/__acceptance/session/admin\n${server.url}/__acceptance/session/member\n`);
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
    const evidence=evidenceDirectory('m1');await mkdir(evidence,{recursive:true});
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:new URL('content.png',evidence).pathname,fullPage:true});
    await page.getByRole('link',{name:'A calmer place to publish',exact:true}).click();await page.locator('#article-title').waitFor();
    // Follow the actual peer, then verify the Chinese article loads from the API.
    const peer=page.locator(`a[href="#/article/${server.chinese.id}"]`).first();await peer.click();
    await page.waitForFunction(()=>document.querySelector<HTMLInputElement>('#article-title')?.value==='让内容发布更清晰');
    await page.locator(`a[href="#/article/${server.english.id}"]`).first().click();
    await page.waitForFunction(()=>document.querySelector<HTMLInputElement>('#article-title')?.value==='A calmer place to publish');
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:new URL('editor.png',evidence).pathname,fullPage:true});
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
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:new URL('conflict.png',evidence).pathname,fullPage:true});
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
  test('WP04 real API browser: connection intent survives refresh and binds only the selected organization account',async t=>{
    const server=await acceptanceServer();t.after(()=>server.close());
    const browser=await chromium.launch({executablePath:await new BrowserRenderProof().executable(),headless:true});t.after(()=>browser.close());
    const context=await browser.newContext({viewport:{width:1440,height:1024}}),page=await context.newPage();
    await page.goto(`${server.url}/__acceptance/session/admin`);await page.locator('#workspace').selectOption('org');
    await page.goto(`${server.url}/studio#/connections`);await page.locator('#connections-target').selectOption('dev');
    await page.locator('[data-action="connection-create"]').click();await page.locator('.studio-attempt').waitFor();
    const attempt=server.f.store.get('SELECT * FROM connection_attempts WHERE owner_id=?','org')!;
    assert.ok(attempt);assert.equal(attempt.status,'binding_required');assert.equal(attempt.flow,'operator');
    await page.reload();await page.locator('.studio-attempt').waitFor();assert.match(await page.locator('.studio-attempt').innerText(),new RegExp(attempt.id));
    await page.locator('#connections-connection').selectOption('org-dev');
    await page.locator('[data-action="connection-recheck"]').click();
    await page.waitForFunction(()=>document.querySelector('.studio-attempt .badge')?.textContent==='Exact binding verified');
    assert.equal(server.f.store.get('SELECT connection_id FROM connection_attempts WHERE id=?',attempt.id)!.connection_id,'org-dev');
    assert.equal(server.f.store.get('SELECT count(*) n FROM connection_attempts')!.n,1,'choosing the binding retains the existing attempt');
    assert.equal(server.f.store.get('SELECT count(*) n FROM jobs')!.n,0);
    const storage=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}));assert.doesNotMatch(storage,/connectUrl|managementUrl|token=|fixture-only/);
    const evidence=evidenceDirectory('wp04');await mkdir(evidence,{recursive:true});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:new URL('connections.png',evidence).pathname,fullPage:true});
  });
  test('WP05 real API browser: manual notes and deferred human confirmation persist without outbound work',async t=>{
    const server=await acceptanceServer();t.after(()=>server.close());const release=await server.publish(server.english);
    const browser=await chromium.launch({executablePath:await new BrowserRenderProof().executable(),headless:true});t.after(()=>browser.close());
    const context=await browser.newContext({viewport:{width:1440,height:1024}}),page=await context.newPage();
    page.on('dialog',dialog=>dialog.accept());
    await page.goto(`${server.url}/__acceptance/session/publisher`);await page.locator('#workspace').selectOption('org');
    await page.goto(`${server.url}/studio#/distribution/${server.english.id}`);
    await page.locator('#distribution-target').selectOption('medium');await page.locator('#distribution-connection').selectOption('org-medium');
    await page.locator('#distribution-format').selectOption('excerpt');await page.locator('#distribution-excerpt').fill('A private, confirmed excerpt for this exact copy.');
    const evidence=evidenceDirectory('wp05');await mkdir(evidence,{recursive:true});
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:new URL('distribution.png',evidence).pathname,fullPage:true});
    await page.locator('#distribution-rights').check();await page.locator('[data-action="dist-confirm"]').click();
    await page.waitForURL(url=>url.hash.startsWith('#/task/delivery/'));await page.locator('#delivery-report-state').waitFor();
    const manualId=new URL(page.url()).hash.split('/').at(-1)!;
    assert.equal(server.f.store.get('SELECT state FROM deliveries WHERE id=?',manualId)!.state,'manual_action_needed');
    await page.locator('#delivery-report-state').selectOption('submitted');await page.locator('#delivery-report-note').fill('Submitted via the editorial workflow.');
    await page.locator('[data-action="delivery-report"]').click();await page.waitForFunction(()=>document.querySelector('.page-heading .badge')?.textContent==='Submitted');
    assert.equal(server.f.store.get('SELECT state FROM deliveries WHERE id=?',manualId)!.state,'submitted');
    assert.equal(server.f.store.get('SELECT note FROM delivery_notes WHERE delivery_id=?',manualId)!.note,'Submitted via the editorial workflow.');
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:new URL('manual-followup.png',evidence).pathname,fullPage:true});
    const mobile=await context.newPage();await mobile.setViewportSize({width:390,height:844});
    await mobile.goto(`${server.url}/studio`);await mobile.locator('#workspace').selectOption('org');
    await mobile.goto(`${server.url}/studio#/distribution/${server.english.id}`);await mobile.locator('#distribution-target').selectOption('medium');
    await mobile.locator('#distribution-connection').selectOption('org-medium');
    assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await mobile.screenshot({path:new URL('distribution-mobile.png',evidence).pathname,fullPage:true});await mobile.close();
    const jobsBefore=server.f.store.get('SELECT count(*) n FROM jobs')!.n;
    await page.goto(`${server.url}/studio#/distribution/${server.english.id}`);
    await page.locator('#distribution-target').selectOption('hackernoon');await page.locator('#distribution-connection').selectOption('org-hackernoon');
    await page.locator('#distribution-format').selectOption('full');
    await page.locator('.studio-plan-create summary').click();
    await page.locator('#distribution-not-before').fill(new Date(Date.now()+3*86_400_000).toISOString().slice(0,16));await page.locator('#distribution-rights').check();
    await page.locator('[data-action="dist-plan"]').click();await page.waitForURL(url=>url.hash.startsWith('#/task/plan/'));
    const planId=new URL(page.url()).hash.split('/').at(-1)!;await page.locator('.page-heading').waitFor();
    assert.equal(server.f.store.get('SELECT state FROM distribution_plans WHERE id=?',planId)!.state,'scheduled');
    assert.equal(server.f.store.get('SELECT count(*) n FROM jobs')!.n,jobsBefore);
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:new URL('scheduled-plan.png',evidence).pathname,fullPage:true});
    server.f.store.run('UPDATE distribution_plans SET not_before_at=? WHERE id=?',new Date(Date.now()-1000).toISOString(),planId);
    await page.reload();await page.locator('#plan-rights').check();await page.locator('[data-action="plan-confirm"]').click();
    await page.waitForURL(url=>url.hash.startsWith('#/task/delivery/'));await page.locator('#delivery-report-state').waitFor();
    const plan=server.f.store.get('SELECT * FROM distribution_plans WHERE id=?',planId)!;
    assert.equal(plan.state,'confirmed');assert.equal(new URL(page.url()).hash.split('/').at(-1),plan.delivery_id);
    assert.equal(server.f.store.get('SELECT count(*) n FROM jobs')!.n,jobsBefore,'manual confirmation never fabricates a provider job');
    // Historical follow-up remains a separate append-only action after the source changes.
    server.f.store.run("UPDATE releases SET state='superseded' WHERE id=?",release.id);
    await page.goto(`${server.url}/studio#/task/delivery/${manualId}`);await page.locator('#delivery-note').fill('Historical copy needs review after source update.');
    await page.locator('[data-action="delivery-note"]').click();
    await page.getByText('Historical copy needs review after source update.',{exact:true}).waitFor();
    assert.equal(server.f.store.get('SELECT state FROM releases WHERE id=?',release.id)!.state,'superseded');
    assert.equal(server.f.store.get('SELECT state FROM deliveries WHERE id=?',manualId)!.state,'submitted');
    assert.equal(server.f.store.get('SELECT count(*) n FROM delivery_notes WHERE delivery_id=?',manualId)!.n,2);
    await page.reload();await page.getByText('Historical copy needs review after source update.',{exact:true}).waitFor();
  });
  test('WP04 real API browser: exact approval attachment alone queues the frozen organization copy',async t=>{
    const server=await acceptanceServer();t.after(()=>server.close());await server.publish(server.english);
    const browser=await chromium.launch({executablePath:await new BrowserRenderProof().executable(),headless:true});t.after(()=>browser.close());
    const context=await browser.newContext({viewport:{width:1440,height:1024}}),page=await context.newPage();
    page.on('dialog',dialog=>dialog.accept());
    await page.goto(`${server.url}/__acceptance/session/admin`);await page.locator('#workspace').selectOption('org');
    await page.goto(`${server.url}/studio#/distribution/${server.english.id}`);await page.locator('#distribution-target').selectOption('dev');
    await page.locator('#distribution-connection').selectOption('org-dev');await page.locator('#distribution-rights').check();
    await page.locator('[data-action="dist-confirm"]').click();await page.waitForURL(url=>url.hash.startsWith('#/task/delivery/'));
    const id=new URL(page.url()).hash.split('/').at(-1)!;await page.locator('[data-action="delivery-request-approval"]').click();
    await page.waitForFunction(()=>Boolean(document.querySelector<HTMLInputElement>('#approval-reference')?.value));
    const reference=await page.locator('#approval-reference').inputValue();assert.equal(server.f.store.get('SELECT approval_ref FROM deliveries WHERE id=?',id)!.approval_ref,reference);
    assert.equal(server.f.store.get("SELECT count(*) n FROM jobs WHERE kind='delivery' AND resource_id=?",id)!.n,0);
    server.acceptApproval(reference);await page.locator('#approval-rights').check();await page.locator('[data-action="delivery-authorize"]').click();
    await page.waitForFunction(()=>document.querySelector('.page-heading .badge')?.textContent==='Queued');
    assert.equal(server.f.store.get('SELECT state FROM deliveries WHERE id=?',id)!.state,'queued');
    assert.equal(server.f.store.get("SELECT count(*) n FROM jobs WHERE kind='delivery' AND resource_id=? AND state='queued'",id)!.n,1);
    const evidence=evidenceDirectory('wp04');await mkdir(evidence,{recursive:true});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:new URL('approved-copy.png',evidence).pathname,fullPage:true});
  });
  test('WP08 real API browser: legacy and Studio share immutable revisions and permit UI-only rollback',async t=>{
    const server=await acceptanceServer();t.after(()=>server.close());
    const browser=await chromium.launch({executablePath:await new BrowserRenderProof().executable(),headless:true});t.after(()=>browser.close());
    const context=await browser.newContext(),page=await context.newPage();
    await page.goto(`${server.url}/__acceptance/session/member`);await page.goto(server.url);
    await page.locator('#owner').selectOption('org');await page.locator('#title').fill('Legacy and Studio share this draft');
    await page.locator('#markdown').fill('# Original from legacy\n\nThe same revision store.');await page.locator('#save').click();
    await page.waitForFunction(()=>document.querySelector('#notice')?.textContent==='已保存新版本。');
    const first=server.f.store.get('SELECT a.id,a.current_revision FROM articles a JOIN revisions r ON r.id=a.current_revision WHERE r.title=?','Legacy and Studio share this draft')!;
    const before=server.f.store.all('SELECT version FROM migrations ORDER BY version');
    await page.goto(`${server.url}/studio`);await page.locator('#workspace').selectOption('org');
    await page.getByRole('link',{name:'Legacy and Studio share this draft',exact:true}).click();await page.locator('#article-title').waitFor();
    await page.locator('#article-title').fill('Saved in Studio, read in legacy');await page.locator('[data-action="save"]').click();
    await page.waitForFunction(()=>document.querySelector('.editor-state')?.textContent?.includes('Saved'));
    const after=await server.f.content.get(server.f.actors.member,first.id);assert.notEqual(after.revision.id,first.current_revision);
    await page.goto(server.url);await page.locator('#owner').selectOption('org');
    await page.getByRole('button',{name:'EN · Saved in Studio, read in legacy',exact:true}).click();
    assert.equal(await page.locator('#title').inputValue(),after.revision.title);assert.equal(await page.locator('#markdown').inputValue(),after.revision.markdown);
    assert.deepEqual(server.f.store.all('SELECT version FROM migrations ORDER BY version'),before,'switching entry points never rewinds the schema');
    assert.equal(server.f.store.get('SELECT count(*) n FROM revisions WHERE article_id=?',first.id)!.n,2,'both immutable revisions survive UI rollback');
    assert.equal(server.f.store.get('SELECT count(*) n FROM jobs')!.n,0,'UI-only rollback creates no remote work');
  });
  test('WP06 real API browser: current membership, grant/revoke, unavailable counters and read-only settings',async t=>{
    const server=await acceptanceServer();t.after(()=>server.close());
    const browser=await chromium.launch({executablePath:await new BrowserRenderProof().executable(),headless:true});t.after(()=>browser.close());
    const context=await browser.newContext({viewport:{width:1440,height:1024}}),page=await context.newPage();
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    const evidence=evidenceDirectory('wp06');await mkdir(evidence,{recursive:true});
    await page.goto(`${server.url}/__acceptance/session/admin`);await page.locator('#workspace').selectOption('org');
    await page.goto(`${server.url}/studio#/members`);await page.locator('.studio-member-directory').waitFor();
    await page.locator('[data-action="member-select"][data-identity="member"][data-enabled="true"]').click();
    assert.equal(server.f.store.get('SELECT 1 FROM publishers WHERE owner_id=? AND subject=?','org','member'),undefined,'selection alone does not grant authority');
    await page.locator('[data-action="member-confirm"]').click();
    await page.locator('[data-action="member-select"][data-identity="member"][data-enabled="false"]').waitFor();
    assert.ok(server.f.store.get('SELECT 1 FROM publishers WHERE owner_id=? AND subject=?','org','member'));
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:new URL('members.png',evidence).pathname,fullPage:true});
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
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:new URL('analytics.png',evidence).pathname,fullPage:true});
    await page.goto(`${server.url}/studio#/settings`);await page.locator('#settings-locale').waitFor();
    assert.equal(await page.locator('.studio-settings-layout input').count(),0,'unsupported workspace settings have no false editable inputs');
    assert.match(await page.locator('.studio-settings-layout').innerText(),/https:\/\/en.example.invalid/);
    assert.match(await page.locator('.studio-settings-layout').innerText(),/https:\/\/zh.example.invalid/);
    await page.locator('#settings-locale').selectOption('zh');await page.locator('h1').filter({hasText:'站点与工作区'}).waitFor();
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:new URL('settings-zh.png',evidence).pathname,fullPage:true});
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
    const evidence=evidenceDirectory('wp03');await mkdir(evidence,{recursive:true});
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:new URL('publication-review.png',evidence).pathname,fullPage:true});
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
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:new URL('queued-task.png',evidence).pathname,fullPage:true});
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
