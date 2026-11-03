import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';

const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false });
export function render(source: string, publicImages: Set<string> = new Set()): string {
  return sanitizeHtml(markdown.render(source.replace(/^\uFEFF/, '').replace(/asset:([a-f0-9-]{36})/g, '/api/cms/assets/$1')), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img'],
    allowedAttributes: { a: ['href', 'title', 'rel'], img: ['src', 'alt', 'title'], code: ['class'] },
    allowedSchemes: ['https', 'http'],
    allowedSchemesByTag: { img: ['https', 'http'] },
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
      img: (_tag, attributes) => /^\/api\/cms\/assets\/[a-f0-9-]{36}$/.test(attributes.src ?? '') || publicImages.has(attributes.src)
        ? { tagName: 'img', attribs: attributes } : { tagName: 'span', attribs: { title: 'Remote image omitted; import as a private asset' } },
    },
  });
}
