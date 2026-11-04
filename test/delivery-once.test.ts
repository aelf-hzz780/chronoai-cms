import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {Store} from '../src/store.ts';
import {Queue} from '../src/queue.ts';
import {fixture} from './helpers.ts';
import {Vault} from '../src/vault.ts';
import {PublishingService,ReleaseWorker} from '../src/publishing.ts';
import {DistributionService,DeliveryWorker} from '../src/distribution.ts';
import {TargetRegistry,DevAdapter} from '../src/targets.ts';

test('bounded claim selects only the requested resource and never expires another delivery lease',t=>{
  const store=new Store(':memory:');t.after(()=>store.close());const queue=new Queue(store),expired:string[]=[];
  for(const [id,state,lease] of [['older','queued',null],['other-running','running','2000-01-01T00:00:00.000Z'],['selected','queued',null]])
    store.run('INSERT INTO jobs VALUES (?,?,?,?,?,?)',id,'delivery',id,state,lease,'2020-01-01T00:00:00.000Z');
  assert.equal(queue.claim('delivery',id=>expired.push(id),'selected')?.resourceId,'selected');
  assert.equal(expired.length,0);
  assert.equal(store.get("SELECT state FROM jobs WHERE id='older'")!.state,'queued');
  assert.equal(store.get("SELECT state FROM jobs WHERE id='other-running'")!.state,'running');
  assert.equal(queue.claim('delivery',id=>expired.push(id),'missing'),null);
  assert.equal(expired.length,0);
  assert.throws(()=>queue.claim('delivery',()=>{},'  '),{code:'INVALID_INPUT'});
});

test('bounded claim expires only the selected lease and preserves the outbound pause',t=>{
  const store=new Store(':memory:');t.after(()=>store.close());const queue=new Queue(store),expired:string[]=[];
  for(const id of ['other','selected'])store.run('INSERT INTO jobs VALUES (?,?,?,?,?,?)',id,'delivery',id,'running','2000-01-01T00:00:00.000Z','2020-01-01T00:00:00.000Z');
  assert.equal(queue.claim('delivery',id=>expired.push(id),'selected')?.resourceId,'selected');
  assert.deepEqual(expired,['selected']);assert.equal(store.get("SELECT state FROM jobs WHERE id='other'")!.state,'running');
  store.run("UPDATE settings SET value='true' WHERE key='outbound_paused'");
  store.run('INSERT INTO jobs VALUES (?,?,?,?,?,?)','new','delivery','new','queued',null,'2020-01-01T00:00:00.000Z');
  assert.equal(queue.claim('delivery',()=>{},'new'),null);
  assert.equal(store.get("SELECT state FROM jobs WHERE id='new'")!.state,'queued');
});

test('bounded DeliveryWorker runs exactly one chosen copy and retains the final original guard',async t=>{
  const f=fixture();t.after(()=>f.store.close());const actor=f.actors.solo;
  f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','site','solo','en','http://localhost:3999','KEY');
  const originals=new PublishingService(f.content,new Vault('ab'.repeat(32))),writes:string[]=[];
  const original={async publish(input:any){return {remoteId:input.articleId,url:`http://localhost:3999/${input.articleId}/`};},async verify(){return true;},async reconcile(){return null;},async unpublish(){}};
  const remote=new Map<string,any>();
  const connections={async connection(_actor:any,owner:any,id:string,target:string){return {id,owner,target,accountId:'account',active:true,canPublish:true};},async approval(){return {};},async execute(_actor:any,input:any){
    await input.beforeWrite?.();input.beforeDispatch();
    if(input.request.method==='GET')return {accountId:'account',status:200,body:remote.get(input.request.url.split('/').at(-1))};
    const body=input.request.body.article,id=body.title;writes.push(id);const post={...body,id,url:`https://dev.to/account/${id}`,user:{user_id:'account'}};remote.set(id,post);return {accountId:'account',status:201,body:post};
  }};
  const distribution=new DistributionService(originals,connections,new TargetRegistry([new DevAdapter('https://dev.to/api')])),worker=new DeliveryWorker(distribution,original);
  async function create(title:string){
    const article=await f.content.create(actor,{ownerId:'solo',language:'en',title,markdown:'Frozen source',creditedAuthor:'solo'},'create');
    const release=await originals.confirm(actor,article.id,{ownerId:'solo',revisionId:article.revision.id,creditedAuthor:'solo',action:'publish',rightsConfirmed:true,idempotencyKey:title},'publish');await new ReleaseWorker(originals,original).once();
    const delivery=await distribution.request(actor,release.id,{target:'dev',connectionId:'dev',action:'create',format:'full',rightsConfirmed:true,idempotencyKey:title},`trace-${title}`);return {release,delivery};
  }
  const older=await create('older'),selected=await create('selected');
  assert.equal(await worker.once(selected.delivery.id),true);assert.deepEqual(writes,['selected']);
  assert.equal(f.store.get('SELECT state FROM deliveries WHERE id=?',selected.delivery.id)!.state,'published');
  assert.equal(f.store.get('SELECT state FROM deliveries WHERE id=?',older.delivery.id)!.state,'queued');
  f.store.run("UPDATE releases SET state='superseded' WHERE id=?",older.release.id);
  assert.equal(await worker.once(older.delivery.id),true);assert.deepEqual(writes,['selected']);
  assert.equal(f.store.get('SELECT error_code FROM deliveries WHERE id=?',older.delivery.id)!.error_code,'ORIGINAL_NOT_LIVE');
  assert.equal(await worker.once('unknown'),false);
});

test('single-delivery CLI defaults to a read-only, redacted preflight and validates flags before opening a database',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'chrono-delivery-once-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const database=join(directory,'platform.sqlite'),store=new Store(database),now=new Date().toISOString();
  store.createOwner('owner','personal','https://identity.example','user');
  store.run('INSERT INTO articles VALUES (?,?,?,?,?,?)','article','owner','en','user','revision',now);
  store.run('INSERT INTO revisions VALUES (?,?,?,?,?,?,?,?)','revision','article','Private title',Buffer.from('private-body-sentinel'),'digest','user','user',now);
  store.run('INSERT INTO releases VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)','release','article','revision','owner','encrypted-actor-sentinel','publish','published','original','https://original.example/article',null,'release-trace',now,now);
  store.run('INSERT INTO deliveries(id,release_id,owner_id,connection_id,target,action,format,digest,state,trace_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)','chosen','release','owner','connection','dev','create','full','digest','queued','confirmation-trace',now,now);
  store.run('INSERT INTO delivery_payloads VALUES (?,?,?)','chosen','encrypted-actor-sentinel',JSON.stringify({markdown:'private-body-sentinel'}));
  store.run('INSERT INTO jobs VALUES (?,?,?,?,?,?)','job','delivery','chosen','queued',null,now);store.close();
  const script=resolve('scripts/run-delivery-once.ts'),before=await readFile(database);
  const invoke=(args:string[],db=database)=>spawnSync(process.execPath,[script,...args],{encoding:'utf8',env:{PATH:process.env.PATH,DATABASE_PATH:db}});
  const result=invoke(['--delivery','chosen']);assert.equal(result.status,0,result.stderr);
  const receipt=JSON.parse(result.stdout);assert.equal(receipt.mode,'preflight');assert.equal(receipt.delivery.id,'chosen');assert.equal(receipt.delivery.traceId,'confirmation-trace');assert.equal(receipt.eligible,true);
  assert.match(receipt.traceId,/^[a-f0-9-]{36}$/);assert.doesNotMatch(result.stdout+result.stderr,/private-body-sentinel|encrypted-actor-sentinel|Private title/);
  assert.deepEqual(await readFile(database),before);
  for(const args of [[],['--execute'],['--delivery','chosen','--unexpected'],['--delivery','chosen','--execute','--dry-run'],['--delivery',' ']]){
    const invalid=invoke(args,join(directory,'does-not-exist.sqlite'));assert.equal(invalid.status,1);const error=JSON.parse(invalid.stderr);assert.equal(error.code,'INVALID_INPUT');assert.ok(error.traceId);assert.equal(invalid.stdout,'');
  }
  const paused=new Store(database);paused.run("UPDATE settings SET value='true' WHERE key='outbound_paused'");paused.close();
  const preview=JSON.parse(invoke(['--delivery','chosen']).stdout);assert.equal(preview.outboundPaused,true);assert.equal(preview.eligible,false);
  const blocked=invoke(['--delivery','chosen','--execute']);assert.equal(blocked.status,1);assert.equal(JSON.parse(blocked.stderr).code,'DELIVERY_NOT_RUNNABLE');
});
