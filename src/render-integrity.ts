import type {Page} from 'playwright-core';

/** Bind the complete asynchronous proof to the original nodes and content. */
export async function beginRenderIntegrity(page:Page,html:string,marker?:string) {
  return page.evaluateHandle(({html,marker})=>{
    const selector=marker?'[data-chrono-revision]':'article';
    const matches=()=>[...document.querySelectorAll(selector)].filter(node=>!marker||node.getAttribute('data-chrono-revision')===marker);
    const roots=matches(),root=roots[0];if(roots.length!==1||!root)return null;
    const captured=[...new DOMParser().parseFromString(html,'text/html').querySelectorAll(selector)].find(node=>!marker||node.getAttribute('data-chrono-revision')===marker);
    if(!captured||captured.outerHTML!==root.outerHTML)return null;
    const originalHTML=root.outerHTML,originalNodes=new Set<Node>([root]);
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_ALL);while(walker.nextNode())originalNodes.add(walker.currentNode);
    let changed=false;
    function collect(records:MutationRecord[]) {
      for(const record of records)if(originalNodes.has(record.target)||root!.contains(record.target)||record.type==='childList'&&[...record.addedNodes,...record.removedNodes].some(node=>node===root||node.contains(root!)))changed=true;
    }
    const observer=new MutationObserver(collect);
    observer.observe(document,{subtree:true,childList:true,characterData:true,attributes:true});
    type Expected={target:Node;added?:Node[];removed?:Node[];attribute?:string};
    const sameNodes=(actual:NodeList,expected:Node[]=[])=>actual.length===expected.length&&expected.every((node,index)=>actual[index]===node);
    function ownMutation(expected:Expected[],apply:()=>void) {
      collect(observer.takeRecords());apply();
      // Only these exact records belong to the verifier. Never discard an
      // arbitrary batch: synchronous page callbacks may also change content.
      for(const record of observer.takeRecords()){
        const index=expected.findIndex(item=>item.target===record.target&&(item.attribute?record.type==='attributes'&&record.attributeName===item.attribute:record.type==='childList'&&sameNodes(record.addedNodes,item.added)&&sameNodes(record.removedNodes,item.removed)));
        if(index>=0)expected.splice(index,1);else collect([record]);
      }
      if(expected.length)changed=true;
    }
    return {
      valid(){collect(observer.takeRecords());const current=matches();return !changed&&root.isConnected&&current.length===1&&current[0]===root&&root.outerHTML===originalHTML;},
      wrap(nodes:Text[]){return nodes.map(node=>{
        const span=document.createElement('span'),parent=node.parentNode!;
        ownMutation([{target:parent,added:[span],removed:[node]},{target:span,added:[node]}],()=>{node.replaceWith(span);span.append(node);});return span;
      });},
      hide(spans:HTMLSpanElement[]){for(const span of spans)ownMutation([{target:span,attribute:'style'}],()=>span.style.setProperty('opacity','0','important'));},
      restore(spans:HTMLSpanElement[]){for(const span of spans){const node=span.firstChild!,parent=span.parentNode!;
        ownMutation([{target:span,removed:[node]},{target:parent,added:[node],removed:[span]}],()=>span.replaceWith(node));
      }},
      close(){observer.disconnect();},
    };
  },{html,marker});
}
export type RenderIntegrity=Awaited<ReturnType<typeof beginRenderIntegrity>>;
