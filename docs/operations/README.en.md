# Operator README: deploy two Ghost sites, bind CMS, and verify

[简体中文](README.md) | **English**

Follow these steps for one workspace with independent English and Chinese Ghost installations. Skip creation when reusing existing sites. This runbook uses the existing CLI, configuration, and official Ghost Admin; it does not depend on a site-request feature, notification service, or a future deployment script.

**Finish with configured sites, read-only checks, and a handoff to CMS users; outbound stays paused and the Worker stays stopped.** Publishing, updating, or deleting articles is outside this procedure. Do not enable external channels such as DEV or Hashnode.

Checked on 2026-11-05 against the repository implementation. Execute commands from the same accepted release already running in the target environment. Do not run another branch's CLI against its database.

## 0. Decide whether the ticket is executable

| Ticket | Action |
|---|---|
| Existing workspace and two Ghost sites with independent root URLs | Inventory and reuse them. Do not initialize accounts, recreate volumes, or change passwords. |
| Two independent root URLs explicitly approved for a new pair | Follow this runbook; use a separate project, ports, databases, and content volumes per workspace. |
| Agreed new design: one subdomain with `/en/`, `/zh/`, and an English root redirect | **Stop at preparation. The current `scripts/provision.ts` drops paths through `.origin`; publishing also needs path support. Do not register the bare origin or silently substitute two domains. Update this runbook after path support is delivered and accepted.** |
| CMS, workspace, domain, or operator access is missing | Ask the platform owner to supply it first. This procedure does not create duplicate workspaces or install a new CMS. |

Commands below use the repository's **single Linux host, host Node, systemd, and local Docker** layout. For an existing macOS/LAN environment or containerized CMS, retain its launcher, UID, directories, and Docker context; have its maintainer supply the equivalents before using this procedure. Do not run the Linux service/directory commands there unchanged. `localhost` never means another machine.

Do not run `infra/ghost/experiment.py --initialize` or `--resume`: they publish test articles. Its `--verify` requires the original experiment state and is not a generic new-site check.

## 1. Accept the ticket and prepare parameters

Confirm the platform owner has supplied a working CMS and existing database, Node 24.18.x, an accepted release with dependencies installed and Studio built, Docker Compose, Python 3.9+, nginx, certificates, and a controlled Ghost Admin entry. Public deployment also requires working SMTP, capacity ownership, and backup ownership. Do not upgrade images, CMS, or NyxID as part of site configuration.

Record the environment and release commit, **actual owner/workspace ID** (not a display name), personal/organization ownership, blog name, two site IDs, approved URLs, Docker context/project/free ports, CMS env path, credited author and each site's Ghost author ID, operator, backup record, and handoff contact. Record secret locations only. Reuse the personal workspace created at first login. Preserve the NyxID issuer, subject, and client configuration.

In an operator Bash session, replace every `REPLACE_…` value below. None is a secret. `OPS_RELEASE` must identify the currently deployed release; the CMS env must contain an absolute `DATABASE_PATH`.

```bash
OPS_RELEASE='/opt/chronoai/current'
OPS_CMS_ENV='/etc/chronoai/platform.env'
OPS_OWNER_ID='REPLACE_OWNER_ID'
OPS_EN_SITE_ID='REPLACE_EN_SITE_ID'
OPS_ZH_SITE_ID='REPLACE_ZH_SITE_ID'
OPS_EN_URL='https://REPLACE_EN_ROOT_URL'
OPS_ZH_URL='https://REPLACE_ZH_ROOT_URL'
OPS_EN_ADMIN='http://127.0.0.1:REPLACE_EN_PORT'
OPS_ZH_ADMIN='http://127.0.0.1:REPLACE_ZH_PORT'
OPS_EN_KEY_REF='REPLACE_UNIQUE_EN_ENV_NAME'
OPS_ZH_KEY_REF='REPLACE_UNIQUE_ZH_ENV_NAME'
OPS_AUTHOR='REPLACE_EXACT_CMS_CREDITED_AUTHOR'
OPS_EN_AUTHOR_ID='REPLACE_EN_GHOST_AUTHOR_ID'
OPS_ZH_AUTHOR_ID='REPLACE_ZH_GHOST_AUTHOR_ID'

cd "$OPS_RELEASE"
ops_node() { sudo -u chronoai /opt/node24/bin/node --env-file="$OPS_CMS_ENV" "$@"; }
/opt/node24/bin/node --version
git rev-parse HEAD
```

Fill the author IDs after step 5; complete all other configuration inputs before writing. The two keyRefs are unique **environment variable names**, using uppercase letters, digits, and underscores, not Admin API keys. Site IDs may contain only letters, digits, `-`, and `_`, never paths. Admin addresses are private root URLs reachable from the CMS process, without `/ghost`. Loopback HTTP is valid only for the same-host layout used here.

**Pass:** the release, database, workspace, and two approved HTTPS root URLs are identified. Obtain missing values instead of guessing.

## 2. Inventory, pause outbound, and back up

First check the existing database, workspace identity, and bindings read-only. This command does not create a database, migrate its schema, or print secrets. Stop if it fails.

```bash
ops_node --input-type=module - "$OPS_OWNER_ID" \
  "$OPS_EN_SITE_ID" "$OPS_EN_KEY_REF" "$OPS_ZH_SITE_ID" "$OPS_ZH_KEY_REF" <<'NODE'
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
const [ownerId, enId, enKey, zhId, zhKey] = process.argv.slice(2), path = process.env.DATABASE_PATH;
if (!ownerId || ownerId.includes('REPLACE_') || !path || !isAbsolute(path) || !existsSync(path)) {
  throw new Error('STOP: confirm owner ID and existing absolute DATABASE_PATH');
}
const db = new DatabaseSync(path, { readOnly: true });
try {
  const owner = db.prepare('SELECT id,kind,issuer FROM owners WHERE id=?').get(ownerId);
  if (!owner || owner.issuer !== process.env.NYXID_ISSUER) throw new Error('STOP: workspace/issuer mismatch');
  for (const [id, keyRef] of [[enId, enKey], [zhId, zhKey]]) {
    if (!id || !/^[A-Za-z0-9_-]+$/.test(id) || !keyRef || !/^[A-Z][A-Z0-9_]*$/.test(keyRef) || [id, keyRef].some(x => x.includes('REPLACE_'))) throw new Error('STOP: confirm site IDs and keyRefs');
    const used = db.prepare('SELECT id,owner_id FROM sites WHERE id=? OR key_ref=?').all(id, keyRef);
    if (used.some(s => s.id !== id || s.owner_id !== ownerId)) throw new Error('STOP: site ID/keyRef belongs to another site');
  }
  if (enId === zhId || enKey === zhKey) throw new Error('STOP: use independent site IDs and keyRefs');
  console.log({ owner, paused: db.prepare("SELECT value FROM settings WHERE key='outbound_paused'").get() });
  console.log(db.prepare('SELECT s.id,s.language,s.url,s.key_ref,a.base_url FROM sites s LEFT JOIN site_admin_routes a ON a.site_id=s.id WHERE s.owner_id=?').all(ownerId));
  console.log(db.prepare('SELECT a.* FROM author_mappings a JOIN sites s ON s.id=a.site_id WHERE s.owner_id=?').all(ownerId));
  console.log({ runningJobs: db.prepare("SELECT count(*) AS count FROM jobs WHERE state='running'").get().count });
} finally { db.close(); }
NODE
```

Confirm the keyRefs are not used by any other site before adding secrets to the private env; never overwrite another site's credentials. If a binding matches, preserve it and skip the corresponding step 7 command. If it differs, stop and ask the platform owner to plan the migration. Do not use `provision.ts --help` for inventory: it opens a writable Store too.

Arrange a maintenance window for the shared CMS. Pause outbound using its existing controls; for this systemd layout, run the following and repeat the read-only check above. `pause` is global and affects every workspace.

```bash
ops_node scripts/provision.ts pause --confirmed
sudo systemctl stop chronoai-worker.service
systemctl is-active chronoai-worker.service
```

**Expected:** Worker is `inactive` (a nonzero status from this query is normal), `paused.value` is `true`, and `runningJobs` is 0. Confirm there is no other host, process manager, or container running a Worker against this database and no scheduled one-shot publisher. Reconcile running/uncertain work through the ticket; do not edit states to force completion. Stopping a process cannot retract a request already sent. A new database is not paused by default.

Before changes, complete a consistent encrypted backup using [Backup and isolated recovery](../operations.md#备份与隔离恢复). Record its checksum, configuration backup location, and recovery owner; freeze API writes and Ghost Admin writes during capture. Include existing MySQL, content, CMS SQLite, env, and connection configuration. Copying an active `.sqlite` file alone loses WAL data. Back up the existing CMS/sites first when the new pair does not yet exist, then include the new sites after this procedure. **Do not execute the reference section's restore or resume commands here.**

## 3. Prepare private configuration for a new pair (skip for existing sites)

Use only a new project explicitly identified in the ticket. Select two unused ports, a separate private directory, and platform-tested official Ghost/MySQL image versions. Do not choose `latest`. `prepare.py` resolves already-pulled official images to digests; it does not pull them.

The directory below belongs to the operator and must be outside Git. `OPS_MEDIA_ROOT` must match the existing CMS `PUBLIC_MEDIA_DIRECTORY`. Private staging must share its filesystem and mount, while remaining outside all public directories.

```bash
OPS_DOCKER_CONTEXT='REPLACE_DOCKER_CONTEXT'
OPS_PROJECT='REPLACE_UNIQUE_COMPOSE_PROJECT'
OPS_PRIVATE_DIR='/REPLACE_PRIVATE_OPERATOR_DIRECTORY'
OPS_EN_PORT='REPLACE_FREE_EN_PORT'
OPS_ZH_PORT='REPLACE_FREE_ZH_PORT'
OPS_GHOST_IMAGE='ghost:REPLACE_APPROVED_VERSION'
OPS_MYSQL_IMAGE='mysql:REPLACE_APPROVED_VERSION'
OPS_MEDIA_ROOT='/var/lib/chronoai/public-media'
OPS_STAGING_ROOT='/var/lib/chronoai/private-media'
OPS_GHOST_ENV="$OPS_PRIVATE_DIR/ghost.env"
OPS_GHOST_OVERRIDE="$OPS_PRIVATE_DIR/mail.override.yaml"

docker --context "$OPS_DOCKER_CONTEXT" compose ls
docker --context "$OPS_DOCKER_CONTEXT" ps --format '{{.Names}} {{.Ports}}'
sudo ss -ltn
# STOP if the project, volumes, env file, or ports already belong to another deployment.
docker --context "$OPS_DOCKER_CONTEXT" volume ls --filter "label=com.docker.compose.project=$OPS_PROJECT"
umask 077
mkdir -m 700 "$OPS_PRIVATE_DIR"
docker --context "$OPS_DOCKER_CONTEXT" pull "$OPS_GHOST_IMAGE"
docker --context "$OPS_DOCKER_CONTEXT" pull "$OPS_MYSQL_IMAGE"
DOCKER_CONTEXT="$OPS_DOCKER_CONTEXT" python3 infra/ghost/prepare.py \
  --ghost-image "$OPS_GHOST_IMAGE" --mysql-image "$OPS_MYSQL_IMAGE" \
  --en-port "$OPS_EN_PORT" --zh-port "$OPS_ZH_PORT" --output "$OPS_GHOST_ENV"
```

Edit `ghost.env` in a controlled local editor. Do not print it to chat/logs or pass secrets as shell arguments. Preserve generated digests and independent database passwords. Replace the following non-secret settings with ticket values; never regenerate an existing project's env.

```dotenv
GHOST_EN_URL=https://REPLACE_EN_ROOT_URL
GHOST_ZH_URL=https://REPLACE_ZH_ROOT_URL
GHOST_STAFF_DEVICE_VERIFICATION=true
GHOST_EN_ADMIN_URL=https://REPLACE_PRIVATE_EN_ADMIN_URL
GHOST_ZH_ADMIN_URL=https://REPLACE_PRIVATE_ZH_ADMIN_URL
PLATFORM_MEDIA_ROOT=/var/lib/chronoai/public-media
PLATFORM_EN_SITE_ID=REPLACE_EN_SITE_ID
PLATFORM_ZH_SITE_ID=REPLACE_ZH_SITE_ID
```

Public deployment requires SMTP and device verification; do not inherit the experiment's `false` default. Add SMTP_FROM, SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, and SMTP_PASSWORD to the same private env. Obtain credentials through the secret channel and escape special characters correctly for Compose env files. Set `SMTP_SECURE` to `true` or `false` as required by the mail service. Put this template in `mail.override.yaml`, also mode 0600. Set `admin__url` below to the verified private HTTPS root URL (without `/ghost`) so browsers are not redirected to the blocked public `/ghost/` route. This differs from step 1's `OPS_*_ADMIN`: the former is for the operator's browser, the latter is the CMS same-host Admin API route. Do not expose Admin publicly to bypass access problems. See [Ghost configuration](https://docs.ghost.org/config) for configuration syntax.

```yaml
x-mail: &mail
  mail__transport: SMTP
  mail__from: ${SMTP_FROM:?Set SMTP_FROM}
  mail__options__host: ${SMTP_HOST:?Set SMTP_HOST}
  mail__options__port: ${SMTP_PORT:?Set SMTP_PORT}
  mail__options__secure: ${SMTP_SECURE:?Set SMTP_SECURE}
  mail__options__auth__user: ${SMTP_USER:?Set SMTP_USER}
  mail__options__auth__pass: ${SMTP_PASSWORD:?Set SMTP_PASSWORD}
services:
  ghost-en:
    environment:
      <<: *mail
      admin__url: ${GHOST_EN_ADMIN_URL:?Set private HTTPS Admin URL}
  ghost-zh:
    environment:
      <<: *mail
      admin__url: ${GHOST_ZH_ADMIN_URL:?Set private HTTPS Admin URL}
```

Pre-create public image and private staging directories for the new sites. These commands are **only for new directories without data**. If directories already exist, inspect their ownership, mode, and purpose instead of recursively changing permissions.

```bash
sudo install -d -o chronoai -g chronoai -m 0755 \
  "$OPS_MEDIA_ROOT/$OPS_EN_SITE_ID" "$OPS_MEDIA_ROOT/$OPS_ZH_SITE_ID"
sudo install -d -o chronoai -g chronoai -m 0700 \
  "$OPS_STAGING_ROOT/$OPS_EN_SITE_ID" "$OPS_STAGING_ROOT/$OPS_ZH_SITE_ID"
chmod 600 "$OPS_GHOST_ENV" "$OPS_GHOST_OVERRIDE"
ops_compose() {
  docker --context "$OPS_DOCKER_CONTEXT" compose --env-file "$OPS_GHOST_ENV" \
    -p "$OPS_PROJECT" -f "$OPS_RELEASE/infra/ghost/compose.yaml" \
    -f "$OPS_RELEASE/infra/platform/ghost-media.override.yaml" \
    -f "$OPS_GHOST_OVERRIDE" "$@"
}
ops_compose config --quiet
```

**Pass:** validation exits 0 without printing configuration; both instances bind only to `127.0.0.1`, MySQL has no host port, and public images mount read-only into Ghost. Use the same Docker context for preparation and Compose. Avoid full `config` or `inspect` output: it may expose secrets.

## 4. Start new sites and configure HTTPS and controlled Admin access

Start the new pair only after configuration passes. Inspect existing sites using their original configuration; do not recreate them from this template.

```bash
ops_compose up -d --wait --wait-timeout 240
ops_compose ps
curl --fail --silent --show-error --max-time 10 -o /dev/null "$OPS_EN_ADMIN/ghost/api/admin/site/"
curl --fail --silent --show-error --max-time 10 -o /dev/null "$OPS_ZH_ADMIN/ghost/api/admin/site/"
```

**Expected:** both Ghost services and both MySQL services are healthy. The site reads above prove reachability only, not Integration key validity.

Have the DNS/certificate owner resolve the approved addresses and install valid certificates. Copy the Ghost server block from the [nginx template](../../infra/platform/nginx.conf.example) into managed target configuration twice, filling the actual hosts, certificates, and loopback ports. Preserve the existing CMS server; do not replace the entire configuration. Public `/ghost` and `/ghost/` must return 404. Operators use only the verified VPN/tunnel/private Admin entry. Configure a separate private Admin proxy to the matching loopback port, with a private HTTPS host/certificate, restricted listener, and VPN/firewall allowlist that denies public access. Match `GHOST_*_ADMIN_URL` and allow Admin and its resources through that private proxy. Forward the matching `Host`, including a non-default port, and set `X-Forwarded-Proto: https` explicitly to avoid redirect loops. Confirm the proxy overwrites `X-Forwarded-Proto` and `X-Forwarded-For` rather than trusting client values.

The step 0 stop condition still applies to `/en/` and `/zh/` on one domain. The current nginx template does not prove that design is supported.

```bash
sudo nginx -t
# Run only after nginx -t succeeds; use the existing service manager for this host.
sudo systemctl reload nginx
for site in "$OPS_EN_URL" "$OPS_ZH_URL"; do
  curl --fail --silent --show-error --max-time 15 -o /dev/null -w '%{http_code}\n' "$site/"
  curl --silent --show-error --max-time 15 -o /dev/null -w '%{http_code}\n' "$site/ghost"
  curl --silent --show-error --max-time 15 -o /dev/null -w '%{http_code}\n' "$site/ghost/"
done
```

**Expected:** each group returns `200 / 404 / 404`, certificates are trusted, and no request redirects to localhost or the other site. Fix failures rather than hiding them with `curl -k`. For a LAN private CA, use the authorized CA with a verified fingerprint; configure trust for curl and Node separately, using `NODE_EXTRA_CA_CERTS` for Node, never disabling verification.

## 5. Initialize both sites and prepare theme, keys, and authors

For each English and Chinese site:

1. Open `/ghost/` on the private root URL in a browser. Confirm it does not redirect to the public domain, localhost, or a redirect loop before continuing. Create a trusted operator account only for a new site; reuse the account on an existing site. Do not give ordinary CMS users Ghost Admin passwords.
2. Set the ticket's blog name and the appropriate language separately. Check the actual public URL. A blog name is neither a workspace ID nor an author name.
3. Upload and activate the approved B-style theme package. If none exists, package it from the release with dependencies installed using the command below. Use a real maintainer email, never `--fixture` or an invented address. Use a new output path to preserve the old package.
4. In each site's Settings → Integrations, create or reuse the CMS Custom Integration. Put its **Admin API key** into the CMS private env under the two keyRefs from step 1. Do not substitute a Content API key or copy secrets into README files, commands, or tickets.
5. Prepare a Ghost author matching the CMS credited author and record each site's author ID. Reuse existing authors; IDs from different sites are not interchangeable. An operator can check the ID/name in the authenticated Ghost Admin user response without exporting cookies or the full response. See [Ghost Users API](https://docs.ghost.org/admin-api/users/overview) for its data structure. Fill `OPS_EN_AUTHOR_ID` and `OPS_ZH_AUTHOR_ID` with the verified IDs.

Theme packaging example:

```bash
OPS_THEME_EMAIL='REPLACE_REAL_MAINTAINER_EMAIL'
OPS_THEME_ZIP='/REPLACE_PRIVATE_OPERATOR_DIRECTORY/chronoai-b-approved.zip'
/opt/node24/bin/node themes/chronoai-b/pack.mjs \
  --author-email "$OPS_THEME_EMAIL" --output "$OPS_THEME_ZIP"
```

Also update the existing CMS env: preserve all other keyRefs and `GHOST_MEDIA_STAGING_JSON` entries, adding only the new pair. Do not overwrite other workspaces. Keep `PUBLIC_MEDIA_DIRECTORY` as the public root; nginx and Ghost must not expose staging. The env should be root:chronoai, mode 0640. Secret-manager injection is also valid, provided the CLI, API, and future Worker receive consistent configuration.

This example shows the shape only. Replace site IDs and paths and **merge** with the existing JSON:

```dotenv
GHOST_MEDIA_STAGING_JSON={"REPLACE_EN_SITE_ID":"/var/lib/chronoai/private-media/REPLACE_EN_SITE_ID","REPLACE_ZH_SITE_ID":"/var/lib/chronoai/private-media/REPLACE_ZH_SITE_ID"}
```

**Pass:** names, languages, themes, Admin keys, and author IDs are prepared for both sites, with secrets confined to private configuration. Verify device-verification mail through an operator login after configuring mail; this does not require publishing a blog article.

## 6. Validate before registration

This read-only check validates identity, URLs, IDs, and keyRefs. It rejects path-based sites, unresolved placeholders, conflicting bindings, and missing keys. Passing does not prove the key authenticates to Ghost; step 8 checks the remote service.

```bash
ops_node --input-type=module - "$OPS_OWNER_ID" \
  "$OPS_EN_SITE_ID" "$OPS_EN_URL" "$OPS_EN_ADMIN" "$OPS_EN_KEY_REF" "$OPS_EN_AUTHOR_ID" \
  "$OPS_ZH_SITE_ID" "$OPS_ZH_URL" "$OPS_ZH_ADMIN" "$OPS_ZH_KEY_REF" "$OPS_ZH_AUTHOR_ID" "$OPS_AUTHOR" <<'NODE'
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { safeUrl } from './src/config.ts';
const args = process.argv.slice(2), [ownerId] = args, author = args[11];
const stop = () => { throw new Error('STOP: check ticket, identity, URL, bindings, pause, or private configuration'); };
if (args.length !== 12 || args.some(x => !x || x.includes('REPLACE_'))) stop();
const path = process.env.DATABASE_PATH;
if (!path || !isAbsolute(path) || !existsSync(path)) stop();
const db = new DatabaseSync(path, { readOnly: true });
try {
  const owner = db.prepare('SELECT issuer FROM owners WHERE id=?').get(ownerId);
  if (owner?.issuer !== process.env.NYXID_ISSUER || db.prepare("SELECT value FROM settings WHERE key='outbound_paused'").get()?.value !== 'true') stop();
  if (db.prepare("SELECT count(*) AS n FROM jobs WHERE state='running'").get().n) stop();
  if (args[1] === args[6] || new URL(args[2]).origin === new URL(args[7]).origin || args[4] === args[9] || new URL(args[3]).origin === new URL(args[8]).origin) stop();
  for (const [offset, language] of [[1, 'en'], [6, 'zh']]) {
    const [id, url, admin, keyRef, ghostId] = args.slice(offset, offset + 5);
    if (!/^[A-Za-z0-9_-]+$/.test(id) || !/^[A-Z][A-Z0-9_]*$/.test(keyRef)) stop();
    for (const [address, isAdmin] of [[url, false], [admin, true]]) {
      const parsed = safeUrl(address, isAdmin);
      if (parsed.pathname !== '/' || parsed.search || parsed.hash) stop();
    }
    if (!/^[a-f0-9]+:[a-f0-9]{64}$/.test(process.env[keyRef] ?? '')) stop();
    const existing = db.prepare('SELECT * FROM sites WHERE id=? OR (owner_id=? AND language=?)').all(id, ownerId, language);
    if (existing.some(s => s.id !== id || s.owner_id !== ownerId || s.language !== language || s.url !== new URL(url).origin || s.key_ref !== keyRef)) stop();
    if (db.prepare('SELECT 1 FROM sites WHERE id<>? AND (key_ref=? OR url=?)').get(id, keyRef, new URL(url).origin)) stop();
    if (db.prepare('SELECT 1 FROM site_admin_routes WHERE site_id<>? AND base_url=?').get(id, new URL(admin).origin)) stop();
    const route = db.prepare('SELECT base_url FROM site_admin_routes WHERE site_id=?').get(id);
    if (route && route.base_url !== new URL(admin).origin) stop();
    const mapping = db.prepare('SELECT ghost_author_id FROM author_mappings WHERE site_id=? AND credited_author=?').get(id, author);
    if (mapping && mapping.ghost_author_id !== ghostId) stop();
    console.log({ id, language, site: existing.length ? 'KEEP' : 'ADD', admin: route ? 'KEEP' : 'ADD', author: mapping ? 'KEEP' : 'ADD' });
  }
} finally { db.close(); }
NODE
```

## 7. Register in CMS and restart only the API

**Select individual commands** from the preceding `ADD/KEEP` output: execute only an `ADD` item and skip `KEEP`. `site` and `author` use INSERT and are not idempotent. `admin-site` can overwrite an old value and must not bypass validation. Avoid concurrent configuration changes to the workspace. If any command fails, stop and repeat inventory from step 2; do not blindly rerun the whole block.

```bash
# Execute only the lines marked ADD by step 6.
ops_node scripts/provision.ts site "$OPS_EN_SITE_ID" "$OPS_OWNER_ID" en "$OPS_EN_URL" "$OPS_EN_KEY_REF"
ops_node scripts/provision.ts site "$OPS_ZH_SITE_ID" "$OPS_OWNER_ID" zh "$OPS_ZH_URL" "$OPS_ZH_KEY_REF"
ops_node scripts/provision.ts admin-site "$OPS_EN_SITE_ID" "$OPS_EN_ADMIN"
ops_node scripts/provision.ts admin-site "$OPS_ZH_SITE_ID" "$OPS_ZH_ADMIN"
ops_node scripts/provision.ts author "$OPS_EN_SITE_ID" "$OPS_AUTHOR" "$OPS_EN_AUTHOR_ID"
ops_node scripts/provision.ts author "$OPS_ZH_SITE_ID" "$OPS_AUTHOR" "$OPS_ZH_AUTHOR_ID"
```

Repeat step 6: all entries must now be `KEEP`. A new CLI reading the env does not mean the API has reloaded it. Restart **only the API** in the maintenance window; do not start or enable the Worker. Preserve the NyxID client, issuer, roles, connections, and approval policies.

```bash
sudo systemctl restart chronoai-api.service
systemctl is-active chronoai-api.service
systemctl is-active chronoai-worker.service
```

**Expected:** API is `active`, Worker is `inactive`, and the step 2 pause value remains `true`. If the prepared release lacks a Studio build, have the release owner complete `npm ci`, `npm run build:studio`, and its acceptance process before switching to it; systemd does not build the frontend.

## 8. Verify read-only without publishing

Run authenticated reads against both Ghost Integrations and validate media directories. This command runs as the CMS Unix user and sends only Ghost GET requests. It creates no articles, prints no content, and starts no Worker. SQLite is read-only; output contains only site IDs and check results, or a safe error code on failure.

```bash
ops_node --input-type=module - "$OPS_OWNER_ID" "$OPS_EN_SITE_ID" "$OPS_ZH_SITE_ID" "$OPS_AUTHOR" <<'NODE'
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { GhostAdapter } from './src/ghost.ts';
import { MediaStaging } from './src/media-staging.ts';
const [ownerId, en, zh, author] = process.argv.slice(2);
let db;
try {
  const path = process.env.DATABASE_PATH, mediaRoot = process.env.PUBLIC_MEDIA_DIRECTORY;
  if (!path || !isAbsolute(path) || !existsSync(path) || !mediaRoot || !isAbsolute(mediaRoot)) throw new Error('Configuration');
  db = new DatabaseSync(path, { readOnly: true });
  const readStore = { get: (sql, ...p) => db.prepare(sql).get(...p), all: (sql, ...p) => db.prepare(sql).all(...p) };
  const ghost = new GhostAdapter(readStore, mediaRoot, false, process.env);
  const media = new MediaStaging(readStore, mediaRoot, process.env);
  for (const id of [en, zh]) {
    const site = readStore.get('SELECT * FROM sites WHERE id=? AND owner_id=?', id, ownerId);
    const mapping = readStore.get('SELECT ghost_author_id FROM author_mappings WHERE site_id=? AND credited_author=?', id, author);
    if (!site || !mapping) throw new Error('Binding');
    const response = await ghost.call({ site }, 'posts/?limit=1&fields=id', 'GET');
    if (!Array.isArray(response.posts)) throw new Error('GhostContract');
    await media.resolve(id);
    console.log({ siteId: id, integrationRead: 'PASS', mediaLayout: 'PASS' });
  }
} catch (error) {
  console.error({ result: 'FAIL', code: typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'OPS_READ_CHECK_FAILED' });
  process.exitCode = 1;
} finally { db?.close(); }
NODE
```

A media PASS proves static layout rules such as isolation, 0700/UID, and matching filesystem/mount only. It does not prove publication, image writes, or public image verification. A host check does not replace mount checks inside a containerized Worker. On failure, consult [Private media staging](../operations.md#图片私有-staging-配置), fix the layout, and rerun; never copy temporary images into public storage to bypass checks.

Then perform and record these checks:

| Check | Pass condition |
|---|---|
| CMS `GET /health` | 200; this covers API/SQLite only, not NyxID/Ghost. |
| Real CMS login | Start a fresh NyxID login from CMS and select the ticket's workspace. Do not reuse an old callback URL. |
| Sites/workspace page | Both languages show the correct URLs; the editor's corresponding “not configured” warning disappears. |
| Site endpoint | From an authenticated browser, read `GET /api/cms/owners/{ownerId}/sites`; both sites have `configured=true`. Currently `verification.status` is always `unknown`; this is not a failed check and must not be manually changed to verified. |
| Author | Each site's Admin author ID matches the intended name; the CMS credited author exactly matches its mapping. A successful authenticated GET does not prove the author mapping. |
| Home/language/theme | EN/ZH names and languages are correct, the B theme is active, TLS works, and public Admin returns 404. |
| Rendering prerequisites | `RENDER_BROWSER_EXECUTABLE` identifies Chromium usable by the runtime user, with `RENDER_BROWSER_SANDBOX` enabled. Record target-environment validation following [Rendering proof](../operations.md#公开正文渲染证明). Do not claim article proof passed without a real article. |
| Stop boundary | Worker stopped, `outbound_paused=true`, no new publishing execution or external synchronization. |

Do not click Publish to test configuration. Full article/image acceptance requires a separate confirmation listing the article, revision, credited author, workspace, language, target URL, and action.

## 9. Handoff, troubleshooting, and maintenance

Check each item in the ticket. Keep missing items pending rather than declaring publishing fully ready:

- [ ] Workspace ID/ownership, blog name, both site IDs, URLs, languages, and author mappings are correct.
- [ ] Release commit, Ghost/MySQL digests, Docker context/project/ports, and deployment time are recorded.
- [ ] Only secret locations are recorded; original NyxID identity and other workspaces' configuration are preserved.
- [ ] HTTPS, private Admin, SMTP, authenticated GET, media layout, CMS login, and configured checks are attached.
- [ ] Encrypted backups include new Ghost env, private override, SMTP configuration, MySQL/content, and CMS env/SQLite; the recovery owner and off-host storage location are identified.
- [ ] Monitoring covers homepages/TLS renewal, disk, MySQL health, and backup freshness. This project does not automatically send operator notifications. Unconfirmed privacy retention, capacity, or recovery targets remain production-delivery gaps.
- [ ] Outbound remains paused, Worker remains stopped, and external channels such as DEV remain disabled.
- [ ] The requester receives the CMS entry, both site URLs, check date, and outstanding publication confirmation. **Mark handoff complete only after actually notifying them**; do not claim the system sent a notification automatically.

| Problem | Next action |
|---|---|
| UI still says not configured | Match the logged-in owner ID/language to the binding, then refresh. Do not create another owner using its display name. |
| `GHOST_CREDENTIAL_REQUIRED` / 401 | Check Admin key type, keyRef, target site, and runtime env. Restart only the API after correction and repeat read-only validation. |
| Connection/TLS failure | Check same-host ports, private route, service health, and trusted CA. Do not disable TLS checks. |
| `AUTHOR_MAPPING_REQUIRED` | Verify exact credited-author text and this site's author ID, not the other site's ID. |
| `MEDIA_STAGING_*` | Check UID/mode/path/mount rules; do not expose staging or bypass validation. |
| Partial failure or conflicting records | Preserve state and return to read-only inventory in step 2. Fixes/migrations need a separate ticket; do not repeat INSERTs or edit the database directly. |

Keep outbound paused during rollback. Stop a newly created project with its original `ops_compose stop`; **preserve volumes and never run `down -v`**. Revert only this ticket's proxy changes, validating with `nginx -t` first. If CMS env/bindings have been used, do not simply delete records or restore the entire database. The platform owner must check concurrent changes, schema compatibility, and backups, restore into isolation, then decide whether to switch. Preserve existing sites' data, entries, and accounts.

The first publication requires separate confirmation. Same-domain path support, automatic provisioning, NyxID connection migration, and external publishing are not performed as side effects of this procedure.

Related documents: [Deployment/backup/recovery reference](../operations.md) · [NyxID configuration](../nyxid-registration.md) · [Development guide](../development.md) · [Historical two-Ghost experiment](../../infra/ghost/README.md) (includes publication steps; do not use it as this procedure's execution sequence).
