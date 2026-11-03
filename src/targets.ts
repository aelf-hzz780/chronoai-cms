import { AppError, requireValue } from './errors.ts';
import { RemoteError } from './http-client.ts';
import { safeUrl } from './config.ts';

export interface RemoteRequest { method: string; url: string; body?: Record<string, any>; }
export type Send = (request: RemoteRequest) => Promise<any>;
export interface CopyPayload {
  deliveryId: string; ownerKind: string; title: string; markdown: string; sourceUrl: string; sourceDigest: string;
  creditedAuthor: string; language: string; format: string; action: string; remoteId?: string; remoteUrl?: string;
  accountId: string; connectionFingerprint: string;
}
export interface CopyResult { state: 'published' | 'removed' | 'submitted'; remoteId: string; url: string; sourceVerified: boolean; }
export interface Engagement {views:number|null;reactions:number|null;comments:number|null;source:string;}
export interface Target {
  name: string; automatic: boolean;
  automaticActions?:string[];
  request?(payload:CopyPayload,connection:any):RemoteRequest;
  metrics?(payload:CopyPayload,connection:any,send:Send):Promise<Engagement>;
  write(payload: CopyPayload, connection: any, send: Send): Promise<CopyResult>;
  reconcile(payload: CopyPayload, connection: any, send: Send): Promise<CopyResult | null>;
}
export class TargetRegistry {
  targets: Map<string, Target>;
  disabled: Set<string>;
  constructor(targets: Target[], disabled: string[] = []) { this.targets = new Map(targets.map(target => [target.name, target])); this.disabled = new Set(disabled); }
  get(name: string, historical = false) { const target = this.targets.get(name); requireValue(target && (historical || !this.disabled.has(name)), 409, 'TARGET_DISABLED', 'Destination is disabled or unsupported'); return target; }
  list() { return [...this.targets.values()].filter(t=>!this.disabled.has(t.name)).map(t => ({ name: t.name, automatic: t.automatic,automaticActions:t.automaticActions??[] })); }
}
export function copyBody(payload: CopyPayload) { return `${payload.markdown}\n\nAuthor: ${payload.creditedAuthor}\n\nOriginal: [${payload.sourceUrl}](${payload.sourceUrl})\n\n<!-- chrono-delivery:${payload.deliveryId} -->`; }
function sameBody(actual:unknown,payload:CopyPayload) { return typeof actual==='string' && actual.replace(/\r\n/g,'\n').trim()===copyBody(payload).replace(/\r\n/g,'\n').trim(); }
function hashnodeData(result: any) {
  if (result.errors?.length) {
    const code = result.errors[0]?.extensions?.code;
    throw new AppError(409, code === 'FORBIDDEN' ? 'PLAN_OR_PERMISSION_REQUIRED' : 'DESTINATION_REJECTED', code === 'FORBIDDEN' ? 'Hashnode Pro and publication publishing authority are required' : 'Hashnode rejected the operation; review the configured contract');
  }
  requireValue(result.data, 502, 'REMOTE_CONTRACT', 'Missing Hashnode data'); return result.data;
}
export class DevAdapter implements Target {
  name = 'dev'; automatic = true; automaticActions=['create','update']; endpoint: string;
  constructor(endpoint: string) { this.endpoint = safeUrl(endpoint).href.replace(/\/$/, ''); }
  normalize(post: any, payload: CopyPayload, connection: any): CopyResult | null {
    if (!post || payload.remoteId && String(post.id)!==payload.remoteId || String(post.user?.user_id ?? post.user_id) !== String(connection.accountId) || (payload.ownerKind === 'organization' && String(post.organization?.id ?? post.organization_id) !== String(connection.organizationId))) return null;
    const content = post.body_markdown ?? '';
    if (post.canonical_url !== payload.sourceUrl || post.title!==payload.title || (!post.published_at && post.published!==true) || !sameBody(content,payload)) return null;
    return { state: 'published', remoteId: String(post.id), url: post.url, sourceVerified: true };
  }
  request(payload:CopyPayload,connection:any):RemoteRequest {
    requireValue(payload.action !== 'remove', 409, 'MANUAL_REMOVAL_REQUIRED', 'DEV does not provide an enabled removal route; follow up with the original author account');
    requireValue(connection.canPublish === true && (payload.action !== 'update' || connection.canUpdate === true), 409, 'ACCOUNT_RIGHTS_REQUIRED', 'Connected DEV author account lacks the required rights');
    if (payload.ownerKind === 'organization') requireValue(connection.organizationId, 409, 'ORGANIZATION_REQUIRED', 'DEV organization target is not configured');
    const article = { title: payload.title, body_markdown: copyBody(payload), published: true, canonical_url: payload.sourceUrl, ...(payload.ownerKind === 'organization' ? { organization_id: connection.organizationId } : {}) };
    return { method: payload.action === 'update' ? 'PUT' : 'POST', url: `${this.endpoint}/articles${payload.action === 'update' ? `/${encodeURIComponent(payload.remoteId!)}` : ''}`, body: { article } };
  }
  async write(payload: CopyPayload, connection: any, send: Send) {
    const result = await send(this.request(payload,connection));
    requireValue(result.id && result.url, 502, 'REMOTE_CONTRACT', 'DEV did not return the remote article');
    return { state: 'published' as const, remoteId: String(result.id), url: result.url, sourceVerified: false };
  }
  async reconcile(payload: CopyPayload, connection: any, send: Send): Promise<CopyResult | null> {
    if (payload.action === 'remove') return null;
    if (payload.remoteId) return this.normalize(await send({ method: 'GET', url: `${this.endpoint}/articles/${encodeURIComponent(payload.remoteId)}` }), payload, connection);
    for (let page = 1; page <= 10; page++) {
      const articles = await send({ method: 'GET', url: `${this.endpoint}/articles/me/all?per_page=100&page=${page}` });
      requireValue(Array.isArray(articles), 502, 'REMOTE_CONTRACT', 'Unexpected DEV article list');
      for (const article of articles) if (article.canonical_url === payload.sourceUrl && article.title === payload.title) {
        const match = this.normalize(await send({ method: 'GET', url: `${this.endpoint}/articles/${encodeURIComponent(article.id)}` }), payload, connection); if (match) return match;
      }
      if (articles.length < 100) break;
    }
    return null;
  }
  async metrics(payload:CopyPayload,connection:any,send:Send):Promise<Engagement> {
    requireValue(payload.remoteId,409,'COPY_MISMATCH','Known DEV copy required');
    const post=await send({method:'GET',url:`${this.endpoint}/articles/${encodeURIComponent(payload.remoteId)}`});
    requireValue(String(post.user?.user_id??post.user_id)===connection.accountId && (payload.ownerKind!=='organization'||String(post.organization?.id??post.organization_id)===String(connection.organizationId)),403,'COPY_MISMATCH','Metrics source differs from the exact owner copy');
    let views:null|number=null;
    for(let page=1;page<=10;page++) {
      const rows=await send({method:'GET',url:`${this.endpoint}/articles/me/published?per_page=100&page=${page}`});requireValue(Array.isArray(rows),502,'REMOTE_CONTRACT','Invalid authorized DEV metrics response');
      const match=rows.find(row=>String(row.id)===payload.remoteId);if(match){views=count(match.page_views_count);break;}if(rows.length<100)break;
    }
    return {views,reactions:count(post.public_reactions_count),comments:count(post.comments_count),source:'DEV authorized article API; lifetime counters'};
  }
}
export class HashnodeAdapter implements Target {
  name = 'hashnode'; automatic = true; automaticActions=['create','update','remove']; endpoint: string;
  constructor(endpoint: string) { this.endpoint = safeUrl(endpoint).href; }
  async gql(send: Send, query: string, variables: Record<string, unknown>) { return hashnodeData(await send({ method: 'POST', url: this.endpoint, body: { query, variables } })); }
  check(payload: CopyPayload, connection: any) {
    requireValue(payload.ownerKind === 'organization', 409, 'ORGANIZATION_ONLY', 'Personal Hashnode support is not enabled');
    requireValue(connection.pro === true && connection.publicationId && connection.canPublish === true, 409, 'PLAN_OR_PERMISSION_REQUIRED', 'Eligible Hashnode Pro publication and publishing role required');
  }
  request(payload:CopyPayload,connection:any):RemoteRequest {
    this.check(payload, connection);
    const operation = payload.action === 'create' ? 'publishPost' : payload.action === 'update' ? 'updatePost' : 'removePost';
    const type = payload.action === 'create' ? 'PublishPostInput' : payload.action === 'update' ? 'UpdatePostInput' : 'RemovePostInput';
    const input = payload.action === 'remove' ? { id: payload.remoteId } : { ...(payload.action === 'create' ? { publicationId: connection.publicationId, slug: `chrono-${payload.deliveryId}` } : { id: payload.remoteId }), title: payload.title, contentMarkdown: copyBody(payload), originalArticleURL: payload.sourceUrl };
    return {method:'POST',url:this.endpoint,body:{query:`mutation ChronoWrite($input:${type}!){${operation}(input:$input){post{id url}}}`,variables:{input}}};
  }
  async write(payload: CopyPayload, connection: any, send: Send) {
    const operation = payload.action === 'create' ? 'publishPost' : payload.action === 'update' ? 'updatePost' : 'removePost';
    const result = hashnodeData(await send(this.request(payload,connection)));
    const post = result[operation]?.post;
    requireValue(post?.id, 502, 'REMOTE_CONTRACT', 'Hashnode did not return an article identity');
    return { state: payload.action === 'remove' ? 'removed' as const : 'published' as const, remoteId: post.id, url: post.url ?? payload.remoteUrl ?? '', sourceVerified: false };
  }
  async reconcile(payload: CopyPayload, connection: any, send: Send): Promise<CopyResult | null> {
    this.check(payload, connection);
    const result = payload.remoteId
      ? await this.gql(send, 'query ChronoPost($id:ID!){post(id:$id){id url title canonicalUrl publishedAt content{markdown} publication{id} author{id}}}', { id: payload.remoteId })
      : await this.gql(send, 'query ChronoFind($publication:ObjectId!,$slug:String!){publication(id:$publication){post(slug:$slug){id url title canonicalUrl publishedAt content{markdown} publication{id} author{id}}}}', { publication: connection.publicationId, slug: `chrono-${payload.deliveryId}` });
    const post = payload.remoteId ? result.post : result.publication?.post;
    if (payload.action === 'remove' && !post && payload.remoteId) return { state: 'removed', remoteId: payload.remoteId, url: payload.remoteUrl ?? '', sourceVerified: true };
    if (!post || payload.remoteId && post.id!==payload.remoteId || post.publication?.id !== connection.publicationId || post.author?.id!==connection.accountId || post.title!==payload.title || post.canonicalUrl!==payload.sourceUrl || !post.publishedAt || Date.parse(post.publishedAt)>Date.now() || !sameBody(post.content?.markdown,payload)) return null;
    return { state: 'published', remoteId: post.id, url: post.url, sourceVerified: true };
  }
  async metrics(payload:CopyPayload,connection:any,send:Send):Promise<Engagement> {
    this.check(payload,connection);
    const data=await this.gql(send,'query ChronoMetrics($id:ID!){post(id:$id){id views reactionCount responseCount publication{id} author{id}}}',{id:payload.remoteId});const post=data.post;
    requireValue(post?.id===payload.remoteId && post.publication?.id===connection.publicationId && post.author?.id===connection.accountId,403,'COPY_MISMATCH','Hashnode metrics must match the exact author and publication');
    return {views:count(post.views),reactions:count(post.reactionCount),comments:count(post.responseCount),source:'Hashnode authorized GraphQL Post; lifetime counters'};
  }
}
export class AssistedAdapter implements Target {
  name: string; automatic = false; automaticActions:string[]=[];
  constructor(name: 'medium' | 'hackernoon') { this.name = name; }
  async write(): Promise<CopyResult> { throw new AppError(409, 'MANUAL_ACTION_REQUIRED', 'This destination requires assisted import or submission'); }
  async reconcile(): Promise<null> { return null; }
}
export function createTargets(env: NodeJS.ProcessEnv = process.env) {
  const targets: Target[] = [new DevAdapter(env.DEV_API_URL ?? 'https://dev.to/api'), new HashnodeAdapter(env.HASHNODE_API_URL ?? 'https://gql-beta.hashnode.com'), new AssistedAdapter('medium'), new AssistedAdapter('hackernoon')];
  return new TargetRegistry(targets,targets.filter(t=>env[`${t.name.toUpperCase()}_ENABLED`]==='false').map(t=>t.name));
}
export function isRead(request: RemoteRequest) { return request.method === 'GET' || (request.method === 'POST' && typeof request.body?.query === 'string' && /^query\b/.test(request.body.query)); }
function count(value:unknown):number|null {return typeof value==='number' && Number.isSafeInteger(value) && value>=0?value:null;}
