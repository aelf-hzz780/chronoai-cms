import { randomUUID } from 'node:crypto';
import { ContentService, digest } from './content.ts';
import type { Actor } from './policy.ts';
import { Vault } from './vault.ts';
import { AppError, requireValue, text } from './errors.ts';
import { RemoteError } from './http-client.ts';

export interface OriginalInput {
  releaseId: string; articleId: string; revisionId: string; ownerId: string; language: string;
  title: string; markdown: string; digest: string; creditedAuthor: string;
  site: Record<string, any>; remoteId?: string; url?: string; action: string;
}
export interface OriginalResult { remoteId: string; url: string; }
export interface OriginalAdapter {
  publish(input: OriginalInput): Promise<OriginalResult>;
  verify(input: OriginalInput, result: OriginalResult): Promise<boolean>;
  reconcile(input: OriginalInput): Promise<OriginalResult | null>;
  unpublish(input: OriginalInput): Promise<void>;
}
export class PublishingService {
  content: ContentService; vault: Vault;
  constructor(content: ContentService, vault: Vault) { this.content = content; this.vault = vault; }
  async confirm(actor: Actor, articleId: string, input: Record<string, unknown>, trace: string) {
    const article = this.content.article(articleId); await this.content.policy.publish(actor, article.owner_id);
    requireValue(input.ownerId === article.owner_id, 403, 'FORBIDDEN', 'Confirmed owner must match the article');
    const key = text(input.idempotencyKey, 'idempotencyKey', 200), actorKey = `${actor.issuer}|${actor.subject}`;
    const revisionId = text(input.revisionId, 'revisionId');
    const fingerprint = digest(JSON.stringify({ articleId, revisionId, owner: input.ownerId, author: input.creditedAuthor, action: input.action, rights: input.rightsConfirmed }));
    const previous = this.content.store.get('SELECT * FROM idempotency WHERE actor=? AND operation=? AND key=?', actorKey, 'original', key);
    if (previous) { requireValue(previous.digest === fingerprint, 409, 'CONFLICT', 'Idempotency key already used for different content'); return this.safe(this.content.store.get('SELECT * FROM releases WHERE id=?', previous.resource_id)!); }
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
      this.content.store.run('INSERT INTO releases VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', id, articleId, revisionId, article.owner_id, this.vault.seal(actor), input.action as string, 'queued', live?.remote_id ?? null, live?.url ?? null, null, trace, now, now);
      this.content.store.run('INSERT INTO jobs VALUES (?,?,?,?,?,?)', randomUUID(), 'release', id, 'queued', null, now);
      this.content.store.run('INSERT INTO idempotency VALUES (?,?,?,?,?)', actorKey, 'original', key, fingerprint, id);
      this.content.store.audit(actor.subject, article.owner_id, `original.confirm.${input.action}`, id, trace, { revisionId, digest: revision.digest, creditedAuthor: revision.credited_author, site: site.id, rightsConfirmed: true });
    });
    return this.safe(this.content.store.get('SELECT * FROM releases WHERE id=?', id)!);
  }
  safe(row: Record<string, any>) { const { actor_json, ...safe } = row; return safe; }
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
    await this.content.policy.publish(actor, row.owner_id);
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
    await this.content.policy.publish(actor, row.owner_id);
    requireValue(['uncertain', 'verifying'].includes(row.state), 409, 'PUBLICATION_STATE', 'Only uncertain or unverified originals require reconciliation');
    this.content.store.transaction(() => {
      this.content.store.run("UPDATE jobs SET state='queued',lease_until=NULL WHERE kind='release' AND resource_id=? AND state<>'running'", id);
      this.content.store.audit(actor.subject, row.owner_id, 'original.reconcile.request', id, trace);
    }); return { id, state: row.state };
  }
}
export class ReleaseWorker {
  service: PublishingService; adapter: OriginalAdapter;
  constructor(service: PublishingService, adapter: OriginalAdapter) { this.service = service; this.adapter = adapter; }
  async once(): Promise<boolean> {
    const store = this.service.content.store;
    if (store.get("SELECT value FROM settings WHERE key='outbound_paused'")?.value !== 'false') return false;
    const now = new Date().toISOString();
    const job = store.transaction(() => {
      for (const expired of store.all("SELECT * FROM jobs WHERE kind='release' AND state='running' AND lease_until<?", now)) {
        store.run("UPDATE releases SET state='uncertain',error_code='WORKER_INTERRUPTED',updated_at=? WHERE id=?", now, expired.resource_id);
        store.run("UPDATE jobs SET state='queued',lease_until=NULL WHERE id=?", expired.id);
      }
      const row = store.get("SELECT * FROM jobs WHERE kind='release' AND state='queued' ORDER BY created_at,rowid LIMIT 1");
      if (row) store.run("UPDATE jobs SET state='running',lease_until=? WHERE id=?", new Date(Date.now() + 120_000).toISOString(), row.id);
      return row;
    });
    if (!job) return false;
    const row = store.get('SELECT * FROM releases WHERE id=?', job.resource_id)!;
    let state = 'failed', code: string | null = null;
    try {
      const actor = this.service.vault.open<Actor>(row.actor_json);
      await this.service.content.policy.publish(actor, row.owner_id);
      const input = this.service.input(row);
      if (['uncertain', 'verifying'].includes(row.state)) {
        const result = await this.adapter.reconcile(input);
        if (result && await this.adapter.verify(input, result)) { this.complete(row, result); return true; }
        state = 'uncertain'; code = 'REMOTE_RESULT_UNPROVEN';
      } else {
        store.run("UPDATE releases SET state='publishing',updated_at=? WHERE id=?", now, row.id);
        if (row.action === 'unpublish') {
          await this.adapter.unpublish(input);
          this.complete(row, { remoteId: row.remote_id, url: row.url }); return true;
        }
        const result = await this.adapter.publish(input);
        store.run('UPDATE releases SET remote_id=?,url=? WHERE id=?', result.remoteId, result.url, row.id);
        if (await this.adapter.verify(input, result)) { this.complete(row, result); return true; }
        state = 'verifying'; code = 'ORIGINAL_NOT_VERIFIED';
      }
    } catch (error) {
      code = error instanceof AppError ? error.code : 'INTERNAL';
      state = error instanceof RemoteError && error.uncertain ? 'uncertain' : error instanceof AppError && [401, 403, 409, 503].includes(error.status) ? 'blocked' : 'failed';
    } finally {
      store.run("UPDATE jobs SET state='done',lease_until=NULL WHERE id=?", job.id);
    }
    store.transaction(() => {
      store.run('UPDATE releases SET state=?,error_code=?,updated_at=? WHERE id=?', state, code, new Date().toISOString(), row.id);
      store.audit('worker', row.owner_id, `original.${state}`, row.id, row.trace_id, { code });
    });
    return true;
  }
  complete(row: Record<string, any>, result: OriginalResult) {
    const store = this.service.content.store, now = new Date().toISOString();
    store.transaction(() => {
      store.run("UPDATE releases SET state='superseded',updated_at=? WHERE article_id=? AND state='published' AND id<>?", now, row.article_id, row.id);
      store.run('UPDATE releases SET state=?,remote_id=?,url=?,error_code=NULL,updated_at=? WHERE id=?', row.action === 'unpublish' ? 'unpublished' : 'published', result.remoteId, result.url, now, row.id);
      store.audit('worker', row.owner_id, `original.${row.action === 'unpublish' ? 'unpublished' : 'published'}`, row.id, row.trace_id, { revisionId: row.revision_id, url: result.url });
    });
  }
}
