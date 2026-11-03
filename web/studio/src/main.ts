import {ApiError,Transport} from './transport.js';
import {ContextGate,draftFrom,safeReturnPath} from './state.js';
import {base64,decodeMarkdown,markdownForSave} from './bytes.js';
import {badge,button,escape,renderPreview,sanitizePreview,shell,siteCards} from './components.js';
import {translator} from './i18n.js';
import {libraryView,type Filters} from './library.js';
import {editorView} from './editor.js';
import type {Article,ContentPage,EditorDraft,History,Identity,Language,Site,Summary,Workspace} from './types.js';

const root=document.getElementById('app')!;
const api=new Transport();const context=new ContextGate();
let locale:Language=localStorage.getItem('chrono.studio.locale')==='zh'?'zh':'en';
let identity:Identity|null=null,owner:Workspace|null=null;
let filters:Filters={language:'en',status:'all',q:'',offset:0,limit:20};
let page:ContentPage|null=null,sites:Site[]=[],draft:EditorDraft|null=null,summary:Summary|null=null,history:History[]=[],source:Article|null=null;
let pendingSource:{articleId:string;revisionId:string}|null=null;
let previewMode:'write'|'local'|'saved'='write',previewHtml='',busy=false,suspended=false;
let currentHash=location.hash||'#/content',lastHash=currentHash;
let notice:{text:string;kind:'error'|'success'|'info';details?:string}|null=null;
const t=(key:Parameters<ReturnType<typeof translator>>[0])=>translator(locale)(key);
function route(){const [path,query='']=currentHash.replace(/^#\/?/,'').split('?');const [name='content',id]=path.split('/');return {name,id,query:new URLSearchParams(query)};}
function canEdit(){return Boolean(api.csrf&&draft&&!draft.historyRevision&&!suspended&&owner?.capabilities.canWrite&&(!draft.article||summary?.capabilities.canEdit));}
function canSubmit(){return Boolean(api.csrf&&!suspended&&owner?.capabilities.canWrite&&summary?.capabilities.canSubmit);}
function showNotice(){const node=document.getElementById('notice');if(node)node.innerHTML=notice?`<div class="studio-notice ${notice.kind}" role="${notice.kind==='error'?'alert':'status'}"><p>${escape(notice.text)}</p>${notice.details?`<code>${escape(notice.details)}</code>`:''}</div>`:'';}
function render(){
 document.documentElement.lang=locale==='en'?'en':'zh-CN';root.setAttribute('aria-busy',String(busy));
 if(!identity){renderLogin();return;}
 if(!owner){root.innerHTML=`<div class="studio-loading"><div><h2>${t('noWorkspace')}</h2>${button(t('retry'),'identity')}${button(t('logout'),'logout')}</div></div>`;return;}
 const r=route();let content='';
 if(r.name==='content'&&page)content=libraryView(page,filters,locale,owner.capabilities.canWrite&&!suspended);
 else if((r.name==='article'||r.name==='new')&&draft)content=editorView({draft,locale,canEdit:canEdit(),canSubmit:canSubmit(),busy,history,translations:summary?.translations??[],source,previewMode,previewHtml,pendingSource});
 else if(r.name==='onboarding'||r.name==='settings')content=`<section class="studio-welcome"><div class="eyebrow">${r.name==='onboarding'?'WELCOME TO YOUR STUDIO':'WORKSPACE SETTINGS'}</div><h1>${t(r.name==='onboarding'?'welcome':'siteTitle')}</h1><p>${t(r.name==='onboarding'?'welcomeCopy':'siteCopy')}</p>${siteCards(sites,locale)}<div class="heading-actions"><a href="#/content" class="btn primary">${t('continue')}</a>${button(t('refresh'),'refresh')}</div></section>`;
 else content=`<div class="studio-loading">${busy?t('loading'):''}</div>`;
 const directory=identity.organizationDirectory?.status==='unavailable'?`<div class="studio-notice studio-directory">${t('directory')}${identity.organizationDirectory.code?`<code>${escape(identity.organizationDirectory.code)}</code>`:''}</div>`:'';
 const csrf=!api.csrf?`<div class="studio-notice error">${t('csrfMissing')}</div>`:'';
 root.innerHTML=shell(directory+csrf+content,identity.workspaces,owner,identity.subject,locale,r.name);showNotice();
}
function renderLogin(){
 const authError=new URLSearchParams(location.search).has('authError');
 root.innerHTML=`<div class="studio-auth"><section class="studio-auth-art"><a href="/studio" class="wordmark"><span class="brand-symbol">◈</span><span>ChronoAI<small>PUBLISHING STUDIO</small></span></a><div><div class="eyebrow">IDEAS DESERVE A PLACE</div><h1>${t('loginTitle')}</h1><p>${t('loginCopy')}</p></div><small class="eyebrow">WRITE WITH INTENTION. SHARE WITH CONFIDENCE.</small></section><section class="studio-auth-side"><div class="studio-auth-card"><h2>${t('studio')}</h2><p>${t('session')}</p>${authError?`<div class="studio-notice error" role="alert">${t('loginError')}</div>`:''}${notice?.kind==='error'?`<div class="studio-notice error" role="alert">${escape(notice.text)}<code>${escape(notice.details??'')}</code></div>`:''}<a class="btn primary full large" href="/auth/login?returnTo=%2Fstudio" id="signin">${t('signin')} →</a><div class="studio-auth-tools"><select id="locale" aria-label="${t('interface')}"><option value="en" ${locale==='en'?'selected':''}>EN</option><option value="zh" ${locale==='zh'?'selected':''}>简中</option></select><a href="/">${t('legacy')}</a></div></div></section></div>`;
}
async function failure(error:unknown,stamp=context.current()){
 if(!context.accepts(stamp)||(error instanceof DOMException&&error.name==='AbortError'))return;
 busy=false;const e=error instanceof ApiError?error:null;
 notice={text:e?.message??(error instanceof Error?error.message:t('error')),kind:'error',details:e?`${e.code}${e.traceId?' · Trace ID '+e.traceId:''}`:undefined};
 if(e?.status===401){identity=null;api.csrf=undefined;sessionStorage.setItem('chrono.studio.return',safeReturnPath('/studio'+currentHash));render();return;}
 if(e?.status===403){suspended=true;render();try{const me=await api.json<Identity>('/me',{signal:stamp.signal});if(context.accepts(stamp)){identity=me;api.csrf=me.csrf;owner=me.workspaces.find(w=>w.id===owner?.id)??null;render();}}catch{/* Original classified error remains visible; no previous permission is restored. */}return;}
 render();
}
function unsavedAllowed(){return !draft?.dirty||window.confirm(t('discard'));}
async function loadIdentity(){const stamp=context.advance();busy=true;render();try{
 const me=await api.json<Identity>('/me',{signal:stamp.signal});if(!context.accepts(stamp))return;
 identity=me;api.csrf=me.csrf;owner=me.workspaces.find(w=>w.id===sessionStorage.getItem('chrono.studio.owner'))??me.workspaces[0]??null;
 const restored=sessionStorage.getItem('chrono.studio.return');sessionStorage.removeItem('chrono.studio.return');
 if(restored){const safe=safeReturnPath(restored);if(safe.startsWith('/studio#')){currentHash=safe.slice('/studio'.length);historyReplace(currentHash);}}
 busy=false;await loadRoute();
 }catch(error){await failure(error,stamp);}}
function historyReplace(hash:string){window.history.replaceState(null,'',location.pathname+hash);lastHash=hash;}
async function loadRoute(){
 const stamp=context.advance();busy=true;suspended=false;notice=null;page=null;summary=null;history=[];sites=[];source=null;previewMode='write';previewHtml='';draft=null;pendingSource=null;render();
 if(!owner){busy=false;render();return;}
 const ownerId=owner.id;const r=route();
 try{
  if(r.name==='content'){
   const params=new URLSearchParams({language:filters.language,status:filters.status,q:filters.q,limit:String(filters.limit),offset:String(filters.offset)});
   const result=await api.json<ContentPage>(`/owners/${encodeURIComponent(ownerId)}/content-summary?${params}`,{signal:stamp.signal});if(!context.accepts(stamp))return;page=result;
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
  }else {currentHash='#/content';historyReplace(currentHash);await loadRoute();return;}
  busy=false;render();
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
function exportLocal(){if(!draft)return;const bytes=new TextEncoder().encode(markdownForSave(draft));const anchor=document.createElement('a');anchor.href='data:text/markdown;base64,'+base64(bytes);anchor.download='working-draft.md';anchor.click();}
async function exportRaw(){if(!draft?.article||busy)return;const article=draft.article;const stamp=context.current();busy=true;render();try{
 const file=await api.json<{articleId:string;revisionId:string;encoding:string;byteLength:number;sha256:string;data:string}>(`/articles/${encodeURIComponent(article.id)}/markdown-file?revision=${encodeURIComponent(article.revision.id)}`,{signal:stamp.signal});if(!context.accepts(stamp))return;
 const bytes=Uint8Array.from(atob(file.data),c=>c.charCodeAt(0));const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');if(!context.accepts(stamp))return;
 if(file.articleId!==article.id||file.revisionId!==article.revision.id||file.encoding!=='base64'||file.byteLength!==bytes.length||file.data!==base64(bytes)||digest!==file.sha256)throw new ApiError(502,'MARKDOWN_INTEGRITY','Original Markdown integrity check failed');
 const anchor=document.createElement('a');anchor.href='data:text/markdown;base64,'+file.data;anchor.download='article.md';anchor.click();busy=false;render();
 }catch(error){await failure(error,stamp);}}
async function logout(){if(!unsavedAllowed())return;const stamp=context.advance();try{const response=await fetch('/auth/logout',{method:'POST',credentials:'same-origin',headers:{'x-csrf-token':api.csrf??''}});if(!response.ok)throw new ApiError(response.status,'LOGOUT_FAILED',t('error'),response.headers.get('x-trace-id')??'');identity=null;owner=null;draft=null;api.csrf=undefined;notice=null;sessionStorage.removeItem('chrono.studio.return');render();}catch(error){await failure(error,stamp);}}
function navigate(hash:string){location.hash=hash;}
async function action(name:string){
 switch(name){
  case 'identity':await loadIdentity();break;
  case 'logout':await logout();break;
  case 'refresh':if(unsavedAllowed())await loadRoute();break;
  case 'new':navigate(`#/new/${filters.language}`);break;
  case 'previous':filters.offset=Math.max(0,filters.offset-filters.limit);await loadRoute();break;
  case 'next':filters.offset+=filters.limit;await loadRoute();break;
  case 'save':await save();break;
  case 'submit':await submit();break;
  case 'current':if(draft?.article){const hash=`#/article/${encodeURIComponent(draft.article.id)}`;if(hash===currentHash){if(unsavedAllowed())await loadRoute();}else navigate(hash);}break;
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
 const control=target.closest<HTMLButtonElement>('[data-action]');if(control&&!control.disabled)void action(control.dataset.action!);
});
root.addEventListener('submit',event=>{if((event.target as HTMLElement).id==='search-form'){event.preventDefault();filters.q=(document.getElementById('search') as HTMLInputElement).value;filters.offset=0;void loadRoute();}});
root.addEventListener('input',event=>{if(!draft||!canEdit())return;const input=event.target as HTMLInputElement|HTMLTextAreaElement;
 if(input.id==='source-id'){source=null;const confirm=root.querySelector<HTMLButtonElement>('[data-action="link-source"]');if(confirm)confirm.disabled=true;}
 if(input.id==='article-title'){draft.title=input.value;draft.dirty=true;}
 if(input.id==='credited-author'){draft.author=input.value;draft.dirty=true;}
 if(input.id==='markdown'){draft.markdown=input.value;draft.markdownChanged=true;draft.dirty=true;}
 if(['article-title','credited-author','markdown'].includes(input.id)){const submitButton=root.querySelector<HTMLButtonElement>('[data-action="submit"]');if(submitButton)submitButton.disabled=true;const status=root.querySelector('.editor-state');if(status)status.innerHTML=badge(t('unsaved'),'amber');}
});
root.addEventListener('change',event=>{const input=event.target as HTMLInputElement|HTMLSelectElement;
 if(input.id==='locale'){locale=input.value==='zh'?'zh':'en';localStorage.setItem('chrono.studio.locale',locale);render();}
 if(input.id==='workspace'){
  if(!unsavedAllowed()){input.value=owner?.id??'';return;}owner=identity?.workspaces.find(w=>w.id===input.value)??null;sessionStorage.setItem('chrono.studio.owner',owner?.id??'');filters={...filters,offset:0,q:'',status:'all'};currentHash='#/content';historyReplace(currentHash);void loadRoute();
 }
 if(input.id==='article-language'){filters.language=input.value==='zh'?'zh':'en';filters.offset=0;void loadRoute();}
 if(input.id==='translation-peer'&&input.value)navigate(`#/article/${encodeURIComponent(input.value)}`);
 if(input.id==='markdown-file'){const file=(input as HTMLInputElement).files?.[0];if(file)void importFile(file);}
 if(input.id==='image-file'){const file=(input as HTMLInputElement).files?.[0];if(file)void imageFile(file);}
});
window.addEventListener('hashchange',()=>{if(!unsavedAllowed()){historyReplace(lastHash);return;}currentHash=location.hash||'#/content';lastHash=currentHash;void loadRoute();});
window.addEventListener('beforeunload',event=>{if(draft?.dirty){event.preventDefault();event.returnValue='';}});
void loadIdentity();
