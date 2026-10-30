import { randomBytes } from 'node:crypto';
import { jwtVerify } from 'jose';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Config } from './config.ts';
import { Store } from './store.ts';
import { Vault } from './vault.ts';
import { AppError, requireValue, text } from './errors.ts';
import { remoteJson } from './http-client.ts';
import { digest } from './content.ts';
import type { Actor, Policy } from './policy.ts';
import {CallerAuthorization} from './caller-authorization.ts';

export class AuthManager {
  config: Config; store: Store; vault: Vault; policy: Policy;
  callers:CallerAuthorization;
  constructor(config: Config, store: Store, vault: Vault, policy: Policy) { this.config = config; this.store = store; this.vault = vault; this.policy = policy; this.callers=new CallerAuthorization(config); }
  get discovery(){return this.callers.discovery;} set discovery(value:any){this.callers.discovery=value;}
  get keys(){return this.callers.keys;} set keys(value:CallerAuthorization['keys']){this.callers.keys=value;}
  discover(){return this.callers.discover();}
  async accessToken(token: string, audience: string, entry:'cms'|'service'='service') {
    try {
      const payload=await this.callers.access(token,audience);
      const actor=this.callers.actor(payload,token,this.callers.directBinding(payload,entry,audience));
      await this.policy.scope(actor,'content:read');return actor;
    } catch { throw new AppError(401, 'INVALID_TOKEN', 'Caller token could not be verified'); }
  }
  async authenticate(request: FastifyRequest): Promise<Actor | null> {
    if (request.url.startsWith('/api/service/')) {
      const identity=request.headers['x-nyxid-identity-token'], delegation=request.headers['x-nyxid-delegation-token'];
      if (identity || delegation) {
        requireValue(typeof identity === 'string' && typeof delegation === 'string',401,'INVALID_TOKEN','Both signed identity and delegated authority are required');
        return this.provision(await this.propagated(identity,delegation));
      }
      const header = request.headers.authorization;
      if (!header?.startsWith('Bearer ')) return null;
      return this.provision(await this.accessToken(header.slice(7), this.config.serviceAudience));
    }
    const session = request.cookies.chrono_session;
    if (!session) return null;
    const row = this.store.get('SELECT * FROM sessions WHERE id=? AND expires_at>?', digest(session), new Date().toISOString());
    if (!row) return null;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      requireValue(request.headers.origin === this.config.publicUrl && request.headers['x-csrf-token'] === row.csrf, 403, 'CSRF', 'Same-origin request and CSRF token required');
    }
    const saved = this.vault.open<Actor>(row.actor_json);
    const actor = await this.accessToken(saved.credential,this.config.cmsAudience,'cms');
    await this.policy.scope(actor, 'content:read');
    return actor;
  }
  provision(actor:Actor) {
    const ownerId=`personal-${digest(`${actor.issuer}\n${actor.subject}`).slice(0,32)}`;
    this.store.run('INSERT OR IGNORE INTO owners VALUES (?,?,?,?)',ownerId,'personal',actor.issuer,actor.subject);
    return actor;
  }
  async propagated(identity: string, delegation: string) {
    await this.discover();
    requireValue(this.config.serviceId && this.config.serviceSlug && this.config.nyxAudience,503,'SERVICE_IDENTITY_CONFIGURATION','Registered service identity configuration required');
    try {
      const assertion=await jwtVerify(identity,this.keys!,{issuer:this.config.issuer,audience:this.config.serviceAudience,algorithms:['RS256'],requiredClaims:['sub','iat','exp','jti','nyx_service_id']});
      const delegated=await jwtVerify(delegation,this.keys!,{issuer:this.config.issuer,audience:this.config.nyxAudience,algorithms:['RS256'],requiredClaims:['sub','iat','exp','jti','scope']});
      const p=delegated.payload;
      const issued=Number(assertion.payload.iat),lifetime=Number(assertion.payload.exp)-issued;
      requireValue(assertion.payload.nyx_service_id === this.config.serviceId && lifetime>0 && lifetime<=60 && issued<=Date.now()/1000+5 && assertion.payload.sub === p.sub && p.token_type === 'access' && p.delegated === true && p.sa !== true && p.relay !== true && (p.act as {sub?:string})?.sub === this.config.serviceSlug,401,'INVALID_TOKEN','Identity and delegated authority binding mismatch');
      const actor=this.callers.actor(p,delegation,{kind:'propagated',serviceId:this.config.serviceId,serviceSlug:this.config.serviceSlug,identityAudience:this.config.serviceAudience,delegationAudience:this.config.nyxAudience});await this.policy.scope(actor,'content:read');return actor;
    } catch { throw new AppError(401,'INVALID_TOKEN','Propagated caller could not be verified'); }
  }
  install(app: FastifyInstance) {
    const cookie = { httpOnly: true, secure: this.config.publicUrl.startsWith('https:'), sameSite: 'lax' as const, path: '/' };
    app.get('/auth/login', async (_request, reply) => {
      const discovery = await this.discover(); const state = randomBytes(32).toString('base64url'), nonce = randomBytes(32).toString('base64url'), verifier = randomBytes(48).toString('base64url');
      this.store.run('DELETE FROM oidc_states WHERE expires_at<?', new Date().toISOString());
      this.store.run('INSERT INTO oidc_states VALUES (?,?,?,?)', digest(state), nonce, verifier, new Date(Date.now() + 300_000).toISOString());
      const url = new URL(discovery.authorization_endpoint);
      const challenge = Buffer.from(digest(verifier), 'hex').toString('base64url');
      url.search = new URLSearchParams({ client_id: this.config.clientId, response_type: 'code', redirect_uri: `${this.config.publicUrl}/auth/callback`, scope: this.config.oauthScopes ?? 'openid profile', state, nonce, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
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
      if (id.payload.at_hash) requireValue(id.payload.at_hash === Buffer.from(digest(tokens.access_token), 'hex').subarray(0, 16).toString('base64url'), 401, 'OIDC_ACCESS_HASH', 'Login access token binding mismatch');
      const actor = await this.accessToken(tokens.access_token, this.config.cmsAudience,'cms');
      requireValue(id.payload.sub === actor.subject, 401, 'OIDC_SUBJECT', 'Token subject mismatch');
      const ownerId = `personal-${digest(`${actor.issuer}\n${actor.subject}`).slice(0, 32)}`;
      this.provision(actor);
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
