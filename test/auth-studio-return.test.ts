import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair, exportJWK, createLocalJWKSet, SignJWT} from 'jose';
import {fixture} from './helpers.ts';
import {AuthManager} from '../src/auth.ts';
import {createApp} from '../src/app.ts';
import {Vault} from '../src/vault.ts';
import {digest} from '../src/content.ts';
import type {Config} from '../src/config.ts';

async function oidcFixture(t:any){
  const f=fixture(),vault=new Vault('ab'.repeat(32)),{privateKey,publicKey}=await generateKeyPair('RS256');
  const config={issuer:f.actors.solo.issuer,publicUrl:'https://cms.example',clientId:'client',cmsAudience:'cms'} as Config;
  const auth=new AuthManager(config,f.store,vault,f.policy);auth.discovery={authorization_endpoint:'https://nyx.example/authorize',token_endpoint:'https://nyx.example/token'};auth.keys=createLocalJWKSet({keys:[{...await exportJWK(publicKey),kid:'studio-return'}]}) as typeof auth.keys;
  const app=await createApp({...f,vault,publicUrl:config.publicUrl,auth,authenticate:request=>auth.authenticate(request)});t.after(async()=>{await app.close();f.store.close();});
  let activeNonce='',tokenFailure=false,tokenCalls=0;
  const sign=(claims:Record<string,unknown>,audience:string)=>new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:'studio-return'}).setIssuer(config.issuer).setSubject('solo').setAudience(audience).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  t.mock.method(globalThis,'fetch',async(input:any,init:any)=>{
    tokenCalls++;assert.equal(String(input),auth.discovery.token_endpoint);assert.equal(init.method,'POST');
    if(tokenFailure)throw Error('PRIVATE_PROVIDER_ERROR https://evil.example/?secret=secret-value');
    const access=await sign({scope:'content:read',token_type:'access',client_id:'client'},'cms'),id=await sign({nonce:activeNonce,at_hash:Buffer.from(digest(access),'hex').subarray(0,16).toString('base64url')},'client');
    return new Response(JSON.stringify({access_token:access,id_token:id}),{headers:{'content-type':'application/json'}});
  });
  async function begin(query='?returnTo=/studio'){
    const response=await app.inject({url:`/auth/login${query}`});assert.equal(response.statusCode,302,response.body);
    const url=new URL(response.headers.location!),state=url.searchParams.get('state')!;activeNonce=url.searchParams.get('nonce')!;
    const cookies=Object.fromEntries(response.cookies.map(cookie=>[cookie.name,cookie.value]));
    return {response,state,cookies,header:Object.entries(cookies).map(([name,value])=>`${name}=${value}`).join('; ')};
  }
  return {...f,app,auth,vault,begin,failTokens(){tokenFailure=true;},tokenCalls(){return tokenCalls;}};
}

test('WP01: successful OIDC binds an encrypted short return cookie to state and returns to Studio; standard encoding and legacy default work',async t=>{
  const f=await oidcFixture(t);
  for(const [query,destination] of [['?returnTo=/studio','/studio'],['?returnTo=%2Fstudio','/studio'],['','/'],['?returnTo=/','/']]){
    const login=await f.begin(query),sealed=login.cookies.chrono_oidc_return;
    if(destination==='/studio'){
      assert.ok(sealed);assert.ok(!sealed.includes('/studio'));const value=f.vault.open<any>(sealed!);assert.equal(value.stateHash,digest(login.state));assert.equal(value.returnTo,'/studio');assert.ok(value.expiresAt>Date.now());
      const cookie=login.response.cookies.find(cookie=>cookie.name==='chrono_oidc_return')!;assert.equal(cookie.httpOnly,true);assert.equal(cookie.secure,true);assert.equal(cookie.sameSite,'Lax');assert.equal(cookie.maxAge,300);
    }
    const response=await f.app.inject({url:`/auth/callback?state=${login.state}&code=code`,headers:{cookie:login.header}});assert.equal(response.statusCode,302,response.body);assert.equal(response.headers.location,destination);assert.ok(response.cookies.some(cookie=>cookie.name==='chrono_session'&&cookie.value));
    assert.equal(f.store.get('SELECT 1 FROM oidc_states WHERE state=?',digest(login.state)),undefined);
  }
});

test('WP01: external, double-encoded, malformed and duplicate login destinations are rejected before storing state',async t=>{
  const f=await oidcFixture(t);
  for(const value of ['https://evil.example','//evil.example','%2F%2Fevil.example','%252Fstudio','/studio?x=1','/studio%23content','%5c%5cevil.example','/studio/','']){
    const response=await f.app.inject({url:`/auth/login?returnTo=${value}`});assert.equal(response.statusCode,400,value);assert.equal(f.store.get('SELECT count(*) n FROM oidc_states')!.n,0);
  }
  assert.equal((await f.app.inject({url:'/auth/login?returnTo=/studio&returnTo=/'})).statusCode,400);
});

test('WP01: valid-state cancellation consumes state, clears temporary cookies and safely returns to Studio without a session',async t=>{
  const f=await oidcFixture(t),login=await f.begin();
  const response=await f.app.inject({url:`/auth/callback?state=${login.state}&error=access_denied&error_description=PRIVATE_PROVIDER_ERROR`,headers:{cookie:login.header}});
  assert.equal(response.statusCode,302,response.body);assert.equal(response.headers.location,'/studio?authError=access_denied');assert.equal(f.tokenCalls(),0);assert.ok(!response.cookies.some(cookie=>cookie.name==='chrono_session'));
  for(const name of ['chrono_oidc','chrono_oidc_return'])assert.ok(response.cookies.some(cookie=>cookie.name===name&&cookie.value===''));
  assert.equal(f.store.get('SELECT 1 FROM oidc_states WHERE state=?',digest(login.state)),undefined);
  const replay=await f.app.inject({url:`/auth/callback?state=${login.state}&error=access_denied`,headers:{cookie:login.header}});assert.equal(replay.statusCode,401);assert.ok(!replay.headers.location);
});

test('WP01: forged, expired and mismatched return cookies cannot authorize a Studio redirect; invalid state never authenticates',async t=>{
  const f=await oidcFixture(t);
  for(const kind of ['forged','expired','mismatched','external']){
    const login=await f.begin();
    const sealed=kind==='forged'?'invalid-encrypted-cookie':f.vault.seal({stateHash:kind==='mismatched'?digest('other-state'):digest(login.state),returnTo:kind==='external'?'https://evil.example':'/studio',expiresAt:kind==='expired'?Date.now()-1:Date.now()+60_000});
    const response=await f.app.inject({url:`/auth/callback?state=${login.state}&code=code`,headers:{cookie:`chrono_oidc=${login.state}; chrono_oidc_return=${sealed}`}});
    assert.equal(response.statusCode,302,response.body);assert.equal(response.headers.location,'/');
  }
  const login=await f.begin(),before=f.store.get('SELECT count(*) n FROM sessions')!.n;
  const invalid=await f.app.inject({url:'/auth/callback?state=wrong&code=code',headers:{cookie:login.header}});assert.equal(invalid.statusCode,401);assert.equal(f.store.get('SELECT count(*) n FROM sessions')!.n,before);assert.ok(!invalid.headers.location);
});

test('WP01: token exchange failure stays safe, consumes state and never reflects provider details into redirect URLs',async t=>{
  const f=await oidcFixture(t),login=await f.begin();f.failTokens();
  const response=await f.app.inject({url:`/auth/callback?state=${login.state}&code=code`,headers:{cookie:login.header}});
  assert.ok(response.statusCode>=400);assert.ok(response.json().traceId);assert.ok(!response.headers.location);assert.doesNotMatch(response.body,/PRIVATE_PROVIDER_ERROR|evil\.example|secret-value/);assert.equal(f.store.get('SELECT count(*) n FROM sessions')!.n,0);
  assert.equal(f.store.get('SELECT 1 FROM oidc_states WHERE state=?',digest(login.state)),undefined);
});
