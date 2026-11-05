import {randomUUID} from 'node:crypto';
import {decodeJwt,jwtVerify,type JWTVerifyGetKey,type JWTPayload} from 'jose';
import type {Config} from './config.ts';
import type {Actor} from './policy.ts';
import type {Store} from './store.ts';
import {digest} from './content.ts';
import {requireValue} from './errors.ts';
import {remoteJson} from './http-client.ts';
import {projectionSnapshot} from './projection-proof.ts';

export interface CommandRequest {
  version:1; method:string; path_and_query:string; content_type:string|null;
  body_sha256:string; idempotency_key_sha256:string|null;
}
export interface CommandBinding {kind:string;resourceId:string;digest:string;}
export interface CommandEnvelope {token:string;request:CommandRequest;binding?:CommandBinding;}
export interface CommandClaims extends JWTPayload {
  authority_version:1;
  iss:string;sub:string;aud:string;jti:string;iat:number;exp:number;
  user_service_id:string;delegation_sha256:string;command_request:CommandRequest;
  source:{key_id:string;credential_id:string|null;credential_incarnation:string;};
}
const nonempty=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const requestFields=['version','method','path_and_query','content_type','body_sha256','idempotency_key_sha256'] as const;
const sourceFields=['key_id','credential_id','credential_incarnation'] as const;
function sameFields(a:unknown,b:unknown,fields:readonly string[]) {
  return record(a)&&record(b)&&fields.every(key=>Object.hasOwn(a,key)&&Object.hasOwn(b,key)&&a[key]===b[key]);
}
function validRequest(v:unknown):v is CommandRequest {
  return record(v)&&v.version===1&&typeof v.method==='string'&&['POST','PUT','PATCH','DELETE'].includes(v.method)&&typeof v.path_and_query==='string'&&v.path_and_query.startsWith('/')&&!/[\r\n#]/.test(v.path_and_query)&&(v.content_type===null||nonempty(v.content_type))&&hash(v.body_sha256)&&(v.idempotency_key_sha256===null||hash(v.idempotency_key_sha256));
}
export async function verifyCommandAuthority(actor:Actor,config:Config,keys:JWTVerifyGetKey,delegationExpiry:number):Promise<CommandClaims> {
  const saved=actor.commandAuthority;
  requireValue(saved&&typeof saved.token==='string'&&saved.token.length<=32000&&validRequest(saved.request)&&actor.binding?.kind==='propagated'&&config.serviceId,403,'SOURCE_AUTHORITY_UNPROVEN','A signed command bound to this service request is required');
  const {payload,protectedHeader}=await jwtVerify(saved.token,keys,{issuer:config.issuer,audience:config.serviceId,algorithms:['RS256'],typ:'nyxid-command-authority+jwt',requiredClaims:['authority_version','iss','sub','aud','jti','iat','exp','user_service_id','delegation_sha256','command_request','source']});
  requireValue(payload.authority_version===1&&protectedHeader.typ==='nyxid-command-authority+jwt'&&payload.iss===actor.issuer&&payload.sub===actor.subject&&payload.aud===config.serviceId&&nonempty(payload.jti)&&Number.isInteger(payload.iat)&&payload.iat!<=Date.now()/1000+5&&Number.isInteger(payload.exp)&&payload.exp!>payload.iat!&&payload.exp!<=delegationExpiry&&nonempty(payload.user_service_id)&&payload.delegation_sha256===digest(actor.credential)&&validRequest(payload.command_request)&&sameFields(payload.command_request,saved.request,requestFields)&&record(payload.source)&&nonempty(payload.source.key_id)&&(payload.source.credential_id===null||nonempty(payload.source.credential_id))&&hash(payload.source.credential_incarnation),403,'SOURCE_AUTHORITY_UNPROVEN','Signed command source or request binding mismatch');
  return payload as CommandClaims;
}
export async function validateCommandAuthority(config:Config,saved:CommandEnvelope,claims:CommandClaims) {
  requireValue(config.clientSecret,503,'COMMAND_AUTHORITY_CONFIGURATION','A confidential resource client is required for command authority validation');
  const r=saved.request;
  const form=new URLSearchParams({token_type_hint:'command_authority',token:saved.token,service_id:config.serviceId!,client_id:config.clientId,client_secret:config.clientSecret,request_method:r.method,request_path_and_query:r.path_and_query,request_body_sha256:r.body_sha256,command_delegation_sha256:claims.delegation_sha256});
  if(r.content_type!==null)form.set('request_content_type',r.content_type);
  if(r.idempotency_key_sha256!==null)form.set('request_idempotency_key_sha256',r.idempotency_key_sha256);
  const result=await remoteJson(config.introspectionUrl,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form});
  requireValue(result.active===true&&result.token_type==='command_authority'&&result.scope==='proxy'&&result.independent_commands===true&&result.authority_version===1&&Array.isArray(result.permissions)&&result.permissions.every((p:unknown)=>typeof p==='string')&&sameFields(result,claims,['authority_version','iss','sub','aud','jti','iat','exp','user_service_id','delegation_sha256'])&&sameFields(result.command_request,claims.command_request,requestFields)&&sameFields(result.source,claims.source,sourceFields),401,'REVOKED','Current command authority is invalid or differs from its signed binding');
}
export function commandRequest(method:string,pathAndQuery:string,body:Buffer,contentType:string|null,idempotencyKey:string|null):CommandRequest {
  return {version:1,method,path_and_query:pathAndQuery,content_type:contentType,body_sha256:digest(body),idempotency_key_sha256:idempotencyKey===null?null:digest(idempotencyKey)};
}
export function assertCommandRequest(actor:Actor,method:string,path:string) {
  if(!actor.commandAuthority)return;
  requireValue(actor.commandAuthority.request.method===method&&actor.commandAuthority.request.path_and_query.split('?')[0]===path,403,'SOURCE_AUTHORITY_UNPROVEN','The command authority belongs to another operation');
}
// This confirmation fence is audit bookkeeping, not new authority. Every worker
// must still verify the retained credential and current business permissions.
// Deprecated proof decoding is retained only for historical rows/tests.
export function bindActorCommand(store:Store,actor:Actor,target:CommandBinding):Actor {
  if(!actor.commandAuthority){
    const id=`native:${randomUUID()}`;
    store.run('INSERT INTO command_authorities VALUES (?,?,?,?,?,?)',actor.issuer,id,digest(actor.credential),target.kind,target.resourceId,target.digest);
    return {...actor,confirmedCommand:{version:1,id,binding:{...target}}};
  }
  return bindCommand(store,actor,decodeJwt(actor.commandAuthority.token) as CommandClaims,target);
}
// Caller must verify the proof and online authority before entering the command's
// creation transaction. This durable fence grants no authority of its own.
export function bindCommand(store:Store,actor:Actor,claims:CommandClaims,target:CommandBinding):Actor {
  requireValue(actor.commandAuthority&&claims.iss===actor.issuer&&claims.sub===actor.subject&&nonempty(claims.jti)&&nonempty(target.kind)&&nonempty(target.resourceId)&&nonempty(target.digest),403,'SOURCE_AUTHORITY_UNPROVEN','Verified command binding required');
  const tokenDigest=digest(actor.commandAuthority.token);
  store.run('INSERT INTO command_authorities VALUES (?,?,?,?,?,?) ON CONFLICT(issuer,jti) DO NOTHING',actor.issuer,claims.jti,tokenDigest,target.kind,target.resourceId,target.digest);
  const row=store.get('SELECT * FROM command_authorities WHERE issuer=? AND jti=?',actor.issuer,claims.jti)!;
  requireValue(row.token_digest===tokenDigest&&row.kind===target.kind&&row.resource_id===target.resourceId&&row.command_digest===target.digest,409,'COMMAND_AUTHORITY_REUSED','This authority is bound to another command');
  return {...actor,commandAuthority:{...actor.commandAuthority,binding:{...target}}};
}
export function assertCommandBinding(store:Store,actor:Actor,target:CommandBinding) {
  const saved=actor.commandAuthority;
  if(!saved){
    const confirmed=actor.confirmedCommand;
    // Unauthenticated adapter fixtures do not represent persisted production callers.
    if(!confirmed&&!actor.binding)return;
    requireValue(confirmed?.version===1,409,'LEGACY_COMMAND_RECONFIRMATION_REQUIRED','Saved task has no native confirmation; explicitly confirm a new command');
    const binding=confirmed.binding,row=store.get('SELECT * FROM command_authorities WHERE issuer=? AND jti=?',actor.issuer,confirmed.id);
    const child=store.get('SELECT * FROM command_derivations WHERE kind=? AND resource_id=?',target.kind,target.resourceId);
    requireValue(row&&row.token_digest===digest(actor.credential)&&row.kind===binding.kind&&row.resource_id===binding.resourceId&&row.command_digest===binding.digest&&((binding.kind===target.kind&&binding.resourceId===target.resourceId&&binding.digest===target.digest)||(child&&child.issuer===actor.issuer&&child.jti===confirmed.id&&child.task_digest===target.digest)),409,'CONFIRMED_COMMAND_CHANGED','Frozen command or credential differs; confirm a new command without rewriting this audit');
    return;
  }
  // The signed jti is used only as a database index; the validation path must
  // reverify this exact token before each write, including after a DB restart.
  const jti=decodeJwt(saved.token).jti;
  const binding=saved.binding,row=typeof jti==='string'?store.get('SELECT * FROM command_authorities WHERE issuer=? AND jti=?',actor.issuer,jti):undefined;
  const child=store.get('SELECT * FROM command_derivations WHERE kind=? AND resource_id=?',target.kind,target.resourceId);
  requireValue(binding&&row&&row.token_digest===digest(saved.token)&&row.kind===binding.kind&&row.resource_id===binding.resourceId&&row.command_digest===binding.digest&&((binding.kind===target.kind&&binding.resourceId===target.resourceId&&binding.digest===target.digest)||(child&&child.issuer===actor.issuer&&child.jti===jti&&child.task_digest===target.digest)),409,'COMMAND_AUTHORITY_REUSED','Saved command authority does not match this task');
}
export function deriveCommand(store:Store,actor:Actor,parent:CommandBinding,child:CommandBinding) {
  if(!actor.commandAuthority&&!actor.confirmedCommand)return;
  requireValue(child.kind==='projection'&&['release','projection'].includes(parent.kind),409,'COMMAND_AUTHORITY_REUSED','Only an explicit metadata continuation may inherit command authority');
  assertCommandBinding(store,actor,parent);
  const jti=actor.confirmedCommand?.id??decodeJwt(actor.commandAuthority!.token).jti!;
  store.run('INSERT INTO command_derivations VALUES (?,?,?,?,?)',child.kind,child.resourceId,actor.issuer,jti,child.digest);
}
export function releaseCommand(row:Record<string,any>,store?:Store):CommandBinding {
  const revision=store?.get('SELECT title,markdown,digest,credited_author FROM revisions WHERE id=?',row.revision_id);
  const article=store?.get('SELECT language FROM articles WHERE id=?',row.article_id);
  const site=article?store?.get('SELECT * FROM sites WHERE owner_id=? AND language=?',row.owner_id,article.language):undefined;
  const route=site?store?.get('SELECT base_url FROM site_admin_routes WHERE site_id=?',site.id):undefined;
  const author=site&&revision?store?.get('SELECT ghost_author_id FROM author_mappings WHERE site_id=? AND credited_author=?',site.id,revision.credited_author):undefined;
  return {kind:'release',resourceId:row.id,digest:digest(JSON.stringify([row.article_id,row.revision_id,row.owner_id,row.action,...(row.action==='publish'?[]:[row.remote_id??null,row.url??null]),...(store?[revision,article,site,route,author]:[])]))};
}
export const deliveryCommand=(row:Record<string,any>):CommandBinding=>({kind:'delivery',resourceId:row.id,digest:digest(JSON.stringify([row.release_id,row.owner_id,row.connection_id,row.target,row.action,row.digest]))});
export function projectionCommand(row:Record<string,any>,store?:Store,capture=false):CommandBinding {
  return {kind:'projection',resourceId:row.id,digest:digest(JSON.stringify([row.article_id,row.owner_id,...(store?[projectionSnapshot(store,row,capture)]:[])]))};
}
