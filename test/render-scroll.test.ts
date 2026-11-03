import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BrowserRenderProof} from '../src/render-proof.ts';

function scrollingPage(content:string,nested=false) {
  const body=`<header>Theme header</header><article data-chrono-revision="approved">${content}</article><footer>Theme footer</footer>`;
  return `<!doctype html><html><head><style>
    html,.scroller{scroll-behavior:smooth}body{margin:0}
    header{height:1400px}footer{height:1600px}article{font:18px/1.5 sans-serif}
    .scroller{height:600px;overflow:auto}img{display:block;width:120px;height:120px}
  </style></head><body>${nested?`<main class="scroller">${body}</main>`:body}</body></html>`;
}

for(const nested of [false,true])test(`visible text below a smooth ${nested?'nested scroller':'viewport'} is verified after positioning`,async()=>{
  const renderer=new BrowserRenderProof();
  const html=scrollingPage('<h1>Approved title</h1><p>All approved words remain visible.</p>',nested);
  assert.equal(await renderer.verify('http://localhost:3999/post/',html,'approved'),true);
});

test('image-only proof positions a smooth viewport before testing image visibility',async()=>{
  const renderer=new BrowserRenderProof();
  const html=scrollingPage('<img width="120" height="120" alt="Confirmed image">');
  assert.equal(await renderer.verify('http://localhost:3999/post/',html,'approved'),true);
});
