import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fixture} from './helpers.ts';
import {createApp} from '../src/app.ts';
import {Vault} from '../src/vault.ts';

test('R034: encoded Markdown files survive MCP text transport without changing authorized revision bytes',async t=>{
  const f=fixture();let actor=f.actors.solo;
  const app=await createApp({...f,vault:new Vault('ab'.repeat(32)),publicUrl:'https://cms.example',authenticate:async()=>actor});
  t.after(async()=>{await app.close();f.store.close();});
  const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
  const spec=(await app.inject({url:'/openapi.json'})).json();
  const operation=spec.paths['/api/service/articles/{id}/markdown-file']?.get;
  assert.equal(operation?.operationId,'downloadMarkdown');
  assert.equal(operation.parameters.find((p:any)=>p.name==='revision').required,true);
  const schema=operation.responses['200'].content['application/json'].schema;
  assert.equal(schema.properties.data.contentEncoding,'base64');
  assert.equal(schema.properties.data.contentMediaType,'text/markdown');
  for(const language of ['en','zh'])for(const bom of [false,true])for(const newline of ['\n','\r\n'])await t.test(`${language}, BOM=${bom}, ${newline==='\n'?'LF':'CRLF'}`,async()=>{
    const source=Buffer.from((bom?'\uFEFF':'')+[language==='en'?'# Original':'# 原始稿','', '```ts','const exact = "A B";','```',''].join(newline));
    const upload=await app.inject({method:'POST',url:`/api/service/articles/import?ownerId=solo&language=${language}&title=Original&creditedAuthor=Solo`,headers:{'content-type':'text/markdown'},payload:source});
    assert.equal(upload.statusCode,201,upload.body);const article=upload.json();
    const edited=await app.inject({method:'PATCH',url:`/api/service/articles/${article.id}`,payload:{expectedRevision:article.revision.id,markdown:'Later revision'}});
    assert.equal(edited.statusCode,200,edited.body);
    for(const entry of ['cms','service']){
      const response=await app.inject({url:`/api/${entry}/articles/${article.id}/markdown-file?revision=${article.revision.id}`});
      assert.equal(response.statusCode,200,response.body);assert.match(String(response.headers['content-type']),/^application\/json/);
      // NyxID reads a non-image body with response.text(). Decode that actual
      // text result as the documented file envelope, never as Markdown itself.
      const file=JSON.parse(await new Response(new Uint8Array(response.rawPayload)).text());
      assert.equal(file.encoding,'base64');assert.equal(file.mediaType,'text/markdown');assert.equal(file.filename,'article.md');
      assert.equal(file.articleId,article.id);assert.equal(file.revisionId,article.revision.id);
      const bytes=Buffer.from(file.data,'base64');assert.deepEqual(bytes,source);assert.equal(file.byteLength,source.length);assert.equal(file.sha256,hash(bytes));
      const raw=await app.inject({url:`/api/${entry}/articles/${article.id}/markdown?revision=${article.revision.id}`});
      assert.deepEqual(raw.rawPayload,source,'Existing raw download remains byte exact');
    }
    const conflict=await app.inject({method:'PUT',url:`/api/service/articles/${article.id}/markdown?expectedRevision=${article.revision.id}`,headers:{'content-type':'text/markdown'},payload:Buffer.from('Stale write')});
    assert.equal(conflict.statusCode,409);assert.equal(conflict.json().code,'CONFLICT');
    assert.equal((await app.inject({url:`/api/service/articles/${article.id}/markdown-file`})).statusCode,400);
    actor=f.actors.outsider;
    const denied=await app.inject({url:`/api/service/articles/${article.id}/markdown-file?revision=${article.revision.id}`});
    assert.equal(denied.statusCode,403);assert.equal(denied.json().data,undefined);actor=f.actors.solo;
  });
  const draft=await f.content.create(f.actors.member,{ownerId:'org',language:'zh',title:'Private',markdown:'Private org draft',creditedAuthor:'Member'},'private-draft');
  actor=f.actors.admin;
  for(const entry of ['cms','service'])assert.equal((await app.inject({url:`/api/${entry}/articles/${draft.id}/markdown-file?revision=${draft.revision.id}`})).statusCode,403,'Admin cannot export another member private draft');
});
