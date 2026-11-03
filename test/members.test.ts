import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers.ts';
import {createApp} from '../src/app.ts';
import {Vault} from '../src/vault.ts';
import {NyxAuthority} from '../src/nyxid.ts';
import type {Config} from '../src/config.ts';

const member=(user_id:string,role='member',revoked_at:string|null=null)=>({membership_id:`membership-${user_id}`,user_id,display_name:`Name ${user_id}`,email:'PRIVATE_EMAIL',role,scope_source:'inherit',allowed_service_ids:['PRIVATE_SCOPE'],effective_allowed_service_ids:['PRIVATE_SCOPE'],created_at:'2026-01-01T00:00:00Z',revoked_at});
async function memberFixture(t:any){
  const f=fixture(),nyx=new NyxAuthority({} as Config);let actor=f.actors.admin,value:unknown={members:[member('admin','admin'),member('member'),member('viewer','viewer'),member('revoked','member','2026-01-02T00:00:00Z')]};
  let calls=0;nyx.call=async(_actor,path)=>{calls++;assert.equal(path,'/api/v1/orgs/org/members');return value;};f.policy.authority.organizationMembers=(...args)=>nyx.organizationMembers(...args);
  const app=await createApp({...f,vault:new Vault('ab'.repeat(32)),publicUrl:'https://cms.example',authenticate:async()=>actor});t.after(async()=>{await app.close();f.store.close();});
  return {...f,app,nyx,use(subject:string){actor=f.actors[subject];},actor(value:typeof actor){actor=value;},inventory(next:unknown){value=next;},calls(){return calls;}};
}
test('C05: Admin reads current safe directory with explicit Publisher assignment, including inactive and Viewer identities',async t=>{
  const f=await memberFixture(t);for(const subject of ['member','viewer','revoked'])f.store.run('INSERT INTO publishers VALUES (?,?)','org',subject);
  for(const entry of ['cms','service']){
    const response=await f.app.inject({url:`/api/${entry}/owners/org/members`});assert.equal(response.statusCode,200,response.body);
    assert.deepEqual(response.json(),{ownerId:'org',status:'available',members:[{identity:'admin',displayName:'Name admin',role:'admin',active:true,publisher:false},{identity:'member',displayName:'Name member',role:'member',active:true,publisher:true},{identity:'viewer',displayName:'Name viewer',role:'viewer',active:true,publisher:false},{identity:'revoked',displayName:'Name revoked',role:'member',active:false,publisher:false}]});
    assert.doesNotMatch(response.body,/PRIVATE_EMAIL|PRIVATE_SCOPE|scope_source|allowed_service_ids/);
  }
  assert.equal(f.calls(),2);f.inventory({members:[{...member('member'),display_name:null}]});assert.equal((await f.app.inject({url:'/api/cms/owners/org/members'})).json().members[0].displayName,'member');
});
test('C05: member directory requires current organization Admin and roles:write, not publishing authority',async t=>{
  const f=await memberFixture(t);f.store.run('INSERT INTO publishers VALUES (?,?)','org','publisher');
  for(const subject of ['publisher','member','outsider']){f.use(subject);assert.equal((await f.app.inject({url:'/api/cms/owners/org/members'})).statusCode,403);}
  f.actor({...f.actors.admin,scopes:['content:read','publish']});assert.equal((await f.app.inject({url:'/api/cms/owners/org/members'})).statusCode,403);
  f.use('admin');assert.equal((await f.app.inject({url:'/api/cms/owners/admin/members'})).statusCode,403);f.memberships.delete('admin:org');assert.equal((await f.app.inject({url:'/api/cms/owners/org/members'})).statusCode,403);
});
test('C05: malformed or unavailable current inventory is explicit unavailable and never fabricates an available empty directory',async t=>{
  const f=await memberFixture(t);
  for(const invalid of [{members:null},{members:[member('member','unknown')]},{members:[member('member'),member('member')]},{members:[{...member('member'),revoked_at:'bad-date'}]}]){
    f.inventory(invalid);const response=await f.app.inject({url:'/api/cms/owners/org/members'});assert.equal(response.statusCode,200,response.body);assert.deepEqual(response.json(),{ownerId:'org',status:'unavailable',members:[],code:'DIRECTORY_UNAVAILABLE'});
  }
  delete f.policy.authority.organizationMembers;assert.equal((await f.app.inject({url:'/api/cms/owners/org/members'})).json().status,'unavailable');
});
test('C05: granting Publisher validates an active eligible target and fails closed; revocation remains available during directory outage',async t=>{
  const f=await memberFixture(t);
  for(const subject of ['viewer','revoked','unknown'])await assert.rejects(f.policy.setPublisher(f.actors.admin,'org',subject,true,'trace'),{code:'PUBLISHER_INELIGIBLE'});
  await f.policy.setPublisher(f.actors.admin,'org','member',true,'trace');assert.ok(f.store.get('SELECT 1 FROM publishers WHERE owner_id=? AND subject=?','org','member'));
  f.policy.authority.organizationMembers=async()=>{throw Error('PRIVATE_PROVIDER_ERROR');};await assert.rejects(f.policy.setPublisher(f.actors.admin,'org','publisher',true,'trace'),{code:'DIRECTORY_UNAVAILABLE'});
  await f.policy.setPublisher(f.actors.admin,'org','member',false,'trace');assert.equal(f.store.get('SELECT 1 FROM publishers WHERE owner_id=? AND subject=?','org','member'),undefined);
  delete f.policy.authority.organizationMembers;await assert.rejects(f.policy.setPublisher(f.actors.admin,'org','publisher',true,'trace'),{code:'DIRECTORY_UNAVAILABLE'});
});
