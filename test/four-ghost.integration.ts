/** Explicit local integration run; never targets external publishing accounts. */
import { readFile, writeFile, mkdtemp, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { Store } from '../src/store.ts';
import { Policy, type Actor, type Authority } from '../src/policy.ts';
import { ContentService, digest } from '../src/content.ts';
import { Vault } from '../src/vault.ts';
import { PublishingService, ReleaseWorker } from '../src/publishing.ts';
import { GhostAdapter } from '../src/ghost.ts';
import { createApp } from '../src/app.ts';
import { MetricsService } from '../src/metrics.ts';
import { AlternateService,AlternateWorker } from '../src/alternates.ts';
import { MediaService } from '../src/media.ts';
import { RemoteError } from '../src/http-client.ts';
import {snapshotPlatform} from '../src/recovery.ts';

const runtime = resolve('.runtime'); await mkdir(runtime,{recursive:true,mode:0o700});
const directory = await mkdtemp(join(runtime,'four-ghost-'));
const store = new Store(join(directory,'platform.sqlite'));
const roles = new Map([['member','member'],['publisher','member'],['admin','admin']]);
const authority: Authority = { async validate() {}, async membership(actor,org) { return org === 'test-org' ? roles.get(actor.subject) ?? null : null; } };
const scopes = ['content:read','content:write','publish','metrics:read','roles:write'];
const actors = Object.fromEntries(['solo','member','publisher','admin','outsider'].map(subject=>[subject,{issuer:'https://local-synthetic-issuer.invalid',subject,scopes,credential:'local-integration-only'}])) as Record<string,Actor>;
store.createOwner('personal','personal',actors.solo.issuer,'solo'); store.createOwner('organization','organization',actors.solo.issuer,'test-org');
const vaultKey=randomBytes(32).toString('hex');
const policy = new Policy(store,authority), content = new ContentService(store,policy), vault = new Vault(vaultKey);
await policy.setPublisher(actors.admin,'organization','publisher',true,'integration-role');
const environment: NodeJS.ProcessEnv = {RENDER_BROWSER_EXECUTABLE:process.env.RENDER_BROWSER_EXECUTABLE,RENDER_BROWSER_SANDBOX:process.env.RENDER_BROWSER_SANDBOX,RENDER_ASSET_ORIGINS:process.env.RENDER_ASSET_ORIGINS};
const sites: Array<{id:string;owner:string;language:string;url:string;author:string}> = [];
for(const [owner,statePath,ports] of [['personal','.runtime/dev-personal-state.json',[2568,2569]],['organization','.runtime/dev-organization-state.json',[2578,2579]]] as const) {
  const state=JSON.parse(await readFile(statePath,'utf8'));
  for(const [index,language] of ['en','zh'].entries()) {
    const saved=state.sites[language]; assert.equal(saved.url,`http://localhost:${ports[index]}`);
    const id=`${owner}-${language}`, keyRef=`INTEGRATION_${owner.toUpperCase()}_${language.toUpperCase()}`;
    environment[keyRef]=saved.key;
    store.run('INSERT INTO sites VALUES (?,?,?,?,?)',id,owner,language,saved.url,keyRef);
    store.run('INSERT INTO author_mappings VALUES (?,?,?)',id,'BlogSystem Local Operator',saved.owner_id);
    sites.push({id,owner,language,url:saved.url,author:'BlogSystem Local Operator'});
  }
}
const metrics=new MetricsService(content,{enabled:true,requireConsent:true,secret:randomBytes(32).toString('hex')});
const service=new PublishingService(content,vault), ghost=new GhostAdapter(store,process.env.INTEGRATION_MEDIA_ROOT??join(directory,'public-media'),true,environment,{metrics,publicUrl:'http://localhost:3100',requireConsent:true}), worker=new ReleaseWorker(service,ghost);
const app=await createApp({store,policy,content,vault,metrics,publicUrl:'http://localhost:3100',authenticate:async request=>actors[request.headers.authorization?.slice(7) ?? ''] ?? null});
await app.listen({host:'127.0.0.1',port:3100});
const runId=randomUUID(), results:any[]=[];
try {
  for(const site of sites) for(const entry of ['cms','service']) {
    const trace=`four-ghost-${runId}-${site.id}-${entry}`, actor=site.owner==='personal'?'solo':'member', publisher=site.owner==='personal'?'solo':'publisher';
    const prefix=`/api/${entry}`, headers={authorization:`Bearer ${actor}`};
    let source=`# ${site.language==='zh'?'原文测试':'Original test'} ${runId}\r\n\r\n| owner | language |\r\n|---|---|\r\n| ${site.owner} | ${site.language} |\r\n\r\n\`\`\`ts\r\nconst original = '${site.id}-${entry}';\r\n\`\`\`\r\n\r\n[Source](https://example.com/)\r\n`;
    let response=await app.inject({method:'POST',url:`${prefix}/articles`,headers,payload:{ownerId:site.owner,language:site.language,title:`${site.id} ${entry} ${runId}`,markdown:source,creditedAuthor:site.author}});
    assert.equal(response.statusCode,201,response.body); let article=response.json();
    let imageUrl:string|undefined;
    if(process.env.INTEGRATION_MEDIA_ROOT) {
      const bytes=Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=','base64'),randomBytes(12)]);
      response=await app.inject({method:'POST',url:`${prefix}/articles/${article.id}/assets`,headers,payload:{mime:'image/png',base64:bytes.toString('base64')}});assert.equal(response.statusCode,201,response.body);
      const asset=response.json();imageUrl=`${site.url}/content/images/chrono/${digest(bytes)}.png`;
      assert.equal((await fetch(imageUrl)).status,404);
      assert.equal((await app.inject({url:`${prefix}/assets/${asset.id}`,headers:{authorization:'Bearer outsider'}})).statusCode,403);
      source+=`\r\n![Private until confirmed](asset:${asset.id})\r\n`;
      response=await app.inject({method:'PATCH',url:`${prefix}/articles/${article.id}`,headers,payload:{expectedRevision:article.revision.id,markdown:source}});assert.equal(response.statusCode,200,response.body);article=response.json();
    }
    response=await app.inject({url:`${prefix}/articles/${article.id}/markdown?revision=${article.revision.id}`,headers}); assert.equal(response.body,source);
    if(site.owner==='organization') {
      response=await app.inject({method:'POST',url:`${prefix}/articles/${article.id}/submit`,headers,payload:{revisionId:article.revision.id}});assert.equal(response.statusCode,200,response.body);
      response=await app.inject({method:'POST',url:`${prefix}/articles/${article.id}/releases`,headers,payload:{ownerId:site.owner,revisionId:article.revision.id,creditedAuthor:site.author,action:'publish',rightsConfirmed:true,idempotencyKey:trace}});assert.equal(response.statusCode,403);
    }
    response=await app.inject({method:'POST',url:`${prefix}/articles/${article.id}/releases`,headers:{authorization:`Bearer ${publisher}`},payload:{ownerId:site.owner,revisionId:article.revision.id,creditedAuthor:site.author,action:'publish',rightsConfirmed:true,idempotencyKey:trace}});
    assert.equal(response.statusCode,202,response.body); const release=response.json();
    assert.equal(await worker.once(),true);
    const stored=store.get('SELECT * FROM releases WHERE id=?',release.id)!;
    assert.equal(stored.state,'published',JSON.stringify({state:stored.state,code:stored.error_code,site:site.id}));
    const before=await (await fetch(stored.url)).text(); assert.ok(before.includes('const original'));assert.ok(before.includes('<table>'));
    if(imageUrl) {assert.equal((await fetch(imageUrl)).status,200);assert.ok(before.includes(imageUrl));}
    const tracking=/data-endpoint="([^"]+)"/.exec(before)?.[1];assert.ok(tracking);
    assert.equal((await fetch(`${tracking}?consent=1&referrer=https%3A%2F%2Fdev.to&campaign=dev`)).status,200);
    await fetch(`${tracking}?consent=0`);await fetch(`${tracking}?consent=1`,{headers:{'sec-gpc':'1'}});
    const query=`/metrics?ownerId=${site.owner}&article=${article.id}&language=${site.language}&destination=ghost`;
    const cmsMetrics=(await app.inject({url:`/api/cms${query}`,headers:{authorization:`Bearer ${publisher}`}})).json();
    const serviceMetrics=(await app.inject({url:`/api/service${query}`,headers:{authorization:`Bearer ${publisher}`}})).json();
    assert.equal(cmsMetrics.readership.pageViews.value,1);assert.deepEqual(cmsMetrics.readership,serviceMetrics.readership);
    assert.equal((await app.inject({url:`/api/service${query}`,headers:{authorization:'Bearer outsider'}})).statusCode,403);
    await content.edit(actors[actor],article.id,article.revision.id,{markdown:'DRAFT MUST NOT REPLACE LIVE'},trace);
    const after=await(await fetch(stored.url)).text();assert.equal(after,before);
    const other=sites.find(s=>s.owner!==site.owner&&s.language===site.language)!;
    assert.equal((await fetch(`${other.url}/chrono-${article.id}/`,{redirect:'manual'})).status,404);
    results.push({entry,owner:site.owner,language:site.language,articleId:article.id,releaseId:release.id,revisionId:article.revision.id,sourceSha256:digest(source),downloadMatches:true,confirmedBodyVerified:true,privateImageUntilConfirmed:!!imageUrl,mediaStorage:process.env.INTEGRATION_MEDIA_ROOT?'shared Ghost content volumes':'not tested',collectorAndBothMetricsRoutesAgree:true,consentAndGpcRespected:true,draftEditLeavesLiveUnchanged:true,crossOwner404:true,url:stored.url,traceId:response.headers['x-trace-id']});
  }
  const linkWorker=new AlternateWorker(new AlternateService(service),ghost),translationResults=[];
  for(const owner of ['personal','organization']) {
    const en=results.find(r=>r.owner===owner&&r.language==='en'&&r.entry==='cms'),zh=results.find(r=>r.owner===owner&&r.language==='zh'&&r.entry==='cms');
    const author=owner==='personal'?actors.solo:actors.member,publisher=owner==='personal'?actors.solo:actors.publisher;
    await content.linkTranslation(author,zh.articleId,en.articleId,en.revisionId,'link-trace');
    const request={ownerId:owner,revisionId:zh.revisionId,creditedAuthor:'BlogSystem Local Operator',action:'update',rightsConfirmed:true,idempotencyKey:`${runId}-link-${owner}`};
    await service.confirm(publisher,zh.articleId,request,'link-trace');await worker.once();
    while(await linkWorker.once()){}
    assert.equal(store.get("SELECT count(*) AS n FROM projections WHERE state<>'complete'")!.n,0);
    const enPage=await(await fetch(en.url)).text(),zhPage=await(await fetch(zh.url)).text();
    assert.ok(enPage.includes(`hreflang="zh" href="${zh.url}"`));assert.ok(zhPage.includes(`hreflang="en" href="${en.url}"`));
    await service.confirm(publisher,zh.articleId,{...request,action:'unpublish',idempotencyKey:`${runId}-unlink-${owner}`},'unlink-trace');await worker.once();while(await linkWorker.once()){}
    assert.equal((await fetch(zh.url)).status,404);assert.ok(!(await(await fetch(en.url)).text()).includes(`hreflang="zh" href="${zh.url}"`));
    translationResults.push({owner,bidirectionalPublishedOnlyLinks:true,hreflang:true,unpublishRemovesOtherSideLink:true});
  }
  const privateResults=[];
  for(const action of ['cancelled','uncertain']) {
    const bytes=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),randomBytes(32)]);
    let article=await content.create(actors.solo,{ownerId:'personal',language:'en',title:`Private ${action}`,markdown:'private',creditedAuthor:'BlogSystem Local Operator'},'private-trace');
    const image=await new MediaService(content).upload(actors.solo,article.id,'image/png',bytes.toString('base64'),'private-trace');
    article=await content.edit(actors.solo,article.id,article.revision.id,{markdown:image.markdown},'private-trace');
    const release=await service.confirm(actors.solo,article.id,{ownerId:'personal',revisionId:article.revision.id,creditedAuthor:article.revision.creditedAuthor,action:'publish',rightsConfirmed:true,idempotencyKey:`private-${runId}-${action}`},'private-trace');
    if(action==='cancelled')await service.cancel(actors.solo,release.id,'cancel-trace');
    else await new ReleaseWorker(service,{async publish(){throw new RemoteError('REMOTE_UNCERTAIN','Injected pre-public-proof interruption',true);},verify:ghost.verify.bind(ghost),reconcile:ghost.reconcile.bind(ghost),unpublish:ghost.unpublish.bind(ghost)}).once();
    assert.equal(store.get('SELECT state FROM releases WHERE id=?',release.id)!.state,action);
    assert.equal((await fetch(`http://localhost:2568/content/images/chrono/${digest(bytes)}.png`)).status,404);
    assert.equal(store.get('SELECT count(*) AS n FROM asset_publications WHERE release_id=?',release.id)!.n,0);
    privateResults.push({action,publicImage404:true,noPromotionRecord:true});
  }
  await app.close();
  for(const row of results) {
    const live=store.get("SELECT state FROM releases WHERE article_id=? ORDER BY rowid DESC LIMIT 1",row.articleId)!;
    const response=await fetch(row.url);assert.equal(response.status,live.state==='unpublished'?404:200);
    if(live.state!=='unpublished')assert.ok((await response.text()).includes(`chrono-revision:${row.revisionId}:${row.sourceSha256}`));
    row.publicPageIndependentOfClosedApi=true;
  }
  const evidence={schema_version:1,run_id:runId,performed_at:new Date().toISOString(),evidence_level:'local',claim:'Current platform HTTP content/confirmation and real Ghost Adapter across two owners, two languages and two entries',build_revision:process.env.INTEGRATION_BUILD_REVISION??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),worktree_dirty:process.env.INTEGRATION_WORKTREE_DIRTY?process.env.INTEGRATION_WORKTREE_DIRTY==='true':execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim().length>0,runtime:process.version,authority:'synthetic injected local authority; NOT NyxID Live',cases:['A07','A10','A11','A17','A20','A23','A24','A25','A26','A41','A42','A43','A44','A45'],results,not_verified:['real NyxID',...(!process.env.INTEGRATION_MEDIA_ROOT?['private image promotion']:[]),'translation alternate links','external platforms','backup/restore','production RPO/RTO']};
  Object.assign(evidence,{translations:translationResults,privateFailureCases:privateResults});evidence.not_verified=evidence.not_verified.filter(x=>x!=='translation alternate links');
  await writeFile(join(directory,'evidence.json'),JSON.stringify(evidence,null,2));
  await writeFile(join(runtime,'four-ghost-evidence.json'),JSON.stringify(evidence,null,2));
  if(process.env.INTEGRATION_MEDIA_ROOT) {
    await snapshotPlatform(store,join(runtime,'four-ghost-platform.sqlite'));
    await writeFile(join(runtime,'integration-platform.env'),`ENCRYPTION_KEY=${vaultKey}\nTRACKING_SECRET=${metrics.config.secret}\n`,{mode:0o600});
  }
  process.stdout.write(JSON.stringify({status:'passed',evidencePath:join(directory,'evidence.json'),combinations:results.length})+'\n');
} finally { await app.close();store.close(); }
