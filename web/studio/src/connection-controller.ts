import {ApiError} from './transport.js';
import {OperationIntent} from './publication-model.js';
import {workflowText} from './workflow-i18n.js';
import {connectionsView} from './connection-view.js';
import type {Stamp} from './state.js';
import type {ConnectionAttempt,CreatedAttempt,Destination,OwnerConnection,WorkflowHost} from './workflow-types.js';
export interface ConnectionState {targets:Destination[];connections:OwnerConnection[];errors:string[];target:string;connectionId:string;attempt:ConnectionAttempt|null;connectUrl:string|null;managementUrl:string|null;ack:boolean;busy:boolean;returnError:boolean;unknownOutcome:boolean}
export class ConnectionController {
 host:WorkflowHost;state:ConnectionState;private intent=new OperationIntent();private ownerId='';
 private saved:{subject:string;ownerId:string;target:string;connectionId:string;idempotencyKey:string}|null=null;
 private storageKey='chrono.studio.connection-intent';
 constructor(host:WorkflowHost){this.host=host;this.state=this.empty();}
 private empty():ConnectionState{return {targets:[],connections:[],errors:[],target:'',connectionId:'',attempt:null,connectUrl:null,managementUrl:null,ack:false,busy:false,returnError:false,unknownOutcome:false};}
 reset(){this.state=this.empty();this.intent=new OperationIntent();this.ownerId='';this.saved=null;}
 allowed(){const owner=this.host.owner();return Boolean(owner&&owner.id===this.ownerId&&owner.capabilities.canPublish&&owner.capabilities.canReadConnections);}
 view(){return connectionsView(this.state,this.host.owner()!,this.host.locale(),this.allowed());}
 async load(stamp:Stamp,query:URLSearchParams){
  const owner=this.host.owner();if(!owner)return;this.ownerId=owner.id;
  if(!this.allowed())return;
  this.state.returnError=['CONNECT_RETURN_INVALID','SIGN_IN_REQUIRED','FORBIDDEN'].includes(query.get('returnError')??'');
  const results=await Promise.allSettled([this.host.api.json<Destination[]>('/targets',{signal:stamp.signal}),this.host.api.json<OwnerConnection[]>(`/owners/${encodeURIComponent(owner.id)}/connections`,{signal:stamp.signal})]);if(!this.host.accepts(stamp))return;
  for(const [index,result] of results.entries())if(result.status==='fulfilled'){if(index===0)this.state.targets=result.value as Destination[];else this.state.connections=result.value as OwnerConnection[];}else {if(result.reason instanceof ApiError&&[401,403].includes(result.reason.status))throw result.reason;this.state.errors.push(this.errorText(result.reason));}
  const attempt=query.get('attemptId');if(attempt)await this.read(attempt,stamp);
  else try{const saved=JSON.parse(sessionStorage.getItem(this.storageKey)??'null');if(saved&&saved.subject===this.host.subject()&&saved.ownerId===this.ownerId&&['target','connectionId','idempotencyKey'].every(key=>typeof saved[key]==='string'&&saved[key].length<=500)&&saved.idempotencyKey){this.saved=saved;this.state.target=saved.target;this.state.connectionId=saved.connectionId;this.state.unknownOutcome=true;}}catch{/* Invalid local metadata is never authority to execute or restore a connection. */}
 }
 private errorText(error:unknown){return error instanceof ApiError?`${error.code} · ${error.message}${error.traceId?' · Trace ID '+error.traceId:''}`:error instanceof Error?error.message:'Request failed';}
 private async read(id:string,stamp:Stamp){const result=await this.host.api.json<ConnectionAttempt>(`/owners/${encodeURIComponent(this.ownerId)}/connection-attempts/${encodeURIComponent(id)}`,{signal:stamp.signal});if(!this.host.accepts(stamp))return;if(result.ownerId!==this.ownerId||result.id!==id)throw new ApiError(502,'CONNECTION_CONTEXT','Connection attempt context mismatch');this.state.attempt=result;this.state.target=result.target;if(result.connectionId)this.state.connectionId=result.connectionId;if(result.status!=='pending')this.state.connectUrl=null;if(result.flow!=='operator'||result.status!=='binding_required')this.state.managementUrl=null;}
 change(input:HTMLInputElement|HTMLSelectElement){
  if(input.id==='connections-target'){this.state.target=input.value;this.state.connectionId='';this.state.attempt=null;this.state.connectUrl=null;this.state.managementUrl=null;this.state.ack=false;this.state.unknownOutcome=false;this.host.remember('#/connections');this.host.render();return true;}
  if(input.id==='connections-connection'){this.state.connectionId=input.value;this.host.render();return true;}
  if(input.id==='connections-ack'){this.state.ack=(input as HTMLInputElement).checked;this.host.render();return true;}return false;
 }
 async action(action:string){
  if(!action.startsWith('connection-'))return false;if(!this.allowed()||this.state.busy)return true;const stamp=this.host.stamp(),w=workflowText(this.host.locale());
  const attempt=this.state.attempt;if(action==='connection-new'){if((attempt?.code==='CONNECT_RESULT_UNKNOWN'||this.state.unknownOutcome)&&!this.state.ack)return true;this.intent=new OperationIntent();this.saved=null;}
  this.state.busy=true;this.host.render();try{
   if(action==='connection-create'||action==='connection-new'){
    if(!this.state.target)throw new Error(w('validation'));
    const body={target:this.state.target,...(this.state.connectionId?{connectionId:this.state.connectionId}:{}),...(this.state.ack?{acknowledgeUnknownResult:true}:{})};
    const matches=this.saved&&this.saved.subject===this.host.subject()&&this.saved.ownerId===this.ownerId&&this.saved.target===this.state.target&&this.saved.connectionId===this.state.connectionId;
    const key=matches?this.saved!.idempotencyKey:this.intent.keyFor({subject:this.host.subject(),ownerId:this.ownerId,target:this.state.target,connectionId:this.state.connectionId});
    this.saved={subject:this.host.subject(),ownerId:this.ownerId,target:this.state.target,connectionId:this.state.connectionId,idempotencyKey:key};sessionStorage.setItem(this.storageKey,JSON.stringify(this.saved));
    const result=await this.host.api.json<CreatedAttempt>(`/owners/${encodeURIComponent(this.ownerId)}/connection-attempts`,{method:'POST',data:{...body,idempotencyKey:key},signal:stamp.signal});if(!this.host.accepts(stamp))return true;
    if(typeof result.id!=='string'||!result.id||result.id.length>500||result.ownerId!==this.ownerId||result.target!==this.state.target)throw new ApiError(502,'CONNECTION_CONTEXT','Connection attempt context mismatch');
    this.state.attempt=result;this.state.unknownOutcome=false;this.state.connectUrl=result.flow==='hosted'&&result.status==='pending'?result.connectUrl:null;this.state.managementUrl=result.flow==='operator'?result.managementUrl:null;
    this.host.remember(`#/connections?${new URLSearchParams({ownerId:this.ownerId,attemptId:result.id})}`);sessionStorage.removeItem(this.storageKey);this.saved=null;await this.read(result.id,stamp);
   }else if(attempt){
    if(action==='connection-cancel'&&!window.confirm(w('cancelConfirm')))return true;
    const path=`/owners/${encodeURIComponent(this.ownerId)}/connection-attempts/${encodeURIComponent(attempt.id)}`;
    if(action==='connection-recheck')await this.host.api.json(path+'/recheck',{method:'POST',data:this.state.connectionId?{connectionId:this.state.connectionId}:{},signal:stamp.signal});
    else if(action==='connection-cancel')await this.host.api.json(path+'/cancel',{method:'POST',data:{},signal:stamp.signal});
    if(!this.host.accepts(stamp))return true;await this.read(attempt.id,stamp);
    const connections=await this.host.api.json<OwnerConnection[]>(`/owners/${encodeURIComponent(this.ownerId)}/connections`,{signal:stamp.signal});if(this.host.accepts(stamp))this.state.connections=connections;
   }
  }catch(error){if(this.host.accepts(stamp)){if((action==='connection-create'||action==='connection-new')&&(!(error instanceof ApiError)||error.status>=500))this.state.unknownOutcome=true;if(error instanceof ApiError&&[401,403].includes(error.status)){this.state.connectUrl=null;this.state.managementUrl=null;}await this.host.fail(error,stamp);}}
  finally{if(this.host.accepts(stamp)){this.state.busy=false;this.host.render();}}return true;
 }
}
