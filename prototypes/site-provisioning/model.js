export const STORAGE_KEY='chronoai-site-prototype-v1';
export const workspaces={org:{name:'ChronoAI',kind:'organization',initials:'CH',slug:'chronoai'},personal:{name:'My journal',kind:'personal',initials:'ME',slug:'my-journal'},fieldnotes:{name:'Fieldnotes',kind:'organization',initials:'FN',slug:'fieldnotes'},alex:{name:'Alex’s journal',kind:'personal',initials:'AL',slug:'alex-journal'}};
const DEMO_PLATFORM_DOMAIN='chronoai.example';
export const demoSiteUrl=(owner,lang)=>`https://${workspaces[owner].slug}-${lang}.${DEMO_PLATFORM_DOMAIN}`;
const languages=['en','zh'];
const stamp=()=>new Date().toISOString();
const site=()=>({status:'pending',url:'',checkedAt:null,checks:[],attempts:0});
export const canRequest=(owner,role)=>owner==='personal'||owner==='org'&&role==='admin';
function demand(value,code){if(!value)throw new Error(code);}
function event(r,type,note='',language=''){r.updatedAt=stamp();r.events.push({type,note,language,at:r.updatedAt});}
function freshRequest(owner,fields,id){return {id,owner,name:fields.name.trim(),note:fields.note.trim(),status:'queued',assignee:null,submittedAt:stamp(),updatedAt:stamp(),infoReason:'',supplement:'',internalNote:'',sites:{en:site(),zh:site()},events:[{type:'submitted',at:stamp(),note:'',language:''}]};}
export function initialState(){
 const state={version:1,locale:'en',workspace:'org',role:'admin',mode:'user',scenario:'new',checkResult:'pass',readError:false,outboundPaused:true,counter:418,requests:{org:null,personal:null},forms:{org:{name:'ChronoAI Journal',note:''},personal:{name:'My journal',note:''}},drafts:{org:{title:'',body:''},personal:{title:'',body:''}},supplementDrafts:{},infoDrafts:{},operatorUrls:{},queueFilter:'all',queueSearch:'',activeLanguage:'en'};
 state.requests.fieldnotes=freshRequest('fieldnotes',{name:'Fieldnotes Journal',note:''},'REQ-2026-0416');state.requests.fieldnotes.assignee='Operations';state.requests.fieldnotes.status='working';event(state.requests.fieldnotes,'claimed');
 state.requests.alex=freshRequest('alex',{name:'Alex’s journal',note:''},'REQ-2026-0417');requestInfo(state.requests.alex,'Please confirm the public blog name. It will appear on both language sites.');return state;
}
export function applyRequest(s,owner,fields){demand(canRequest(owner,s.role),'PERMISSION');if(s.requests[owner])return s.requests[owner];demand(typeof fields.name==='string'&&fields.name.trim().length>0&&fields.name.trim().length<=80,'NAME_REQUIRED');demand(typeof fields.note==='string'&&fields.note.length<=1000,'INVALID_FIELDS');const r=freshRequest(owner,fields,`REQ-2026-${String(s.counter++).padStart(4,'0')}`);s.requests[owner]=r;return r;}
export function claim(r){demand(r&&r.status!=='complete','INVALID_STATE');r.assignee='Operations';r.status=r.status==='info'?'info':Object.values(r.sites).some(s=>s.status==='ready')?'partial':'working';event(r,'claimed');}
export function requestInfo(r,reason){demand(r&&r.status!=='complete','INVALID_STATE');demand(typeof reason==='string'&&reason.trim().length>0&&reason.length<=600,'INFO_REQUIRED');r.infoReason=reason.trim();r.status='info';event(r,'info',reason.trim());}
export function provideInfo(s,owner,text){demand(canRequest(owner,s.role),'PERMISSION');const r=s.requests[owner];demand(r?.status==='info','INVALID_STATE');demand(typeof text==='string'&&text.trim().length>0&&text.length<=1000,'INFO_REQUIRED');r.supplement=text.trim();r.status=r.assignee?'working':'queued';event(r,'supplement',r.supplement);}
export function registerSite(r,lang,url){demand(r&&languages.includes(lang)&&r.assignee&&r.status!=='info','INVALID_STATE');demand(r.sites[lang].status!=='ready','ALREADY_READY');let u;try{u=new URL(url);}catch{throw new Error('DEMO_URL');}demand(u.protocol==='https:'&&u.hostname.endsWith('.example')&&!u.username&&!u.password&&!u.port&&u.pathname==='/'&&!u.search&&!u.hash,'DEMO_URL');r.sites[lang].url=u.origin;r.sites[lang].status='checking';r.sites[lang].checks=[];r.sites[lang].checkedAt=null;r.status=Object.values(r.sites).some(s=>s.status==='ready')?'partial':'verifying';event(r,'registered','',lang);}
export function verifySite(r,lang,success,expectedUrl=r?.sites[lang]?.url){demand(r&&languages.includes(lang)&&r.assignee&&r.status!=='info','INVALID_STATE');const current=r.sites[lang];demand(current.url&&current.status!=='ready','SITE_REQUIRED');demand(current.url===expectedUrl,'URL_CHANGED');current.attempts++;current.checkedAt=stamp();current.checks=['ownership','https','connection','storage'].map((key,i)=>({key,ok:success||i!==1}));current.status=success?'ready':'failed';const values=Object.values(r.sites);r.status=values.every(s=>s.status==='ready')?'complete':values.some(s=>s.status==='ready')?'partial':values.some(s=>s.status==='failed')?'blocked':'verifying';event(r,success?'verified':'failed','',lang);if(r.status==='complete')event(r,'complete');}
export function loadScenario(s,owner,scenario){s.readError=scenario==='unavailable';s.scenario=scenario;s.activeLanguage='en';if(scenario==='unavailable')return;if(scenario==='new'){s.requests[owner]=null;return;}const r=freshRequest(owner,{name:owner==='org'?'ChronoAI Journal':'My journal',note:''},`REQ-2026-${String(s.counter++).padStart(4,'0')}`);s.requests[owner]=r;if(scenario==='queued')return;if(scenario==='info'){requestInfo(r,s.locale==='zh'?'请确认博客公开名称。这个名称会显示在中英文博客首页。':'Please confirm the public blog name. It will appear on both language sites.');return;}claim(r);if(scenario==='working')return;for(const lang of languages)registerSite(r,lang,demoSiteUrl(owner,lang));verifySite(r,'en',true);verifySite(r,'zh',scenario==='complete');}

export function normalizeSetupScope(s){
 const legacyReason='Please confirm whether you would like a platform address or your own domain.';
 const replacement='Please confirm the public blog name. It will appear on both language sites.';
 for(const form of Object.values(s.forms))if(form)delete form.domain;
 for(const r of Object.values(s.requests)){
  if(!r)continue;
  delete r.domain;
  if(r.infoReason===legacyReason)r.infoReason=replacement;
  for(const entry of r.events??[])if(entry.type==='info'&&entry.note===legacyReason)entry.note=replacement;
 }
 return s;
}
