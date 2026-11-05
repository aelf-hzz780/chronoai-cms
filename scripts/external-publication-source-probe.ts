/** Read-only verification of the exact real Ghost source staged for a live probe. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {chromium} from 'playwright-core';
import {loadConfig} from '../src/config.ts';
import {Store} from '../src/store.ts';
import {Vault} from '../src/vault.ts';
import {Policy} from '../src/policy.ts';
import {ContentService,digest} from '../src/content.ts';
import {PublishingService} from '../src/publishing.ts';
import {NyxAuthority} from '../src/nyxid.ts';
import {GhostAdapter} from '../src/ghost.ts';
import {BrowserRenderProof} from '../src/render-proof.ts';

const [environmentFile,releaseId,resultFile,sourceCmsUrl]=process.argv.slice(2);
assert.ok(environmentFile&&releaseId&&resultFile,'Usage: node scripts/external-publication-source-probe.ts <private environment.json> <releaseId> <result.json>');
const environment=JSON.parse(await readFile(environmentFile,'utf8')),config=loadConfig(environment),store=new Store(config.database);
try{
  const content=new ContentService(store,new Policy(store,new NyxAuthority(config,store))),publishing=new PublishingService(content,new Vault(config.encryptionKey));
  const row=store.get('SELECT * FROM releases WHERE id=?',releaseId)!;assert.ok(row);assert.equal(row.state,'published');
  const tracker=sourceCmsUrl?new URL('/tracker.js',sourceCmsUrl).href:undefined;
  const input=publishing.input(row),ghost=new GhostAdapter(store,config.publicMediaDirectory,config.allowLoopback,environment,undefined,new BrowserRenderProof(environment,tracker?[tracker]:[]));
  const verified=await ghost.verify(input,{remoteId:row.remote_id,url:row.url});
  assert.equal(verified,true,'Exact current Ghost source must verify');
  const screenshot=join(dirname(resultFile),'ghost-original.png'),browser=await chromium.launch({headless:true,executablePath:environment.RENDER_BROWSER_EXECUTABLE});
  try{const page=await browser.newPage({viewport:{width:1200,height:900}});if(tracker)await page.route(tracker,route=>route.abort());await page.goto(row.url,{waitUntil:'networkidle'});await page.screenshot({path:screenshot,fullPage:true});}finally{await browser.close();}
  const result={at:new Date().toISOString(),level:'OfficialLocal',source:'Real Ghost admin API + public page + browser render proof',verified,releaseId,articleId:input.articleId,revisionId:input.revisionId,title:input.title,creditedAuthor:input.creditedAuthor,sourceUrl:row.url,sourceCmsUrl:sourceCmsUrl??null,knownCmsTrackerExcluded:tracker??null,markdownSha256:digest(input.markdown),markdown:input.markdown,screenshot,ghostWrites:0,providerWrites:0,formalPublicInternetReachability:false,publicPublicationAuthorized:false};
  await writeFile(resultFile,JSON.stringify(result,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({...result,markdown:undefined},null,2));
}finally{store.close();}
