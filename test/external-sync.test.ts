import {test} from 'node:test';
import assert from 'node:assert/strict';
import {externalSyncConfig,runExternalSync} from '../src/external-sync.ts';
import {AppError} from '../src/errors.ts';

test('external synchronization validates configured bounds without enabling a delivery worker',()=>{
  assert.deepEqual(externalSyncConfig({}),{intervalMs:900_000,pollMs:30_000,batchSize:20});
  for(const env of [{EXTERNAL_SYNC_INTERVAL_MS:'0'},{EXTERNAL_SYNC_POLL_MS:'NaN'},{EXTERNAL_SYNC_BATCH_SIZE:'101'}])assert.throws(()=>externalSyncConfig(env),/External sync/);
});

test('read-only scheduler is sequential, records safe trace errors and stops on cancellation',async()=>{
  const abort=new AbortController(),events:any[]=[];let calls=0,active=0,maxActive=0;
  await runExternalSync({async syncDue(limit){assert.equal(limit,3);active++;maxActive=Math.max(active,maxActive);calls++;await Promise.resolve();active--;if(calls===1)throw new AppError(503,'READ_SOURCE_UNAVAILABLE','private token must not appear');}},abort.signal,{intervalMs:60_000,pollMs:1000,batchSize:3},event=>events.push(event),async()=>{if(calls===2)abort.abort();});
  assert.equal(calls,2);assert.equal(maxActive,1);assert.equal(events.length,1);assert.equal(events[0].code,'READ_SOURCE_UNAVAILABLE');assert.ok(events[0].traceId);assert.doesNotMatch(JSON.stringify(events),/private token/);
});

test('an already stopped scheduler performs zero reads or writes',async()=>{
  await runExternalSync({async syncDue(){assert.fail('must not run');}},AbortSignal.abort(),externalSyncConfig({}));
});
