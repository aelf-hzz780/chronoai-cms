import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers.ts';
import {Vault} from '../src/vault.ts';
import {createApp} from '../src/app.ts';
test('both entries import .md bytes including BOM/CRLF and reject invalid UTF-8; advertised operations are registered',async t=>{
  const f=fixture();let authenticated=true;const app=await createApp({...f,vault:new Vault('ab'.repeat(32)),publicUrl:'https://cms.example',authenticate:async()=>authenticated?f.actors.solo:null});t.after(async()=>{await app.close();f.store.close();});
  for(const entry of ['cms','service']) {
    const bytes=Buffer.from('\uFEFF# 你好\r\n\r\n```ts\r\n  original();\r\n```\r\n');
    const response=await app.inject({method:'POST',url:`/api/${entry}/articles/import?ownerId=solo&language=zh&title=File&creditedAuthor=Solo`,headers:{'content-type':'text/markdown'},payload:bytes});assert.equal(response.statusCode,201,response.body);const article=response.json();
    const download=await app.inject({url:`/api/${entry}/articles/${article.id}/markdown?revision=${article.revision.id}`});assert.deepEqual(download.rawPayload,bytes);
    const invalid=await app.inject({method:'PUT',url:`/api/${entry}/articles/${article.id}/markdown?expectedRevision=${article.revision.id}`,headers:{'content-type':'text/markdown'},payload:Buffer.from([0xff])});assert.equal(invalid.statusCode,400);
  }
  const spec=(await app.inject({url:'/openapi.json'})).json();authenticated=false;
  for(const [path,methods]of Object.entries(spec.paths) as [string,any][])for(const method of Object.keys(methods)) {
    const response=await app.inject({method:method.toUpperCase() as any,url:path.replace(/\{[^}]+\}/g,'test-resource'),...(methods[method].requestBody?{headers:{'content-type':path.endsWith('/import')||method==='put'&&path.endsWith('/markdown')?'text/markdown':'application/json'},payload:path.endsWith('/import')||method==='put'&&path.endsWith('/markdown')?'# file':{}}:{})});assert.equal(response.statusCode,401,`${method} ${path}: ${response.body}`);
  }
});
test('collector only trusts client IP headers from explicitly configured reverse proxies',async t=>{
  const f=fixture(),visits:any[]=[];const app=await createApp({...f,vault:new Vault('ab'.repeat(32)),publicUrl:'https://cms.example',trustedProxyCidrs:['127.0.0.1/32'],metrics:{async collect(_token:any,visit:any){visits.push(visit);}} as any,authenticate:async()=>null});t.after(async()=>{await app.close();f.store.close();});
  await app.inject({url:'/track/synthetic.gif',remoteAddress:'127.0.0.1',headers:{'x-forwarded-for':'192.0.2.10'}});
  await app.inject({url:'/track/synthetic.gif',remoteAddress:'192.0.2.20',headers:{'x-forwarded-for':'192.0.2.10'}});
  assert.equal(visits[0].ip,'192.0.2.10');assert.equal(visits[1].ip,'192.0.2.20');
});
