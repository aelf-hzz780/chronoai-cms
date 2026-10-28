import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.ts';

test('A10/A11/A13/A14: personal and organization ownership never follows byline or request owner', async t => {
  const f = fixture(); t.after(() => f.store.close());
  const personal = await f.content.create(f.actors.member, { ownerId: 'member', language: 'en', title: 'Personal', markdown: '# private\r\n', creditedAuthor: 'Someone else' }, 'trace');
  await assert.rejects(f.content.get(f.actors.admin, personal.id), { code: 'FORBIDDEN' });
  await assert.rejects(f.content.create(f.actors.outsider, { ownerId: 'org', language: 'en', title: 'Forged', markdown: 'x', creditedAuthor: 'Admin' }, 'trace'), { code: 'FORBIDDEN' });
  const draft = await f.content.create(f.actors.member, { ownerId: 'org', language: 'zh', title: '组织', markdown: '# 草稿', creditedAuthor: 'Member' }, 'trace');
  await assert.rejects(f.policy.publish(f.actors.member, 'org'), { code: 'FORBIDDEN' });
  await assert.rejects(f.content.get(f.actors.admin, draft.id), { code: 'FORBIDDEN' });
  await f.content.submit(f.actors.member, draft.id, draft.revision.id, 'trace');
  assert.equal((await f.content.get(f.actors.admin, draft.id)).revision.id, draft.revision.id);
});

test('A17/A18/A20: byte preservation, immutable revisions, optimistic concurrency and frozen submissions', async t => {
  const f = fixture(); t.after(() => f.store.close());
  const source = '\ufeff# 标题\r\n\r\n| a | b |\r\n|---|---|\r\n| 1 | 2 |\r\n```ts\r\nconst x = 1\r\n```\r\n';
  const article = await f.content.create(f.actors.member, { ownerId: 'org', language: 'zh', title: '版本', markdown: source, creditedAuthor: 'Member' }, 'trace');
  await f.content.submit(f.actors.member, article.id, article.revision.id, 'trace');
  const edited = await f.content.edit(f.actors.member, article.id, article.revision.id, { markdown: '新草稿' }, 'trace');
  assert.equal((await f.content.get(f.actors.admin, article.id)).revision.id, article.revision.id);
  assert.equal((await f.content.markdown(f.actors.admin, article.id, article.revision.id)).toString('utf8'), source);
  await assert.rejects(f.content.markdown(f.actors.admin, article.id, edited.revision.id), { code: 'FORBIDDEN' });
  await assert.rejects(f.content.edit(f.actors.member, article.id, article.revision.id, { markdown: 'lost update' }, 'trace'), { code: 'CONFLICT' });
  assert.throws(() => f.store.db.prepare('UPDATE revisions SET markdown = ? WHERE id = ?').run('mutated', article.revision.id), /immutable/);
});

test('A12/A15/A16: only current Admin manages publishing roles; leaving revokes organization access', async t => {
  const f = fixture(); t.after(() => f.store.close());
  await assert.rejects(f.policy.setPublisher(f.actors.member, 'org', f.actors.member.subject, true, 'trace'), { code: 'FORBIDDEN' });
  await f.policy.setPublisher(f.actors.admin, 'org', f.actors.publisher.subject, true, 'trace');
  await f.policy.publish(f.actors.publisher, 'org');
  await f.policy.setPublisher(f.actors.admin, 'org', f.actors.publisher.subject, false, 'trace');
  await assert.rejects(f.policy.publish(f.actors.publisher, 'org'), { code: 'FORBIDDEN' });
  const draft = await f.content.create(f.actors.member, { ownerId: 'org', language: 'en', title: 'Owned by org', markdown: 'x', creditedAuthor: 'Member' }, 'trace');
  f.memberships.delete('member:org');
  await assert.rejects(f.content.get(f.actors.member, draft.id), { code: 'FORBIDDEN' });
  await f.content.create(f.actors.member, { ownerId: 'member', language: 'en', title: 'Still mine', markdown: 'x', creditedAuthor: 'Member' }, 'trace');
});

test('A09: a valid identity with restricted delegated scope cannot write', async t => {
  const f = fixture(); t.after(() => f.store.close());
  await assert.rejects(f.content.create({ ...f.actors.solo, scopes: ['content:read'] }, { ownerId: 'solo', language: 'en', title: 'No', markdown: 'x', creditedAuthor: 'Solo' }, 'trace'), { code: 'INSUFFICIENT_SCOPE' });
});
