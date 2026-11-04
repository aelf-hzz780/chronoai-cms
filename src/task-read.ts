import {AppError, requireValue, text} from './errors.ts';
import {digest} from './content.ts';
import type {Actor} from './policy.ts';
import type {Row} from './store.ts';
import {WorkspaceReadService, type WorkspaceAccess} from './workspace-read.ts';
import {MediaService} from './media.ts';

export type TaskKind='release'|'delivery'|'media'|'projection'|'plan';
export interface TaskQuery {kind?:string;state?:string;language?:string;articleId?:string;limit?:string;offset?:string;}
const kinds:TaskKind[]=['release','delivery','media','projection','plan'];
interface TaskSnapshot {revisionId:string;title:string;markdown:string;creditedAuthor:string;digest:string;}

/** Reads confirmed task context independently from the article's current draft. */
export class TaskReadService {
  workspaces:WorkspaceReadService;media:MediaService;
  constructor(workspaces:WorkspaceReadService,media:MediaService){this.workspaces=workspaces;this.media=media;}
  private relation(){return `WITH audit_times AS (
    SELECT resource_id,min(created_at) AS first_at,max(created_at) AS last_at FROM audit WHERE owner_id=:owner GROUP BY resource_id
  ), public_releases AS (
    SELECT r.*,row_number() OVER (PARTITION BY r.article_id ORDER BY r.created_at DESC,r.rowid DESC) AS ranking
    FROM releases r WHERE r.owner_id=:owner AND r.state IN ('published','superseded') AND r.action IN ('publish','update')
  ), public_revisions AS (
    SELECT DISTINCT article_id,revision_id FROM public_releases
  ), pending_media AS (
    SELECT release_id FROM release_media_requests WHERE state IN ('queued','running') GROUP BY release_id
  ), tasks AS (
    SELECT r.id,'release' AS kind,r.owner_id,r.article_id,a.language,a.creator,v.title,r.revision_id,r.action,r.state,
      r.created_at,r.updated_at,r.trace_id,r.error_code,r.url,r.remote_id,NULL AS connection_id,NULL AS target,r.id AS release_id,
      NULL AS confirmation_digest,j.state AS job_state,CASE WHEN m.release_id IS NOT NULL THEN 1 ELSE 0 END AS media_pending
    FROM releases r JOIN articles a ON a.id=r.article_id AND a.owner_id=r.owner_id JOIN revisions v ON v.id=r.revision_id AND v.article_id=a.id
      LEFT JOIN jobs j ON j.kind='release' AND j.resource_id=r.id LEFT JOIN pending_media m ON m.release_id=r.id WHERE a.owner_id=:owner
    UNION ALL
    SELECT d.id,'delivery',d.owner_id,r.article_id,a.language,a.creator,
      CASE WHEN json_valid(payload.payload_json) AND json_type(payload.payload_json,'$.title')='text' THEN json_extract(payload.payload_json,'$.title') ELSE v.title END,
      r.revision_id,d.action,d.state,d.created_at,d.updated_at,d.trace_id,d.error_code,d.url,d.remote_id,d.connection_id,d.target,r.id,d.digest,j.state,0
    FROM deliveries d JOIN releases r ON r.id=d.release_id AND r.owner_id=d.owner_id JOIN articles a ON a.id=r.article_id AND a.owner_id=d.owner_id
      JOIN revisions v ON v.id=r.revision_id AND v.article_id=a.id LEFT JOIN delivery_payloads payload ON payload.delivery_id=d.id
      LEFT JOIN jobs j ON j.kind='delivery' AND j.resource_id=d.id WHERE a.owner_id=:owner
    UNION ALL
    SELECT m.id,'media',r.owner_id,r.article_id,a.language,a.creator,v.title,m.revision_id,'materialize-media',m.state,
      m.created_at,m.updated_at,m.trace_id,m.error_code,r.url,r.remote_id,NULL,NULL,r.id,NULL,j.state,0
    FROM release_media_requests m JOIN releases r ON r.id=m.release_id JOIN articles a ON a.id=r.article_id AND a.owner_id=r.owner_id
      JOIN revisions v ON v.id=m.revision_id AND v.article_id=a.id LEFT JOIN jobs j ON j.kind='release' AND j.resource_id=r.id WHERE a.owner_id=:owner
    UNION ALL
    SELECT p.id,'projection',p.owner_id,p.article_id,a.language,a.creator,coalesce(v.title,'Translation link projection'),NULL,'sync-links',p.state,
      coalesce(j.created_at,events.first_at,a.created_at),coalesce(events.last_at,j.created_at,a.created_at),p.trace_id,p.error_code,NULL,NULL,NULL,NULL,NULL,NULL,j.state,0
    FROM projections p JOIN articles a ON a.id=p.article_id AND a.owner_id=p.owner_id LEFT JOIN jobs j ON j.kind='projection' AND j.resource_id=p.id
      LEFT JOIN audit_times events ON events.resource_id=p.id LEFT JOIN public_releases live ON live.article_id=a.id AND live.ranking=1
      LEFT JOIN revisions v ON v.id=live.revision_id WHERE a.owner_id=:owner
    UNION ALL
    SELECT p.id,'plan',p.owner_id,r.article_id,a.language,a.creator,v.title,p.revision_id,p.action,
      CASE WHEN p.state='scheduled' AND p.not_before_at<=:now THEN 'due' ELSE p.state END,p.created_at,p.updated_at,p.trace_id,NULL,NULL,NULL,p.connection_id,p.target,p.release_id,NULL,NULL,0
    FROM distribution_plans p JOIN releases r ON r.id=p.release_id AND r.owner_id=p.owner_id JOIN articles a ON a.id=r.article_id AND a.owner_id=p.owner_id
      JOIN revisions v ON v.id=p.revision_id AND v.article_id=a.id WHERE a.owner_id=:owner
  ), classified AS (
    SELECT t.*,p.not_before_at AS plan_not_before,p.copy_id AS plan_copy_id,p.delivery_id AS plan_delivery_id,p.format AS plan_format,CASE WHEN json_valid(delivery_payload.payload_json) THEN json_extract(delivery_payload.payload_json,'$.executionApproval') END AS execution_approval,CASE WHEN t.creator=:subject OR :publisher=1 OR public.revision_id IS NOT NULL THEN 1 ELSE 0 END AS readable
    FROM tasks t LEFT JOIN public_revisions public ON public.article_id=t.article_id AND public.revision_id=t.revision_id
      LEFT JOIN distribution_plans p ON t.kind='plan' AND p.id=t.id
      LEFT JOIN delivery_payloads delivery_payload ON t.kind='delivery' AND delivery_payload.delivery_id=t.id
  )`;}
  private params(actor:Actor,access:WorkspaceAccess){return {owner:access.owner.id as string,subject:actor.subject,publisher:access.publishingRole?1:0,now:new Date().toISOString()};}
  private allowedActions(actor:Actor,access:WorkspaceAccess,row:Row){
    if(!this.workspaces.capabilities(actor,access).canPublish)return [];
    const actions:string[]=[];
    if(row.kind==='release'){
      if(row.state==='queued'&&row.job_state==='queued')actions.push('cancel');
      if(['uncertain','verifying'].includes(row.state)&&row.job_state&&row.job_state!=='running'){
        actions.push('reconcile');
        if(row.action!=='unpublish'&&row.remote_id&&row.url&&!row.media_pending)actions.push('materialize-media');
      }
    }else if(row.kind==='delivery'){
      if(['queued','approval_needed','manual_action_needed'].includes(row.state)&&row.job_state!=='running')actions.push('cancel');
      if(row.state==='uncertain'&&row.job_state&&row.job_state!=='running')actions.push('reconcile');
      if(row.state==='approval_needed'&&(access.owner.kind==='organization'||row.execution_approval==='exact'))actions.push('request-approval','authorize');
    }else if(row.kind==='plan'){
      if(['scheduled','due'].includes(row.state))actions.push('cancel');if(row.state==='due')actions.push('confirm');
    }
    return actions;
  }
  private item(actor:Actor,access:WorkspaceAccess,row:Row){
    return {id:row.id,kind:row.kind,ownerId:row.owner_id,articleId:row.article_id,language:row.language,title:row.title,revisionId:row.revision_id??null,action:row.action,state:row.state,createdAt:row.created_at,updatedAt:row.updated_at,traceId:row.trace_id,errorCode:row.error_code??null,url:row.url??null,allowedActions:this.allowedActions(actor,access,row),...(row.kind==='plan'?{plan:{notBeforeAt:row.plan_not_before,releaseId:row.release_id,target:row.target,connectionId:this.workspaces.capabilities(actor,access).canReadConnections?row.connection_id:null,action:row.action,format:row.plan_format,copyId:row.plan_copy_id??null,consumedDeliveryId:row.plan_delivery_id??null}}:{})};
  }
  async list(actor:Actor,ownerId:string,query:TaskQuery){
    const {kind,language}=query,limit=Number(query.limit??50),offset=Number(query.offset??0);
    requireValue(kind===undefined||kinds.includes(kind as TaskKind),400,'INVALID_INPUT','Invalid task kind');
    requireValue(language===undefined||language==='en'||language==='zh',400,'INVALID_INPUT','language must be en or zh');
    const state=query.state===undefined?'':text(query.state,'state',100),articleId=query.articleId===undefined?'':text(query.articleId,'articleId');
    requireValue(Number.isSafeInteger(limit)&&limit>0&&limit<=100&&Number.isSafeInteger(offset)&&offset>=0,400,'INVALID_INPUT','Invalid pagination');
    const access=await this.workspaces.authorize(actor,ownerId),store=this.workspaces.policy.store;
    const params={...this.params(actor,access),kind:kind??'',state,language:language??'',article:articleId};
    const filter="WHERE readable=1 AND (:kind='' OR kind=:kind) AND (:state='' OR state=:state) AND (:language='' OR language=:language) AND (:article='' OR article_id=:article)";
    const total=store.db.prepare(`${this.relation()} SELECT count(*) AS total FROM classified ${filter}`).get(params) as Row;
    const rows=store.db.prepare(`${this.relation()} SELECT * FROM classified ${filter} ORDER BY created_at DESC,kind,id DESC LIMIT :limit OFFSET :offset`).all({...params,limit,offset}) as Row[];
    return {items:rows.map(row=>this.item(actor,access,row)),total:Number(total.total),limit,offset};
  }
  private async context(actor:Actor,ownerId:string,kind:string,id:string){
    requireValue(kinds.includes(kind as TaskKind),400,'INVALID_INPUT','Invalid task kind');text(id,'taskId');
    const access=await this.workspaces.authorize(actor,ownerId),store=this.workspaces.policy.store;
    const row=store.db.prepare(`${this.relation()} SELECT * FROM classified WHERE kind=:kind AND id=:id`).get({...this.params(actor,access),kind,id}) as Row|undefined;
    requireValue(row,404,'NOT_FOUND','Task not found');requireValue(row.readable===1,403,'FORBIDDEN','Confirmed revision access denied');
    return {access,row};
  }
  private snapshot(row:Row):TaskSnapshot|null{
    if(row.kind==='projection')return null;
    const store=this.workspaces.policy.store;
    if(row.kind==='delivery'||row.kind==='plan'){
      const saved=row.kind==='delivery'?store.get('SELECT payload_json FROM delivery_payloads WHERE delivery_id=?',row.id):store.get('SELECT payload_json FROM distribution_plans WHERE id=?',row.id);
      let payload:Row;try{payload=JSON.parse(saved?.payload_json);}catch{throw new AppError(503,'TASK_SNAPSHOT_UNAVAILABLE','Confirmed task content is unavailable');}
      requireValue(payload&&typeof payload.title==='string'&&typeof payload.markdown==='string'&&typeof payload.creditedAuthor==='string',503,'TASK_SNAPSHOT_UNAVAILABLE','Confirmed task content is unavailable');
      return {revisionId:row.revision_id,title:payload.title,markdown:payload.markdown,creditedAuthor:payload.creditedAuthor,digest:digest(payload.markdown)};
    }
    const revision=store.get('SELECT title,markdown,credited_author,digest FROM revisions WHERE id=? AND article_id=?',row.revision_id,row.article_id);
    requireValue(revision,503,'TASK_SNAPSHOT_UNAVAILABLE','Confirmed task content is unavailable');
    return {revisionId:row.revision_id,title:revision.title,markdown:Buffer.from(revision.markdown).toString('utf8'),creditedAuthor:revision.credited_author,digest:revision.digest};
  }
  private payloadVisible(access:WorkspaceAccess,row:Row){
    if(!['delivery','plan'].includes(row.kind)||access.owner.kind==='personal'||access.publishingRole)return true;
    if(row.kind==='plan')return false;
    // A public source does not prove an arbitrary confirmed excerpt was public.
    return row.state==='published'||!!this.workspaces.policy.store.get("SELECT 1 FROM delivery_events WHERE delivery_id=? AND state='published' AND code IS NULL LIMIT 1",row.id);
  }
  private history(row:Row){
    const store=this.workspaces.policy.store;
    if(row.kind==='delivery')return store.all('SELECT state,code,trace_id,created_at FROM delivery_events WHERE delivery_id=? ORDER BY created_at,rowid',row.id).map(event=>({state:event.state,code:event.code??null,traceId:event.trace_id,createdAt:event.created_at}));
    if(row.kind==='media')return [{state:row.state,code:row.error_code??null,traceId:row.trace_id,createdAt:row.updated_at}];
    const prefix=row.kind==='plan'?'distribution-plan.':row.kind==='projection'?'alternates.':'original.';
    const events=store.all('SELECT action,trace_id,created_at,detail_json FROM audit WHERE owner_id=? AND resource_id=? AND action LIKE ? ORDER BY created_at,rowid',row.owner_id,row.kind==='media'?row.release_id:row.id,`${prefix}%`);
    return events.map(event=>{
      let code:null|string=null;try{const details=JSON.parse(event.detail_json);if(typeof details?.code==='string'&&details.code.length<=200)code=details.code;}catch{/* An invalid legacy detail never exposes unstructured data. */}
      const action=event.action.slice(prefix.length),state=row.kind==='plan'?(action==='create'?'scheduled':action==='confirm'?'confirmed':action==='cancel'?'cancelled':action):action.startsWith('confirm.')||action==='request'?'queued':action==='cancel'?'cancelled':action;
      return {state,code,traceId:event.trace_id,createdAt:event.created_at};
    });
  }
  private mediaHistory(row:Row){
    return this.workspaces.policy.store.all('SELECT id,state,public_files,error_code,trace_id,created_at,updated_at FROM release_media_requests WHERE release_id=? ORDER BY created_at,rowid',row.release_id).map(media=>({id:media.id,state:media.state,publicFiles:media.public_files,errorCode:media.error_code??null,traceId:media.trace_id,createdAt:media.created_at,updatedAt:media.updated_at}));
  }
  private distributionContext(row:Row,canReadConnections:boolean){
    if(row.kind!=='delivery'&&row.kind!=='plan')return null;
    const store=this.workspaces.policy.store,saved=row.kind==='delivery'?store.get('SELECT payload_json FROM delivery_payloads WHERE delivery_id=?',row.id):store.get('SELECT payload_json FROM distribution_plans WHERE id=?',row.id);
    let payload:Row;try{payload=JSON.parse(saved?.payload_json);}catch{throw new AppError(503,'TASK_SNAPSHOT_UNAVAILABLE','Confirmed distribution context is unavailable');}
    requireValue(payload&&['full','excerpt'].includes(payload.format)&&(payload.sourceUrl===null||typeof payload.sourceUrl==='string')&&typeof payload.sourceDigest==='string',503,'TASK_SNAPSHOT_UNAVAILABLE','Confirmed distribution context is unavailable');
    return {releaseId:row.release_id,target:row.target,connectionId:canReadConnections?row.connection_id:null,accountId:canReadConnections&&typeof payload.accountId==='string'?payload.accountId:null,format:payload.format,sourceUrl:payload.sourceUrl,sourceDigest:payload.sourceDigest};
  }
  async detail(actor:Actor,ownerId:string,kind:string,id:string){
    const {access,row}=await this.context(actor,ownerId,kind,id),capabilities=this.workspaces.capabilities(actor,access),payloadVisible=this.payloadVisible(access,row);
    const privateRead=access.owner.kind==='personal'||access.publishingRole,store=this.workspaces.policy.store;
    const notes=privateRead&&row.kind==='delivery'?store.all('SELECT id,note,actor,trace_id,created_at FROM delivery_notes WHERE delivery_id=? ORDER BY created_at,rowid',id).map(note=>({id:note.id,note:note.note,actor:note.actor,traceId:note.trace_id,createdAt:note.created_at})):[];
    const observations=privateRead&&row.kind==='delivery'?store.all('SELECT id,url,proof,source_state,actor,trace_id,observed_at FROM delivery_observations WHERE delivery_id=? ORDER BY observed_at,rowid',id).map(observation=>({id:observation.id,url:observation.url,status:'verified',proof:observation.proof,sourceState:observation.source_state,followUpRequired:true,actor:observation.actor,traceId:observation.trace_id,observedAt:observation.observed_at})):[];
    return {...this.item(actor,access,row),snapshot:payloadVisible?this.snapshot(row):null,distribution:payloadVisible?this.distributionContext(row,capabilities.canReadConnections):null,confirmationDigest:payloadVisible?row.confirmation_digest??null:null,history:this.history(row),notes,observations,copy:row.kind==='delivery'?{target:row.target,connectionId:capabilities.canReadConnections?row.connection_id:null,remoteId:row.remote_id??null,url:row.url??null}:null,...(['release','media'].includes(row.kind)?{mediaHistory:this.mediaHistory(row)}:{})};
  }
  async asset(actor:Actor,ownerId:string,kind:string,id:string,assetId:string){
    const {access,row}=await this.context(actor,ownerId,kind,id);
    requireValue(this.payloadVisible(access,row),403,'FORBIDDEN','Confirmed task content is not currently visible');
    const snapshot=this.snapshot(row);
    requireValue(snapshot,403,'FORBIDDEN','This task has no frozen content');
    return this.media.fromAuthorizedSnapshot({ownerId:row.owner_id,articleId:row.article_id,markdown:snapshot.markdown},assetId);
  }
}
