import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers.ts';
import {Vault} from '../src/vault.ts';
import {PublishingService} from '../src/publishing.ts';
import {DistributionService, DeliveryWorker} from '../src/distribution.ts';
import {HashnodeAdapter, HASHNODE_READ_QUERIES, TargetRegistry, copyBody, type CopyPayload} from '../src/targets.ts';

const payload: CopyPayload = {
  deliveryId: 'removal', ownerKind: 'organization', title: 'Approved content', markdown: 'Body',
  sourceUrl: 'https://blog.example/post/', sourceDigest: 'digest', creditedAuthor: 'Writer', language: 'en',
  format: 'full', action: 'remove', remoteId: 'known-post', remoteUrl: 'https://publication.hashnode.dev/post',
  accountId: 'account', connectionFingerprint: 'fingerprint',
};
const connection = {accountId: 'account', publicationId: 'publication', canPublish: true, pro: true};
const post = {id: payload.remoteId, url: payload.remoteUrl, title: payload.title, canonicalUrl: payload.sourceUrl,
  publishedAt: '2026-01-01T00:00:00.000Z', author: {id: 'account'}, publication: {id: 'publication'}, content: {markdown: copyBody(payload)}};

test('Hashnode removal: a retained soft-deleted post is unproven, never a newly published copy', async () => {
  const adapter = new HashnodeAdapter('https://gql-beta.hashnode.com');
  const result = await adapter.reconcile(payload, connection, async request => {
    assert.equal(request.body!.query, HASHNODE_READ_QUERIES.post);
    assert.deepEqual(request.body!.variables, {id: 'known-post'});
    return {data: {post}};
  });
  assert.equal(result, null, 'Official removePost can leave post(id) readable; that is not publication or removal proof');
});

test('Hashnode removal: only explicit null for the known post proves absence; malformed data and permission errors do not', async () => {
  const adapter = new HashnodeAdapter('https://gql-beta.hashnode.com');
  for (const data of [{}, {post: false}, {post: 0}, {post: ''}]) {
    assert.equal(await adapter.reconcile(payload, connection, async () => ({data})), null, JSON.stringify(data));
  }
  await assert.rejects(adapter.reconcile(payload, connection, async () => ({data: {post: null}, errors: [{extensions: {code: 'FORBIDDEN'}}]})), {code: 'PLAN_OR_PERMISSION_REQUIRED'});
  assert.deepEqual(await adapter.reconcile(payload, connection, async () => ({data: {post: null}})), {
    state: 'removed', remoteId: 'known-post', url: payload.remoteUrl, sourceVerified: true,
  });
  assert.equal(await adapter.reconcile({...payload, remoteId: undefined}, connection, async () => ({data: {publication: {post}}})), null);
});

test('Hashnode removal worker: retained post stays uncertain, preserves the old copy and retries reads without repeating removal', async t => {
  const f = fixture(), actor = f.actors.admin, originals = new PublishingService(f.content, new Vault('ab'.repeat(32)));
  t.after(() => f.store.close());
  f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)', 'site', 'org', 'en', 'https://blog.example', 'KEY');
  const article = await f.content.create(actor, {ownerId: 'org', language: 'en', title: 'Approved content', markdown: 'Body', creditedAuthor: 'Writer'}, 'setup');
  const release = await originals.confirm(actor, article.id, {ownerId: 'org', revisionId: article.revision.id, creditedAuthor: 'Writer', action: 'publish', rightsConfirmed: true, idempotencyKey: 'source'}, 'setup');
  f.store.run("UPDATE releases SET state='published',remote_id='source',url=? WHERE id=?", payload.sourceUrl, release.id);
  let absence = false, writes = 0, reads = 0;
  const service = new DistributionService(originals, {
    async connection(_actor, owner, id, target) { return {...connection, id, owner, target, active: true}; },
    async approval() { return {}; },
    async execute(_actor, input: any) {
      const removal = f.store.get("SELECT id FROM deliveries WHERE action='remove'")!;
      const frozen = JSON.parse(f.store.get('SELECT payload_json FROM delivery_payloads WHERE delivery_id=?', removal.id)!.payload_json);
      const retained = {...post, content: {markdown: copyBody(frozen)}};
      if (input.readOnly) {
        reads++; assert.equal(input.request.body.query, HASHNODE_READ_QUERIES.post);
        return {accountId: 'account', status: 200, body: {data: {post: absence ? null : retained}}};
      }
      writes++; assert.equal(input.action, 'remove'); assert.match(input.request.body.query, /removePost/);
      assert.deepEqual(input.request.body.variables.input, {id: 'known-post'});
      return {accountId: 'account', status: 200, body: {data: {removePost: {post: retained}}}};
    },
  }, new TargetRegistry([new HashnodeAdapter('https://gql-beta.hashnode.com')]), {async verify() { return true; }});
  const intent = {target: 'hashnode', connectionId: 'org-hashnode', format: 'full', rightsConfirmed: true};
  const copy = await service.request(actor, release.id, {...intent, action: 'create', idempotencyKey: 'copy'}, 'setup');
  f.store.run("UPDATE deliveries SET state='published',remote_id='known-post',url=?,source_verified=1 WHERE id=?", payload.remoteUrl!, copy.id);
  const removal = await service.request(actor, release.id, {...intent, action: 'remove', copyId: copy.id, idempotencyKey: 'remove'}, 'remove-confirmation');
  await service.authorize(actor, removal.id, 'exact-remove-approval', 'setup');
  const worker = new DeliveryWorker(service, {
    async publish() { throw Error('No original writes'); }, async verify() { return true; },
    async reconcile() { return null; }, async unpublish() { throw Error('No original writes'); },
  });
  assert.equal(await worker.once(removal.id), true);
  assert.deepEqual([writes, reads], [1, 1]);
  const current = () => f.store.get('SELECT state,error_code,remote_id,trace_id FROM deliveries WHERE id=?', removal.id)!;
  assert.equal(current().state, 'uncertain'); assert.equal(current().error_code, 'REMOTE_RESULT_UNPROVEN');
  assert.equal(current().remote_id, 'known-post'); assert.equal(current().trace_id, 'remove-confirmation');
  assert.equal(f.store.get('SELECT state FROM deliveries WHERE id=?', copy.id)!.state, 'published');
  assert.equal(await worker.once(removal.id), false, 'An uncertain result must not automatically retry a mutation');
  await service.reconcile(actor, removal.id, 'read-only-recovery'); await worker.once(removal.id);
  assert.deepEqual([writes, reads], [1, 2]); assert.equal(current().state, 'uncertain');
  assert.equal(f.store.get('SELECT state FROM deliveries WHERE id=?', copy.id)!.state, 'published');
  assert.equal(f.store.get("SELECT count(*) AS n FROM delivery_events WHERE delivery_id=? AND state IN ('published','removed')", removal.id)!.n, 0);
  absence = true;
  await service.reconcile(actor, removal.id, 'explicit-absence'); await worker.once(removal.id);
  assert.deepEqual([writes, reads], [1, 3]); assert.equal(current().state, 'removed');
  assert.equal(f.store.get('SELECT state FROM deliveries WHERE id=?', copy.id)!.state, 'removed');
});
