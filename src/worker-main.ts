import { setTimeout } from 'node:timers/promises';
import { loadConfig } from './config.ts';
import { Store } from './store.ts';
import { Vault } from './vault.ts';
import { Policy } from './policy.ts';
import { ContentService } from './content.ts';
import { NyxAuthority } from './nyxid.ts';
import { PublishingService, ReleaseWorker } from './publishing.ts';
import { GhostAdapter } from './ghost.ts';

const config = loadConfig(), store = new Store(config.database), vault = new Vault(config.encryptionKey);
const content = new ContentService(store, new Policy(store, new NyxAuthority(config)));
const worker = new ReleaseWorker(new PublishingService(content, vault), new GhostAdapter(store, config.publicMediaDirectory, config.allowLoopback));
const abort = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => abort.abort());
try {
  while (!abort.signal.aborted) {
    if (!await worker.once()) await setTimeout(1000, undefined, { signal: abort.signal }).catch(() => {});
  }
} finally { store.close(); }
