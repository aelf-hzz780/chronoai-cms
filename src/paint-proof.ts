import type {Page} from 'playwright-core';
import {PNG} from 'pngjs';
interface Glyph {offset:number;left:number;top:number;width:number;height:number;}
function glyphPixels(before:Buffer,hidden:Buffer,glyphs:Glyph[],painted:boolean) {
  const a=PNG.sync.read(before),b=PNG.sync.read(hidden);if(a.width!==b.width||a.height!==b.height)return false;
  const stride=a.width+1,sum=new Uint32Array(stride*(a.height+1));
  for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){
    const pixel=(y*a.width+x)*4,changed=a.data[pixel]!==b.data[pixel]||a.data[pixel+1]!==b.data[pixel+1]||a.data[pixel+2]!==b.data[pixel+2]||a.data[pixel+3]!==b.data[pixel+3]?1:0;
    sum[(y+1)*stride+x+1]=changed+sum[y*stride+x+1]!+sum[(y+1)*stride+x]!-sum[y*stride+x]!;
  }
  return glyphs.every(glyph=>{
    const x1=Math.max(0,Math.floor(glyph.left)),y1=Math.max(0,Math.floor(glyph.top)),x2=Math.min(a.width,Math.ceil(glyph.left+glyph.width)),y2=Math.min(a.height,Math.ceil(glyph.top+glyph.height));
    if(x2<=x1||y2<=y1)return false;
    const changed=sum[y2*stride+x2]!-sum[y1*stride+x2]!-sum[y2*stride+x1]!+sum[y1*stride+x1]!;
    return painted?changed>0:changed===0;
  });
}
// Measure actual raster contributions, not just DOM layout boxes. Wrap only one
// text node, verify the wrapper has no visual effect, then hide it without
// changing layout. Every non-whitespace grapheme must contribute visible pixels.
export async function provesTextPaint(page:Page,marker?:string) {
  const list=await page.evaluateHandle(marker=>{
    const root=marker?[...document.querySelectorAll('[data-chrono-revision]')].find(node=>node.getAttribute('data-chrono-revision')===marker):document.querySelector('article');
    const result:Text[]=[];if(!root)return result;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    while(walker.nextNode())if(walker.currentNode.textContent?.trim())result.push(walker.currentNode as Text);return result;
  },marker);
  try {
  const nodes=await list.evaluate(nodes=>nodes.length),deadline=Date.now()+60000;
  if(!nodes)return false;let captures=0;
  for(let index=0;index<nodes;index++){
    const text=await list.evaluateHandle((nodes,index)=>nodes[index]!,index);
    try {
      const offsets=await text.evaluate(node=>[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(node.data)].filter(part=>/\S/u.test(part.segment)).map(part=>part.index));
      const remaining=new Set(offsets);
      while(remaining.size){
        if(++captures>128||Date.now()>deadline)return false;
        const glyphs=await text.evaluate((node,pending)=>{
          const wanted=new Set(pending);
          const parts=[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(node.data)].filter(part=>wanted.has(part.index));
          const bounds=(part:typeof parts[number])=>{const range=document.createRange();range.setStart(node,part.index);range.setEnd(node,part.index+part.segment.length);return range.getBoundingClientRect();};
          const target=bounds(parts[0]!);window.scrollBy({left:target.left-innerWidth/2,top:target.top-innerHeight/2,behavior:'instant'});
          return parts.map(part=>{const r=bounds(part);return {offset:part.index,left:r.left,top:r.top,width:r.width,height:r.height};}).filter(r=>r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.left+r.width<=innerWidth&&r.top+r.height<=innerHeight);
        },[...remaining]);
        if(!glyphs.length)return false;
        const original=await page.screenshot({animations:'disabled',caret:'hide'});
        const span=await text.evaluateHandle(node=>{const span=document.createElement('span');node.replaceWith(span);span.append(node);return span;});
        let hidden:Buffer,stable:boolean;
        try {
          const wrapped=await page.screenshot({animations:'disabled',caret:'hide'});
          if(!glyphPixels(original,wrapped,glyphs,false))return false;
          await span.evaluate(element=>element.style.setProperty('opacity','0','important'));
          hidden=await page.screenshot({animations:'disabled',caret:'hide'});
        }finally{await span.evaluate(element=>element.replaceWith(element.firstChild!));await span.dispose();}
        const restored=await page.screenshot({animations:'disabled',caret:'hide'});stable=glyphPixels(original,restored,glyphs,false);
        if(!stable||!glyphPixels(original,hidden,glyphs,true))return false;
        for(const glyph of glyphs)remaining.delete(glyph.offset);
      }
    }finally{await text.dispose();}
  }
  return true;
  }finally{await list.dispose();}
}
