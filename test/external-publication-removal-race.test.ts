import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers.ts';
import {Vault} from '../src/vault.ts';
import {PublishingService,ReleaseWorker} from '../src/publishing.ts';
import {DistributionService} from '../src/distribution.ts';
import {DevAdapter,TargetRegistry} from '../src/targets.ts';
import {ExternalPublicationService} from '../src/external-publication.ts';

// In-memory protocol tests. Neither NyxID nor DEV is contacted.
async function removalFixture(){
 const f=fixture(),actor=f.actors.solo;
 f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)','removal-site','solo','en','https://source.example','UNUSED_FIXTURE_KEY');
 const article=await f.content.create(actor,{ownerId:'solo',language:'en',title:'Removal race fixture',markdown:'Immutable local test body',creditedAuthor:'solo'},'source');
 const originals=new PublishingService(f.content,new Vault('ab'.repeat(32)));
 const release=await originals.confirm(actor,article.id,{ownerId:'solo',revisionId:article.revision.id,creditedAuthor:'solo',action:'publish',rightsConfirmed:true,idempotencyKey:'source'},'source');
 const original={async publish(){return {remoteId:'ghost-1',url:'https://source.example/original'};},async verify(){return true;},async reconcile(){return null;},async unpublish(){}};
 await new ReleaseWorker(originals,original).once();
 const posts=new Map<string,any>(),requests:Array<{method:string;url:string}>=[];
 const connection={id:'dev-connection',target:'dev',accountId:'4223973',active:true,canPublish:true,canUpdate:true,executionApproval:'native'};
 let capturedMissing:undefined|(()=>Promise<void>);
 const connections={async connection(){return connection;},async approval(){return {};},async execute(_actor:unknown,input:any){
  requests.push({method:input.request.method,url:input.request.url});
  if(capturedMissing){const afterMissing=capturedMissing;capturedMissing=undefined;await afterMissing();return {accountId:connection.accountId,status:404,body:{}};}
  const id=new URL(input.request.url).pathname.split('/').at(-1)!;
  return {accountId:connection.accountId,status:posts.has(id)?200:404,body:posts.get(id)??{}};
 }};
 const distribution=new DistributionService(originals,connections,new TargetRegistry([new DevAdapter('https://dev.to/api')]));
 const service=new ExternalPublicationService(distribution,original);
 const input={target:'dev',connectionId:connection.id,action:'create',format:'full',rightsConfirmed:true,idempotencyKey:'first'};
 const prepare=(key:string,copyId?:string)=>service.prepare(actor,release.id,{...input,idempotencyKey:key,...(copyId?{action:'update',copyId}:{})},key);
 const publish=async(intent:any,key:string)=>{
  posts.set('100',{...intent.request.body.article,id:100,url:'https://dev.to/author/removal-race',user:{user_id:4223973},published_at:new Date().toISOString()});
  return service.register(actor,intent.id,{remoteId:'100',idempotencyKey:key},key);
 };
 const first=await prepare('first');await publish(first,'register-first');const second=await prepare('second',first.id);await publish(second,'register-second');
 return {...f,actor,service,posts,requests,first,second,prepare,publish,
  afterCapturedMissing(run:()=>Promise<void>){capturedMissing=run;},
  state(id:string){return f.store.get('SELECT state FROM deliveries WHERE id=?',id)!.state;},
  verify(id=first.id){return service.followUp(actor,id,{action:'verify-removal'},'verify-removal');},
  requestRemoval(id=first.id){return service.followUp(actor,id,{action:'removal'},'request-removal');}
 };
}

test('IR03: a historical 404 cannot remove a newer copy registered while that response was in flight',async t=>{
 const f=await removalFixture();t.after(()=>f.store.close());const third=await f.prepare('third',f.second.id);await f.requestRemoval();
 f.afterCapturedMissing(async()=>{await f.publish(third,'register-third');});
 await assert.rejects(f.verify(),{code:'EXTERNAL_REMOVAL_STALE'});
 assert.equal(f.state(f.first.id),'superseded');assert.equal(f.state(f.second.id),'superseded');assert.equal(f.state(third.id),'published');
 assert.equal(f.posts.get('100').body_markdown,third.request.body.article.body_markdown);
 await assert.rejects(f.prepare('replacement-create'),{code:'DUPLICATE_TARGET'});
 assert.equal(f.store.all("SELECT * FROM external_publication_observations WHERE state='removed'").length,0);
 assert.ok(f.requests.every(request=>request.method==='GET'));
 // A retry must read DEV again and may not reuse the captured missing response.
 const reads=f.requests.length;await assert.rejects(f.verify(),{code:'REMOVAL_UNVERIFIED'});assert.ok(f.requests.length>reads);assert.equal(f.state(third.id),'published');
});

test('IR03: a new pending update invalidates an in-flight removal proof and keeps replacement create blocked',async t=>{
 const f=await removalFixture();t.after(()=>f.store.close());await f.requestRemoval();let third:any;
 f.afterCapturedMissing(async()=>{third=await f.prepare('third-during-removal',f.second.id);});
 await assert.rejects(f.verify(),{code:'EXTERNAL_REMOVAL_STALE'});
 assert.equal(f.state(f.second.id),'published');assert.equal(f.state(third.id),'awaiting_external');await assert.rejects(f.prepare('replacement-create'),{code:'DUPLICATE_TARGET'});
 assert.ok(f.requests.every(request=>request.method==='GET'));
});

test('IR03: a related verified generation change invalidates removal even when its published state is unchanged',async t=>{
 const f=await removalFixture();t.after(()=>f.store.close());await f.requestRemoval();
 const generation=f.store.get('SELECT generation FROM external_publications WHERE delivery_id=?',f.second.id)!.generation;
 f.afterCapturedMissing(async()=>{await f.service.sync(f.actor,f.second.id,'newer-evidence');});
 await assert.rejects(f.verify(),{code:'EXTERNAL_REMOVAL_STALE'});
 assert.equal(f.state(f.second.id),'published');assert.ok(f.store.get('SELECT generation FROM external_publications WHERE delivery_id=?',f.second.id)!.generation>generation);
 assert.equal(f.state(f.first.id),'superseded');assert.equal(f.store.all("SELECT * FROM external_publication_observations WHERE state='removed'").length,0);
});

test('IR03: an unchanged missing remote copy settles only verified histories and preserves outstanding updates',async t=>{
 const f=await removalFixture();t.after(()=>f.store.close());const third=await f.prepare('third-before-removal',f.second.id);await f.requestRemoval();f.posts.delete('100');
 const removed=await f.verify();assert.equal(removed.state,'removed');assert.equal(f.state(f.second.id),'removed');assert.equal(f.state(third.id),'awaiting_external');
 await assert.rejects(f.prepare('replacement-create'),{code:'DUPLICATE_TARGET'});assert.ok(f.requests.every(request=>request.method==='GET'));
});
