import {randomBytes,randomUUID} from 'node:crypto';
import type {Config,ConnectionTargetSetup} from './config.ts';
import {safeUrl} from './config.ts';
import type {Actor} from './policy.ts';
import type {Row} from './store.ts';
import {Vault} from './vault.ts';
import {AppError,requireValue,text} from './errors.ts';
import {digest} from './content.ts';
import {assertCommandRequest} from './command-authority.ts';
import {WorkspaceReadService,type WorkspaceAccess} from './workspace-read.ts';
import {Queue} from './queue.ts';

export interface ConnectionSetupAuthority {
  call(actor:Actor,path:string,method?:string,body?:unknown):Promise<any>;
  bindings():Promise<any[]>;
  connection(actor:Actor,owner:{kind:string;issuer:string;subject:string},connectionId:string,target:string):Promise<any>;
}
interface ReturnBinding {issuer:string;subject:string;ownerId:string;attemptId:string;upstreamId:string;nonce:string;expiresAt:number;}
const callerAuthorizationError=(error:unknown)=>error instanceof AppError&&(error.status===401||error.status===403&&error.code!=='CONNECTION_MISMATCH');
export class ConnectionAttemptService {
  workspaces:WorkspaceReadService;authority:ConnectionSetupAuthority;vault:Vault;config:Pick<Config,'publicUrl'|'allowLoopback'|'connectionSetup'>;
  constructor(workspaces:WorkspaceReadService,authority:ConnectionSetupAuthority,vault:Vault,config:Pick<Config,'publicUrl'|'allowLoopback'|'connectionSetup'>){this.workspaces=workspaces;this.authority=authority;this.vault=vault;this.config=config;}
  private get store(){return this.workspaces.policy.store;}
  private async access(actor:Actor,ownerId:string){
    const access=await this.workspaces.authorize(actor,ownerId),capabilities=this.workspaces.capabilities(actor,access);
    requireValue(capabilities.canPublish&&capabilities.canReadConnections,403,'FORBIDDEN','Current publishing authority and connections:read required');return access;
  }
  private setup(target:string){
    const setup=this.config.connectionSetup;
    requireValue(setup&&Object.hasOwn(setup.targets,target)&&setup.targets[target].enabled,503,'CONNECTION_SETUP_UNAVAILABLE','Connection setup is not configured for this target');
    const management=safeUrl(setup.managementUrl,this.config.allowLoopback),options=setup.targets[target];
    return {setup,options,management,digest:digest(JSON.stringify({managementUrl:management.href,ttlSeconds:setup.ttlSeconds,options}))};
  }
  private metadata(row:Row){return {id:row.id,ownerId:row.owner_id,target:row.target,flow:row.flow,status:row.status,connectionId:row.connection_id??null,code:row.code??null,createdAt:row.created_at,updatedAt:row.updated_at,expiresAt:row.expires_at};}
  private row(id:string){const row=this.store.get('SELECT * FROM connection_attempts WHERE id=?',id);requireValue(row,404,'NOT_FOUND','Connection attempt not found');return row;}
  private save(row:Row,status:string,code:string|null,connectionId:string|null=row.connection_id??null){
    this.store.run('UPDATE connection_attempts SET status=?,code=?,connection_id=?,updated_at=? WHERE id=?',status,code,connectionId,new Date().toISOString(),row.id);return this.row(row.id);
  }
  private async context(actor:Actor,ownerId:string,id:string){
    const access=await this.access(actor,ownerId);text(id,'attemptId');const row=this.row(id);
    requireValue(row.owner_id===ownerId&&row.issuer===actor.issuer&&row.subject===actor.subject,403,'FORBIDDEN','Connection attempt belongs to another actor or workspace');return {access,row};
  }
  private unknown(row:Row){
    this.store.run("UPDATE connection_attempts SET phase='unknown',status='failed',code='CONNECT_RESULT_UNKNOWN',connect_url_cipher=NULL,updated_at=? WHERE id=?",new Date().toISOString(),row.id);return this.row(row.id);
  }
  private validConfiguration(row:Row){
    try{return this.setup(row.target).digest===row.config_digest;}
    catch{return false;}
  }
  private expired(row:Row){return Date.parse(row.expires_at)<=Date.now()&&!['connected','cancelled'].includes(row.status);}
  private returnCookie(actor:Actor,row:Row){
    const nonce=randomBytes(32).toString('base64url');this.store.run('UPDATE connection_attempts SET nonce_hash=?,return_consumed_at=NULL WHERE id=?',digest(nonce),row.id);
    return this.vault.seal({issuer:actor.issuer,subject:actor.subject,ownerId:row.owner_id,attemptId:row.id,upstreamId:row.upstream_id,nonce,expiresAt:Date.parse(row.expires_at)} satisfies ReturnBinding);
  }
  private createResult(actor:Actor,row:Row){
    let connectUrl:string|null=null,managementUrl:string|null=null,returnCookie:string|null=null;
    if(this.expired(row))row=this.save(row,'expired','CONNECTION_ATTEMPT_EXPIRED');
    if(row.status==='pending'&&row.phase==='known'&&row.connect_url_cipher&&this.validConfiguration(row)){
      connectUrl=this.vault.open<{url:string}>(row.connect_url_cipher).url;returnCookie=this.returnCookie(actor,row);
    }
    if(row.flow==='operator'&&row.status==='binding_required'&&this.validConfiguration(row))managementUrl=this.setup(row.target).management.href;
    return {attempt:{...this.metadata(row),connectUrl,managementUrl},returnCookie};
  }
  async create(actor:Actor,ownerId:string,input:Record<string,unknown>,trace:string){
    assertCommandRequest(actor,'POST',`/api/service/owners/${ownerId}/connection-attempts`);
    const access=await this.access(actor,ownerId),target=text(input.target,'target',50),key=text(input.idempotencyKey,'idempotencyKey',200),requested=input.connectionId===undefined?null:text(input.connectionId,'connectionId');
    requireValue(Object.keys(input).every(key=>['target','idempotencyKey','connectionId','acknowledgeUnknownResult'].includes(key))&&(input.acknowledgeUnknownResult===undefined||typeof input.acknowledgeUnknownResult==='boolean'),400,'INVALID_INPUT','Invalid connection attempt input');
    const config=this.setup(target),fingerprint=digest(JSON.stringify({ownerId,target,connectionId:requested,config:config.digest})),actorKey=`${actor.issuer}|${actor.subject}`;
    const previous=this.store.get("SELECT * FROM idempotency WHERE actor=? AND operation='connection-attempt' AND key=?",actorKey,key);
    if(previous){requireValue(previous.digest===fingerprint,409,'CONFLICT','Idempotency key already used for another connection intent');let row=this.row(previous.resource_id);if(row.phase==='create_dispatched')row=this.unknown(row);else if(row.phase==='known')row=await this.refresh(actor,access,row);return this.createResult(actor,row);}
    const unknown=this.store.get("SELECT 1 FROM connection_attempts WHERE owner_id=? AND issuer=? AND subject=? AND target=? AND phase IN ('create_dispatched','unknown')",ownerId,actor.issuer,actor.subject,target);
    requireValue(!unknown||input.acknowledgeUnknownResult===true,409,'CONNECT_RESULT_UNKNOWN','A prior link may still be active; explicitly acknowledge its unknown result before a new intent');
    const id=randomUUID(),now=new Date().toISOString(),flow=access.owner.kind==='personal'?'hosted':'operator',expires=new Date(Date.now()+config.setup.ttlSeconds*1000).toISOString();
    if(flow==='hosted')new Queue(this.store).assertWritable();
    this.store.transaction(()=>{
      this.store.run('INSERT INTO connection_attempts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,ownerId,actor.issuer,actor.subject,target,flow,flow==='hosted'?'pending':'binding_required',flow==='hosted'?'create_dispatched':'known',config.digest,null,null,requested,null,null,null,expires,flow==='operator'?'CONNECTION_BINDING_REQUIRED':null,now,now,trace);
      this.store.run('INSERT INTO idempotency VALUES (?,?,?,?,?)',actorKey,'connection-attempt',key,fingerprint,id);
      this.store.audit(actor.subject,ownerId,'connection-attempt.create',id,trace,{target,flow,acknowledgedUnknownResult:!!unknown});
    });
    if(flow==='hosted'){
      try{
        const result=await this.authority.call(actor,'/api/v1/connect-links','POST',this.hostedInput(config.options,config.setup.ttlSeconds));
        requireValue(result&&typeof result.id==='string'&&result.id.length>0&&result.id.length<=500&&typeof result.connect_url==='string'&&result.connect_url.length<=4096&&typeof result.expires_at==='string'&&Number.isFinite(Date.parse(result.expires_at))&&Date.parse(result.expires_at)>Date.now(),502,'NYXID_CONTRACT','Invalid connect-link response');
        const url=safeUrl(result.connect_url,this.config.allowLoopback);requireValue(url.origin===config.management.origin,502,'NYXID_CONTRACT','Untrusted hosted connection origin');
        await this.access(actor,ownerId);
        const expiry=new Date(Math.min(Date.parse(result.expires_at),Date.parse(expires))).toISOString();
        this.store.run("UPDATE connection_attempts SET phase='known',upstream_id=?,connect_url_cipher=?,expires_at=?,updated_at=? WHERE id=? AND phase='create_dispatched'",result.id,this.vault.seal({url:url.href}),expiry,new Date().toISOString(),id);
      }catch(error){this.unknown(this.row(id));if(callerAuthorizationError(error))throw error;}
    }
    return this.createResult(actor,this.row(id));
  }
  private hostedInput(options:ConnectionTargetSetup,ttl:number){return {service_slug:options.serviceSlug,scopes:options.scopes,...(options.usePlatformKey===undefined?{}:{use_platform_key:options.usePlatformKey}),...(options.endpointUrl?{endpoint_url:options.endpointUrl}:{}),callback_url:`${this.config.publicUrl}/connections/return`,expires_in:ttl};}
  private status(value:any,row:Row){
    requireValue(value&&value.id===row.upstream_id&&['pending','completed','expired','cancelled'].includes(value.status)&&value.service_slug===this.setup(row.target).options.serviceSlug&&typeof value.expires_at==='string'&&Number.isFinite(Date.parse(value.expires_at)),502,'NYXID_CONTRACT','Invalid connect-link status');
    if(value.status==='completed')requireValue(value.connected_service&&typeof value.connected_service.id==='string'&&value.connected_service.id.length>0&&typeof value.connected_service.slug==='string'&&value.connected_service.slug.length>0,502,'NYXID_CONTRACT','Completed connection identity unavailable');return value;
  }
  private async exactBinding(actor:Actor,access:WorkspaceAccess,row:Row,expected?:{id:string;slug:string}){
    const selected=row.requested_connection_id??expected?.id;
    if(!selected||expected&&selected!==expected.id)return this.save(row,'binding_required','CONNECTION_BINDING_REQUIRED',null);
    try{
      const owner={kind:access.owner.kind as string,issuer:access.owner.issuer as string,subject:access.owner.subject as string},bindings=await this.authority.bindings();
      const binding=bindings.find(binding=>binding.id===selected&&binding.target===row.target&&binding.owner?.kind===owner.kind&&binding.owner?.issuer===owner.issuer&&binding.owner?.subject===owner.subject&&(!expected||binding.slug===expected.slug));
      if(!binding)return this.save(row,'binding_required','CONNECTION_BINDING_REQUIRED',null);
      await this.authority.connection(actor,owner,selected,row.target);await this.access(actor,access.owner.id);
      return this.save(row,'connected',null,selected);
    }catch(error){if(callerAuthorizationError(error))throw error;return this.save(row,'binding_required','CONNECTION_BINDING_UNAVAILABLE',null);}
  }
  private async refresh(actor:Actor,access:WorkspaceAccess,row:Row,value?:any):Promise<Row>{
    if(!this.validConfiguration(row))return this.save(row,'failed','CONNECTION_CONFIGURATION_CHANGED',null);
    if(row.phase==='unknown')return row;if(row.phase==='create_dispatched')return this.unknown(row);
    if(['cancelled','expired'].includes(row.status))return row;
    if(this.expired(row))return this.save(row,'expired','CONNECTION_ATTEMPT_EXPIRED',null);
    if(row.flow==='operator')return this.exactBinding(actor,access,row);
    try{
      const status=this.status(value??await this.authority.call(actor,`/api/v1/connect-links/${encodeURIComponent(row.upstream_id)}`),row);
      if(status.status==='completed')return await this.exactBinding(actor,access,row,status.connected_service);
      return this.save(row,status.status,status.status==='pending'?null:status.status==='expired'?'CONNECTION_ATTEMPT_EXPIRED':'CONNECTION_ATTEMPT_CANCELLED',null);
    }catch(error){if(callerAuthorizationError(error))throw error;return this.save(row,'failed','CONNECT_STATUS_UNAVAILABLE',null);}
  }
  async get(actor:Actor,ownerId:string,id:string){const {access,row}=await this.context(actor,ownerId,id);return this.metadata(await this.refresh(actor,access,row));}
  async recheck(actor:Actor,ownerId:string,id:string,input:Record<string,unknown>,trace:string){
    assertCommandRequest(actor,'POST',`/api/service/owners/${ownerId}/connection-attempts/${id}/recheck`);const {access,row}=await this.context(actor,ownerId,id);
    requireValue(Object.keys(input).every(key=>key==='connectionId'),400,'INVALID_INPUT','Only connectionId may be rechecked');
    if(input.connectionId!==undefined){const selected=text(input.connectionId,'connectionId');requireValue(!row.requested_connection_id||row.requested_connection_id===selected,409,'CONNECTION_MISMATCH','Attempt retains its originally selected connection');this.store.run('UPDATE connection_attempts SET requested_connection_id=? WHERE id=?',selected,id);}
    const result=await this.refresh(actor,access,this.row(id));this.store.audit(actor.subject,ownerId,'connection-attempt.recheck',id,trace,{status:result.status});return this.metadata(result);
  }
  async cancel(actor:Actor,ownerId:string,id:string,trace:string){
    assertCommandRequest(actor,'POST',`/api/service/owners/${ownerId}/connection-attempts/${id}/cancel`);const {access,row}=await this.context(actor,ownerId,id);
    if(!this.validConfiguration(row))return this.metadata(this.save(row,'failed','CONNECTION_CONFIGURATION_CHANGED',null));
    if(row.phase!=='known'||['cancelled','expired'].includes(row.status))return this.metadata(row);
    let result:Row;
    if(row.flow==='operator')result=this.save(row,'cancelled','CONNECTION_ATTEMPT_CANCELLED',null);
    else{
      let status:any;
      try{status=this.status(await this.authority.call(actor,`/api/v1/connect-links/${encodeURIComponent(row.upstream_id)}`),row);}
      catch{return this.metadata(this.save(row,'failed','CONNECT_STATUS_UNAVAILABLE'));}
      if(status.status==='pending'){
        try{status=this.status(await this.authority.call(actor,`/api/v1/connect-links/${encodeURIComponent(row.upstream_id)}/cancel`,'POST'),row);}
        catch{try{status=this.status(await this.authority.call(actor,`/api/v1/connect-links/${encodeURIComponent(row.upstream_id)}`),row);}catch{return this.metadata(this.save(row,'failed','CONNECT_CANCEL_UNPROVEN'));}}
      }
      result=await this.refresh(actor,access,row,status);
    }
    this.store.audit(actor.subject,ownerId,'connection-attempt.cancel',id,trace,{status:result.status});return this.metadata(result);
  }
  async returned(actor:Actor,sealed:string|undefined,trace:string){
    let binding:ReturnBinding;try{requireValue(sealed,400,'CONNECT_RETURN_INVALID','Connection return cookie unavailable');binding=this.vault.open<ReturnBinding>(sealed);}catch{throw new AppError(400,'CONNECT_RETURN_INVALID','Connection return could not be verified');}
    requireValue(binding&&binding.issuer===actor.issuer&&binding.subject===actor.subject,403,'FORBIDDEN','Connection return belongs to another actor');
    requireValue(typeof binding.ownerId==='string'&&typeof binding.attemptId==='string'&&typeof binding.nonce==='string'&&typeof binding.expiresAt==='number'&&Number.isFinite(binding.expiresAt)&&binding.expiresAt>Date.now(),400,'CONNECT_RETURN_INVALID','Connection return expired or invalid');
    const {access,row}=await this.context(actor,binding.ownerId,binding.attemptId);
    requireValue(row.flow==='hosted'&&row.upstream_id===binding.upstreamId&&row.nonce_hash===digest(binding.nonce)&&row.return_consumed_at===null&&binding.expiresAt===Date.parse(row.expires_at),400,'CONNECT_RETURN_INVALID','Connection return expired or already consumed');
    this.store.transaction(()=>{const result=this.store.run('UPDATE connection_attempts SET return_consumed_at=? WHERE id=? AND nonce_hash=? AND return_consumed_at IS NULL',new Date().toISOString(),row.id,digest(binding.nonce));requireValue(Number(result.changes)===1,400,'CONNECT_RETURN_INVALID','Connection return already consumed');this.store.audit(actor.subject,row.owner_id,'connection-attempt.return',row.id,trace);});
    return this.metadata(await this.refresh(actor,access,this.row(row.id)));
  }
}
