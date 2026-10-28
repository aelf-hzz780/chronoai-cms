import type { Actor, Authority } from './policy.ts';
import type { Config } from './config.ts';
import { remoteJson } from './http-client.ts';
import { requireValue } from './errors.ts';

// This versioned bridge contract must be bound to the target NyxID deployment.
// It never accepts caller-supplied identity headers or a default account route.
export class NyxAuthority implements Authority {
  config: Config;
  constructor(config: Config) { this.config = config; }
  async validate(actor: Actor) {
    const body = new URLSearchParams({ token: actor.credential, client_id: this.config.clientId });
    if (this.config.clientSecret) body.set('client_secret', this.config.clientSecret);
    const result = await remoteJson(this.config.introspectionUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    const scopes = typeof result.scope === 'string' ? result.scope.split(' ') : [];
    requireValue(result.active === true && result.sub === actor.subject && (!result.iss || result.iss === actor.issuer) && actor.scopes.every(s => scopes.includes(s)), 401, 'REVOKED', 'Current authorization is invalid');
  }
  async call(actor: Actor, path: string, input: Record<string, unknown> = {}) {
    return remoteJson(`${this.config.authorityUrl}/v1/${path}`, { method: 'POST', headers: { authorization: `Bearer ${this.config.authorityToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ assertion: actor.credential, ...input }) });
  }
  async membership(actor: Actor, organization: string) {
    const result = await this.call(actor, 'membership', { organization });
    requireValue(result.organization === organization && result.subject === actor.subject && ['admin', 'member', null].includes(result.role), 502, 'REMOTE_CONTRACT', 'Invalid current membership response');
    return result.active === true ? result.role : null;
  }
  async connection(actor: Actor, owner: { kind: string; issuer: string; subject: string }, connectionId: string, target: string) {
    const result = await this.call(actor, 'connection', { owner, connectionId, target });
    requireValue(result.id === connectionId && result.owner?.kind === owner.kind && result.owner?.issuer === owner.issuer && result.owner?.subject === owner.subject && result.target === target, 403, 'CONNECTION_MISMATCH', 'Exact owner connection required');
    requireValue(result.active === true, 409, 'CONNECTION_DISABLED', 'Reconnect the configured owner account');
    return result;
  }
  async approval(actor: Actor, owner: { kind: string; issuer: string; subject: string }, reference: string, digest: string, connectionId: string, action: string) {
    const result = await this.call(actor, 'approval', { owner, reference, digest, connectionId, action });
    requireValue(result.approved === true && result.reference === reference && result.digest === digest && result.connectionId === connectionId && result.action === action && result.organization === owner.subject && result.adminIsCurrent === true && Date.parse(result.expiresAt) > Date.now(), 409, 'APPROVAL_NEEDED', 'Current Admin authorization for the exact content, destination and action is required');
    return result;
  }
  async execute(actor: Actor, input: Record<string, unknown>) { return this.call(actor, 'execute', input); }
}
