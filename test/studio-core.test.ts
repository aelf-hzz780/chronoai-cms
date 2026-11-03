import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Transport, ApiError} from '../web/studio/src/transport.ts';
import {ContextGate, safeReturnPath} from '../web/studio/src/state.ts';
import {decodeMarkdown, markdownForSave} from '../web/studio/src/bytes.ts';

test('studio transport binds writes to CSRF and same-origin session without bearer tokens', async () => {
  let options: RequestInit | undefined;
  const api = new Transport(async (_url, init) => {options = init; return new Response('{}');});
  await assert.rejects(api.json('/articles', {method:'POST', data:{}}), /CSRF/);
  api.csrf = 'session-csrf';
  await api.json('/articles', {method:'POST', data:{title:'x'}});
  assert.equal(options?.credentials, 'same-origin');
  assert.equal(new Headers(options?.headers).get('x-csrf-token'), 'session-csrf');
  assert.equal(new Headers(options?.headers).get('authorization'), null);
  await assert.rejects(api.json('//elsewhere.invalid'), /API path/);
  await assert.rejects(api.json('/articles/../me'), /API path/);
  await assert.rejects(api.json('/articles/%2e%2e/me'), /API path/);
});

test('original Markdown request body remains exact bytes and proxy failures retain trace', async () => {
  const bytes=new TextEncoder().encode('\uFEFF# Original\r\n');let sent:RequestInit|undefined;
  const api=new Transport(async(_url,init)=>{sent=init;return new Response('proxy error',{status:503,headers:{'x-trace-id':'proxy-trace'}});});api.csrf='csrf';
  await assert.rejects(api.json('/articles/import',{method:'POST',body:bytes,contentType:'text/markdown'}),(e:unknown)=>e instanceof ApiError&&e.status===503&&e.traceId==='proxy-trace');
  assert.deepEqual(sent?.body,bytes);
  assert.equal(new Headers(sent?.headers).get('content-type'),'text/markdown');
});

test('studio transport retains safe server classification and trace on failure', async () => {
  const api = new Transport(async () => new Response(JSON.stringify({code:'CONFLICT',message:'Revision changed',traceId:'trace-42'}), {status:409}));
  await assert.rejects(api.json('/articles/a'), (e:unknown) => e instanceof ApiError && e.status===409 && e.code==='CONFLICT' && e.traceId==='trace-42');
});

test('owner and language transitions abort old work and reject late response stamps', () => {
  const context = new ContextGate(); const old = context.current();
  context.advance();
  assert.equal(old.signal.aborted,true); assert.equal(context.accepts(old),false);
  assert.equal(context.accepts(context.current()),true);
});

test('return routes cannot leave studio or smuggle credentials through URL', () => {
  assert.equal(safeReturnPath('/studio#/article/a'),'/studio#/article/a');
  assert.equal(safeReturnPath('/studio#/article/a?revision=r1'),'/studio#/article/a?revision=r1');
  assert.equal(safeReturnPath('/studio#/new/zh?source=a&revision=r1'),'/studio#/new/zh?source=a&revision=r1');
  for(const route of ['//evil.invalid','https://evil.invalid','/auth/login','/studio?token=secret','/studio/../../evil','/studio#//evil']) assert.equal(safeReturnPath(route),'/studio');
  for(const route of ['/studio#/article/a?token=secret','/studio#/new/zh?source=//evil&revision=r1','/studio#/article/a?revision=r1&revision=r2']) assert.equal(safeReturnPath(route),'/studio');
});

test('untouched imported Markdown preserves BOM and CRLF outside normalized textarea', () => {
  const raw='\uFEFF# Title\r\n\r\nBody\r\n';
  const decoded=decodeMarkdown(new TextEncoder().encode(raw));
  assert.equal(decoded,raw);
  assert.equal(markdownForSave({originalMarkdown:decoded,markdown:raw.replace(/\r\n/g,'\n'),markdownChanged:false}),raw);
  assert.equal(markdownForSave({originalMarkdown:decoded,markdown:'# edited\n',markdownChanged:true}),'# edited\n');
  assert.throws(()=>decodeMarkdown(new Uint8Array([0xff])),/UTF-8/);
  for(const bom of ['','\uFEFF'])for(const newline of ['\n','\r\n']){
    const source=`${bom}# Title${newline}Body${newline}`;
    const original=decodeMarkdown(new TextEncoder().encode(source));
    assert.deepEqual(new TextEncoder().encode(markdownForSave({originalMarkdown:original,markdown:source.replace(/\r\n/g,'\n'),markdownChanged:false})),new TextEncoder().encode(source));
  }
});
