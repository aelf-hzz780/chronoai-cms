import type {TaskKind} from './types.js';
export const taskKinds:TaskKind[]=['release','delivery','media','projection','plan'];
export function isTaskKind(value:string):value is TaskKind{return taskKinds.includes(value as TaskKind);}
export function taskAssetBase(task:{ownerId:string;kind:TaskKind;id:string}):string{return `/api/cms/owners/${encodeURIComponent(task.ownerId)}/tasks/${task.kind}/${encodeURIComponent(task.id)}/assets/`;}
export function isTaskActive(task:{kind:TaskKind;state:string}):boolean {
 if(task.kind==='plan')return task.state==='scheduled';
 if(task.kind==='projection')return ['queued','running','retry_wait'].includes(task.state);
 if(task.kind==='media')return ['queued','running'].includes(task.state);
 if(task.kind==='delivery')return ['awaiting_external','queued','sending','uncertain'].includes(task.state);
 return task.kind==='release'&&['queued','publishing','verifying','uncertain'].includes(task.state);
}
