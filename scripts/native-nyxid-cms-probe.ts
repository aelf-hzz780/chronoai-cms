/** Real official JWT/JWKS/introspection smoke; isolated CMS SQLite, zero provider writes. */
import {readFile,mkdtemp,rm,writeFile,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {loadConfig} from '../src/config.ts';
import {Store} from '../src/store.ts';
import {Vault} from '../src/vault.ts';
import {Policy} from '../src/policy.ts';
import {NyxAuthority} from '../src/nyxid.ts';
import {AuthManager} from '../src/auth.ts';
import {ContentService} from '../src/content.ts';
import {PublishingService} from '../src/publishing.ts';
import {DistributionService} from '../src/distribution.ts';
import {TargetRegistry} from '../src/targets.ts';
import {createApp} from '../src/app.ts';

const [manifestPath,outputPath]=process.argv.slice(2);
assert.ok(manifestPath&&outputPath,'Usage: native-nyxid-cms-probe.ts manifest.json result.json');
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
const directory=await mkdtemp(join(tmpdir(),'cms-official-native-'));
let store:Store|undefined,app:Awaited<ReturnType<typeof createApp>>|undefined;
const evidence:any={at:new Date().toISOString(),level:'OFFICIAL_NATIVE_AUTH_WITH_ISOLATED_CMS',officialCommit:manifest.officialCommit,providerWrites:0,realNyxBotApplication:false,realGhost:false,cases:[]};
try{
 const file=join(directory,'connections.json');await writeFile(file,'[]',{mode:0o600});
 const config=loadConfig({...manifest.env,NYXID_CONNECTIONS_FILE:file,DATABASE_PATH:join(directory,'cms.sqlite'),ENCRYPTION_KEY:randomBytes(32).toString('hex'),TRACKING_SECRET:randomBytes(32).toString('hex')});
 store=new Store(config.database);const vault=new Vault(config.encryptionKey),authority=new NyxAuthority(config,store),policy=new Policy(store,authority),content=new ContentService(store,policy),auth=new AuthManager(config,store,vault,policy),pub=new PublishingService(content,vault),distribution=new DistributionService(pub,authority,new TargetRegistry([]));
 const pair=JSON.parse(await readFile(manifest.pairPath,'utf8'));
 const actor=auth.provision(await auth.propagated(pair.identity,pair.delegation));
 assert.equal(actor.credentialSource,'service-delegation');
 await authority.validate(actor,'queued-write');
 evidence.cases.push({name:'official signed service delegation and online queued validation without patched proof',status:'PASS'});
 const owner=store.get("SELECT id FROM owners WHERE kind='personal' AND subject=?",actor.subject)!.id;
 store.run('INSERT INTO sites VALUES (?,?,?,?,?)','isolated-site',owner,'en','http://localhost:39000','NO_PROVIDER_CREDENTIAL');
 app=await createApp({store,vault,policy,content,distribution,auth,publicUrl:config.publicUrl,authenticate:r=>auth.authenticate(r)});
 const headers={'x-nyxid-identity-token':pair.identity,'x-nyxid-delegation-token':pair.delegation};
 async function check(name:string,method:string,url:string,expected:number,payload?:any,extra:Record<string,string>={}){
  const response=await app!.inject({method:method as any,url,headers:{...headers,...extra},...(payload?{payload}:{})});
  const body=response.json();evidence.cases.push({name,http:response.statusCode,expected,status:response.statusCode===expected?'PASS':'FAIL',...(response.statusCode>=400?{code:body.code}: {})});
  assert.equal(response.statusCode,expected,`${name}: ${body.code??'unexpected response'}`);return body;
 }
 await check('service workspaces','GET','/api/service/me',200);
 await check('service owner connections (empty isolated bindings)','GET',`/api/service/owners/${owner}/connections`,200);
 await check('wrong owner denied','GET','/api/service/owners/not-this-owner/connections',403);
 const article=await check('service draft create','POST','/api/service/articles',201,{ownerId:owner,language:'en',title:'Isolated official native authorization probe',markdown:'No provider writes. Local CMS evidence only.',creditedAuthor:actor.subject});
 const release=await check('service confirmation without patched proof','POST',`/api/service/articles/${article.id}/releases`,202,{ownerId:owner,revisionId:article.revision.id,creditedAuthor:actor.subject,rightsConfirmed:true,action:'publish',idempotencyKey:'official-native-probe'});
 const saved=store.get('SELECT actor_json FROM releases WHERE id=?',release.id)!.actor_json;
 await check('cancel before any worker dispatch','POST',`/api/service/releases/${release.id}/cancel`,200,{});
 assert.equal(store.get('SELECT actor_json FROM releases WHERE id=?',release.id)!.actor_json,saved);
 await check('retired proof rejected','GET','/api/service/me',409,undefined,{'x-nyxid-command-authority':'retired'});
 await check('invalid native signature rejected','GET','/api/service/me',401,undefined,{'x-nyxid-delegation-token':pair.delegation.slice(0,-12)+'tampered-jwt'});
 evidence.status='PASS';
}catch(error){evidence.status='FAIL';evidence.errorCode=(error as any).code??'ASSERTION_OR_UPSTREAM_FAILURE';process.exitCode=1;}
finally{await app?.close();store?.close();await rm(directory,{recursive:true,force:true});}
const target=resolve(outputPath),temporary=target+'.tmp';await writeFile(temporary,JSON.stringify(evidence,null,2)+'\n',{mode:0o600});await rename(temporary,target);
console.log(JSON.stringify({status:evidence.status,cases:evidence.cases.length,result:target,providerWrites:0}));
