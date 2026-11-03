import {test} from 'node:test';
import assert from 'node:assert/strict';
import {distributionBody,planConfirmation,manualFollowup,connectionReturnOwner,copyAccountMatches} from '../web/studio/src/distribution-model.ts';
test('update/remove retain an explicit copy and never substitute a newer connection or copy',()=>{
 const form={target:'dev',connectionId:'original',action:'remove' as const,format:'full' as const,excerpt:'',copyId:'copy-old',rights:true,notBeforeAt:''};
 assert.equal(distributionBody('owner',form).copyId,'copy-old');
 assert.throws(()=>distributionBody('owner',{...form,copyId:''}),/copy/);
 assert.throws(()=>distributionBody('owner',{...form,rights:false}),/rights/);
 assert.equal(Object.hasOwn(distributionBody('owner',{...form,action:'create',copyId:''}),'copyId'),false);
});
test('due plan confirmation uses exact frozen excerpt and copy, never current draft text or latest copy',()=>{
 const task={id:'plan',ownerId:'owner',state:'due',allowedActions:['confirm'],snapshot:{markdown:'\uFEFFFrozen\r\nexcerpt'},plan:{releaseId:'release-old',target:'medium',connectionId:'original',action:'update',format:'excerpt',copyId:'copy-old',notBeforeAt:'2026-11-03T00:00:00Z',consumedDeliveryId:null}};
 const body=planConfirmation(task,true);assert.equal(body.excerpt,task.snapshot.markdown);assert.equal(body.copyId,'copy-old');assert.equal(body.planId,'plan');assert.equal(body.connectionId,'original');
 assert.throws(()=>planConfirmation({...task,state:'scheduled'},true),/due/);assert.throws(()=>planConfirmation({...task,snapshot:null},true),/snapshot/);
});
test('manual workflows include unsupported automatic actions and historical manual transitions',()=>{
 assert.equal(manualFollowup({automatic:true,automaticActions:['create','update']},'remove',[]),true);
 assert.equal(manualFollowup({automatic:true,automaticActions:['create','update']},'update',[{state:'manual_action_needed'}]),true);
 assert.equal(manualFollowup({automatic:true,automaticActions:['create','update']},'create',[]),false);
});
test('callback owner selection requires a current authorized connection capability and ignores status claims',()=>{
 const workspaces=[{id:'a',capabilities:{canPublish:true,canReadConnections:true}},{id:'b',capabilities:{canPublish:true,canReadConnections:false}}];
 assert.equal(connectionReturnOwner(workspaces,'a')?.id,'a');assert.equal(connectionReturnOwner(workspaces,'b'),null);assert.equal(connectionReturnOwner(workspaces,'unknown'),null);
});
test('a known copy cannot silently switch accounts under the same connection identity',()=>{
 assert.equal(copyAccountMatches('frozen-account','frozen-account'),true);
 assert.equal(copyAccountMatches('frozen-account','replacement-account'),false);
 assert.equal(copyAccountMatches('frozen-account',undefined),true,'an unavailable binding keeps its frozen account for explicit manual follow-up');
 assert.equal(copyAccountMatches(null,'replacement-account'),false);
});
