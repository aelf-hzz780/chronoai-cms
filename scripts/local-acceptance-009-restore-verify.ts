/** Read-only assertions against this run's fresh isolated restored volumes. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {Store} from '../src/store.ts';
import {Queue} from '../src/queue.ts';
import {digest} from '../src/content.ts';
import {verifyRestoredBrowser} from './local-acceptance-009-restore-browser.ts';
const root=resolve(process.argv[2]!);
assert.match(root,/\/009-[a-f0-9]{8}$/);
const original=new Store(join(root,'source/four-ghost-platform.sqlite'));
const restored=new Store(join(root,'restored/platform.sqlite'));
const source=JSON.parse(await readFile(join(root,'source/evidence.json'),'utf8'));
const report=JSON.parse(await readFile(join(root,'restored/restore-report.json'),'utf8'));
const results=[];
try{
 for(const table of ['owners','articles','revisions','assets','releases','deliveries','asset_publications','sites','author_mappings'])assert.equal(restored.get(`SELECT count(*) AS n FROM ${table}`)!.n,original.get(`SELECT count(*) AS n FROM ${table}`)!.n);
 for(const row of original.all('SELECT id,markdown,digest FROM revisions')){const copy=restored.get('SELECT markdown,digest FROM revisions WHERE id=?',row.id)!;assert.equal(digest(copy.markdown),row.digest);assert.deepEqual(Buffer.from(copy.markdown),Buffer.from(row.markdown));}
 for(const row of original.all('SELECT id,content,digest FROM assets')){const copy=restored.get('SELECT content,digest FROM assets WHERE id=?',row.id)!;assert.equal(digest(Buffer.from(copy.content)),row.digest);assert.deepEqual(Buffer.from(copy.content),Buffer.from(row.content));}
 assert.equal(new Queue(restored).claim('release',()=>{}),null);assert.equal(new Queue(restored).claim('delivery',()=>{}),null);
 for(const row of source.results){
  const group=report.projects[row.owner==='personal'?0:1];const origin=row.language==='en'?group.enUrl:group.zhUrl;
  const url=origin+new URL(row.url).pathname;const latest=original.get('SELECT * FROM releases WHERE article_id=? ORDER BY rowid DESC LIMIT 1',row.articleId)!;
  const response=await fetch(url);assert.equal(response.status,latest.state==='unpublished'?404:200);
  if(latest.state!=='unpublished'){
   assert.ok((await response.text()).includes(`chrono-revision:${row.revisionId}:${row.sourceSha256}`));
   for(const asset of original.all('SELECT digest FROM assets WHERE article_id=?',row.articleId)){
    const image=await fetch(`${origin}/content/images/chrono/${asset.digest}.png`);assert.equal(image.status,200);assert.equal(digest(Buffer.from(await image.arrayBuffer())),asset.digest);
   }
  }
  results.push({owner:row.owner,language:row.language,entry:row.entry,state:latest.state,status:'PASS'});
 }
 const sourceReleaseStates=original.all('SELECT state,count(*) AS count FROM releases GROUP BY state');
 await verifyRestoredBrowser(root,original,source,report);
 const evidence={status:'PASS',performedAt:new Date().toISOString(),authority:'synthetic; real official Ghost and MySQL',results,sourceReleaseStates,assetCount:original.get('SELECT count(*) AS n FROM assets')!.n,sourceDeliveryCount:original.get('SELECT count(*) AS n FROM deliveries')!.n,allRevisionBytesMatch:true,allPrivateAssetBytesMatch:true,publicImagesSha256Match:true,outboundPaused:true,encryptedArchiveChecksumsVerified:report.checksumsVerified,newRestoreVolumes:true,sourceVolumesPreserved:true,notVerified:['production RPO/RTO','live NyxID recovery','external provider state recovery','outbound resume']};
 await writeFile(join(root,'restore-verification.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({status:evidence.status,combinations:results.length}));
}finally{original.close();restored.close();}
