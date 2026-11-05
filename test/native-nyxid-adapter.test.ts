import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {NyxAuthority,canonicalJson} from '../src/nyxid.ts';
import {digest} from '../src/content.ts';
import {connectionFingerprint,requiresExactApproval} from '../src/connection-proof.ts';
import {fixture} from './helpers.ts';
import type {Config} from '../src/config.ts';
import {HASHNODE_READ_QUERIES} from '../src/targets.ts';

test('native personal connection policy is explicit and cannot downgrade an existing exact fingerprint or an organization',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'chrono-native-adapter-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const binding={id:'selected',target:'dev',slug:'dev',owner:{kind:'personal',issuer:'nyxid',subject:'person'},remoteBaseUrl:'https://dev.to/api',accountId:'person',executionApproval:'native'};
  const file=join(directory,'connections.json');await writeFile(file,JSON.stringify([binding]));
  const authority=new NyxAuthority({connectionsFile:file} as Config);
  assert.equal((await authority.bindings())[0]!.executionApproval,'native');
  assert.equal(requiresExactApproval('personal',binding as any),false);
  assert.equal(requiresExactApproval('organization',binding as any),true);
  assert.notEqual(connectionFingerprint(binding),connectionFingerprint({...binding,executionApproval:'exact'}));
  assert.notEqual(connectionFingerprint(binding),connectionFingerprint({...binding,executionApproval:undefined}));
});

test('service-origin delegation cannot enter the OAuth exact catalog even with injected catalog scope',async t=>{
  const f=fixture();t.after(()=>f.store.close());
  const owner={kind:'personal',issuer:f.actors.solo.issuer,subject:'solo'};
  const authority=new NyxAuthority({} as Config,f.store);
  authority.connection=async()=>({id:'connection',target:'dev',owner,slug:'dev',remoteBaseUrl:'https://dev.to/api',accountId:'person',active:true,generation:'1',executionApproval:'exact'});
  const calls:string[]=[];authority.call=async(_actor,path)=>{calls.push(path);return {};};
  const actor={...f.actors.solo,credentialSource:'service-delegation',sourceScopes:['proxy:*','mcp:catalog:read'],credential:`header.${Buffer.from(JSON.stringify({delegated:true,delegation_origin:'oauth',client_id:'forged'})).toString('base64url')}.signature`} as any;
  await assert.rejects(authority.prepareApproval(actor,owner,'connection','dev',{method:'POST',url:'https://dev.to/api/articles',body:{article:{title:'Confirmed'}}},'delivery','digest','create'),{code:'NATIVE_EXACT_UNSUPPORTED'});
  assert.deepEqual(calls,[],'No catalog, exchange or approval request may be sent');
});

test('exact catalog routing requires verified source metadata and OAuth catalog scope rather than decoding a token',async t=>{
  const f=fixture();t.after(()=>f.store.close());
  const owner={kind:'personal',issuer:f.actors.solo.issuer,subject:'solo'};
  const authority=new NyxAuthority({} as Config,f.store);
  authority.connection=async()=>({id:'connection',target:'dev',owner,slug:'dev',remoteBaseUrl:'https://dev.to/api',accountId:'person',active:true,generation:'1',executionApproval:'exact'});
  const calls:string[]=[];authority.call=async(_actor,path)=>{calls.push(path);return {};};
  const actor={...f.actors.solo,credential:`header.${Buffer.from(JSON.stringify({delegated:true,delegation_origin:'oauth',client_id:'receiver',scope:'proxy mcp:catalog:read'})).toString('base64url')}.signature`};
  const args=[owner,'connection','dev',{method:'POST',url:'https://dev.to/api/articles'},'delivery','digest','create'] as const;
  await assert.rejects(authority.prepareApproval(actor,...args),{code:'CREDENTIAL_SOURCE_REQUIRED'});
  await assert.rejects(authority.prepareApproval({...actor,credentialSource:'oauth-delegation',sourceScopes:['proxy']} as any,...args),{code:'INSUFFICIENT_SCOPE'});
  assert.deepEqual(calls,[]);
});

test('native service reads use the selected proxy while all ordinary proxy writes fail closed before dispatch',async t=>{
  const f=fixture();t.after(()=>f.store.close());
  const owner={kind:'personal',issuer:f.actors.solo.issuer,subject:'solo'},authority=new NyxAuthority({} as Config,f.store);
  const connection={id:'selected',target:'dev',owner,slug:'dev',remoteBaseUrl:'https://dev.to/api',accountId:'person',active:true,generation:'1',executionApproval:'native' as const};
  let calls=0,guarded=0;
  authority.connection=async()=>connection;
  authority.call=async(_actor,path,method)=>{assert.equal(path,'/api/v1/proxy/s/dev/articles?_nyxid_via=selected');assert.equal(method,'GET');calls++;return {id:42};};
  const actor={...f.actors.solo,credentialSource:'service-delegation' as const,sourceScopes:['proxy:*']};
  const input={owner,connectionId:connection.id,target:'dev',connectionFingerprint:connectionFingerprint(connection),request:{method:'POST',url:'https://dev.to/api/articles',body:{article:{title:'Confirmed'}}},readOnly:false,beforeDispatch:()=>{guarded++;},beforeWrite:async()=>assert.fail('Unsupported write must fail before caller dispatch checks')};
  for(const credentialSource of ['service-delegation','direct-oauth','oauth-delegation'] as const)
    await assert.rejects(authority.execute({...actor,credentialSource},input),{code:'NATIVE_DISPATCH_UNSUPPORTED'});
  for(const body of [{article:{title:'Unapproved'}},{query:'query Account { me { id } }',article:{title:'Unapproved'}}])
    await assert.rejects(authority.execute(actor,{...input,readOnly:true,request:{...input.request,body}}),{code:'NATIVE_DISPATCH_UNSUPPORTED'});
  assert.equal(calls,0);assert.equal(guarded,0);
  await authority.execute(actor,{...input,request:{method:'GET',url:'https://dev.to/api/articles'},readOnly:true});
  assert.equal(calls,1);assert.equal(guarded,1);
});

test('exact connection inventory rejects duplicate identities and missing native versions instead of freezing an unproven connection',async t=>{
  const f=fixture(),directory=await mkdtemp(join(tmpdir(),'chrono-native-inventory-'));t.after(async()=>{f.store.close();await rm(directory,{recursive:true,force:true});});
  const owner={kind:'personal',issuer:f.actors.solo.issuer,subject:'solo'};
  const binding={id:'selected',target:'dev',owner,slug:'dev',remoteBaseUrl:'https://dev.to/api',accountId:'person'};
  const file=join(directory,'connections.json');await writeFile(file,JSON.stringify([binding]));
  const authority=new NyxAuthority({connectionsFile:file} as Config,f.store);
  const service={id:'selected',slug:'dev',is_active:true,credential_source:{type:'personal'}};
  let services:any[]=[service];authority.call=async()=>({services});
  await assert.rejects(authority.connection(f.actors.solo,owner,'selected','dev'),{code:'NYXID_CONTRACT'});
  services=[{...service,state_version:1},{...service,state_version:2}];
  await assert.rejects(authority.connection(f.actors.solo,owner,'selected','dev'),{code:'NYXID_CONTRACT'});
  services=[{...service,state_version:0}];
  await assert.rejects(authority.connection(f.actors.solo,owner,'selected','dev'),{code:'NYXID_CONTRACT'});
  services=[{...service,state_version:0,updated_at:'2026-11-05T00:00:00.000Z'}];
  assert.equal((await authority.connection(f.actors.solo,owner,'selected','dev')).active,true);
});

test('exact execution validates current authority and rechecks binding after the final async callback',async t=>{
  const f=fixture();t.after(()=>f.store.close());
  const owner={kind:'personal',issuer:f.actors.solo.issuer,subject:'solo'},authority=new NyxAuthority({} as Config,f.store);
  const connection={id:'selected',target:'dev',owner,slug:'dev',remoteBaseUrl:'https://dev.to/api',accountId:'person',active:true,generation:'1',executionApproval:'exact' as const};
  let current=connection;authority.connection=async()=>current;
  const request={method:'POST',url:'https://dev.to/api/articles'};
  f.store.run('INSERT INTO nyx_approvals VALUES (?,?,?,?,?,?,?)','approved','selected','digest','create',canonicalJson(owner),'{}',digest(canonicalJson(request)));
  authority.approval=async()=>({state:'approved'});
  authority.validate=async(_actor,purpose)=>{assert.equal(purpose,'queued-write');throw new Error('Native credential expired');};
  let writes=0;authority.call=async()=>{writes++;return {};};
  const actor={...f.actors.solo,credentialSource:'direct-oauth' as const};
  const input={owner,connectionId:connection.id,target:'dev',connectionFingerprint:connectionFingerprint(connection),approvalRef:'approved',request,readOnly:false};
  await assert.rejects(authority.execute(actor,input),/Native credential expired/);
  await assert.rejects(authority.execute(actor,{...input,beforeWrite:async()=>{await Promise.resolve();current={...connection,generation:'2'};}}),{code:'CONNECTION_CHANGED'});
  assert.equal(writes,0);
});

test('a GraphQL query prefix or readOnly label cannot dispatch a mutation through the read path',async t=>{
  const f=fixture();t.after(()=>f.store.close());
  const owner={kind:'organization',issuer:f.actors.admin.issuer,subject:'org'},authority=new NyxAuthority({} as Config,f.store);
  const connection={id:'selected',target:'hashnode',owner,slug:'hashnode',remoteBaseUrl:'https://gql-beta.hashnode.com',accountId:'person',active:true,generation:'1'};
  authority.connection=async()=>connection;let calls=0;authority.call=async()=>{calls++;return {};};
  const input={owner,connectionId:connection.id,target:'hashnode',connectionFingerprint:connectionFingerprint(connection),readOnly:true};
  for(const body of [
    {query:`${HASHNODE_READ_QUERIES.post} mutation Unsafe { removePost(input:{id:"x"}) {post{id}} }`,operationName:'Unsafe'},
    {query:HASHNODE_READ_QUERIES.post,variables:{id:'x'},operationName:'Unsafe'},
    {query:'mutation Unsafe { removePost(input:{id:"x"}) {post{id}} }'},
  ])await assert.rejects(authority.execute(f.actors.admin,{...input,request:{method:'POST',url:connection.remoteBaseUrl,body}}),{code:'NATIVE_DISPATCH_UNSUPPORTED'});
  assert.equal(calls,0);
  await authority.execute(f.actors.admin,{...input,request:{method:'POST',url:connection.remoteBaseUrl,body:{query:HASHNODE_READ_QUERIES.post,variables:{id:'x'}}}});
  assert.equal(calls,1);
});
