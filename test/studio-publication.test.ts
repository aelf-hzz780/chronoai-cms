import {test} from 'node:test';
import assert from 'node:assert/strict';
import {OperationIntent,publicationOptions} from '../web/studio/src/publication-model.ts';
import {isTaskActive,taskAssetBase} from '../web/studio/src/task-model.ts';
import {BoundedPoller} from '../web/studio/src/polling.ts';

test('publication choices bind live revision and pending release without treating configured as online',()=>{
 assert.deepEqual(publicationOptions('r2',null,[]).actions,['publish']);
 assert.deepEqual(publicationOptions('r2',{revisionId:'r1',releaseId:'live'},[]).actions,['update']);
 assert.deepEqual(publicationOptions('r1',{revisionId:'r1',releaseId:'live'},[]).actions,['update','unpublish']);
 const blocked=publicationOptions('r2',null,[{id:'queued-task',state:'verifying'}]);assert.deepEqual(blocked.actions,[]);assert.equal(blocked.pending?.id,'queued-task');
});
test('same confirmation retry retains an intent key while changed owner/revision/byline/action gets a new key',()=>{
 let serial=0;const intent=new OperationIntent(()=>`key-${++serial}`);const body={ownerId:'owner',revisionId:'r1',creditedAuthor:'Author',action:'publish',rightsConfirmed:true};
 const key=intent.keyFor(body);assert.equal(intent.keyFor({...body}),key);
 for(const changed of [{...body,ownerId:'other'},{...body,revisionId:'r2'},{...body,creditedAuthor:'Other'},{...body,action:'update'}])assert.notEqual(intent.keyFor(changed),key);
});
test('task snapshots use only a bound task asset path and kinds have distinct activity semantics',()=>{
 assert.equal(taskAssetBase({ownerId:'owner',kind:'release',id:'task'}),'/api/cms/owners/owner/tasks/release/task/assets/');
 assert.equal(isTaskActive({kind:'release',state:'published'}),false);assert.equal(isTaskActive({kind:'release',state:'verifying'}),true);
 assert.equal(isTaskActive({kind:'projection',state:'retry_wait'}),true);assert.equal(isTaskActive({kind:'projection',state:'complete'}),false);
 assert.equal(isTaskActive({kind:'media',state:'partial'}),false);assert.equal(isTaskActive({kind:'delivery',state:'approval_needed'}),false);
});
test('polling is bounded, pauses while hidden and cannot restart after abort or an in-flight late read',async()=>{
 let visible=true,exhausted=0,reads=0;let queued:(()=>void)|null=null;const delays:number[]=[];
 const scheduler={schedule:(fn:()=>void,delay:number)=>{queued=fn;delays.push(delay);return 1;},cancel:()=>{queued=null;},visible:()=>visible,onExhausted:()=>{exhausted++;},maxAttempts:2};
 const poller=new BoundedPoller(scheduler);const controller=new AbortController();
 poller.start(controller.signal,async()=>{reads++;return true;});assert.equal(delays[0],2000);
 visible=false;poller.visibilityChanged();assert.equal(queued,null);visible=true;poller.visibilityChanged();assert.ok(queued);
 await poller.tick();await poller.tick();assert.equal(reads,2);assert.equal(exhausted,1);assert.equal(queued,null);
 let resolve!: (value:boolean)=>void;poller.start(controller.signal,()=>new Promise(r=>{resolve=r;}));const pending=poller.tick();controller.abort();resolve(true);await pending;assert.equal(queued,null);
});
