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
  const make = (overrides: Record<string, any> = {}, key = privateKey, typ = 'JWT') => new SignJWT({ scope: 'content:read content:write', token_type: 'access', ...overrides }).setProtectedHeader({ alg: 'RS256', kid: 'test', typ }).setIssuer(overrides.iss ?? f.actors.solo.issuer).setSubject('solo').setAudience(overrides.aud ?? 'service').setIssuedAt().setExpirationTime(overrides.exp ?? '5m').sign(key);
  assert.equal((await auth.accessToken(await make(), 'service')).subject, 'solo');
  for (const token of [await make({ iss: 'https://other.example' }), await make({ aud: 'cms' }), await make({ exp: Math.floor(Date.now() / 1000) - 10 }), await make({}, wrongKey), await make({ token_type: 'id' }), await make({ sa: true }), await make({ scope: '' })]) {
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

test('NyxID propagated signed identity requires matching service, person, actor and explicit operation scope',async t=>{
  const f=fixture();t.after(()=>f.store.close());
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const auth=new AuthManager({issuer:f.actors.solo.issuer,serviceAudience:'chrono-publication',serviceId:'registered-service',serviceSlug:'chrono-cms',nyxAudience:'nyxid',operationScopes:{'content:read':['proxy:chrono-cms'],'content:write':['proxy:chrono-cms','content-edit']}} as unknown as Config,f.store,new Vault('ab'.repeat(32)),f.policy);
  auth.discovery={};auth.keys=createLocalJWKSet({keys:[{...await exportJWK(publicKey),kid:'test'}]}) as typeof auth.keys;
  const sign=(claims:any,aud:string,seconds:number)=>new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer(f.actors.solo.issuer).setSubject(claims.sub??'solo').setAudience(aud).setIssuedAt().setExpirationTime(`${seconds}s`).setJti('unique-test').sign(privateKey);
  const identity=await sign({nyx_service_id:'registered-service'},'chrono-publication',60);
  const delegation=await sign({scope:'proxy:chrono-cms',token_type:'access',delegated:true,act:{sub:'chrono-cms'}},'nyxid',300);
  const actor=await auth.propagated(identity,delegation);assert.deepEqual(actor.scopes,['content:read']);
  for(const [id,del] of [[await sign({nyx_service_id:'other'},'chrono-publication',60),delegation],[await sign({nyx_service_id:'registered-service',sub:'other'},'chrono-publication',60),delegation],[identity,await sign({scope:'proxy:chrono-cms',token_type:'access',delegated:true,act:{sub:'wrong'}},'nyxid',300)],[await sign({nyx_service_id:'registered-service'},'chrono-publication',300),delegation]])await assert.rejects(auth.propagated(id,del),{code:'INVALID_TOKEN'});
});

test('OIDC callback binds PKCE/state/nonce/access hash and yields the same caller on CMS and service; logout revokes the cookie',async t=>{
  const f=fixture(),vault=new Vault('ab'.repeat(32));t.after(()=>f.store.close());const {privateKey,publicKey}=await generateKeyPair('RS256');
  const config={issuer:f.actors.solo.issuer,clientId:'client',publicUrl:'https://cms.example',cmsAudience:'cms',serviceAudience:'service'} as Config;
  const auth=new AuthManager(config,f.store,vault,f.policy);auth.discovery={authorization_endpoint:'https://nyx.example/authorize',token_endpoint:'https://nyx.example/token'};auth.keys=createLocalJWKSet({keys:[{...await exportJWK(publicKey),kid:'test'}]}) as typeof auth.keys;
  const {createApp}=await import('../src/app.ts');const app=await createApp({...f,vault,publicUrl:config.publicUrl,auth,authenticate:request=>auth.authenticate(request)});t.after(()=>app.close());
  const login=await app.inject({url:'/auth/login'}),url=new URL(login.headers.location!),state=url.searchParams.get('state')!,nonce=url.searchParams.get('nonce')!;
  const make=(claims:any,audience:string)=>new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer(config.issuer).setSubject('solo').setAudience(audience).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const access=await make({scope:'content:read content:write publish metrics:read roles:write connections:read',token_type:'access'},'cms');
  const id=await make({nonce,at_hash:Buffer.from(digest(access),'hex').subarray(0,16).toString('base64url')},'client');
  const originalFetch=globalThis.fetch;globalThis.fetch=async(input,init)=>{assert.equal(String(input),'https://nyx.example/token');const body=init!.body as URLSearchParams;assert.equal(body.get('code'),'code');assert.equal(Buffer.from(digest(body.get('code_verifier')!),'hex').toString('base64url'),url.searchParams.get('code_challenge'));return new Response(JSON.stringify({id_token:id,access_token:access}),{headers:{'content-type':'application/json'}});};t.after(()=>{globalThis.fetch=originalFetch;});
  const cookie=`chrono_oidc=${state}`;assert.equal((await app.inject({url:`/auth/callback?state=wrong&code=code`,headers:{cookie}})).statusCode,401);
  const callback=await app.inject({url:`/auth/callback?state=${state}&code=code`,headers:{cookie}});assert.equal(callback.statusCode,302,callback.body);
  const setCookie=callback.headers['set-cookie'] as string[];const session=setCookie.find(c=>c.startsWith('chrono_session='))!.split(';')[0];assert.ok(setCookie.some(c=>c.includes('HttpOnly')&&c.includes('Secure')&&c.includes('SameSite=Lax')));
  const cms=(await app.inject({url:'/api/cms/me',headers:{cookie:session}})).json();const service=await app.inject({url:'/api/service/me',headers:{authorization:`Bearer ${await make({scope:'content:read',token_type:'access'},'service')}`}});assert.equal(service.statusCode,200);assert.equal(service.json().subject,cms.subject);
  assert.equal((await app.inject({url:`/auth/callback?state=${state}&code=code`,headers:{cookie}})).statusCode,401);
  assert.equal((await app.inject({method:'POST',url:'/auth/logout',headers:{cookie:session,origin:'https://evil.example','x-csrf-token':cms.csrf}})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url:'/auth/logout',headers:{cookie:session,origin:config.publicUrl,'x-csrf-token':cms.csrf}})).statusCode,200);
  assert.equal((await app.inject({url:'/api/cms/me',headers:{cookie:session}})).statusCode,401);
});
