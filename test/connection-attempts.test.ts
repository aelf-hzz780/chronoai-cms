import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers.ts';
import {createApp} from '../src/app.ts';
import {Vault} from '../src/vault.ts';
import {NyxAuthority} from '../src/nyxid.ts';
import type {Config} from '../src/config.ts';
import {commandRequest} from '../src/command-authority.ts';
import {AuthManager} from '../src/auth.ts';
import {digest} from '../src/content.ts';
import {Store} from '../src/store.ts';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {isolateRestoredPlatform} from '../src/recovery.ts';

async function connectionFixture(t:any){
  const f=fixture(),vault=new Vault('ab'.repeat(32));let actor=f.actors.solo;
  const config={publicUrl:'https://cms.example',allowLoopback:false,connectionSetup:{managementUrl:'https://nyx-ui.example/services',ttlSeconds:900,targets:{dev:{enabled:true,serviceSlug:'dev-catalog',scopes:['write:articles']}}}} as unknown as Config;
  const nyx=new NyxAuthority(config,f.store),calls:{path:string;method:string;body?:any}[]=[],bindings:any[]=[];
  let status='pending',createFailure=false,cancelRace=false,connectOrigin='https://nyx-ui.example',provenance:any={type:'personal'},active=true,creates=0;
  nyx.bindings=async()=>bindings;
  nyx.call=async(_actor,path,method='GET',body?:any)=>{
    calls.push({path,method,body});
    if(path==='/api/v1/connect-links'&&method==='POST'){creates++;if(createFailure)throw Error('PRIVATE_UPSTREAM_ERROR');return {id:`upstream-${creates}`,connect_url:`${connectOrigin}/connect?token=nyx_clk_PRIVATE_TOKEN`,expires_at:new Date(Date.now()+900_000).toISOString()};}
    if(path==='/api/v1/user-services')return {services:bindings.map(binding=>({id:binding.id,slug:binding.slug,is_active:active,state_version:1,credential_source:provenance}))};
    const match=/^\/api\/v1\/connect-links\/([^/]+)(\/cancel)?$/.exec(path);
    if(match){if(match[2]){if(cancelRace){status='completed';throw Error('already completed');}status='cancelled';}return {id:match[1],status,service_name:'DEV',service_slug:'dev-catalog',scopes:['write:articles'],expires_at:new Date(Date.now()+900_000).toISOString(),...(status==='completed'?{connected_service:{id:'connected-id',slug:'dev-user'}}:{})};}
    throw Error(`Unexpected fixture path ${path}`);
  };
  const {ConnectionAttemptService}=await import('../src/connection-attempts.ts');
  const {WorkspaceReadService}=await import('../src/workspace-read.ts');
  const connectionAttempts=new ConnectionAttemptService(new WorkspaceReadService(f.policy),nyx,vault,config);
  const app=await createApp({...f,vault,connectionAttempts,publicUrl:config.publicUrl,authenticate:async()=>actor});t.after(async()=>{await app.close();f.store.close();});
  const create=(owner='solo',extra:Record<string,unknown>={},entry='cms')=>app.inject({method:'POST',url:`/api/${entry}/owners/${owner}/connection-attempts`,payload:{target:'dev',idempotencyKey:'intent',...extra}});
  return {...f,app,vault,config,nyx,connectionAttempts,calls,bindings,create,use(subject:string){actor=f.actors[subject];},actor(value:typeof actor){actor=value;},status(value:string){status=value;},failCreate(){createFailure=true;},raceCancel(){cancelRace=true;},origin(value:string){connectOrigin=value;},source(value:any){provenance=value;},active(value:boolean){active=value;},bind(owner='solo'){bindings.push({id:'connected-id',target:'dev',slug:'dev-user',owner:{kind:owner==='org'?'organization':'personal',issuer:actor.issuer,subject:owner},remoteBaseUrl:'https://dev.to/api',accountId:'exact-account'});},creates(){return creates;}};
}

test('C06: missing setup is explicit unavailable instead of a fabricated connected state',async t=>{
  const f=fixture(),app=await createApp({...f,vault:new Vault('ab'.repeat(32)),publicUrl:'https://cms.example',authenticate:async()=>f.actors.solo});t.after(async()=>{await app.close();f.store.close();});
  const response=await app.inject({method:'POST',url:'/api/cms/owners/solo/connection-attempts',payload:{target:'dev',idempotencyKey:'intent'}});assert.equal(response.statusCode,503);assert.equal(response.json().code,'CONNECTION_SETUP_UNAVAILABLE');
});
test('C06: hosted create uses the exact official personal wire shape, encrypted token storage, one stable idempotent link and safe metadata GET',async t=>{
  const f=await connectionFixture(t),response=await f.create();assert.equal(response.statusCode,201,response.body);const created=response.json();assert.equal(created.flow,'hosted');assert.equal(created.status,'pending');assert.match(created.connectUrl,/nyx_clk_PRIVATE_TOKEN/);assert.equal(created.managementUrl,null);
  const request=f.calls.find(call=>call.method==='POST'&&call.path==='/api/v1/connect-links')!;assert.deepEqual(request.body,{service_slug:'dev-catalog',scopes:['write:articles'],callback_url:'https://cms.example/connections/return',expires_in:900});assert.ok(!('owner_id' in request.body));
  const cookie=response.cookies.find(cookie=>cookie.name==='chrono_connection_return')!;assert.ok(cookie.httpOnly&&cookie.secure);assert.equal(cookie.sameSite,'Lax');
  const stored=JSON.stringify(f.store.get('SELECT * FROM connection_attempts WHERE id=?',created.id));assert.doesNotMatch(stored,/PRIVATE_TOKEN|nyx_clk_|https:\/\/nyx-ui/);
  const retried=await f.create();assert.equal(retried.statusCode,201,retried.body);assert.equal(retried.json().id,created.id);assert.equal(retried.json().connectUrl,created.connectUrl);assert.equal(f.creates(),1);
  const detail=await f.app.inject({url:`/api/cms/owners/solo/connection-attempts/${created.id}`});assert.equal(detail.statusCode,200,detail.body);assert.ok(!('connectUrl' in detail.json()));assert.doesNotMatch(detail.body,/PRIVATE_TOKEN|nonce|upstream|actor|credential/);
  const conflict=await f.create('solo',{connectionId:'changed'});assert.equal(conflict.statusCode,409);
  const serviceCreate=await f.create('solo',{idempotencyKey:'service-intent'},'service');assert.equal(serviceCreate.statusCode,201,serviceCreate.body);assert.ok(!serviceCreate.cookies.some(cookie=>cookie.name==='chrono_connection_return'));
});
test('C06: organization setup is operator management only and requires one exact configured owner binding',async t=>{
  const f=await connectionFixture(t);f.use('admin');const response=await f.create('org');assert.equal(response.statusCode,201,response.body);const attempt=response.json();assert.equal(attempt.flow,'operator');assert.equal(attempt.connectUrl,null);assert.equal(attempt.managementUrl,f.config.connectionSetup!.managementUrl);assert.equal(f.creates(),0);
  let recheck=await f.app.inject({method:'POST',url:`/api/cms/owners/org/connection-attempts/${attempt.id}/recheck`,payload:{}});assert.equal(recheck.json().status,'binding_required');
  f.bind('org');f.source({type:'personal'});recheck=await f.app.inject({method:'POST',url:`/api/cms/owners/org/connection-attempts/${attempt.id}/recheck`,payload:{connectionId:'connected-id'}});assert.equal(recheck.json().status,'binding_required');
  f.source({type:'org',org_id:'org',allowed:true});recheck=await f.app.inject({method:'POST',url:`/api/service/owners/org/connection-attempts/${attempt.id}/recheck`,payload:{connectionId:'connected-id'}});assert.equal(recheck.statusCode,200,recheck.body);assert.equal(recheck.json().status,'connected');assert.equal(recheck.json().connectionId,'connected-id');assert.equal(f.creates(),0);
});
test('C06: completed personal flow requires exact current config binding, never a first account or wrong provenance',async t=>{
  const f=await connectionFixture(t),attempt=(await f.create()).json();f.status('completed');let response=await f.app.inject({method:'POST',url:`/api/cms/owners/solo/connection-attempts/${attempt.id}/recheck`,payload:{}});assert.equal(response.json().status,'binding_required');
  f.bind();f.source({type:'org',org_id:'org',allowed:true});response=await f.app.inject({method:'POST',url:`/api/cms/owners/solo/connection-attempts/${attempt.id}/recheck`,payload:{}});assert.equal(response.json().status,'binding_required');
  f.source({type:'personal'});response=await f.app.inject({method:'POST',url:`/api/cms/owners/solo/connection-attempts/${attempt.id}/recheck`,payload:{}});assert.equal(response.json().status,'connected');assert.equal(response.json().connectionId,'connected-id');
  f.active(false);response=await f.app.inject({url:`/api/cms/owners/solo/connection-attempts/${attempt.id}`});assert.equal(response.json().status,'binding_required');
});
test('C06: callback ignores untrusted query status/id, binds the current session and consumes encrypted nonce once',async t=>{
  const f=await connectionFixture(t),created=await f.create(),attempt=created.json(),cookie=created.cookies.find(cookie=>cookie.name==='chrono_connection_return')!;
  const header=`${cookie.name}=${cookie.value}`;f.status('completed');f.bind();const callback=await f.app.inject({url:'/connections/return?status=cancelled&connect_link_id=attacker&ownerId=forged',headers:{cookie:header}});assert.equal(callback.statusCode,302,callback.body);assert.equal(callback.headers.location,`/studio#/connections?ownerId=solo&attemptId=${attempt.id}`);
  const stored=f.store.get('SELECT * FROM connection_attempts WHERE id=?',attempt.id)!;assert.equal(stored.status,'connected');assert.ok(stored.return_consumed_at);assert.ok(f.calls.some(call=>call.path==='/api/v1/connect-links/upstream-1'));assert.ok(!f.calls.some(call=>call.path.includes('attacker')));
  const replay=await f.app.inject({url:'/connections/return',headers:{cookie:header}});assert.equal(replay.headers.location,'/studio#/connections?returnError=CONNECT_RETURN_INVALID');
  const second=await f.create('solo',{idempotencyKey:'second'}),secondCookie=second.cookies.find(cookie=>cookie.name==='chrono_connection_return')!;f.use('member');assert.equal((await f.app.inject({url:'/connections/return',headers:{cookie:`${secondCookie.name}=${secondCookie.value}`}})).headers.location,'/studio#/connections?returnError=FORBIDDEN');
});
test('C06: callback forgery, absent/expired cookie and cross-owner/actor operations cannot reach upstream mutations',async t=>{
  const f=await connectionFixture(t),created=await f.create(),attempt=created.json(),before=f.calls.length;
  for(const cookie of ['', 'chrono_connection_return=forged']){const response=await f.app.inject({url:'/connections/return?status=completed&ownerId=attacker',headers:{cookie}});assert.equal(response.statusCode,302);assert.equal(response.headers.location,'/studio#/connections?returnError=CONNECT_RETURN_INVALID');}
  await assert.rejects(f.connectionAttempts.returned(f.actors.solo,'forged','trace'),{code:'CONNECT_RETURN_INVALID'});
  assert.equal(f.calls.length,before);f.use('member');for(const action of ['', '/cancel','/recheck']){const response=await f.app.inject({method:action?'POST':'GET',url:`/api/cms/owners/solo/connection-attempts/${attempt.id}${action}`,...(action?{payload:{}}:{})});assert.equal(response.statusCode,403);}
  f.use('solo');f.store.run('UPDATE connection_attempts SET expires_at=? WHERE id=?',new Date(Date.now()-1000).toISOString(),attempt.id);const cookie=created.cookies.find(cookie=>cookie.name==='chrono_connection_return')!;assert.equal((await f.app.inject({url:'/connections/return',headers:{cookie:`${cookie.name}=${cookie.value}`}})).headers.location,'/studio#/connections?returnError=CONNECT_RETURN_INVALID');
  assert.equal((await f.app.inject({url:`/api/cms/owners/solo/connection-attempts/${attempt.id}`})).json().status,'expired');
});
test('C06: unknown create outcome is durable, never resent, and a new intent requires explicit acknowledgement',async t=>{
  const f=await connectionFixture(t);f.failCreate();const failed=await f.create();assert.equal(failed.statusCode,201,failed.body);assert.equal(failed.json().status,'failed');assert.equal(failed.json().code,'CONNECT_RESULT_UNKNOWN');assert.equal(failed.json().connectUrl,null);assert.doesNotMatch(failed.body,/PRIVATE_UPSTREAM/);
  const retry=await f.create();assert.equal(retry.json().id,failed.json().id);assert.equal(f.creates(),1);assert.equal(f.store.get('SELECT phase FROM connection_attempts WHERE id=?',failed.json().id)!.phase,'unknown');
  assert.equal((await f.create('solo',{idempotencyKey:'new'})).statusCode,409);await f.create('solo',{idempotencyKey:'new',acknowledgeUnknownResult:true});assert.equal(f.creates(),2);
});
test('C06: cancel completed race uses authoritative GET instead of claiming cancellation; config changes and wrong command paths block mutations',async t=>{
  const f=await connectionFixture(t),attempt=(await f.create()).json();f.raceCancel();f.bind();const response=await f.app.inject({method:'POST',url:`/api/cms/owners/solo/connection-attempts/${attempt.id}/cancel`,payload:{}});assert.equal(response.statusCode,200,response.body);assert.equal(response.json().status,'connected');
  f.config.connectionSetup!.targets.dev.serviceSlug='changed';const changed=await f.app.inject({method:'POST',url:`/api/cms/owners/solo/connection-attempts/${attempt.id}/recheck`,payload:{}});assert.equal(changed.json().code,'CONNECTION_CONFIGURATION_CHANGED');assert.ok(changed.json().status!=='connected');
  f.actor({...f.actors.solo,commandAuthority:{token:'not-used',request:commandRequest('POST','/api/service/wrong',Buffer.from('{}'),'application/json',null)}});assert.equal((await f.create('solo',{idempotencyKey:'wrong-command'})).statusCode,403);
});
test('C06: malicious connect URL origin is never returned and disabled or missing target config never dispatches a link',async t=>{
  const f=await connectionFixture(t);f.origin('https://evil.example');const unsafe=await f.create();assert.equal(unsafe.json().status,'failed');assert.equal(unsafe.json().connectUrl,null);assert.doesNotMatch(unsafe.body,/evil\.example/);
  f.config.connectionSetup!.targets.dev.enabled=false;assert.equal((await f.create('solo',{idempotencyKey:'disabled'})).statusCode,503);assert.equal(f.creates(),1);
});

test('C06: create rechecks current authority after dispatch and preserves unknown fence when permission is revoked mid-request',async t=>{
  const f=await connectionFixture(t),original=f.nyx.call.bind(f.nyx);f.nyx.call=async(...args)=>{const response=await original(...args);if(args[1]==='/api/v1/connect-links')f.revoked.add('solo');return response;};
  const response=await f.create();assert.equal(response.statusCode,401,response.body);assert.doesNotMatch(response.body,/PRIVATE_TOKEN/);assert.equal(f.store.get('SELECT phase FROM connection_attempts')!.phase,'unknown');
  f.revoked.delete('solo');await f.create();assert.equal(f.creates(),1);
});

test('C06: completed or cancelled idempotent attempts never reissue token URLs, and crash-dispatched fences never resend',async t=>{
  const f=await connectionFixture(t),first=(await f.create()).json();f.status('completed');assert.equal((await f.create()).json().connectUrl,null);assert.equal(f.creates(),1);
  f.status('pending');const second=(await f.create('solo',{idempotencyKey:'second'})).json();await f.app.inject({method:'POST',url:`/api/cms/owners/solo/connection-attempts/${second.id}/cancel`,payload:{}});assert.equal((await f.create('solo',{idempotencyKey:'second'})).json().connectUrl,null);
  const crash=(await f.create('solo',{idempotencyKey:'crash'})).json();f.store.run("UPDATE connection_attempts SET phase='create_dispatched',upstream_id=NULL,connect_url_cipher=NULL WHERE id=?",crash.id);const before=f.creates();const recovered=await f.create('solo',{idempotencyKey:'crash'});assert.equal(recovered.json().code,'CONNECT_RESULT_UNKNOWN');assert.equal(f.creates(),before);assert.ok(first.id);
});

test('C06: actual CMS session/CSRF transport protects create and callback requires the same currently valid session',async t=>{
  const f=await connectionFixture(t),auth=new AuthManager({...f.config,cmsAudience:'cms'} as Config,f.store,f.vault,f.policy);auth.accessToken=async()=>{await f.policy.scope(f.actors.solo,'content:read');return f.actors.solo;};
  const session='fixture-session',csrf='fixture-csrf';f.store.run('INSERT INTO sessions VALUES (?,?,?,?)',digest(session),f.vault.seal(f.actors.solo),csrf,new Date(Date.now()+60_000).toISOString());
  const app=await createApp({...f,vault:f.vault,auth,connectionAttempts:f.connectionAttempts,publicUrl:f.config.publicUrl,authenticate:request=>auth.authenticate(request)});t.after(()=>app.close());
  const request={method:'POST' as const,url:'/api/cms/owners/solo/connection-attempts',payload:{target:'dev',idempotencyKey:'session'},headers:{cookie:`chrono_session=${session}`}};
  assert.equal((await app.inject(request)).statusCode,403);assert.equal((await app.inject({...request,headers:{...request.headers,origin:'https://evil.example','x-csrf-token':csrf}})).statusCode,403);
  const created=await app.inject({...request,headers:{...request.headers,origin:f.config.publicUrl,'x-csrf-token':csrf}});assert.equal(created.statusCode,201,created.body);const cookie=created.cookies.find(cookie=>cookie.name==='chrono_connection_return')!;
  assert.equal((await app.inject({url:'/connections/return',headers:{cookie:`${cookie.name}=${cookie.value}`}})).headers.location,'/studio#/connections?returnError=SIGN_IN_REQUIRED');
  const callback=await app.inject({url:'/connections/return?status=completed',headers:{cookie:`chrono_session=${session}; ${cookie.name}=${cookie.value}`}});assert.equal(callback.statusCode,302,callback.body);assert.equal(f.store.get('SELECT status FROM connection_attempts WHERE id=?',created.json().id)!.status,'pending');
});

test('C06: additive migration preserves old rows and encrypted attempts across reopening',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'cms-connection-migration-')),path=join(directory,'cms.sqlite');t.after(()=>rm(directory,{recursive:true,force:true}));
  let store=new Store(path);store.createOwner('owner','personal','issuer','subject');store.db.exec('DROP TABLE connection_attempts; DELETE FROM migrations WHERE version=3');store.close();store=new Store(path);
  assert.equal(store.get('SELECT subject FROM owners WHERE id=?','owner')!.subject,'subject');assert.ok(store.get('SELECT 1 FROM migrations WHERE version=3'));
  store.run('INSERT INTO connection_attempts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)','attempt','owner','issuer','subject','dev','hosted','failed','unknown','digest',null,null,null,'encrypted',null,null,'2027-01-01','CONNECT_RESULT_UNKNOWN','2026-01-01','2026-01-01','trace');store.close();store=new Store(path);assert.equal(store.get('SELECT connect_url_cipher FROM connection_attempts WHERE id=?','attempt')!.connect_url_cipher,'encrypted');store.close();
});

test('C05/C06: service OpenAPI publishes current-member and safe connection-attempt operations without browser callback as a service capability',async t=>{
  const f=await connectionFixture(t),spec=(await f.app.inject({url:'/openapi.json'})).json();
  const create=spec.paths['/api/service/owners/{id}/connection-attempts'].post;assert.ok(create.requestBody.content['application/json'].schema.required.includes('idempotencyKey'));assert.ok('acknowledgeUnknownResult' in create.requestBody.content['application/json'].schema.properties);
  const read=spec.paths['/api/service/owners/{id}/connection-attempts/{attemptId}'].get.responses['200'].content['application/json'].schema;assert.ok(!('connectUrl' in read.properties));assert.deepEqual(read.properties.status.enum,['pending','connected','binding_required','cancelled','expired','failed']);
  assert.ok(spec.paths['/api/service/owners/{id}/members'].get.responses['200'].content['application/json'].schema.properties.members);assert.ok(!spec.paths['/api/service/connections/return']);
});

test('C06/WP08: outbound pause blocks only new hosted links; read-only status, operator setup and explicit cancellation remain available',async t=>{
  const f=await connectionFixture(t),existing=(await f.create()).json();f.store.run("UPDATE settings SET value='true' WHERE key='outbound_paused'");
  const blocked=await f.create('solo',{idempotencyKey:'paused'});assert.equal(blocked.statusCode,409,blocked.body);assert.equal(blocked.json().code,'OUTBOUND_PAUSED');assert.equal(f.creates(),1);
  assert.equal((await f.app.inject({url:`/api/cms/owners/solo/connection-attempts/${existing.id}`})).statusCode,200);
  assert.equal((await f.app.inject({method:'POST',url:`/api/cms/owners/solo/connection-attempts/${existing.id}/cancel`,payload:{}})).json().status,'cancelled');
  f.use('admin');assert.equal((await f.create('org')).json().flow,'operator');assert.equal(f.creates(),1);
});

test('C06/WP08: restore invalidates return capabilities and preserves unknown fences without falsely cancelling upstream links',async t=>{
  const f=await connectionFixture(t),created=await f.create(),attempt=created.json(),cookie=created.cookies.find(cookie=>cookie.name==='chrono_connection_return')!;
  f.use('admin');const operator=(await f.create('org')).json();isolateRestoredPlatform(f.store,'restore');
  for(const id of [attempt.id,operator.id]){const row=f.store.get('SELECT * FROM connection_attempts WHERE id=?',id)!;assert.equal(row.connect_url_cipher,null);assert.equal(row.nonce_hash,null);assert.equal(row.phase,'unknown');assert.equal(row.status,'failed');assert.equal(row.code,'RESTORED_CONNECTION_RECHECK_REQUIRED');}
  await assert.rejects(f.connectionAttempts.returned(f.actors.solo,cookie.value,'return'),{code:'CONNECT_RETURN_INVALID'});f.use('solo');const retry=await f.create();assert.equal(retry.json().connectUrl,null);assert.equal(f.creates(),1);assert.equal((await f.create('solo',{idempotencyKey:'new'})).statusCode,409);assert.ok(!f.calls.some(call=>call.path.endsWith('/cancel')));
});
