import { randomUUID } from 'node:crypto';
import type { Actor } from './policy.ts';
import { PublishingService, type OriginalAdapter } from './publishing.ts';
import { digest } from './content.ts';
import { AppError, requireValue, text } from './errors.ts';
import { RemoteError, remote } from './http-client.ts';
import { TargetRegistry, isRead, type CopyPayload, type RemoteRequest } from './targets.ts';
import { render } from './render.ts';
import {assistedMarkdown,provesAssistedCopy} from './assisted-proof.ts';
import { Queue } from './queue.ts';
import {BrowserRenderProof,type RenderProof} from './render-proof.ts';

export interface Connections {
  connection(actor: Actor, owner: any, id: string, target: string): Promise<any>;
  approval(actor: Actor, owner: any, reference: string, digest: string, connectionId: string, action: string): Promise<any>;
  execute(actor: Actor, input: Record<string, unknown>): Promise<any>;
  prepareApproval?(actor:Actor,owner:any,connectionId:string,target:string,request:RemoteRequest,deliveryId:string,digest:string,action:string):Promise<{reference:string;state:string;expiresAt:string}>;
  listConnections?(actor:Actor,owner:any):Promise<any[]>;
}
import {connectionFingerprint} from './connection-proof.ts';
export {connectionFingerprint} from './connection-proof.ts';
export class DistributionService {
  originals: PublishingService; connections: Connections; targets: TargetRegistry;
  renderer:RenderProof;
  constructor(originals: PublishingService, connections: Connections, targets: TargetRegistry, renderer:RenderProof=new BrowserRenderProof()) { this.renderer=renderer; this.originals = originals; this.connections = connections; this.targets = targets; }
  get store() { return this.originals.content.store; }
  async availableConnections(actor:Actor,ownerId:string) {
    const owner=await this.originals.content.policy.publish(actor,ownerId);await this.originals.content.policy.scope(actor,'connections:read');
    requireValue(this.connections.listConnections,503,'CONNECTION_CONFIGURATION_REQUIRED','NyxID connection discovery is not configured');
    return this.connections.listConnections(actor,{kind:owner.kind,issuer:owner.issuer,subject:owner.subject});
  }
  async context(actor: Actor, id: string) {
    const delivery = this.store.get('SELECT * FROM deliveries WHERE id=?', id); requireValue(delivery, 404, 'NOT_FOUND', 'Delivery not found');
    const owner = await this.originals.content.policy.publish(actor, delivery.owner_id);
    const snapshot = this.store.get('SELECT * FROM delivery_payloads WHERE delivery_id=?', id)!;
    const payload = JSON.parse(snapshot.payload_json) as CopyPayload;
    return { delivery, owner: { kind: owner.kind, issuer: owner.issuer, subject: owner.subject }, payload: { ...payload, remoteId: delivery.remote_id ?? payload.remoteId, remoteUrl: delivery.url ?? payload.remoteUrl }, actor: this.originals.vault.open<Actor>(snapshot.actor_json) };
  }
  event(id: string, state: string, trace: string, code: string | null = null) {
    const now = new Date().toISOString();
    this.store.run('UPDATE deliveries SET state=?,error_code=?,updated_at=? WHERE id=?', state, code, now, id);
    this.store.run('INSERT INTO delivery_events VALUES (?,?,?,?,?,?)', randomUUID(), id, state, code, trace, now);
    const delivery = this.store.get('SELECT owner_id FROM deliveries WHERE id=?', id)!;
    this.store.audit('worker', delivery.owner_id, `delivery.${state}`, id, trace, { code });
  }
  settleCopy(delivery: any, remoteId: string, state: string, trace: string) {
    for (const previous of this.store.all("SELECT id FROM deliveries WHERE owner_id=? AND target=? AND connection_id=? AND remote_id=? AND id<>? AND state='published'", delivery.owner_id, delivery.target, delivery.connection_id, remoteId, delivery.id)) this.event(previous.id, state === 'removed' ? 'removed' : 'superseded', trace);
  }
  manualWorkflow(delivery: any) {
    return !this.targets.get(delivery.target,true).automatic || this.targets.disabled.has(delivery.target) || !!this.store.get("SELECT 1 FROM delivery_events WHERE delivery_id=? AND state='manual_action_needed'",delivery.id);
  }
  async request(actor: Actor, releaseId: string, input: Record<string, unknown>, trace: string) {
    const release = this.store.get('SELECT * FROM releases WHERE id=?', releaseId); requireValue(release, 404, 'NOT_FOUND', 'Original not found');
    const owner = await this.originals.content.policy.publish(actor, release.owner_id);
    const ownerRef = { kind: owner.kind, issuer: owner.issuer, subject: owner.subject };
    requireValue(input.ownerId === undefined || input.ownerId === owner.id, 403, 'FORBIDDEN', 'Owner mismatch');
    const target = this.targets.get(text(input.target, 'target'), ['update','remove'].includes(String(input.action))), connectionId = text(input.connectionId, 'connectionId'), key = text(input.idempotencyKey, 'idempotencyKey', 200);
    requireValue(['create', 'update', 'remove'].includes(String(input.action)) && ['full', 'excerpt'].includes(String(input.format)), 400, 'INVALID_INPUT', 'Specify action and full/excerpt format');
    requireValue(input.rightsConfirmed === true, 400, 'CONFIRMATION_REQUIRED', 'Confirm text and image publication rights');
    const fingerprint = digest(JSON.stringify({ releaseId, target: target.name, connectionId, action: input.action, format: input.format, excerpt: input.excerpt, copyId: input.copyId }));
    const actorKey = `${actor.issuer}|${actor.subject}`;
    const prior = this.store.get('SELECT * FROM idempotency WHERE actor=? AND operation=? AND key=?', actorKey, 'delivery', key);
    if (prior) { requireValue(prior.digest === fingerprint, 409, 'CONFLICT', 'Idempotency key reused for different delivery'); return this.store.get('SELECT * FROM deliveries WHERE id=?', prior.resource_id)!; }
    const original = this.originals.input(release);
    requireValue(original.language === 'en', 409, 'LANGUAGE_NOT_VERIFIED', 'External distribution is initially enabled for English only');
    if (input.action !== 'remove') requireValue(release.state === 'published', 409, 'ORIGINAL_NOT_LIVE', 'Exact confirmed original must currently be live');
    let copy;
    if (input.action !== 'create') {
      copy = this.store.get('SELECT d.*,r.article_id FROM deliveries d JOIN releases r ON r.id=d.release_id WHERE d.id=?', text(input.copyId, 'copyId'));
      requireValue(copy && copy.owner_id === owner.id && copy.connection_id === connectionId && copy.target === target.name && copy.remote_id && copy.article_id === release.article_id, 403, 'COPY_MISMATCH', 'Exact existing owner copy required');
    }
    let connection:any,connectionLost=false;
    try { connection=await this.connections.connection(actor,ownerRef,connectionId,target.name); }
    catch(error) {
      requireValue(copy && error instanceof AppError && ['CONNECTION_DISABLED','REMOTE_AUTHORIZATION'].includes(error.code),error instanceof AppError?error.status:503,error instanceof AppError?error.code:'CONNECTION_UNAVAILABLE','The selected connection is unavailable; reconnect it before sending');
      // A follow-up record retains the known copy identity; it has no outbound job
      // and never substitutes credentials or another user's account.
      const previous=JSON.parse(this.store.get('SELECT payload_json FROM delivery_payloads WHERE delivery_id=?',copy.id)!.payload_json);
      connection={accountId:previous.accountId};connectionLost=true;
    }
    const id = randomUUID(); let markdown = input.format === 'excerpt' ? text(input.excerpt, 'excerpt', 50000) : original.markdown;
    for (const reference of [...new Set(markdown.match(/asset:[a-f0-9-]{36}/g) ?? [])]) {
      const asset = this.store.get('SELECT a.*,p.public_path FROM assets a JOIN asset_publications p ON p.asset_id=a.id WHERE a.id=? AND a.article_id=? AND p.release_id=?', reference.slice(6), original.articleId, releaseId);
      requireValue(asset, 409, 'IMAGE_NOT_PUBLIC', 'Selected image is not part of the verified original');
      const filename = String(asset.public_path).split('/').at(-1); markdown = markdown.replaceAll(reference, `${original.site.url}/content/images/chrono/${filename}`);
    }
    const payload: CopyPayload = { deliveryId: id, ownerKind: owner.kind, title: original.title, markdown, sourceUrl: release.url, sourceDigest: original.digest, creditedAuthor: original.creditedAuthor, language: original.language, action: input.action as string, format: input.format as string, remoteId: copy?.remote_id ?? undefined, remoteUrl: copy?.url ?? undefined, accountId: connection.accountId, connectionFingerprint: connectionFingerprint(connection) };
    const contentDigest = digest(JSON.stringify({ ...payload, connectionId, target: target.name, accountId: connection.accountId }));
    const state = connectionLost || this.targets.disabled.has(target.name) || !target.automatic || !target.automaticActions?.includes(String(input.action)) ? 'manual_action_needed' : owner.kind === 'organization' ? 'approval_needed' : 'queued'; const now = new Date().toISOString();
    this.store.transaction(() => {
      if (input.action === 'create') requireValue(!this.store.get("SELECT 1 FROM deliveries d JOIN releases r ON r.id=d.release_id WHERE r.article_id=? AND d.target=? AND d.connection_id=? AND d.action='create' AND d.state NOT IN ('failed','blocked','cancelled','removed')", release.article_id, target.name, connectionId), 409, 'DUPLICATE_TARGET', 'An existing or uncertain copy already targets this connection; update or reconcile it');
      this.store.run('INSERT INTO deliveries(id,release_id,owner_id,connection_id,target,action,format,digest,state,remote_id,url,approval_ref,trace_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', id, releaseId, owner.id, connectionId, target.name, input.action as string, input.format as string, contentDigest, state, copy?.remote_id ?? null, copy?.url ?? null, null, trace, now, now);
      this.store.run('INSERT INTO delivery_payloads VALUES (?,?,?)', id, this.originals.vault.seal(actor), JSON.stringify(payload));
      this.store.run('INSERT INTO idempotency VALUES (?,?,?,?,?)', actorKey, 'delivery', key, fingerprint, id);
      if (state === 'queued') this.store.run('INSERT INTO jobs VALUES (?,?,?,?,?,?)', randomUUID(), 'delivery', id, 'queued', null, now);
      this.store.audit(actor.subject, owner.id, 'delivery.confirm', id, trace, { revision: release.revision_id, contentDigest, connectionId, target: target.name, action: input.action, rightsConfirmed: true });
      this.event(id, state, trace,connectionLost?'CONNECTION_DISABLED':null);
    });
    return this.store.get('SELECT * FROM deliveries WHERE id=?', id)!;
  }
  async authorize(actor: Actor, id: string, approvalRef: string, trace: string) {
    const { delivery, owner } = await this.context(actor, id);
    requireValue(delivery.state === 'approval_needed', 409, 'DELIVERY_STATE', 'Delivery is not awaiting exact authorization');
    await this.connections.approval(actor, owner, text(approvalRef, 'approvalRef'), delivery.digest, delivery.connection_id, delivery.action);
    await this.originals.content.policy.publish(actor,delivery.owner_id);
    this.store.transaction(() => {
      requireValue(this.store.get('SELECT state FROM deliveries WHERE id=?',id)?.state==='approval_needed',409,'DELIVERY_STATE','Delivery changed while authorization was checked');
      this.store.run('UPDATE deliveries SET approval_ref=? WHERE id=?', approvalRef, id);
      this.event(id, 'queued', trace);
      this.store.run('INSERT INTO jobs VALUES (?,?,?,?,?,?) ON CONFLICT(kind,resource_id) DO UPDATE SET state=excluded.state,lease_until=NULL', randomUUID(), 'delivery', id, 'queued', null, new Date().toISOString());
      this.store.audit(actor.subject, delivery.owner_id, 'delivery.exact-approval', id, trace, { digest: delivery.digest, approvalRef });
    }); return this.store.get('SELECT * FROM deliveries WHERE id=?', id);
  }
  async requestApproval(actor:Actor,id:string,trace:string) {
    const {delivery,owner,payload}=await this.context(actor,id);
    requireValue(delivery.state==='approval_needed' && owner.kind==='organization',409,'DELIVERY_STATE','Exact organization approval is not pending');
    if(delivery.approval_ref) return {reference:delivery.approval_ref,state:'approval_needed',expiresAt:null};
    const target=this.targets.get(delivery.target),connection=await this.connections.connection(actor,owner,delivery.connection_id,delivery.target);
    requireValue(target.request && this.connections.prepareApproval,503,'APPROVAL_CONFIGURATION','Native exact authorization is not configured');
    requireValue(connectionFingerprint(connection)===payload.connectionFingerprint,409,'CONNECTION_CHANGED','Connection changed; confirm a new delivery');
    const request=target.request(payload,connection);
    const result=await this.connections.prepareApproval(actor,owner,delivery.connection_id,delivery.target,request,id,delivery.digest,delivery.action);
    this.store.run('UPDATE deliveries SET approval_ref=? WHERE id=?',result.reference,id);
    this.store.audit(actor.subject,delivery.owner_id,'delivery.exact-request',id,trace,{reference:result.reference,digest:delivery.digest});
    return result;
  }
  async cancel(actor: Actor, id: string, trace: string) {
    const { delivery } = await this.context(actor, id);
    this.store.transaction(() => {
      const current = this.store.get('SELECT state FROM deliveries WHERE id=?', id)!;
      requireValue(['queued', 'approval_needed', 'manual_action_needed'].includes(current.state) && !this.store.get("SELECT 1 FROM jobs WHERE kind='delivery' AND resource_id=? AND state='running'", id), 409, 'ALREADY_SENT', 'A request may already have been sent; reconcile and request removal');
      this.event(id, 'cancelled', trace); this.store.run("UPDATE jobs SET state='cancelled' WHERE kind='delivery' AND resource_id=?", id);
      this.store.audit(actor.subject, delivery.owner_id, 'delivery.cancel', id, trace);
    }); return { id, state: 'cancelled' };
  }
  async reconcile(actor: Actor, id: string, trace: string) {
    const { delivery } = await this.context(actor, id);
    requireValue(delivery.state === 'uncertain', 409, 'DELIVERY_STATE', 'Only uncertain deliveries can reconcile');
    this.store.transaction(() => {
      const update = this.store.run("UPDATE jobs SET state='queued',lease_until=NULL WHERE kind='delivery' AND resource_id=? AND state<>'running'", id);
      requireValue(Number(update.changes) === 1, 409, 'IN_PROGRESS', 'A current worker owns this delivery');
      this.store.run('INSERT INTO recovery_actors VALUES (?,?,?,?) ON CONFLICT(kind,resource_id) DO UPDATE SET actor_json=excluded.actor_json,trace_id=excluded.trace_id', 'delivery', id, this.originals.vault.seal(actor), trace);
      this.store.audit(actor.subject, delivery.owner_id, 'delivery.reconcile.request', id, trace);
    }); return { id, state: 'uncertain' };
  }
  async package(actor: Actor, id: string) {
    const { delivery, payload } = await this.context(actor, id);
    requireValue(this.manualWorkflow(delivery), 409, 'AUTOMATIC_TARGET', 'This target uses automatic publishing');
    requireValue(payload.action === 'remove' || this.store.get("SELECT 1 FROM releases WHERE id=? AND state='published'", delivery.release_id), 409, 'ORIGINAL_NOT_LIVE', 'Original changed or was unpublished; prepare a new confirmed submission');
    const markdown = assistedMarkdown(payload);
    return { title: payload.title, markdown, html: render(markdown, new Set([...markdown.matchAll(/!\[[^\]]*\]\((https?:[^)]+)\)/g)].map(m => m[1]))), sourceUrl: payload.sourceUrl, creditedAuthor: payload.creditedAuthor, state: delivery.state, knownCopyUrl:delivery.url, instructions: payload.action==='remove'?'Request removal of this known copy using its original author account or the platform support team; reconnect the exact selected account if access was lost. Record the result only after public verification.': delivery.target === 'medium' ? 'Use Medium import with the original URL, review formatting, images and attribution, and record submission separately from publication.' : 'Submit via HackerNoon with source attribution; company-domain originals normally require a company account. Track editorial review; acceptance is controlled by HackerNoon.', accountConnectionId: delivery.connection_id };
  }
  async report(actor: Actor, id: string, state: string, url: string | null, trace: string) {
    const { delivery } = await this.context(actor, id);
    const target=this.targets.get(delivery.target,true);
    requireValue(['manual_action_needed','submitted','reviewing','rejected','published'].includes(delivery.state) && this.manualWorkflow(delivery) && ['submitted', 'reviewing', 'rejected', 'manual_action_needed', 'published','removed'].includes(state), 400, 'INVALID_INPUT', 'Invalid manual follow-up status');
    requireValue(state!=='removed'||delivery.action==='remove',409,'DELIVERY_STATE','Only a confirmed removal can be marked removed');
    if (url) {
      let parsed: URL;try{parsed=new URL(url);}catch{throw new AppError(400,'INVALID_INPUT','Use a valid destination URL');}
      const allowed=target.automatic ? url===delivery.url : delivery.target==='medium' ? parsed.hostname==='medium.com'||parsed.hostname.endsWith('.medium.com') : parsed.hostname==='hackernoon.com';
      requireValue(parsed.protocol==='https:' && !parsed.username && !parsed.password && !parsed.hash && allowed,400,'INVALID_INPUT','Use an HTTPS destination URL; automatic follow-up must retain the exact known copy URL');
    }
    if (state === 'published') {
      requireValue(delivery.action!=='remove' && this.store.get("SELECT 1 FROM releases WHERE id=? AND state='published'",delivery.release_id),409,'ORIGINAL_NOT_LIVE','The confirmed original must still be live');
      requireValue(url, 400, 'URL_REQUIRED', 'Public URL required');
      const { payload } = await this.context(actor, id);
      const page = (await remote(url)).text;
      requireValue(provesAssistedCopy(page,payload) && await this.renderer.verify(url,page),409,'PUBLICATION_UNVERIFIED','Visible full/excerpt content, title, credited author and source link could not be verified; retain submitted/reviewing follow-up');
    }
    if(state==='removed') {
      requireValue(delivery.url && delivery.remote_id && (!url||url===delivery.url),409,'COPY_MISMATCH','Verify removal at the exact known copy URL');
      let gone=false;try{await remote(delivery.url);}catch(error){gone=error instanceof RemoteError && ['REMOTE_NOT_FOUND','REMOTE_GONE'].includes(error.code);}requireValue(gone,409,'REMOVAL_UNVERIFIED','Known copy still exists or its removal cannot be verified');
    }
    await this.originals.content.policy.publish(actor,delivery.owner_id);
    this.store.transaction(() => {
      requireValue(this.store.get('SELECT state FROM deliveries WHERE id=?',id)?.state===delivery.state,409,'DELIVERY_STATE','Manual workflow changed during verification');
      if(state==='published') requireValue(this.store.get("SELECT 1 FROM releases WHERE id=? AND state='published'",delivery.release_id),409,'ORIGINAL_NOT_LIVE','Original changed during public verification');
      const remoteId=delivery.remote_id??(state==='published'?url:null);
      this.store.run('UPDATE deliveries SET url=?,remote_id=?,source_verified=CASE WHEN ?=? THEN 1 ELSE source_verified END WHERE id=?',url??delivery.url,remoteId,state,'published',id);
      if(remoteId && ['published','removed'].includes(state)) this.settleCopy(delivery,remoteId,state,trace);
      this.event(id, state, trace); this.store.audit(actor.subject, delivery.owner_id, 'delivery.manual-report', id, trace, { state, url });
    });
    return this.store.get('SELECT * FROM deliveries WHERE id=?', id);
  }
  async list(actor: Actor, articleId: string) {
    await this.originals.content.get(actor, articleId);
    return this.store.all('SELECT d.* FROM deliveries d JOIN releases r ON r.id=d.release_id WHERE r.article_id=? ORDER BY d.rowid DESC LIMIT 100', articleId).map(d => ({ ...d, history: this.store.all('SELECT state,code,trace_id,created_at FROM delivery_events WHERE delivery_id=? ORDER BY rowid', d.id) }));
  }
  async refreshMetrics(actor:Actor,id:string,trace:string) {
    const {delivery,owner,payload}=await this.context(actor,id);await this.originals.content.policy.scope(actor,'metrics:read');
    requireValue(delivery.state==='published',409,'DELIVERY_STATE','Only a known published copy has readership counters');
    const target=this.targets.get(delivery.target);requireValue(target.metrics,409,'METRICS_UNAVAILABLE','This destination has no supported authorized metrics adapter');
    try {
      const connection=await this.connections.connection(actor,owner,delivery.connection_id,delivery.target);
      requireValue(connectionFingerprint(connection)===payload.connectionFingerprint,409,'CONNECTION_CHANGED','Reconnect and reconfirm the exact account before reading its counters');
      const result=await target.metrics(payload,connection,async request=>{requireValue(isRead(request),500,'READ_ONLY','Metrics cannot execute writes');const response=await this.connections.execute(actor,{owner,connectionId:delivery.connection_id,target:delivery.target,request,connectionFingerprint:payload.connectionFingerprint,readOnly:true});requireValue(response.accountId===connection.accountId && response.status>=200 && response.status<300,502,'METRICS_UNAVAILABLE','Authorized destination metrics could not be read');return response.body;});
      await this.originals.content.policy.publish(actor,delivery.owner_id);
      this.store.run('INSERT INTO external_metrics VALUES (?,?,?,?,?,?,?) ON CONFLICT(delivery_id) DO UPDATE SET views=excluded.views,reactions=excluded.reactions,comments=excluded.comments,source=excluded.source,updated_at=excluded.updated_at,error_code=NULL',id,result.views,result.reactions,result.comments,result.source,new Date().toISOString(),null);
      this.store.audit(actor.subject,delivery.owner_id,'metrics.refresh',id,trace);return{availability:'Available',...result};
    }catch(error){const code=error instanceof AppError?error.code:'METRICS_UNAVAILABLE';this.store.run('INSERT INTO external_metrics VALUES (?,?,?,?,?,?,?) ON CONFLICT(delivery_id) DO UPDATE SET error_code=excluded.error_code',id,null,null,null,`${delivery.target} authorized API`,new Date().toISOString(),code);this.store.audit(actor.subject,delivery.owner_id,'metrics.unavailable',id,trace,{code});return{availability:'Unavailable',code};}
  }
}
export class DeliveryWorker {
  service: DistributionService; original: OriginalAdapter; queue: Queue;
  constructor(service: DistributionService, original: OriginalAdapter) { this.service = service; this.original = original; this.queue = new Queue(service.store); }
  async once() {
    const { store } = this.service;
    const lease = this.queue.claim('delivery', id => {
      this.service.event(id, 'uncertain', 'recovery', 'WORKER_INTERRUPTED');
    });
    if (!lease) return false;
    const snapshot = store.get('SELECT actor_json FROM delivery_payloads WHERE delivery_id=?', lease.resourceId)!;
    const recovering = store.get('SELECT state FROM deliveries WHERE id=?',lease.resourceId)?.state === 'uncertain';
    const recovery = recovering ? store.get("SELECT actor_json FROM recovery_actors WHERE kind='delivery' AND resource_id=?",lease.resourceId) : undefined;
    let sent = false, knownWrite = false, acceptedWrite = false;
    try {
      const actor = this.service.originals.vault.open<Actor>(recovery?.actor_json ?? snapshot.actor_json);
      const { delivery, payload, owner } = await this.service.context(actor, lease.resourceId);
      const target = this.service.targets.get(delivery.target);
      const connection = await this.service.connections.connection(actor, owner, delivery.connection_id, delivery.target);
      requireValue(connectionFingerprint(connection) === payload.connectionFingerprint, 409, 'CONNECTION_CHANGED', 'Selected account or publication configuration changed; exact confirmation and authorization must be renewed');
      const assertDispatch = () => {
        this.queue.guard(lease);this.queue.assertWritable();
        if (payload.action !== 'remove') {
          const source=store.get("SELECT r.*,v.digest FROM releases r JOIN revisions v ON v.id=r.revision_id WHERE r.id=?",delivery.release_id);
          requireValue(source?.state==='published' && source.digest===payload.sourceDigest && source.url===payload.sourceUrl,409,'ORIGINAL_NOT_LIVE','Confirmed original changed or was unpublished before dispatch');
        }
      };
      const send = async (request: RemoteRequest) => {
        this.queue.guard(lease);
        await this.service.originals.content.policy.publish(actor, delivery.owner_id);
        if (!isRead(request)) {
          requireValue(!recovering,409,'RECOVERY_READ_ONLY','Recovery cannot send new destination writes');
          if (payload.action !== 'remove') {
            const release = store.get("SELECT * FROM releases WHERE id=? AND state='published'", delivery.release_id);
            const originalInput = release ? this.service.originals.input(release) : undefined;
            if (originalInput) originalInput.guard = () => this.queue.guard(lease);
            requireValue(release && originalInput && await this.original.verify(originalInput, { remoteId: release.remote_id, url: release.url }), 409, 'ORIGINAL_NOT_LIVE', 'Original changed or is not publicly verified');
          }
          if (owner.kind === 'organization') {
            requireValue(delivery.approval_ref, 409, 'APPROVAL_NEEDED', 'Exact organization Admin authorization required');
            await this.service.connections.approval(actor, owner, delivery.approval_ref, delivery.digest, delivery.connection_id, delivery.action);
          }
          const freshConnection = await this.service.connections.connection(actor,owner,delivery.connection_id,delivery.target);
          requireValue(connectionFingerprint(freshConnection) === payload.connectionFingerprint,409,'CONNECTION_CHANGED','Connection configuration drifted before execution');
          await this.service.originals.content.policy.publish(actor, delivery.owner_id);
          this.queue.guard(lease);
          if (!this.queue.mutate(lease,() => this.service.event(delivery.id, 'sending', delivery.trace_id))) this.queue.guard(lease);
          assertDispatch();
          sent = true;
        }
        this.queue.guard(lease);
        const result = await this.service.connections.execute(actor, { owner, connectionId: delivery.connection_id, target: delivery.target, digest: delivery.digest, action: delivery.action, approvalRef: delivery.approval_ref, request, connectionFingerprint:payload.connectionFingerprint, beforeDispatch:()=>{if(!isRead(request))assertDispatch();else this.queue.guard(lease);}, readOnly: isRead(request) });
        if(!isRead(request) && result.status>=200 && result.status<300)acceptedWrite=true;
        requireValue(result.accountId === connection.accountId, 502, 'REMOTE_ACCOUNT_MISMATCH', 'Execution account does not match the selected connection');
        if (result.status < 200 || result.status >= 300) throw new RemoteError(result.status === 401 || result.status === 403 ? 'ACCOUNT_RIGHTS_REQUIRED' : 'DESTINATION_FAILED', 'Destination did not accept the operation', !isRead(request) && result.status >= 500);
        return result.body;
      };
      let result;
      if (delivery.state === 'uncertain') result = await target.reconcile(payload, connection, send);
      else {
        result = await target.write(payload, connection, send);
        knownWrite = true;
        if (!this.queue.mutate(lease,() => store.run('UPDATE deliveries SET remote_id=?,url=? WHERE id=?', result!.remoteId, result!.url, delivery.id))) return true;
        payload.remoteId = result.remoteId; payload.remoteUrl = result.url;
        result = await target.reconcile(payload, connection, send);
      }
      if (!result) this.queue.mutate(lease,() => this.service.event(delivery.id, 'uncertain', delivery.trace_id, 'REMOTE_RESULT_UNPROVEN'),true);
      else { const verified = result; this.queue.mutate(lease,() => { store.run('UPDATE deliveries SET remote_id=?,url=?,source_verified=? WHERE id=?', verified.remoteId, verified.url, verified.sourceVerified ? 1 : 0, delivery.id); this.service.settleCopy(delivery,verified.remoteId,verified.state,delivery.trace_id); this.service.event(delivery.id, verified.state, delivery.trace_id); },true); }
    } catch (error) {
      const code = error instanceof AppError ? error.code : 'INTERNAL';
      const state = recovering || knownWrite || acceptedWrite || sent && ['REMOTE_CONTRACT','NYXID_CONTRACT'].includes(code) || error instanceof RemoteError && error.uncertain || (!(error instanceof AppError) && sent) ? 'uncertain' : ['MANUAL_REMOVAL_REQUIRED', 'ACCOUNT_RIGHTS_REQUIRED', 'CONNECTION_DISABLED','REMOTE_AUTHORIZATION'].includes(code) ? 'manual_action_needed' : code === 'APPROVAL_NEEDED' ? 'approval_needed' : error instanceof AppError && [401,403,409,503].includes(error.status) ? 'blocked' : 'failed';
      this.queue.mutate(lease,() => this.service.event(lease.resourceId, state, 'worker', code),true);
    }
    return true;
  }
}
