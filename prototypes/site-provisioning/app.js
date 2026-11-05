import {STORAGE_KEY,initialState,workspaces,applyRequest,requestInfo,provideInfo,claim,canonicalRootUrl,registerBlogRoot,verifyRoot,verifySite,loadScenario,canRequest,normalizeSetupScope} from './model.js';
import {createViews} from './views.js';
import {openDialog,closeDialog,togglePicker,closePicker,pickerKeys,toast,esc} from './ui.js';
let state=initialState(),storageAvailable=true,modalType=null,modalOwner=null,busy=false,busySite=null;
try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));if(saved?.version===1&&saved.requests&&saved.forms&&saved.drafts&&['en','zh'].includes(saved.locale)&&['org','personal'].includes(saved.workspace)&&['admin','member','publisher'].includes(saved.role)){state={...initialState(),...saved,outboundPaused:true};}}catch{storageAvailable=false;}
normalizeSetupScope(state);
const query=new URL(location.href);if(['en','zh'].includes(query.searchParams.get('lang'))){state.locale=query.searchParams.get('lang');query.searchParams.delete('lang');history.replaceState(null,'',query.pathname+query.search+query.hash);}
function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{storageAvailable=false;}}
function route(){const raw=(location.hash||'#sites').slice(1).split('?');if(raw[0]==='draft'){history.replaceState(null,'',location.pathname+location.search+'#sites');raw[0]='sites';}const page=['sites','request','ops','ops/detail','blog'].includes(raw[0])?raw[0]:'sites';const params=new URLSearchParams(raw[1]);if(params.has('owner')&&!Object.hasOwn(workspaces,params.get('owner')))params.set('owner',state.workspace);return {page,params};}
function currentOwner(){const {page,params}=route();return page==='ops/detail'?params.get('owner')??state.workspace:state.workspace;}
const t=(en,zh)=>state.locale==='zh'?zh:en;
function draw(){const focused=document.activeElement,focusId=focused?.id,selection=focused?.selectionStart;closePicker();const r=route();document.documentElement.lang=state.locale==='zh'?'zh-CN':'en';document.querySelector('.skip-link').textContent=t('Skip to content','跳至主要内容');document.title=t('ChronoAI · Blog setup prototype','ChronoAI · 博客开通原型');document.getElementById('app').innerHTML=createViews(state).shell(r.page,r.params);if(!storageAvailable){const n=document.createElement('div');n.className='notice warning';n.textContent=t('Browser storage is unavailable. Changes will last only until this page is closed.','浏览器存储不可用，演示数据只能保留到页面关闭。');document.getElementById('main').prepend(n);}if(modalType){openDialog(createViews(state).dialog(modalType,modalOwner));}if(focusId){const next=document.getElementById(focusId);next?.focus({preventScroll:true});if(next&&typeof selection==='number'&&next.setSelectionRange)next.setSelectionRange(selection,selection);}applyPendingVerification();persist();}
function applyPendingVerification(){if(!busySite||route().page!=='ops/detail'||currentOwner()!==busySite.owner)return;document.querySelectorAll('#main input,#main textarea,#main button').forEach(el=>{el.disabled=true;});const button=document.querySelector(busySite.language?'[data-action=verify-site]':'[data-action=verify-root]');if(button){button.setAttribute('aria-busy','true');button.textContent=t('Checking…','正在核验…');}}
function go(hash){closePicker();if(document.getElementById('modal').open)closeDialog();modalType=null;modalOwner=null;if(location.hash===hash)draw();else location.hash=hash;}
function show(type,owner=state.workspace){modalType=type;modalOwner=owner;openDialog(createViews(state).dialog(type,owner));document.querySelector('#modal input:not([readonly]),#modal textarea')?.focus({preventScroll:true});}
function fail(code){const messages={PERMISSION:t('An organization administrator is required for this action.','此操作需要组织管理员权限。'),NAME_REQUIRED:t('Enter a blog name of up to 80 characters.','请填写 1–80 字的博客名称。'),INFO_REQUIRED:t('Please add the requested information before continuing.','请先填写需要补充的说明。'),DEMO_URL:t('Use a root URL such as https://richard.chronoai.example/ with no language path, credentials or parameters.','请输入如 https://richard.chronoai.example/ 的根地址，不含语言路径、凭证或参数。'),ENGLISH_REQUIRED:t('Verify the English site before the root redirect.','请先核验英文站点，再核验根路径跳转。'),SITE_REQUIRED:t('Register the shared blog root before verifying language sites.','请先登记博客根地址，再核验语言站点。'),ALREADY_READY:t('This site is already ready. Its address is preserved.','当前站点已就绪，将保留现有地址。'),ADDRESS_UNSAVED:t('Register or restore the changed root before verification.','请先登记或恢复修改后的根地址，再执行核验。'),URL_CHANGED:t('The address changed. Run a new verification.','地址已变化，请重新核验。'),INVALID_STATE:t('The request changed. Review the current state before continuing.','申请状态已变化，请查看当前状态后继续。'),INVALID_FIELDS:t('Please keep the note within 1,000 characters.','备注请控制在 1,000 字以内。')};const message=messages[code]??t('This action could not be completed in the prototype.','原型中未能完成此操作，请检查当前状态。');const el=document.getElementById('form-error');if(el){el.textContent=message;const input=document.querySelector('#modal input[required],#modal textarea');input?.setAttribute('aria-invalid','true');input?.focus();}else toast(message);}
async function act(action,el){const owner=currentOwner(),r=state.requests[owner];try{
 switch(action){
  case 'apply':if(!canRequest(state.workspace,state.role))return show('admin-info');return show('apply');
  case 'close-dialog':modalType=null;modalOwner=null;closeDialog();return;
  case 'submit-request':{if(busy)return;busy=true;const target=modalOwner;applyRequest(state,target,state.forms[target]);state.scenario='custom';persist();modalType=null;closeDialog();go('#request');toast(t('Request submitted. Operations will take it from here.','开通申请已提交，等待运维处理。'));busy=false;break;}
  case 'supplement':if(!canRequest(state.workspace,state.role))return show('admin-info');return show('supplement');
  case 'send-supplement':provideInfo(state,modalOwner,state.supplementDrafts[modalOwner]??'');state.scenario='custom';modalType=null;closeDialog();draw();toast(t('Information saved. Operations can continue this request.','补充资料已提交，运维可继续处理此申请。'));break;
  case 'request':go('#request');break;
  case 'admin-info':show('admin-info');break;
  case 'help':show('help');break;
  case 'refresh':case 'recover':state.readError=false;draw();toast(t('Showing the latest local prototype state.','已读取本机最新演示状态。'));break;
  case 'ops-view':go('#ops');break;
  case 'user-view':go('#sites');break;
  case 'filter':state.queueFilter=el.dataset.filter;draw();break;
  case 'claim':claim(r);state.scenario='custom';draw();toast(r.status==='info'?t('Request claimed. Waiting for the applicant’s response.','申请已领取，等待申请人补充资料。'):t('Request claimed. Continue with manual setup.','已领取申请，可以继续人工开通。'));break;
  case 'ask-info':return show('ask-info',owner);
  case 'send-info':requestInfo(state.requests[modalOwner],state.infoDrafts[modalOwner]??'');modalType=null;closeDialog();state.scenario='custom';draw();toast(t('The applicant can now provide the requested information.','补充请求已展示给申请人。'));break;
  case 'op-language':state.activeLanguage=el.dataset.lang;draw();break;
  case 'register-root':case 'confirm-root':{
   if(busy)return;
   const target=action==='confirm-root'?modalOwner:owner,ref=state.requests[target];
   const value=canonicalRootUrl(action==='confirm-root'?state.operatorRoots[target]:document.getElementById('blog-root').value);
   state.operatorRoots[target]=value;
   if(action==='register-root'&&ref.rootUrl&&value!==ref.rootUrl)return show('change-root',target);
   registerBlogRoot(ref,value);state.scenario='custom';modalType=null;modalOwner=null;closeDialog();draw();
   toast(t('Root registered. Verify /en/, /zh/ and the root redirect.','根地址已登记，请核验 /en/、/zh/ 和根路径跳转。'));break;
  }
  case 'verify-site':{if(busy)return;const target=owner,language=state.activeLanguage,ref=r,result=state.checkResult==='pass',url=r.sites[state.activeLanguage].url;if(document.getElementById('blog-root').value!==r.rootUrl)throw new Error('ADDRESS_UNSAVED');busy=true;busySite={owner,language};applyPendingVerification();let applied=false;try{await new Promise(resolve=>setTimeout(resolve,550));if(state.requests[target]===ref){verifySite(ref,language,result,url);state.scenario='custom';applied=true;}}finally{busy=false;busySite=null;draw();}if(applied)toast(result?t('Demo verification passed. Publishing remains paused.','演示核验通过，发布执行仍保持暂停。'):t('Demo check failed. Operations can retry the same site.','演示核验未通过，运维可继续处理同一站点。'));break;}
  case 'verify-root':{
   if(busy)return;
   if(document.getElementById('blog-root').value!==r.rootUrl)throw new Error('ADDRESS_UNSAVED');
   const target=owner,ref=r,root=r.rootUrl,result=state.checkResult==='pass';busy=true;busySite={owner,language:null};applyPendingVerification();let applied=false;
   try{await new Promise(resolve=>setTimeout(resolve,550));if(state.requests[target]===ref){verifyRoot(ref,result,root);state.scenario='custom';applied=true;}}finally{busy=false;busySite=null;draw();}
   if(applied)toast(result?t('Root redirect to English passed in this demo.','演示根路径跳转英文核验通过。'):t('Root redirect needs attention. Language checks were preserved.','根路径跳转待处理，语言站点核验结果已保留。'));break;
  }
  case 'as-applicant':if(!['org','personal'].includes(owner))return;state.workspace=owner;go('#request');break;
  case 'back-from-blog':{const p=route().params.get('owner');if(p&&['org','personal'].includes(p)){state.workspace=p;go('#sites');}else go('#ops');break;}
  case 'reset':show('reset');break;
  case 'confirm-reset':{const locale=state.locale;state=initialState();state.locale=locale;modalType=null;closeDialog();persist();go('#sites');toast(t('Prototype reset. Real services were not changed.','原型已重置，真实服务未受影响。'));break;}
 }
 persist();
 }catch(error){busy=false;busySite=null;fail(error.message);}}
function pick(id,value){closePicker();if(id==='locale'){state.locale=value;draw();return;}if(id==='workspace'){state.workspace=value;state.readError=false;state.activeLanguage='en';go('#sites');draw();return;}if(id==='role'){state.role=value;draw();return;}if(id==='scenario'){if(value==='custom'){state.scenario='custom';draw();return;}const owner=currentOwner();loadScenario(state,owner,value);delete state.operatorRoots[owner];state.supplementDrafts[owner]='';draw();toast(t('Demo scenario loaded for this workspace.','已为当前工作区载入演示场景。'));return;}if(id==='result'){state.checkResult=value;draw();}}
document.addEventListener('click',event=>{if(event.target.closest('.skip-link')){event.preventDefault();document.getElementById('main').focus();return;}const selected=event.target.closest('[data-pick]');if(selected){pick(selected.dataset.pick,selected.dataset.value);return;}const trigger=event.target.closest('[data-picker]');if(trigger){togglePicker(trigger);return;}if(!event.target.closest('.picker-menu'))closePicker();const action=event.target.closest('[data-action]');if(action&&!action.disabled)void act(action.dataset.action,action);});
document.addEventListener('keydown',event=>{pickerKeys(event);});
document.addEventListener('input',event=>{const el=event.target,id=el.id,owner=currentOwner();if(id==='apply-name'||id==='apply-note'){state.forms[modalOwner][id.replace('apply-','')]=el.value;el.removeAttribute('aria-invalid');const err=document.getElementById('form-error');if(err)err.textContent='';}else if(id==='supplement-text')state.supplementDrafts[modalOwner]=el.value;else if(id==='info-reason')state.infoDrafts[modalOwner]=el.value;else if(id==='blog-root'){
 state.operatorRoots[owner]=el.value;
 const r=state.requests[owner],dirty=el.value!==r?.rootUrl;
 const languageCheck=document.querySelector('[data-action=verify-site]'),rootCheck=document.querySelector('[data-action=verify-root]');
 if(languageCheck)languageCheck.disabled=dirty||!r?.sites[state.activeLanguage].url||r.sites[state.activeLanguage].status==='ready'||r.status==='info'||!r.assignee;
 if(rootCheck)rootCheck.disabled=dirty||r?.sites.en.status!=='ready'||r.rootCheck.status==='passed'||r.status==='info'||!r.assignee;
 let hint=document.getElementById('root-dirty');if(!hint){hint=document.createElement('p');hint.id='root-dirty';hint.className='field-hint';document.querySelector('.input-with-button').after(hint);}
 hint.textContent=dirty&&r?.rootUrl?t('Updating the root invalidates both language checks and the redirect check.','修改根地址会使两语言及根入口的旧核验结果失效。'):'';
 }else if(id==='internal-note')state.requests[owner].internalNote=el.value;else if(id==='queue-search'){state.queueSearch=el.value;draw();}persist();});
document.getElementById('modal').addEventListener('close',()=>{modalType=null;modalOwner=null;closePicker();});
window.addEventListener('hashchange',()=>{if(document.getElementById('modal').open){modalType=null;closeDialog();}draw();window.scrollTo({top:0,behavior:'instant'});document.getElementById('main').focus({preventScroll:true});});
window.addEventListener('resize',()=>closePicker());window.addEventListener('scroll',event=>{if(!event.target.closest?.('.picker-menu'))closePicker();},true);
// This prototype deliberately has no API client, credentials or publishing worker.
draw();
