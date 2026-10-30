import { AppError, requireValue, text } from './errors.ts';
import { Store, type Row } from './store.ts';

export interface Actor { issuer: string; subject: string; scopes: string[]; credential: string; sourceScopes?: string[]; entry?:'cms'|'service'; }
export interface Authority {
  validate(actor: Actor): Promise<void>;
  membership(actor: Actor, organization: string): Promise<'admin' | 'member' | null | string>;
}
export class Policy {
  store: Store; authority: Authority;
  constructor(store: Store, authority: Authority) { this.store = store; this.authority = authority; }
  async scope(actor: Actor, scope: string) {
    requireValue(actor.scopes.includes(scope), 403, 'INSUFFICIENT_SCOPE', `Requires ${scope}`);
    try { await this.authority.validate(actor); }
    catch { throw new AppError(401, 'IDENTITY_UNAVAILABLE', 'Current identity or delegated authority could not be verified'); }
  }
  async owner(actor: Actor, ownerId: string, scope = 'content:read'): Promise<Row> {
    await this.scope(actor, scope);
    const owner = this.store.get('SELECT * FROM owners WHERE id=?', ownerId);
    requireValue(owner && owner.issuer === actor.issuer, 403, 'FORBIDDEN', 'Workspace access denied');
    if (owner.kind === 'personal') requireValue(owner.subject === actor.subject, 403, 'FORBIDDEN', 'Workspace access denied');
    else requireValue(await this.membership(actor, owner), 403, 'FORBIDDEN', 'Active organization membership required');
    return owner;
  }
  async membership(actor: Actor, owner: Row) {
    try { return await this.authority.membership(actor, owner.subject); }
    catch { throw new AppError(503, 'MEMBERSHIP_UNAVAILABLE', 'Current organization permissions unavailable'); }
  }
  async canPublish(actor: Actor, owner: Row) {
    if (owner.kind === 'personal') return owner.subject === actor.subject;
    const role = await this.membership(actor, owner);
    return !!role && (role === 'admin' || !!this.store.get('SELECT 1 FROM publishers WHERE owner_id=? AND subject=?', owner.id, actor.subject));
  }
  async publish(actor: Actor, ownerId: string) {
    const owner = await this.owner(actor, ownerId, 'publish');
    requireValue(await this.canPublish(actor, owner), 403, 'FORBIDDEN', 'Publishing authority required');
    return owner;
  }
  async setPublisher(actor: Actor, ownerId: string, subject: string, enabled: boolean, trace: string) {
    text(subject, 'subject'); requireValue(typeof enabled === 'boolean', 400, 'INVALID_INPUT', 'enabled must be boolean');
    const owner = await this.owner(actor, ownerId, 'roles:write');
    requireValue(owner.kind === 'organization' && await this.membership(actor, owner) === 'admin', 403, 'FORBIDDEN', 'Current organization Admin required');
    this.store.transaction(() => {
      if (enabled) this.store.run('INSERT OR IGNORE INTO publishers VALUES (?,?)', ownerId, subject);
      else this.store.run('DELETE FROM publishers WHERE owner_id=? AND subject=?', ownerId, subject);
      this.store.audit(actor.subject, ownerId, enabled ? 'publisher.grant' : 'publisher.revoke', subject, trace);
    });
  }
}
