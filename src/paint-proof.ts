import type {Page} from 'playwright-core';
import {PNG} from 'pngjs';
import type {RenderIntegrity} from './render-integrity.ts';
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
// Group text nodes whose rectangles do not overlap. Hiding the group together
// cannot attribute one node's glyph pixels to another, and avoids four screenshots
// per short paragraph when many paragraphs fit in the same viewport.
export async function provesTextPaint(page:Page,integrity:RenderIntegrity,marker?:string) {
  const state=await page.evaluateHandle(marker=>{
    const root=marker?[...document.querySelectorAll('[data-chrono-revision]')].find(node=>node.getAttribute('data-chrono-revision')===marker):document.querySelector('article');
    const result:Array<{node:Text;parts:Array<{offset:number;length:number}>;pending:Set<number>}>=[ ];
    if(!root)return {nodes:result,imageOnly:false};const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    while(walker.nextNode())if(walker.currentNode.textContent?.trim()){
      const node=walker.currentNode as Text,parts=[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(node.data)].filter(part=>/\S/u.test(part.segment)).map(part=>({offset:part.index,length:part.segment.length}));
      result.push({node,parts,pending:new Set(parts.map(part=>part.offset))});
    }
    return {nodes:result,imageOnly:result.length===0&&!!root.querySelector('img')};
  },marker);
  try {
    if(!await integrity.evaluate(guard=>guard?.valid()??false))return false;
    if(await state.evaluate(state=>state.imageOnly))return true;
    const deadline=Date.now()+60000;let captures=0;
    while(await state.evaluate(state=>state.nodes.some(node=>node.pending.size))){
      if(!await integrity.evaluate(guard=>guard?.valid()??false))return false;
      if(++captures>128||Date.now()>deadline)return false;
      const group=await state.evaluate(state=>{
        const range=(item:typeof state.nodes[number],part:typeof item.parts[number])=>{const range=document.createRange();range.setStart(item.node,part.offset);range.setEnd(item.node,part.offset+part.length);return range.getBoundingClientRect();};
        const first=state.nodes.find(item=>item.pending.size)!,part=first.parts.find(part=>first.pending.has(part.offset))!,target=range(first,part);
        window.scrollBy({left:target.left-innerWidth/2,top:target.top-innerHeight/2,behavior:'instant'});
        const selected:Array<{index:number;glyphs:Glyph[];box:{left:number;top:number;right:number;bottom:number}}>=[ ];
        for(const [index,item] of state.nodes.entries()){
          if(!item.pending.size)continue;
          const glyphs=item.parts.filter(part=>item.pending.has(part.offset)).map(part=>{const r=range(item,part);return {offset:part.offset,left:r.left,top:r.top,width:r.width,height:r.height};}).filter(r=>r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.left+r.width<=innerWidth&&r.top+r.height<=innerHeight);
          if(!glyphs.length)continue;
          const whole=document.createRange();whole.selectNodeContents(item.node);const r=whole.getBoundingClientRect(),box={left:r.left,top:r.top,right:r.right,bottom:r.bottom};
          if(selected.some(other=>box.left<other.box.right&&box.right>other.box.left&&box.top<other.box.bottom&&box.bottom>other.box.top))continue;
          selected.push({index,glyphs,box});
        }
        return selected;
      });
      if(!group.length||!await integrity.evaluate(guard=>guard?.valid()??false))return false;
      const glyphs=group.flatMap(item=>item.glyphs),original=await page.screenshot({animations:'disabled',caret:'hide'});
      const spans=await state.evaluateHandle((state,{indexes,guard})=>guard!.wrap(indexes.map(index=>state.nodes[index]!.node)),{indexes:group.map(item=>item.index),guard:integrity});
      let hidden:Buffer;
      try {
        const wrapped=await page.screenshot({animations:'disabled',caret:'hide'});if(!glyphPixels(original,wrapped,glyphs,false))return false;
        await integrity.evaluate((guard,spans)=>guard!.hide(spans),spans);
        hidden=await page.screenshot({animations:'disabled',caret:'hide'});
      }finally{await integrity.evaluate((guard,spans)=>guard!.restore(spans),spans);await spans.dispose();}
      const restored=await page.screenshot({animations:'disabled',caret:'hide'});
      if(!await integrity.evaluate(guard=>guard?.valid()??false)||!glyphPixels(original,restored,glyphs,false)||!glyphPixels(original,hidden,glyphs,true))return false;
      await state.evaluate((state,group)=>{for(const item of group)for(const glyph of item.glyphs)state.nodes[item.index]!.pending.delete(glyph.offset);},group);
    }
    return Date.now()<=deadline && await state.evaluate(state=>state.nodes.length>0) && await integrity.evaluate(guard=>guard?.valid()??false);
  }catch(error){
    if(!await integrity.evaluate(guard=>guard?.valid()??false))return false;
    throw error;
  }finally{await state.dispose();}
}
