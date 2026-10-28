import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export type Row = Record<string, any>;
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS owners (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('personal','organization')), issuer TEXT NOT NULL, subject TEXT NOT NULL, UNIQUE(kind,issuer,subject));
      CREATE TABLE IF NOT EXISTS owner_profiles (owner_id TEXT PRIMARY KEY REFERENCES owners(id), display_name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS publishers (owner_id TEXT NOT NULL REFERENCES owners(id), subject TEXT NOT NULL, PRIMARY KEY(owner_id,subject));
      CREATE TABLE IF NOT EXISTS articles (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES owners(id), language TEXT NOT NULL CHECK(language IN ('en','zh')), creator TEXT NOT NULL, current_revision TEXT, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS articles_owner ON articles(owner_id,created_at);
      CREATE TABLE IF NOT EXISTS revisions (id TEXT PRIMARY KEY, article_id TEXT NOT NULL REFERENCES articles(id), title TEXT NOT NULL, markdown BLOB NOT NULL, digest TEXT NOT NULL, credited_author TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS revisions_article ON revisions(article_id,created_at);
      CREATE TRIGGER IF NOT EXISTS revisions_immutable BEFORE UPDATE ON revisions BEGIN SELECT RAISE(ABORT,'revisions are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS revisions_no_delete BEFORE DELETE ON revisions BEGIN SELECT RAISE(ABORT,'revisions are immutable'); END;
      CREATE TABLE IF NOT EXISTS submissions (article_id TEXT PRIMARY KEY REFERENCES articles(id), revision_id TEXT NOT NULL REFERENCES revisions(id), actor TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS translations (article_id TEXT PRIMARY KEY REFERENCES articles(id), source_article TEXT NOT NULL REFERENCES articles(id), source_revision TEXT NOT NULL REFERENCES revisions(id));
      CREATE TABLE IF NOT EXISTS sites (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES owners(id), language TEXT NOT NULL, url TEXT NOT NULL, key_ref TEXT NOT NULL, UNIQUE(owner_id,language));
      CREATE TABLE IF NOT EXISTS site_admin_routes (site_id TEXT PRIMARY KEY REFERENCES sites(id), base_url TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS author_mappings (site_id TEXT NOT NULL REFERENCES sites(id), credited_author TEXT NOT NULL, ghost_author_id TEXT NOT NULL, PRIMARY KEY(site_id,credited_author));
      CREATE TABLE IF NOT EXISTS releases (id TEXT PRIMARY KEY, article_id TEXT NOT NULL REFERENCES articles(id), revision_id TEXT NOT NULL REFERENCES revisions(id), owner_id TEXT NOT NULL REFERENCES owners(id), actor_json TEXT NOT NULL, action TEXT NOT NULL CHECK(action IN ('publish','update','unpublish')), state TEXT NOT NULL, remote_id TEXT, url TEXT, error_code TEXT, trace_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS releases_article ON releases(article_id,created_at);
      CREATE TABLE IF NOT EXISTS release_links (release_id TEXT PRIMARY KEY REFERENCES releases(id), peer_article_id TEXT NOT NULL REFERENCES articles(id), source_revision TEXT NOT NULL REFERENCES revisions(id));
      CREATE TABLE IF NOT EXISTS projections (id TEXT PRIMARY KEY, article_id TEXT NOT NULL REFERENCES articles(id), owner_id TEXT NOT NULL REFERENCES owners(id), actor_json TEXT NOT NULL, state TEXT NOT NULL, error_code TEXT, trace_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS deliveries (id TEXT PRIMARY KEY, release_id TEXT NOT NULL REFERENCES releases(id), owner_id TEXT NOT NULL REFERENCES owners(id), connection_id TEXT NOT NULL, target TEXT NOT NULL, action TEXT NOT NULL, format TEXT NOT NULL, digest TEXT NOT NULL, state TEXT NOT NULL, remote_id TEXT, url TEXT, approval_ref TEXT, error_code TEXT, source_verified INTEGER, trace_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS deliveries_owner_state ON deliveries(owner_id,state);
      CREATE TABLE IF NOT EXISTS delivery_payloads (delivery_id TEXT PRIMARY KEY REFERENCES deliveries(id), actor_json TEXT NOT NULL, payload_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS delivery_events (id TEXT PRIMARY KEY, delivery_id TEXT NOT NULL REFERENCES deliveries(id), state TEXT NOT NULL, code TEXT, trace_id TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS nyx_approvals (reference TEXT PRIMARY KEY, connection_id TEXT NOT NULL, content_digest TEXT NOT NULL, action TEXT NOT NULL, owner_json TEXT NOT NULL, fence_json TEXT NOT NULL, request_digest TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, kind TEXT NOT NULL, resource_id TEXT NOT NULL, state TEXT NOT NULL, lease_until TEXT, created_at TEXT NOT NULL, UNIQUE(kind,resource_id));
      CREATE INDEX IF NOT EXISTS jobs_state ON jobs(state,created_at);
      CREATE TABLE IF NOT EXISTS job_leases (job_id TEXT PRIMARY KEY REFERENCES jobs(id), token TEXT NOT NULL, generation INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS recovery_actors (kind TEXT NOT NULL, resource_id TEXT NOT NULL, actor_json TEXT NOT NULL, trace_id TEXT NOT NULL, PRIMARY KEY(kind,resource_id));
      CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, actor TEXT NOT NULL, owner_id TEXT NOT NULL, action TEXT NOT NULL, resource_id TEXT NOT NULL, trace_id TEXT NOT NULL, detail_json TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS audit_owner ON audit(owner_id,created_at);
      CREATE TABLE IF NOT EXISTS idempotency (actor TEXT NOT NULL, operation TEXT NOT NULL, key TEXT NOT NULL, digest TEXT NOT NULL, resource_id TEXT NOT NULL, PRIMARY KEY(actor,operation,key));
      CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES owners(id), article_id TEXT NOT NULL REFERENCES articles(id), content BLOB NOT NULL, mime TEXT NOT NULL, digest TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS asset_publications (asset_id TEXT NOT NULL REFERENCES assets(id), release_id TEXT NOT NULL REFERENCES releases(id), public_path TEXT NOT NULL, PRIMARY KEY(asset_id,release_id));
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, actor_json TEXT NOT NULL, csrf TEXT NOT NULL, expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS oidc_states (state TEXT PRIMARY KEY, nonce TEXT NOT NULL, verifier TEXT NOT NULL, expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS observations (id TEXT PRIMARY KEY, article_id TEXT NOT NULL REFERENCES articles(id), owner_id TEXT NOT NULL REFERENCES owners(id), language TEXT NOT NULL, visitor TEXT NOT NULL, referral TEXT NOT NULL, campaign TEXT, observed_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS external_metrics (delivery_id TEXT PRIMARY KEY REFERENCES deliveries(id), views INTEGER, reactions INTEGER, comments INTEGER, source TEXT NOT NULL, updated_at TEXT NOT NULL, error_code TEXT);
      CREATE INDEX IF NOT EXISTS observations_owner_date ON observations(owner_id,observed_at,article_id,language);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT OR IGNORE INTO settings VALUES ('outbound_paused','false');
      INSERT OR IGNORE INTO migrations VALUES (1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    `);
  }
  get(sql: string, ...params: SQLInputValue[]): Row | undefined { return this.db.prepare(sql).get(...params) as Row | undefined; }
  all(sql: string, ...params: SQLInputValue[]): Row[] { return this.db.prepare(sql).all(...params) as Row[]; }
  run(sql: string, ...params: SQLInputValue[]) { return this.db.prepare(sql).run(...params); }
  transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = operation(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  createOwner(id: string, kind: 'personal' | 'organization', issuer: string, subject: string) {
    this.run('INSERT INTO owners VALUES (?,?,?,?)', id, kind, issuer, subject);
  }
  audit(actor: string, owner: string, action: string, resource: string, trace: string, detail: Record<string, unknown> = {}) {
    this.run('INSERT INTO audit VALUES (?,?,?,?,?,?,?,?)', randomUUID(), actor, owner, action, resource, trace, JSON.stringify(detail), new Date().toISOString());
  }
  close() { this.db.close(); }
}
