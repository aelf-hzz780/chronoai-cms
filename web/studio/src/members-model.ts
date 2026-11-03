import type {Member} from './types.js';
export function canGrantPublisher(member:Member,canManage:boolean):boolean{return canManage&&member.active&&member.role!=='viewer'&&!member.publisherAssigned;}
export function canRevokePublisher(member:Member,canManage:boolean):boolean{return canManage&&member.publisherAssigned;}
