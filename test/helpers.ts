import { Store } from '../src/store.ts';
import { ContentService } from '../src/content.ts';
import { Policy, type Authority, type Actor } from '../src/policy.ts';

export function fixture() {
  const store = new Store(':memory:');
  const memberships = new Map<string, string>([['member:org', 'member'], ['admin:org', 'admin'], ['publisher:org', 'member']]);
  const revoked = new Set<string>();
  const authority: Authority = {
    async validate(actor) { if (revoked.has(actor.subject)) throw new Error('revoked'); },
    async membership(actor, organization) { return memberships.get(`${actor.subject}:${organization}`) ?? null; },
  };
  const actors = Object.fromEntries(['solo', 'member', 'admin', 'publisher', 'outsider'].map(subject => [subject, {
    issuer: 'https://identity.example', subject, scopes: ['content:read', 'content:write', 'publish', 'metrics:read', 'roles:write', 'connections:read'], credential: 'test-only',
  }])) as Record<string, Actor>;
  for (const subject of Object.keys(actors)) store.createOwner(subject, 'personal', actors[subject].issuer, subject);
  store.createOwner('org', 'organization', actors.admin.issuer, 'org');
  const policy = new Policy(store, authority);
  const content = new ContentService(store, policy);
  return { store, memberships, revoked, actors, policy, content };
}

