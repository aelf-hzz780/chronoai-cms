/** Stage one read-only historical Ghost source in a new, isolated CMS database.
 * Usage: node scripts/external-publication-live-fixture.ts <private source export> <registration> <new directory>
 * Source exports contain secrets and must remain outside the repository. No live
 * database, old job, historical credential, or existing service is modified.
 */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile,chmod} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {Store} from '../src/store.ts';
import {Vault} from '../src/vault.ts';

const [sourcePath,registrationPath,directoryArg]=process.argv.slice(2);
assert.ok(sourcePath&&registrationPath&&directoryArg,'Private source export, registration and new fixture directory are required');
const source=JSON.parse(await readFile(sourcePath,'utf8')),registration=JSON.parse(await readFile(registrationPath,'utf8'));
const base=new URL(registration.baseUrl);
assert.ok(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname)&&base.port);
assert.equal(registration.connection?.owner?.subject,registration.subject);
assert.equal(registration.connection?.target,'dev');
assert.ok(typeof registration.renderBrowserExecutable==='string');
const directory=resolve(directoryArg);await mkdir(directory,{mode:0o700});
const database=join(directory,'cms.sqlite'),store=new Store(database),key=randomBytes(32).toString('hex'),vault=new Vault(key);
try{
  const {tables}=source;
  assert.equal(tables.releases.length,1);assert.equal(tables.revisions.length,1);assert.equal(tables.articles.length,1);assert.equal(tables.owners.length,1);assert.equal(tables.sites.length,1);
  assert.equal(tables.releases[0].state,'published');assert.equal(tables.owners[0].kind,'personal');assert.equal(tables.owners[0].subject,registration.subject);
  assert.equal(tables.articles[0].language,'en');assert.equal(tables.releases[0].id,registration.sourceReleaseId);
  store.transaction(()=>{
    for(const name of ['owners','owner_profiles','articles','revisions','sites','site_admin_routes','author_mappings','releases']){
      for(const raw of tables[name]??[]){
        const row={...raw};
        if(name==='releases')row.actor_json=vault.seal({historicalReadOnlyImport:true});
        if(name==='revisions')row.markdown=Buffer.from(row.markdown.base64,'base64');
        if(name==='articles')row.current_revision=tables.revisions[0].id;
        const fields=Object.keys(row);assert.ok(fields.every(field=>/^[a-z_]+$/.test(field)));
        store.run(`INSERT INTO ${name}(${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`,...fields.map(field=>row[field]));
      }
    }
    store.run("UPDATE settings SET value='true' WHERE key='outbound_paused'");
    store.audit('fixture-import',tables.owners[0].id,'fixture.historical-source-read-only',tables.releases[0].id,'008-fixture-import',{sourceReleaseId:tables.releases[0].id,noJobsImported:true});
  });
  const env:Record<string,string>={};
  for(const [name,value]of Object.entries(source.env))if(name.startsWith('NYXID_')||['ALLOW_LOOPBACK_HTTP','ANALYTICS_REQUIRE_CONSENT',tables.sites[0].key_ref].includes(name))env[name]=String(value);
  Object.assign(env,{DATABASE_PATH:database,ENCRYPTION_KEY:key,TRACKING_SECRET:randomBytes(32).toString('hex'),HOST:base.hostname,PORT:base.port,PUBLIC_URL:registration.baseUrl,PUBLIC_MEDIA_DIRECTORY:join(directory,'media'),NYXID_CONNECTIONS_FILE:join(directory,'connections.json'),NYXID_SERVICE_ID:registration.serviceId,NYXID_SERVICE_SLUG:registration.slug,NYXID_SERVICE_AUDIENCE:registration.slug,RENDER_BROWSER_EXECUTABLE:registration.renderBrowserExecutable,RENDER_ASSET_ORIGINS:registration.renderAssetOrigins??'',ANALYTICS_ENABLED:'false',...registration.authorityEnv});
  await writeFile(join(directory,'connections.json'),JSON.stringify([registration.connection],null,2)+'\n',{mode:0o600});
  await writeFile(join(directory,'environment.json'),JSON.stringify(env,null,2)+'\n',{mode:0o600});
  await chmod(database,0o600);
  console.log(JSON.stringify({database,environmentFile:join(directory,'environment.json'),articleId:tables.articles[0].id,revisionId:tables.revisions[0].id,releaseId:tables.releases[0].id,sourceUrl:tables.releases[0].url,jobs:store.get('SELECT count(*) AS n FROM jobs')!.n,outboundPaused:true,historicalSourceImported:true,ghostWrites:0}));
}finally{store.close();}
