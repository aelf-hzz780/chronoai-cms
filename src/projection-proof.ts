import type {Store,Row} from './store.ts';
import {requireValue} from './errors.ts';

export function projectionAffected(store:Store,articleId:string,ownerId:string):Row[] {
  return store.all(`SELECT r.* FROM releases r JOIN articles a ON a.id=r.article_id WHERE r.state='published' AND a.owner_id=? AND (a.id=? OR a.id IN (SELECT l.peer_article_id FROM release_links l JOIN releases s ON s.id=l.release_id WHERE s.article_id=?) OR a.id IN (SELECT s.article_id FROM release_links l JOIN releases s ON s.id=l.release_id WHERE l.peer_article_id=?)) ORDER BY r.id`,ownerId,articleId,articleId,articleId);
}
export function projectionLinks(store:Store,articleId:string,ownerId:string):{language:string;url:string}[] {
  const rows=store.all(`SELECT DISTINCT a.id,a.language,r.url FROM releases r JOIN articles a ON a.id=r.article_id WHERE r.state='published' AND a.owner_id=? AND a.id<>? AND (a.id IN (SELECT l.peer_article_id FROM release_links l JOIN releases s ON s.id=l.release_id WHERE s.article_id=? AND s.state='published') OR a.id IN (SELECT s.article_id FROM release_links l JOIN releases s ON s.id=l.release_id WHERE l.peer_article_id=? AND s.state='published')) ORDER BY a.language,a.id`,ownerId,articleId,articleId,articleId);
  requireValue(new Set(rows.map(r=>r.language)).size===rows.length,409,'TRANSLATION_AMBIGUOUS','Multiple live translations share a language; resolve the relationship before projecting public links');
  return rows.map(row=>({language:row.language,url:row.url}));
}
function targetIdentity(store:Store,release:Row){
  const article=store.get('SELECT id,owner_id,language FROM articles WHERE id=?',release.article_id);
  const revision=store.get('SELECT id,digest,credited_author FROM revisions WHERE id=?',release.revision_id);
  const site=article?store.get('SELECT * FROM sites WHERE owner_id=? AND language=?',release.owner_id,article.language):undefined;
  const route=site?store.get('SELECT base_url FROM site_admin_routes WHERE site_id=?',site.id):undefined;
  const author=site&&revision?store.get('SELECT ghost_author_id FROM author_mappings WHERE site_id=? AND credited_author=?',site.id,revision.credited_author):undefined;
  return {releaseId:release.id,ownerId:release.owner_id,remoteId:release.remote_id,url:release.url,article,revision,site,route:route??null,author:author??null};
}
export function projectionSnapshot(store:Store,row:Row,capture=false):string {
  if(capture){
    requireValue(!store.get('SELECT 1 FROM projection_snapshots WHERE projection_id=?',row.id),409,'PROJECTION_SCOPE_CHANGED','A projection snapshot cannot be replaced');
    const targets=projectionAffected(store,row.article_id,row.owner_id).map(release=>({identity:targetIdentity(store,release),links:projectionLinks(store,release.article_id,row.owner_id)}));
    const snapshot={version:1,owner:store.get('SELECT * FROM owners WHERE id=?',row.owner_id),articleId:row.article_id,targets};
    store.run('INSERT INTO projection_snapshots VALUES (?,?)',row.id,JSON.stringify(snapshot));
  }
  const saved=store.get('SELECT targets_json FROM projection_snapshots WHERE projection_id=?',row.id);
  requireValue(saved,409,'LEGACY_COMMAND_RECONFIRMATION_REQUIRED','Historical metadata task has no frozen targets; confirm a new sync-links command');
  let snapshot:any;try{snapshot=JSON.parse(saved.targets_json);}catch{requireValue(false,409,'PROJECTION_SCOPE_CHANGED','Saved projection snapshot is invalid');}
  requireValue(snapshot?.version===1&&snapshot.articleId===row.article_id&&Array.isArray(snapshot.targets)&&JSON.stringify(snapshot.owner)===JSON.stringify(store.get('SELECT * FROM owners WHERE id=?',row.owner_id)),409,'PROJECTION_SCOPE_CHANGED','Metadata owner or snapshot changed; confirm a new sync-links command');
  const permitted=new Map(snapshot.targets.map((target:any)=>[target.identity?.releaseId,target]));
  requireValue(permitted.size===snapshot.targets.length,409,'PROJECTION_SCOPE_CHANGED','Metadata target snapshot is ambiguous');
  // Already-authorized targets may leave the published set. This permits stale
  // links to be removed from remaining targets, never a write to a new target.
  for(const release of projectionAffected(store,row.article_id,row.owner_id)){
    const original=permitted.get(release.id) as any;
    requireValue(original&&JSON.stringify(original.identity)===JSON.stringify(targetIdentity(store,release))&&Array.isArray(original.links),409,'PROJECTION_SCOPE_CHANGED','Metadata target, route or credited author changed; confirm a new sync-links command');
    const links=new Set(original.links.map((link:any)=>JSON.stringify(link)));
    requireValue(projectionLinks(store,release.article_id,row.owner_id).every(link=>links.has(JSON.stringify(link))),409,'PROJECTION_SCOPE_CHANGED','Metadata links exceed the frozen destination set; confirm a new sync-links command');
  }
  return saved.targets_json;
}
export function copyProjectionSnapshot(store:Store,sourceId:string,destinationId:string){
  const saved=store.get('SELECT targets_json FROM projection_snapshots WHERE projection_id=?',sourceId);
  requireValue(saved,409,'LEGACY_COMMAND_RECONFIRMATION_REQUIRED','Metadata retry requires the original frozen target snapshot');
  store.run('INSERT INTO projection_snapshots VALUES (?,?)',destinationId,saved.targets_json);
}
