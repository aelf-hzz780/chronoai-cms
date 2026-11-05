import {randomUUID} from 'node:crypto';
import {PublishingService,type OriginalInput} from './publishing.ts';
import {Queue} from './queue.ts';
import {AppError,requireValue} from './errors.ts';
import type {Actor} from './policy.ts';
import {assertCommandRequest,bindActorCommand,assertCommandBinding,deriveCommand,projectionCommand} from './command-authority.ts';
import {projectionAffected,projectionLinks,copyProjectionSnapshot} from './projection-proof.ts';
export interface Alternate {language:string;url:string;}
export interface AlternateAdapter {alternates(input:OriginalInput,links:Alternate[]):Promise<void>;}
export class AlternateService {
  originals:PublishingService;
  constructor(originals:PublishingService){this.originals=originals;}
  async request(actor:Actor,articleId:string,trace:string) {
    const article=this.originals.content.article(articleId);await this.originals.content.policy.publish(actor,article.owner_id);
    assertCommandRequest(actor,'POST',`/api/service/articles/${articleId}/sync-links`);
    const id=randomUUID(),store=this.originals.content.store;
    store.transaction(()=>{
      const bound=bindActorCommand(store,actor,projectionCommand({id,article_id:articleId,owner_id:article.owner_id},store,true));
      store.run('INSERT INTO projections VALUES (?,?,?,?,?,?,?)',id,articleId,article.owner_id,this.originals.vault.seal(bound),'queued',null,trace);
      store.run('INSERT INTO jobs VALUES (?,?,?,?,?,?)',randomUUID(),'projection',id,'queued',null,new Date().toISOString());
      store.audit(actor.subject,article.owner_id,'alternates.request',id,trace);
    });return{id,state:'queued'};
  }
  affected(articleId:string,ownerId:string) {
    return projectionAffected(this.originals.content.store,articleId,ownerId);
  }
  snapshot(ownerId:string) {
    const store=this.originals.content.store;
    return JSON.stringify(store.all("SELECT r.id,r.article_id,r.revision_id,r.url,l.peer_article_id,l.source_revision FROM releases r LEFT JOIN release_links l ON l.release_id=r.id WHERE r.owner_id=? AND r.state='published' ORDER BY r.id",ownerId));
  }
  links(articleId:string,ownerId:string):Alternate[] {
    return projectionLinks(this.originals.content.store,articleId,ownerId);
  }
}
export class AlternateWorker {
  service:AlternateService;adapter:AlternateAdapter;queue:Queue;
  constructor(service:AlternateService,adapter:AlternateAdapter){this.service=service;this.adapter=adapter;this.queue=new Queue(service.originals.content.store);}
  async once() {
    const store=this.service.originals.content.store,lease=this.queue.claim('projection',id=>store.run("UPDATE projections SET state='queued',error_code='WORKER_INTERRUPTED' WHERE id=?",id));
    if(!lease)return false;
    const row=store.get('SELECT * FROM projections WHERE id=?',lease.resourceId)!;
    let attemptedWrite=false;
    const correction=store.get('SELECT * FROM projection_retries WHERE projection_id=?',row.id);
    // Older recovery projections reuse the release trace but carry a different
    // Actor ciphertext. Corrections retain both, so they must also fail closed.
    const assertWriteOrigin=()=>requireValue(!store.get('SELECT 1 FROM releases WHERE article_id=? AND trace_id=? AND NOT EXISTS (SELECT 1 FROM releases r WHERE r.article_id=? AND r.trace_id=? AND r.actor_json=?)',row.article_id,row.trace_id,row.article_id,row.trace_id,row.actor_json),409,'RECOVERY_READ_ONLY','Legacy recovery metadata requires a separately authorized sync-links command');
    try {
      assertWriteOrigin();
      const actor=this.service.originals.vault.open<Actor>(row.actor_json);
      const assertFrozen=()=>assertCommandBinding(store,actor,projectionCommand(store.get('SELECT * FROM projections WHERE id=?',row.id)!,store));
      assertFrozen();await this.service.originals.content.policy.publish(actor,row.owner_id,'queued-write');assertFrozen();
      for(const release of this.service.affected(row.article_id,row.owner_id)) {
        const input=this.service.originals.input(release),links=this.service.links(release.article_id,row.owner_id),snapshot=this.service.snapshot(row.owner_id);
        let currentAuthority:(()=>void)|undefined;
        const guard=()=>{currentAuthority?.();assertFrozen();this.queue.guard(lease);this.queue.assertWritable();requireValue(store.get('SELECT state FROM releases WHERE id=?',release.id)?.state==='published' && this.service.snapshot(row.owner_id)===snapshot,409,'PUBLICATION_CHANGED','Original or translation targets changed during metadata projection');};
        input.guard=guard;
        input.beforeWrite=async()=>{assertWriteOrigin();assertFrozen();currentAuthority=await this.service.originals.content.policy.executionGuard(actor,row.owner_id);assertWriteOrigin();guard();attemptedWrite=true;};
        await this.adapter.alternates(input,links);guard();
      }
      this.queue.mutate(lease,()=>{store.run("UPDATE projections SET state='complete',error_code=NULL WHERE id=?",row.id);store.run('DELETE FROM projection_retries WHERE projection_id=?',row.id);store.audit(actor.subject,row.owner_id,'alternates.complete',row.id,row.trace_id);},true);
    }catch(error){
      let code=error instanceof AppError?error.code:'INTERNAL';const originalCode=code;
      let continuation=false;
      if(code==='PUBLICATION_CHANGED'||attemptedWrite){
        try{assertCommandBinding(store,this.service.originals.vault.open<Actor>(row.actor_json),projectionCommand(row,store));continuation=true;}
        catch(scopeError){code=scopeError instanceof AppError?scopeError.code:'INTERNAL';}
      }
      this.queue.mutate(lease,()=>{
        if(correction){
          const attempts=correction.attempts+1;
          const retryable=code==='PUBLICATION_CHANGED'||code==='OUTBOUND_PAUSED'||code==='INTERNAL'||error instanceof AppError && error.status>=500;
          const automatic=retryable && attempts<6;
          const due=automatic?new Date(Date.now()+Math.min(300000,5000*2**(attempts-1))).toISOString():null;
          store.run('UPDATE projection_retries SET attempts=?,next_attempt_at=? WHERE projection_id=?',attempts,due,row.id);
          store.run('UPDATE projections SET state=?,error_code=? WHERE id=?',automatic?'retry_wait':'manual_action_needed',code,row.id);
          store.run('UPDATE jobs SET state=?,lease_until=NULL WHERE id=?',automatic?'queued':'done',lease.jobId);
          store.audit('worker',row.owner_id,'alternates.correction.pending',row.id,row.trace_id,{code,originalCode,attempts,nextAttemptAt:due,manualActionNeeded:!automatic});
        }else{
          store.run('UPDATE projections SET state=?,error_code=? WHERE id=?',['PROJECTION_SCOPE_CHANGED','CONFIRMED_COMMAND_CHANGED','LEGACY_COMMAND_RECONFIRMATION_REQUIRED'].includes(code)?'blocked':'failed',code,row.id);
          store.run("UPDATE jobs SET state='done',lease_until=NULL WHERE id=?",lease.jobId);
          if(continuation){
            const id=randomUUID();store.run('INSERT INTO projections VALUES (?,?,?,?,?,?,?)',id,row.article_id,row.owner_id,row.actor_json,'queued',null,row.trace_id);
            copyProjectionSnapshot(store,row.id,id);
            deriveCommand(store,this.service.originals.vault.open<Actor>(row.actor_json),projectionCommand(row,store),projectionCommand({...row,id},store));
            store.run('INSERT INTO projection_retries VALUES (?,?,?)',id,0,new Date().toISOString());
            store.run('INSERT INTO jobs VALUES (?,?,?,?,?,?)',randomUUID(),'projection',id,'queued',null,new Date().toISOString());
          }
          store.audit('worker',row.owner_id,'alternates.failed',row.id,row.trace_id,{code,originalCode});
        }
      });
    }
    return true;
  }
}
