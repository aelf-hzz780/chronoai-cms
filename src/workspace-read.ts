import {AppError, requireValue, text} from './errors.ts';
import {Policy, type Actor} from './policy.ts';
import type {Row} from './store.ts';

export type WorkspaceRole='owner'|'admin'|'publisher'|'member';
export interface WorkspaceAccess {owner:Row;role:WorkspaceRole;publishingRole:boolean;}

/** Read requests resolve current membership once, then reuse that decision. */
export class WorkspaceReadService {
  policy:Policy;
  constructor(policy:Policy){this.policy=policy;}
  async role(actor:Actor,owner:Row,roles?:Map<string,'admin'|'member'>):Promise<WorkspaceAccess|null>{
    if(owner.kind==='personal')return owner.subject===actor.subject?{owner,role:'owner',publishingRole:true}:null;
    const membership=roles?roles.get(owner.subject):await this.policy.membership(actor,owner);
    if(membership!=='admin'&&membership!=='member')return null;
    const role:WorkspaceRole=membership==='admin'?'admin':this.policy.store.get('SELECT 1 FROM publishers WHERE owner_id=? AND subject=?',owner.id,actor.subject)?'publisher':'member';
    return {owner,role,publishingRole:role==='admin'||role==='publisher'};
  }
  async authorize(actor:Actor,ownerId:string):Promise<WorkspaceAccess>{
    text(ownerId,'ownerId');await this.policy.scope(actor,'content:read');
    const owner=this.policy.store.get('SELECT * FROM owners WHERE id=?',ownerId);
    requireValue(owner&&owner.issuer===actor.issuer,403,'FORBIDDEN','Workspace access denied');
    const access=await this.role(actor,owner);
    requireValue(access,403,'FORBIDDEN','Active workspace ownership or organization membership required');return access;
  }
  capabilities(actor:Actor,access:WorkspaceAccess){
    const canPublish=access.publishingRole&&actor.scopes.includes('publish');
    return {canWrite:actor.scopes.includes('content:write'),canPublish,canManagePublishers:access.owner.kind==='organization'&&access.role==='admin'&&actor.scopes.includes('roles:write'),canReadConnections:canPublish&&actor.scopes.includes('connections:read'),canReadMetrics:actor.scopes.includes('metrics:read')};
  }
  async directory(actor:Actor){
    await this.policy.scope(actor,'content:read');
    const workspaces=[];let unavailable=false;
    const owners=this.policy.store.all('SELECT o.*,p.display_name FROM owners o LEFT JOIN owner_profiles p ON p.owner_id=o.id WHERE o.issuer=? AND (o.kind=? OR o.subject=?) ORDER BY o.kind DESC,o.id LIMIT 1000',actor.issuer,'organization',actor.subject);
    let roles:Map<string,'admin'|'member'>|undefined;
    if(this.policy.authority.organizationRoles&&owners.some(owner=>owner.kind==='organization')){
      try{roles=await this.policy.authority.organizationRoles(actor);}
      catch{unavailable=true;roles=new Map();}
    }
    for(const owner of owners){
      let access:WorkspaceAccess|null;
      try{access=await this.role(actor,owner,roles);}
      catch(error){if(error instanceof AppError&&error.code==='MEMBERSHIP_UNAVAILABLE'){unavailable=true;continue;}throw error;}
      if(!access)continue;
      const capabilities=this.capabilities(actor,access);
      workspaces.push({id:owner.id,kind:owner.kind,name:owner.display_name??owner.subject,canPublish:capabilities.canPublish,role:access.role,capabilities});
    }
    return {subject:actor.subject,workspaces,organizationDirectory:unavailable?{status:'unavailable' as const,code:'MEMBERSHIP_UNAVAILABLE'}:{status:'available' as const}};
  }
  async sites(actor:Actor,ownerId:string){
    await this.authorize(actor,ownerId);
    const configured=new Map(this.policy.store.all('SELECT language,url FROM sites WHERE owner_id=?',ownerId).map(site=>[site.language,site.url as string]));
    return {ownerId,sites:(['en','zh'] as const).map(language=>({language,configured:configured.has(language),publicUrl:configured.get(language)??null,verification:{status:'unknown' as const,checkedAt:null},blockers:configured.has(language)?[]:['SITE_REQUIRED']}))};
  }
  async members(actor:Actor,ownerId:string){
    const access=await this.authorize(actor,ownerId);
    requireValue(this.capabilities(actor,access).canManagePublishers,403,'FORBIDDEN','Current organization Admin and roles:write required');
    try{
      const members=await this.policy.members(actor,access.owner),publishers=new Set(this.policy.store.all('SELECT subject FROM publishers WHERE owner_id=?',ownerId).map(row=>row.subject));
      return {ownerId,status:'available' as const,members:members.map(member=>({...member,publisher:member.active&&member.role!=='viewer'&&publishers.has(member.identity),publisherAssigned:publishers.has(member.identity)}))};
    }catch(error){if(error instanceof AppError&&error.code==='DIRECTORY_UNAVAILABLE')return {ownerId,status:'unavailable' as const,members:[],code:'DIRECTORY_UNAVAILABLE'};throw error;}
  }
}
