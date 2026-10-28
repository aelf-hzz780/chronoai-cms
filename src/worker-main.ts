import { setTimeout } from 'node:timers/promises';
import { loadConfig } from './config.ts';
import { Store } from './store.ts';
import { Vault } from './vault.ts';
import { Policy } from './policy.ts';
import { ContentService } from './content.ts';
import { NyxAuthority } from './nyxid.ts';
import { PublishingService, ReleaseWorker } from './publishing.ts';
import { GhostAdapter } from './ghost.ts';
import { DistributionService, DeliveryWorker } from './distribution.ts';
import { createTargets } from './targets.ts';
import { MetricsService } from './metrics.ts';
import { AlternateService,AlternateWorker } from './alternates.ts';

const config = loadConfig(), store = new Store(config.database), vault = new Vault(config.encryptionKey);
const nyx = new NyxAuthority(config,store), content = new ContentService(store, new Policy(store, nyx));
const metrics = new MetricsService(content,{enabled:config.analyticsEnabled,requireConsent:config.requireConsent,secret:config.trackingSecret});
const originals = new PublishingService(content, vault), ghost = new GhostAdapter(store, config.publicMediaDirectory, config.allowLoopback,process.env,{metrics,publicUrl:config.publicUrl,requireConsent:config.requireConsent});
const worker = new ReleaseWorker(originals, ghost), deliveries = new DeliveryWorker(new DistributionService(originals, nyx, createTargets()), ghost);
const alternates=new AlternateWorker(new AlternateService(originals),ghost);
const abort = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => abort.abort());
try {
  while (!abort.signal.aborted) {
    const originalWorked = await worker.once(), deliveryWorked = await deliveries.once(),linksWorked=await alternates.once();
    if (!originalWorked && !deliveryWorked && !linksWorked) await setTimeout(1000, undefined, { signal: abort.signal }).catch(() => {});
  }
} finally { store.close(); }
