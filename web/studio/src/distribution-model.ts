import type {DistributionForm,Destination} from './workflow-types.js';
export function connectionReturnOwner<T extends {id:string;capabilities:{canPublish:boolean;canReadConnections:boolean}}>(workspaces:T[],id:string):T|null{return workspaces.find(owner=>owner.id===id&&owner.capabilities.canPublish&&owner.capabilities.canReadConnections)??null;}
export function copyAccountMatches(frozen:string|null|undefined,current:string|null|undefined):boolean{return Boolean(frozen&&(!current||frozen===current));}
export function distributionBody(ownerId:string,form:DistributionForm):Record<string,unknown>{
 if(!form.rights)throw new Error('Confirm exact text/image rights');if(!form.target||!form.connectionId)throw new Error('Select an explicit destination and connection');
 if(form.action!=='create'&&!form.copyId)throw new Error('Select the exact existing copy');if(form.format==='excerpt'&&!form.excerpt.trim())throw new Error('An excerpt is required');
 return {ownerId,target:form.target,connectionId:form.connectionId,action:form.action,format:form.format,...(form.format==='excerpt'?{excerpt:form.excerpt}:{}),...(form.action!=='create'?{copyId:form.copyId}:{}),rightsConfirmed:true};
}
export function manualFollowup(target:Pick<Destination,'automatic'|'automaticActions'>|undefined,action:string,history:Array<{state:string}>):boolean{return Boolean(target&&(!target.automatic||!target.automaticActions.includes(action))||history.some(event=>event.state==='manual_action_needed'));}
interface FrozenPlan {id:string;ownerId:string;state:string;allowedActions:string[];snapshot:null|{markdown:string};plan?:{releaseId:string;target:string;connectionId:string|null;action:string;format:string;copyId:string|null}}
export function planConfirmation(task:FrozenPlan,rights:boolean):Record<string,unknown>{
 if(task.state!=='due'||!task.allowedActions.includes('confirm'))throw new Error('Plan is not due for confirmation');if(!task.snapshot||!task.plan?.connectionId)throw new Error('Exact plan snapshot and connection are required');if(!rights)throw new Error('Confirm rights again');
 return {ownerId:task.ownerId,target:task.plan.target,connectionId:task.plan.connectionId,action:task.plan.action,format:task.plan.format,...(task.plan.format==='excerpt'?{excerpt:task.snapshot.markdown}:{}),...(task.plan.copyId?{copyId:task.plan.copyId}:{}),planId:task.id,rightsConfirmed:true};
}
