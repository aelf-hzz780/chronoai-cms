import {backup} from 'node:sqlite';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {open,stat} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {Store} from './store.ts';
import {CollectionCoverage} from './collection-coverage.ts';
import {requireValue} from './errors.ts';
const magic=Buffer.from('CHRONO-BACKUP-01\n');
export function validateRestoreTargets(sites:Array<{project:string;restoreProject?:string;enPort?:number;zhPort?:number}>) {
  requireValue(Array.isArray(sites) && sites.length>0,400,'RESTORE_ISOLATION','Restore sites must be a nonempty array');
  const projects=new Set<string>(),ports=new Set<number>(),sources=new Set<string>();
  for(const site of sites) {
    requireValue(site && typeof site==='object' && !Array.isArray(site) && typeof site.project==='string' && /^[a-z0-9][a-z0-9-]+$/.test(site.project) && !sources.has(site.project),400,'RESTORE_ISOLATION','Source projects must be distinct literal strings');
    sources.add(site.project);
  }
  for(const site of sites) {
    const project=site.restoreProject;
    requireValue(typeof project==='string' && /^blogsystem-restore-[a-z0-9-]+$/.test(project) && !sources.has(project) && !projects.has(project),400,'RESTORE_ISOLATION','Every owner requires a distinct new restore project and volumes');
    projects.add(project);
    for(const port of [site.enPort,site.zhPort]) {
      requireValue(port && Number.isInteger(port) && port>1023 && port<65536 && !ports.has(port),400,'RESTORE_ISOLATION','Every restored site requires a distinct unprivileged port');
      ports.add(port);
    }
  }
}
function key(value:string){requireValue(/^[a-f0-9]{64}$/.test(value),400,'BACKUP_KEY','An independent 32-byte hex backup key is required');return Buffer.from(value,'hex');}
export async function encryptArchive(source:string,destination:string,secret:string) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret),iv);cipher.setAAD(magic);
  const handle=await open(destination,'wx',0o600);
  try {
    await handle.writeFile(Buffer.concat([magic,iv]));
    await pipeline(createReadStream(source),cipher,createWriteStream(destination,{flags:'a',mode:0o600}));
    await handle.write(cipher.getAuthTag(),0,16,(await stat(destination)).size);
    await handle.sync();
  }finally{await handle.close();}
}
export async function decryptArchive(source:string,destination:string,secret:string) {
  const handle=await open(source,'r');
  try {
    const {size}=await handle.stat();requireValue(size>magic.length+28,400,'BACKUP_FORMAT','Invalid backup envelope');
    const header=Buffer.alloc(magic.length+12),tag=Buffer.alloc(16);await handle.read(header,0,header.length,0);await handle.read(tag,0,16,size-16);
    requireValue(header.subarray(0,magic.length).equals(magic),400,'BACKUP_FORMAT','Unsupported backup envelope');
    const cipher=createDecipheriv('aes-256-gcm',key(secret),header.subarray(magic.length));cipher.setAAD(magic);cipher.setAuthTag(tag);
    await pipeline(createReadStream(source,{start:header.length,end:size-17}),cipher,createWriteStream(destination,{flags:'wx',mode:0o600}));
  }finally{await handle.close();}
}
export async function snapshotPlatform(store:Store,destination:string) {
  store.run("UPDATE settings SET value='true' WHERE key='outbound_paused'");
  store.transaction(()=>{
    requireValue(!store.get("SELECT 1 FROM jobs WHERE state='running'"),409,'WORKER_ACTIVE','Pause outbound, let active operations settle, then capture again');
  });
  new CollectionCoverage(store).checkpoint();
  await backup(store.db,destination);
}
export function isolateRestoredPlatform(store:Store,trace:string) {
  requireValue(store.get('PRAGMA integrity_check')?.integrity_check==='ok' && store.all('PRAGMA foreign_key_check').length===0,409,'BACKUP_INTEGRITY','Restored platform database failed integrity checks');
  store.transaction(()=>{
    store.run("UPDATE settings SET value='true' WHERE key='outbound_paused'");
    store.run("UPDATE releases SET state='uncertain',error_code='RESTORED_RECONCILIATION_REQUIRED' WHERE state IN ('publishing','verifying') OR id IN (SELECT resource_id FROM jobs WHERE kind='release' AND state='running')");
    store.run("UPDATE deliveries SET state='uncertain',error_code='RESTORED_RECONCILIATION_REQUIRED' WHERE state='sending' OR id IN (SELECT resource_id FROM jobs WHERE kind='delivery' AND state='running')");
    store.run("UPDATE jobs SET state='done',lease_until=NULL WHERE kind IN ('release','delivery') AND state='running'");
    store.run("UPDATE jobs SET state='queued',lease_until=NULL WHERE kind='projection' AND state='running'");
    store.run('DELETE FROM sessions');store.run('DELETE FROM oidc_states');
    store.audit('operator','system','recovery.isolated','platform',trace,{outboundPaused:true,sessionsInvalidated:true});
  });
}
