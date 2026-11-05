// Native migration isolates historical patched authority without erasing its audit.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers.ts';
import {Vault} from '../src/vault.ts';
import {AuthManager} from '../src/auth.ts';
import {CallerAuthorization} from '../src/caller-authorization.ts';
import {PublishingService,ReleaseWorker,type OriginalAdapter} from '../src/publishing.ts';
import type {Config} from '../src/config.ts';

test('native ingress rejects the retired proof even alongside otherwise valid propagated headers',async t=>{
 const f=fixture();t.after(()=>f.store.close());const auth=new AuthManager({} as Config,f.store,new Vault('ab'.repeat(32)),f.policy);
 for(const headers of [{'x-nyxid-command-authority':'old'},{'x-nyxid-command-authority':'old','x-nyxid-identity-token':'id','x-nyxid-delegation-token':'delegation'}])
  await assert.rejects(auth.authenticate({url:'/api/service/articles/x/releases',headers,cookies:{}} as any),{code:'LEGACY_COMMAND_RECONFIRMATION_REQUIRED'});
});

test('new confirmation and repeated idempotency never replace the original saved actor or revive cancellation',async t=>{
 const f=fixture();t.after(()=>f.store.close());const vault=new Vault('ab'.repeat(32)),pub=new PublishingService(f.content,vault);
 f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site','solo','en','http://localhost:3999','KEY_REF');
 const a=await f.content.create(f.actors.solo,{ownerId:'solo',language:'en',title:'Audit',markdown:'Body',creditedAuthor:'solo'},'draft');
 const input={ownerId:'solo',revisionId:a.revision.id,creditedAuthor:'solo',action:'publish',rightsConfirmed:true,idempotencyKey:'same'};
 const r=await pub.confirm(f.actors.solo,a.id,input,'first'),cipher=f.store.get('SELECT actor_json FROM releases WHERE id=?',r.id)!.actor_json;
 const confirmations=f.store.get('SELECT count(*) n FROM command_authorities')!.n;
 await pub.cancel(f.actors.solo,r.id,'cancel');
 const again=await pub.confirm({...f.actors.solo,credential:'new-credential'},a.id,input,'retry');
 assert.equal(f.store.get('SELECT count(*) n FROM command_authorities')!.n,confirmations);
 assert.equal(again.id,r.id);assert.equal(again.state,'cancelled');assert.equal(f.store.get('SELECT actor_json FROM releases WHERE id=?',r.id)!.actor_json,cipher);
 const renewed=await pub.confirm({...f.actors.solo,credential:'new-credential'},a.id,{...input,idempotencyKey:'new-explicit'},'new');
 assert.notEqual(renewed.id,r.id);assert.equal(f.store.get('SELECT actor_json FROM releases WHERE id=?',r.id)!.actor_json,cipher);
});
