// Domain-state regression checks for this static prototype. Browser layout is verified separately.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const elements = new Map();
const element = id => { if (!elements.has(id)) elements.set(id, { innerHTML:'', textContent:'', value:'', style:{}, classList:{add(){},remove(){}}, replaceChildren(){this.innerHTML='';}, focus(){}, insertAdjacentHTML(){}, scrollHeight:100 }); return elements.get(id); };
const location = {hash:'#content',origin:'http://localhost',pathname:'/'};
const context = vm.createContext({ console, localStorage:{getItem:()=>null,setItem(){}}, location, URLSearchParams, Set, Map, Blob, URL, TextDecoder, setTimeout:()=>1,clearTimeout(){},matchMedia:()=>({matches:false}), document:{documentElement:{dataset:{}},getElementById:element,querySelector:()=>null,addEventListener(){},activeElement:null,title:''},window:{addEventListener(){},scrollTo(){}},history:{pushState(a,b,url){location.hash=url;},replaceState(a,b,url){location.hash=url;}} });
for (const name of [...fs.readFileSync(path.join(__dirname,'index.html'),'utf8').matchAll(/<script src="([^?" ]+)/g)].map(m=>m[1])) vm.runInContext(fs.readFileSync(path.join(__dirname,name),'utf8'),context,{filename:name});
const run=code=>vm.runInContext(code,context);
let passed=0;
function check(name,fn){fn();passed++;console.log('PASS '+name);}
check('All 14 routes render',()=>{run("for(const route of routeNames){state.route=route;render();} state.route='content';");});
check('Member reads and exports only the public language snapshot',()=>{
  run("state.role='member';state.workspace='org';state.articleId='permissions';state.lang='zh';state.selected=new Set(['permissions']);var downloads=[];download=(name,text)=>downloads.push(text);actions['export-selected']();exportMarkdown();");
  assert.equal(run("canReadLanguage(current(),'en')"),false);
  assert.equal(run("downloads.every(text=>text===current().langs.zh.liveSnapshot.savedBody&&!text.includes('Permissions that move'))"),true);
});
check('Opening a distribution detail does not create tasks',()=>{
  run("state.role='publisher';state.articleId='oauth';state.lang='en';var before=copyJobs.length;state.route='distribution';render();");
  assert.equal(run('copyJobs.length'),run('before'));
});
check('Personal retry stays in personal authorization',()=>{
  run("state.workspace='personal';state.articleId='personal';state.lang='en';language().live=2;language().liveSnapshot=snapshot(language());var personalJob=createCopyJob('dev');addJobEvent(personalJob,'failed');activateCopy(personalJob);");
  assert.equal(run('personalJob.status'),'ready');
});
check('Unprovisioned personal workspace does not block organization',()=>{
  run("site.provisioning.personal=true;state.workspace='org';state.articleId='identity';state.lang='en';");
  assert.equal(run('confirmationProblem()'),null);
});
check('DEV missing data is unavailable, not zero',()=>{
  run("site.analyticsSource='dev';site.analyticsArticle='identity';site.analyticsLang='en';");
  assert.equal(run("counterMetric([], 'views').value"),null);
});
check('Public reader never falls back to a draft',()=>{
  run("site.publicOwner='org';site.publicLang='en';site.storyId='agent';");
  assert.equal(run("storyPage().includes('This story isn’t available')"),true);
  assert.equal(run("storyPage().includes('Building your first identity-aware agent')"),false);
});
check('Workspace and article deep links restore ownership',()=>{
  run("location.hash='#editor?id=personal&lang=zh&owner=personal';state.route='editor';syncPublicRoute();");
  assert.equal(run('state.workspace'),'personal');assert.equal(run('state.articleId'),'personal');assert.equal(run('state.lang'),'zh');
  run("location.hash='#analytics?owner=org';state.route='analytics';syncPublicRoute();");assert.equal(run('state.workspace'),'org');
});
check('Unknown article returns to content without substituting another',()=>{
  run("location.hash='#editor?id=missing&lang=en&owner=org';state.route='editor';syncPublicRoute();");assert.equal(run('state.route'),'content');
});
check('Browser history protects the old unsaved context',()=>{
  run("state.workspace='org';state.articleId='identity';state.lang='en';state.route='editor';language().body+=' unsaved';location.hash='#editor?id=personal&lang=zh&owner=personal';handleLocationChange();");
  assert.equal(run('state.articleId'),'identity');assert.equal(run('dirty()'),true);
  run('confirmedAction();');assert.equal(run('state.articleId'),'personal');assert.equal(run('state.lang'),'zh');
});
check('Logout restricts CMS while public reading remains open',()=>{
  run("site.signedIn=false;state.route='analytics';ensureSession();");assert.equal(run('state.route'),'login');
  run("state.route='blog';ensureSession();");assert.equal(run('state.route'),'blog');
});
check('Public locale does not alter CMS editing language',()=>{
  run("state.lang='en';site.publicLang='zh';site.publicOwner='org';site.storyId='identity';storyPage();");assert.equal(run('state.lang'),'en');
});
check('UI locale defaults to English and rejects invalid locales',()=>{
  assert.equal(run('uiLocale'),'en');
  run("setUiLocale('de')");
  assert.equal(run('uiLocale'),'en');
});
check('UI locale preserves unsaved content, publication confirmation and domain state',()=>{
  run("state.route='editor';state.workspace='org';state.articleId='identity';state.lang='zh';language().title='草稿中的信任';language().body='未保存正文';state.rights=true;state.release='processing';distributionState();var originalState=JSON.stringify({state,site,articles,tasks:[...distributionStates]});setUiLocale('zh');setUiLocale('en');");
  assert.equal(run('JSON.stringify({state,site,articles,tasks:[...distributionStates]})'),run('originalState'));
});
check('Locale changes never alter owner × language Ghost destinations',()=>{
  assert.equal(run("publicationTarget('org','en').displayAddress"),'chronoai.chronoai.example/en/');
  assert.equal(run("publicationTarget('org','zh').displayAddress"),'chronoai.chronoai.example/zh/');
  assert.equal(run("publicationTarget('personal','en').displayAddress"),'jing.chronoai.example/en/');
  assert.equal(run("publicationTarget('personal','zh').displayAddress"),'jing.chronoai.example/zh/');
  run("setUiLocale('zh')");
  assert.equal(run('sourceUrl()'),'https://chronoai.chronoai.example/zh/identity');
});
check('Public locale is independent and CMS preference is restored on return',()=>{
  run("setUiLocale('en');state.route='blog';site.publicLang='zh';");
  assert.equal(run('effectiveLocale()'),'zh');
  run("state.route='editor';");assert.equal(run('effectiveLocale()'),'en');
});
check('UI text roundtrip preserves canonical Chinese and leaves content nodes unchanged',()=>{
  run("var protectedText={nodeValue:'草稿中的信任',parentElement:{closest:()=>true}};localizeTextNode(protectedText);var uiText={nodeValue:'保存草稿',parentElement:{closest:()=>false}};localizeTextNode(uiText);");
  assert.equal(run('protectedText.nodeValue'),'草稿中的信任');
  assert.equal(run('uiText.nodeValue'),'Save draft');
  run("setUiLocale('zh');localizeTextNode(uiText)");assert.equal(run('uiText.nodeValue'),'保存草稿');
});
console.log(`${passed} prototype state checks passed.`);
