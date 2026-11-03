import {ApiError} from './transport.js';
import {ContextGate,type Stamp} from './state.js';
import {OperationIntent} from './publication-model.js';
import {distributionBody,manualFollowup,planConfirmation,copyAccountMatches} from './distribution-model.js';
import {distributionView,deliveryFollowupView,planFollowupView} from './distribution-view.js';
import {workflowText} from './workflow-i18n.js';
import {base64} from './bytes.js';
import type {ContentPage,Release,Summary,TaskDetail,TaskPage} from './types.js';
import type {Delivery,Destination,DistributionForm,ManualPackage,OwnerConnection,WorkflowHost} from './workflow-types.js';
export interface DistributionState {summary:Summary|null;releases:Release[];deliveries:Delivery[];targets:Destination[];connections:OwnerConnection[];errors:string[];tasks:TaskPage|null;offset:number;source:TaskDetail|null;selectedCopy:TaskDetail|null;task:TaskDetail|null;row:Delivery|null;form:DistributionForm;busy:boolean;unknown:boolean;approvalUnknown:boolean;approvalRef:string;approvalRights:boolean;package:ManualPackage|null;reportState:string;reportUrl:string;reportNote:string;note:string;observationUrl:string;planRights:boolean;planOpen:boolean}
export class DistributionController {
 host:WorkflowHost;state:DistributionState;private ownerId='';private articleId='';private intent=new OperationIntent();private planIntent=new OperationIntent();private selection=new ContextGate();
 constructor(host:WorkflowHost){this.host=host;this.state=this.empty();}
 private empty():DistributionState{return {summary:null,releases:[],deliveries:[],targets:[],connections:[],errors:[],tasks:null,offset:0,source:null,selectedCopy:null,task:null,row:null,form:{target:'',connectionId:'',action:'create',format:'full',excerpt:'',copyId:'',rights:false,notBeforeAt:''},busy:false,unknown:false,approvalUnknown:false,approvalRef:'',approvalRights:false,package:null,reportState:'submitted',reportUrl:'',reportNote:'',note:'',observationUrl:'',planRights:false,planOpen:false};}
 setPlanOpen(open:boolean){this.state.planOpen=open;}
 reset(){this.selection.advance();this.state=this.empty();this.ownerId='';this.articleId='';this.intent=new OperationIntent();this.planIntent=new OperationIntent();}
 allowed(){const owner=this.host.owner();return Boolean(owner&&owner.id===this.ownerId&&owner.capabilities.canPublish);}
 private canConnect(){return Boolean(this.allowed()&&this.host.owner()?.capabilities.canReadConnections);}
 view(){return distributionView(this.state,this.host.owner()!,this.host.locale(),this.canConnect());}
 taskView(){const task=this.state.task;if(!task)return '';return task.kind==='plan'?planFollowupView(this.state,this.host.locale(),this.canConnect()):task.kind==='delivery'?deliveryFollowupView(this.state,this.host.owner()!,this.host.locale(),this.allowed(),this.canConnect()):'';}
 receiveTask(task:TaskDetail){if(this.state.task?.id===task.id)this.state.task=task;}
 private async catalog(stamp:Stamp){
  const calls:Array<Promise<Destination[]|OwnerConnection[]>>=[this.host.api.json<Destination[]>('/targets',{signal:stamp.signal})];if(this.canConnect())calls.push(this.host.api.json<OwnerConnection[]>(`/owners/${encodeURIComponent(this.ownerId)}/connections`,{signal:stamp.signal}));
  const results=await Promise.allSettled(calls);if(!this.host.accepts(stamp))return;
  for(const [index,result] of results.entries())if(result.status==='fulfilled'){if(index===0)this.state.targets=result.value as Destination[];else this.state.connections=result.value as OwnerConnection[];}else {if(result.reason instanceof ApiError&&[401,403].includes(result.reason.status))throw result.reason;this.state.errors.push(result.reason instanceof ApiError?`${result.reason.code} · Trace ID ${result.reason.traceId}`:'Inventory unavailable');}
 }
 async loadArticle(id:string,stamp:Stamp){
  const owner=this.host.owner();if(!owner)return;this.ownerId=owner.id;this.articleId=id;if(!this.canConnect())return;
  const [summary,releases,deliveries,tasks]=await Promise.all([this.host.api.json<ContentPage>(`/owners/${encodeURIComponent(owner.id)}/content-summary?articleId=${encodeURIComponent(id)}&limit=1`,{signal:stamp.signal}),this.host.api.json<Release[]>(`/articles/${encodeURIComponent(id)}/releases`,{signal:stamp.signal}),this.host.api.json<Delivery[]>(`/articles/${encodeURIComponent(id)}/deliveries`,{signal:stamp.signal}),this.readTasks(stamp)]);if(!this.host.accepts(stamp))return;
  const item=summary.items.find(item=>item.id===id&&item.ownerId===owner.id);if(!item)throw new ApiError(403,'FORBIDDEN','Article workspace unavailable');this.state.summary=item;this.state.releases=releases;this.state.deliveries=deliveries;this.state.tasks=tasks;await this.catalog(stamp);if(!this.host.accepts(stamp))return;await this.inspectSource(stamp);
 }
 private readTasks(stamp:Stamp){return this.host.api.json<TaskPage>(`/owners/${encodeURIComponent(this.ownerId)}/tasks?articleId=${encodeURIComponent(this.articleId)}&kind=plan&limit=20&offset=${this.state.offset}`,{signal:stamp.signal});}
 async loadTask(task:TaskDetail,stamp:Stamp){
  this.ownerId=task.ownerId;this.articleId=task.articleId;this.state.task=task;if(!this.allowed())return;
  this.state.reportState=['submitted','reviewing','rejected','manual_action_needed','published'].includes(task.state)?task.state:'submitted';
  await this.catalog(stamp);if(!this.host.accepts(stamp))return;
  if(task.kind==='delivery'&&this.canConnect())await this.readRow(stamp);
  if(task.distribution?.releaseId){const source=await this.host.api.json<TaskDetail>(`/owners/${encodeURIComponent(this.ownerId)}/tasks/release/${encodeURIComponent(task.distribution.releaseId)}`,{signal:stamp.signal});if(this.host.accepts(stamp))this.state.source=source;}
 }
 private async readRow(stamp:Stamp){const rows=await this.host.api.json<Delivery[]>(`/articles/${encodeURIComponent(this.articleId)}/deliveries`,{signal:stamp.signal});if(!this.host.accepts(stamp))return;this.state.deliveries=rows;this.state.row=rows.find(row=>row.id===this.state.task?.id&&row.owner_id===this.ownerId)??null;if(!this.state.approvalRef)this.state.approvalRef=this.state.row?.approval_ref??'';if(!this.state.reportUrl)this.state.reportUrl=this.state.row?.url??'';if(!this.state.observationUrl)this.state.observationUrl=this.state.row?.url??'';}
 private async inspectSource(stamp:Stamp){
  const selection=this.selection.advance(),form=this.state.form,copy=this.state.deliveries.find(copy=>copy.id===form.copyId);
  const releaseId=form.action==='remove'?copy?.release_id:this.state.summary?.live?.releaseId;this.state.source=null;this.state.selectedCopy=null;if(!releaseId)return;
  const signal=AbortSignal.any([stamp.signal,selection.signal]);
  const [task,selectedCopy]=await Promise.all([this.host.api.json<TaskDetail>(`/owners/${encodeURIComponent(this.ownerId)}/tasks/release/${encodeURIComponent(releaseId)}`,{signal}),copy&&form.action!=='create'?this.host.api.json<TaskDetail>(`/owners/${encodeURIComponent(this.ownerId)}/tasks/delivery/${encodeURIComponent(copy.id)}`,{signal}):Promise.resolve(null)]);
  if(!this.host.accepts(stamp)||!this.selection.accepts(selection))return;if(task.ownerId!==this.ownerId||task.articleId!==this.articleId||task.kind!=='release'||selectedCopy&&(selectedCopy.ownerId!==this.ownerId||selectedCopy.articleId!==this.articleId||selectedCopy.id!==copy?.id))throw new ApiError(502,'SOURCE_CONTEXT','Frozen source/copy mismatch');this.state.source=task;this.state.selectedCopy=selectedCopy;
 }
 change(input:HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement):boolean{
  if(input.id==='distribution-excerpt'||input.id==='distribution-not-before')return this.input(input as HTMLInputElement|HTMLTextAreaElement);
  const form=this.state.form;const mapping:Record<string,keyof DistributionForm>={'distribution-target':'target','distribution-connection':'connectionId','distribution-action':'action','distribution-copy':'copyId','distribution-format':'format','distribution-excerpt':'excerpt','distribution-not-before':'notBeforeAt'};
  if(input.id==='distribution-rights'){form.rights=(input as HTMLInputElement).checked;this.host.render();return true;}
  if(mapping[input.id]){(form as unknown as Record<string,string>)[mapping[input.id]]=input.value;form.rights=false;this.state.unknown=false;
   if(input.id==='distribution-target'){form.connectionId='';form.copyId='';}
   if(input.id==='distribution-action'){form.copyId='';if(form.action!=='create'){form.target='';form.connectionId='';}}
   if(input.id==='distribution-copy'){const copy=this.state.deliveries.find(row=>row.id===form.copyId);form.target=copy?.target??'';form.connectionId=copy?.connection_id??'';}
   if(['distribution-copy','distribution-action'].includes(input.id)){const stamp=this.host.stamp();this.state.busy=true;this.host.render();void this.inspectSource(stamp).catch(error=>this.host.fail(error,stamp)).finally(()=>{if(this.host.accepts(stamp)){this.state.busy=false;this.host.render();}});}else this.host.render();return true;
  }
  const fields:Record<string,'approvalRef'|'reportState'|'reportUrl'|'reportNote'|'note'|'observationUrl'>={'approval-reference':'approvalRef','delivery-report-state':'reportState','delivery-report-url':'reportUrl','delivery-report-note':'reportNote','delivery-note':'note','delivery-observation-url':'observationUrl'};
  if(fields[input.id]){this.state[fields[input.id]]=input.value;if(input.id==='approval-reference'){this.state.approvalRights=false;const checkbox=document.getElementById('approval-rights') as HTMLInputElement|null;if(checkbox)checkbox.checked=false;const confirm=document.querySelector<HTMLButtonElement>('[data-action="delivery-authorize"]');if(confirm)confirm.disabled=true;}if(input.id==='delivery-report-state')this.host.render();return true;}
  if(input.id==='approval-rights'){this.state.approvalRights=(input as HTMLInputElement).checked;this.host.render();return true;}
  if(input.id==='plan-rights'){this.state.planRights=(input as HTMLInputElement).checked;this.host.render();return true;}return false;
 }
 input(input:HTMLInputElement|HTMLTextAreaElement):boolean{if(input.id==='distribution-excerpt'||input.id==='distribution-not-before'){this.state.form[input.id==='distribution-excerpt'?'excerpt':'notBeforeAt']=input.value;this.state.form.rights=false;const checkbox=document.getElementById('distribution-rights') as HTMLInputElement|null;if(checkbox)checkbox.checked=false;for(const button of document.querySelectorAll<HTMLButtonElement>('[data-action="dist-confirm"],[data-action="dist-plan"]'))button.disabled=true;return true;}return ['approval-reference','delivery-report-url','delivery-report-note','delivery-note','delivery-observation-url'].includes(input.id)?this.change(input):false;}
 private async readBack(stamp:Stamp){const task=await this.host.refreshTask(stamp);if(!this.host.accepts(stamp)||!task)return;this.state.task=task;if(task.kind==='delivery'&&this.canConnect())await this.readRow(stamp);if(task.distribution?.releaseId){const source=await this.host.api.json<TaskDetail>(`/owners/${encodeURIComponent(this.ownerId)}/tasks/release/${encodeURIComponent(task.distribution.releaseId)}`,{signal:stamp.signal});if(this.host.accepts(stamp))this.state.source=source;}}
 async action(action:string){
  if(!/^(dist-|delivery-|plan-)/.test(action))return false;if(!this.allowed()||this.state.busy||!this.host.api.csrf)return true;
  const stamp=this.host.stamp(),w=workflowText(this.host.locale()),task=this.state.task;this.state.busy=true;this.host.pausePolling();this.host.render();
  try{
   if(action==='dist-next'||action==='dist-previous'){this.state.offset=Math.max(0,this.state.offset+(action==='dist-next'?20:-20));const tasks=await this.readTasks(stamp);if(this.host.accepts(stamp))this.state.tasks=tasks;return true;}
   if(action==='dist-confirm'||action==='dist-plan'){
    const source=this.state.source;if(!source?.snapshot||!this.canConnect()||source.language!=='en'||(this.state.form.action!=='remove'&&source.state!=='published'))throw new Error(w('validation'));
    if(this.state.form.action!=='create'&&!copyAccountMatches(this.state.selectedCopy?.distribution?.accountId,this.state.connections.find(connection=>connection.id===this.state.form.connectionId)?.accountId))throw new ApiError(409,'CONNECTION_CHANGED',w('inactive'));
    const body=distributionBody(this.ownerId,this.state.form);if(!window.confirm(w('actionConfirm')))return true;
    if(action==='dist-plan'){const at=Date.parse(this.state.form.notBeforeAt);if(!Number.isFinite(at)||at<=Date.now())throw new Error(w('notBefore'));body.notBeforeAt=new Date(at).toISOString();}
    const key=(action==='dist-plan'?this.planIntent:this.intent).keyFor({releaseId:source.id,...body});
    const result=await this.host.api.json<{id:string}>(`/releases/${encodeURIComponent(source.id)}/${action==='dist-plan'?'distribution-plans':'deliveries'}`,{method:'POST',data:{...body,idempotencyKey:key},signal:stamp.signal});if(!this.host.accepts(stamp))return true;if(!result.id)throw new ApiError(502,'DELIVERY_CONTEXT','Confirmation identity unavailable');this.host.navigate(`#/task/${action==='dist-plan'?'plan':'delivery'}/${encodeURIComponent(result.id)}`);return true;
   }
   if(!task)return true;
   if(action==='plan-confirm'){
    const fresh=await this.host.api.json<TaskDetail>(`/owners/${encodeURIComponent(this.ownerId)}/tasks/plan/${encodeURIComponent(task.id)}`,{signal:stamp.signal});if(!this.host.accepts(stamp))return true;this.state.task=fresh;
    const body=planConfirmation(fresh,this.state.planRights);if(!this.canConnect()||!window.confirm(w('actionConfirm')))return true;
    const result=await this.host.api.json<{id:string}>(`/releases/${encodeURIComponent(fresh.plan!.releaseId)}/deliveries`,{method:'POST',data:{...body,idempotencyKey:this.intent.keyFor({releaseId:fresh.plan!.releaseId,...body})},signal:stamp.signal});if(!this.host.accepts(stamp))return true;if(!result.id)throw new ApiError(502,'DELIVERY_CONTEXT','Confirmation identity unavailable');this.host.navigate(`#/task/delivery/${encodeURIComponent(result.id)}`);return true;
   }
   if(action==='plan-cancel'){if(!task.allowedActions.includes('cancel')||!window.confirm(w('cancelConfirm')))return true;await this.host.api.json(`/distribution-plans/${encodeURIComponent(task.id)}/cancel`,{method:'POST',data:{},signal:stamp.signal});if(this.host.accepts(stamp))await this.readBack(stamp);return true;}
   if(task.kind!=='delivery')return true;const path=`/deliveries/${encodeURIComponent(task.id)}`;
   if(action==='delivery-package'){const data=await this.host.api.json<ManualPackage>(path+'/package',{signal:stamp.signal});if(this.host.accepts(stamp))this.state.package=data;return true;}
   if(action.startsWith('delivery-download-')||action.startsWith('delivery-copy-')){if(!this.state.package)return true;const html=action.endsWith('html'),content=html?this.state.package.html:this.state.package.markdown;if(action.startsWith('delivery-copy-')){await navigator.clipboard.writeText(content);if(this.host.accepts(stamp))this.host.notice(w('copied'));}else {const link=document.createElement('a');link.href=`data:${html?'text/html':'text/markdown'};base64,`+base64(new TextEncoder().encode(content));link.download=html?'submission.html':'submission.md';link.click();}return true;}
   if(action==='delivery-request-approval'){
    if(this.state.approvalUnknown||!this.canConnect()||!task.allowedActions.includes('request-approval'))return true;
    const result=await this.host.api.json<{reference:string}>(path+'/request-approval',{method:'POST',data:{},signal:stamp.signal});if(!this.host.accepts(stamp))return true;this.state.approvalRef=result.reference;await this.readBack(stamp);return true;
   }
   if(action==='delivery-authorize'){if(!this.canConnect()||!this.state.approvalRights||!this.state.approvalRef||!task.allowedActions.includes('authorize')||!window.confirm(w('attachConfirm')))return true;await this.host.api.json(path+'/authorize',{method:'POST',data:{approvalRef:this.state.approvalRef},signal:stamp.signal});}
   else if(action==='delivery-cancel'||action==='delivery-reconcile'){const command=action.slice('delivery-'.length);if(!task.allowedActions.includes(command)||command==='cancel'&&!window.confirm(w('cancelConfirm')))return true;await this.host.api.json(path+'/'+command,{method:'POST',data:{},signal:stamp.signal});}
   else if(action==='delivery-report'){if(!window.confirm(w('reportConfirm')))return true;await this.host.api.json(path+'/report',{method:'POST',data:{state:this.state.reportState,url:this.state.row?.url??task.copy?.url??(this.state.reportUrl||null),note:this.state.reportNote},signal:stamp.signal});if(this.host.accepts(stamp))this.state.reportNote='';}
   else if(action==='delivery-note'){if(!this.state.note.trim())throw new Error(w('note'));await this.host.api.json(path+'/notes',{method:'POST',data:{note:this.state.note},signal:stamp.signal});if(this.host.accepts(stamp))this.state.note='';}
   else if(action==='delivery-observe'){await this.host.api.json(path+'/verify-observation',{method:'POST',data:{url:this.state.row?.url??task.copy?.url??this.state.observationUrl},signal:stamp.signal});}
   if(this.host.accepts(stamp)){await this.readBack(stamp);if(this.host.accepts(stamp))this.host.notice(w('readback'));}
  }catch(error){if(this.host.accepts(stamp)){if(!(error instanceof ApiError)||error.status>=500){if(action==='delivery-request-approval')this.state.approvalUnknown=true;else if(['dist-confirm','dist-plan','plan-confirm'].includes(action))this.state.unknown=true;}await this.host.fail(error,stamp);}}
  finally{if(this.host.accepts(stamp)){this.state.busy=false;this.host.render();this.host.resumePolling();}}return true;
 }
 manual(){const task=this.state.task,row=this.state.row;return Boolean(task&&manualFollowup(this.state.targets.find(target=>target.name===(task.distribution?.target??task.copy?.target)),row?.action??task.action,task.history));}
}
