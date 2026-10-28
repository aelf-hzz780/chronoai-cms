import { randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Config } from './config.ts';
import { safeUrl } from './config.ts';
import { Store } from './store.ts';
import { Vault } from './vault.ts';
import { AppError, requireValue, text } from './errors.ts';
import { remoteJson } from './http-client.ts';
import { digest } from './content.ts';
import type { Actor, Policy } from './policy.ts';

export class AuthManager {
  config: Config; store: Store; vault: Vault; policy: Policy;
  discovery: any; keys: ReturnType<typeof createRemoteJWKSet> | undefined;
  constructor(config: Config, store: Store, vault: Vault, policy: Policy) { this.config = config; this.store = store; this.vault = vault; this.policy = policy; }
  async discover() {
    if (this.discovery) return this.discovery;
    const discovery = await remoteJson(`${this.config.issuer}/.well-known/openid-configuration`);
    requireValue(discovery.issuer === this.config.issuer, 502, 'OIDC_ISSUER', 'Discovery issuer mismatch');
    for (const key of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) safeUrl(discovery[key], this.config.allowLoopback);
    requireValue(discovery.code_challenge_methods_supported?.includes('S256'), 502, 'OIDC_PKCE', 'Issuer must support PKCE S256');
    this.discovery = discovery; this.keys = createRemoteJWKSet(new URL(discovery.jwks_uri), { timeoutDuration: 8000, cooldownDuration: 1000 });
    return discovery;
  }
  actor(payload: JWTPayload, credential: string): Actor {
    requireValue(payload.iss === this.config.issuer && typeof payload.sub === 'string' && typeof payload.exp === 'number' && payload.exp * 1000 > Date.now() && typeof payload.scope === 'string', 401, 'INVALID_TOKEN', 'Invalid caller token');
    return { issuer: payload.iss, subject: payload.sub, scopes: payload.scope.split(' ').filter(Boolean), credential };
  }
  async accessToken(token: string, audience: string) {
    await this.discover();
    try {
      const result = await jwtVerify(token, this.keys!, { issuer: this.config.issuer, audience, algorithms: ['RS256', 'ES256'], requiredClaims: ['sub', 'exp', 'iat'] });
      requireValue(result.protectedHeader.typ === 'at+jwt', 401, 'INVALID_TOKEN', 'Access token required; ID tokens cannot authorize service calls');
      const actor = this.actor(result.payload, token); await this.policy.scope(actor, 'content:read'); return actor;
    } catch { throw new AppError(401, 'INVALID_TOKEN', 'Caller token could not be verified'); }
  }
  async authenticate(request: FastifyRequest): Promise<Actor | null> {
    if (request.url.startsWith('/api/service/')) {
      const header = request.headers.authorization;
      if (!header?.startsWith('Bearer ')) return null;
      return this.accessToken(header.slice(7), this.config.serviceAudience);
    }
    const session = request.cookies.chrono_session;
    if (!session) return null;
    const row = this.store.get('SELECT * FROM sessions WHERE id=? AND expires_at>?', digest(session), new Date().toISOString());
    if (!row) return null;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      requireValue(request.headers.origin === this.config.publicUrl && request.headers['x-csrf-token'] === row.csrf, 403, 'CSRF', 'Same-origin request and CSRF token required');
    }
    const actor = this.vault.open<Actor>(row.actor_json);
    await this.policy.scope(actor, 'content:read');
    return actor;
  }
  install(app: FastifyInstance) {
    const cookie = { httpOnly: true, secure: this.config.publicUrl.startsWith('https:'), sameSite: 'lax' as const, path: '/' };
    app.get('/auth/login', async (_request, reply) => {
      const discovery = await this.discover(); const state = randomBytes(32).toString('base64url'), nonce = randomBytes(32).toString('base64url'), verifier = randomBytes(48).toString('base64url');
      this.store.run('DELETE FROM oidc_states WHERE expires_at<?', new Date().toISOString());
      this.store.run('INSERT INTO oidc_states VALUES (?,?,?,?)', digest(state), nonce, verifier, new Date(Date.now() + 300_000).toISOString());
      const url = new URL(discovery.authorization_endpoint);
      const challenge = Buffer.from(digest(verifier), 'hex').toString('base64url');
      url.search = new URLSearchParams({ client_id: this.config.clientId, response_type: 'code', redirect_uri: `${this.config.publicUrl}/auth/callback`, scope: 'openid profile content:read content:write publish metrics:read roles:write connections:read', state, nonce, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
      reply.setCookie('chrono_oidc', state, { ...cookie, maxAge: 300 }); return reply.redirect(url.href);
    });
    app.get('/auth/callback', async (request, reply) => {
      const query = request.query as Record<string, unknown>;
      const state = text(query.state, 'state', 200);
      requireValue(state === request.cookies.chrono_oidc, 401, 'OIDC_STATE', 'Invalid login state');
      const saved = this.store.get('SELECT * FROM oidc_states WHERE state=? AND expires_at>?', digest(state), new Date().toISOString());
      requireValue(saved, 401, 'OIDC_STATE', 'Login state expired or already used');
      this.store.run('DELETE FROM oidc_states WHERE state=?', digest(state)); reply.clearCookie('chrono_oidc', cookie);
      const discovery = await this.discover();
      const body = new URLSearchParams({ client_id: this.config.clientId, grant_type: 'authorization_code', code: text(query.code, 'code', 4096), redirect_uri: `${this.config.publicUrl}/auth/callback`, code_verifier: saved.verifier });
      if (this.config.clientSecret) body.set('client_secret', this.config.clientSecret);
      const tokens = await remoteJson(discovery.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
      const id = await jwtVerify(tokens.id_token, this.keys!, { issuer: this.config.issuer, audience: this.config.clientId, algorithms: ['RS256', 'ES256'], requiredClaims: ['exp', 'iat', 'sub', 'nonce'] }).catch(() => { throw new AppError(401, 'OIDC_ID_TOKEN', 'Invalid sign-in response'); });
      requireValue(id.payload.nonce === saved.nonce, 401, 'OIDC_NONCE', 'Invalid login nonce');
      const actor = await this.accessToken(tokens.access_token, this.config.cmsAudience);
      requireValue(id.payload.sub === actor.subject, 401, 'OIDC_SUBJECT', 'Token subject mismatch');
      const ownerId = `personal-${digest(`${actor.issuer}\n${actor.subject}`).slice(0, 32)}`;
      this.store.run('INSERT OR IGNORE INTO owners VALUES (?,?,?,?)', ownerId, 'personal', actor.issuer, actor.subject);
      const session = randomBytes(32).toString('base64url'), csrf = randomBytes(32).toString('base64url');
      const payload = JSON.parse(Buffer.from(tokens.access_token.split('.')[1], 'base64url').toString());
      this.store.run('INSERT INTO sessions VALUES (?,?,?,?)', digest(session), this.vault.seal(actor), csrf, new Date(Math.min(payload.exp * 1000, Date.now() + 3_600_000)).toISOString());
      this.store.audit(actor.subject, ownerId, 'identity.signin', ownerId, request.id);
      reply.setCookie('chrono_session', session, { ...cookie, maxAge: 3600 }); return reply.redirect('/');
    });
    app.post('/auth/logout', async (request, reply) => {
      const actor = await this.authenticate(request); requireValue(actor, 401, 'UNAUTHENTICATED', 'Sign in required');
      this.store.run('DELETE FROM sessions WHERE id=?', digest(request.cookies.chrono_session ?? ''));
      reply.clearCookie('chrono_session', cookie); return { signedOut: true };
    });
  }
}
