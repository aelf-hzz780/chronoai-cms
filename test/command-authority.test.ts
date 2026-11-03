// Modeled issuer and command authority only; no official NyxID or remote writes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {digest} from '../src/content.ts';
import {Store} from '../src/store.ts';
import type {Actor} from '../src/policy.ts';
import type {Config} from '../src/config.ts';
import {snapshotPlatform,isolateRestoredPlatform} from '../src/recovery.ts';
import {verifyCommandAuthority,validateCommandAuthority,bindCommand,assertCommandBinding,deriveCommand,type CommandRequest} from '../src/command-authority.ts';

test('R031 command authority: signatures, exact online binding and persistent one-command fence',async t=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256'),keys=createLocalJWKSet({keys:[{...await exportJWK(publicKey),kid:'command-local'}]});
 const config={issuer:'https://issuer.invalid',serviceId:'catalog',introspectionUrl:'https://issuer.invalid/oauth/introspect',clientId:'resource',clientSecret:'local-test-secret'} as Config;
 const request:CommandRequest={version:1,method:'POST',path_and_query:'/api/service/articles/a/releases',content_type:'application/json',body_sha256:digest('{}'),idempotency_key_sha256:null};
 const actor:Actor={issuer:config.issuer,subject:'person',scopes:['publish'],credential:'exact-saved-delegation',entry:'service',binding:{kind:'propagated',serviceId:'catalog',serviceSlug:'blog',identityAudience:'resource',delegationAudience:'delegation'}};
 const now=Math.floor(Date.now()/1000),delegationExpiry=now+300;
 const claims={authority_version:1,iss:config.issuer,sub:actor.subject,aud:'catalog',jti:'proof-1',iat:now,exp:now+200,user_service_id:'connection',delegation_sha256:digest(actor.credential),command_request:request,source:{key_id:'parent',credential_id:'child',credential_incarnation:digest('incarnation')}};
 const sign=(changes:Record<string,unknown>={},header:Record<string,unknown>={})=>new SignJWT({...claims,...changes}).setProtectedHeader({alg:'RS256',kid:'command-local',typ:'nyxid-command-authority+jwt',...header}).sign(privateKey);
 const token=await sign(),saved={token,request};
 const verified=await verifyCommandAuthority({...actor,commandAuthority:saved},config,keys,delegationExpiry);
 assert.equal(verified.jti,'proof-1');
 for(const [name,changes,header] of [
  ['missing authority version',{authority_version:undefined},{}],['unsupported authority version',{authority_version:2},{}],['subject',{sub:'other'},{}],['issuer',{iss:'https://other.invalid'},{}],['catalog',{aud:'other'},{}],['missing UserService',{user_service_id:''},{}],['delegation',{delegation_sha256:digest('other')},{}],
  ['key',{source:{...claims.source,key_id:''}},{}],['child incarnation',{source:{...claims.source,credential_incarnation:''}},{}],['malformed incarnation',{source:{...claims.source,credential_incarnation:'not-a-hash'}},{}],['uppercase incarnation',{source:{...claims.source,credential_incarnation:'AB'.repeat(32)}},{}],['expiry',{exp:delegationExpiry+1},{}],['expired',{exp:now-1},{}],['future issued',{iat:now+60},{}],['typ',{}, {typ:'JWT'}],
 ] as const)await t.test(`reject signed ${name} mismatch`,async()=>{
  await assert.rejects(verifyCommandAuthority({...actor,commandAuthority:{...saved,token:await sign(changes,header)}},config,keys,delegationExpiry));
 });
 for(const [key,value] of Object.entries({version:2,method:'PUT',path_and_query:request.path_and_query+'?changed=1',content_type:'text/plain',body_sha256:digest('changed'),idempotency_key_sha256:digest('other')}))await t.test(`reject request ${key} mismatch`,async()=>{
  await assert.rejects(verifyCommandAuthority({...actor,commandAuthority:{token,request:{...request,[key]:value}}},config,keys,delegationExpiry));
 });
 const other=await generateKeyPair('RS256');
 await assert.rejects(verifyCommandAuthority({...actor,commandAuthority:{...saved,token:await new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:'command-local',typ:'nyxid-command-authority+jwt'}).sign(other.privateKey)}},config,keys,delegationExpiry));
 const response={...claims,active:true,token_type:'command_authority',scope:'proxy',independent_commands:true,authority_version:1,permissions:['proxy']};
 const original=globalThis.fetch;let online:unknown=response,calls=0;
 globalThis.fetch=async(url,options)=>{
  calls++;assert.equal(url,config.introspectionUrl);const form=options!.body as URLSearchParams;
  assert.equal(form.get('token_type_hint'),'command_authority');assert.equal(form.get('service_id'),'catalog');assert.equal(form.get('token'),token);assert.equal(form.get('client_id'),'resource');assert.equal(form.get('client_secret'),'local-test-secret');
  assert.equal(form.get('request_method'),request.method);assert.equal(form.get('request_path_and_query'),request.path_and_query);assert.equal(form.get('request_body_sha256'),request.body_sha256);assert.equal(form.get('request_content_type'),request.content_type);assert.equal(form.has('request_idempotency_key_sha256'),false);assert.equal(form.get('command_delegation_sha256'),claims.delegation_sha256);
  return new Response(JSON.stringify(online));
 };t.after(()=>{globalThis.fetch=original;});
 await validateCommandAuthority(config,saved,verified);await validateCommandAuthority(config,saved,verified);assert.equal(calls,2,'No authority cache between execution boundaries');
 for(const [key,value] of Object.entries({active:false,token_type:'access',scope:'profile',independent_commands:false,authority_version:2,permissions:[true],sub:'other',iss:'other',aud:'other',jti:'other',iat:now-1,exp:now+199,user_service_id:'other',delegation_sha256:'other',command_request:{...request,method:'DELETE'},source:{...claims.source,credential_incarnation:'rotated'}}))await t.test(`reject online ${key} mismatch`,async()=>{
  online={...response,[key]:value};await assert.rejects(validateCommandAuthority(config,saved,verified));
 });
 globalThis.fetch=async()=>new Response('{}',{status:503});await assert.rejects(validateCommandAuthority(config,saved,verified));
 globalThis.fetch=async()=>{throw new DOMException('Local simulated timeout','TimeoutError');};await assert.rejects(validateCommandAuthority(config,saved,verified));
 await assert.rejects(validateCommandAuthority({...config,clientSecret:undefined},saved,verified),{code:'COMMAND_AUTHORITY_CONFIGURATION'});
 const directory=await mkdtemp(join(tmpdir(),'blog-command-fence-')),path=join(directory,'store.sqlite');t.after(()=>rm(directory,{recursive:true,force:true}));
 let store=new Store(path);const bound=bindCommand(store,{...actor,commandAuthority:saved},verified,{kind:'release',resourceId:'release-1',digest:'immutable-input'});
 assertCommandBinding(store,bound,{kind:'release',resourceId:'release-1',digest:'immutable-input'});store.close();store=new Store(path);
 try{
  assertCommandBinding(store,bound,{kind:'release',resourceId:'release-1',digest:'immutable-input'});
  bindCommand(store,bound,verified,{kind:'release',resourceId:'release-1',digest:'immutable-input'});
  for(const target of [{kind:'delivery',resourceId:'release-1',digest:'immutable-input'},{kind:'release',resourceId:'release-2',digest:'immutable-input'},{kind:'release',resourceId:'release-1',digest:'changed-input'}]){
   assert.throws(()=>bindCommand(store,{...actor,commandAuthority:saved},verified,target),{code:'COMMAND_AUTHORITY_REUSED'});
   assert.throws(()=>assertCommandBinding(store,bound,target),{code:'COMMAND_AUTHORITY_REUSED'});
  }
  const parent={kind:'release',resourceId:'release-1',digest:'immutable-input'},child={kind:'projection',resourceId:'projection-1',digest:'metadata-input'};
  assert.throws(()=>assertCommandBinding(store,bound,child),{code:'COMMAND_AUTHORITY_REUSED'});
  deriveCommand(store,bound,parent,child);assertCommandBinding(store,bound,child);
  assert.throws(()=>deriveCommand(store,bound,parent,{...child,kind:'delivery'}),{code:'COMMAND_AUTHORITY_REUSED'});
  const backupPath=join(directory,'backup.sqlite');await snapshotPlatform(store,backupPath);
  const restored=new Store(backupPath);try{isolateRestoredPlatform(restored,'command-test');assertCommandBinding(restored,bound,parent);assertCommandBinding(restored,bound,child);assert.equal(restored.get("SELECT value FROM settings WHERE key='outbound_paused'")!.value,'true');}finally{restored.close();}
 }finally{store.close();}
});
