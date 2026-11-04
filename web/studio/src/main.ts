import {linkButton,notice as renderNotice} from './ui.js';
import {StudioDialog,captureFocus} from './dialogs.js';
import {ApiError,Transport} from './transport.js';
import {ContextGate,draftFrom,safeReturnPath,type Stamp} from './state.js';
import {base64,decodeMarkdown,markdownForSave} from './bytes.js';
import {badge,button,escape,renderPreview,sanitizePreview,shell,siteCards} from './components.js';
import {translator} from './i18n.js';
import {StudioPickers} from './pickers.js';
import {libraryView,type Filters} from './library.js';
import {editorView} from './editor.js';
import {publicationView,type PublicationView} from './publication.js';
import {OperationIntent,publicationOptions} from './publication-model.js';
import {taskDetailView,taskListView,linkStatusView,type TaskFilters} from './tasks.js';
import {isTaskActive,isTaskKind,taskAssetBase} from './task-model.js';
import {BoundedPoller} from './polling.js';
import {analyticsView} from './analytics.js';
import {defaultMetricFilters,metricQuery} from './analytics-model.js';
import {membersView} from './members.js';
import {canGrantPublisher,canRevokePublisher} from './members-model.js';
import {guideView,settingsView,unavailablePage} from './workspace-views.js';
import {ConnectionController} from './connection-controller.js';
import {DistributionController} from './distribution-controller.js';
import {connectionReturnOwner} from './distribution-model.js';
import type {WorkflowHost} from './workflow-types.js';
import type {Article,ContentPage,EditorDraft,History,Identity,Language,Site,Summary,Workspace,Release,TaskDetail,TaskPage,PublicationAction,LinkStatus,MemberDirectory,MemberIntent,MetricFilters,MetricDestination,Metrics} from './types.js';

const root=document.getElementById('app')!;
const pickers=new StudioPickers(root);
const dialogs=new StudioDialog();
let navigationVersion=0;
const api=new Transport();const context=new ContextGate();
let locale:Language=localStorage.getItem('chrono.studio.locale')==='zh'?'zh':'en';
let identity:Identity|null=null,owner:Workspace|null=null;
let identityEstablished=false;
let filters:Filters={language:'en',status:'all',q:'',offset:0,limit:20};
let page:ContentPage|null=null,sites:Site[]=[],draft:EditorDraft|null=null,summary:Summary|null=null,history:History[]=[],source:Article|null=null;
let pendingSource:{articleId:string;revisionId:string}|null=null;
let previewMode:'write'|'local'|'saved'='write',previewHtml='',busy=false,suspended=false;
let currentHash=location.hash||'#/content',lastHash=currentHash;
let notice:{text:string;kind:'error'|'success'|'info';details?:string}|null=null;
let publication:PublicationView|null=null,taskPage:TaskPage|null=null,currentTask:TaskDetail|null=null;
let taskFilters:TaskFilters={kind:'',language:'',state:'',articleId:'',limit:20,offset:0};
let publicationIntent=new OperationIntent(),mediaIntent=new OperationIntent(),mediaRights=false,linkUnknown=false;
let linkStatuses:LinkStatus[]=[];
let metrics:Metrics|null=null,metricFilters:MetricFilters=defaultMetricFilters(),metricCopy:TaskDetail|null=null,metricCopyId='';
let memberDirectory:MemberDirectory|null=null,memberIntent:MemberIntent|null=null,manualMemberIdentity='';
let preserveNavigation=false;
const retainedDrafts=new Map<string,EditorDraft>();
const taskReads=new ContextGate();
const poller=new BoundedPoller({visible:()=>!document.hidden,onExhausted:()=>{notice={text:t('pollingPaused'),kind:'info'};showNotice();},onError:error=>{void failure(error);}});
const t=(key:Parameters<ReturnType<typeof translator>>[0])=>translator(locale)(key);
const workflowHost:WorkflowHost={confirm:confirmInContext,api,owner:()=>owner,subject:()=>identity?.subject??'',locale:()=>locale,stamp:()=>context.current(),accepts:stamp=>context.accepts(stamp),render,fail:failure,navigate,remember:hash=>{currentHash=hash;historyReplace(hash);},notice:(text,kind='info')=>{notice={text,kind};showNotice();},pausePolling:()=>{poller.stop();taskReads.advance();},resumePolling:startTaskPolling,refreshTask:async stamp=>{await refreshTaskDetail(stamp);return currentTask;}};
const connections=new ConnectionController(workflowHost),distribution=new DistributionController(workflowHost);
function route(){const [path,query='']=currentHash.replace(/^#\/?/,'').split('?');const [name='content',id,taskId]=path.split('/');return {name,id,taskId,query:new URLSearchParams(query)};}
function canEdit(){return Boolean(api.csrf&&draft&&!draft.historyRevision&&!suspended&&owner?.capabilities.canWrite&&(!draft.article||summary?.capabilities.canEdit));}
function canSubmit(){return Boolean(api.csrf&&!suspended&&owner?.capabilities.canWrite&&summary?.capabilities.canSubmit);}
function canReview(){return Boolean(api.csrf&&!suspended&&owner?.capabilities.canPublish&&summary?.capabilities.canPublish);}
function showNotice(){const node=document.getElementById('notice');if(node)node.innerHTML=notice?`${renderNotice(`<p>${escape(notice.text)}</p>${notice.details?`<code>${escape(notice.details)}</code>`:''}`,{tone:notice.kind,className:'studio-notice '+notice.kind,live:true})}`:'';}
function render(){
 const pickerFocus=pickers.beforeRender();
 try{
 document.documentElement.lang=locale==='en'?'en':'zh-CN';root.setAttribute('aria-busy',String(busy));
 if(!identity){renderLogin();return;}
 if(!owner){root.innerHTML=`<div class="studio-loading"><div><h2>${t('noWorkspace')}</h2>${button(t('retry'),'identity')}${button(t('logout'),'logout')}</div></div>`;return;}
 const r=route();let content='';
 if(r.name==='content'&&page)content=libraryView(page,filters,locale,owner.capabilities.canWrite&&!suspended);
 else if((r.name==='article'||r.name==='new')&&draft)content=editorView({draft,locale,canEdit:canEdit(),canSubmit:canSubmit(),canPublish:canReview(),canDistribute:canReview()&&Boolean(summary?.live),busy,history,translations:summary?.translations??[],source,previewMode,previewHtml,pendingSource})+(summary?.live&&owner.capabilities.canPublish?linkStatusView(linkStatuses,locale,busy||suspended||linkUnknown):'');
 else if(r.name==='publish'&&publication)content=publicationView({...publication,busy,allowed:publication.allowed&&!suspended},locale);
 else if(r.name==='tasks'&&taskPage)content=taskListView(taskPage,taskFilters,locale);
 else if(r.name==='task'&&currentTask)content=taskDetailView(currentTask,locale,busy,mediaRights,Boolean(api.csrf&&owner.capabilities.canPublish&&!suspended))+(suspended?'':distribution.taskView());
 else if(r.name==='connections')content=suspended?unavailablePage(locale):connections.view();
 else if(r.name==='distribution')content=suspended?unavailablePage(locale):distribution.view();
 else if(r.name==='analytics')content=!owner.capabilities.canReadMetrics||suspended?unavailablePage(locale):metrics?analyticsView(metrics,metricFilters,locale,busy,Boolean(api.csrf&&owner.capabilities.canPublish),metricCopy,metricCopyId):`<div class="studio-loading">${busy?t('loading'):button(t('retry'),'refresh')}</div>`;
 else if(r.name==='members')content=!owner.capabilities.canManagePublishers||suspended?unavailablePage(locale):memberDirectory?membersView(memberDirectory,owner,locale,busy,memberIntent,manualMemberIdentity,Boolean(api.csrf&&owner.capabilities.canManagePublishers)): `<div class="studio-loading">${busy?t('loading'):button(t('retry'),'refresh')}</div>`;
 else if(r.name==='settings')content=settingsView(owner,sites,locale);
 else if(r.name==='guide')content=guideView(owner,locale);
 else if(r.name==='onboarding')content=`<section class="studio-welcome"><div class="eyebrow">WELCOME TO YOUR STUDIO</div><h1>${t('welcome')}</h1><p>${t('welcomeCopy')}</p>${siteCards(sites,locale)}<div class="heading-actions">${linkButton(`${t('continue')}`,{"href":"#/content","class":"btn primary"})}${button(t('refresh'),'refresh')}</div></section>`;
 else content=`<div class="studio-loading">${busy?t('loading'):button(t('retry'),'refresh')}</div>`;
 const directory=identity.organizationDirectory?.status==='unavailable'?`${renderNotice(`${t('directory')}${identity.organizationDirectory.code?`<code>${escape(identity.organizationDirectory.code)}</code>`:''}`,{tone:'info',className:`studio-notice studio-directory`})}`:'';
 const csrf=!api.csrf?`${renderNotice(`${t('csrfMissing')}`,{tone:'error',className:`studio-notice error`})}`:'';
 root.innerHTML=shell(directory+csrf+content,identity.workspaces,owner,identity.subject,locale,r.name);showNotice();
 }finally{pickers.afterRender(pickerFocus);}
}
function renderLogin(){
 const authError=new URLSearchParams(location.search).has('authError');
 root.innerHTML=`<div class="studio-auth"><section class="studio-auth-art"><a href="/studio" class="wordmark"><span class="brand-symbol">◈</span><span>ChronoAI<small>PUBLISHING STUDIO</small></span></a><div><div class="eyebrow">IDEAS DESERVE A PLACE</div><h1>${t('loginTitle')}</h1><p>${t('loginCopy')}</p></div><small class="eyebrow">WRITE WITH INTENTION. SHARE WITH CONFIDENCE.</small></section><section class="studio-auth-side"><div class="studio-auth-card"><h2>${t('studio')}</h2><p>${t('loginIntro')}</p>${authError?`${renderNotice(`${t('loginError')}`,{tone:'error',className:`studio-notice error`,live:true})}`:''}${notice?.kind==='error'?`${renderNotice(`${escape(notice.text)}<code>${escape(notice.details??'')}</code>`,{tone:'error',className:`studio-notice error`,live:true})}`:''}${linkButton(`${t('signin')} →`,{"class":"btn primary full large","href":"/auth/login?returnTo=%2Fstudio","id":"signin"})}<div class="studio-auth-tools"><select id="locale" data-studio-picker="locale" aria-label="${t('interface')}"><option value="en" ${locale==='en'?'selected':''}>EN</option><option value="zh" ${locale==='zh'?'selected':''}>简中</option></select></div></div></section></div>`;
}
async function failure(error:unknown,stamp=context.current()){
 if(!context.accepts(stamp)||(error instanceof DOMException&&error.name==='AbortError'))return;
 poller.stop();
 busy=false;const e=error instanceof ApiError?error:null;
 notice={text:e?.message??(error instanceof Error?error.message:t('error')),kind:'error',details:e?`${e.code}${e.traceId?' · Trace ID '+e.traceId:''}`:undefined};
 if(e?.status===401){dialogs.cancel();connections.reset();distribution.reset();identity=null;api.csrf=undefined;sessionStorage.setItem('chrono.studio.return',safeReturnPath('/studio'+currentHash));render();return;}
 if(e?.status===403){dialogs.cancel();connections.reset();distribution.reset();suspended=true;memberDirectory=null;memberIntent=null;metrics=null;metricCopy=null;render();try{const me=await api.json<Identity>('/me',{signal:stamp.signal});if(context.accepts(stamp)){identity=me;api.csrf=me.csrf;owner=me.workspaces.find(w=>w.id===owner?.id)??null;render();}}catch{/* Original classified error remains visible; no previous permission is restored. */}return;}
 render();
}
async function confirmInContext(message:string,stamp:Stamp):Promise<boolean>{
 const selectedOwner=owner,session=identity,csrf=api.csrf;
 const accepted=await dialogs.confirm(message,locale,stamp.signal);
 return accepted&&context.accepts(stamp)&&!suspended&&owner===selectedOwner&&identity===session&&Boolean(identity)&&api.csrf===csrf;
}
async function unsavedAllowed(){if(!draft?.dirty)return true;const local=draft,stamp=context.current(),version=navigationVersion;const allowed=await confirmInContext(t('discard'),stamp);if(!allowed||draft!==local||version!==navigationVersion)return false;if(local.article)retainedDrafts.delete(`${local.article.ownerId}/${local.article.id}`);return true;}
async function loadIdentity(initial=false){const stamp=context.advance();busy=true;render();try{
 const me=await api.json<Identity>('/me',{signal:stamp.signal});if(!context.accepts(stamp))return;
 identityEstablished=true;identity=me;api.csrf=me.csrf;owner=me.workspaces.find(w=>w.id===sessionStorage.getItem('chrono.studio.owner'))??me.workspaces[0]??null;
 const restored=sessionStorage.getItem('chrono.studio.return');sessionStorage.removeItem('chrono.studio.return');
 if(restored){const safe=safeReturnPath(restored);if(safe.startsWith('/studio#')){currentHash=safe.slice('/studio'.length);historyReplace(currentHash);}}
 busy=false;await loadRoute();
 }catch(error){
  if(initial&&!identity&&context.accepts(stamp)&&error instanceof ApiError&&error.status===401&&error.code==='UNAUTHENTICATED'){
   busy=false;notice=null;sessionStorage.setItem('chrono.studio.return',safeReturnPath('/studio'+currentHash));render();return;
  }
  await failure(error,stamp);
 }}
function historyReplace(hash:string){window.history.replaceState(null,'',location.pathname+hash);lastHash=hash;}
async function loadRoute(){
 poller.stop();taskReads.advance();connections.reset();distribution.reset();
 const stamp=context.advance();busy=true;suspended=false;notice=null;page=null;summary=null;history=[];sites=[];source=null;previewMode='write';previewHtml='';draft=null;pendingSource=null;publication=null;taskPage=null;currentTask=null;mediaRights=false;mediaIntent=new OperationIntent();linkStatuses=[];linkUnknown=false;metrics=null;metricCopy=null;memberDirectory=null;memberIntent=null;render();
 if(!owner){busy=false;render();return;}
 const ownerId=owner.id;const r=route();
 try{
  if(r.name==='content'){
   const params=new URLSearchParams({language:filters.language,status:filters.status,q:filters.q,limit:String(filters.limit),offset:String(filters.offset)});
   const result=await api.json<ContentPage>(`/owners/${encodeURIComponent(ownerId)}/content-summary?${params}`,{signal:stamp.signal});if(!context.accepts(stamp))return;page=result;
  }else if(r.name==='connections'){
   const restoreOwner=r.query.get('ownerId');
   if(r.query.has('attemptId')&&!restoreOwner)throw new ApiError(403,'FORBIDDEN','A verified owner context is required');
   if(restoreOwner){const me=await api.json<Identity>('/me',{signal:stamp.signal});if(!context.accepts(stamp))return;const selected=connectionReturnOwner(me.workspaces,restoreOwner);if(!selected)throw new ApiError(403,'FORBIDDEN',t('noPagePermission'));identity=me;api.csrf=me.csrf;owner=selected;sessionStorage.setItem('chrono.studio.owner',selected.id);}
   await connections.load(stamp,r.query);if(!context.accepts(stamp))return;
  }else if(r.name==='distribution'&&r.id){
   await distribution.loadArticle(r.id,stamp);if(!context.accepts(stamp))return;
  }else if(r.name==='analytics'){
   if(owner.capabilities.canReadMetrics)await readMetrics(stamp);
  }else if(r.name==='members'){
   if(owner.capabilities.canManagePublishers)await readMembers(stamp);
  }else if(r.name==='guide'){
   // Static guidance uses the current server capabilities and real Studio routes.
  }else if(r.name==='settings'||r.name==='onboarding'){
   const result=await api.json<{sites:Site[]}>(`/owners/${encodeURIComponent(ownerId)}/sites`,{signal:stamp.signal});if(!context.accepts(stamp))return;sites=result.sites;
  }else if(r.name==='new'){
   const language=r.id==='zh'?'zh':'en';draft=draftFrom(null,language);draft.dirty=false;
   const sourceId=r.query.get('source'),revisionId=r.query.get('revision');
   if(sourceId&&revisionId){const result=await api.json<Article>(`/articles/${encodeURIComponent(sourceId)}?revision=${encodeURIComponent(revisionId)}`,{signal:stamp.signal});if(!context.accepts(stamp))return;
    if(result.ownerId!==ownerId||result.language===language)throw new ApiError(400,'SOURCE_CONTEXT',t('sourceMismatch'));
    pendingSource={articleId:result.id,revisionId:result.revision.id};source=result;draft.author=result.revision.creditedAuthor;
   }
  }else if(r.name==='article'&&r.id){
   const revision=r.query.get('revision');const article=await api.json<Article>(`/articles/${encodeURIComponent(r.id)}${revision?'?revision='+encodeURIComponent(revision):''}`,{signal:stamp.signal});if(!context.accepts(stamp))return;
   if(article.ownerId!==ownerId)throw new ApiError(409,'WORKSPACE_MISMATCH','Open this article from its owning workspace.');
   const [details,revisions]=await Promise.all([api.json<ContentPage>(`/owners/${encodeURIComponent(ownerId)}/content-summary?articleId=${encodeURIComponent(article.id)}&limit=1`,{signal:stamp.signal}),api.json<History[]>(`/articles/${encodeURIComponent(article.id)}/revisions`,{signal:stamp.signal})]);
   if(!context.accepts(stamp))return;summary=details.items.find(item=>item.id===article.id)??null;history=revisions;draft=draftFrom(article,article.language,Boolean(revision));
   const retained=retainedDrafts.get(`${ownerId}/${article.id}`);
   if(!revision&&retained&&summary?.capabilities.canEdit){if(retained.article?.revision.id!==article.revision.id)retained.conflict=true;draft=retained;}
   if(summary?.live&&owner.capabilities.canPublish){const result=await api.json<LinkStatus[]>(`/articles/${encodeURIComponent(article.id)}/link-status`,{signal:stamp.signal});if(!context.accepts(stamp))return;linkStatuses=result;}
  }else if(r.name==='publish'&&r.id){
   const revision=r.query.get('revision');if(!revision)throw new ApiError(400,'REVISION_REQUIRED',t('publicationBlocked'));
   const article=await api.json<Article>(`/articles/${encodeURIComponent(r.id)}?revision=${encodeURIComponent(revision)}`,{signal:stamp.signal});if(!context.accepts(stamp))return;
   if(article.ownerId!==ownerId||article.revision.id!==revision)throw new ApiError(409,'PUBLICATION_CONTEXT',t('publicationBlocked'));
   const [details,siteResult,releases,preview]=await Promise.all([
    api.json<ContentPage>(`/owners/${encodeURIComponent(ownerId)}/content-summary?articleId=${encodeURIComponent(article.id)}&limit=1`,{signal:stamp.signal}),
    api.json<{sites:Site[]}>(`/owners/${encodeURIComponent(ownerId)}/sites`,{signal:stamp.signal}),
    api.json<Release[]>(`/articles/${encodeURIComponent(article.id)}/releases`,{signal:stamp.signal}),
    api.json<{html:string;revisionId:string;private:boolean}>(`/articles/${encodeURIComponent(article.id)}/preview?revision=${encodeURIComponent(revision)}`,{signal:stamp.signal})
   ]);if(!context.accepts(stamp))return;
   const item=details.items.find(item=>item.id===article.id);if(!item||preview.revisionId!==revision||!preview.private)throw new ApiError(409,'PUBLICATION_CONTEXT',t('publicationBlocked'));
   const proof=releases.find(release=>release.revision_id===revision&&release.owner_id===ownerId&&release.article_id===article.id&&release.action!=='unpublish');
   const scope=proof?{ownerId,kind:'release' as const,id:proof.id}:undefined;
   const html=scope?preview.html.replace(/\/api\/cms\/assets\/([a-f0-9-]{36})/g,(_match,id:string)=>taskAssetBase(scope)+id):preview.html;
   const options=publicationOptions(revision,item.live,releases);publicationIntent=new OperationIntent();
   publication={article,owner,site:siteResult.sites.find(site=>site.language===article.language)??null,summary:item,releases,previewHtml:sanitizePreview(html,scope),action:options.actions[0]??'publish',rights:false,busy:false,unknown:false,allowed:Boolean(api.csrf&&owner.capabilities.canPublish&&item.capabilities.canPublish),key:null};
  }else if(r.name==='tasks'){
   const articleId=r.query.get('articleId');if(articleId!==null)taskFilters={...taskFilters,articleId,offset:0};
   await refreshTaskPage(stamp);if(!context.accepts(stamp))return;
  }else if(r.name==='task'&&r.id&&r.taskId&&isTaskKind(r.id)){
   await refreshTaskDetail(stamp);if(!context.accepts(stamp))return;
   const loadedTask=currentTask as TaskDetail|null;if(loadedTask&&['delivery','plan'].includes(loadedTask.kind)){await distribution.loadTask(loadedTask,stamp);if(!context.accepts(stamp))return;}
  }else {currentHash='#/content';historyReplace(currentHash);await loadRoute();return;}
  busy=false;render();
  startTaskPolling();
 }catch(error){await failure(error,stamp);}
}
async function save(){
 if(!draft||!canEdit()||draft.conflict||busy)return;
 const local=draft;const stamp=context.current();const workspace=owner!;const body=markdownForSave(local);
 if(!local.title.trim()||!local.author.trim()||!body.trim()){notice={text:locale==='en'?'Title, credited author and Markdown are required.':'请填写标题、署名作者和 Markdown。',kind:'error'};showNotice();return;}
 busy=true;render();try{
  let result:Article;
  if(local.article)result=await api.json<Article>(`/articles/${encodeURIComponent(local.article.id)}`,{method:'PATCH',data:{expectedRevision:local.article.revision.id,title:local.title,creditedAuthor:local.author,...(local.markdownChanged||local.imported?{markdown:body}:{})},signal:stamp.signal});
  else if(local.imported&&!local.markdownChanged){const params=new URLSearchParams({ownerId:workspace.id,language:local.language,title:local.title,creditedAuthor:local.author});result=await api.json<Article>(`/articles/import?${params}`,{method:'POST',body:new TextEncoder().encode(body),contentType:'text/markdown',signal:stamp.signal});}
  else result=await api.json<Article>('/articles',{method:'POST',data:{ownerId:workspace.id,language:local.language,title:local.title,creditedAuthor:local.author,markdown:body},signal:stamp.signal});
  if(!context.accepts(stamp)||draft!==local)return;
  if(local.article)retainedDrafts.delete(`${local.article.ownerId}/${local.article.id}`);
  draft=draftFrom(result);currentHash=`#/article/${encodeURIComponent(result.id)}`;historyReplace(currentHash);
  if(pendingSource){await api.json<Article>(`/articles/${encodeURIComponent(result.id)}/translation`,{method:'POST',data:{sourceArticleId:pendingSource.articleId,sourceRevisionId:pendingSource.revisionId},signal:stamp.signal});if(!context.accepts(stamp))return;pendingSource=null;}
  await loadRoute();
 }catch(error){if(context.accepts(stamp)&&error instanceof ApiError&&error.status===409&&draft===local){local.conflict=true;local.dirty=true;}await failure(error,stamp);}
}
async function submit(){if(!draft?.article||!canSubmit()||draft.dirty||busy||draft.historyRevision)return;const stamp=context.current();const article=draft.article;busy=true;render();try{
 await api.json(`/articles/${encodeURIComponent(article.id)}/submit`,{method:'POST',data:{revisionId:article.revision.id},signal:stamp.signal});if(!context.accepts(stamp))return;await loadRoute();notice={text:t('submitDone'),kind:'success'};showNotice();
 }catch(error){await failure(error,stamp);}}
async function previewSaved(){if(!draft?.article||busy)return;const stamp=context.current();const article=draft.article;busy=true;render();try{
 const result=await api.json<{html:string;revisionId:string;private:boolean}>(`/articles/${encodeURIComponent(article.id)}/preview?revision=${encodeURIComponent(article.revision.id)}`,{signal:stamp.signal});if(!context.accepts(stamp))return;
 if(result.revisionId!==article.revision.id||result.private!==true)throw new ApiError(502,'PREVIEW_CONTEXT','Preview revision mismatch');previewMode='saved';previewHtml=sanitizePreview(result.html);busy=false;render();
 }catch(error){await failure(error,stamp);}}
async function importFile(file:File){if(!draft||!canEdit())return;const stamp=context.current();const local=draft;try{
 if(file.size>2_000_000)throw new Error(t('markdownSize'));const raw=decodeMarkdown(new Uint8Array(await file.arrayBuffer()));if(!context.accepts(stamp)||draft!==local)return;
 local.originalMarkdown=raw;local.markdown=raw;local.markdownChanged=false;local.imported=true;local.dirty=true;previewMode='write';render();
 }catch(error){await failure(error,stamp);}}
async function imageFile(file:File){if(!draft?.article||!canEdit()||busy)return;const stamp=context.current();const local=draft;try{
 if(file.size>5_000_000||!['image/png','image/jpeg','image/gif','image/webp'].includes(file.type))throw new Error(t('imageError'));
 busy=true;render();const bytes=new Uint8Array(await file.arrayBuffer());if(!context.accepts(stamp))return;
 const result=await api.json<{id:string;markdown:string}>(`/articles/${encodeURIComponent(local.article!.id)}/assets`,{method:'POST',data:{mime:file.type,base64:base64(bytes)},signal:stamp.signal});if(!context.accepts(stamp)||draft!==local)return;
 local.markdown=markdownForSave(local).replace(/\r\n?/g,'\n')+`\n\n${result.markdown}\n`;local.markdownChanged=true;local.dirty=true;busy=false;previewMode='write';render();
 }catch(error){await failure(error,stamp);}}
async function loadSource(){if(!draft?.article||!canEdit()||busy)return;const id=(document.getElementById('source-id') as HTMLInputElement|null)?.value.trim();if(!id)return;
 const stamp=context.current();busy=true;render();try{const result=await api.json<Article>(`/articles/${encodeURIComponent(id)}`,{signal:stamp.signal});if(!context.accepts(stamp))return;
 if(result.ownerId!==owner?.id||result.language===draft?.language)throw new Error(t('sourceMismatch'));source=result;busy=false;render();document.querySelector('details.source-link')?.setAttribute('open','');
 }catch(error){await failure(error,stamp);}}
async function linkSource(){if(!draft?.article||!source||!canEdit()||draft.dirty||busy)return;const stamp=context.current();const article=draft.article;const inspected=source;busy=true;render();try{
 await api.json(`/articles/${encodeURIComponent(article.id)}/translation`,{method:'POST',data:{sourceArticleId:inspected.id,sourceRevisionId:inspected.revision.id},signal:stamp.signal});if(!context.accepts(stamp))return;await loadRoute();notice={text:t('linked'),kind:'success'};showNotice();
 }catch(error){await failure(error,stamp);}}
function retainEditor(){if(draft?.article&&draft.dirty)retainedDrafts.set(`${draft.article.ownerId}/${draft.article.id}`,draft);}
async function readMetrics(stamp:Stamp=context.current()){
 if(!owner?.capabilities.canReadMetrics)return;const selected=owner.id,filters={...metricFilters};
 const result=await api.json<Metrics>(`/metrics?${metricQuery(selected,filters)}`,{signal:stamp.signal});if(!context.accepts(stamp))return;
 if(result.ownerId!==selected||result.filters.destination!==filters.destination)throw new ApiError(502,'METRICS_CONTEXT','Metrics workspace or source mismatch');metrics=result;
}
async function readMembers(stamp:Stamp=context.current()){
 if(!owner?.capabilities.canManagePublishers)return;const selected=owner.id;
 const result=await api.json<MemberDirectory>(`/owners/${encodeURIComponent(selected)}/members`,{signal:stamp.signal});if(!context.accepts(stamp))return;
 if(result.ownerId!==selected)throw new ApiError(502,'MEMBER_CONTEXT','Member workspace mismatch');memberDirectory=result;
}
function beginMemberChange(identity:string,enabled:boolean){
 if(busy||suspended||!api.csrf||!owner?.capabilities.canManagePublishers||!memberDirectory)return;
 const member=memberDirectory.members.find(member=>member.identity===identity);
 if(!member||(enabled?!canGrantPublisher(member,true):!canRevokePublisher(member,true)))return;
 memberIntent={identity:member.identity,displayName:member.displayName,enabled};render();document.querySelector('.studio-member-confirm')?.scrollIntoView({block:'nearest'});
}
function beginManualRevoke(){
 if(busy||suspended||!api.csrf||!owner?.capabilities.canManagePublishers)return;
 const identity=(document.getElementById('revoke-identity') as HTMLInputElement).value.trim();manualMemberIdentity=identity;
 if(!identity||identity.length>500){notice={text:t('identityRequired'),kind:'error'};showNotice();return;}
 memberIntent={identity,displayName:identity,enabled:false};render();document.querySelector('.studio-member-confirm')?.scrollIntoView({block:'nearest'});
}
async function confirmMemberChange(){
 if(!memberIntent||busy||suspended||!api.csrf||!owner?.capabilities.canManagePublishers)return;
 const intent=memberIntent,selected=owner.id,stamp=context.current();
 if(intent.enabled&&!memberDirectory?.members.some(member=>member.identity===intent.identity&&canGrantPublisher(member,true)))return;
 busy=true;render();try{
  await api.json(`/owners/${encodeURIComponent(selected)}/publishers/${encodeURIComponent(intent.identity)}`,{method:'PUT',data:{enabled:intent.enabled},signal:stamp.signal});if(!context.accepts(stamp))return;
  memberIntent=null;await readMembers(stamp);if(!context.accepts(stamp))return;busy=false;notice={text:t(memberDirectory?.status==='unavailable'?'memberChangeDirectoryUnavailable':'memberChangeReadBack'),kind:'info'};render();
 }catch(error){if(!context.accepts(stamp))return;memberIntent=null;await failure(error,stamp);if(context.accepts(stamp)&&!suspended&&owner?.capabilities.canManagePublishers)try{await readMembers(stamp);if(context.accepts(stamp))render();}catch(readError){await failure(readError,stamp);}}
}
async function inspectMetricCopy(){
 if(!owner?.capabilities.canReadMetrics||!owner.capabilities.canPublish||suspended||busy||metricFilters.destination==='ghost')return;
 metricCopyId=(document.getElementById('metric-copy-id') as HTMLInputElement).value.trim();metricCopy=null;
 if(!metricCopyId||metricCopyId.length>500){notice={text:t('identityRequired'),kind:'error'};showNotice();return;}
 const selected=owner.id,id=metricCopyId,destination=metricFilters.destination,stamp=context.current();busy=true;render();try{
  const result=await api.json<TaskDetail>(`/owners/${encodeURIComponent(selected)}/tasks/delivery/${encodeURIComponent(id)}`,{signal:stamp.signal});if(!context.accepts(stamp))return;
  if(result.ownerId!==selected||result.id!==id||result.kind!=='delivery'||result.state!=='published'||result.copy?.target!==destination)throw new ApiError(409,'METRIC_COPY_CONTEXT',t('copyNotEligible'));
  metricCopy=result;busy=false;render();
 }catch(error){await failure(error,stamp);}
}
async function refreshCounters(){
 if(!metricCopy||busy||suspended||!api.csrf||!owner?.capabilities.canReadMetrics||!owner.capabilities.canPublish||metricCopy.ownerId!==owner.id||metricCopy.copy?.target!==metricFilters.destination||metricCopy.state!=='published')return;
 const copy=metricCopy,stamp=context.current();busy=true;render();try{
  const result=await api.json<{availability:'Available'|'Unavailable';code?:string}>(`/deliveries/${encodeURIComponent(copy.id)}/metrics/refresh`,{method:'POST',data:{},signal:stamp.signal});if(!context.accepts(stamp))return;
  await readMetrics(stamp);if(!context.accepts(stamp))return;busy=false;notice={text:t(result.availability==='Available'?'countersRead':'counterUnavailable'),kind:result.availability==='Available'?'info':'error',details:result.code};render();
 }catch(error){await failure(error,stamp);}
}
function reviewPublication(){if(!draft?.article||!canReview()||busy)return;retainEditor();preserveNavigation=true;navigate(`#/publish/${encodeURIComponent(draft.article.id)}?revision=${encodeURIComponent(draft.article.revision.id)}`);}
async function confirmOriginal(){
 if(!publication||busy||!publication.allowed||suspended||!publication.rights||!publication.site?.configured)return;
 const frozen=publication,stamp=context.current();
 if(!publicationOptions(frozen.article.revision.id,frozen.summary.live,frozen.releases).actions.includes(frozen.action))return;
 const body={ownerId:frozen.owner.id,revisionId:frozen.article.revision.id,creditedAuthor:frozen.article.revision.creditedAuthor,action:frozen.action,rightsConfirmed:true};
 const key=publicationIntent.keyFor({articleId:frozen.article.id,...body});frozen.key=key;busy=true;render();
 try{
  const result=await api.json<Release>(`/articles/${encodeURIComponent(frozen.article.id)}/releases`,{method:'POST',data:{...body,idempotencyKey:key},signal:stamp.signal});if(!context.accepts(stamp)||publication!==frozen)return;
  if(!result.id||result.owner_id!==body.ownerId||result.article_id!==frozen.article.id||result.revision_id!==body.revisionId)throw new ApiError(502,'PUBLICATION_CONTEXT','Publication result context mismatch');
  currentHash=`#/task/release/${encodeURIComponent(result.id)}`;historyReplace(currentHash);await loadRoute();notice={text:t(currentTask&&isTaskActive(currentTask)?'queuedNotice':'acceptedNotice'),kind:'info'};showNotice();
 }catch(error){
  if(context.accepts(stamp)&&publication===frozen&&(!(error instanceof ApiError)||error.status>=500))frozen.unknown=true;
  await failure(error,stamp);
  if(context.accepts(stamp)&&publication===frozen&&error instanceof ApiError&&error.status===409){
   try{
    const [releases,details]=await Promise.all([api.json<Release[]>(`/articles/${encodeURIComponent(frozen.article.id)}/releases`,{signal:stamp.signal}),api.json<ContentPage>(`/owners/${encodeURIComponent(frozen.owner.id)}/content-summary?articleId=${encodeURIComponent(frozen.article.id)}&limit=1`,{signal:stamp.signal})]);
    if(!context.accepts(stamp)||publication!==frozen)return;const item=details.items.find(item=>item.id===frozen.article.id);
    frozen.releases=releases;frozen.rights=false;if(item)frozen.summary=item;else frozen.allowed=false;
    const options=publicationOptions(frozen.article.revision.id,frozen.summary.live,releases);if(!options.actions.includes(frozen.action)){frozen.action=options.actions[0]??'publish';frozen.key=null;}render();
   }catch(readError){await failure(readError,stamp);}
  }
 }
}
async function refreshTaskPage(stamp:Stamp=context.current()):Promise<boolean>{
 if(!owner)return false;const selected=owner.id,read=taskReads.advance();
 const params=new URLSearchParams({limit:String(taskFilters.limit),offset:String(taskFilters.offset)});
 for(const key of ['kind','language','state','articleId'] as const)if(taskFilters[key])params.set(key,taskFilters[key]);
 const result=await api.json<TaskPage>(`/owners/${encodeURIComponent(selected)}/tasks?${params}`,{signal:AbortSignal.any([stamp.signal,read.signal])});
 if(!context.accepts(stamp)||!taskReads.accepts(read))return false;
 if(result.items.some(item=>item.ownerId!==selected))throw new ApiError(502,'TASK_CONTEXT','Task workspace mismatch');
 taskPage=result;if(!document.querySelector('#task-filters:focus-within'))render();return result.items.some(isTaskActive);
}
async function refreshTaskDetail(stamp:Stamp=context.current()):Promise<boolean>{
 const r=route();if(!owner||r.name!=='task'||!r.id||!r.taskId||!isTaskKind(r.id))return false;
 const selected=owner.id,read=taskReads.advance();
 const result=await api.json<TaskDetail>(`/owners/${encodeURIComponent(selected)}/tasks/${r.id}/${encodeURIComponent(r.taskId)}`,{signal:AbortSignal.any([stamp.signal,read.signal])});
 if(!context.accepts(stamp)||!taskReads.accepts(read))return false;
 if(result.ownerId!==selected||result.kind!==r.id||result.id!==r.taskId)throw new ApiError(502,'TASK_CONTEXT','Task snapshot context mismatch');
 if(currentTask?.revisionId!==result.revisionId||!result.allowedActions.includes('materialize-media'))mediaRights=false;
 currentTask=result;distribution.receiveTask(result);render();return isTaskActive(result);
}
function startTaskPolling(){
 const r=route(),stamp=context.current();
 const active=r.name==='tasks'?taskPage?.items.some(isTaskActive):r.name==='task'&&currentTask?isTaskActive(currentTask):false;
 if(!active)return;poller.start(stamp.signal,async()=>{try{return r.name==='tasks'?await refreshTaskPage(stamp):await refreshTaskDetail(stamp);}catch(error){await failure(error,stamp);return false;}});
}
async function taskCommand(action:'cancel'|'reconcile'|'materialize-media'){
 if(!currentTask||currentTask.kind!=='release'||busy||suspended||!api.csrf||!owner?.capabilities.canPublish||!currentTask.allowedActions.includes(action))return;
 const task=currentTask,stamp=context.current();
 if(action==='materialize-media'&&(!mediaRights||!task.revisionId))return;
 poller.stop();taskReads.advance();
 if(action!=='reconcile'){
  const message=action==='cancel'?`${t('cancelConfirm')}\n${task.id}`:`${t('materializeConfirm')}\n${task.ownerId}\n${task.id}\n${task.revisionId}`;
  if(!await confirmInContext(message,stamp)){if(context.accepts(stamp)&&identity&&owner&&!suspended)startTaskPolling();return;}
  if(!context.accepts(stamp)||busy||!api.csrf||!owner?.capabilities.canPublish||currentTask!==task||!task.allowedActions.includes(action)||action==='materialize-media'&&!mediaRights)return;
 }
 const body=action==='materialize-media'?{ownerId:task.ownerId,revisionId:task.revisionId,rightsConfirmed:true}:{};
 const data=action==='materialize-media'?{...body,idempotencyKey:mediaIntent.keyFor({taskId:task.id,...body})}:body;
 poller.stop();taskReads.advance();busy=true;render();
 try{
  const result=await api.json<{id:string;release_id?:string;revision_id?:string}>(`/releases/${encodeURIComponent(task.id)}/${action}`,{method:'POST',data,signal:stamp.signal});if(!context.accepts(stamp))return;
  if(action==='materialize-media'){
   if(!result.id||result.release_id!==task.id||result.revision_id!==task.revisionId)throw new ApiError(502,'MEDIA_CONTEXT','Media confirmation context mismatch');
   currentHash=`#/task/media/${encodeURIComponent(result.id)}`;historyReplace(currentHash);await loadRoute();notice={text:t('mediaQueued'),kind:'info'};showNotice();return;
  }
  await refreshTaskDetail(stamp);if(!context.accepts(stamp))return;busy=false;mediaRights=false;notice={text:t('actionRequested'),kind:'info'};render();startTaskPolling();
 }catch(error){await failure(error,stamp);if(context.accepts(stamp)&&identity&&owner&&!suspended)try{await refreshTaskDetail(stamp);}catch(readError){await failure(readError,stamp);}}
}
async function syncLinks(){
 if(!draft?.article||!summary?.live||!canReview()||busy||linkUnknown)return;
 const article=draft.article,live=summary.live,stamp=context.current();
 if(!await confirmInContext(t('syncLinksConfirm'),stamp)||draft?.article!==article||summary?.live!==live||!canReview()||busy||linkUnknown)return;
 busy=true;render();
 try{
  const result=await api.json<{id:string;state:string}>(`/articles/${encodeURIComponent(article.id)}/sync-links`,{method:'POST',data:{},signal:stamp.signal});if(!context.accepts(stamp))return;
  if(!result.id)throw new ApiError(502,'PROJECTION_CONTEXT','Projection confirmation has no task identity');
  retainEditor();currentHash=`#/task/projection/${encodeURIComponent(result.id)}`;historyReplace(currentHash);await loadRoute();
 }catch(error){if(context.accepts(stamp)&&(!(error instanceof ApiError)||error.status>=500))linkUnknown=true;await failure(error,stamp);if(context.accepts(stamp)&&linkUnknown){notice={text:t('unknownTaskRequest'),kind:'error',details:notice?.details};showNotice();}}
}
function exportLocal(){if(!draft)return;const bytes=new TextEncoder().encode(markdownForSave(draft));const anchor=document.createElement('a');anchor.href='data:text/markdown;base64,'+base64(bytes);anchor.download='working-draft.md';anchor.click();}
async function exportRaw(){if(!draft?.article||busy)return;const article=draft.article;const stamp=context.current();busy=true;render();try{
 const file=await api.json<{articleId:string;revisionId:string;encoding:string;byteLength:number;sha256:string;data:string}>(`/articles/${encodeURIComponent(article.id)}/markdown-file?revision=${encodeURIComponent(article.revision.id)}`,{signal:stamp.signal});if(!context.accepts(stamp))return;
 const bytes=Uint8Array.from(atob(file.data),c=>c.charCodeAt(0));const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');if(!context.accepts(stamp))return;
 if(file.articleId!==article.id||file.revisionId!==article.revision.id||file.encoding!=='base64'||file.byteLength!==bytes.length||file.data!==base64(bytes)||digest!==file.sha256)throw new ApiError(502,'MARKDOWN_INTEGRITY','Original Markdown integrity check failed');
 const anchor=document.createElement('a');anchor.href='data:text/markdown;base64,'+file.data;anchor.download='article.md';anchor.click();busy=false;render();
 }catch(error){await failure(error,stamp);}}
async function logout(){if(!await unsavedAllowed())return;poller.stop();taskReads.advance();const stamp=context.advance();try{const response=await fetch('/auth/logout',{method:'POST',credentials:'same-origin',headers:{'x-csrf-token':api.csrf??''}});if(!response.ok)throw new ApiError(response.status,'LOGOUT_FAILED',t('error'),response.headers.get('x-trace-id')??'');connections.reset();distribution.reset();identity=null;identityEstablished=false;owner=null;draft=null;retainedDrafts.clear();api.csrf=undefined;notice=null;sessionStorage.removeItem('chrono.studio.return');render();}catch(error){await failure(error,stamp);}}
function navigate(hash:string){location.hash=hash;}
async function action(name:string){
 if(/^(connection-|dist-|delivery-|plan-)/.test(name)){
  const stamp=context.current(),restoreFocus=captureFocus();
  try{if(name.startsWith('connection-'))await connections.action(name);else await distribution.action(name);}
  finally{if(context.accepts(stamp)&&identity&&!suspended&&document.activeElement===document.body)restoreFocus();}return;
 }
 switch(name){
  case 'identity':await loadIdentity();break;
  case 'logout':await logout();break;
  case 'refresh':if(await unsavedAllowed())await loadRoute();break;
  case 'new':navigate(`#/new/${filters.language}`);break;
  case 'previous':filters.offset=Math.max(0,filters.offset-filters.limit);await loadRoute();break;
  case 'next':filters.offset+=filters.limit;await loadRoute();break;
  case 'save':await save();break;
  case 'member-confirm':await confirmMemberChange();break;
  case 'member-cancel':memberIntent=null;render();break;
  case 'refresh-counters':await refreshCounters();break;
  case 'review-publication':reviewPublication();break;
  case 'confirm-original':await confirmOriginal();break;
  case 'task-cancel':await taskCommand('cancel');break;
  case 'task-reconcile':await taskCommand('reconcile');break;
  case 'task-materialize':await taskCommand('materialize-media');break;
  case 'task-previous':taskFilters.offset=Math.max(0,taskFilters.offset-taskFilters.limit);await loadRoute();break;
  case 'task-next':taskFilters.offset+=taskFilters.limit;await loadRoute();break;
  case 'sync-links':await syncLinks();break;
  case 'submit':await submit();break;
  case 'current':if(draft?.article){const hash=`#/article/${encodeURIComponent(draft.article.id)}`;if(hash===currentHash){if(await unsavedAllowed())await loadRoute();}else navigate(hash);}break;
  case 'write':previewMode='write';render();break;
  case 'preview-local':if(draft){previewMode='local';previewHtml=renderPreview(markdownForSave(draft));render();}break;
  case 'preview-saved':await previewSaved();break;
  case 'import':(document.getElementById('markdown-file') as HTMLInputElement)?.click();break;
  case 'image':(document.getElementById('image-file') as HTMLInputElement)?.click();break;
  case 'export-local':exportLocal();break;
  case 'export-raw':await exportRaw();break;
  case 'translation-new':if(draft?.article&&!draft.dirty&&owner?.capabilities.canWrite)navigate(`#/new/${draft.language==='en'?'zh':'en'}?${new URLSearchParams({source:draft.article.id,revision:draft.article.revision.id})}`);break;
  case 'load-source':await loadSource();break;
  case 'link-source':await linkSource();break;
 }
}
root.addEventListener('click',event=>{
 const target=event.target as HTMLElement;const signin=target.closest('#signin');if(signin)sessionStorage.setItem('chrono.studio.return',safeReturnPath('/studio'+currentHash));
 const status=target.closest<HTMLButtonElement>('[data-status]');if(status){filters.status=status.dataset.status as Filters['status'];filters.offset=0;void loadRoute();return;}
 const control=target.closest<HTMLButtonElement>('[data-action]');if(control&&!control.disabled){if(control.dataset.action==='member-select'){beginMemberChange(control.dataset.identity??'',control.dataset.enabled==='true');return;}void action(control.dataset.action!);}
});
root.addEventListener('submit',event=>{if((event.target as HTMLElement).id==='search-form'){event.preventDefault();filters.q=(document.getElementById('search') as HTMLInputElement).value;filters.offset=0;void loadRoute();}
 if((event.target as HTMLElement).id==='task-filters'){event.preventDefault();const value=(id:string)=>(document.getElementById(id) as HTMLInputElement|HTMLSelectElement).value;const kind=value('task-kind');taskFilters={...taskFilters,kind:isTaskKind(kind)?kind:'',language:value('task-language')==='zh'?'zh':value('task-language')==='en'?'en':'',state:value('task-state').trim(),articleId:value('task-article').trim(),offset:0};void loadRoute();}
 if((event.target as HTMLElement).id==='manual-member-revoke'){event.preventDefault();beginManualRevoke();}
 if((event.target as HTMLElement).id==='inspect-metric-copy'){event.preventDefault();void inspectMetricCopy();}
 if((event.target as HTMLElement).id==='analytics-filters'){
  event.preventDefault();const value=(id:string)=>(document.getElementById(id) as HTMLInputElement|HTMLSelectElement).value;
  const filters:MetricFilters={from:value('metric-from'),to:value('metric-to'),article:value('metric-article').trim(),language:value('metric-language')==='en'?'en':value('metric-language')==='zh'?'zh':'',destination:value('metric-destination') as MetricDestination};
  try{metricQuery(owner?.id??'',filters);metricFilters=filters;metricCopyId='';void loadRoute();}catch(error){notice={text:error instanceof Error?error.message:t('error'),kind:'error'};showNotice();}
 }
});
root.addEventListener('input',event=>{const input=event.target as HTMLInputElement|HTMLTextAreaElement;
 if(distribution.input(input))return;
 if(input.id==='metric-copy-id'){metricCopyId=input.value;metricCopy=null;const refresh=root.querySelector<HTMLButtonElement>('[data-action="refresh-counters"]');if(refresh)refresh.disabled=true;}
 if(input.id==='revoke-identity')manualMemberIdentity=input.value;
 if(!draft||!canEdit())return;
 if(input.id==='source-id'){source=null;const confirm=root.querySelector<HTMLButtonElement>('[data-action="link-source"]');if(confirm)confirm.disabled=true;}
 if(input.id==='article-title'){draft.title=input.value;draft.dirty=true;}
 if(input.id==='credited-author'){draft.author=input.value;draft.dirty=true;}
 if(input.id==='markdown'){draft.markdown=input.value;draft.markdownChanged=true;draft.dirty=true;}
 if(['article-title','credited-author','markdown'].includes(input.id)){const submitButton=root.querySelector<HTMLButtonElement>('[data-action="submit"]');if(submitButton)submitButton.disabled=true;const status=root.querySelector('.editor-state');if(status)status.innerHTML=badge(t('unsaved'),'amber');}
});
root.addEventListener('change',async event=>{const input=event.target as HTMLInputElement|HTMLSelectElement;
 if(connections.change(input)||distribution.change(input))return;
 if(input.id==='locale'||input.id==='settings-locale'){locale=input.value==='zh'?'zh':'en';localStorage.setItem('chrono.studio.locale',locale);render();}
 if(input.id==='publication-rights'&&publication){publication.rights=(input as HTMLInputElement).checked;render();}
 if(input.id==='publication-action'&&publication&&['publish','update','unpublish'].includes(input.value)){publication.action=input.value as PublicationAction;publication.rights=false;publication.unknown=false;publication.key=null;render();}
 if(input.id==='media-rights'){mediaRights=(input as HTMLInputElement).checked;render();}
 if(input.id==='workspace'){
  const selected=input.value;if(draft?.dirty){input.value=owner?.id??'';const version=++navigationVersion;if(!await unsavedAllowed()||version!==navigationVersion)return;}owner=identity?.workspaces.find(w=>w.id===selected)??null;sessionStorage.setItem('chrono.studio.owner',owner?.id??'');filters={...filters,offset:0,q:'',status:'all'};metricFilters={...metricFilters,article:''};metricCopyId='';manualMemberIdentity='';currentHash='#/content';historyReplace(currentHash);void loadRoute();
 }
 if(input.id==='article-language'){filters.language=input.value==='zh'?'zh':'en';filters.offset=0;void loadRoute();}
 if(input.id==='translation-peer'&&input.value)navigate(`#/article/${encodeURIComponent(input.value)}`);
 if(input.id==='markdown-file'){const file=(input as HTMLInputElement).files?.[0];if(file)void importFile(file);}
 if(input.id==='image-file'){const file=(input as HTMLInputElement).files?.[0];if(file)void imageFile(file);}
});
window.addEventListener('hashchange',async()=>{const target=location.hash||'#/content',version=++navigationVersion,skip=preserveNavigation;preserveNavigation=false;if(!skip&&draft?.dirty){historyReplace(currentHash);if(!await unsavedAllowed()||version!==navigationVersion)return;historyReplace(target);}currentHash=target;lastHash=currentHash;void loadRoute();});
document.addEventListener('visibilitychange',()=>poller.visibilityChanged());
root.addEventListener('toggle',event=>{const details=event.target;if(details instanceof HTMLDetailsElement&&details.classList.contains('studio-plan-create'))distribution.setPlanOpen(details.open);},true);
window.addEventListener('pagehide',event=>{dialogs.cancel();pickers.close();if(!event.persisted)pickers.dispose();retainEditor();poller.stop();taskReads.advance();context.advance();});
window.addEventListener('pageshow',event=>{if(event.persisted)void loadIdentity(!identityEstablished);});
window.addEventListener('beforeunload',event=>{if(draft?.dirty||[...retainedDrafts.values()].some(local=>local.dirty)){event.preventDefault();event.returnValue='';}});
void loadIdentity(true);
