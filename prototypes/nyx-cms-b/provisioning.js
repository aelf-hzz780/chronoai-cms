'use strict';
// Adapter for the existing full-site prototype. Real services are never called.
const setupModel=globalThis.SiteSetupModel;
const SETUP_STORAGE='chronoai-fullsite-setup-v1';
for(const w of Object.values(workspaces))setupModel.workspaces[w.id]={name:w.name,kind:w.kind,initials:w.name.slice(0,2).toUpperCase(),slug:w.slug};
const setupData=setupModel.initialState();
setupData.requests={};setupData.forms={};
for(const w of Object.values(workspaces)){
  setupData.requests[w.id]=null;
  setupData.forms[w.id]={name:site.settings[w.id].name,note:''};
}
let setupStorageError=false,setupLegacyOwner=null,setupLegacyLocale=null;
try{
  const saved=JSON.parse(localStorage.getItem(SETUP_STORAGE)||localStorage.getItem(setupModel.STORAGE_KEY));
  if(saved?.version===1&&saved.requests&&saved.forms){
    setupLegacyOwner=saved.workspace;setupLegacyLocale=saved.locale;
    setupData.counter=Number.isSafeInteger(saved.counter)?saved.counter:setupData.counter;
    for(const owner of Object.keys(workspaces)){
      const r=saved.requests[owner];
      if(r?.owner===owner&&r.sites?.en&&r.sites?.zh&&Array.isArray(r.events))setupData.requests[owner]=r;
      if(typeof saved.forms[owner]?.name==='string'&&typeof saved.forms[owner]?.note==='string')setupData.forms[owner]=saved.forms[owner];
    }
    setupModel.normalizeSetupScope(setupData);
  }
}catch(error){setupStorageError=true;console.info('[prototype-setup] Local state unavailable:',error.name);}
site.setupRequests=setupData.requests;
const setupView={mode:'user',owner:null,language:'en',returnEditor:null,formOwner:null,pendingRoot:null};
const setupResetWorkspace=resetWorkspaceContext;
resetWorkspaceContext=function(){setupResetWorkspace();setupView.mode='user';setupView.owner=null;setupView.pendingRoot=null;setupView.returnEditor=null;};
const setupNavigate=navigate;
navigate=function(route){const changed=route==='settings'&&setupView.mode==='ops';if(route==='settings'){setupView.mode='user';setupView.owner=null;}setupNavigate(route);if(changed&&state.route==='settings')render();};
function persistSetup(){
  try{localStorage.setItem(SETUP_STORAGE,JSON.stringify({version:1,counter:setupData.counter,requests:setupData.requests,forms:setupData.forms}));}
  catch(error){setupStorageError=true;console.info('[prototype-setup] Changes retained in memory:',error.name);}
}
function syncSetupRequest(r){
  if(!r)return;
  site.provisioning[r.owner]={en:r.sites.en.status!=='ready',zh:r.sites.zh.status!=='ready'};
  if(r.status==='complete')site.settings[r.owner].name=r.name;
}
Object.values(setupData.requests).forEach(syncSetupRequest);
function canApplySetup(owner=state.workspace){return site.signedIn&&accessibleWorkspace(owner)&&setupModel.canRequest(owner,workspaces[owner].role);}
function setupError(error){
  const messages={PERMISSION:['仅个人 Owner 或组织 Admin 可以申请或补充资料。','Only the personal owner or organization Admin can apply or provide information.'],NAME_REQUIRED:['请填写 1–80 字的博客名称。','Enter a blog name of 1–80 characters.'],INVALID_FIELDS:['备注最多 1,000 字。','Keep the note within 1,000 characters.'],INFO_REQUIRED:['请填写补充说明。','Enter the requested information.'],DEMO_URL:['请输入 HTTPS 平台子域名根地址，不含语言路径、端口或参数。','Enter an HTTPS platform subdomain root without a language path, port or parameters.'],ENGLISH_REQUIRED:['请先核验英文站点。','Verify the English site first.'],ADDRESS_UNSAVED:['地址尚未登记，请先登记或恢复原地址。','Register or restore the address before verification.']};
  const message=txt(...(messages[error.message]||['申请状态已变化，请查看当前状态后重试。','The request changed; review its current state before retrying.']));
  const el=document.getElementById('setup-error');if(el)el.textContent=translateUi(message);else toast(message);
}
function setupAction(fn){try{fn();persistSetup();}catch(error){setupError(error);}}
function currentSetupRequest(){return setupData.requests[setupView.owner??state.workspace];}
function requireSetupOperator(){if(!site.signedIn||setupView.mode!=='ops')throw new Error('PERMISSION');const r=currentSetupRequest();if(!r)throw new Error('INVALID_STATE');return r;}
function openSetup(){setupView.mode='user';navigate('settings');render();}
flowHandlers['setup-from-editor']=()=>{setupView.returnEditor={owner:state.workspace,id:state.articleId,lang:state.lang};openSetup();};
flowHandlers['setup-return-editor']=()=>{
  const origin=setupView.returnEditor;
  if(!origin||origin.owner!==state.workspace||!articles.some(a=>a.id===origin.id&&a.owner===origin.owner))return;
  state.articleId=origin.id;state.lang=origin.lang;navigate('editor');
};
flowHandlers['setup-open']=()=>openSetup();
flowHandlers['setup-apply']=()=>{
  if(!canApplySetup())return toast(txt('请联系当前组织的 Admin 提交申请。','Ask this organization’s Admin to submit the request.'));
  if(setupData.requests[state.workspace])return render();
  setupView.formOwner=state.workspace;showSetupApplication();
};
function submitSetup(owner,fields){
  if(owner!==state.workspace||!canApplySetup(owner))throw new Error('PERMISSION');
  const existing=setupData.requests[owner];if(existing)return existing;
  const ready={en:isSiteReady(owner,'en'),zh:isSiteReady(owner,'zh')};
  setupData.role=workspaces[owner].role;
  const r=setupModel.applyRequest(setupData,owner,fields);
  // Existing configured language sites are retained when requesting the missing language.
  if(ready.en||ready.zh){
    r.rootUrl=publicationTarget(owner,'en').rootUrl;
    for(const lang of ['en','zh']){
      r.sites[lang].url=r.rootUrl+lang+'/';
      if(ready[lang])r.sites[lang].status='ready';
    }
  }
  syncSetupRequest(r);return r;
}
flowHandlers['setup-submit']=()=>setupAction(()=>{
  const owner=setupView.formOwner;
  submitSetup(owner,setupData.forms[owner]);closeModal();render();
  toast(txt('申请已提交，运维处理进度会显示在本页。','Request submitted. Operations progress appears on this page.'));
});
flowHandlers['setup-supplement']=()=>{if(canApplySetup())showSetupSupplement();};
flowHandlers['setup-send-supplement']=()=>setupAction(()=>{
  if(setupView.formOwner!==state.workspace||!canApplySetup())throw new Error('PERMISSION');
  setupData.role=state.role;
  setupModel.provideInfo(setupData,state.workspace,document.getElementById('setup-response').value);
  closeModal();render();
});
flowHandlers['setup-ops']=()=>{closeModal();guard(()=>{navigate('settings');setupView.mode='ops';setupView.owner=null;render();});};
flowHandlers['setup-user']=()=>{setupView.mode='user';setupView.owner=null;render();};
flowHandlers['setup-detail']=owner=>{if(setupView.mode!=='ops'||!setupData.requests[owner])return;setupView.owner=owner;setupView.language='en';render();};
flowHandlers['setup-queue']=()=>{setupView.owner=null;render();};
flowHandlers['setup-claim']=()=>setupAction(()=>{setupModel.claim(requireSetupOperator());render();});
flowHandlers['setup-ask-info']=()=>setupAction(()=>{requireSetupOperator();showSetupInfoRequest();});
flowHandlers['setup-send-info']=()=>setupAction(()=>{setupModel.requestInfo(requireSetupOperator(),document.getElementById('setup-info-reason').value);closeModal();render();});
flowHandlers['setup-language']=lang=>{if(['en','zh'].includes(lang)){setupView.language=lang;render();}};
flowHandlers['setup-register-root']=()=>setupAction(()=>{
  const r=requireSetupOperator(),root=setupModel.canonicalRootUrl(document.getElementById('setup-root').value);
  if(r.rootUrl&&root!==r.rootUrl){setupView.pendingRoot={owner:r.owner,root};showSetupRootConfirmation(r,root);return;}
  setupModel.registerBlogRoot(r,root);delete setupData.operatorRoots[r.owner];syncSetupRequest(r);render();
});
flowHandlers['setup-confirm-root']=()=>setupAction(()=>{
  const r=requireSetupOperator(),pending=setupView.pendingRoot;
  if(!pending||pending.owner!==r.owner)throw new Error('INVALID_STATE');
  setupModel.registerBlogRoot(r,pending.root);delete setupData.operatorRoots[r.owner];setupView.pendingRoot=null;syncSetupRequest(r);closeModal();render();
});
function verifySetup(kind,pass){
  const r=requireSetupOperator();
  if(document.getElementById('setup-root').value!==r.rootUrl)throw new Error('ADDRESS_UNSAVED');
  if(kind==='root')setupModel.verifyRoot(r,pass);else setupModel.verifySite(r,setupView.language,pass);
  syncSetupRequest(r);render();
}
flowHandlers['setup-verify']=kind=>setupAction(()=>verifySetup(kind,true));
flowHandlers['setup-verify-fail']=()=>setupAction(()=>verifySetup('language',false));
flowHandlers['setup-root-preview']=()=>{
  const r=setupData.requests[state.workspace];if(r&&r.rootCheck.status!=='passed')return;
  if(!isSiteReady(state.workspace,'en'))return;
  flowHandlers['open-public-site'](state.workspace+':en');
};
flowHandlers['setup-demo-new']=()=>{
  closeModal();setupData.requests[state.workspace]=null;site.provisioning[state.workspace]={en:true,zh:true};
  setupView.mode='user';persistSetup();navigate('settings');render();
};
// Keep the existing demo controls. A fixture change also updates its setup request.
flowHandlers['toggle-zh']=()=>{
  const owner=state.workspace,r=setupData.requests[owner];
  site.provisioning[owner].zh=!site.provisioning[owner].zh;
  if(r){r.sites.zh.status=site.provisioning[owner].zh?'pending':'ready';r.sites.zh.checks=[];r.sites.zh.checkedAt=null;r.status='partial';}
  setupView.mode='user';persistSetup();closeModal();navigate('settings');render();
};
document.addEventListener('input',event=>{
  const el=event.target,owner=setupView.formOwner;
  if(el.id==='setup-root'&&setupView.mode==='ops'&&setupView.owner){setupData.operatorRoots[setupView.owner]=el.value;return;}
  if(['setup-name','setup-note'].includes(el.id)&&owner&&setupData.forms[owner]){
    setupData.forms[owner][el.id==='setup-name'?'name':'note']=el.value;persistSetup();
  }
});
// Old standalone bookmarks resolve inside the existing settings page.
if(['sites','request','ops','draft'].includes(location.hash.slice(1).split('?')[0])){
  if(accessibleWorkspace(setupLegacyOwner)){state.workspace=setupLegacyOwner;state.articleId=defaultArticle(state.workspace);}
  if(['en','zh'].includes(setupLegacyLocale)&&!localStorage.getItem('chronoai-prototype-ui-locale'))setUiLocale(setupLegacyLocale);
  state.route='settings';history.replaceState(null,'','#settings?owner='+state.workspace);
}
