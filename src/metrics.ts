import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import type { Actor } from './policy.ts';
import { ContentService } from './content.ts';
import { requireValue } from './errors.ts';

export interface AnalyticsConfig { enabled: boolean; requireConsent: boolean; secret: string; }
export interface Visit { consent: boolean; ip: string; userAgent: string; referral?: string; campaign?: string; doNotTrack?: boolean; }
export class MetricsService {
  content: ContentService; config: AnalyticsConfig;
  private volatileGaps=new Map<string,{owner_id:string;article_id:string;language:string;occurred_at:string}>();
  constructor(content: ContentService, config: AnalyticsConfig) { this.content = content; this.config = config; }
  mac(value: string) { return createHmac('sha256', this.config.secret).update(value).digest('base64url'); }
  token(articleId: string, releaseId: string) {
    const payload = Buffer.from(JSON.stringify({ articleId, releaseId })).toString('base64url'); return `${payload}.${this.mac(payload)}`;
  }
  async collect(token: string, visit: Visit) {
    if (!this.config.enabled || visit.doNotTrack || (this.config.requireConsent && !visit.consent) || token.length > 600) return false;
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return false;
    const expected = Buffer.from(this.mac(payload)), actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
    let data; try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { return false; }
    const live = this.content.store.get("SELECT r.id,a.id AS article,a.owner_id,a.language FROM releases r JOIN articles a ON a.id=r.article_id WHERE r.id=? AND a.id=? AND r.state='published'", data.releaseId, data.articleId);
    if (!live) return false;
    let referral = 'unattributed';
    if (visit.referral) { try { const url = new URL(visit.referral); if (['https:', 'http:'].includes(url.protocol)) referral = url.hostname.toLowerCase().slice(0, 253); } catch { /* Invalid referrer is explicitly unattributed. */ } }
    const campaign = visit.campaign && /^[a-zA-Z0-9_-]{1,64}$/.test(visit.campaign) ? visit.campaign : null;
    const now = new Date().toISOString();
    // Daily salted estimates, not a cross-day or cross-platform person identifier.
    const visitor = this.mac(`${now.slice(0, 10)}\n${visit.ip}\n${visit.userAgent.slice(0, 512)}`);
    try { this.content.store.run('INSERT INTO observations VALUES (?,?,?,?,?,?,?,?)', randomUUID(), live.article, live.owner_id, live.language, visitor, referral, campaign, now); }
    catch(error) {
      const gap={owner_id:live.owner_id,article_id:live.article,language:live.language,occurred_at:now};
      try{this.content.store.run('INSERT INTO collection_gaps VALUES (?,?,?,?,?)',randomUUID(),gap.owner_id,gap.article_id,gap.language,now);}
      catch{this.volatileGaps.set(`${live.owner_id}:${live.article}:${now.slice(0,10)}`,gap);}
      throw error;
    }
    return true;
  }
  async query(actor: Actor, ownerId: string, filters: Record<string, string | undefined>) {
    await this.content.policy.owner(actor, ownerId, 'metrics:read');
    const where = ['owner_id=?'], parameters: string[] = [ownerId];
    const releaseWhere = ['r.owner_id=?'], releaseParameters: string[] = [ownerId];
    if (filters.article) {
      const article = this.content.article(filters.article); requireValue(article.owner_id === ownerId, 403, 'FORBIDDEN', 'Article does not belong to workspace');
      where.push('article_id=?'); parameters.push(filters.article); releaseWhere.push('r.article_id=?'); releaseParameters.push(filters.article);
    }
    if (filters.language) { requireValue(['en', 'zh'].includes(filters.language), 400, 'INVALID_INPUT', 'Invalid language filter'); where.push('language=?'); parameters.push(filters.language); releaseWhere.push('a.language=?'); releaseParameters.push(filters.language); }
    for (const key of ['from', 'to']) if (filters[key]) {
      const value = filters[key]!;
      requireValue(/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, 400, 'INVALID_INPUT', 'Dates must be valid YYYY-MM-DD values in UTC');
      const instant = key === 'from' ? `${value}T00:00:00.000Z` : `${value}T23:59:59.999Z`;
      where.push(`observed_at${key === 'from' ? '>=' : '<='}?`); parameters.push(instant);
      releaseWhere.push(`r.created_at${key === 'from' ? '>=' : '<='}?`); releaseParameters.push(instant);
    }
    requireValue(!filters.from || !filters.to || filters.from <= filters.to, 400, 'INVALID_INPUT', 'Date range is reversed');
    const destination = filters.destination ?? 'ghost';
    requireValue(['ghost', 'dev', 'hashnode', 'medium', 'hackernoon'].includes(destination), 400, 'INVALID_INPUT', 'Unknown destination');
    const gaps=[...this.content.store.all('SELECT owner_id,article_id,language,occurred_at FROM collection_gaps WHERE owner_id=?',ownerId),...this.volatileGaps.values()].filter(gap=>gap.owner_id===ownerId&&(!filters.article||gap.article_id===filters.article)&&(!filters.language||gap.language===filters.language)&&(!filters.from||gap.occurred_at.slice(0,10)>=filters.from)&&(!filters.to||gap.occurred_at.slice(0,10)<=filters.to));
    const available = this.config.enabled && destination === 'ghost' && gaps.length===0;
    const clause = where.join(' AND '), store = this.content.store;
    const total = store.get(`SELECT count(*) AS views,count(DISTINCT visitor) AS visitors,max(observed_at) AS updated FROM observations WHERE ${clause}`, ...parameters)!;
    const source = destination === 'ghost' ? 'chrono-self-hosted-collector' : `${destination}:authorized-metrics-not-connected`;
    const metric = (value: number) => ({ value: available ? value : null, availability: available ? 'Available' : 'Unavailable', source, updated_at: destination === 'ghost' ? total.updated : null, coverage: { ownerId, ...filters, timezone: 'UTC', collectionGaps:gaps.length,lastCollectionFailure:gaps.map(g=>g.occurred_at).sort().at(-1)??null }, reason: available ? null : destination === 'ghost' ? gaps.length?'Collection failed for visits in this range; recorded totals are incomplete':'Collection disabled by configured privacy policy' : 'No supported authorized external metrics source configured' });
    const externalWhere=where.map(condition=>condition.replace(/^owner_id/,'d.owner_id').replace(/^article_id/,'r.article_id').replace(/^language/,'a.language').replace(/^observed_at/,'m.updated_at'));
    const snapshots=destination==='ghost'?[]:store.all(`SELECT m.* FROM deliveries d JOIN releases r ON r.id=d.release_id JOIN articles a ON a.id=r.article_id LEFT JOIN external_metrics m ON m.delivery_id=d.id WHERE ${externalWhere.join(' AND ')} AND d.target=? AND d.state='published'`,...parameters,destination);
    const externalMetric=(field:'views'|'reactions'|'comments')=>{
      const valid=snapshots.length>0 && snapshots.every(row=>!row.error_code && typeof row[field]==='number');
      return {value:valid?snapshots.reduce((sum,row)=>sum+row[field],0):null,availability:valid?'Available':'Unavailable',source:[...new Set(snapshots.map(row=>row.source).filter(Boolean))].join('; ')||`${destination}:no-authorized-snapshot`,updated_at:snapshots.map(row=>row.updated_at).filter(Boolean).sort().at(-1)??null,coverage:{ownerId,...filters,timezone:'UTC',counter_window:'Provider lifetime counters at the most recent capture per current copy; date filters select capture time, not an article traffic interval',copies:snapshots.length},reason:valid?null:'No complete supported authorized counters for the selected current copies'};
    };
    const external={views:externalMetric('views'),reactions:externalMetric('reactions'),comments:externalMetric('comments')};
    const distribution = destination === 'ghost'
      ? store.all(`SELECT r.state,count(*) AS count FROM releases r JOIN articles a ON a.id=r.article_id WHERE ${releaseWhere.join(' AND ')} GROUP BY r.state`, ...releaseParameters)
      : store.all(`SELECT d.state,count(*) AS count FROM deliveries d JOIN releases r ON r.id=d.release_id JOIN articles a ON a.id=r.article_id WHERE ${releaseWhere.map(condition=>condition.replace(/^r.created_at/,'d.created_at')).join(' AND ')} AND d.target=? GROUP BY d.state`, ...releaseParameters, destination);
    return {
      ownerId, filters: { ...filters, destination },
      readership: { pageViews: destination==='ghost'?metric(total.views):external.views, estimatedDailyVisitors: { ...metric(total.visitors), definition: 'Sum of daily unique HMAC(IP + user agent) estimates in UTC; visitors across days and platforms are not deduplicated' } },
      topArticles: available ? store.all(`SELECT article_id,count(*) AS pageViews,count(DISTINCT visitor) AS estimatedDailyVisitors FROM observations WHERE ${clause} GROUP BY article_id ORDER BY pageViews DESC LIMIT 20`, ...parameters) : [],
      trends: available ? store.all(`SELECT substr(observed_at,1,10) AS date,count(*) AS pageViews,count(DISTINCT visitor) AS estimatedDailyVisitors FROM observations WHERE ${clause} GROUP BY date ORDER BY date LIMIT 366`, ...parameters) : [],
      referrals: available ? store.all(`SELECT referral,campaign,count(*) AS pageViews FROM observations WHERE ${clause} GROUP BY referral,campaign ORDER BY pageViews DESC LIMIT 100`, ...parameters) : [],
      distribution: { value: distribution, source: 'platform-publication-ledger', dateBasis:destination==='ghost'?'original confirmation created_at (UTC)':'delivery confirmation created_at (UTC)', updated_at: new Date().toISOString() },
      externalEngagement: { views:external.views.value,reactions:external.reactions.value,comments:external.comments.value,availability:Object.values(external).every(metric=>metric.availability==='Available')?'Available':'Unavailable',source:external.views.source,updated_at:external.views.updated_at,metrics:external,reason:external.views.reason },
    };
  }
}
