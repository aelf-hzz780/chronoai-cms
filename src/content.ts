import { randomUUID, createHash } from 'node:crypto';
import { Store, type Row } from './store.ts';
import { Policy, type Actor } from './policy.ts';
import { requireValue, text } from './errors.ts';

export function digest(value: string | Uint8Array) { return createHash('sha256').update(value).digest('hex'); }
export class ContentService {
  store: Store; policy: Policy;
  constructor(store: Store, policy: Policy) { this.store = store; this.policy = policy; }
  article(id: string) {
    const article = this.store.get('SELECT * FROM articles WHERE id=?', id);
    requireValue(article, 404, 'NOT_FOUND', 'Article not found'); return article;
  }
  async visibleRevision(actor: Actor, article: Row, requested?: string) {
    const owner = await this.policy.owner(actor, article.owner_id);
    const own = article.creator === actor.subject;
    const submission = this.store.get('SELECT revision_id FROM submissions WHERE article_id=?', article.id);
    const live = this.store.get("SELECT revision_id FROM releases WHERE article_id=? AND state='published' ORDER BY created_at DESC, rowid DESC LIMIT 1", article.id);
    const publisher = await this.policy.canPublish(actor, owner);
    const id = requested ?? (own ? article.current_revision : publisher && submission ? submission.revision_id : live?.revision_id);
    requireValue(own || (id && publisher && id === submission?.revision_id) || (id && id === live?.revision_id), 403, 'FORBIDDEN', 'Draft revision access denied');
    const revision = this.store.get('SELECT * FROM revisions WHERE id=? AND article_id=?', id ?? '', article.id);
    requireValue(revision, 404, 'NOT_FOUND', 'Revision not found'); return revision;
  }
  view(article: Row, revision: Row) {
    const translation = this.store.get('SELECT t.*, a.current_revision FROM translations t JOIN articles a ON a.id=t.source_article WHERE t.article_id=?', article.id);
    return { id: article.id, ownerId: article.owner_id, language: article.language, creator: article.creator, revision: { id: revision.id, title: revision.title, markdown: Buffer.from(revision.markdown).toString('utf8'), digest: revision.digest, creditedAuthor: revision.credited_author, createdAt: revision.created_at }, translation: translation ? { sourceArticle: translation.source_article, sourceRevision: translation.source_revision, outdated: translation.source_revision !== translation.current_revision } : null };
  }
  async get(actor: Actor, id: string, revisionId?: string) {
    const article = this.article(id); return this.view(article, await this.visibleRevision(actor, article, revisionId));
  }
  async markdown(actor: Actor, id: string, revisionId: string) {
    const revision = await this.visibleRevision(actor, this.article(id), revisionId);
    return Buffer.from(revision.markdown);
  }
  input(input: Record<string, unknown>) {
    const title = text(input.title, 'title', 250);
    const markdown = text(input.markdown, 'markdown', 2_000_000);
    const creditedAuthor = text(input.creditedAuthor, 'creditedAuthor', 200);
    requireValue(Buffer.byteLength(markdown) <= 2_000_000, 413, 'TOO_LARGE', 'Markdown exceeds 2 MB');
    return { title, markdown, creditedAuthor };
  }
  saveRevision(articleId: string, actor: Actor, input: ReturnType<ContentService['input']>) {
    const id = randomUUID();
    this.store.run('INSERT INTO revisions VALUES (?,?,?,?,?,?,?,?)', id, articleId, input.title, Buffer.from(input.markdown), digest(input.markdown), input.creditedAuthor, actor.subject, new Date().toISOString());
    return id;
  }
  async create(actor: Actor, input: Record<string, unknown>, trace: string) {
    const owner = await this.policy.owner(actor, text(input.ownerId, 'ownerId'), 'content:write');
    requireValue(input.language === 'en' || input.language === 'zh', 400, 'INVALID_INPUT', 'language must be en or zh');
    const data = this.input(input); const id = randomUUID();
    this.store.transaction(() => {
      this.store.run('INSERT INTO articles VALUES (?,?,?,?,?,?)', id, owner.id, input.language as string, actor.subject, null, new Date().toISOString());
      const revision = this.saveRevision(id, actor, data);
      this.store.run('UPDATE articles SET current_revision=? WHERE id=?', revision, id);
      this.store.audit(actor.subject, owner.id, 'article.create', id, trace, { revision });
    });
    return this.get(actor, id);
  }
  async edit(actor: Actor, id: string, expected: string, input: Record<string, unknown>, trace: string) {
    const article = this.article(id); await this.policy.owner(actor, article.owner_id, 'content:write');
    requireValue(article.creator === actor.subject, 403, 'FORBIDDEN', 'Only the draft creator may edit');
    const previous = this.store.get('SELECT * FROM revisions WHERE id=?', article.current_revision)!;
    const data = this.input({ title: previous.title, markdown: Buffer.from(previous.markdown).toString('utf8'), creditedAuthor: previous.credited_author, ...input });
    this.store.transaction(() => {
      requireValue(this.store.get('SELECT current_revision FROM articles WHERE id=?', id)?.current_revision === expected, 409, 'CONFLICT', 'Revision changed; reload before saving');
      const revision = this.saveRevision(id, actor, data);
      this.store.run('UPDATE articles SET current_revision=? WHERE id=?', revision, id);
      this.store.audit(actor.subject, article.owner_id, 'article.edit', id, trace, { revision, previous: expected });
    });
    return this.get(actor, id);
  }
  async submit(actor: Actor, id: string, revisionId: string, trace: string) {
    const article = this.article(id); await this.policy.owner(actor, article.owner_id, 'content:write');
    requireValue(article.creator === actor.subject && article.current_revision === revisionId, 403, 'FORBIDDEN', 'Submit your current draft revision');
    this.store.transaction(() => {
      this.store.run('INSERT INTO submissions VALUES (?,?,?,?) ON CONFLICT(article_id) DO UPDATE SET revision_id=excluded.revision_id,actor=excluded.actor,created_at=excluded.created_at', id, revisionId, actor.subject, new Date().toISOString());
      this.store.audit(actor.subject, article.owner_id, 'article.submit', id, trace, { revision: revisionId });
    });
    return { articleId: id, revisionId, status: 'submitted' };
  }
  async list(actor: Actor, ownerId: string, query = '', limit = 50, offset = 0) {
    const owner = await this.policy.owner(actor, ownerId);
    requireValue(Number.isInteger(limit) && limit > 0 && limit <= 100 && Number.isInteger(offset) && offset >= 0, 400, 'INVALID_INPUT', 'Invalid pagination');
    const publisher = await this.policy.canPublish(actor, owner);
    requireValue(query.length <= 500, 400, 'INVALID_INPUT', 'Search query exceeds 500 characters');
    // Resolve one authorized revision per article before searching and paging. In
    // particular, another author's newer working draft is never in this relation.
    const rows = this.store.all(`WITH visible AS (
      SELECT a.*,a.rowid AS ordering,CASE WHEN a.creator=? THEN a.current_revision
        WHEN ?=1 AND s.revision_id IS NOT NULL THEN s.revision_id
        ELSE (SELECT r.revision_id FROM releases r WHERE r.article_id=a.id AND r.state='published' ORDER BY r.rowid DESC LIMIT 1) END AS visible_revision
      FROM articles a LEFT JOIN submissions s ON s.article_id=a.id WHERE a.owner_id=?
    ) SELECT v.id,v.visible_revision FROM visible v JOIN revisions r ON r.id=v.visible_revision
      WHERE instr(lower(r.title||char(10)||CAST(r.markdown AS TEXT)),lower(?))>0
      ORDER BY v.created_at DESC,v.ordering DESC LIMIT ? OFFSET ?`, actor.subject, publisher ? 1 : 0, ownerId, query, limit, offset);
    return Promise.all(rows.map(a => this.get(actor, a.id, a.visible_revision)));
  }
  async linkTranslation(actor: Actor, id: string, sourceId: string, sourceRevision: string, trace: string) {
    const article = this.article(id), source = this.article(sourceId);
    await this.policy.owner(actor, article.owner_id, 'content:write');
    requireValue(article.creator === actor.subject && article.owner_id === source.owner_id && article.language !== source.language, 403, 'FORBIDDEN', 'Translation must belong to the same owner and another language');
    await this.visibleRevision(actor, source, sourceRevision);
    this.store.transaction(() => {
      this.store.run('INSERT INTO translations VALUES (?,?,?) ON CONFLICT(article_id) DO UPDATE SET source_article=excluded.source_article,source_revision=excluded.source_revision', id, sourceId, sourceRevision);
      this.store.audit(actor.subject, article.owner_id, 'translation.link', id, trace, { sourceId, sourceRevision });
    });
    return this.get(actor, id);
  }
}
