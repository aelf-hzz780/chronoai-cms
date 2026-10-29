import {parseDocument} from 'htmlparser2';
import {findAll} from 'domutils';
import {render} from './render.ts';
import {digest} from './content.ts';
import {type CopyPayload} from './targets.ts';
type Node=ReturnType<typeof parseDocument>['children'][number];
const hidden=(node:Node)=>'name' in node && 'attribs' in node && (['template','script','style','noscript'].includes(node.name)||'hidden' in node.attribs||'inert' in node.attribs||node.attribs['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\D|$)/i.test(node.attribs.style??''));
const block=new Set(['article','div','section','p','h1','h2','h3','h4','ul','ol','li','pre','blockquote','br','hr']);
function raw(nodes:Node[]):string{return nodes.map(node=>hidden(node)?'':node.type==='text'?node.data:'children' in node?raw(node.children):'').join('').replace(/\r\n/g,'\n');}
function semantics(nodes:Node[],skipHeading=false):string {
  return nodes.map(node=>{
    if(hidden(node))return '';
    if(node.type==='text')return node.data;
    if('name' in node && 'children' in node){if(skipHeading && node.name==='h1')return '';if(['pre','code'].includes(node.name))return `@${node.name}:${digest(raw(node.children))}@`;const value=semantics(node.children);return block.has(node.name)?`\n${value}\n`:value;}
    return '';
  }).join('').replace(/\s+/g,' ').trim();
}
function visible(node:Node){for(let current:Node|null=node;current;current=current.parent)if(hidden(current))return false;return true;}
export function assistedMarkdown(payload:CopyPayload){return `${payload.markdown}\n\nAuthor: ${payload.creditedAuthor}\n\nOriginal: [${payload.sourceUrl}](${payload.sourceUrl})`;}
export function provesAssistedCopy(page:string,payload:CopyPayload):boolean {
  const allowed=new Set([...payload.markdown.matchAll(/!\[[^\]]*\]\((https?:[^)]+)\)/g)].map(match=>match[1]!));
  const expected=parseDocument(render(assistedMarkdown(payload),allowed)),actual=parseDocument(page);
  // A platform without a reliably identifiable visible article stays unverified.
  const articles=findAll(node=>node.name==='article' && visible(node),actual.children);
  if(articles.length!==1)return false;
  const article=articles[0]!,headings=findAll(node=>node.name==='h1'&&visible(node),[article]);
  if(headings.length!==1 || semantics(headings[0]!.children)!==payload.title)return false;
  if(semantics(article.children,true)!==semantics(expected.children))return false;
  const resources=(nodes:Node[])=>findAll(node=>['img','a','source'].includes(node.name)&&visible(node),nodes).map(node=>({tag:node.name,url:node.attribs[node.name==='a'?'href':'src'],selection:node.attribs.srcset??null,text:node.name==='a'?semantics(node.children):null}));
  return JSON.stringify(resources(article.children))===JSON.stringify(resources(expected.children));
}
