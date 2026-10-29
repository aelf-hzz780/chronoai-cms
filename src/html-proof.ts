import { parseDocument } from 'htmlparser2';
import { findAll } from 'domutils';

type HtmlNode = ReturnType<typeof parseDocument>['children'][number];
const blocks=new Set(['div','p','section','article','main','ul','ol','li','table','thead','tbody','tr','td','th','blockquote','pre','h1','h2','h3','h4','h5','h6','hr']);
function canonical(nodes: HtmlNode[], preserveWhitespace = false, hrefAliases = new Map<string,string>()): unknown[] {
  return nodes.flatMap((node,index) => {
    if (node.type === 'text') {
      const value = preserveWhitespace ? node.data.replace(/\r\n/g,'\n') : node.data.replace(/\s+/g,' ');
      if (!preserveWhitespace && !value.trim()) {
        const before=nodes[index-1],after=nodes[index+1];
        const inline=(n:HtmlNode|undefined)=>n && (n.type==='text' && !!n.data.trim() || 'name' in n && !blocks.has(n.name));
        if(!inline(before)||!inline(after))return [];
      }
      return [['text',value]];
    }
    if (node.type === 'comment' || node.type === 'directive') return [];
    if ('name' in node && 'attribs' in node) {
      // Ignore only documented non-content image optimizations; arbitrary injected
      // styles/handlers/elements still change the proof and invalidate the readback.
      const attributes = Object.fromEntries(Object.entries(node.attribs).filter(([key]) => !(node.name === 'img' && ['loading','decoding','width','height'].includes(key))).map(([key,value]) => [key,node.name === 'a' && key === 'href' ? hrefAliases.get(value) ?? value : value]).sort(([a],[b]) => a!.localeCompare(b!)));
      return [[node.name,attributes,canonical(node.children,preserveWhitespace || ['pre','code'].includes(node.name),hrefAliases)]];
    }
    return 'children' in node ? canonical(node.children,preserveWhitespace,hrefAliases) : [];
  });
}
export function provesBody(expectedHtml: string, adminHtml: string, publicHtml: string, marker: string, siteUrl?: string) {
  const expected = parseDocument(expectedHtml), admin = parseDocument(adminHtml), page = parseDocument(publicHtml);
  const expectedProof = JSON.stringify(canonical(expected.children));
  if (JSON.stringify(canonical(admin.children)) !== expectedProof) return false;
  // Ghost 6's official OutboundLinkTagger appends exactly this ref parameter.
  // Accept it only for an original external link without existing attribution;
  // never strip arbitrary parameters, alter destinations, or relax Admin proof.
  const aliases = new Map<string,string>();
  if (siteUrl) {
    const site = new URL(siteUrl);
    for (const anchor of findAll(element => element.name === 'a' && !!element.attribs.href,expected.children)) {
      const href = anchor.attribs.href!;
      try {
        const url = new URL(href);
        if (!['https:','http:'].includes(url.protocol) || url.origin === site.origin || ['ref','source','utm_source'].some(key => url.searchParams.has(key))) continue;
        const tagged = url.href.replace(/#.*$/, '') + (url.search ? '&' : '?') + 'ref=' + encodeURIComponent(site.hostname.replace(/^www\./,'')) + url.hash;
        aliases.set(tagged,href);
      } catch { /* Relative links remain exact. */ }
    }
  }
  const wrappers = findAll(element => element.attribs['data-chrono-revision'] === marker, page.children);
  const hidden=(node:HtmlNode):boolean=>{
    if('name' in node && 'attribs' in node){const a=node.attribs;
      if(['template','noscript','script','style'].includes(node.name)||'hidden' in a||'inert' in a||a['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*(hidden|collapse)|opacity\s*:\s*0(?:\D|$)|content-visibility\s*:\s*hidden/i.test(a.style??''))return true;
    }return false;
  };
  if(wrappers.length!==1)return false;
  for(let ancestor:HtmlNode|null=wrappers[0]!;ancestor;ancestor=ancestor.parent)if(hidden(ancestor))return false;
  if(findAll(element=>hidden(element)||element.name==='source'||element.name==='picture',wrappers).length)return false;
  return wrappers.length === 1 && JSON.stringify(canonical(wrappers,false,aliases)) === expectedProof;
}
