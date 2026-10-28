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
