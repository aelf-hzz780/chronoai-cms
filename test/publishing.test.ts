import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.ts';
import { Vault } from '../src/vault.ts';
import { PublishingService, ReleaseWorker } from '../src/publishing.ts';

test('A15/A20/A24: confirmation freezes revision; dequeue rechecks current authority', async t => {
  const f = fixture(); t.after(() => f.store.close());
  const vault = new Vault('ab'.repeat(32)), service = new PublishingService(f.content, vault);
  f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)', 'org-en', 'org', 'en', 'http://localhost:3999', 'GHOST_KEY');
  const article = await f.content.create(f.actors.admin, { ownerId: 'org', language: 'en', title: 'Frozen', markdown: 'confirmed', creditedAuthor: 'Admin' }, 'trace');
  const request = { revisionId: article.revision.id, ownerId: 'org', creditedAuthor: 'Admin', action: 'publish', rightsConfirmed: true, idempotencyKey: 'request-one' };
  const release = await service.confirm(f.actors.admin, article.id, request, 'trace');
  assert.equal((await service.confirm(f.actors.admin, article.id, request, 'trace')).id, release.id);
  await f.content.edit(f.actors.admin, article.id, article.revision.id, { markdown: 'later draft' }, 'trace');
  let publishedSource = '';
  const worker = new ReleaseWorker(service, { async publish(input) { publishedSource = input.markdown; return { remoteId: 'remote', url: 'http://localhost:3999/frozen/' }; }, async verify() { return true; }, async reconcile() { return null; }, async unpublish() {} });
  await worker.once(); assert.equal(publishedSource, 'confirmed');
  assert.equal(f.store.get('SELECT state FROM releases WHERE id=?', release.id)?.state, 'published');
  await assert.rejects(service.confirm(f.actors.admin, article.id, { ...request, revisionId: 'other' }, 'trace'), { code: 'CONFLICT' });
  const current = await f.content.get(f.actors.admin, article.id);
  const next = await service.confirm(f.actors.admin, article.id, { ...request, revisionId: current.revision.id, action: 'update', idempotencyKey: 'request-two' }, 'trace');
  f.memberships.delete('admin:org');
  await worker.once(); assert.equal(f.store.get('SELECT state FROM releases WHERE id=?', next.id)?.state, 'blocked');
  assert.equal(publishedSource, 'confirmed');
});

test('A25/A36/A38: failed public verification blocks completion; uncertain writes reconcile and never blindly retry', async t => {
  const f = fixture(); t.after(() => f.store.close());
  const service = new PublishingService(f.content, new Vault('ab'.repeat(32)));
  f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)', 'solo-en', 'solo', 'en', 'http://localhost:3999', 'GHOST_KEY');
  const article = await f.content.create(f.actors.solo, { ownerId: 'solo', language: 'en', title: 'Post', markdown: 'x', creditedAuthor: 'Solo' }, 'trace');
  const input = { revisionId: article.revision.id, ownerId: 'solo', creditedAuthor: 'Solo', action: 'publish', rightsConfirmed: true, idempotencyKey: 'request' };
  const release = await service.confirm(f.actors.solo, article.id, input, 'trace');
  let writes = 0;
  const adapter = { async publish() { writes++; return { remoteId: 'remote', url: 'http://localhost:3999/post/' }; }, async verify() { return false; }, async reconcile() { return null; }, async unpublish() {} };
  const worker = new ReleaseWorker(service, adapter);
  await worker.once(); assert.equal(writes, 1); assert.equal(f.store.get('SELECT state FROM releases WHERE id=?', release.id)?.state, 'verifying');
  await worker.once(); assert.equal(writes, 1);
  await service.reconcile(f.actors.solo, release.id, 'trace'); await worker.once(); assert.equal(writes, 1);
  assert.equal(f.store.get('SELECT state FROM releases WHERE id=?', release.id)?.state, 'uncertain');
  await assert.rejects(service.cancel(f.actors.solo, release.id, 'trace'), { code: 'ALREADY_SENT' });
});
