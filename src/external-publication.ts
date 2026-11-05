import {randomUUID} from 'node:crypto';
import {AppError,requireValue,text} from './errors.ts';
import {digest} from './content.ts';
import type {Actor} from './policy.ts';
import type {Row} from './store.ts';
import type {OriginalAdapter} from './publishing.ts';
import type {CopyPayload,CopyResult,RemoteRequest,Send,Target} from './targets.ts';
import {DistributionService} from './distribution.ts';
import {connectionFingerprint} from './connection-proof.ts';
import {assertCommandRequest} from './command-authority.ts';

interface ExternalContext {delivery:Row;external:Row;payload:CopyPayload;owner:{kind:string;issuer:string;subject:string};}
export interface ExternalPublicationOptions {syncIntervalMs?:number;}
const receiptStates=['awaiting_external','uncertain','published'];
const authorizationCodes=new Set(['IDENTITY_UNAVAILABLE','REMOTE_AUTHORIZATION','CONNECTION_DISABLED','ACCOUNT_RIGHTS_REQUIRED','REVOKED','SOURCE_AUTHORITY_UNPROVEN','FORBIDDEN','INSUFFICIENT_SCOPE']);

/** Records independently executed copies. This service never grants destination authority or dispatches writes. */
export class ExternalPublicationService {
  distribution:DistributionService;original:OriginalAdapter;syncIntervalMs:number;
  constructor(distribution:DistributionService,original:OriginalAdapter,options:ExternalPublicationOptions={}){
    this.distribution=distribution;this.original=original;this.syncIntervalMs=options.syncIntervalMs??15*60_000;
    requireValue(Number.isSafeInteger(this.syncIntervalMs)&&this.syncIntervalMs>=1000,500,'EXTERNAL_SYNC_CONFIGURATION','External sync interval must be at least one second');
  }
  get store(){return this.distribution.store;}
  private get policy(){return this.distribution.originals.content.policy;}
  private actorKey(actor:Actor){return `${actor.issuer}|${actor.subject}`;}
  private allowedInput(input:Record<string,unknown>,keys:string[]){requireValue(input&&typeof input==='object'&&Object.keys(input).every(key=>keys.includes(key)),400,'INVALID_INPUT','Unexpected external publication input');}
  private row(id:string){
    text(id,'intentId');const delivery=this.store.get('SELECT * FROM deliveries WHERE id=?',id);requireValue(delivery,404,'NOT_FOUND','External publication intent not found');
    const external=this.store.get('SELECT * FROM external_publications WHERE delivery_id=?',id);requireValue(external?.execution_mode==='external',409,'EXTERNAL_INTENT_REQUIRED','Historical worker tasks cannot become external intents');
    const source=this.store.get('SELECT owner_id,revision_id FROM releases WHERE id=?',delivery.release_id);
    requireValue(source&&source.owner_id===delivery.owner_id&&source.revision_id===external.revision_id,409,'EXTERNAL_SNAPSHOT_CHANGED','Frozen source owner or revision binding changed');
    const saved=this.store.get('SELECT payload_json FROM delivery_payloads WHERE delivery_id=?',id);let payload:CopyPayload;
    try{payload=JSON.parse(saved?.payload_json);}catch{throw new AppError(503,'TASK_SNAPSHOT_UNAVAILABLE','Frozen external publication payload is unavailable');}
    requireValue(payload&&payload.deliveryId===id&&payload.accountId&&payload.connectionFingerprint,409,'EXTERNAL_SNAPSHOT_CHANGED','Frozen external publication snapshot is invalid');
    requireValue(delivery.digest===digest(JSON.stringify({...payload,connectionId:delivery.connection_id,target:delivery.target,accountId:payload.accountId})),409,'EXTERNAL_SNAPSHOT_CHANGED','Frozen external publication content changed');
    return {delivery,external,payload};
  }
  private async context(actor:Actor,id:string):Promise<ExternalContext>{
    const saved=this.row(id),owner=await this.policy.publish(actor,saved.delivery.owner_id,'access');
    requireValue(owner.kind==='personal',409,'EXTERNAL_ORGANIZATION_UNSUPPORTED','Organization publishing requires exact Admin authorization for content, destination and action; this route supports personal DEV only');
    await this.policy.scope(actor,'connections:read');
    return {...saved,owner:{kind:owner.kind,issuer:owner.issuer,subject:owner.subject}};
  }
  private target(context:ExternalContext):Target {
    const target=this.distribution.targets.get(context.delivery.target);requireValue(target.reconcileExternal&&target.request,409,'EXTERNAL_TARGET_UNSUPPORTED','This target has no supported external publication verification');return target;
  }
  private async connection(actor:Actor,context:ExternalContext){
    const connection=await this.distribution.connections.connection(actor,context.owner,context.delivery.connection_id,context.delivery.target);
    requireValue(connection?.active!==false&&connectionFingerprint(connection)===context.payload.connectionFingerprint&&connection.accountId===context.payload.accountId,409,'CONNECTION_CHANGED','The selected connection or account changed; never switch accounts');
    const request=this.target(context).request!(context.payload,{...connection,canPublish:true,canUpdate:true});
    requireValue(JSON.stringify(request)===context.external.request_json,409,'EXTERNAL_SNAPSHOT_CHANGED','The configured destination request differs from the frozen payload');
    return connection;
  }
  private assertSource(context:ExternalContext){
    const source=this.store.get('SELECT r.*,v.digest FROM releases r JOIN revisions v ON v.id=r.revision_id WHERE r.id=?',context.delivery.release_id);
    requireValue(source?.state==='published'&&source.revision_id===context.external.revision_id&&source.owner_id===context.delivery.owner_id&&source.digest===context.payload.sourceDigest&&source.url===context.payload.sourceUrl,409,'ORIGINAL_NOT_LIVE','The exact frozen Ghost original is no longer live');return source;
  }
  private identity(row:Row){return JSON.stringify([row.owner_id,row.release_id,row.connection_id,row.target,row.action,row.format,row.digest,row.remote_id,row.url]);}
  private unchanged(context:ExternalContext,allowPublishedSame?:string){
    const current=this.row(context.delivery.id);
    if(allowPublishedSame&&current.delivery.state==='published'&&current.delivery.remote_id===allowPublishedSame&&current.delivery.digest===context.delivery.digest&&current.delivery.owner_id===context.delivery.owner_id&&current.delivery.release_id===context.delivery.release_id)return current;
    requireValue(current.external.generation===context.external.generation&&current.delivery.state===context.delivery.state&&this.identity(current.delivery)===this.identity(context.delivery)&&current.external.request_json===context.external.request_json&&current.external.revision_id===context.external.revision_id,409,'EXTERNAL_INTENT_STATE','External intent changed while the platform was being read');return current;
  }
  private nextSync(at:number=Date.now(),reauthorize=false){return new Date(at+Math.max(this.syncIntervalMs,reauthorize?60*60_000:0)).toISOString();}
  private view(id:string,sourceChecked=false){
    const {delivery:d,external:e,payload:p}=this.row(id);
    return {id:d.id,intentId:d.id,deliveryId:d.id,executionMode:'external' as const,revisionId:e.revision_id,ownerId:d.owner_id,releaseId:d.release_id,target:d.target,connectionId:d.connection_id,accountId:p.accountId,action:d.action,format:d.format,digest:d.digest,state:d.state,remoteId:d.remote_id??null,url:d.url??null,request:JSON.parse(e.request_json),executionAllowed:sourceChecked&&d.state==='awaiting_external',sourceUrl:p.sourceUrl,creditedAuthor:p.creditedAuthor,lastSyncAt:e.last_sync_at??null,lastVerifiedAt:e.last_verified_at??null,syncStatus:e.sync_status,syncErrorCode:e.sync_error_code??null,followUpState:e.follow_up_state,remoteCancellationGuaranteed:false,traceId:d.trace_id,createdAt:d.created_at,updatedAt:d.updated_at,
      history:this.store.all('SELECT state,code,trace_id,created_at FROM delivery_events WHERE delivery_id=? ORDER BY rowid',id).map(row=>({state:row.state,code:row.code??null,traceId:row.trace_id,createdAt:row.created_at})),observations:this.store.all('SELECT id,state,code,remote_id,url,trace_id,observed_at FROM external_publication_observations WHERE delivery_id=? ORDER BY rowid',id).map(row=>({id:row.id,state:row.state,code:row.code??null,remoteId:row.remote_id??null,url:row.url??null,traceId:row.trace_id,observedAt:row.observed_at})),
      instructions:'Use the exact selected account and this frozen payload through the independent top-level NyxID DEV tool only after content/action authorization. Return remoteId for independent CMS verification. If a receipt is lost, reconcile without resending. Local cancellation cannot revoke an independent DEV request.'};
  }
  async get(actor:Actor,id:string){await this.context(actor,id);return this.view(id);}
  private idempotency(actor:Actor,operation:string,key:string,fingerprint:string,id?:string){
    const prior=this.store.get('SELECT * FROM idempotency WHERE actor=? AND operation=? AND key=?',this.actorKey(actor),operation,key);
    if(prior){requireValue(prior.digest===fingerprint,409,'CONFLICT','Idempotency key was already used with different external publication input');return String(prior.resource_id);}
    if(id)this.store.run('INSERT INTO idempotency VALUES (?,?,?,?,?)',this.actorKey(actor),operation,key,fingerprint,id);return null;
  }
  async prepare(actor:Actor,releaseId:string,input:Record<string,unknown>,trace:string){
    this.allowedInput(input,['ownerId','target','connectionId','action','format','excerpt','copyId','rightsConfirmed','idempotencyKey']);
    assertCommandRequest(actor,'POST',`/api/service/releases/${releaseId}/external-publications`);
    const release=this.store.get('SELECT * FROM releases WHERE id=?',text(releaseId,'releaseId'));requireValue(release,404,'NOT_FOUND','Original not found');
    const owner=await this.policy.publish(actor,release.owner_id,'access');await this.policy.scope(actor,'connections:read');
    requireValue(owner.kind==='personal',409,'EXTERNAL_ORGANIZATION_UNSUPPORTED','Organization publishing requires exact Admin authorization for content, destination and action; personal DEV success does not satisfy it');
    requireValue(input.ownerId===undefined||input.ownerId===owner.id,403,'FORBIDDEN','Owner mismatch');
    const target=this.distribution.targets.get(text(input.target,'target')),connectionId=text(input.connectionId,'connectionId'),key=text(input.idempotencyKey,'idempotencyKey',200);
    requireValue(target.reconcileExternal&&target.request,409,'EXTERNAL_TARGET_UNSUPPORTED','Only supported personal external destinations can be prepared');
    requireValue(['create','update'].includes(String(input.action))&&['full','excerpt'].includes(String(input.format)),400,'INVALID_INPUT','Use create/update and full/excerpt format');
    requireValue(input.rightsConfirmed===true,400,'CONFIRMATION_REQUIRED','Confirm text and image publication rights');
    requireValue(input.action!=='create'||input.copyId==null,400,'INVALID_INPUT','Create cannot select an existing remote copy');
    if(input.action==='update'){
      const copy=this.row(text(input.copyId,'copyId'));
      requireValue(copy.delivery.state==='published'&&copy.delivery.source_verified===1,409,'EXTERNAL_INTENT_STATE','Only a verified external copy can be corrected through a newly frozen update');
    }
    const fingerprint=digest(JSON.stringify({releaseId,ownerId:owner.id,target:target.name,connectionId,action:input.action,format:input.format,excerpt:input.excerpt,copyId:input.copyId}));
    const previous=this.idempotency(actor,'external.prepare',key,fingerprint);
    if(previous){
      const saved=await this.context(actor,previous);
      if(saved.delivery.state==='awaiting_external'){
        const source=this.assertSource(saved),original=this.distribution.originals.input(source);
        requireValue(source.remote_id&&source.url&&await this.original.verify(original,{remoteId:source.remote_id,url:source.url}),409,'ORIGINAL_NOT_LIVE','The frozen Ghost original must still be publicly verified before reusing a prepared payload');
        await this.policy.publish(actor,saved.delivery.owner_id,'access');await this.connection(actor,saved);await this.policy.publish(actor,saved.delivery.owner_id,'access');
        this.store.transaction(()=>{this.unchanged(saved);this.assertSource(saved);});
      }
      return this.view(previous,true);
    }
    const id=randomUUID(),prepared=await this.distribution.prepareIntent(actor,owner,release,target,connectionId,input,id,true);
    requireValue(prepared.connection.active!==false,409,'CONNECTION_DISABLED','The selected connection is disabled');
    requireValue(prepared.connection.organizationId==null,409,'EXTERNAL_ORGANIZATION_UNSUPPORTED','A personal intent cannot target an organization publication');
    requireValue(release.remote_id&&release.url&&await this.original.verify(prepared.original,{remoteId:release.remote_id,url:release.url}),409,'ORIGINAL_NOT_LIVE','The exact Ghost original must be publicly verified before external publication');
    const request=target.request!(prepared.payload,prepared.connection);
    await this.policy.publish(actor,owner.id,'access');
    const fresh=await this.distribution.connections.connection(actor,{kind:owner.kind,issuer:owner.issuer,subject:owner.subject},connectionId,target.name);
    requireValue(fresh.active!==false&&connectionFingerprint(fresh)===prepared.payload.connectionFingerprint&&JSON.stringify(target.request!(prepared.payload,fresh))===JSON.stringify(request),409,'CONNECTION_CHANGED','Selected connection changed during source verification');
    await this.policy.publish(actor,owner.id,'access');
    const now=new Date().toISOString(),snapshot={id:fresh.id,slug:fresh.slug,remoteBaseUrl:fresh.remoteBaseUrl,accountId:fresh.accountId,organizationId:fresh.organizationId,generation:fresh.generation,executionApproval:fresh.executionApproval};
    const resultId=this.store.transaction(()=>{
      const concurrent=this.idempotency(actor,'external.prepare',key,fingerprint);if(concurrent)return concurrent;
      const source=this.store.get('SELECT * FROM releases WHERE id=?',releaseId);
      requireValue(source?.state==='published'&&source.revision_id===release.revision_id&&source.url===release.url&&source.remote_id===release.remote_id,409,'ORIGINAL_NOT_LIVE','Original changed during preparation');
      if(input.action==='create')requireValue(!this.store.get("SELECT 1 FROM deliveries d JOIN releases r ON r.id=d.release_id WHERE r.article_id=? AND d.connection_id=? AND d.target=? AND (d.action='create' OR EXISTS(SELECT 1 FROM external_publications mode WHERE mode.delivery_id=d.id)) AND (d.state NOT IN ('failed','blocked','cancelled','removed') OR EXISTS(SELECT 1 FROM external_publications e WHERE e.delivery_id=d.id AND d.state<>'removed'))",release.article_id,connectionId,target.name),409,'DUPLICATE_TARGET','An existing or possibly dispatched copy requires reconciliation; do not resend');
      if(prepared.copy){const current=this.store.get('SELECT * FROM deliveries WHERE id=?',prepared.copy.id);requireValue(current?.state==='published'&&current.remote_id===prepared.copy.remote_id&&current.url===prepared.copy.url&&current.digest===prepared.copy.digest,409,'COPY_MISMATCH','Original copy changed during update preparation');requireValue(!this.store.get("SELECT 1 FROM deliveries d JOIN external_publications e ON e.delivery_id=d.id WHERE d.connection_id=? AND d.remote_id=? AND d.state IN ('awaiting_external','uncertain','cancelled')",connectionId,prepared.copy.remote_id),409,'DUPLICATE_TARGET','Resolve the outstanding external update before another update');}
      this.store.run('INSERT INTO deliveries(id,release_id,owner_id,connection_id,target,action,format,digest,state,remote_id,url,trace_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,releaseId,owner.id,connectionId,target.name,String(input.action),String(input.format),prepared.contentDigest,'awaiting_external',prepared.copy?.remote_id??null,prepared.copy?.url??null,trace,now,now);
      this.store.run('INSERT INTO delivery_payloads VALUES (?,?,?)',id,this.distribution.originals.vault.seal(actor),JSON.stringify(prepared.payload));
      this.store.run('INSERT INTO external_publications(delivery_id,revision_id,execution_mode,request_json,connection_json,sync_actor_json,sync_status,next_sync_at) VALUES (?,?,?,?,?,?,?,?)',id,release.revision_id,'external',JSON.stringify(request),JSON.stringify(snapshot),this.distribution.originals.vault.seal(actor),'not_synced',this.nextSync());
      this.idempotency(actor,'external.prepare',key,fingerprint,id);
      this.distribution.event(id,'awaiting_external',trace);this.store.audit(actor.subject,owner.id,'external.prepare',id,trace,{revisionId:release.revision_id,contentDigest:prepared.contentDigest,connectionId,accountId:prepared.payload.accountId,action:input.action,executionMode:'external'});return id;
    });return this.view(resultId,true);
  }
  private send(actor:Actor,context:ExternalContext,connection:any):Send {
    return async(request:RemoteRequest)=>{
      requireValue(request.method==='GET',500,'READ_ONLY','External registration and sync can only read DEV');
      await this.policy.publish(actor,context.delivery.owner_id,'access');
      const result=await this.distribution.connections.execute(actor,{owner:context.owner,connectionId:context.delivery.connection_id,target:context.delivery.target,request,connectionFingerprint:context.payload.connectionFingerprint,readOnly:true});
      requireValue(result.accountId===connection.accountId,502,'REMOTE_ACCOUNT_MISMATCH','Read account differs from the selected connection');
      const status=Number(result.status);requireValue(status>=200&&status<300,status===401||status===403?401:502,status===429?'REMOTE_RATE_LIMIT':status===401||status===403?'REMOTE_AUTHORIZATION':status===404?'REMOTE_NOT_FOUND':status===410?'REMOTE_GONE':'REMOTE_FAILURE','The selected DEV account could not be read');return result.body;
    };
  }
  private async verify(actor:Actor,context:ExternalContext,remoteId?:string){
    const connection=await this.connection(actor,context),target=this.target(context);
    const result=await target.reconcileExternal!({...context.payload,remoteId:remoteId??context.delivery.remote_id??context.payload.remoteId},connection,this.send(actor,context,connection));
    await this.policy.publish(actor,context.delivery.owner_id,'access');await this.connection(actor,context);await this.policy.publish(actor,context.delivery.owner_id,'access');return {result,connection};
  }
  private observe(context:ExternalContext,status:string,code:string|null,trace:string,result?:CopyResult){
    const now=new Date().toISOString();
    this.store.run('INSERT INTO external_publication_observations VALUES (?,?,?,?,?,?,?,?)',randomUUID(),context.delivery.id,status,code,result?.remoteId??context.delivery.remote_id??null,result?.url??context.delivery.url??null,trace,now);
    this.store.run('UPDATE external_publications SET last_sync_at=?,sync_status=?,sync_error_code=?,next_sync_at=?,generation=generation+1 WHERE delivery_id=?',now,status,code,this.nextSync(Date.now(),status==='reauthorization_required'),context.delivery.id);
    this.store.audit('external-read',context.delivery.owner_id,'external.observe',context.delivery.id,trace,{status,code});
  }
  private record(actor:Actor,context:ExternalContext,result:CopyResult,trace:string,activate=true){
    this.store.run('UPDATE deliveries SET remote_id=?,url=?,source_verified=1 WHERE id=?',result.remoteId,result.url,context.delivery.id);
    this.store.run('UPDATE external_publications SET last_verified_at=?,sync_actor_json=? WHERE delivery_id=?',new Date().toISOString(),this.distribution.originals.vault.seal(actor),context.delivery.id);
    this.observe(context,'verified',null,trace,result);
    if(activate&&context.delivery.state!=='cancelled'){this.distribution.settleCopy(context.delivery,result.remoteId,'published',trace);this.distribution.event(context.delivery.id,'published',trace);}
  }
  private failure(context:ExternalContext,error:unknown,trace:string,makeUncertain=false){
    const code=error instanceof AppError?error.code:'REMOTE_READ_FAILED',status=authorizationCodes.has(code)?'reauthorization_required':code==='REMOTE_RESULT_UNPROVEN'?'changed':'unavailable';
    this.store.transaction(()=>{const current=this.row(context.delivery.id);if(current.external.generation!==context.external.generation||current.delivery.state!==context.delivery.state)return;this.observe(context,status,code,trace);this.store.run('UPDATE external_metrics SET error_code=? WHERE delivery_id=?',code,context.delivery.id);if(makeUncertain&&['awaiting_external','uncertain'].includes(current.delivery.state))this.distribution.event(context.delivery.id,'uncertain',trace,code);});
  }
  async register(actor:Actor,id:string,input:Record<string,unknown>,trace:string){
    this.allowedInput(input,['remoteId','idempotencyKey']);assertCommandRequest(actor,'POST',`/api/service/external-publications/${id}/register`);
    const context=await this.context(actor,id),remoteId=text(input.remoteId,'remoteId',30),key=text(input.idempotencyKey,'idempotencyKey',200);
    requireValue(/^[1-9][0-9]*$/.test(remoteId)&&Number.isSafeInteger(Number(remoteId)),400,'INVALID_INPUT','DEV remoteId must be a positive integer');
    const fingerprint=digest(JSON.stringify({id,remoteId}));
    this.store.transaction(()=>{this.idempotency(actor,'external.register',key,fingerprint,id);});
    requireValue(receiptStates.includes(context.delivery.state),409,'EXTERNAL_INTENT_STATE','This external intent cannot register a new result');
    requireValue(!context.delivery.remote_id||context.delivery.remote_id===remoteId,409,'REMOTE_ID_CONFLICT','Intent already identifies a different remote copy');
    if(context.delivery.state==='published')return this.view(id);
    try{
      this.assertSource(context);const {result}=await this.verify(actor,context,remoteId);requireValue(result,409,'REMOTE_RESULT_UNPROVEN','DEV content, author, account, source, canonical URL or public state differs from the frozen payload');
      this.store.transaction(()=>{const current=this.unchanged(context,remoteId);if(current.delivery.state==='published')return;this.assertSource(context);this.record(actor,context,result,trace);this.store.audit(actor.subject,context.delivery.owner_id,'external.register',id,trace,{remoteId});});return this.view(id);
    }catch(error){this.failure(context,error,trace,true);throw error;}
  }
  async reconcile(actor:Actor,id:string,trace:string){
    assertCommandRequest(actor,'POST',`/api/service/external-publications/${id}/reconcile`);const context=await this.context(actor,id);
    requireValue(['awaiting_external','uncertain','cancelled'].includes(context.delivery.state),409,'EXTERNAL_INTENT_STATE','Only an unresolved or cancelled external intent needs receipt reconciliation');
    try{
      const {result}=await this.verify(actor,context);
      this.store.transaction(()=>{this.unchanged(context);if(result){if(context.delivery.state!=='cancelled')this.assertSource(context);this.record(actor,context,result,trace);}else{this.observe(context,'unavailable','REMOTE_RESULT_UNPROVEN',trace);if(context.delivery.state!=='cancelled')this.distribution.event(id,'uncertain',trace,'REMOTE_RESULT_UNPROVEN');}});return this.view(id);
    }catch(error){this.failure(context,error,trace,true);throw error;}
  }
  async sync(actor:Actor,id:string,trace:string){
    assertCommandRequest(actor,'POST',`/api/service/external-publications/${id}/sync`);const context=await this.context(actor,id);
    requireValue(context.delivery.remote_id&&['published','cancelled','superseded'].includes(context.delivery.state),409,'EXTERNAL_INTENT_STATE','Only a known external copy supports synchronization');
    await this.syncContext(actor,context,trace);
    // The observation may record a revoked read attempt, but that must not
    // grant the caller continued access to the frozen publication payload.
    await this.context(actor,id);
    return this.view(id);
  }
  private async syncContext(actor:Actor,context:ExternalContext,trace:string){
    try{
      const {result,connection}=await this.verify(actor,context);requireValue(result,409,'REMOTE_RESULT_UNPROVEN','Remote copy changed from the last verified frozen content');
      let metrics:Awaited<ReturnType<NonNullable<Target['metrics']>>>|undefined,metricsCode:string|null=null;
      const target=this.target(context);
      if(target.metrics){try{await this.policy.scope(actor,'metrics:read');metrics=await target.metrics({...context.payload,remoteId:result.remoteId},connection,this.send(actor,context,connection));}catch(error){metricsCode=error instanceof AppError?error.code:'METRICS_UNAVAILABLE';}}
      await this.policy.publish(actor,context.delivery.owner_id,'access');await this.connection(actor,context);await this.policy.publish(actor,context.delivery.owner_id,'access');
      this.store.transaction(()=>{
        this.unchanged(context);this.record(actor,context,result,trace,false);
        if(metrics)this.store.run('INSERT INTO external_metrics VALUES (?,?,?,?,?,?,?) ON CONFLICT(delivery_id) DO UPDATE SET views=excluded.views,reactions=excluded.reactions,comments=excluded.comments,source=excluded.source,updated_at=excluded.updated_at,error_code=NULL',context.delivery.id,metrics.views,metrics.reactions,metrics.comments,metrics.source,new Date().toISOString(),null);
        else if(metricsCode){this.store.run('INSERT INTO external_metrics VALUES (?,?,?,?,?,?,?) ON CONFLICT(delivery_id) DO UPDATE SET error_code=excluded.error_code',context.delivery.id,null,null,null,'DEV authorized article API',new Date().toISOString(),metricsCode);this.store.run('UPDATE external_publications SET sync_status=?,sync_error_code=?,next_sync_at=? WHERE delivery_id=?',authorizationCodes.has(metricsCode)?'reauthorization_required':'unavailable',metricsCode,this.nextSync(Date.now(),authorizationCodes.has(metricsCode)),context.delivery.id);}
      });
    }catch(error){this.failure(context,error,trace);}
    return this.view(context.delivery.id);
  }
  async syncDue(limit=20){
    requireValue(Number.isSafeInteger(limit)&&limit>0&&limit<=100,400,'INVALID_INPUT','Sync batch must be between 1 and 100');
    const due=this.store.all("SELECT e.delivery_id,e.sync_actor_json FROM external_publications e JOIN deliveries d ON d.id=e.delivery_id WHERE d.state='published' AND d.remote_id IS NOT NULL AND e.next_sync_at<=? ORDER BY e.next_sync_at LIMIT ?",new Date().toISOString(),limit),results=[];
    for(const item of due){
      const saved=this.row(item.delivery_id),owner=this.store.get('SELECT * FROM owners WHERE id=?',saved.delivery.owner_id)!;
      const context:ExternalContext={...saved,owner:{kind:owner.kind,issuer:owner.issuer,subject:owner.subject}},trace=randomUUID();
      try{const actor=this.distribution.originals.vault.open<Actor>(item.sync_actor_json);await this.context(actor,item.delivery_id);results.push(await this.syncContext(actor,context,trace));}
      catch(error){this.failure(context,error,trace);results.push(this.view(item.delivery_id));}
    }return results;
  }
  async cancel(actor:Actor,id:string,trace:string){
    assertCommandRequest(actor,'POST',`/api/service/external-publications/${id}/cancel`);const context=await this.context(actor,id);
    this.store.transaction(()=>{this.unchanged(context);requireValue(['awaiting_external','uncertain','cancelled'].includes(context.delivery.state),409,'EXTERNAL_INTENT_STATE','A registered copy needs manual removal follow-up');if(context.delivery.state!=='cancelled'){this.distribution.event(id,'cancelled',trace,'EXTERNAL_REQUEST_MAY_HAVE_BEEN_SENT');this.store.run('UPDATE external_publications SET generation=generation+1 WHERE delivery_id=?',id);this.store.audit(actor.subject,context.delivery.owner_id,'external.cancel-local',id,trace,{remoteCancellationGuaranteed:false});}});return this.view(id);
  }
  async followUp(actor:Actor,id:string,input:Record<string,unknown>,trace:string){
    this.allowedInput(input,['action','note']);assertCommandRequest(actor,'POST',`/api/service/external-publications/${id}/follow-up`);const context=await this.context(actor,id);
    requireValue(['correction','removal','verify-removal'].includes(String(input.action)),400,'INVALID_INPUT','Choose correction, manual removal or read-only removal verification');requireValue(input.note===undefined||typeof input.note==='string'&&input.note.length<=2000,400,'INVALID_INPUT','Note must be at most 2000 characters');
    requireValue(context.delivery.remote_id,409,'REMOTE_ID_REQUIRED','Reconcile the remote identity before correction or removal');
    if(input.action==='verify-removal')return this.verifyRemoval(actor,context,trace);
    this.store.transaction(()=>{this.unchanged(context);this.store.run('UPDATE external_publications SET follow_up_state=?,generation=generation+1 WHERE delivery_id=?',`${input.action}_requested`,id);if(typeof input.note==='string'&&input.note.trim())this.store.run('INSERT INTO delivery_notes VALUES (?,?,?,?,?,?)',randomUUID(),id,input.note,actor.subject,trace,new Date().toISOString());this.store.audit(actor.subject,context.delivery.owner_id,'external.follow-up',id,trace,{action:input.action,remoteWrite:false});});return this.view(id);
  }
  private async verifyRemoval(actor:Actor,context:ExternalContext,trace:string){
    requireValue(context.external.follow_up_state==='removal_requested',409,'EXTERNAL_INTENT_STATE','First record a manual removal request for the known remote copy');
    const connection=await this.connection(actor,context),target=this.target(context);
    let gone=false;
    try{await target.reconcileExternal!({...context.payload,remoteId:context.delivery.remote_id},connection,this.send(actor,context,connection));}
    catch(error){if(error instanceof AppError&&['REMOTE_NOT_FOUND','REMOTE_GONE'].includes(error.code))gone=true;else{this.failure(context,error,trace);throw error;}}
    requireValue(gone,409,'REMOVAL_UNVERIFIED','The known remote copy still exists; CMS does not delete it');
    await this.policy.publish(actor,context.delivery.owner_id,'access');await this.connection(actor,context);await this.policy.publish(actor,context.delivery.owner_id,'access');
    this.store.transaction(()=>{
      this.unchanged(context);this.observe(context,'removed',null,trace);this.store.run("UPDATE external_publications SET follow_up_state='removed' WHERE delivery_id=?",context.delivery.id);
      for(const previous of this.store.all("SELECT d.id FROM deliveries d JOIN external_publications e ON e.delivery_id=d.id WHERE d.owner_id=? AND d.connection_id=? AND d.target=? AND d.remote_id=? AND d.id<>? AND d.state IN ('published','superseded')",context.delivery.owner_id,context.delivery.connection_id,context.delivery.target,context.delivery.remote_id,context.delivery.id)){const saved=this.row(previous.id);this.observe({...saved,owner:context.owner},'removed',null,trace);this.store.run("UPDATE external_publications SET follow_up_state='removed' WHERE delivery_id=?",previous.id);this.distribution.event(previous.id,'removed',trace);}
      this.distribution.settleCopy(context.delivery,context.delivery.remote_id,'removed',trace);this.distribution.event(context.delivery.id,'removed',trace);
      this.store.audit(actor.subject,context.delivery.owner_id,'external.removal-verified',context.delivery.id,trace,{remoteId:context.delivery.remote_id,remoteWrite:false});
    });return this.view(context.delivery.id);
  }

}
