import {loadConfig} from './config.ts';
import {Store} from './store.ts';
import {Vault} from './vault.ts';
import {Policy} from './policy.ts';
import {ContentService} from './content.ts';
import {NyxAuthority} from './nyxid.ts';
import {PublishingService} from './publishing.ts';
import {DistributionService} from './distribution.ts';
import {GhostAdapter} from './ghost.ts';
import {createTargets} from './targets.ts';
import {ExternalPublicationService} from './external-publication.ts';
import {externalSyncConfig,runExternalSync} from './external-sync.ts';

const config=loadConfig(),syncConfig=externalSyncConfig(),store=new Store(config.database),vault=new Vault(config.encryptionKey);
const nyx=new NyxAuthority(config,store),content=new ContentService(store,new Policy(store,nyx));
const distribution=new DistributionService(new PublishingService(content,vault),nyx,createTargets());
const service=new ExternalPublicationService(distribution,new GhostAdapter(store,config.publicMediaDirectory,config.allowLoopback),{syncIntervalMs:syncConfig.intervalMs});
const abort=new AbortController();
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>abort.abort());
try{await runExternalSync(service,abort.signal,syncConfig);}
finally{store.close();}
