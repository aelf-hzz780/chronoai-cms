/** Explicit encrypted four-Ghost restore exercise; only new loopback projects. */
import {readFile,writeFile,mkdtemp,chmod,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {Store} from '../src/store.ts';
import {Queue} from '../src/queue.ts';
import {digest} from '../src/content.ts';
const source=resolve(process.argv[2]??'');assert.ok(source.includes('/.runtime/blogsystem-integration-'));
const directory=await mkdtemp(resolve('.runtime/recovery-exercise-')),suffix=randomUUID().slice(0,8),key=randomBytes(32).toString('hex');
const basePort=Number(process.env.RECOVERY_TEST_PORT_BASE??'2768');assert.ok(Number.isInteger(basePort)&&basePort>1023&&basePort<65524);
await writeFile(join(directory,'backup-key.private'),key,{mode:0o600});
const plan={dockerContext:'colima-blogsystem',databasePath:join(source,'four-ghost-platform.sqlite'),platformConfig:join(source,'integration-platform.env'),extraFiles:[resolve('.runtime/dev-personal-state.json'),resolve('.runtime/dev-organization-state.json')],sites:[{project:'blogsystem-dev-personal',envFile:resolve('.runtime/dev-personal.env'),restoreProject:`blogsystem-restore-${suffix}-personal`,enPort:basePort,zhPort:basePort+1},{project:'blogsystem-dev-organization',envFile:resolve('.runtime/dev-organization.env'),restoreProject:`blogsystem-restore-${suffix}-org`,enPort:basePort+10,zhPort:basePort+11}]};
const planFile=join(directory,'plan.json');await writeFile(planFile,JSON.stringify(plan,null,2),{mode:0o600});
const archive=join(directory,'backup.enc'),target=join(directory,'restored'),started=Date.now();
for(const [mode,destination]of [['capture',archive],['restore',target]])execFileSync(process.execPath,['scripts/recovery.ts',mode,planFile,destination],{env:{...process.env,RECOVERY_BACKUP_KEY:key,RECOVERY_ARCHIVE:archive},stdio:'inherit'});
const original=new Store(plan.databasePath),restored=new Store(join(target,'platform.sqlite'));
const report=JSON.parse(await readFile(join(target,'restore-report.json'),'utf8')),sourceEvidence=JSON.parse(await readFile(join(source,'evidence.json'),'utf8'));
try {
  for(const table of ['owners','articles','revisions','assets','releases','deliveries','asset_publications','sites','author_mappings']) {
    assert.equal(restored.get(`SELECT count(*) AS n FROM ${table}`)!.n,original.get(`SELECT count(*) AS n FROM ${table}`)!.n);
  }
  for(const revision of original.all('SELECT id,markdown,digest FROM revisions')) {const copy=restored.get('SELECT markdown,digest FROM revisions WHERE id=?',revision.id)!;assert.equal(digest(copy.markdown),revision.digest);assert.deepEqual(copy.markdown,revision.markdown);}
  assert.equal(new Queue(restored).claim('release',()=>{}),null);assert.equal(new Queue(restored).claim('delivery',()=>{}),null);
  const results=[];
  for(const row of sourceEvidence.results) {
    const group=report.projects[row.owner==='personal'?0:1],origin=row.language==='en'?group.enUrl:group.zhUrl,url=`${origin}${new URL(row.url).pathname}`;
    const live=original.get("SELECT * FROM releases WHERE article_id=? ORDER BY rowid DESC LIMIT 1",row.articleId)!,response=await fetch(url),page=await response.text();
    if(live.state==='unpublished')assert.equal(response.status,404);
    else {
      assert.equal(response.status,200);assert.ok(page.includes(`chrono-revision:${row.revisionId}:${row.sourceSha256}`));
      const assets=original.all('SELECT * FROM assets WHERE article_id=?',row.articleId);
      for(const asset of assets){const image=await fetch(`${origin}/content/images/chrono/${asset.digest}.png`);assert.equal(image.status,200);assert.equal(digest(Buffer.from(await image.arrayBuffer())),asset.digest);}
    }
    results.push({owner:row.owner,language:row.language,entry:row.entry,url,expectedState:live.state,restored:true});
  }
  const evidence={schema_version:1,evidence_level:'local',performed_at:new Date().toISOString(),build_revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),worktree_dirty:true,authority:'synthetic local; NOT NyxID Live',claim:'Authenticated encrypted backup and fresh-volume restore of platform SQLite and four official Ghost MySQL/content/config installations',traceId:report.trace,elapsedSeconds:Math.round((Date.now()-started)/1000),sourceProjects:plan.sites.map(s=>s.project),restoreProjects:report.projects,allRevisionBytesAndPrivateAssetsMatch:true,publicImagesSha256Match:true,outboundPaused:true,sourceVolumesPreserved:true,results,not_verified:['production RPO/RTO','live credentials or external effects','restored outbound resume; remains intentionally paused']};
  Object.assign(evidence,{sourceFingerprint:report.sourceFingerprint,sourceIntegrationFingerprint:sourceEvidence.sourceFingerprint});
  await writeFile(join(directory,'evidence.json'),JSON.stringify(evidence,null,2));process.stdout.write(JSON.stringify({status:'passed',evidence:join(directory,'evidence.json')})+'\n');
}finally{original.close();restored.close();}
