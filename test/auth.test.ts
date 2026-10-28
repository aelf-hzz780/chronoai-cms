import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { AuthManager } from '../src/auth.ts';
import { fixture } from './helpers.ts';
import { Vault } from '../src/vault.ts';
import { digest } from '../src/content.ts';
import type { Config } from '../src/config.ts';

test('A02/A09: real signatures, issuer/audience/expiry/type and delegated scope validation', async t => {
  const f = fixture(); t.after(() => f.store.close());
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const { privateKey: wrongKey } = await generateKeyPair('RS256');
  const auth = new AuthManager({ issuer: f.actors.solo.issuer, publicUrl: 'https://cms.example', clientId: 'cms' } as Config, f.store, new Vault('ab'.repeat(32)), f.policy);
  auth.discovery = {}; auth.keys = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: 'test' }] }) as typeof auth.keys;
  const make = (overrides: Record<string, any> = {}, key = privateKey, typ = 'at+jwt') => new SignJWT({ scope: 'content:read content:write', ...overrides }).setProtectedHeader({ alg: 'RS256', kid: 'test', typ }).setIssuer(overrides.iss ?? f.actors.solo.issuer).setSubject('solo').setAudience(overrides.aud ?? 'service').setIssuedAt().setExpirationTime(overrides.exp ?? '5m').sign(key);
  assert.equal((await auth.accessToken(await make(), 'service')).subject, 'solo');
  for (const token of [await make({ iss: 'https://other.example' }), await make({ aud: 'cms' }), await make({ exp: Math.floor(Date.now() / 1000) - 10 }), await make({}, wrongKey), await make({}, privateKey, 'JWT'), await make({ scope: '' })]) {
    await assert.rejects(auth.accessToken(token, 'service'), { code: 'INVALID_TOKEN' });
  }
});

test('A03/A47: encrypted sessions, no identity header fallback, CSRF and deleted session replay', async t => {
  const f = fixture(); t.after(() => f.store.close()); const vault = new Vault('ab'.repeat(32));
  const auth = new AuthManager({ publicUrl: 'https://cms.example' } as Config, f.store, vault, f.policy);
  const session = 'synthetic-session', sealed = vault.seal(f.actors.solo);
  assert.ok(!sealed.includes('test-only')); assert.ok(!sealed.includes('solo'));
  f.store.run('INSERT INTO sessions VALUES (?,?,?,?)', digest(session), sealed, 'csrf-value', new Date(Date.now() + 60000).toISOString());
  const request = { url: '/api/cms/me', method: 'GET', cookies: { chrono_session: session }, headers: {} } as any;
  assert.equal((await auth.authenticate(request))?.subject, 'solo');
  await assert.rejects(auth.authenticate({ ...request, method: 'POST' }), { code: 'CSRF' });
  assert.equal((await auth.authenticate({ ...request, method: 'POST', headers: { origin: 'https://cms.example', 'x-csrf-token': 'csrf-value' } }))?.subject, 'solo');
  f.store.run('DELETE FROM sessions WHERE id=?', digest(session));
  assert.equal(await auth.authenticate(request), null);
  assert.equal(await auth.authenticate({ ...request, cookies: {}, headers: { 'x-nyxid-user-id': 'solo' } }), null);
});
