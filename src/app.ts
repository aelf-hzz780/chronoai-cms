import Fastify, { type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { AppError, requireValue, object, text } from './errors.ts';
import type { Store } from './store.ts';
import type { Policy, Actor } from './policy.ts';
import type { ContentService } from './content.ts';
import type { Vault } from './vault.ts';
import type { AuthManager } from './auth.ts';
import { MediaService } from './media.ts';
import { render } from './render.ts';
import { PublishingService } from './publishing.ts';
import { MetricsService } from './metrics.ts';
import type { DistributionService } from './distribution.ts';
import { AlternateService } from './alternates.ts';
import {openApi} from './openapi.ts';

declare module 'fastify' { interface FastifyRequest { actor: Actor; } }
export interface AppDependencies {
  store: Store; policy: Policy; content: ContentService; vault: Vault; publicUrl: string;
  authenticate(request: FastifyRequest): Promise<Actor | null>; auth?: AuthManager;
  metrics?: MetricsService;
  distribution?: DistributionService;
  trustedProxyCidrs?: string[];
}
export async function createApp(deps: AppDependencies) {
  const app = Fastify({ bodyLimit: 7_000_000, routerOptions:{maxParamLength:1024}, genReqId: () => randomUUID(), logger: false, trustProxy: deps.trustedProxyCidrs?.length ? deps.trustedProxyCidrs : false });
  await app.register(cookie);
  app.addContentTypeParser('text/markdown',{parseAs:'buffer',bodyLimit:2_000_000},(_request,body,done)=>done(null,body));
  app.decorateRequest('actor', null as unknown as Actor);
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-trace-id', request.id).header('cache-control', 'no-store').header('x-content-type-options', 'nosniff').header('referrer-policy', 'same-origin');
    reply.header('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  });
  app.setErrorHandler((error, request, reply) => {
    const known = error instanceof AppError;
    const status = known ? error.status : (error as { statusCode?: number }).statusCode;
    const safeStatus = status && status >= 400 && status < 500 ? status : known ? error.status : 500;
    // Deliberately log only safe classifications; never raw remote errors, cookies or headers.
    if (safeStatus >= 500) process.stderr.write(JSON.stringify({ event: 'request.failed', traceId: request.id, code: known ? error.code : 'INTERNAL' }) + '\n');
    return reply.code(safeStatus).send({ code: known ? error.code : safeStatus === 500 ? 'INTERNAL' : 'INVALID_REQUEST', message: known ? error.message : safeStatus === 500 ? 'Request failed' : 'Invalid request', traceId: request.id });
  });
  app.get('/health', async () => ({ status: 'ok', database: !!deps.store.get('SELECT version FROM migrations LIMIT 1') }));
  app.get('/openapi.json',async()=>openApi(deps.publicUrl));
  app.get('/', async (_request, reply) => reply.type('text/html').send(await readFile(new URL('../web/index.html', import.meta.url))));
  app.get('/app.js', async (_request, reply) => reply.type('text/javascript').send(await readFile(new URL('../web/app.js', import.meta.url))));
  app.get('/style.css', async (_request, reply) => reply.type('text/css').send(await readFile(new URL('../web/style.css', import.meta.url))));
  deps.auth?.install(app);
  const metrics = deps.metrics ?? new MetricsService(deps.content, { enabled: false, requireConsent: true, secret: randomUUID() });
  app.get('/track/:token.gif', async (request, reply) => {
    const q = request.query as Record<string,string>;
    try { await metrics.collect((request.params as {token:string}).token, { ip: request.ip, userAgent: request.headers['user-agent'] ?? '', consent: q.consent === '1', doNotTrack: request.headers['sec-gpc'] === '1' || request.headers.dnt === '1', referral: q.referrer, campaign: q.campaign }); }
    catch { process.stderr.write(JSON.stringify({ event: 'metrics.collection.failed', traceId: request.id }) + '\n'); }
    return reply.type('image/gif').send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64'));
  });
  app.get('/tracker.js', async (_request, reply) => reply.type('text/javascript').send(await readFile(new URL('../web/tracker.js', import.meta.url))));
  const media = new MediaService(deps.content);
  const publishing = new PublishingService(deps.content, deps.vault);
  const distribution = () => { requireValue(deps.distribution, 503, 'DISTRIBUTION_UNAVAILABLE', 'Distribution is not configured'); return deps.distribution; };
  for (const entry of ['cms', 'service']) {
    await app.register(async api => {
      api.addHook('preHandler', async request => {
        const actor = await deps.authenticate(request); requireValue(actor, 401, 'UNAUTHENTICATED', 'Sign in with NyxID required'); request.actor = actor;
      });
      api.get('/me', async request => {
        await deps.policy.scope(request.actor, 'content:read');
        const workspaces = [];
        for (const owner of deps.store.all('SELECT * FROM owners WHERE issuer=? AND (kind=? OR subject=?) LIMIT 1000', request.actor.issuer, 'organization', request.actor.subject)) {
          try { await deps.policy.owner(request.actor, owner.id); }
          catch (error) { if (error instanceof AppError && error.code === 'FORBIDDEN') continue; throw error; }
          workspaces.push({ id: owner.id, kind: owner.kind, name: deps.store.get('SELECT display_name FROM owner_profiles WHERE owner_id=?',owner.id)?.display_name??owner.subject, canPublish: request.actor.scopes.includes('publish') && await deps.policy.canPublish(request.actor, owner) });
        }
        const session = deps.store.get('SELECT csrf FROM sessions WHERE id=?', (await import('./content.ts')).digest(request.cookies.chrono_session ?? ''));
        return { subject: request.actor.subject, workspaces, csrf: entry === 'cms' ? session?.csrf : undefined };
      });
      api.get('/metrics', async request => { const q = request.query as Record<string,string>; return metrics.query(request.actor, text(q.ownerId, 'ownerId'), q); });
      api.get('/articles', async request => {
        const q = request.query as Record<string, string>;
        return deps.content.list(request.actor, text(q.ownerId, 'ownerId'), q.q ?? '', Number(q.limit ?? 50), Number(q.offset ?? 0));
      });
      api.post('/articles', async (request, reply) => reply.code(201).send(await deps.content.create(request.actor, object(request.body), request.id)));
      const markdownBody=(request:FastifyRequest)=>{requireValue(Buffer.isBuffer(request.body),400,'MARKDOWN_UPLOAD','Use text/markdown with the original UTF-8 file');try{return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(request.body);}catch{throw new AppError(400,'MARKDOWN_ENCODING','Markdown must be valid UTF-8');}};
      api.post('/articles/import',async(request,reply)=>reply.code(201).send(await deps.content.create(request.actor,{...(request.query as Record<string,string>),markdown:markdownBody(request)},request.id)));
      api.put('/articles/:id/markdown',async request=>deps.content.edit(request.actor,(request.params as {id:string}).id,text((request.query as {expectedRevision:string}).expectedRevision,'expectedRevision'),{markdown:markdownBody(request)},request.id));
      api.get('/articles/:id', async request => deps.content.get(request.actor, (request.params as {id:string}).id, (request.query as {revision?:string}).revision));
      api.patch('/articles/:id', async request => {
        const body = object(request.body); const { expectedRevision, ...changes } = body;
        requireValue(Object.keys(changes).every(k => ['title', 'markdown', 'creditedAuthor'].includes(k)), 400, 'INVALID_INPUT', 'Only title, markdown and creditedAuthor may change');
        return deps.content.edit(request.actor, (request.params as {id:string}).id, text(expectedRevision, 'expectedRevision'), changes, request.id);
      });
      api.post('/articles/:id/submit', async request => deps.content.submit(request.actor, (request.params as {id:string}).id, text(object(request.body).revisionId, 'revisionId'), request.id));
      api.post('/articles/:id/releases', async (request, reply) => reply.code(202).send(await publishing.confirm(request.actor, (request.params as {id:string}).id, object(request.body), request.id)));
      api.get('/articles/:id/releases', async request => publishing.list(request.actor, (request.params as {id:string}).id));
      api.post('/releases/:id/cancel', async request => publishing.cancel(request.actor, (request.params as {id:string}).id, request.id));
      api.post('/releases/:id/reconcile', async request => publishing.reconcile(request.actor, (request.params as {id:string}).id, request.id));
      api.post('/articles/:id/sync-links',async request=>new AlternateService(publishing).request(request.actor,(request.params as {id:string}).id,request.id));
      api.get('/articles/:id/link-status',async request=>{const article=await deps.content.get(request.actor,(request.params as {id:string}).id);return deps.store.all('SELECT p.id,p.state,p.error_code,p.trace_id,r.attempts,r.next_attempt_at FROM projections p LEFT JOIN projection_retries r ON r.projection_id=p.id WHERE p.article_id=? ORDER BY p.rowid DESC LIMIT 20',article.id);});
      api.get('/targets', async request => { await deps.policy.scope(request.actor, 'publish'); return distribution().targets.list(); });
      api.get('/owners/:id/connections',async request=>distribution().availableConnections(request.actor,(request.params as {id:string}).id));
      api.post('/releases/:id/deliveries', async (request, reply) => reply.code(202).send(await distribution().request(request.actor, (request.params as {id:string}).id, object(request.body), request.id)));
      api.get('/articles/:id/deliveries', async request => distribution().list(request.actor, (request.params as {id:string}).id));
      api.get('/deliveries/:id/package', async request => distribution().package(request.actor, (request.params as {id:string}).id));
      api.post('/deliveries/:id/authorize', async request => distribution().authorize(request.actor, (request.params as {id:string}).id, text(object(request.body).approvalRef, 'approvalRef'), request.id));
      api.post('/deliveries/:id/request-approval', async request => distribution().requestApproval(request.actor,(request.params as {id:string}).id,request.id));
      api.post('/deliveries/:id/cancel', async request => distribution().cancel(request.actor, (request.params as {id:string}).id, request.id));
      api.post('/deliveries/:id/reconcile', async request => distribution().reconcile(request.actor, (request.params as {id:string}).id, request.id));
      api.post('/deliveries/:id/report', async request => { const b = object(request.body); return distribution().report(request.actor, (request.params as {id:string}).id, text(b.state, 'state'), b.url ? text(b.url, 'url', 2000) : null, request.id); });
      api.post('/deliveries/:id/metrics/refresh',async request=>distribution().refreshMetrics(request.actor,(request.params as {id:string}).id,request.id));
      api.get('/articles/:id/markdown', async (request, reply) => {
        const data = await deps.content.markdown(request.actor, (request.params as {id:string}).id, text((request.query as {revision:string}).revision, 'revision'));
        return reply.type('text/markdown; charset=utf-8').header('content-disposition', 'attachment; filename="article.md"').send(data);
      });
      api.get('/articles/:id/revisions', async request => {
        const article = deps.content.article((request.params as {id:string}).id);
        const current = await deps.content.visibleRevision(request.actor, article);
        return article.creator === request.actor.subject ? deps.store.all('SELECT id,title,digest,credited_author,created_at FROM revisions WHERE article_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100', article.id) : [{ id: current.id, title: current.title, digest: current.digest, credited_author: current.credited_author, created_at: current.created_at }];
      });
      api.get('/articles/:id/preview', async request => {
        const article = await deps.content.get(request.actor, (request.params as {id:string}).id, (request.query as {revision?:string}).revision);
        return { html: render(article.revision.markdown), revisionId: article.revision.id, private: true };
      });
      api.post('/articles/:id/translation', async request => {
        const b = object(request.body); return deps.content.linkTranslation(request.actor, (request.params as {id:string}).id, text(b.sourceArticleId, 'sourceArticleId'), text(b.sourceRevisionId, 'sourceRevisionId'), request.id);
      });
      api.put('/owners/:ownerId/publishers/:subject', async request => {
        const p = request.params as {ownerId:string;subject:string}; const b = object(request.body);
        requireValue(typeof b.enabled === 'boolean', 400, 'INVALID_INPUT', 'enabled must be boolean');
        await deps.policy.setPublisher(request.actor, p.ownerId, p.subject, b.enabled, request.id); return { enabled: b.enabled };
      });
      api.post('/articles/:id/assets', async (request, reply) => {
        const b = object(request.body); return reply.code(201).send(await media.upload(request.actor, (request.params as {id:string}).id, text(b.mime, 'mime'), text(b.base64, 'base64', 7_000_000), request.id));
      });
      api.get('/assets/:id', async (request, reply) => { const asset = await media.get(request.actor, (request.params as {id:string}).id); return reply.type(asset.mime).header('content-disposition', 'inline').send(asset.data); });
      api.get('/owners/:id/audit', async request => {
        const id = (request.params as {id:string}).id; const owner = await deps.policy.owner(request.actor, id);
        requireValue(owner.kind === 'personal' || await deps.policy.membership(request.actor, owner) === 'admin', 403, 'FORBIDDEN', 'Owner or organization Admin required');
        return deps.store.all('SELECT * FROM audit WHERE owner_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100', id);
      });
    }, { prefix: `/api/${entry}` });
  }
  return app;
}
