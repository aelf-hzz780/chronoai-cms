import { SignJWT } from 'jose';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { Store, Row } from './store.ts';
import type { OriginalAdapter, OriginalInput, OriginalResult } from './publishing.ts';
import { remote, remoteJson, RemoteError } from './http-client.ts';
import { requireValue } from './errors.ts';
import { render } from './render.ts';
import { safeUrl } from './config.ts';
import { provesBody } from './html-proof.ts';
import type { MetricsService } from './metrics.ts';
import { digest } from './content.ts';
import {BrowserRenderProof,type RenderProof} from './render-proof.ts';
import type { Alternate } from './alternates.ts';

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!); }
export class GhostAdapter implements OriginalAdapter {
  store: Store; mediaRoot: string; allowLoopback: boolean; environment: NodeJS.ProcessEnv;
  renderer:RenderProof;
  tracking?: { metrics: MetricsService; publicUrl: string; requireConsent: boolean };
  constructor(store: Store, mediaRoot: string, allowLoopback = false, environment = process.env, tracking?: { metrics: MetricsService; publicUrl: string; requireConsent: boolean }, renderer?:RenderProof) { this.store = store; this.mediaRoot = mediaRoot; this.allowLoopback = allowLoopback; this.environment = environment; this.tracking = tracking;this.renderer=renderer??new BrowserRenderProof(environment,tracking?[`${tracking.publicUrl}/tracker.js`]:[]); }
  async call(input: OriginalInput, path: string, method = 'GET', body?: unknown) {
    input.guard?.();
    const adminBase=this.store.get('SELECT base_url FROM site_admin_routes WHERE site_id=?',input.site.id)?.base_url??input.site.url;
    // Operator-provisioned private routes may use loopback HTTP even when every
    // public origin requires HTTPS. Non-loopback HTTP remains forbidden.
    safeUrl(adminBase, this.store.get('SELECT 1 FROM site_admin_routes WHERE site_id=?',input.site.id) ? true : this.allowLoopback);
    const key = this.environment[input.site.key_ref];
    requireValue(key && /^[a-f0-9]+:[a-f0-9]{64}$/.test(key), 409, 'GHOST_CREDENTIAL_REQUIRED', 'Operator must configure the Ghost integration key');
    const [id, secret] = key.split(':');
    const token = await new SignJWT({}).setProtectedHeader({ alg: 'HS256', kid: id, typ: 'JWT' }).setIssuedAt().setExpirationTime('5m').setAudience('/admin/').sign(Buffer.from(secret, 'hex'));
    if (!['GET','HEAD'].includes(method)) await input.beforeWrite?.();
    input.guard?.();
    return remoteJson(`${adminBase}/ghost/api/admin/${path}`, { method, headers: { authorization: `Ghost ${token}`, 'content-type': 'application/json', 'accept-version': 'v6.0' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  slug(input: OriginalInput) { return `chrono-${input.articleId}`; }
  marker(input: OriginalInput) { return `chrono-revision:${input.revisionId}:${input.digest}`; }
  publisherHtml(input:OriginalInput) {
    const owner=this.store.get('SELECT o.*,p.display_name FROM owners o LEFT JOIN owner_profiles p ON p.owner_id=o.id WHERE o.id=?',input.ownerId)!;
    return `<p data-chrono-owner="${escapeHtml(input.ownerId)}">Published by ${escapeHtml(owner.display_name??owner.subject)} (${owner.kind==='organization'?'Organization':'Personal'}) · Author: ${escapeHtml(input.creditedAuthor)}</p>`;
  }
  controlledHtml(input: OriginalInput) {
    const images = this.images(input); let source = input.markdown;
    for (const image of images) source = source.replaceAll(image.reference,image.url);
    return `<div data-chrono-revision="${this.marker(input)}">${render(source,new Set(images.map(image => image.url)))}</div>`;
  }
  images(input: OriginalInput): Array<Row & {reference:string;filename:string;url:string}> {
    return [...new Set(input.markdown.match(/asset:[a-f0-9-]{36}/g) ?? [])].map(reference => {
      const id = reference.slice(6); const asset = this.store.get('SELECT * FROM assets WHERE id=? AND article_id=? AND owner_id=?', id, input.articleId, input.ownerId);
      requireValue(asset, 409, 'PRIVATE_ASSET_MISMATCH', 'Article references an unavailable private image');
      const extension = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' } as Record<string,string>)[asset.mime];
      const filename = `${asset.digest}.${extension}`; return { ...asset, reference, filename, url: `${input.site.url}/content/images/chrono/${filename}` };
    });
  }
  async current(input: OriginalInput) {
    const result = await this.call(input, `posts/?filter=slug:${encodeURIComponent(this.slug(input))}&formats=html&include=authors`);
    requireValue(Array.isArray(result.posts) && result.posts.length <= 1, 502, 'GHOST_CONTRACT', 'Unexpected Ghost lookup result'); return result.posts[0] ?? null;
  }
  async publish(input: OriginalInput): Promise<OriginalResult> {
    const author = this.store.get('SELECT ghost_author_id FROM author_mappings WHERE site_id=? AND credited_author=?', input.site.id, input.creditedAuthor);
    requireValue(author, 409, 'AUTHOR_MAPPING_REQUIRED', 'Operator must map the credited author to this Ghost site');
    const existing = await this.current(input);
    if (input.action === 'publish' && existing) {
      requireValue(existing.html?.includes(this.marker(input)), 409, 'REMOTE_CONFLICT', 'Existing original has different content; reconcile before another write');
      return { remoteId: existing.id, url: existing.url };
    }
    requireValue(input.action !== 'update' || existing?.id === input.remoteId, 409, 'REMOTE_CONFLICT', 'Original remote mapping changed');
    const html = `<!--kg-card-begin: html-->${this.controlledHtml(input)}<!--kg-card-end: html-->`;
    const tracker = this.tracking?.metrics.config.enabled ? `<script defer src="${escapeHtml(this.tracking.publicUrl)}/tracker.js" data-endpoint="${escapeHtml(this.tracking.publicUrl)}/track/${this.tracking.metrics.token(input.articleId,input.releaseId)}.gif" data-require-consent="${this.tracking.requireConsent}"></script>` : '';
    const post = { title: input.title, slug: this.slug(input), html, status: 'published', authors: [author.ghost_author_id], meta_title: input.title, meta_description: input.markdown.replace(/[#*`|\[\]]/g, '').slice(0, 155), codeinjection_foot: this.publisherHtml(input)+tracker, tags: [{ name: `#owner-${input.ownerId}` }, { name: `#language-${input.language}` }], ...(existing ? { updated_at: existing.updated_at } : {}) };
    const result = await this.call(input, existing ? `posts/${existing.id}/?source=html` : 'posts/?source=html', existing ? 'PUT' : 'POST', { posts: [post] });
    const saved = result.posts?.[0]; if(!saved?.id || !saved?.url)throw new RemoteError('GHOST_CONTRACT','Accepted Ghost write has no complete identity; reconcile the existing slug before retrying',true);
    return { remoteId: saved.id, url: saved.url };
  }
  async verify(input: OriginalInput, result: OriginalResult): Promise<boolean> {
    const url = safeUrl(result.url, this.allowLoopback); requireValue(url.origin === new URL(input.site.url).origin, 502, 'GHOST_URL_MISMATCH', 'Ghost URL outside configured publication');
    const post = await this.current(input);
    const author = this.store.get('SELECT ghost_author_id FROM author_mappings WHERE site_id=? AND credited_author=?', input.site.id, input.creditedAuthor);
    if (input.action === 'unpublish') {
      if (post?.status === 'published') return false;
      try { await remote(url); return false; } catch (error) { return error instanceof RemoteError && ['REMOTE_NOT_FOUND','REMOTE_GONE'].includes(error.code); }
    }
    if (post?.id !== result.remoteId || post?.status !== 'published' || post.title!==input.title || !post.html?.includes(this.marker(input)) || post.authors?.[0]?.id !== author?.ghost_author_id) return false;
    let page: string;
    try { page = (await remote(url)).text; } catch { return false; }
    if (!page.includes(this.marker(input)) || !page.includes(escapeHtml(input.title)) || !new RegExp(`lang=["']${input.language}(?:-[^"']+)?["']`).test(page)) return false;
    if(!page.includes(this.publisherHtml(input)))return false;
    if (!provesBody(this.controlledHtml(input),post.html,page,this.marker(input),input.site.url)) return false;
    if(!await this.renderer.verify(result.url,page,this.marker(input)))return false;
    input.guard?.();
    // The exact original is now demonstrably public. Only now materialize public images
    // in a directory served by Ghost itself, independently of the application process.
    for (const image of this.images(input)) {
      const directory = join(this.mediaRoot, input.site.id); await mkdir(directory, { recursive: true, mode: 0o755 });
      input.guard?.();
      const target = join(directory, image.filename), temporary = `${target}.${input.releaseId}.tmp`;
      await writeFile(temporary, image.content, { mode: 0o644 }); input.guard?.(); await rename(temporary, target);
      try { const response = await remote(image.url,{},5_000_000); if (!response.response.headers.get('content-type')?.startsWith(image.mime) || digest(response.bytes)!==image.digest) return false; } catch { return false; }
      input.guard?.();
      this.store.run('INSERT OR IGNORE INTO asset_publications VALUES (?,?,?)', image.id, input.releaseId, target);
    }
    return true;
  }
  async reconcile(input: OriginalInput) {
    const post = await this.current(input);
    if (!post) return null;
    if (input.action !== 'unpublish' && !post.html?.includes(this.marker(input))) return null;
    return { remoteId: post.id, url: post.url ?? input.url };
  }
  async unpublish(input: OriginalInput) {
    const existing = await this.current(input);
    requireValue(existing?.id === input.remoteId, 409, 'REMOTE_CONFLICT', 'Original remote mapping unavailable');
    await this.call(input, `posts/${existing.id}/`, 'PUT', { posts: [{ updated_at: existing.updated_at, status: 'draft' }] });
  }
  async alternates(input:OriginalInput,links:Alternate[]) {
    const post=await this.current(input);
    requireValue(post?.id===input.remoteId && post.status==='published' && provesBody(this.controlledHtml(input),post.html,post.html,this.marker(input),input.site.url),409,'PUBLICATION_CHANGED','Only the exact current original may receive translation metadata');
    for(const link of links) safeUrl(link.url,this.allowLoopback);
    const start='<!--chrono-alternates:start-->',end='<!--chrono-alternates:end-->';
    const clean=(value:string|null)=> (value??'').replace(/<!--chrono-alternates:start-->[\s\S]*?<!--chrono-alternates:end-->/g,'');
    const head=links.length?`${start}${[{language:input.language,url:post.url},...links].map(link=>`<link rel="alternate" hreflang="${escapeHtml(link.language)}" href="${escapeHtml(link.url)}">`).join('')}${end}`:'';
    const foot=links.length?`${start}<nav aria-label="Translations">${links.map(link=>`<a lang="${escapeHtml(link.language)}" hreflang="${escapeHtml(link.language)}" href="${escapeHtml(link.url)}">${link.language==='zh'?'简体中文':'English'}</a>`).join(' ')}</nav>${end}`:'';
    const codeinjection_head=clean(post.codeinjection_head)+head,codeinjection_foot=clean(post.codeinjection_foot)+foot;
    if(codeinjection_head===post.codeinjection_head && codeinjection_foot===post.codeinjection_foot)return;
    await this.call(input,`posts/${post.id}/`,'PUT',{posts:[{updated_at:post.updated_at,codeinjection_head,codeinjection_foot}]});
    const page=(await remote(post.url)).text;
    requireValue(links.every(link=>page.includes(`hreflang="${escapeHtml(link.language)}" href="${escapeHtml(link.url)}"`)) && (links.length>0 || !page.includes(start)),502,'ALTERNATES_UNVERIFIED','Public translation metadata could not be verified');
  }
}
