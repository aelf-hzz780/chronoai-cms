import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture } from './helpers.ts';
import { Vault } from '../src/vault.ts';
import { PublishingService, ReleaseWorker, type OriginalAdapter } from '../src/publishing.ts';
import { GhostAdapter } from '../src/ghost.ts';
import { RemoteError } from '../src/http-client.ts';
import { createApp } from '../src/app.ts';
import { provesBody } from '../src/html-proof.ts';

async function setup(owner = 'solo') {
  const f = fixture(), actor = owner === 'solo' ? f.actors.solo : f.actors.admin;
  const service = new PublishingService(f.content, new Vault('ab'.repeat(32)));
  f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)', 'site', owner, 'en', 'http://localhost:3999', 'KEY');
  f.store.run('INSERT INTO author_mappings VALUES (?,?,?)', 'site', actor.subject, 'ghost-author');
  const article = await f.content.create(actor, { ownerId: owner, language: 'en', title: 'Confirmed title', markdown: 'THE ONLY CONFIRMED BODY', creditedAuthor: actor.subject }, 'trace');
  const input = { ownerId: owner, revisionId: article.revision.id, creditedAuthor: actor.subject, action: 'publish', rightsConfirmed: true, idempotencyKey: 'one' };
  const release = await service.confirm(actor, article.id, input, 'trace');
  return { ...f, service, actor, article, input, release };
}
const result = { remoteId: 'remote', url: 'http://localhost:3999/post/' };
function adapter(overrides: Partial<OriginalAdapter> = {}): OriginalAdapter { return { async publish() { return result; }, async verify() { return true; }, async reconcile() { return result; }, async unpublish() {}, ...overrides }; }
function deferred<T>() { let resolve!: (value:T)=>void, reject!: (error:Error)=>void; const promise = new Promise<T>((yes,no) => { resolve=yes; reject=no; }); return {promise,resolve,reject}; }

test('R002: controlled DOM proof accepts equivalent markup and preserves code whitespace', () => {
  const html = '<div data-chrono-revision="proof"><p>Confirmed &amp; original.</p><pre><code>  indented\n</code></pre></div>';
  assert.equal(provesBody(html,`<!-- Ghost card -->${html}`,`<html><body>${html}</body></html>`,'proof'),true);
  assert.equal(provesBody(html,html,`<body>${html.replace('  indented','indented')}</body>`,'proof'),false);
  assert.equal(provesBody(html,html,`<body>${html}${html}</body>`,'proof'),false);
});

test('R002: official Ghost outbound ref tagging permits only the exact confirmed destination', () => {
  const html='<div data-chrono-revision="proof"><a href="https://example.com/path?a=/x#part">Source</a></div>';
  const tagged=html.replace('?a=/x#part','?a=/x&amp;ref=blog.example#part');
  assert.equal(provesBody(html,html,tagged,'proof','https://www.blog.example'),true);
  for(const corrupted of [tagged.replace('blog.example','other.example'),tagged.replace('example.com/path','evil.example/path'),tagged.replace('/x&amp;','/y&amp;'),tagged.replace('Source','Altered')]) assert.equal(provesBody(html,html,corrupted,'proof','https://www.blog.example'),false);
  assert.equal(provesBody(html,tagged,tagged,'proof','https://www.blog.example'),false);
});

for (const late of ['success','false','exception']) test(`R001: expired worker ${late} cannot supersede a newer release`, async t => {
  const f = await setup(); t.after(() => f.store.close());
  const started = deferred<void>(), old = deferred<boolean>();
  const stale = new ReleaseWorker(f.service, adapter({ async verify() { started.resolve(); return old.promise; } }));
  const running = stale.once(); await started.promise;
  f.store.run("UPDATE jobs SET lease_until='2000-01-01T00:00:00.000Z' WHERE resource_id=?", f.release.id);
  const replacement = new ReleaseWorker(f.service, adapter()); await replacement.once();
  const edited = await f.content.edit(f.actor, f.article.id, f.article.revision.id, { markdown: 'NEW CONFIRMED BODY' }, 'trace');
  const next = await f.service.confirm(f.actor, f.article.id, { ...f.input, revisionId: edited.revision.id, action: 'update', idempotencyKey: 'two' }, 'trace');
  await replacement.once();
  if (late === 'exception') old.reject(new RemoteError('REMOTE_FAILURE','late read failed')); else old.resolve(late === 'success');
  await running;
  assert.equal(f.store.get('SELECT state FROM releases WHERE id=?', f.release.id)?.state, 'superseded');
  assert.equal(f.store.get('SELECT state FROM releases WHERE id=?', next.id)?.state, 'published');
});

test('R001: stale finally cannot complete a job while a replacement lease is running', async t => {
  const f = await setup(); t.after(() => f.store.close());
  const started = deferred<void>(), old = deferred<boolean>(), replacing = deferred<void>(), recovered = deferred<typeof result>();
  const first = new ReleaseWorker(f.service, adapter({ async verify() { started.resolve(); return old.promise; } })).once(); await started.promise;
  f.store.run("UPDATE jobs SET lease_until='2000-01-01T00:00:00.000Z' WHERE resource_id=?", f.release.id);
  const second = new ReleaseWorker(f.service, adapter({ async reconcile() { replacing.resolve(); return recovered.promise; } })).once(); await replacing.promise;
  old.resolve(true); await first;
  assert.equal(f.store.get('SELECT state FROM jobs WHERE resource_id=?', f.release.id)?.state, 'running');
  recovered.resolve(result); await second;
});

for (const corruption of ['admin','public']) test(`R002: altered ${corruption} body with valid marker never verifies or exposes media`, async t => {
  const f = await setup(); const directory = await mkdtemp(join(tmpdir(), 'chrono-review-'));
  t.after(async () => { f.store.close(); await rm(directory,{recursive:true,force:true}); });
  const ghost = new GhostAdapter(f.store, directory, true);
  const input = f.service.input(f.store.get('SELECT * FROM releases WHERE id=?', f.release.id)!);
  const correct = `<div data-chrono-revision="${ghost.marker(input)}"><p>THE ONLY CONFIRMED BODY</p>\n</div>`;
  const wrong = `<div data-chrono-revision="${ghost.marker(input)}">UNAPPROVED REPLACEMENT</div>`;
  ghost.current = async () => ({ id: 'remote', title:input.title,status: 'published', html: corruption === 'admin' ? wrong : correct, authors: [{ id: 'ghost-author', name: 'solo' }] });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(`<html lang="en"><h1>Confirmed title</h1><p>solo</p>${ghost.publisherHtml(input)}${corruption === 'public' ? wrong : correct}</html>`);
  t.after(() => { globalThis.fetch = originalFetch; });
  assert.equal(await ghost.verify(input,result), false);
  assert.deepEqual(await readdir(directory), []);
});

for (const action of ['publish','unpublish']) test(`R003: ${action} write followed by failed GET remains recoverable without another write`, async t => {
  const f = await setup(); t.after(() => f.store.close()); let writes = 0, readsFail = true;
  const worker = new ReleaseWorker(f.service, adapter({ async publish() { writes++; return result; }, async unpublish() { writes++; }, async verify() { if (readsFail) throw new RemoteError('REMOTE_FAILURE','read outage'); return true; } }));
  let release = f.release;
  if (action === 'unpublish') { readsFail = false; await worker.once(); release = await f.service.confirm(f.actor, f.article.id, { ...f.input, action, idempotencyKey: 'remove' }, 'trace'); readsFail = true; }
  await worker.once(); const writesBefore = writes;
  assert.ok(['verifying','uncertain'].includes(f.store.get('SELECT state FROM releases WHERE id=?',release.id)?.state));
  readsFail = false; await f.service.reconcile(f.actor,release.id,'recovery-trace'); await worker.once();
  assert.equal(writes,writesBefore);
  assert.equal(f.store.get('SELECT state FROM releases WHERE id=?',release.id)?.state,action === 'unpublish' ? 'unpublished' : 'published');
});

test('R004: current Admin recovers a departed publisher result, preserving the original confirmation actor', async t => {
  const f = await setup('org'); t.after(() => f.store.close()); let reconciliations = 0, writes = 0;
  const worker = new ReleaseWorker(f.service, adapter({ async publish() { writes++; throw new RemoteError('REMOTE_UNCERTAIN','lost response',true); }, async reconcile() { reconciliations++; return result; } }));
  await worker.once(); f.memberships.delete('admin:org'); f.memberships.set('outsider:org','admin');
  await f.service.reconcile(f.actors.outsider,f.release.id,'new-admin-trace'); await worker.once();
  assert.equal(reconciliations,1); assert.equal(writes,1);
  assert.equal(f.store.get('SELECT state FROM releases WHERE id=?',f.release.id)?.state,'published');
  assert.equal(f.service.vault.open<any>(f.store.get('SELECT actor_json FROM releases WHERE id=?',f.release.id)!.actor_json).subject,'admin');
});

test('R005: both routes paginate matched authorized revisions, never unseen working drafts', async t => {
  const f=fixture(); const app=await createApp({...f,vault:new Vault('ab'.repeat(32)),publicUrl:'https://cms.example',authenticate:async()=>f.actors.admin});
  t.after(async()=>{await app.close();f.store.close();});
  const first=await f.content.create(f.actors.admin,{ownerId:'org',language:'en',title:'unique-old-needle',markdown:'old match',creditedAuthor:'Admin'},'trace');
  for(let i=0;i<3;i++) await f.content.create(f.actors.admin,{ownerId:'org',language:'en',title:`unrelated-${i}`,markdown:'nothing',creditedAuthor:'Admin'},'trace');
  const member=await f.content.create(f.actors.member,{ownerId:'org',language:'en',title:'Submitted title',markdown:'public-to-publishers',creditedAuthor:'Member'},'trace');
  await f.content.submit(f.actors.member,member.id,member.revision.id,'trace');
  await f.content.edit(f.actors.member,member.id,member.revision.id,{markdown:'unique-private-secret'},'trace');
  for(const entry of ['cms','service']) {
    const response=await app.inject({url:`/api/${entry}/articles?ownerId=org&q=unique-old-needle&limit=2&offset=0`});
    assert.deepEqual(response.json().map((a:any)=>a.id),[first.id]);
    assert.deepEqual((await app.inject({url:`/api/${entry}/articles?ownerId=org&q=unique-private-secret&limit=2&offset=0`})).json(),[]);
  }
});
test('HTTPS public sites use only explicitly provisioned loopback HTTP Admin routes',async t=>{
  const f=await setup();t.after(()=>f.store.close());f.store.run("UPDATE sites SET url='https://public.example' WHERE id='site'");
  f.store.run("INSERT INTO site_admin_routes VALUES ('site','http://127.0.0.1:2578')");
  const urls:string[]=[];t.mock.method(globalThis,'fetch',async(url:any)=>{urls.push(String(url));return Response.json({posts:[]});});
  const ghost=new GhostAdapter(f.store,'/unused',false,{KEY:`aa:${'ab'.repeat(32)}`});
  const input=f.service.input(f.store.get('SELECT * FROM releases WHERE id=?',f.release.id)!);
  await ghost.current(input);assert.ok(urls[0].startsWith('http://127.0.0.1:2578/ghost/api/admin/'));
  f.store.run("UPDATE site_admin_routes SET base_url='http://remote.example'");
  await assert.rejects(ghost.current(input),{code:'CONFIGURATION'});assert.equal(urls.length,1);
});
test('R002: inert/hidden wrappers, image source selection and inline word separators cannot prove a visible original',()=>{
  const html='<div data-chrono-revision="proof"><p><strong>Hello</strong> <em>world</em></p><img src="https://site.example/a.png"></div>';
  assert.equal(provesBody(html,html,`<main>${html}</main>`,'proof'),true);
  for(const page of [`<template>${html}</template><p>Unapproved</p>`,`<main hidden>${html}</main>`,`<main style="display:none">${html}</main>`,html.replace('src="https://site.example/a.png"','src="https://site.example/a.png" srcset="https://evil.example/b.png 2x"'),html.replace('</strong> <em>','</strong><em>')])assert.equal(provesBody(html,html,page,'proof'),false,page);
});
test('R002: template-only and changed srcset fail Ghost verification before any public image is materialized',async t=>{
  const f=await setup(),directory=await mkdtemp(join(tmpdir(),'chrono-visible-proof-'));t.after(async()=>{f.store.close();await rm(directory,{recursive:true,force:true});});
  const {MediaService}=await import('../src/media.ts');const asset=await new MediaService(f.content).upload(f.actor,f.article.id,'image/png',Buffer.from('89504e470d0a1a0a','hex').toString('base64'),'trace');
  const article=await f.content.edit(f.actor,f.article.id,f.article.revision.id,{markdown:`**Hello** *world*\n\n${asset.markdown}`},'trace');
  await f.service.cancel(f.actor,f.release.id,'trace');
  const release=await f.service.confirm(f.actor,f.article.id,{...f.input,revisionId:article.revision.id,idempotencyKey:'image-proof'},'trace');
  const ghost=new GhostAdapter(f.store,directory,true),input=f.service.input(release),html=ghost.controlledHtml(input);
  ghost.current=async()=>({id:result.remoteId,title:input.title,status:'published',html,authors:[{id:'ghost-author'}]});
  for(const body of [`<template>${html}</template>`,html.replace('<img ','<img srcset="https://evil.example/image.png 2x" ')]){
    t.mock.method(globalThis,'fetch',async()=>new Response(`<html lang="en"><h1>${input.title}</h1>${ghost.publisherHtml(input)}${body}</html>`));assert.equal(await ghost.verify(input,result),false);
    assert.deepEqual(await readdir(directory),[]);assert.equal(f.store.get('SELECT count(*) AS n FROM asset_publications')!.n,0);t.mock.restoreAll();
  }
});
for(const action of ['publish','update'])for(const missing of ['id','url'])test(`R006: Ghost ${action} HTTP201 missing ${missing} reconciles without resending`,async t=>{
  const f=await setup();t.after(()=>f.store.close());const ghost=new GhostAdapter(f.store,'/unused',true,{KEY:`aa:${'ab'.repeat(32)}`});let remotePost:any=null,writes=0;
  ghost.current=async()=>remotePost;
  let release=f.release;
  if(action==='update'){
    await new ReleaseWorker(f.service,adapter()).once();remotePost={id:'remote',url:result.url,updated_at:'v1'};
    release=await f.service.confirm(f.actor,f.article.id,{...f.input,action,idempotencyKey:'update-contract'},'trace');
  }
  t.mock.method(globalThis,'fetch',async(_url:any,options:any)=>{assert.ok(['POST','PUT'].includes(String(options?.method)));writes++;const body=JSON.parse(String(options?.body));remotePost={...body.posts[0],id:'remote',url:result.url};const returned={...remotePost};delete returned[missing];return Response.json({posts:[returned]},{status:201});});
  ghost.verify=async()=>true;const worker=new ReleaseWorker(f.service,ghost);await worker.once();assert.equal(f.store.get('SELECT state FROM releases WHERE id=?',release.id)!.state,'uncertain');
  await f.service.reconcile(f.actor,release.id,'recovery');await worker.once();assert.equal(writes,1);assert.equal(f.store.get('SELECT state FROM releases WHERE id=?',release.id)!.state,'published');
});
test('R014: restored outbound pause allows an authorized original read reconciliation with zero writes',async t=>{
  const f=await setup();t.after(()=>f.store.close());f.store.run("UPDATE releases SET state='uncertain' WHERE id=?",f.release.id);f.store.run("UPDATE jobs SET state='done' WHERE resource_id=?",f.release.id);
  const {isolateRestoredPlatform}=await import('../src/recovery.ts');isolateRestoredPlatform(f.store,'restore');await f.service.reconcile(f.actor,f.release.id,'request');let reads=0;
  const worker=new ReleaseWorker(f.service,adapter({async publish(){throw Error('Must not write');},async unpublish(){throw Error('Must not write');},async reconcile(){reads++;return result;}}));assert.equal(await worker.once(),true);assert.equal(reads,1);assert.equal(f.store.get('SELECT state FROM releases WHERE id=?',f.release.id)!.state,'published');assert.equal(f.store.get("SELECT value FROM settings WHERE key='outbound_paused'")!.value,'true');
});


test('R002: browser-rendered public body rejects stylesheet concealment and zero images, preserving fractional opacity and NBSP',async t=>{
  const f=await setup(),directory=await mkdtemp(join(tmpdir(),'chrono-render-'));
  t.after(async()=>{f.store.close();await rm(directory,{recursive:true,force:true});});
  const ghost=new GhostAdapter(f.store,directory,true),input=f.service.input(f.store.get('SELECT * FROM releases WHERE id=?',f.release.id)!);
  const html=ghost.controlledHtml(input);
  ghost.current=async()=>({id:'remote',title:input.title,status:'published',html,authors:[{id:'ghost-author'}]});
  const previous=globalThis.fetch;t.after(()=>{globalThis.fetch=previous;});
  for(const [name,body,expected] of [
    ['valid',html,true],
    ['selector CSS',`<style>[data-chrono-revision]{display:none}</style>${html}`,false],
    ['ancestor CSS',`<style>.concealed{display:none}</style><section class="concealed">${html}</section>`,false],
    ['fractional opacity',`<section style="opacity:0.9">${html}</section>`,true],
    ['script replaced body',`${html}<script>document.querySelector('[data-chrono-revision] p').textContent='Altered'</script>`,false],
  ] as const){
    globalThis.fetch=async()=>new Response(`<html lang="en"><h1>${input.title}</h1>${ghost.publisherHtml(input)}${body}</html>`);
    assert.equal(await ghost.verify(input,result),expected,name);
  }
  const nbsp='<div data-chrono-revision="proof"><p>100\u00a0kg</p></div>';
  assert.equal(provesBody(nbsp,nbsp,nbsp.replace('\u00a0',' '),'proof'),false);
  const image='<div data-chrono-revision="proof"><img src="https://example.com/image.png" alt="image"></div>';
  assert.equal(provesBody(image,image,image.replace('<img ','<img width="0" height="0" '),'proof'),false);
});

test('R002: rendered image proof requires visible geometry and rejects clipping or offscreen placement',async()=>{
  const {BrowserRenderProof}=await import('../src/render-proof.ts'),renderer=new BrowserRenderProof();
  const image='<div data-chrono-revision="proof"><p>Body</p><img width="80" height="40" alt="Confirmed image"></div>';
  assert.equal(await renderer.verify('http://localhost:3999/post/',image,'proof'),true);
  for(const css of ['img{position:fixed;left:-10000px}','[data-chrono-revision]{clip-path:inset(100%)}','img{width:0;height:0}'])assert.equal(await renderer.verify('http://localhost:3999/post/',`<style>${css}</style>${image}`,'proof'),false,css);
  await assert.rejects(new BrowserRenderProof({RENDER_BROWSER_EXECUTABLE:'/missing/chrono-renderer'}).verify('http://localhost:3999/post/',image,'proof'),{code:'RENDERER_REQUIRED'});
});


test('R002/R011: actual glyph pixels prove long scrolling text and reject transparency, matching background and clipped lines',async()=>{
  const {BrowserRenderProof}=await import('../src/render-proof.ts'),renderer=new BrowserRenderProof();
  const body=Array.from({length:50},(_,i)=>`Line ${i}: approved text with visible words.`).join(' ');
  const html=`<style>p{width:300px;font:18px/1.4 sans-serif}</style><article><h1>Approved title</h1><p>${body}</p></article>`;
  assert.equal(await renderer.verify('http://localhost:3999/post/',html),true,'All lines can be read by scrolling');
  for(const css of ['article,article *{color:transparent!important}','article,article *{color:white!important;background:white!important}','p{max-height:1.4em;overflow:hidden}','p{-webkit-line-clamp:1;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden}'])assert.equal(await renderer.verify('http://localhost:3999/post/',`<style>${css}</style>${html}`),false,css);
});
