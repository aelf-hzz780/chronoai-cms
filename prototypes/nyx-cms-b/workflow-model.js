'use strict';
// In-memory domain model: frozen versions, owner-scoped jobs and exact connections.
const originalJobs=[],copyJobs=[],knownCopies=[],prototypeMedia=new Map(),workflowTimers=new Set();
let workflowSequence=0;
const nextWorkflowId=prefix=>`${prefix}-${++workflowSequence}`;
const nowStamp=()=>new Date().toLocaleTimeString('en-GB',{hour12:false});
const connectionMeta={};
for(const w of Object.values(workspaces)){
  connectionStates[w.id]??={dev:'unconfigured',hashnode:'unconfigured'};
  Object.assign(connectionStates[w.id],{medium:w.id==='org'?'connected':'unconfigured',hacker:'unconfigured'});
  if(w.kind==='personal')connectionStates[w.id].hashnode='unsupported';
  connectionMeta[w.id]={};
  for(const c of channelCatalog)connectionMeta[w.id][c.id]={owner:w.id,channel:c.id,id:`${w.id}-${c.id}-connection`,account:w.kind==='personal'?'Jing Chen':w.name,verifiedAt:connectionStates[w.id][c.id]==='connected'?'14:00':null};
}
connectionMeta.org.dev.account='@chronoai-team';connectionMeta.personal.dev.account='@jing-demo';
site.settings.lab={name:'Research Lab',description:'Research notes and experiments.',language:'en'};
site.provisioning={org:{en:false,zh:false},personal:{en:false,zh:true},lab:{en:false,zh:true}};
articles.push({id:'lab-notes',owner:'lab',creator:'self',author:'Jing Chen',initials:'JC',color:'',category:'Research',updated:'刚刚',status:'draft',langs:{en:langData('Notes from the research lab','## A new experiment\n\nThis draft belongs to Research Lab.',1)}});
function isSiteReady(owner,lang){const v=site.provisioning[owner];return typeof v==='boolean'?!v:!v?.[lang];}
function revisionList(l){if(!l.revisions){l.revisions=[];for(const s of [l.liveSnapshot,l.submittedSnapshot,snapshot(l)])if(s&&!l.revisions.some(x=>x.version===s.version))l.revisions.push(Object.freeze({...s,createdAt:'14:00'}));}return l.revisions;}
for(const a of articles)for(const l of Object.values(a.langs))revisionList(l);
function readableRevisions(a,lang){const l=a.langs[lang];if(!site.signedIn||!accessibleWorkspace(a.owner)||a.owner!==state.workspace||!l||!canReadLanguage(a,lang))return [];const rows=revisionList(l);return a.creator==='self'?rows:rows.filter(r=>r.version===l.liveSnapshot?.version||(canPublishOwner(a.owner)&&r.version===l.submittedSnapshot?.version));}
function selectedRevision(a,lang,version){return readableRevisions(a,lang).find(r=>r.version===Number(version));}
function languageState(a,lang){const l=a.langs[lang];if(l.submittedSnapshot)return 'submitted';if(l.liveSnapshot&&!taskStateFor(a,lang)?.originalOffline)return l.version>l.live?'changed':'published';return 'draft';}
function matchesArticleStatus(a,status){return status==='all'||Object.keys(a.langs).some(k=>canReadLanguage(a,k)&&(status==='published'?isPublic(a,k):status==='draft'?a.creator==='self'&&['draft','changed'].includes(languageState(a,k)):languageState(a,k)===status));}
function preferredArticleLanguage(a){const keys=Object.keys(a.langs).filter(k=>canReadLanguage(a,k));return keys.find(k=>(state.languageFilter==='all'||k===state.languageFilter)&&(state.tab==='all'||(state.tab==='published'?isPublic(a,k):languageState(a,k)===state.tab)))||keys[0]||'en';}
function addJobEvent(job,stateCode,note=''){job.status=stateCode;job.events.unshift({state:stateCode,time:nowStamp(),note});}
function taskAuthorized(job){return job.actor==='self'&&canPublishOwner(job.owner)&&articles.some(a=>a.id===job.articleId&&a.owner===job.owner);}
function safeWorkflowRender(){if(state.route!=='editor'||!dirty())render();}
function scheduleWorkflow(fn,delay){const timer=setTimeout(()=>{workflowTimers.delete(timer);fn();},delay);workflowTimers.add(timer);return timer;}
function latestOriginal(articleId=state.articleId,lang=state.lang){return originalJobs.filter(j=>j.articleId===articleId&&j.lang===lang).at(-1);}
function createOriginalJob(action='publish'){
  if(confirmationProblem()||!canPublish()||!state.rights)return null;
  if(originalJobs.some(j=>j.articleId===state.articleId&&j.lang===state.lang&&['queued','verifying','uncertain'].includes(j.status)))return null;
  const job={id:nextWorkflowId('original'),actor:'self',owner:state.workspace,articleId:state.articleId,lang:state.lang,action,snapshot:Object.freeze({...snapshot(language())}),host:publicationTarget().displayAddress,status:'queued',events:[],outcome:site.originalOutcome||'published'};
  originalJobs.push(job);addJobEvent(job,'queued');
  scheduleWorkflow(()=>advanceOriginal(job.id),1800);return job;
}
function advanceOriginal(id){const j=originalJobs.find(x=>x.id===id);if(!j||!['queued','verifying'].includes(j.status))return;
  if(!taskAuthorized(j)){addJobEvent(j,'blocked','Current publishing permission is unavailable');safeWorkflowRender();return;}
  if(!isSiteReady(j.owner,j.lang)){addJobEvent(j,'blocked','This language site is not provisioned');safeWorkflowRender();return;}
  if(j.status==='queued'){addJobEvent(j,'verifying');scheduleWorkflow(()=>advanceOriginal(j.id),1400);}
  else if(j.outcome==='uncertain')addJobEvent(j,'uncertain');else if(j.outcome==='failed')addJobEvent(j,'failed');else completeOriginal(j);
  safeWorkflowRender();
}
function completeOriginal(j,readOnly=false){if(!['verifying','uncertain'].includes(j.status))return;const a=articles.find(a=>a.id===j.articleId),l=a.langs[j.lang];
  if(j.action!=='unpublish'){j.mediaStatus=(j.outcome==='partial_media'||readOnly)&&mediaForJob(j).length?'incomplete':'ready';if(j.mediaStatus==='ready')publishJobMedia(j);l.live=j.snapshot.version;l.liveSnapshot=j.snapshot;if(l.submittedSnapshot?.version===j.snapshot.version){l.submitted=0;l.submittedSnapshot=null;}}
  const key=a.id+':'+j.lang,t=distributionStates.get(key)||{events:[]};t.originalOffline=j.action==='unpublish';distributionStates.set(key,t);addJobEvent(j,j.action==='unpublish'?'unpublished':'published');
}
function cancelJob(j){if(!j||!taskAuthorized(j)||!['queued','approval_needed','ready','scheduled','manual_action_needed'].includes(j.status))return false;addJobEvent(j,'cancelled');return true;}
function reconcileOriginal(j,result){if(!j||j.status!=='uncertain'||!canPublishOwner(j.owner)||!site.signedIn)return false;if((j.action==='unpublish'&&result==='missing')||(j.action!=='unpublish'&&result==='published'))completeOriginal(j,true);else if(['published','missing'].includes(result))addJobEvent(j,'failed','Verified that the requested change did not complete; confirm a new task before sending');else addJobEvent(j,'uncertain');return true;}
function automaticCopyAction(channel,action){return ({dev:['create','update'],hashnode:['create','update','remove'],medium:[],hacker:[]}[channel]||[]).includes(action);}
function canStartCopy(owner,channel){return canPublishOwner(owner)&&connectionStates[owner]?.[channel]==='connected'&&connectionMeta[owner]?.[channel]?.owner===owner;}
function copyTasks(a=state.articleId,lang=state.lang){return copyJobs.filter(j=>j.articleId===a&&j.lang===lang);}
function copyFor(channel,a=state.articleId,lang=state.lang){return knownCopies.find(c=>c.articleId===a&&c.lang===lang&&c.channel===channel&&!c.removed);}
function fingerprintCopy(j){return JSON.stringify([j.owner,j.articleId,j.lang,j.snapshot.version,j.snapshot.savedBody,j.channel,j.connectionId,j.account,j.action,j.format,j.excerpt,j.copyId,j.sourceUrl]);}
function copyProblem(j,allowLost=false){const a=articles.find(a=>a.id===j.articleId);if(!taskAuthorized(j))return 'Publishing permission is no longer available';if(!canStartCopy(j.owner,j.channel)&&!allowLost)return 'Reconnect and verify the designated account';if(j.action!=='remove'&&(!isPublic(a,j.lang)||a.langs[j.lang].live!==j.snapshot.version))return 'The original changed; create a new confirmation';if(j.connectionId!==connectionMeta[j.owner][j.channel].id||j.account!==connectionMeta[j.owner][j.channel].account)return 'The designated account changed';return null;}
function createCopyJob(channel,{action='create',format='full',excerpt='',delay='',copyId=null}={}){
  const a=current(),l=language(),copy=knownCopies.find(c=>c.id===copyId);if(!canPublish()||state.lang!=='en')return null;
  if(channel==='hashnode'&&workspaceKind()==='personal')return null;
  if(action==='create'&&copyFor(channel,a.id,state.lang))return null;
  if(action!=='create'&&(!copy||copy.owner!==state.workspace||copy.articleId!==a.id||copy.lang!==state.lang||copy.channel!==channel))return null;
  const lost=!canStartCopy(state.workspace,channel);if(lost&&!copy)return null;
  if(action!=='remove'&&!isPublic(a,state.lang))return null;
  if(format==='excerpt'&&!excerpt.trim())return null;
  if(copyJobs.some(j=>j.articleId===a.id&&j.lang===state.lang&&j.channel===channel&&!['published','removed','cancelled','failed','rejected','blocked'].includes(j.status)))return null;
  const c=connectionMeta[state.workspace][channel];const j={id:nextWorkflowId('delivery'),actor:'self',owner:state.workspace,articleId:a.id,lang:state.lang,channel,connectionId:copy?.connectionId||c.id,account:copy?.account||c.account,action,format,excerpt,delay,copyId,snapshot:Object.freeze({...l.liveSnapshot}),sourceUrl:sourceUrl(),status:'',events:[],publicUrl:copy?.url||'',submissionUrl:'',note:'',approval:null,lost};
  j.digest=fingerprintCopy(j);copyJobs.push(j);const automatic=automaticCopyAction(channel,action)&&!lost;
  addJobEvent(j,delay?'scheduled':automatic?(workspaceKind()==='organization'?'approval_needed':'ready'):'manual_action_needed');return j;
}
function activateCopy(j){if(j?.status==='scheduled'&&Date.parse(j.delay)>Date.now())return false;if(!j||!['scheduled','failed','blocked'].includes(j.status)||copyProblem(j)||fingerprintCopy(j)!==j.digest)return false;j.approval=null;addJobEvent(j,automaticCopyAction(j.channel,j.action)?(workspaceKind(j.owner)==='organization'?'approval_needed':'ready'):'manual_action_needed');return true;}
function approveCopy(j){if(!j||j.status!=='approval_needed'||copyProblem(j)||fingerprintCopy(j)!==j.digest)return false;j.approval=j.digest;addJobEvent(j,'ready');return true;}
function runCopy(j,outcome='published'){if(!j||j.status!=='ready'||copyProblem(j)||fingerprintCopy(j)!==j.digest)return false;if(workspaceKind(j.owner)==='organization'&&j.approval!==j.digest)return false;addJobEvent(j,'verifying');scheduleWorkflow(()=>{if(j.status!=='verifying')return;if(copyProblem(j)){addJobEvent(j,'blocked');}else if(outcome==='uncertain'||outcome==='failed'){addJobEvent(j,outcome);}else finishCopy(j);safeWorkflowRender();},1500);return true;}
function platformUrl(channel,value){try{const u=new URL(value);const hosts={dev:['dev.to'],hashnode:['hashnode.com','hashnode.dev'],medium:['medium.com'],hacker:['hackernoon.com']};return u.protocol==='https:'&&!u.username&&!u.password&&u.pathname!=='/'&&hosts[channel].some(h=>u.hostname===h||u.hostname.endsWith('.'+h));}catch{return false;}}
function finishCopy(j,url=j.publicUrl){if(!['verifying','uncertain','manual_action_needed','submitted','reviewing','rejected'].includes(j.status))return false;
  if(j.action==='remove'){const c=knownCopies.find(c=>c.id===j.copyId);if(c)c.removed=true;addJobEvent(j,'removed');return true;}
  const domains={dev:'dev.to',hashnode:'chronoai.hashnode.dev',medium:'medium.com',hacker:'hackernoon.com'};
  const finalUrl=url||`https://${domains[j.channel]}/demo-${j.articleId}`;if(!platformUrl(j.channel,finalUrl))return false;
  let c=knownCopies.find(c=>c.id===j.copyId);if(!c){c={id:nextWorkflowId('copy'),owner:j.owner,articleId:j.articleId,lang:j.lang,channel:j.channel};knownCopies.push(c);j.copyId=c.id;}
  Object.assign(c,{connectionId:j.connectionId,account:j.account,url:finalUrl,version:j.snapshot.version,body:j.format==='excerpt'?j.excerpt:j.snapshot.savedBody,removed:false});j.publicUrl=finalUrl;addJobEvent(j,'published');return true;
}
function recordManual(j,{status,url='',note='',sourceChecked=false}){if(!j||!taskAuthorized(j))return 'Permission changed';if(!['manual_action_needed','submitted','reviewing','rejected'].includes(j.status))return 'This task is not a manual follow-up';
 if(!['submitted','reviewing','rejected','manual_action_needed','published','removed'].includes(status))return 'Invalid result';
 if(status==='published'&&(!isPublic(articles.find(a=>a.id===j.articleId),j.lang)||articles.find(a=>a.id===j.articleId).langs[j.lang].live!==j.snapshot.version))return 'The original changed; use read-only verification of the existing copy';
 if(status==='published'&&(!platformUrl(j.channel,url)||!sourceChecked))return 'Enter the correct public URL and verify the article and attribution';
 if(status==='removed'&&(j.action!=='remove'||!sourceChecked||url!==knownCopies.find(c=>c.id===j.copyId)?.url))return 'Verify removal of the known URL first';
 if(url&&!platformUrl(j.channel,url))return 'URL does not match the selected platform';
 j.note=note;if(status==='published'){j.publicUrl=url;finishCopy(j,url);}else if(status==='removed'){finishCopy(j);}else {j.submissionUrl=url;addJobEvent(j,status,note);}return null;
}
// Seed only explicit sample tasks with a valid designated connection.
createCopyJob('dev');createCopyJob('medium');
window.addEventListener('pagehide',()=>{workflowTimers.forEach(clearTimeout);workflowTimers.clear();prototypeMedia.forEach(m=>URL.revokeObjectURL?.(m.url));});

function mediaForJob(j){return [...prototypeMedia.entries()].filter(([id,m])=>m.owner===j.owner&&m.articleId===j.articleId&&m.lang===j.lang&&j.snapshot.savedBody.includes(']('+id+')')).map(([,m])=>m);}
function publishJobMedia(j){mediaForJob(j).forEach(m=>{m.publicVersions??=new Set();m.publicVersions.add(j.snapshot.version);});}
function completeMissingImages(j,rights=false){const a=articles.find(a=>a.id===j?.articleId);if(!j||!rights||!taskAuthorized(j)||j.status!=='published'||!['incomplete','failed'].includes(j.mediaStatus)||!isPublic(a,j.lang)||a.langs[j.lang].live!==j.snapshot.version)return false;j.mediaStatus='verifying';scheduleWorkflow(()=>{if(!taskAuthorized(j)||!isPublic(a,j.lang)||a.langs[j.lang].live!==j.snapshot.version){j.mediaStatus='failed';}else {publishJobMedia(j);j.mediaStatus='ready';}j.events.unshift({state:j.status,time:nowStamp(),note:j.mediaStatus==='ready'?'Missing images verified for the exact live version':'Image completion blocked; reconfirm current rights and version'});safeWorkflowRender();},1200);return true;}
