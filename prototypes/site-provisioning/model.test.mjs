import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState,applyRequest,requestInfo,provideInfo,claim,registerBlogRoot,verifyRoot,verifySite,canRequest,loadScenario,normalizeSetupScope} from './model.js';
const fields={name:'A bilingual journal',note:''};
test('Owner/Admin can apply; publishing role alone cannot',()=>{
 assert.equal(canRequest('personal','member'),true);assert.equal(canRequest('org','admin'),true);
 for(const role of ['member','publisher'])assert.equal(canRequest('org',role),false);
 const s=initialState();s.role='publisher';assert.throws(()=>applyRequest(s,'org',fields),/PERMISSION/);
});
test('repeat application preserves request identity and fields',()=>{
 const s=initialState();const a=applyRequest(s,'org',fields);const b=applyRequest(s,'org',{...fields,name:'duplicate'});
 assert.equal(a.id,b.id);assert.equal(b.name,fields.name);assert.equal(b.status,'queued');
});
test('application fields and language scope remain separated by workspace',()=>{
 const s=initialState();const a=applyRequest(s,'org',fields);const b=applyRequest(s,'personal',{...fields,name:'Personal notes'});
 assert.notEqual(a.id,b.id);assert.equal(s.requests.org.name,fields.name);assert.equal(s.requests.personal.name,'Personal notes');assert.deepEqual(Object.keys(a.sites),['en','zh']);
});
test('supplement resumes the original request, ordinary member cannot submit',()=>{
 const s=initialState();const a=applyRequest(s,'org',fields);requestInfo(a,'Please confirm the public name.');s.role='member';assert.throws(()=>provideInfo(s,'org','Confirmed'),/PERMISSION/);s.role='admin';provideInfo(s,'org','Use ChronoAI Journal');assert.equal(a.status,'queued');assert.equal(a.supplement,'Use ChronoAI Journal');assert.equal(a.id,s.requests.org.id);
});
test('a URL alone is not readiness; only the registered language is verified',()=>{
 const s=initialState(),r=applyRequest(s,'org',fields);claim(r);registerBlogRoot(r,'https://richard.chronoai.example/');assert.equal(r.sites.en.status,'checking');assert.equal(r.sites.zh.status,'checking');verifySite(r,'en',true);assert.equal(r.status,'partial');assert.equal(r.sites.en.status,'ready');assert.equal(r.sites.zh.status,'checking');
});
test('failure recovery never resets the ready language or identity',()=>{
 const s=initialState(),r=applyRequest(s,'org',fields);claim(r);registerBlogRoot(r,'https://richard.chronoai.example/');verifySite(r,'en',true);const before=structuredClone(r.sites.en);verifySite(r,'zh',false);assert.equal(r.status,'partial');verifySite(r,'zh',true);assert.equal(r.status,'verifying');verifyRoot(r,true);assert.equal(r.status,'complete');assert.deepEqual(r.sites.en,before);assert.equal(s.outboundPaused,true);
});
test('verification requires registration; real or unsafe addresses are rejected',()=>{
 const s=initialState(),r=applyRequest(s,'org',fields);claim(r);assert.throws(()=>verifySite(r,'en',true),/SITE_REQUIRED/);
 for(const url of ['javascript:alert(1)','http://en.chronoai.example','https://actual-site.com'])assert.throws(()=>registerBlogRoot(r,url),/DEMO_URL/);
});
test('switching UI locale and JSON persistence retain form drafts and request state',()=>{
 const s=initialState();s.forms.org={...fields,name:'保持当前输入'};applyRequest(s,'org',fields);s.locale='en';const saved=JSON.parse(JSON.stringify(s));assert.equal(saved.forms.org.name,'保持当前输入');assert.equal(saved.requests.org.name,fields.name);assert.equal(saved.outboundPaused,true);
});
test('partial demo and waiting-info demo keep honest readiness',()=>{
 const s=initialState();loadScenario(s,'org','partial');assert.equal(s.requests.org.sites.en.status,'ready');assert.equal(s.requests.org.sites.zh.status,'failed');loadScenario(s,'personal','info');assert.equal(s.requests.personal.status,'info');assert.equal(s.requests.org.sites.en.status,'ready');
});
test('claiming an information-blocked request preserves the block',()=>{
 const s=initialState(),r=applyRequest(s,'org',fields);requestInfo(r,'Confirm the name');claim(r);assert.equal(r.assignee,'Operations');assert.equal(r.status,'info');assert.throws(()=>registerBlogRoot(r,'https://richard.chronoai.example/'),/INVALID_STATE/);provideInfo(s,'org','Name confirmed');assert.equal(r.status,'working');
});
test('changing the shared root invalidates both languages and the root check',()=>{
 const s=initialState(),r=applyRequest(s,'org',fields);claim(r);registerBlogRoot(r,'https://first.chronoai.example/');verifySite(r,'en',true);verifyRoot(r,true);verifySite(r,'zh',false);
 registerBlogRoot(r,'https://second.chronoai.example/');
 for(const lang of ['en','zh']){assert.equal(r.sites[lang].url,`https://second.chronoai.example/${lang}/`);assert.equal(r.sites[lang].status,'checking');assert.equal(r.sites[lang].checkedAt,null);assert.deepEqual(r.sites[lang].checks,[]);}
 assert.equal(r.rootCheck.status,'pending');assert.equal(r.status,'verifying');
});
test('stale language and root verification responses cannot apply to a new root',()=>{
 const s=initialState(),r=applyRequest(s,'org',fields);claim(r);registerBlogRoot(r,'https://first.chronoai.example/');const oldRoot=r.rootUrl,oldUrl=r.sites.en.url;registerBlogRoot(r,'https://second.chronoai.example/');
 assert.throws(()=>verifySite(r,'en',true,oldUrl),/URL_CHANGED/);verifySite(r,'en',true);assert.throws(()=>verifyRoot(r,true,oldRoot),/URL_CHANGED/);assert.equal(r.rootCheck.status,'pending');
});
test('root URL derives language paths and only accepts the demo platform domain',()=>{
 const s=initialState(),r=applyRequest(s,'org',fields);claim(r);
 for(const url of ['https://richard.chronoai.example/en/','https://richard.chronoai.example/?x=1','https://user@richard.chronoai.example/','https://richard.chronoai.example/#x','https://outside.example/','https://richard.chronoai.example:8443/'])assert.throws(()=>registerBlogRoot(r,url),/DEMO_URL/);
 registerBlogRoot(r,'https://richard.chronoai.example');assert.equal(r.rootUrl,'https://richard.chronoai.example/');assert.equal(r.sites.en.url,r.rootUrl+'en/');assert.equal(r.sites.zh.url,r.rootUrl+'zh/');
});
test('root verification is separate, fixed to English and required for completion',()=>{
 const s=initialState(),r=applyRequest(s,'org',fields);claim(r);registerBlogRoot(r,'https://richard.chronoai.example/');verifySite(r,'zh',true);assert.throws(()=>verifyRoot(r,true),/ENGLISH_REQUIRED/);assert.equal(r.rootCheck.status,'pending');verifySite(r,'en',true);s.locale='zh';assert.equal(r.status,'verifying');verifyRoot(r,false);assert.equal(r.status,'blocked');verifyRoot(r,true);assert.equal(r.rootCheck.target,r.sites.en.url);assert.equal(r.status,'complete');
});
test('registering the same root preserves successful checks',()=>{
 const s=initialState(),r=applyRequest(s,'org',fields);claim(r);registerBlogRoot(r,'https://richard.chronoai.example/');verifySite(r,'en',true);verifyRoot(r,true);const before=structuredClone(r);registerBlogRoot(r,'https://richard.chronoai.example');assert.deepEqual(r,before);
});

test('retiring domain preferences preserves existing requests and drafts',()=>{
 const s=initialState(),r=applyRequest(s,'org',fields);claim(r);registerBlogRoot(r,'https://richard.chronoai.example/');verifySite(r,'en',true);
 r.domain='previous-domain.example';s.forms.org.domain='draft-domain.example';s.drafts.org.title='Keep this draft';r.note='Keep the applicant note';
 const oldReason='Please confirm whether you would like a platform address or your own domain.';s.requests.alex.infoReason=oldReason;s.requests.alex.events.push({type:'info',note:oldReason});
 const id=r.id,ready=structuredClone(r.sites.en);normalizeSetupScope(s);
 assert.equal(Object.hasOwn(r,'domain'),false);assert.equal(Object.hasOwn(s.forms.org,'domain'),false);assert.equal(r.id,id);assert.deepEqual(r.sites.en,ready);assert.equal(r.note,'Keep the applicant note');assert.equal(s.drafts.org.title,'Keep this draft');assert.doesNotMatch(s.requests.alex.infoReason,/own domain/);assert.equal(s.requests.alex.events.at(-1).note,s.requests.alex.infoReason);
});

test('legacy split-domain migration preserves drafts and ownership but clears old proofs once',()=>{
 const s=initialState();loadScenario(s,'org','complete');const r=s.requests.org,id=r.id;delete r.addressLayout;r.sites.en.url='https://chronoai-en.chronoai.example';r.sites.zh.url='https://chronoai-zh.chronoai.example';r.infoReason='Confirm the public name';r.status='info';r.internalNote='Keep ops notes';s.drafts.org.title='Keep writing';s.operatorUrls={org:{en:'https://old.example'}};
 normalizeSetupScope(s);assert.equal(r.id,id);assert.equal(r.status,'info');assert.equal(r.assignee,'Operations');assert.equal(r.internalNote,'Keep ops notes');assert.equal(s.drafts.org.title,'Keep writing');assert.equal(r.rootCheck.status,'pending');assert.equal(r.sites.en.status,'checking');assert.equal(r.sites.zh.status,'checking');assert.deepEqual(r.sites.en.checks,[]);assert.equal(r.events.at(-1).type,'address-layout');assert.ok(r.events.some(entry=>entry.type==='legacy-complete'));assert.equal(r.events.some(entry=>entry.type==='complete'),false);assert.equal(Object.hasOwn(s,'operatorUrls'),false);
 const after=structuredClone(s);normalizeSetupScope(s);assert.deepEqual(s,after);
});
