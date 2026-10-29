import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {NyxAuthority,operationDigest,exactArguments} from '../src/nyxid.ts';
import {digest} from '../src/content.ts';
import {fixture} from './helpers.ts';
import type {Config} from '../src/config.ts';

test('NyxID native operation digest agrees with the official Unicode cross-language fixture',()=>{
  assert.equal(operationDigest('us-alpha','message.create','sha256:contract',{message:'你好 <team>'}),'sha256:1bcaa1b49841edd6af5c6787659938cfe47196f3c6d2e38b460d955c4ccad4e3');
  const endpoint={method:'PUT',path:'/articles/{id}',parameters:[{name:'id',in:'path',required:true}],request_body_schema:{type:'object'},request_content_type:'application/json'};
  assert.deepEqual(exactArguments(endpoint,'/articles/123',{method:'PUT',url:'https://dev.to/api/articles/123',body:{article:{title:'你好'}}}),{id:'123',article:{title:'你好'}});
  assert.equal(exactArguments(endpoint,'/elsewhere/123',{method:'PUT',url:'https://dev.to/api/elsewhere/123'}),null);
});

test('native NyxID inventory, exact approval and redemption never use a fallback account or a second proxy write',async t=>{
  const f=fixture(); const directory=await mkdtemp(join(tmpdir(),'chrono-nyx-contract-'));t.after(async()=>{f.store.close();await rm(directory,{recursive:true,force:true});});
  const owner={kind:'organization',issuer:f.actors.admin.issuer,subject:'org'};
  const binding={id:'org-dev',target:'dev',slug:'dev-org',owner,remoteBaseUrl:'https://dev.to/api',accountId:'author',organizationId:'dev-org-id',canPublish:true,canUpdate:true};
  const file=join(directory,'connections.json');await writeFile(file,JSON.stringify([binding]));
  const authority=new NyxAuthority({authorityUrl:'https://nyx.example',connectionsFile:file} as Config,f.store);
  const calls:any[]=[],request={method:'POST',url:'https://dev.to/api/articles',body:{article:{title:'Confirmed',body_markdown:'Exact body'}}};
  let source:any={type:'org',org_id:'org',allowed:true},approvalState='pending',exact:any,receipt:any;
  authority.call=async(_actor,path,method='GET',body?:any)=>{
    calls.push({path,method,body});
    if(path==='/api/v1/orgs')return {orgs:[{id:'org',your_role:'admin'}]};
    if(path==='/api/v1/user-services')return {services:[{id:'org-dev',slug:'dev-org',is_active:true,state_version:7,credential_source:source}]};
    if(path==='/api/v1/mcp/config')return {catalog_digest:'sha256:catalog',services:[{service_id:'org-dev',is_user_service:true,is_generic_proxy:false,endpoints:[{endpoint_id:'create-article',method:'POST',path:'/articles',parameters:null,request_content_type:'application/json',request_body_schema:{type:'object'},request_body_required:true,response:{content_types:['application/json'],binary_artifact:false}}]}]};
    if(path==='/api/v1/approvals/exact-service/requests'){exact={...body,request_id:'native-ref',state:'pending',operation_generation:4,expires_at:new Date(Date.now()+60000).toISOString()};return exact;}
    if(path.endsWith('/status'))return {...exact,state:approvalState,...(receipt?{receipt}:{})};
    if(path.endsWith('/redeem')) {assert.equal(body.operation_digest,exact.operation_digest);const response_body=JSON.stringify({id:123,url:'https://dev.to/a/post'});receipt={http_status:201,response_body,response_digest:`sha256:${digest(response_body)}`};approvalState='redeemed';return {...exact,state:'redeemed',receipt};}
    throw new Error('Unexpected native route');
  };
  assert.equal(await authority.membership(f.actors.admin,'org'),'admin');
  assert.equal(await authority.membership(f.actors.admin,'unknown'),null);
  await assert.rejects(authority.connection(f.actors.admin,{...owner,subject:'other'},'org-dev','dev'),{code:'CONNECTION_MISMATCH'});
  source={type:'personal'};await assert.rejects(authority.connection(f.actors.admin,owner,'org-dev','dev'),{code:'CONNECTION_MISMATCH'});source={type:'org',org_id:'org',allowed:true};
  const result=await authority.prepareApproval(f.actors.admin,owner,'org-dev','dev',request,'delivery','confirmed-digest','create');assert.equal(result.reference,'native-ref');
  await assert.rejects(authority.approval(f.actors.admin,owner,'native-ref','different-digest','org-dev','create'),{code:'APPROVAL_NEEDED'});
  await assert.rejects(authority.approval(f.actors.admin,owner,'native-ref','confirmed-digest','org-dev','create'),{code:'APPROVAL_NEEDED'});
  approvalState='approved';
  const {connectionFingerprint}=await import('../src/connection-proof.ts');
  const input={connectionFingerprint:connectionFingerprint(await authority.connection(f.actors.admin,owner,'org-dev','dev')),owner,connectionId:'org-dev',target:'dev',request,digest:'confirmed-digest',action:'create',approvalRef:'native-ref',readOnly:false};
  await assert.rejects(authority.execute(f.actors.admin,{...input,request:{...request,body:{article:{title:'Changed'}}}}),{code:'APPROVAL_NEEDED'});
  assert.equal((await authority.execute(f.actors.admin,input)).body.id,123);
  assert.equal((await authority.execute(f.actors.admin,input)).body.id,123);
  assert.equal(calls.filter(c=>c.path.endsWith('/redeem')).length,1);
  assert.equal(calls.filter(c=>c.path.startsWith('/api/v1/proxy/')).length,0);
  assert.throws(()=>authority.path(binding,{...request,url:'https://evil.example/articles'}),{code:'DESTINATION_ROUTE'});
});
test('R007: native execute rejects a resolved binding different from the frozen connection before proxy dispatch',async t=>{
  const f=fixture();t.after(()=>f.store.close());const owner={kind:'personal',issuer:f.actors.solo.issuer,subject:'solo'};
  const authority=new NyxAuthority({authorityUrl:'https://nyx.example'} as Config,f.store);
  const base={id:'solo-dev',target:'dev',slug:'dev',owner,remoteBaseUrl:'https://dev.to/api',accountId:'A',generation:'1'};
  const {connectionFingerprint}=await import('../src/distribution.ts');let writes=0;
  authority.connection=async()=>({...base,accountId:'B',generation:'2',active:true});authority.call=async()=>{writes++;return{};};
  await assert.rejects(authority.execute(f.actors.solo,{owner,connectionId:base.id,target:'dev',request:{method:'POST',url:'https://dev.to/api/articles'},connectionFingerprint:connectionFingerprint(base),beforeDispatch:()=>{},readOnly:false}),{code:'CONNECTION_CHANGED'});assert.equal(writes,0);
});
