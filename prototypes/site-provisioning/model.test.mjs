import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState,applyRequest,requestInfo,provideInfo,claim,registerSite,verifySite,canRequest,loadScenario} from './model.js';
const fields={name:'A bilingual journal',domain:'',note:''};
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
 const s=initialState(),r=applyRequest(s,'org',fields);claim(r);registerSite(r,'en','https://en.chronoai.example');assert.equal(r.sites.en.status,'checking');assert.equal(r.sites.zh.status,'pending');verifySite(r,'en',true);assert.equal(r.status,'partial');assert.equal(r.sites.en.status,'ready');assert.equal(r.sites.zh.status,'pending');
});
test('failure recovery never resets the ready language or identity',()=>{
 const s=initialState(),r=applyRequest(s,'org',fields);claim(r);for(const lang of ['en','zh'])registerSite(r,lang,`https://${lang}.chronoai.example`);verifySite(r,'en',true);const before=structuredClone(r.sites.en);verifySite(r,'zh',false);assert.equal(r.status,'partial');verifySite(r,'zh',true);assert.equal(r.status,'complete');assert.deepEqual(r.sites.en,before);assert.equal(s.outboundPaused,true);
});
test('verification requires registration; real or unsafe addresses are rejected',()=>{
 const s=initialState(),r=applyRequest(s,'org',fields);claim(r);assert.throws(()=>verifySite(r,'en',true),/SITE_REQUIRED/);
 for(const url of ['javascript:alert(1)','http://en.chronoai.example','https://actual-site.com'])assert.throws(()=>registerSite(r,'en',url),/DEMO_URL/);
});
test('switching UI locale and JSON persistence retain form drafts and request state',()=>{
 const s=initialState();s.forms.org={...fields,name:'保持当前输入'};applyRequest(s,'org',fields);s.locale='en';const saved=JSON.parse(JSON.stringify(s));assert.equal(saved.forms.org.name,'保持当前输入');assert.equal(saved.requests.org.name,fields.name);assert.equal(saved.outboundPaused,true);
});
test('partial demo and waiting-info demo keep honest readiness',()=>{
 const s=initialState();loadScenario(s,'org','partial');assert.equal(s.requests.org.sites.en.status,'ready');assert.equal(s.requests.org.sites.zh.status,'failed');loadScenario(s,'personal','info');assert.equal(s.requests.personal.status,'info');assert.equal(s.requests.org.sites.en.status,'ready');
});
test('claiming an information-blocked request preserves the block',()=>{
 const s=initialState(),r=applyRequest(s,'org',fields);requestInfo(r,'Confirm the name');claim(r);assert.equal(r.assignee,'Operations');assert.equal(r.status,'info');assert.throws(()=>registerSite(r,'en','https://en.chronoai.example'),/INVALID_STATE/);provideInfo(s,'org','Name confirmed');assert.equal(r.status,'working');
});
test('registering a changed address clears only that language’s old evidence',()=>{
 const s=initialState(),r=applyRequest(s,'org',fields);claim(r);for(const l of ['en','zh'])registerSite(r,l,`https://${l}.chronoai.example`);verifySite(r,'en',true);verifySite(r,'zh',false);const before=structuredClone(r.sites.en);registerSite(r,'zh','https://zh.updated.example');assert.equal(r.sites.zh.checkedAt,null);assert.deepEqual(r.sites.zh.checks,[]);assert.deepEqual(r.sites.en,before);
});
test('verification is tied to the registered address and rejects an old response',()=>{
 const s=initialState(),r=applyRequest(s,'org',fields);claim(r);registerSite(r,'en','https://en.first.example');registerSite(r,'en','https://en.second.example');assert.throws(()=>verifySite(r,'en',true,'https://en.first.example'),/URL_CHANGED/);assert.equal(r.sites.en.status,'checking');
});
