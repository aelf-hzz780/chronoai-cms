import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadConfig} from '../src/config.ts';

const env={PUBLIC_URL:'https://cms.example',NYXID_ISSUER:'nyxid',NYXID_API_URL:'https://identity.example',NYXID_CLIENT_ID:'cms',NYXID_CMS_AUDIENCE:'nyxid',NYXID_SERVICE_AUDIENCE:'service',NYXID_INTROSPECTION_URL:'https://identity.example/oauth/introspect',ENCRYPTION_KEY:'ab'.repeat(32),TRACKING_SECRET:'test-config-secret'};
test('R029: supported OIDC defaults read only; capability maps reject identity-only escalation and ambiguous global configuration',()=>{
  const config=loadConfig(env);
  assert.equal(config.oauthScopes,'openid profile');
  assert.deepEqual(config.cmsOperationScopes,{'content:read':['profile']});
  for(const mapping of [{'content:write':['openid','profile']},{'publish':['roles','groups']},{'roles:write':['email']},{createArticle:['proxy']},{publish:[]},{publish:['proxy other']}]) assert.throws(()=>loadConfig({...env,NYXID_CMS_CAPABILITY_SCOPES_JSON:JSON.stringify(mapping)}),{code:'CONFIGURATION'});
  assert.throws(()=>loadConfig({...env,NYXID_OPERATION_SCOPES_JSON:'{"content:read":["profile"]}',NYXID_CMS_CAPABILITY_SCOPES_JSON:'{}'}),{code:'CONFIGURATION'});
  const separate=loadConfig({...env,NYXID_CMS_CAPABILITY_SCOPES_JSON:'{"content:read":["profile"],"content:write":["proxy"]}',NYXID_SERVICE_CAPABILITY_SCOPES_JSON:'{"content:read":["account:read"],"content:write":["account:read","proxy:*"]}'});
  assert.deepEqual(separate.serviceOperationScopes?.['content:write'],['account:read','proxy:*']);
});

test('C06: optional connection setup validates explicit enabled target mappings and trusted management URLs',()=>{
  assert.equal(loadConfig(env).connectionSetup,undefined);
  const configured={...env,NYXID_CONNECTION_MANAGEMENT_URL:'https://nyx-ui.example/services',NYXID_CONNECTION_TARGETS_JSON:JSON.stringify({dev:{enabled:true,serviceSlug:'dev-catalog',scopes:['write:articles']}})};
  assert.deepEqual(loadConfig(configured).connectionSetup,{managementUrl:'https://nyx-ui.example/services',ttlSeconds:900,targets:{dev:{enabled:true,serviceSlug:'dev-catalog',scopes:['write:articles']}}});
  for(const overrides of [
    {NYXID_CONNECTION_MANAGEMENT_URL:'https://user:password@nyx-ui.example'},
    {NYXID_CONNECTION_MANAGEMENT_URL:'javascript:alert(1)'},
    {NYXID_CONNECTION_ATTEMPT_TTL_SECONDS:'0'},
    {NYXID_CONNECTION_ATTEMPT_TTL_SECONDS:'3601'},
    ...[{dev:{enabled:'true',serviceSlug:'dev',scopes:[]}},{dev:{enabled:true,serviceSlug:'../dev',scopes:[]}},{dev:{enabled:true,serviceSlug:'dev',scopes:['bad scope']}},{dev:{enabled:true,serviceSlug:'dev',scopes:['write'],usePlatformKey:true}}].map(targets=>({NYXID_CONNECTION_TARGETS_JSON:JSON.stringify(targets)})),
  ])assert.throws(()=>loadConfig({...configured,...overrides}),{code:'CONFIGURATION'});
});
