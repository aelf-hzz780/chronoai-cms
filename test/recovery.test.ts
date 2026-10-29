import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.ts';
import {encryptArchive,decryptArchive,snapshotPlatform,isolateRestoredPlatform} from '../src/recovery.ts';
import {Queue} from '../src/queue.ts';
test('encrypted snapshot restores content and private bytes while outbound remains paused and sessions expire',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'chrono-recovery-'));const store=new Store(join(dir,'source.sqlite'));t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true});});
  store.createOwner('solo','personal','issuer','subject');store.run('INSERT INTO sessions VALUES (?,?,?,?)','session','encrypted-credential','csrf','2099-01-01');
  const database=join(dir,'snapshot.sqlite');await snapshotPlatform(store,database);
  const cipher=join(dir,'archive.enc'),restored=join(dir,'restore.sqlite'),key='ef'.repeat(32);await encryptArchive(database,cipher,key);
  assert.ok(!(await readFile(cipher)).includes(Buffer.from('encrypted-credential')));await decryptArchive(cipher,restored,key);
  const target=new Store(restored);t.after(()=>target.close());isolateRestoredPlatform(target,'restore-trace');
  assert.equal(target.get('SELECT subject FROM owners')!.subject,'subject');assert.equal(target.get('SELECT count(*) AS n FROM sessions')!.n,0);assert.equal(new Queue(target).claim('release',()=>{}),null);
  const bytes=await readFile(cipher);bytes[30]^=1;const tampered=join(dir,'tampered.enc');await writeFile(tampered,bytes);
  await assert.rejects(decryptArchive(tampered,join(dir,'rejected.sqlite'),key));await assert.rejects(decryptArchive(cipher,join(dir,'wrong-key.sqlite'),'ab'.repeat(32)));
});
test('R010: duplicate owner restore projects are rejected by the real CLI before Docker or destination mutation',async t=>{
  const {spawnSync}=await import('node:child_process');const {access,mkdir}=await import('node:fs/promises');
  const dir=await mkdtemp(join(tmpdir(),'chrono-invalid-restore-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const bin=join(dir,'bin'),log=join(dir,'docker-called'),target=join(dir,'restored');await mkdir(bin);
  await writeFile(join(bin,'docker'),`#!/bin/sh\ntouch '${log}'\nexit 1\n`,{mode:0o755});
  const plan=join(dir,'plan.json');await writeFile(plan,JSON.stringify({dockerContext:'fake',sites:[{project:'source-a',restoreProject:'blogsystem-restore-same',enPort:3600,zhPort:3601},{project:'source-b',restoreProject:'blogsystem-restore-same',enPort:3610,zhPort:3611}]}));
  const result=spawnSync(process.execPath,['scripts/recovery.ts','restore',plan,target],{encoding:'utf8',env:{...process.env,PATH:`${bin}:${process.env.PATH}`,RECOVERY_BACKUP_KEY:'ef'.repeat(32)}});
  assert.notEqual(result.status,0);assert.match(result.stderr,/RESTORE_ISOLATION|distinct new restore project/);await assert.rejects(access(target));await assert.rejects(access(log));
});
