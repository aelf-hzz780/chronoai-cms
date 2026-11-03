import {test} from 'node:test';
import assert from 'node:assert/strict';
import {metricValue,metricQuery,defaultMetricFilters,trendPoints} from '../web/studio/src/analytics-model.ts';
import {canGrantPublisher,canRevokePublisher} from '../web/studio/src/members-model.ts';

test('metric availability distinguishes a real zero from absent and incomplete observations',()=>{
 assert.equal(metricValue({value:0,availability:'Available'},'en'),'0');
 assert.equal(metricValue({value:null,availability:'Unavailable'},'en'),'Unavailable');
 assert.equal(metricValue({value:12,availability:'Unavailable'},'zh'),'Unavailable');
 assert.equal(metricValue({value:null,availability:'Available'},'en'),'Unavailable');
});
test('metric filters preserve article/language/destination and inclusive UTC dates without inventing daily averages',()=>{
 assert.deepEqual(defaultMetricFilters(new Date('2026-11-03T23:30:00-08:00')),{from:'2026-10-29',to:'2026-11-04',article:'',language:'',destination:'ghost'});
 const query=metricQuery('owner',{from:'2026-11-01',to:'2026-11-03',article:'published-id',language:'zh',destination:'dev'});
 assert.deepEqual(Object.fromEntries(query),{ownerId:'owner',from:'2026-11-01',to:'2026-11-03',article:'published-id',language:'zh',destination:'dev'});
 assert.throws(()=>metricQuery('owner',{from:'2026-02-30',to:'',article:'',language:'',destination:'ghost'}),/UTC/);
 assert.throws(()=>metricQuery('owner',{from:'2026-11-03',to:'2026-11-01',article:'',language:'',destination:'ghost'}),/range/);
});
test('Ghost trend points use observed UTC days only and remain finite when all observations are zero',()=>{
 const rows=[{date:'2026-11-01',pageViews:0,estimatedDailyVisitors:0},{date:'2026-11-03',pageViews:0,estimatedDailyVisitors:0}];
 const points=trendPoints(rows,'pageViews');assert.equal(points.split(' ').length,2);assert.doesNotMatch(points,/NaN|Infinity/);assert.equal(trendPoints([],'pageViews'),'');
});
test('Publisher assignment is independent from publish capability and never grants inactive or viewer identities',()=>{
 const member={identity:'person',displayName:'Person',role:'member' as const,active:true,publisher:false,publisherAssigned:false};
 assert.equal(canGrantPublisher(member,true),true);assert.equal(canGrantPublisher(member,false),false);
 assert.equal(canGrantPublisher({...member,role:'viewer'},true),false);assert.equal(canGrantPublisher({...member,active:false},true),false);
 assert.equal(canGrantPublisher({...member,publisher:true,publisherAssigned:true},true),false);
 assert.equal(canRevokePublisher({...member,publisher:true,publisherAssigned:true},true),true);assert.equal(canRevokePublisher({...member,publisher:true,publisherAssigned:true},false),false);
 assert.equal(canGrantPublisher({...member,publisherAssigned:true,publisher:false},true),false);
 for(const changed of [{...member,active:false},{...member,role:'viewer' as const}])assert.equal(canRevokePublisher({...changed,publisherAssigned:true,publisher:false},true),true);
});
