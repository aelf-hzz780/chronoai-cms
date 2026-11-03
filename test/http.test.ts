import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.ts';
import { fixture } from './helpers.ts';
import { Vault } from '../src/vault.ts';

for (const entry of ['cms', 'service']) {
  test(`A06/A07/A08/A09/A13/A17/A18 via ${entry}: authenticated content operations and boundary failures`, async t => {
    const f = fixture(), vault = new Vault('ab'.repeat(32));
    const app = await createApp({ store: f.store, policy: f.policy, content: f.content, vault, publicUrl: 'https://cms.example',
      authenticate: async request => { const subject = request.headers.authorization?.slice(7); if (!subject || !f.actors[subject]) return null; return f.actors[subject]; } });
    t.after(async () => { await app.close(); f.store.close(); });
    const prefix = `/api/${entry}`, headers = { authorization: 'Bearer member' };
    let response = await app.inject({ method: 'POST', url: `${prefix}/articles`, headers, payload: { ownerId: 'member', language: 'zh', title: '本人的文章', markdown: '# 原文\r\n', creditedAuthor: 'Member' } });
    assert.equal(response.statusCode, 201); const article = response.json();
    response = await app.inject({ url: `${prefix}/articles/${article.id}/markdown?revision=${article.revision.id}`, headers });
    assert.equal(response.body, '# 原文\r\n'); assert.match(response.headers['content-disposition'] as string, /attachment/);
    response = await app.inject({ url: `${prefix}/articles/${article.id}`, headers: { authorization: 'Bearer admin' } });
    assert.equal(response.statusCode, 403); assert.ok(response.json().traceId);
    response = await app.inject({ method: 'PATCH', url: `${prefix}/articles/${article.id}`, headers, payload: { expectedRevision: 'old', markdown: 'overwrite' } });
    assert.equal(response.statusCode, 409);
    response = await app.inject({ url: `${prefix}/articles?ownerId=member`, headers: { 'x-nyxid-user-id': 'member' } });
    assert.equal(response.statusCode, 401);
    response = await app.inject({ url: `${prefix}/articles?ownerId=member&limit=100000`, headers });
    assert.equal(response.statusCode, 400);
    response = await app.inject({ url: `${prefix}/articles/${article.id}`, headers });
    assert.equal(response.headers['cache-control'], 'no-store');
  });
}

test('A19/A47: preview sanitizes active content and never emits tracking', async t => {
  const f = fixture();
  const app = await createApp({ ...f, vault: new Vault('ab'.repeat(32)), publicUrl: 'https://cms.example', authenticate: async () => f.actors.solo });
  t.after(async () => { await app.close(); f.store.close(); });
  const article = await f.content.create(f.actors.solo, { ownerId: 'solo', language: 'en', title: 'XSS', markdown: '<script>alert(1)</script>\n[x](javascript:alert(1))\n![image](https://evil.example/track.png)', creditedAuthor: 'Solo' }, 'trace');
  const response = await app.inject({ url: `/api/cms/articles/${article.id}/preview` });
  assert.equal(response.statusCode, 200);
  assert.doesNotMatch(response.body, /<script|href="javascript:|<img[^>]+evil|\/track\//);
});

test('R020: BOM/CRLF imports preserve exact source bytes while private and public rendering recognize the first block',async t=>{
  const {render}=await import('../src/render.ts');
  for(const [source,tag] of [['- first\r\n','ul'],['> first\r\n','blockquote'],['```ts\r\nconst first = true;\r\n```','pre'],['| a | b |\r\n| --- | --- |\r\n| 1 | 2 |','table']])assert.ok(render(`\uFEFF${source}`).startsWith(`<${tag}>`),`BOM before first ${tag}`);
  assert.ok(render('prefix\uFEFFsuffix').includes('prefix\uFEFFsuffix'),'An interior U+FEFF is content');
  const {GhostAdapter}=await import('../src/ghost.ts');
  const f=fixture(),app=await createApp({...f,vault:new Vault('ab'.repeat(32)),publicUrl:'https://cms.example',authenticate:async()=>f.actors.member});
  t.after(async()=>{await app.close();f.store.close();});
  for(const owner of ['member','org'])for(const language of ['en','zh']){
    const heading=language==='en'?'Approved heading':'已确认标题',source=`\uFEFF# ${heading}\r\n\r\n| Key | Value |\r\n| --- | --- |\r\n| a | b |\r\n\r\n\`\`\`ts\r\nconst exact = true;\r\n\`\`\`\r\n`,bytes=Buffer.from(source);
    const imported=await app.inject({method:'POST',url:`/api/cms/articles/import?ownerId=${owner}&language=${language}&title=Original&creditedAuthor=Member`,headers:{'content-type':'text/markdown'},payload:bytes});
    assert.equal(imported.statusCode,201,imported.body);const article=imported.json();
    for(const entry of ['cms','service']){
      const download=await app.inject({url:`/api/${entry}/articles/${article.id}/markdown?revision=${article.revision.id}`});assert.deepEqual(download.rawPayload,bytes);
      const preview=await app.inject({url:`/api/${entry}/articles/${article.id}/preview`});assert.equal(preview.statusCode,200);assert.equal(preview.json().private,true);assert.match(preview.json().html,new RegExp(`^<h1>${heading}</h1>`));assert.match(preview.json().html,/<table>/);assert.match(preview.json().html,/<pre><code/);
      const html=new GhostAdapter(f.store,'/unused').controlledHtml({releaseId:'proof',articleId:article.id,revisionId:article.revision.id,ownerId:owner,language,title:'Original',markdown:source,digest:article.revision.digest,creditedAuthor:'Member',site:{url:'https://public.example'},action:'publish'});
      assert.ok(html.endsWith(`${preview.json().html}</div>`),'Public original and private preview share the same BOM-aware render');
    }
    assert.deepEqual((await f.content.get(f.actors.member,article.id)).revision.markdown,source);
  }
});
