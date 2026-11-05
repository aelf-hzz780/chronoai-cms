import {test, type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers.ts';
import {openApi} from '../src/openapi.ts';
import {createApp} from '../src/app.ts';
import {Vault} from '../src/vault.ts';
import {PublishingService} from '../src/publishing.ts';
import {DistributionService} from '../src/distribution.ts';
import {DevAdapter, TargetRegistry} from '../src/targets.ts';
import {ConnectionAttemptService} from '../src/connection-attempts.ts';
import {WorkspaceReadService} from '../src/workspace-read.ts';
import type {Actor} from '../src/policy.ts';

const bodyless = [
  ['cancelConnectionAttempt', '/owners/{id}/connection-attempts/{attemptId}/cancel'],
  ['cancelOriginal', '/releases/{id}/cancel'],
  ['reconcileOriginal', '/releases/{id}/reconcile'],
  ['cancelDistributionPlan', '/distribution-plans/{id}/cancel'],
  ['requestExactApproval', '/deliveries/{id}/request-approval'],
  ['cancelDistribution', '/deliveries/{id}/cancel'],
  ['reconcileDistribution', '/deliveries/{id}/reconcile'],
  ['refreshExternalMetrics', '/deliveries/{id}/metrics/refresh'],
  ['syncPublishedAlternates', '/articles/{id}/sync-links'],
] as const;
type Operation = typeof bodyless[number][0];

for (const [name, path] of bodyless) test(`native generated contract: ${name} is POST without a required empty JSON body`, () => {
  const methods = openApi('https://cms.example').paths[`/api/service${path}`];
  const operation = methods.post;
  assert.equal(operation.operationId, name);
  assert.equal(operation.requestBody, undefined, 'NyxID cannot generate a required body with no body fields');
  assert.deepEqual(operation.security, [{NyxIdentity: [], NyxDelegation: []}, {Bearer: []}]);
  assert.deepEqual(operation.parameters.map((parameter: any) => [parameter.name, parameter.in, parameter.required]),
    [...path.matchAll(/\{([^}]+)\}/g)].map(match => [match[1], 'path', true]));
  assert.ok(operation.responses['200'].content['application/json'].schema);
});

test('native generated contract: content, confirmation and approval inputs still require their actual body fields', () => {
  const operations = Object.values(openApi('https://cms.example').paths).flatMap(methods => Object.values(methods)) as any[];
  for (const [name, fields] of [
    ['createArticle', ['ownerId', 'markdown', 'creditedAuthor']],
    ['confirmOriginal', ['revisionId', 'rightsConfirmed', 'idempotencyKey']],
    ['confirmDistribution', ['target', 'connectionId', 'action', 'rightsConfirmed']],
    ['prepareExternalPublication', ['connectionId', 'action', 'rightsConfirmed', 'idempotencyKey']],
    ['registerExternalPublication', ['remoteId', 'idempotencyKey']],
    ['followUpExternalPublication', ['action']],
    ['attachExactApproval', ['approvalRef']],
    ['reportAssistedSubmission', ['state']],
    ['setPublishingPermission', ['enabled']],
  ] as const) {
    const body = operations.find(operation => operation.operationId === name).requestBody;
    assert.equal(body.required, true, name);
    const schema = body.content['application/json'].schema;
    for (const field of fields) assert.ok(schema.required.includes(field), `${name}.${field}`);
  }
  // Recheck has a real optional field and is not a no-input operation.
  const recheck = operations.find(operation => operation.operationId === 'recheckConnectionAttempt').requestBody;
  assert.ok(recheck.content['application/json'].schema.properties.connectionId);
});

async function bodylessFixture(t: TestContext, operation: Operation) {
  const f = fixture(), vault = new Vault('ab'.repeat(32)), publishing = new PublishingService(f.content, vault);
  let actor: Actor | null = f.actors.admin, providerReads = 0, approvals = 0;
  f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)', 'site', 'org', 'en', 'https://blog.example', 'KEY');
  const article = await f.content.create(f.actors.admin, {ownerId: 'org', language: 'en', title: 'Frozen original', markdown: 'Approved source', creditedAuthor: 'Writer'}, 'setup');
  const release = await publishing.confirm(f.actors.admin, article.id, {ownerId: 'org', revisionId: article.revision.id, creditedAuthor: 'Writer', action: 'publish', rightsConfirmed: true, idempotencyKey: 'source'}, 'setup');
  const distribution = new DistributionService(publishing, {
    async connection(_actor, owner, id, target) { return {id, owner, target, accountId: 'account', organizationId: 'dev-org', active: true, canPublish: true}; },
    async approval() { return {}; },
    async prepareApproval() { approvals++; return {reference: 'exact-approval', state: 'pending', expiresAt: new Date(Date.now() + 60_000).toISOString()}; },
    async execute(_actor, input: any) {
      assert.equal(input.readOnly, true, 'Bodyless control routes must not write a provider');
      assert.equal(input.request.method, 'GET'); providerReads++;
      return {accountId: 'account', status: 200, body: input.request.url.includes('/me/published')
        ? [{id: 'known-copy', page_views_count: 7}]
        : {user: {user_id: 'account'}, organization: {id: 'dev-org'}, public_reactions_count: 2, comments_count: 1}};
    },
  }, new TargetRegistry([new DevAdapter('https://dev.to/api')]), {async verify() { return true; }});
  const connectionAttempts = new ConnectionAttemptService(new WorkspaceReadService(f.policy), {
    async call() { throw Error('Organization operator cancellation must not send upstream requests'); },
    async bindings() { return []; },
    async connection() { throw Error('No account binding required'); },
  }, vault, {publicUrl: 'https://cms.example', allowLoopback: false, connectionSetup: {
    managementUrl: 'https://nyx.example/services', ttlSeconds: 900,
    targets: {dev: {enabled: true, serviceSlug: 'dev', scopes: ['write:articles']}},
  }});

  let path: string;
  if (operation === 'cancelOriginal' || operation === 'reconcileOriginal') {
    path = `/releases/${release.id}/${operation === 'cancelOriginal' ? 'cancel' : 'reconcile'}`;
    if (operation === 'reconcileOriginal') {
      f.store.run("UPDATE releases SET state='uncertain' WHERE id=?", release.id);
      f.store.run("UPDATE jobs SET state='done' WHERE kind='release' AND resource_id=?", release.id);
    }
  } else if (operation === 'cancelConnectionAttempt') {
    const created = await connectionAttempts.create(f.actors.admin, 'org', {target: 'dev', idempotencyKey: 'connect'}, 'setup');
    path = `/owners/org/connection-attempts/${created.attempt.id}/cancel`;
  } else {
    // The route tests start with an already verified local ledger fixture; they do not publish an original.
    f.store.run("UPDATE releases SET state='published',remote_id='post',url='https://blog.example/post/' WHERE id=?", release.id);
    const input = {target: 'dev', connectionId: 'org-dev', action: 'create', format: 'full', rightsConfirmed: true, idempotencyKey: 'copy'};
    if (operation === 'syncPublishedAlternates') path = `/articles/${article.id}/sync-links`;
    else if (operation === 'cancelDistributionPlan') {
      const plan = await distribution.createPlan(f.actors.admin, release.id, {...input, notBeforeAt: new Date(Date.now() + 60_000).toISOString()}, 'setup');
      path = `/distribution-plans/${plan.id}/cancel`;
    } else {
      const delivery = await distribution.request(f.actors.admin, release.id, input, 'setup');
      if (operation === 'reconcileDistribution') {
        await distribution.authorize(f.actors.admin, delivery.id, 'exact-approval', 'setup');
        f.store.run("UPDATE deliveries SET state='uncertain' WHERE id=?", delivery.id);
        f.store.run("UPDATE jobs SET state='done' WHERE kind='delivery' AND resource_id=?", delivery.id);
      } else if (operation === 'refreshExternalMetrics') {
        f.store.run("UPDATE deliveries SET state='published',remote_id='known-copy',url='https://dev.to/author/copy' WHERE id=?", delivery.id);
      }
      const suffix = {requestExactApproval: 'request-approval', cancelDistribution: 'cancel', reconcileDistribution: 'reconcile', refreshExternalMetrics: 'metrics/refresh'}[operation];
      path = `/deliveries/${delivery.id}/${suffix}`;
    }
  }
  const app = await createApp({...f, vault, distribution, connectionAttempts, publicUrl: 'https://cms.example', authenticate: async () => actor});
  t.after(async () => { await app.close(); f.store.close(); });
  return {...f, app, path, use(value: Actor | null) { actor = value; }, counts() { return {providerReads, approvals, audits: f.store.get('SELECT count(*) AS n FROM audit')!.n}; }};
}

for (const [operation] of bodyless) for (const entry of ['service', 'cms']) {
  test(`bodyless HTTP ${entry}: ${operation} preserves current authorization and its lifecycle`, async t => {
    const f = await bodylessFixture(t, operation);
    // Explicit POST and no payload/header: absence of JSON must not turn this request into GET.
    const request = {method: 'POST' as const, url: `/api/${entry}${f.path}`};
    const before = f.counts();
    f.use(null); assert.equal((await f.app.inject(request)).statusCode, 401);
    f.use(f.actors.member); assert.equal((await f.app.inject(request)).statusCode, 403);
    assert.deepEqual(f.counts(), before, 'Denied calls must not mutate the ledger or request upstream approval');
    f.use(f.actors.admin);
    const response = await f.app.inject(request);
    assert.equal(response.statusCode, 200, response.body);
    assert.ok(response.headers['x-trace-id']);
    const result = response.json();
    if (operation === 'refreshExternalMetrics') {
      assert.deepEqual([result.availability, result.views, result.reactions, result.comments], ['Available', 7, 2, 1]);
      assert.equal(f.counts().providerReads, 2);
    } else if (operation === 'requestExactApproval') {
      assert.equal(result.reference, 'exact-approval'); assert.equal(result.state, 'pending'); assert.equal(f.counts().approvals, 1);
    } else if (operation === 'cancelConnectionAttempt') assert.equal(result.status, 'cancelled');
    else assert.equal(result.state, operation.startsWith('cancel') ? 'cancelled' : operation.startsWith('reconcile') ? 'uncertain' : 'queued');
  });
}
