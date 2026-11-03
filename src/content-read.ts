import {requireValue, text} from './errors.ts';
import type {Actor} from './policy.ts';
import type {Row} from './store.ts';
import {WorkspaceReadService} from './workspace-read.ts';

export type ContentState='draft'|'submitted'|'published'|'outdated';
export interface SummaryQuery {articleId?:string;language?:string;status?:string;q?:string;limit?:string;offset?:string;}
const states:ContentState[]=['draft','submitted','published','outdated'];

export class ContentReadService {
  workspaces:WorkspaceReadService;
  constructor(workspaces:WorkspaceReadService){this.workspaces=workspaces;}
  async summary(actor:Actor,ownerId:string,query:SummaryQuery){
    const {language,status='all',q=''}=query,limit=Number(query.limit??50),offset=Number(query.offset??0);
    const articleId=query.articleId===undefined?'':text(query.articleId,'articleId');
    requireValue(language===undefined||language==='en'||language==='zh',400,'INVALID_INPUT','language must be en or zh');
    requireValue(status==='all'||states.includes(status as ContentState),400,'INVALID_INPUT','Invalid content status');
    requireValue(typeof q==='string'&&q.length<=500,400,'INVALID_INPUT','Search query exceeds 500 characters');
    requireValue(Number.isSafeInteger(limit)&&limit>0&&limit<=100&&Number.isSafeInteger(offset)&&offset>=0,400,'INVALID_INPUT','Invalid pagination');
    const access=await this.workspaces.authorize(actor,ownerId),capabilities=this.workspaces.capabilities(actor,access),store=this.workspaces.policy.store;
    // Resolve the same revision boundary as ContentService.visibleRevision before
    // searching or counting. Hidden current revisions never influence these DTOs.
    const cte=`WITH visible AS (
      SELECT a.*,a.rowid AS ordering,s.revision_id AS submitted_revision,s.created_at AS submitted_at,f.release_id AS fulfilled_by,
        l.id AS live_id,l.revision_id AS live_revision,l.url AS live_url,l.updated_at AS live_updated,
        CASE WHEN a.creator=:subject THEN a.current_revision WHEN :publisher=1 AND s.revision_id IS NOT NULL THEN s.revision_id ELSE l.revision_id END AS visible_revision
      FROM articles a LEFT JOIN submissions s ON s.article_id=a.id
      LEFT JOIN submission_fulfillments f ON f.article_id=a.id AND f.revision_id=s.revision_id
      LEFT JOIN releases l ON l.id=(SELECT r.id FROM releases r WHERE r.article_id=a.id AND r.state='published' ORDER BY r.created_at DESC,r.rowid DESC LIMIT 1)
      WHERE a.owner_id=:owner
    ), authorized AS (
      SELECT v.*,r.title,r.digest,r.credited_author,r.created_at AS revision_created,
        CASE WHEN v.creator=:subject THEN v.current_revision END AS draft_revision,
        CASE WHEN v.creator=:subject OR :publisher=1 OR v.submitted_revision=v.live_revision THEN v.submitted_revision END AS authorized_submission
      FROM visible v JOIN revisions r ON r.id=v.visible_revision AND r.article_id=v.id
    ), successful_revisions AS (
      SELECT DISTINCT article_id,revision_id FROM releases WHERE owner_id=:owner AND state IN ('published','superseded') AND action IN ('publish','update')
    ), relations AS (
      SELECT t.article_id,t.source_article,t.source_revision,a.language,
        CASE WHEN t.source_revision<>s.visible_revision THEN 1 ELSE 0 END AS outdated
      FROM translations t JOIN authorized a ON a.id=t.article_id JOIN authorized s ON s.id=t.source_article
      LEFT JOIN successful_revisions history ON history.article_id=t.source_article AND history.revision_id=t.source_revision
      WHERE s.creator=:subject OR (:publisher=1 AND t.source_revision=s.submitted_revision) OR t.source_revision=s.live_revision OR history.revision_id IS NOT NULL
    ), outdated_articles AS (
      SELECT article_id AS id FROM relations WHERE outdated=1 UNION SELECT source_article AS id FROM relations WHERE outdated=1
    ), classified AS (
      SELECT a.*,
        CASE WHEN a.draft_revision IS NOT NULL AND a.draft_revision IS NOT a.live_revision
          AND (a.fulfilled_by IS NOT NULL OR a.draft_revision IS NOT a.authorized_submission) THEN 1 ELSE 0 END AS draft,
        CASE WHEN a.authorized_submission IS NOT NULL AND a.fulfilled_by IS NULL THEN 1 ELSE 0 END AS submitted,
        CASE WHEN a.live_id IS NOT NULL THEN 1 ELSE 0 END AS published,
        CASE WHEN stale.id IS NOT NULL THEN 1 ELSE 0 END AS outdated
      FROM authorized a LEFT JOIN outdated_articles stale ON stale.id=a.id
    ), matching AS (
      SELECT * FROM classified WHERE (:language='' OR language=:language) AND (:article='' OR id=:article)
        AND (:query='' OR instr(lower(title||char(10)||(SELECT CAST(r.markdown AS TEXT) FROM revisions r WHERE r.id=classified.visible_revision)),lower(:query))>0)
    )`;
    const params={subject:actor.subject,publisher:access.publishingRole?1:0,owner:ownerId,language:language??'',query:q,article:articleId};
    const counts=store.db.prepare(`${cte} SELECT count(*) AS all_count,coalesce(sum(draft),0) AS draft,coalesce(sum(submitted),0) AS submitted,coalesce(sum(published),0) AS published,coalesce(sum(outdated),0) AS outdated FROM matching`).get(params) as Row;
    const filter=status==='all'?'1=1':`${status}=1`;
    const total=status==='all'?Number(counts.all_count):Number(counts[status]);
    const rows=store.db.prepare(`${cte} SELECT * FROM matching WHERE ${filter} ORDER BY created_at DESC,ordering DESC LIMIT :limit OFFSET :offset`).all({...params,limit,offset}) as Row[];
    // One bounded relation query for the page, never a membership lookup per row.
    const pageIds=rows.map(row=>row.id as string),relationships=new Map<string,Row[]>();
    if(pageIds.length){
      const pageParams=Object.fromEntries(pageIds.map((id,index)=>[`page${index}`,id]));
      const ids=pageIds.map((_,index)=>`:page${index}`).join(',');
      const related=store.db.prepare(`${cte} SELECT * FROM relations WHERE article_id IN (${ids}) OR source_article IN (${ids}) ORDER BY article_id`).all({...params,...pageParams}) as Row[];
      const pageSet=new Set(pageIds);
      for(const relation of related)for(const id of [relation.article_id,relation.source_article])if(pageSet.has(id)){
        const values=relationships.get(id)??[];values.push(relation);relationships.set(id,values);
      }
    }
    const items=rows.map(row=>({id:row.id,ownerId:row.owner_id,language:row.language,creator:row.creator,
      revision:{id:row.visible_revision,title:row.title,digest:row.digest,creditedAuthor:row.credited_author,createdAt:row.revision_created},
      draft:row.draft_revision?{revisionId:row.draft_revision}:null,
      submission:row.authorized_submission?{revisionId:row.authorized_submission,submittedAt:row.submitted_at,status:row.fulfilled_by?'fulfilled':'pending',fulfilledByReleaseId:row.fulfilled_by??null}:null,
      live:row.live_id?{releaseId:row.live_id,revisionId:row.live_revision,url:row.live_url}:null,
      translations:(relationships.get(row.id)??[]).map(relation=>({articleId:relation.article_id,language:relation.language,sourceArticleId:relation.source_article,sourceRevisionId:relation.source_revision,outdated:!!relation.outdated})),
      states:states.filter(state=>row[state]===1),capabilities:{canEdit:row.creator===actor.subject&&capabilities.canWrite,canSubmit:row.creator===actor.subject&&capabilities.canWrite,canPublish:capabilities.canPublish},
      updatedAt:[row.revision_created,row.authorized_submission?row.submitted_at:null,row.live_updated].filter(Boolean).sort().at(-1)}));
    return {items,total,limit,offset,counts:{all:Number(counts.all_count),draft:Number(counts.draft),submitted:Number(counts.submitted),published:Number(counts.published),outdated:Number(counts.outdated)}};
  }
}
