import { parseDocument } from 'htmlparser2';
import { findAll } from 'domutils';

type HtmlNode = ReturnType<typeof parseDocument>['children'][number];
function canonical(nodes: HtmlNode[], preserveWhitespace = false): unknown[] {
  return nodes.flatMap(node => {
    if (node.type === 'text') {
      const value = preserveWhitespace ? node.data.replace(/\r\n/g,'\n') : node.data.replace(/\s+/g,' ');
      return !preserveWhitespace && !value.trim() ? [] : [['text',value]];
    }
    if (node.type === 'comment' || node.type === 'directive') return [];
    if ('name' in node && 'attribs' in node) {
      // Ignore only documented non-content image optimizations; arbitrary injected
      // styles/handlers/elements still change the proof and invalidate the readback.
      const attributes = Object.fromEntries(Object.entries(node.attribs).filter(([key]) => !(node.name === 'img' && ['loading','decoding','srcset','sizes','width','height'].includes(key))).sort(([a],[b]) => a.localeCompare(b)));
      return [[node.name,attributes,canonical(node.children,preserveWhitespace || ['pre','code'].includes(node.name))]];
    }
    return 'children' in node ? canonical(node.children,preserveWhitespace) : [];
  });
}
export function provesBody(expectedHtml: string, adminHtml: string, publicHtml: string, marker: string) {
  const expected = parseDocument(expectedHtml), admin = parseDocument(adminHtml), page = parseDocument(publicHtml);
  const expectedProof = JSON.stringify(canonical(expected.children));
  if (JSON.stringify(canonical(admin.children)) !== expectedProof) return false;
  const wrappers = findAll(element => element.attribs['data-chrono-revision'] === marker, page.children);
  return wrappers.length === 1 && JSON.stringify(canonical(wrappers)) === expectedProof;
}
