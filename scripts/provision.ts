import { mkdir, chmod } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Store } from '../src/store.ts';
import { text, requireValue } from '../src/errors.ts';
import { safeUrl } from '../src/config.ts';

// Operator-only CLI, not an application identity or user-facing login path.
const [command, ...args] = process.argv.slice(2);
const path = resolve(process.env.DATABASE_PATH ?? '.runtime/platform.sqlite');
await mkdir(dirname(path), { recursive: true, mode: 0o700 });
const store = new Store(path); await chmod(path, 0o600);
try {
  if (command === 'owner') {
    const [id, kind, issuer, subject] = args;
    requireValue(kind === 'personal' || kind === 'organization', 400, 'INVALID_INPUT', 'kind must be personal or organization');
    store.createOwner(text(id, 'id'), kind, text(issuer, 'issuer'), text(subject, 'subject'));
    store.audit('operator-cli', id, 'operator.provision.owner', id, crypto.randomUUID());
  } else if (command === 'site') {
    const [id, ownerId, language, url, keyRef] = args;
    requireValue(['en', 'zh'].includes(language), 400, 'INVALID_INPUT', 'language must be en or zh');
    requireValue(/^[A-Z][A-Z0-9_]*$/.test(keyRef), 400, 'INVALID_INPUT', 'keyRef must be an environment variable name, not a secret');
    const siteUrl = safeUrl(text(url, 'url'), process.env.ALLOW_LOOPBACK_HTTP === 'true').origin;
    store.run('INSERT INTO sites VALUES (?,?,?,?,?)', text(id, 'id'), text(ownerId, 'ownerId'), language, siteUrl, keyRef);
    store.audit('operator-cli', ownerId, 'operator.provision.site', id, crypto.randomUUID());
  } else if(command==='owner-name') {
    const [ownerId,name]=args;requireValue(store.get('SELECT 1 FROM owners WHERE id=?',text(ownerId,'ownerId')),404,'NOT_FOUND','Owner not provisioned');
    store.run('INSERT INTO owner_profiles VALUES (?,?) ON CONFLICT(owner_id) DO UPDATE SET display_name=excluded.display_name',ownerId,text(name,'displayName',200));store.audit('operator-cli',ownerId,'operator.provision.name',ownerId,crypto.randomUUID());
  } else if(command==='admin-site') {
    const [siteId,url]=args,site=store.get('SELECT owner_id FROM sites WHERE id=?',text(siteId,'siteId'));requireValue(site,404,'SITE_REQUIRED','Provision the exact site first');
    const adminUrl=safeUrl(text(url,'adminUrl'),true).origin;
    store.run('INSERT INTO site_admin_routes VALUES (?,?) ON CONFLICT(site_id) DO UPDATE SET base_url=excluded.base_url',siteId,adminUrl);
    store.audit('operator-cli',site.owner_id,'operator.provision.admin-route',siteId,crypto.randomUUID());
  } else if(command==='pause'||command==='resume') {
    requireValue(args[0]==='--confirmed',400,'CONFIRMATION_REQUIRED','Operator must inspect current/uncertain work and provide --confirmed');
    store.run("UPDATE settings SET value=? WHERE key='outbound_paused'",command==='pause'?'true':'false');store.audit('operator-cli','system',`operator.outbound.${command}`,'queue',crypto.randomUUID());
  } else if (command === 'author') {
    const [siteId, name, ghostId] = args;
    store.run('INSERT INTO author_mappings VALUES (?,?,?)', text(siteId, 'siteId'), text(name, 'creditedAuthor', 200), text(ghostId, 'ghostAuthorId'));
    const site = store.get('SELECT owner_id FROM sites WHERE id=?', siteId)!;
    store.audit('operator-cli', site.owner_id, 'operator.provision.author', siteId, crypto.randomUUID());
  } else {
    throw new Error('Usage: provision.ts owner <id> <personal|organization> <issuer> <subject> | site <id> <ownerId> <en|zh> <url> <keyEnvName> | admin-site <siteId> <privateAdminBaseUrl> | author <siteId> <creditedAuthor> <ghostAuthorId> | pause|resume --confirmed');
  }
  process.stdout.write('Provisioned; no credentials printed.\n');
} finally { store.close(); }
