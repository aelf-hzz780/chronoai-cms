import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers.ts';
import {Vault} from '../src/vault.ts';
import {PublishingService,ReleaseWorker} from '../src/publishing.ts';
import {AlternateService,AlternateWorker} from '../src/alternates.ts';
import {GhostAdapter} from '../src/ghost.ts';
import {AppError} from '../src/errors.ts';
import {RemoteError} from '../src/http-client.ts';
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(yes=>resolve=yes);return{resolve,promise};}
for(const scenario of ['before-current-read','after-dispatch-readback-failure','correction-read-failure','persistent-correction-write-failure'])test(`R013: ${scenario} enqueues correction after a delayed projection`,async t=>{
  const f=fixture(),service=new PublishingService(f.content,new Vault('ab'.repeat(32))),alts=new AlternateService(service);t.after(()=>f.store.close());
  const ghost=new GhostAdapter(f.store,'/unused',true),articles:Record<string,any>={},remote=new Map<string,any>();let clock=0;
  for(const [language,port]of [['en',3999],['zh',4000]] as const){
    f.store.run('INSERT INTO sites VALUES (?,?,?,?,?)',language,'solo',language,`http://localhost:${port}`,'KEY');f.store.run('INSERT INTO author_mappings VALUES (?,?,?)',language,'solo','author');
    articles[language]=await f.content.create(f.actors.solo,{ownerId:'solo',language,title:`Confirmed ${language}`,markdown:`Confirmed body ${language}`,creditedAuthor:'solo'},'trace');
  }
  await f.content.linkTranslation(f.actors.solo,articles.zh.id,articles.en.id,articles.en.revision.id,'trace');
  const originals=new ReleaseWorker(service,{
    async publish(input){const post={id:`remote-${input.language}`,url:`${input.site.url}/post/`,title:input.title,status:'published',html:ghost.controlledHtml(input),authors:[{id:'author'}],updated_at:`v${++clock}`,codeinjection_head:'',codeinjection_foot:ghost.publisherHtml(input)};remote.set(input.articleId,post);return{remoteId:post.id,url:post.url};},
    async verify(){return true;},async reconcile(){return null;},async unpublish(input){remote.get(input.articleId).status='draft';}
  });
  const request=(language:string)=>({ownerId:'solo',revisionId:articles[language].revision.id,creditedAuthor:'solo',action:'publish',rightsConfirmed:true,idempotencyKey:language});
  for(const language of ['en','zh']){await service.confirm(f.actors.solo,articles[language].id,request(language),'trace');await originals.once();}
  const entered=deferred(),resume=deferred();let pause=false,writePause=false,failReadback=false,failCorrectionRead=false,rejectCorrectionWrites=false,rejectedWrites=0;
  ghost.current=async input=>{if(failCorrectionRead){failCorrectionRead=false;throw new RemoteError('REMOTE_FAILURE','correction read outage');}if(pause&&input.articleId===articles.en.id){pause=false;entered.resolve();await resume.promise;}return structuredClone(remote.get(input.articleId));};
  ghost.call=async(input,_path,method,body:any)=>{assert.equal(method,'PUT');await input.beforeWrite?.();input.guard?.();if(rejectCorrectionWrites){rejectedWrites++;throw new RemoteError('REMOTE_FAILURE','correction write outage');}if(writePause&&input.articleId===articles.en.id){writePause=false;entered.resolve();await resume.promise;failReadback=true;}const post=remote.get(input.articleId);if(body.posts[0].updated_at!==post.updated_at)throw new AppError(409,'EDIT_COLLISION','Concurrent Ghost update');Object.assign(post,body.posts[0],{updated_at:`v${++clock}`});return{posts:[post]};};
  t.mock.method(globalThis,'fetch',async(url:any)=>{if(failReadback){failReadback=false;return new Response('readback outage',{status:503});}const post=[...remote.values()].find(post=>post.url===String(url));return new Response(`<html>${post.html}${post.codeinjection_head}${post.codeinjection_foot}</html>`);});
  const worker=new AlternateWorker(alts,ghost);while(await worker.once()){}
  const target=remote.get(articles.zh.id).url;assert.ok(remote.get(articles.en.id).codeinjection_head.includes(target));
  if(scenario!=='before-current-read'){const post=remote.get(articles.en.id);post.codeinjection_head='';post.codeinjection_foot=ghost.publisherHtml(service.input(f.store.get("SELECT * FROM releases WHERE article_id=? AND state='published'",articles.en.id)!));post.updated_at=`v${++clock}`;}
  const pending=await alts.request(f.actors.solo,articles.en.id,'stale');pause=scenario==='before-current-read';writePause=scenario!=='before-current-read';const old=worker.once();await entered.promise;
  await service.confirm(f.actors.solo,articles.zh.id,{...request('zh'),action:'unpublish',idempotencyKey:'remove'},'trace');await originals.once();const fresh=new AlternateWorker(alts,ghost);while(await fresh.once()){}
  assert.equal(remote.get(articles.en.id).codeinjection_head.includes(target),false);resume.resolve();await old;
  assert.equal(remote.get(articles.en.id).codeinjection_head.includes(target),scenario!=='before-current-read');assert.equal(f.store.get('SELECT error_code FROM projections WHERE id=?',pending.id)!.error_code,scenario==='before-current-read'?'PUBLICATION_CHANGED':'REMOTE_FAILURE');assert.equal(f.store.get("SELECT count(*) AS n FROM jobs WHERE state='queued'")!.n,1);
  if(scenario==='correction-read-failure'||scenario==='persistent-correction-write-failure'){
    failCorrectionRead=scenario==='correction-read-failure';rejectCorrectionWrites=!failCorrectionRead;
    const correction=f.store.get('SELECT * FROM projection_retries')!,attemptLimit=rejectCorrectionWrites?6:1;
    for(let attempt=1;attempt<=attemptLimit;attempt++){
      assert.equal(await fresh.once(),true);
      const state=f.store.get('SELECT * FROM projection_retries WHERE projection_id=?',correction.projection_id)!;
      assert.equal(state.attempts,attempt);
      assert.equal(await new AlternateWorker(alts,ghost).once(),false,'Backoff must survive worker recreation');
      assert.equal(f.store.get('SELECT count(*) AS n FROM projection_retries')!.n,1,'Keep one durable corrective intent');
      if(attempt<6){assert.ok(Date.parse(state.next_attempt_at)>=Date.now()+4000);f.store.run("UPDATE projection_retries SET next_attempt_at='2000-01-01T00:00:00.000Z' WHERE projection_id=?",correction.projection_id);}
    }
    if(rejectCorrectionWrites){
      assert.equal(rejectedWrites,6);assert.equal(f.store.get('SELECT state FROM projections WHERE id=?',correction.projection_id)!.state,'manual_action_needed');
      assert.equal(f.store.get("SELECT count(*) AS n FROM jobs WHERE state='queued'")!.n,0);assert.equal(f.store.get('SELECT next_attempt_at FROM projection_retries')!.next_attempt_at,null);
      return;
    }
  }
  while(await fresh.once()){}assert.equal(remote.get(articles.en.id).codeinjection_head.includes(target),false);
});
