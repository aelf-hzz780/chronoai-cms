import {parseDocument} from 'htmlparser2';
import {AppError} from './errors.ts';
export const renderBudget={textNodes:1024,codePoints:50000};
// Draft storage remains lossless up to its own limit. Publication has a separate,
// explicit synchronous preflight before any remote mutation.
export function assertRenderBudget(html:string) {
  const stack=[...parseDocument(html).children];let nodes=0,characters=0;
  while(stack.length){const node=stack.pop()!;
    if(node.type==='text'&&node.data.trim()){nodes++;characters+=[...node.data].length;}
    else if('children' in node)for(const child of node.children)stack.push(child);
    if(nodes>renderBudget.textNodes||characters>renderBudget.codePoints)throw new AppError(409,'PUBLICATION_RENDER_LIMIT','Publication supports at most 1024 text nodes and 50000 Unicode code points; shorten or split the article before sending. The private draft is preserved.');
  }
}
