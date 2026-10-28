import { readFile } from 'node:fs/promises';
import type { Actor, Authority } from './policy.ts';
import type { Config } from './config.ts';
import type { Store } from './store.ts';
import type { RemoteRequest } from './targets.ts';
import { remoteJson, RemoteError } from './http-client.ts';
import { requireValue } from './errors.ts';
import { digest } from './content.ts';

type Owner = { kind:string; issuer:string; subject:string };
export interface ConnectionBinding {
  id:string; target:string; owner:Owner; slug:string; remoteBaseUrl:string;
  accountId:string; organizationId?:string; publicationId?:string;
  label?:string;
  pro?:boolean; canPublish?:boolean; canUpdate?:boolean; canRemove?:boolean;
}
export function canonicalJson(value:any):string {
  if(Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if(value && typeof value==='object') return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function operationDigest(id:string,endpointId:string,contractDigest:string,args:any) {
  return `sha256:${digest(canonicalJson({contract_version:'nyxid-exact-operation.v1',user_service_id:id,endpoint_id:endpointId,endpoint_contract_digest:contractDigest,arguments:args}))}`;
}
function tokenClaims(actor:Actor) {
  // Only used to choose the upstream route. Authentication and online introspection
  // establish the claims; this decode never grants local authority.
  try { return JSON.parse(Buffer.from(actor.credential.split('.')[1], 'base64url').toString()); } catch { return {}; }
}
function endpointDigest(endpoint:any) {
  const fields=['endpoint_id','method','path','parameters','request_body_schema','request_content_type','request_body_required','response'];
  const contract:any={contract_version:'nyxid-exact-endpoint.v1'};
  for(const key of fields) contract[key]=endpoint[key] ?? (key==='request_body_required'?false:null);
  for(const key of ['target_id','async_operation','attachment_input']) if(endpoint[key]!=null) contract[key]=endpoint[key];
  return `sha256:${digest(canonicalJson(contract))}`;
}
export function exactArguments(endpoint:any,path:string,request:RemoteRequest) {
  const url=new URL(`https://contract.invalid${path}`), pattern=endpoint.path.split('/'), actual=url.pathname.split('/');
  if(endpoint.method!==request.method || pattern.length!==actual.length) return null;
  const args:Record<string,unknown>={};
  for(let i=0;i<pattern.length;i++) {
    const name=/^\{([^{}]+)\}$/.exec(pattern[i])?.[1];
    if(name) args[name]=decodeURIComponent(actual[i]); else if(pattern[i]!==actual[i]) return null;
  }
  const parameters=endpoint.parameters??[];
  requireValue(Array.isArray(parameters),502,'NYXID_CONTRACT','Invalid operation parameters');
  for(const p of parameters) {
    if(p.in==='query' && url.searchParams.has(p.name)) {
      const value=url.searchParams.get(p.name)!;
      args[p.name]=p.schema?.type==='integer'?Number(value):p.schema?.type==='boolean'?value==='true':value;
    } else if(p.required && !(p.name in args)) requireValue(p.in==='header' && p.name.toLowerCase()==='idempotency-key',409,'NYXID_CONTRACT_UNSUPPORTED','Operation requires an unsupported parameter');
  }
  for(const name of url.searchParams.keys()) requireValue(parameters.some((p:any)=>p.in==='query'&&p.name===name),409,'NYXID_CONTRACT_UNSUPPORTED','Query parameter is not declared in the operation');
  if(request.body) {
    requireValue(endpoint.request_content_type?.includes('json') && endpoint.request_body_schema?.type==='object',409,'NYXID_CONTRACT_UNSUPPORTED','A declared JSON object body is required');
    requireValue(Object.keys(request.body).every(key=>!(key in args) && !parameters.some((p:any)=>p.name===key)),409,'NYXID_CONTRACT_UNSUPPORTED','Ambiguous body and parameter names require a dedicated operation');
    Object.assign(args,request.body);
  }
  return args;
}
export class NyxAuthority implements Authority {
  config:Config; store?:Store;
  constructor(config:Config,store?:Store) { this.config=config;this.store=store; }
  async validate(actor:Actor) {
    const body=new URLSearchParams({token:actor.credential,client_id:this.config.clientId});
    if(this.config.clientSecret) body.set('client_secret',this.config.clientSecret);
    const result=await remoteJson(this.config.introspectionUrl,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
    const scopes=typeof result.scope==='string'?result.scope.split(' '):[];
    requireValue(result.active===true && result.sub===actor.subject && (!result.iss || result.iss===actor.issuer) && (actor.sourceScopes??actor.scopes).every(s=>scopes.includes(s)),401,'REVOKED','Current authorization is invalid');
  }
  async call(actor:Actor,path:string,method='GET',body?:unknown) {
    requireValue(path.startsWith('/api/v1/') && !path.includes('..'),500,'NYXID_ROUTE','Invalid upstream route');
    return remoteJson(`${this.config.authorityUrl}${path}`,{method,headers:{authorization:`Bearer ${actor.credential}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  }
  async membership(actor:Actor,organization:string) {
    const result=await this.call(actor,'/api/v1/orgs');
    requireValue(Array.isArray(result.orgs),502,'NYXID_CONTRACT','Invalid organization inventory');
    const org=result.orgs.find((o:any)=>o.id===organization);
    return org?.your_role==='admin'?'admin':org?.your_role==='member'?'member':null;
  }
  async bindings():Promise<ConnectionBinding[]> {
    requireValue(this.config.connectionsFile,409,'CONNECTION_CONFIGURATION_REQUIRED','Operator must bind exact NyxID connections to owners and destinations');
    const result=JSON.parse(await readFile(this.config.connectionsFile,'utf8'));
    requireValue(Array.isArray(result) && result.every(b=>b && typeof b.id==='string' && b.owner && ['personal','organization'].includes(b.owner.kind) && typeof b.accountId==='string' && typeof b.slug==='string' && /^[a-zA-Z0-9_-]+$/.test(b.slug) && typeof b.remoteBaseUrl==='string') && new Set(result.map(b=>b.id)).size===result.length,500,'CONNECTION_CONFIGURATION','Invalid or ambiguous operator connection bindings');
    return result;
  }
  async connection(actor:Actor,owner:Owner,connectionId:string,target:string) {
    requireValue(actor.issuer===owner.issuer && (owner.kind!=='personal'||actor.subject===owner.subject),403,'CONNECTION_MISMATCH','Exact owner connection required');
    const binding=(await this.bindings()).find(b=>b.id===connectionId && b.target===target && canonicalJson(b.owner)===canonicalJson(owner));
    requireValue(binding,403,'CONNECTION_MISMATCH','Exact owner destination binding required');
    const inventory=await this.call(actor,'/api/v1/user-services');
    requireValue(Array.isArray(inventory.services),502,'NYXID_CONTRACT','Invalid connection inventory');
    const service=inventory.services.find((s:any)=>s.id===connectionId);
    const source=service?.credential_source;
    requireValue(service?.is_active===true && service.slug===binding.slug,409,'CONNECTION_DISABLED','Reconnect the selected NyxID service; no account fallback is allowed');
    requireValue(owner.kind==='personal'?source?.type==='personal':source?.type==='org'&&source.org_id===owner.subject&&source.allowed===true,403,'CONNECTION_MISMATCH','NyxID credential provenance differs from the selected owner');
    return {...binding,active:true,generation:digest(canonicalJson({binding,stateVersion:service.state_version,updatedAt:service.updated_at}))};
  }
  async listConnections(actor:Actor,owner:Owner) {
    const candidates=(await this.bindings()).filter(b=>canonicalJson(b.owner)===canonicalJson(owner)),results=[];
    for(const binding of candidates) {
      try{await this.connection(actor,owner,binding.id,binding.target);results.push({id:binding.id,target:binding.target,label:binding.label??binding.slug,accountId:binding.accountId,active:true});}
      catch{results.push({id:binding.id,target:binding.target,label:binding.label??binding.slug,accountId:binding.accountId,active:false,reason:'Selected connection unavailable; reconnect this exact account in NyxID'});}
    }return results;
  }
  path(connection:ConnectionBinding,request:RemoteRequest) {
    const base=new URL(connection.remoteBaseUrl),url=new URL(request.url);
    requireValue(base.protocol==='https:' && url.origin===base.origin && !url.username && !url.password && !url.hash,403,'DESTINATION_ROUTE','Request must stay on the configured destination');
    const prefix=base.pathname.replace(/\/$/,'');
    requireValue(url.pathname===prefix || url.pathname.startsWith(`${prefix}/`),403,'DESTINATION_ROUTE','Request is outside the connection base path');
    return `${url.pathname.slice(prefix.length)||'/'}${url.search}`;
  }
  async prepareApproval(actor:Actor,owner:Owner,id:string,target:string,request:RemoteRequest,deliveryId:string,contentDigest:string,action:string) {
    requireValue(this.store && owner.kind==='organization',409,'APPROVAL_CONFIGURATION','Persistent exact approval storage required');
    const connection=await this.connection(actor,owner,id,target),path=this.path(connection,request);
    const delegated=tokenClaims(actor).delegated===true;
    const catalog=await this.call(actor,delegated?'/api/v1/delegation/operation-catalog':'/api/v1/mcp/config');
    const service=catalog.services?.find((s:any)=>(delegated?s.user_service_id:s.service_id)===id && (delegated||s.is_user_service===true));
    requireValue(service && !service.is_generic_proxy,409,'EXACT_OPERATION_REQUIRED','NyxID must publish a declared destination operation');
    const matches=(delegated?service.operations:service.endpoints).map((operation:any)=>({operation,args:exactArguments(operation,path,request)})).filter((o:any)=>o.args!==null);
    requireValue(matches.length===1,409,'EXACT_OPERATION_REQUIRED','Destination operation is absent or ambiguous in the current NyxID catalog');
    const {operation,args}=matches[0],contract=operation.endpoint_contract_digest??endpointDigest(operation);
    const input={user_service_id:id,endpoint_id:operation.endpoint_id,catalog_digest:catalog.catalog_digest,...(delegated?{exact_view_digest:catalog.exact_view_digest}:{}),endpoint_contract_digest:contract,operation_digest:operationDigest(id,operation.endpoint_id,contract,args),operation_id:operation.endpoint_id,...(operation.operation_generation?{operation_generation:operation.operation_generation}:{}),idempotency_key:deliveryId,arguments:args};
    const result=await this.call(actor,'/api/v1/approvals/exact-service/requests','POST',input);
    requireValue(result.user_service_id===id && result.operation_digest===input.operation_digest && result.idempotency_key===deliveryId && result.state==='pending' && typeof result.request_id==='string',502,'NYXID_CONTRACT','Exact approval creation response does not match the confirmed request');
    this.store.run('INSERT INTO nyx_approvals VALUES (?,?,?,?,?,?,?) ON CONFLICT(reference) DO NOTHING',result.request_id,id,contentDigest,action,canonicalJson(owner),JSON.stringify(result),digest(canonicalJson(request)));
    return {reference:result.request_id,state:result.state,expiresAt:result.expires_at};
  }
  async approval(actor:Actor,owner:Owner,reference:string,contentDigest:string,connectionId:string,action:string) {
    const binding=this.store?.get('SELECT * FROM nyx_approvals WHERE reference=?',reference);
    requireValue(binding && binding.connection_id===connectionId && binding.content_digest===contentDigest && binding.action===action && binding.owner_json===canonicalJson(owner),409,'APPROVAL_NEEDED','A NyxID exact request bound to this content, destination and action is required');
    const fence=JSON.parse(binding.fence_json),result=await this.call(actor,`/api/v1/approvals/exact-service/requests/${encodeURIComponent(reference)}/status`);
    requireValue(result.user_service_id===connectionId && ['endpoint_id','operation_digest','operation_id','operation_generation','idempotency_key','catalog_digest','endpoint_contract_digest','exact_view_digest'].every(key=>result[key]===fence[key]) && ['approved','redeemed'].includes(result.state) && (result.state==='redeemed'||Date.parse(result.expires_at)>Date.now()),409,'APPROVAL_NEEDED','NyxID exact Admin authorization is pending, expired, revoked or drifted');
    return result;
  }
  async execute(actor:Actor,input:Record<string,any>) {
    const connection=await this.connection(actor,input.owner,input.connectionId,input.target),request=input.request as RemoteRequest,path=this.path(connection,request);
    if(input.owner.kind==='organization' && !input.readOnly) {
      const status=await this.approval(actor,input.owner,input.approvalRef,input.digest,input.connectionId,input.action);
      const binding=this.store!.get('SELECT * FROM nyx_approvals WHERE reference=?',input.approvalRef)!;
      requireValue(binding.request_digest===digest(canonicalJson(request)),409,'APPROVAL_NEEDED','Exact approved request differs from the outgoing content');
      const stored=JSON.parse(binding.fence_json),fence:any={};
      for(const key of ['catalog_digest','exact_view_digest','operation_digest','operation_id','operation_generation','idempotency_key']) if(stored[key]!==undefined) fence[key]=stored[key];
      const result=status.state==='redeemed'?status:await this.call(actor,`/api/v1/approvals/exact-service/requests/${encodeURIComponent(input.approvalRef)}/redeem`,'POST',fence);
      if(result.state==='failed' || result.state==='redeeming') throw new RemoteError('REMOTE_UNCERTAIN','NyxID effect outcome requires read-only reconciliation',true);
      requireValue(result.state==='redeemed' && result.receipt,409,'APPROVAL_NEEDED','NyxID did not redeem the exact authorization');
      const receipt=result.receipt;
      requireValue(receipt.response_digest===`sha256:${digest(receipt.response_body)}`,502,'NYXID_CONTRACT','Execution receipt digest mismatch');
      let body;try{body=JSON.parse(receipt.response_body);}catch{throw new RemoteError('REMOTE_UNCERTAIN','Provider receipt is not readable JSON; reconcile',true);}
      return {accountId:connection.accountId,status:receipt.http_status,body};
    }
    const query=new URLSearchParams(path.split('?')[1]??'');
    requireValue(!query.has('_nyxid_via'),403,'DESTINATION_ROUTE','Connection selector is server-owned');query.set('_nyxid_via',connection.id);
    const route=`/api/v1/proxy/s/${encodeURIComponent(connection.slug)}/${path.split('?')[0].replace(/^\//,'')}?${query}`;
    const body=await this.call(actor,route,request.method,request.body);
    return {accountId:connection.accountId,status:200,body};
  }
}
