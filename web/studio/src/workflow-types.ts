import type {Language,TaskDetail} from './types.js';
import type {Transport} from './transport.js';
import type {Stamp} from './state.js';
import type {Workspace} from './types.js';
export interface WorkflowHost {confirm:(message:string,stamp:Stamp)=>Promise<boolean>;api:Transport;owner:()=>Workspace|null;subject:()=>string;locale:()=>Language;stamp:()=>Stamp;accepts:(stamp:Stamp)=>boolean;render:()=>void;fail:(error:unknown,stamp:Stamp)=>Promise<void>;navigate:(hash:string)=>void;remember:(hash:string)=>void;notice:(text:string,kind?:'info'|'error')=>void;pausePolling:()=>void;resumePolling:()=>void;refreshTask:(stamp:Stamp)=>Promise<TaskDetail|null>}
export interface Destination {name:string;automatic:boolean;automaticActions:string[]}
export interface OwnerConnection {id:string;target:string;label:string;accountId:string;active:boolean;reason?:string}
export interface ConnectionAttempt {id:string;ownerId:string;target:string;flow:'hosted'|'operator';status:'pending'|'connected'|'binding_required'|'cancelled'|'expired'|'failed';connectionId:string|null;code:string|null;createdAt:string;updatedAt:string;expiresAt:string}
export interface CreatedAttempt extends ConnectionAttempt {connectUrl:string|null;managementUrl:string|null}
export interface Delivery {id:string;release_id:string;owner_id:string;connection_id:string;target:string;action:'create'|'update'|'remove';format:'full'|'excerpt';digest:string;state:string;remote_id:string|null;url:string|null;approval_ref:string|null;trace_id:string;error_code?:string|null;history:Array<{state:string;code:string|null;trace_id:string;created_at:string}>}
export interface DistributionForm {target:string;connectionId:string;action:'create'|'update'|'remove';format:'full'|'excerpt';excerpt:string;copyId:string;rights:boolean;notBeforeAt:string}
export interface ManualPackage {title:string;markdown:string;html:string;sourceUrl:string;creditedAuthor:string;state:string;knownCopyUrl:string|null;instructions:string;accountConnectionId:string}
export interface DeliveryNote {id:string;note:string;actor:string;traceId:string;createdAt:string}
export interface DeliveryObservation {id:string;url:string;status:'verified';proof:string;sourceState:string;followUpRequired:boolean;actor:string;traceId:string;observedAt:string}
export interface FrozenDistribution {releaseId:string;target:string;connectionId:string|null;accountId:string|null;format:'full'|'excerpt';sourceUrl:string|null;sourceDigest:string}
export interface PlanMetadata {notBeforeAt:string;releaseId:string;target:string;connectionId:string|null;action:string;format:'full'|'excerpt';copyId:string|null;consumedDeliveryId:string|null}
export type WorkflowTask=TaskDetail;
