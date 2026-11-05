/** Isolated live-probe HTTP server. No workers are started.
 * This reuses a historical Ghost source and its exact CMS-owned tracker URL;
 * the normal Ghost renderer still proves all visible source content.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadConfig,safeUrl} from '../src/config.ts';
import {Store} from '../src/store.ts';
import {Vault} from '../src/vault.ts';
import {Policy} from '../src/policy.ts';
import {ContentService} from '../src/content.ts';
import {NyxAuthority} from '../src/nyxid.ts';
import {AuthManager} from '../src/auth.ts';
import {createApp} from '../src/app.ts';
import {PublishingService} from '../src/publishing.ts';
import {DistributionService} from '../src/distribution.ts';
import {createTargets} from '../src/targets.ts';
import {GhostAdapter} from '../src/ghost.ts';
import {BrowserRenderProof} from '../src/render-proof.ts';
import {ExternalPublicationService} from '../src/external-publication.ts';

const [environmentFile,sourceCmsUrl]=process.argv.slice(2);assert.ok(environmentFile&&sourceCmsUrl);
const environment=JSON.parse(await readFile(environmentFile,'utf8')),config=loadConfig(environment);
for(const url of [config.publicUrl,sourceCmsUrl])assert.ok(['localhost','127.0.0.1'].includes(safeUrl(url,true).hostname),'Live fixture origins must stay local');
const store=new Store(config.database),vault=new Vault(config.encryptionKey),authority=new NyxAuthority(config,store),policy=new Policy(store,authority),content=new ContentService(store,policy),auth=new AuthManager(config,store,vault,policy);
assert.equal(store.get('SELECT count(*) AS n FROM jobs')!.n,0,'Never run this fixture with historical queued jobs');
assert.equal(store.get("SELECT value FROM settings WHERE key='outbound_paused'")!.value,'true');
const distribution=new DistributionService(new PublishingService(content,vault),authority,createTargets(environment));
const ghost=new GhostAdapter(store,config.publicMediaDirectory,config.allowLoopback,environment,undefined,new BrowserRenderProof(environment,[new URL('/tracker.js',sourceCmsUrl).href]));
const externalPublications=new ExternalPublicationService(distribution,ghost);
const app=await createApp({store,policy,content,vault,publicUrl:config.publicUrl,auth,distribution,externalPublications,authenticate:request=>auth.authenticate(request)});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.close();store.close();});
await app.listen({host:config.host,port:config.port});
console.log(JSON.stringify({event:'isolated-external-publication.ready',port:config.port,sourceCmsUrl,workersStarted:false}));
