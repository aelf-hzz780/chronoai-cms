import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BrowserRenderProof} from '../src/render-proof.ts';

function fractionalPage(content:string,extraCss=''){
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:white;color:#15171a}
    header{height:1400.078125px}footer{height:1200px}
    article{margin:0 auto;width:720px;font:17px/1.6 sans-serif;letter-spacing:-.17px}
    h1{font-size:37.4px;line-height:1.2;letter-spacing:-.748px}
    table{border-collapse:collapse}th,td{padding:3px}
    pre{padding:16px;background:#f6f6f6}code{font:15px/1.5 monospace}
    a{color:rgb(255,26,117);text-decoration:underline;text-decoration-color:rgb(255,26,117)}
    ${extraCss}
  </style></head><body><header></header><article data-chrono-revision="approved">${content}</article><footer></footer></body></html>`;
}

test('fractional scrolling text, tables, code and underlined links retain exact paint across cold renderer launches',async()=>{
  const html=fractionalPage('<h1>Original 中文 text</h1><table><tr><th>owner</th><th>language</th></tr><tr><td>organization</td><td>en</td></tr></table><pre><code>const original = "organization-en-service";</code></pre><p><a href="https://example.com/">Source</a></p>');
  for(let run=0;run<3;run++)assert.equal(await new BrowserRenderProof().verify('http://localhost:3999/paint/',html,'approved'),true,`Cold renderer ${run+1}`);
});

test('bilingual text and color emoji including joined graphemes still prove their visible ink',async()=>{
  const html=fractionalPage('<p>English 原文测试 🚀 😀 👩‍💻</p>');
  assert.equal(await new BrowserRenderProof().verify('http://localhost:3999/paint/',html,'approved'),true);
});

for(const [name,css] of [
  ['transparent glyph fill','a{-webkit-text-fill-color:transparent}'],
  ['glyphs matching the background','a{color:white;background:white}'],
])test(`a visible underline cannot substitute for ${name}`,async()=>{
  const html=fractionalPage('<p><a href="https://example.com/">Source</a></p>',css);
  assert.equal(await new BrowserRenderProof().verify('http://localhost:3999/paint/',html,'approved'),false);
});

for(const [name,css] of [
  ['glyph outlines','a{-webkit-text-fill-color:transparent;-webkit-text-stroke:1px #15171a}'],
  ['glyph shadows','a{-webkit-text-fill-color:transparent;text-shadow:0 0 0 #15171a}'],
])test(`visible ${name} still prove the actual letters beside an underline`,async()=>{
  const html=fractionalPage('<p><a href="https://example.com/">Source</a></p>',css);
  assert.equal(await new BrowserRenderProof().verify('http://localhost:3999/paint/',html,'approved'),true);
});
