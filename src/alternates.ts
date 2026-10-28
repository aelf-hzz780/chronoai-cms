import {randomUUID} from 'node:crypto';
import {PublishingService,type OriginalInput} from './publishing.ts';
import {Queue} from './queue.ts';
import {AppError,requireValue} from './errors.ts';
import type {Actor} from './policy.ts';
export interface Alternate {language:string;url:string;}
export interface AlternateAdapter {alternates(input:OriginalInput,links:Alternate[]):Promise<void>;}
export class AlternateService {
  originals:PublishingService;
  constructor(originals:PublishingService){this.originals=originals;}
  async request(actor:Actor,articleId:string,trace:string) {
    const article=this.originals.content.article(articleId);await this.originals.content.policy.publish(actor,article.owner_id);
    const id=randomUUID(),store=this.originals.content.store;
    store.transaction(()=>{
      store.run('INSERT INTO projections VALUES (?,?,?,?,?,?,?)',id,articleId,article.owner_id,this.originals.vault.seal(actor),'queued',null,trace);
      store.run('INSERT INTO jobs VALUES (?,?,?,?,?,?)',randomUUID(),'projection',id,'queued',null,new Date().toISOString());
      store.audit(actor.subject,article.owner_id,'alternates.request',id,trace);
    });return{id,state:'queued'};
  }
  affected(articleId:string,ownerId:string) {
    return this.originals.content.store.all(`SELECT r.* FROM releases r JOIN articles a ON a.id=r.article_id WHERE r.state='published' AND a.owner_id=? AND (a.id=? OR a.id IN (SELECT l.peer_article_id FROM release_links l JOIN releases s ON s.id=l.release_id WHERE s.article_id=?) OR a.id IN (SELECT s.article_id FROM release_links l JOIN releases s ON s.id=l.release_id WHERE l.peer_article_id=?))`,ownerId,articleId,articleId,articleId);
  }
  links(articleId:string,ownerId:string):Alternate[] {
    const store=this.originals.content.store;
    const rows=store.all(`SELECT DISTINCT a.id,a.language,r.url FROM releases r JOIN articles a ON a.id=r.article_id WHERE r.state='published' AND a.owner_id=? AND a.id<>? AND (a.id IN (SELECT l.peer_article_id FROM release_links l JOIN releases s ON s.id=l.release_id WHERE s.article_id=? AND s.state='published') OR a.id IN (SELECT s.article_id FROM release_links l JOIN releases s ON s.id=l.release_id WHERE l.peer_article_id=? AND s.state='published')) ORDER BY a.language,a.id`,ownerId,articleId,articleId,articleId);
    requireValue(new Set(rows.map(r=>r.language)).size===rows.length,409,'TRANSLATION_AMBIGUOUS','Multiple live translations share a language; resolve the relationship before projecting public links');
    return rows.map(row=>({language:row.language,url:row.url}));
  }
}
export class AlternateWorker {
  service:AlternateService;adapter:AlternateAdapter;queue:Queue;
  constructor(service:AlternateService,adapter:AlternateAdapter){this.service=service;this.adapter=adapter;this.queue=new Queue(service.originals.content.store);}
  async once() {
    const store=this.service.originals.content.store,lease=this.queue.claim('projection',id=>store.run("UPDATE projections SET state='queued',error_code='WORKER_INTERRUPTED' WHERE id=?",id));
    if(!lease)return false;
    const row=store.get('SELECT * FROM projections WHERE id=?',lease.resourceId)!;
    try {
      const actor=this.service.originals.vault.open<Actor>(row.actor_json);await this.service.originals.content.policy.publish(actor,row.owner_id);
      for(const release of this.service.affected(row.article_id,row.owner_id)) {
        const input=this.service.originals.input(release);input.guard=()=>this.queue.guard(lease);
        input.beforeWrite=async()=>{await this.service.originals.content.policy.publish(actor,row.owner_id);this.queue.guard(lease);requireValue(store.get('SELECT state FROM releases WHERE id=?',release.id)?.state==='published',409,'PUBLICATION_CHANGED','Original changed during metadata projection');};
        await this.adapter.alternates(input,this.service.links(release.article_id,row.owner_id));
      }
      this.queue.mutate(lease,()=>{store.run("UPDATE projections SET state='complete',error_code=NULL WHERE id=?",row.id);store.audit(actor.subject,row.owner_id,'alternates.complete',row.id,row.trace_id);},true);
    }catch(error){const code=error instanceof AppError?error.code:'INTERNAL';this.queue.mutate(lease,()=>{store.run("UPDATE projections SET state='failed',error_code=? WHERE id=?",code,row.id);store.audit('worker',row.owner_id,'alternates.failed',row.id,row.trace_id,{code});},true);}
    return true;
  }
}
