/** Explicit local fault exercise; restarts only this task's four dev Ghosts. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {setTimeout} from 'node:timers/promises';
import {sourceFingerprint} from '../scripts/source-fingerprint.ts';
import {Store} from '../src/store.ts';
import {digest} from '../src/content.ts';
const directory=resolve(process.argv[2]??'');assert.ok(directory.includes('/.runtime/blogsystem-integration-'));
const source=JSON.parse(await readFile(join(directory,'evidence.json'),'utf8')),fingerprint=await sourceFingerprint();assert.equal(source.sourceFingerprint.manifestDigest,fingerprint.manifestDigest,'Run four-Ghost with this exact source first');
const store=new Store(join(directory,'four-ghost-platform.sqlite')),results:any[]=[];
const docker=(...args:string[])=>execFileSync('docker',['--context','colima-blogsystem',...args],{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']});
try {
  for(const owner of ['personal','organization'])for(const language of ['en','zh']){
    const container=`blogsystem-dev-${owner}-ghost-${language}-1`,before=JSON.parse(docker('inspect',container))[0];const started=Date.now();
    docker('restart',container);let ready=false;
    for(let attempt=0;attempt<120;attempt++){
      const state=JSON.parse(docker('inspect',container))[0];if(state.State.Health.Status==='healthy'){assert.notEqual(state.State.StartedAt,before.State.StartedAt);ready=true;break;}
      if(attempt%15===0)process.stdout.write(JSON.stringify({event:'resilience.wait',container,elapsedSeconds:Math.round((Date.now()-started)/1000)})+'\n');await setTimeout(1000);
    }assert.ok(ready,`${container} did not recover`);
    const rows=source.results.filter((row:any)=>row.owner===owner&&row.language===language);
    for(const row of rows){
      const live=store.get('SELECT state FROM releases WHERE article_id=? ORDER BY rowid DESC LIMIT 1',row.articleId)!,response=await fetch(row.url);
      assert.equal(response.status,live.state==='unpublished'?404:200);if(live.state!=='unpublished'){
        assert.ok((await response.text()).includes(`chrono-revision:${row.revisionId}:${row.sourceSha256}`));
        for(const asset of store.all('SELECT * FROM assets WHERE article_id=?',row.articleId)){
          const image=await fetch(`${new URL(row.url).origin}/content/images/chrono/${asset.digest}.png`);assert.equal(image.status,200);assert.equal(digest(Buffer.from(await image.arrayBuffer())),asset.digest);
        }
      }
    }
    const origin=new URL(rows[0].url).origin,sitemap=await(await fetch(`${origin}/sitemap-posts.xml`)).text();
    for(const row of rows){const live=store.get('SELECT state FROM releases WHERE article_id=? ORDER BY rowid DESC LIMIT 1',row.articleId)!;assert.equal(sitemap.includes(row.url),live.state!=='unpublished');}
    results.push({owner,language,container,restarted:true,publishedMarkersAndImagesMatch:true,unpublished404:true,sitemapMatches:true,recoverySeconds:Math.round((Date.now()-started)/1000)});
  }
  const evidence={performedAt:new Date().toISOString(),buildRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceFingerprint:fingerprint,evidenceLevel:'local',cases:['A24','A26','A51'],results,originalCurrentMachineUntouched:true,sourceVolumesPreserved:true,limitations:['Measured local Ghost process restart, not a production RPO/RTO or complete host disaster','No live NyxID or external account']};
  const path=join(directory,'resilience-evidence.json');await writeFile(path,JSON.stringify(evidence,null,2));process.stdout.write(JSON.stringify({status:'passed',evidence:path})+'\n');
}finally{store.close();}
