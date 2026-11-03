import { randomUUID } from 'node:crypto';
import { ContentService, digest } from './content.ts';
import type { Actor } from './policy.ts';
import { Vault } from './vault.ts';
import { AppError, requireValue, text } from './errors.ts';
import { RemoteError } from './http-client.ts';
import { Queue, type Lease } from './queue.ts';
import {assertCommandRequest,bindActorCommand,assertCommandBinding,deriveCommand,releaseCommand,projectionCommand} from './command-authority.ts';

export interface OriginalInput {
  releaseId: string; articleId: string; revisionId: string; ownerId: string; language: string;
  title: string; markdown: string; digest: string; creditedAuthor: string;
  site: Record<string, any>; remoteId?: string; url?: string; action: string;
  guard?: () => void; beforeWrite?: () => Promise<void>;
  beforeMaterialize?:()=>Promise<void>;onMaterialized?:(assetId:string)=>void;
  beforeRecordMedia?:()=>Promise<void>;
}
export interface OriginalResult { remoteId: string; url: string; }
export interface OriginalAdapter {
  publish(input: OriginalInput): Promise<OriginalResult>;
  verify(input: OriginalInput, result: OriginalResult): Promise<boolean>;
  reconcile(input: OriginalInput): Promise<OriginalResult | null>;
  unpublish(input: OriginalInput): Promise<void>;
  materialize?(input:OriginalInput,result:OriginalResult):Promise<boolean>;
  recordVerifiedMedia?(input:OriginalInput):Promise<boolean>;
}
const mediaFingerprint=(row:Record<string,any>)=>digest(JSON.stringify([row.id,row.article_id,row.revision_id,row.owner_id,row.action,row.remote_id,row.url]));
const mediaCommand=(request:Record<string,any>,row:Record<string,any>)=>({kind:'release-media',resourceId:request.id,digest:mediaFingerprint(row)});
export class PublishingService {
  content: ContentService; vault: Vault;
  constructor(content: ContentService, vault: Vault) { this.content = content; this.vault = vault; }
  async confirm(actor: Actor, articleId: string, input: Record<string, unknown>, trace: string) {
    const article = this.content.article(articleId); await this.content.policy.publish(actor, article.owner_id);
    assertCommandRequest(actor,'POST',`/api/service/articles/${articleId}/releases`);
    requireValue(input.ownerId === article.owner_id, 403, 'FORBIDDEN', 'Confirmed owner must match the article');
    const key = text(input.idempotencyKey, 'idempotencyKey', 200), actorKey = `${actor.issuer}|${actor.subject}`;
    const revisionId = text(input.revisionId, 'revisionId');
    const fingerprint = digest(JSON.stringify({ articleId, revisionId, owner: input.ownerId, author: input.creditedAuthor, action: input.action, rights: input.rightsConfirmed }));
    const previous = this.content.store.get('SELECT * FROM idempotency WHERE actor=? AND operation=? AND key=?', actorKey, 'original', key);
    if (previous) { requireValue(previous.digest === fingerprint, 409, 'CONFLICT', 'Idempotency key already used for different content'); const row=this.content.store.get('SELECT * FROM releases WHERE id=?', previous.resource_id)!;this.content.store.transaction(()=>bindActorCommand(this.content.store,actor,releaseCommand(row)));return this.safe(row); }
    const revision = await this.content.visibleRevision(actor, article, revisionId);
    requireValue(input.creditedAuthor === revision.credited_author && input.rightsConfirmed === true, 400, 'CONFIRMATION_REQUIRED', 'Confirm exact credited author and text/image publication rights');
    requireValue(['publish', 'update', 'unpublish'].includes(String(input.action)), 400, 'INVALID_INPUT', 'Invalid publication action');
    const site = this.content.store.get('SELECT * FROM sites WHERE owner_id=? AND language=?', article.owner_id, article.language);
    requireValue(site, 409, 'SITE_REQUIRED', 'Operator must configure this owner and language site');
    const live = this.content.store.get("SELECT * FROM releases WHERE article_id=? AND state='published' ORDER BY rowid DESC LIMIT 1", articleId);
    requireValue(input.action === 'publish' ? !live : live, 409, 'PUBLICATION_STATE', live ? 'Use update for an existing original' : 'No live original for this action');
    const id = randomUUID(), now = new Date().toISOString();
    this.content.store.transaction(() => {
      requireValue(!this.content.store.get("SELECT 1 FROM releases WHERE article_id=? AND state IN ('queued','publishing','verifying','uncertain')", articleId), 409, 'PENDING_RELEASE', 'Resolve the pending original before another release');
      const bound=bindActorCommand(this.content.store,actor,releaseCommand({id,article_id:articleId,revision_id:revisionId,owner_id:article.owner_id,action:input.action}));
      this.content.store.run('INSERT INTO releases VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', id, articleId, revisionId, article.owner_id, this.vault.seal(bound), input.action as string, 'queued', live?.remote_id ?? null, live?.url ?? null, null, trace, now, now);
      const translation=this.content.store.get('SELECT * FROM translations WHERE article_id=?',articleId);
      if(translation) this.content.store.run('INSERT INTO release_links VALUES (?,?,?)',id,translation.source_article,translation.source_revision);
      this.content.store.run('INSERT INTO jobs VALUES (?,?,?,?,?,?)', randomUUID(), 'release', id, 'queued', null, now);
      this.content.store.run('INSERT INTO idempotency VALUES (?,?,?,?,?)', actorKey, 'original', key, fingerprint, id);
      this.content.store.audit(actor.subject, article.owner_id, `original.confirm.${input.action}`, id, trace, { revisionId, digest: revision.digest, creditedAuthor: revision.credited_author, site: site.id, rightsConfirmed: true });
    });
    return this.safe(this.content.store.get('SELECT * FROM releases WHERE id=?', id)!);
  }
  safe(row: Record<string, any>): Record<string, any> {
    const { actor_json, ...safe } = row;
    return {...safe,media_history:this.content.store.all('SELECT id,state,public_files,error_code,trace_id,created_at,updated_at FROM release_media_requests WHERE release_id=? ORDER BY rowid',row.id)};
  }
  async materializeMedia(actor:Actor,id:string,input:Record<string,unknown>,trace:string) {
    const store=this.content.store,row=store.get('SELECT * FROM releases WHERE id=?',id);requireValue(row,404,'NOT_FOUND','Release not found');
    await this.content.policy.publish(actor,row.owner_id);assertCommandRequest(actor,'POST',`/api/service/releases/${id}/materialize-media`);
    requireValue(input.ownerId===row.owner_id,403,'FORBIDDEN','请选择原文所属的工作区。');
    requireValue(input.revisionId===row.revision_id&&input.rightsConfirmed===true,400,'CONFIRMATION_REQUIRED','请确认所选发布版本及文字、图片公开权利。');
    requireValue(row.action!=='unpublish'&&row.remote_id&&row.url,409,'REMOTE_ID_REQUIRED','请先只读复核，认回已存在的 Ghost 原文。');
    const key=text(input.idempotencyKey,'idempotencyKey',200),actorKey=`${actor.issuer}|${actor.subject}`,fingerprint=mediaFingerprint(row);
    const prior=store.get('SELECT * FROM idempotency WHERE actor=? AND operation=? AND key=?',actorKey,'release-media',key);
    if(prior){requireValue(prior.digest===fingerprint,409,'CONFLICT','Idempotency key belongs to another media confirmation');const request=store.get('SELECT * FROM release_media_requests WHERE id=?',prior.resource_id)!;store.transaction(()=>bindActorCommand(store,actor,mediaCommand(request,row)));return this.safeMedia(request);}
    requireValue(['uncertain','verifying'].includes(row.state),409,'PUBLICATION_STATE','仅可补齐已发送但尚未完成核验的原文图片。');
    new Queue(store).assertWritable();const requestId=randomUUID(),now=new Date().toISOString();
    store.transaction(()=>{
      const current=store.get('SELECT * FROM releases WHERE id=?',id)!;
      requireValue(['uncertain','verifying'].includes(current.state)&&mediaFingerprint(current)===fingerprint,409,'PUBLICATION_STATE','原文状态或确认版本已变化，请刷新后重试。');
      requireValue(!store.get("SELECT 1 FROM release_media_requests WHERE release_id=? AND state IN ('queued','running')",id),409,'IN_PROGRESS','已有公开图片补齐任务，请先刷新状态。');
      const changed=store.run("UPDATE jobs SET state='queued',lease_until=NULL WHERE kind='release' AND resource_id=? AND state<>'running'",id);
      requireValue(Number(changed.changes)===1,409,'IN_PROGRESS','当前 Worker 仍在处理此原文。');
      const bound=bindActorCommand(store,actor,{kind:'release-media',resourceId:requestId,digest:fingerprint});
      store.run('INSERT INTO release_media_requests VALUES (?,?,?,?,?,?,?,?,?,?,?)',requestId,id,row.revision_id,fingerprint,this.vault.seal(bound),trace,'queued',0,null,now,now);
      store.run('INSERT INTO idempotency VALUES (?,?,?,?,?)',actorKey,'release-media',key,fingerprint,requestId);
      store.audit(actor.subject,row.owner_id,'original.media.confirm',id,trace,{requestId,revisionId:row.revision_id,rightsConfirmed:true});
    });return this.safeMedia(store.get('SELECT * FROM release_media_requests WHERE id=?',requestId)!);
  }
  safeMedia(row:Record<string,any>){const {actor_json,...safe}=row;return safe;}
  input(row: Record<string, any>): OriginalInput {
    const article = this.content.article(row.article_id), revision = this.content.store.get('SELECT * FROM revisions WHERE id=?', row.revision_id)!;
    const site = this.content.store.get('SELECT * FROM sites WHERE owner_id=? AND language=?', row.owner_id, article.language);
    requireValue(site, 409, 'SITE_REQUIRED', 'Owner site unavailable');
    return { releaseId: row.id, articleId: article.id, revisionId: revision.id, ownerId: row.owner_id, language: article.language, title: revision.title, markdown: Buffer.from(revision.markdown).toString('utf8'), digest: revision.digest, creditedAuthor: revision.credited_author, site, action: row.action, remoteId: row.remote_id ?? undefined, url: row.url ?? undefined };
  }
  async list(actor: Actor, articleId: string) {
    await this.content.get(actor, articleId);
    return this.content.store.all('SELECT * FROM releases WHERE article_id=? ORDER BY rowid DESC LIMIT 100', articleId).map(r => this.safe(r));
  }
  async cancel(actor: Actor, id: string, trace: string) {
    const row = this.content.store.get('SELECT * FROM releases WHERE id=?', id); requireValue(row, 404, 'NOT_FOUND', 'Release not found');
    await this.content.policy.publish(actor, row.owner_id,'access');
    this.content.store.transaction(() => {
      const latest = this.content.store.get('SELECT * FROM releases WHERE id=?', id)!;
      requireValue(latest.state === 'queued' && this.content.store.get("SELECT 1 FROM jobs WHERE kind='release' AND resource_id=? AND state='queued'", id), 409, 'ALREADY_SENT', 'Request may already have been sent; reconcile and request removal');
      this.content.store.run("UPDATE releases SET state='cancelled',updated_at=? WHERE id=?", new Date().toISOString(), id);
      this.content.store.run("UPDATE jobs SET state='cancelled' WHERE kind='release' AND resource_id=?", id);
      this.content.store.audit(actor.subject, row.owner_id, 'original.cancel', id, trace);
    }); return { id, state: 'cancelled' };
  }
  async reconcile(actor: Actor, id: string, trace: string) {
    const row = this.content.store.get('SELECT * FROM releases WHERE id=?', id); requireValue(row, 404, 'NOT_FOUND', 'Release not found');
    await this.content.policy.publish(actor, row.owner_id,'access');
    requireValue(['uncertain', 'verifying'].includes(row.state), 409, 'PUBLICATION_STATE', 'Only uncertain or unverified originals require reconciliation');
    this.content.store.transaction(() => {
      const current = this.content.store.get('SELECT state FROM releases WHERE id=?', id)!;
      requireValue(['uncertain','verifying'].includes(current.state), 409, 'PUBLICATION_STATE', 'Original no longer requires recovery');
      const updated = this.content.store.run("UPDATE jobs SET state='queued',lease_until=NULL WHERE kind='release' AND resource_id=? AND state<>'running'", id);
      requireValue(Number(updated.changes) === 1, 409, 'IN_PROGRESS', 'Current worker still owns this operation');
      // The explicit read-only request supersedes pending media writes without
      // replacing their Actor, confirmation digest or count of public files.
      const media=this.content.store.run("UPDATE release_media_requests SET state=CASE WHEN public_files>0 THEN 'partial' ELSE 'blocked' END,error_code='READ_ONLY_RECONCILIATION_REQUESTED',updated_at=? WHERE release_id=? AND state IN ('queued','running')",new Date().toISOString(),id);
      this.content.store.run('INSERT INTO recovery_actors VALUES (?,?,?,?) ON CONFLICT(kind,resource_id) DO UPDATE SET actor_json=excluded.actor_json,trace_id=excluded.trace_id', 'release', id, this.vault.seal(actor), trace);
      this.content.store.audit(actor.subject, row.owner_id, 'original.reconcile.request', id, trace,{interruptedMediaRequests:Number(media.changes)});
    }); return { id, state: row.state };
  }
}
export class ReleaseWorker {
  service: PublishingService; adapter: OriginalAdapter; queue: Queue;
  constructor(service: PublishingService, adapter: OriginalAdapter) { this.service = service; this.adapter = adapter; this.queue = new Queue(service.content.store); }
  async once(): Promise<boolean> {
    const store = this.service.content.store;
    const lease = this.queue.claim('release', id => {
      store.run("UPDATE releases SET state='uncertain',error_code='WORKER_INTERRUPTED',updated_at=? WHERE id=?", new Date().toISOString(), id);
      store.run("UPDATE release_media_requests SET state=CASE WHEN public_files>0 THEN 'partial' ELSE 'blocked' END,error_code='WORKER_INTERRUPTED',updated_at=? WHERE release_id=? AND state='running'",new Date().toISOString(),id);
    });
    if (!lease) return false;
    const row = store.get('SELECT * FROM releases WHERE id=?', lease.resourceId)!;
    const recovering = ['uncertain','verifying'].includes(row.state);
    let state = 'failed', code: string | null = null, acknowledged = false;
    try {
      const media=recovering?store.get("SELECT * FROM release_media_requests WHERE release_id=? AND state='queued' ORDER BY rowid DESC LIMIT 1",row.id):undefined;
      const recovery = recovering&&!media ? store.get("SELECT * FROM recovery_actors WHERE kind='release' AND resource_id=?", row.id) : undefined;
      const actor = this.service.vault.open<Actor>(media?.actor_json??recovery?.actor_json ?? row.actor_json);
      if(!recovering)assertCommandBinding(store,actor,releaseCommand(row));
      // Recovery uses current caller authority to inspect the saved result.
      // Original confirmation remains audit evidence; beforeWrite forbids resend.
      const purpose=recovering&&!media?'access':'queued-write';
      await this.service.content.policy.publish(actor, row.owner_id,purpose);
      const input = this.service.input(row);
      const materializationContext=()=>{
        const current=this.service.input(store.get('SELECT * FROM releases WHERE id=?',row.id)!);
        return JSON.stringify([current.site,current.digest,current.creditedAuthor,store.get('SELECT ghost_author_id FROM author_mappings WHERE site_id=? AND credited_author=?',current.site.id,current.creditedAuthor)]);
      };
      const expectedContext=materializationContext();
      let expectedMediaFingerprint=mediaFingerprint(row);
      input.guard = () => this.queue.guard(lease);
      input.beforeWrite = async () => {
        requireValue(!recovering, 409, 'RECOVERY_READ_ONLY', 'Recovery may inspect existing results but cannot resend');
        assertCommandBinding(store,actor,releaseCommand(store.get('SELECT * FROM releases WHERE id=?',row.id)!));
        await this.service.content.policy.publish(actor, row.owner_id); this.queue.guard(lease);this.queue.assertWritable();
      };
      input.beforeMaterialize=async()=>{
        requireValue(!recovering||media,409,'RECOVERY_READ_ONLY','只读复核不会公开新图片；请另行确认“补齐公开图片”。');
        const current=store.get('SELECT * FROM releases WHERE id=?',row.id)!;
        if(media){requireValue(media.confirmation_digest===mediaFingerprint(current)&&['uncertain','verifying'].includes(current.state),409,'PUBLICATION_STATE','Media confirmation changed');assertCommandBinding(store,actor,mediaCommand(media,current));}
        else assertCommandBinding(store,actor,releaseCommand(current));
        await this.service.content.policy.publish(actor,row.owner_id);
        this.queue.guard(lease);this.queue.assertWritable();
        const final=store.get('SELECT * FROM releases WHERE id=?',row.id)!;
        requireValue(mediaFingerprint(final)===expectedMediaFingerprint&&materializationContext()===expectedContext&&(media?['uncertain','verifying'].includes(final.state):final.state==='publishing'),409,'PUBLICATION_STATE','Original mapping, state or version changed before exposing media');
      };
      input.beforeRecordMedia=async()=>{await this.service.content.policy.publish(actor,row.owner_id,purpose);this.queue.guard(lease);requireValue(materializationContext()===expectedContext,409,'PUBLICATION_STATE','Original media mapping changed');};
      input.onMaterialized=assetId=>store.transaction(()=>{
        if(media)store.run('UPDATE release_media_requests SET public_files=public_files+1,updated_at=? WHERE id=?',new Date().toISOString(),media.id);
        store.audit(actor.subject,row.owner_id,'asset.public-materialized',row.id,media?.trace_id??row.trace_id,{assetId,requestId:media?.id??null});
      });
      const verified=async(result:OriginalResult)=>{
        if(!await this.adapter.verify(input,result))return false;
        await this.service.content.policy.publish(actor,row.owner_id,purpose);this.queue.guard(lease);
        return !this.adapter.recordVerifiedMedia||await this.adapter.recordVerifiedMedia(input);
      };
      if (recovering) {
        const result = await this.adapter.reconcile(input);
        if(media){
          requireValue(media.confirmation_digest===mediaFingerprint(row),409,'PUBLICATION_STATE','Media confirmation changed');
          requireValue(this.adapter.materialize&&result,409,'MATERIALIZATION_UNAVAILABLE','公开原文尚不能精确认回，请先只读复核。');
          requireValue(result.remoteId===row.remote_id&&result.url===row.url,409,'REMOTE_CONFLICT','已认回的 Ghost 原文与图片确认不一致。');
          if(!this.queue.mutate(lease,()=>store.run("UPDATE release_media_requests SET state='running' WHERE id=?",media.id)))return true;
          if(await this.adapter.materialize(input,result)&&await verified(result)){this.complete(row,result,lease,false,media.id);return true;}
          state=row.state;code='ORIGINAL_NOT_VERIFIED';
        }else{
          if(result&&!this.queue.mutate(lease,()=>store.run('UPDATE releases SET remote_id=?,url=? WHERE id=?',result.remoteId,result.url,row.id)))return true;
          if (result && await verified(result)) { this.complete(row, result, lease,false); return true; }
          state = 'uncertain'; code = 'REMOTE_RESULT_UNPROVEN';
        }
      } else {
        if (!this.queue.mutate(lease, () => store.run("UPDATE releases SET state='publishing',updated_at=? WHERE id=?", new Date().toISOString(), row.id))) return true;
        if (row.action === 'unpublish') {
          await this.adapter.unpublish(input);
          acknowledged = true;
          if (await verified({ remoteId: row.remote_id, url: row.url })) { this.complete(row, { remoteId: row.remote_id, url: row.url }, lease); return true; }
          state = 'verifying'; code = 'UNPUBLISH_NOT_VERIFIED';
        } else {
          const result = await this.adapter.publish(input); acknowledged = true;
          if (!this.queue.mutate(lease, () => store.run('UPDATE releases SET remote_id=?,url=? WHERE id=?', result.remoteId, result.url, row.id))) return true;
          expectedMediaFingerprint=mediaFingerprint({...row,remote_id:result.remoteId,url:result.url});
          if ((!this.adapter.materialize||await this.adapter.materialize(input,result))&&await verified(result)) { this.complete(row, result, lease); return true; }
          state = 'verifying'; code = 'ORIGINAL_NOT_VERIFIED';
        }
      }
    } catch (error) {
      code = error instanceof AppError ? error.code : 'INTERNAL';
      state = recovering ? row.state : acknowledged ? 'verifying' : error instanceof RemoteError && error.uncertain ? 'uncertain' : error instanceof AppError && [401, 403, 409, 503].includes(error.status) ? 'blocked' : 'failed';
    }
    this.queue.mutate(lease, () => {
      store.run('UPDATE releases SET state=?,error_code=?,updated_at=? WHERE id=?', state, code, new Date().toISOString(), row.id);
      const media=store.get("SELECT * FROM release_media_requests WHERE release_id=? AND state IN ('queued','running')",row.id);
      if(media)store.run('UPDATE release_media_requests SET state=?,error_code=?,updated_at=? WHERE id=?',media.public_files>0?'partial':'blocked',code,new Date().toISOString(),media.id);
      store.audit('worker', row.owner_id, `original.${state}`, row.id, row.trace_id, { code });
    }, true);
    return true;
  }
  complete(row: Record<string, any>, result: OriginalResult, lease: Lease,enqueueProjection=true,mediaId?:string) {
    const store = this.service.content.store, now = new Date().toISOString();
    this.queue.mutate(lease, () => {
      store.run("UPDATE releases SET state='superseded',updated_at=? WHERE article_id=? AND state='published' AND id<>?", now, row.article_id, row.id);
      store.run('UPDATE releases SET state=?,remote_id=?,url=?,error_code=NULL,updated_at=? WHERE id=?', row.action === 'unpublish' ? 'unpublished' : 'published', result.remoteId, result.url, now, row.id);
      if(row.action!=='unpublish')store.run('INSERT OR IGNORE INTO submission_fulfillments VALUES (?,?,?,?)',row.article_id,row.revision_id,row.id,now);
      store.audit('worker', row.owner_id, `original.${row.action === 'unpublish' ? 'unpublished' : 'published'}`, row.id, row.trace_id, { revisionId: row.revision_id, url: result.url });
      if(mediaId)store.run("UPDATE release_media_requests SET state='complete',error_code=NULL,updated_at=? WHERE id=?",now,mediaId);
      if(!enqueueProjection)return;
      const projection=randomUUID();
      store.run('INSERT INTO projections VALUES (?,?,?,?,?,?,?)',projection,row.article_id,row.owner_id,row.actor_json,'queued',null,row.trace_id);
      deriveCommand(store,this.service.vault.open<Actor>(row.actor_json),releaseCommand(row),projectionCommand({id:projection,article_id:row.article_id,owner_id:row.owner_id}));
      store.run('INSERT INTO jobs VALUES (?,?,?,?,?,?)',randomUUID(),'projection',projection,'queued',null,now);
    }, true);
  }
}
