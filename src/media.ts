import { randomUUID } from 'node:crypto';
import { ContentService, digest } from './content.ts';
import type { Actor } from './policy.ts';
import { requireValue, text } from './errors.ts';

export class MediaService {
  content: ContentService;
  constructor(content: ContentService) { this.content = content; }
  async upload(actor: Actor, articleId: string, mime: string, base64: string, trace: string) {
    const article = this.content.article(articleId);
    await this.content.policy.owner(actor, article.owner_id, 'content:write');
    requireValue(article.creator === actor.subject, 403, 'FORBIDDEN', 'Only the draft creator may add images');
    text(base64, 'base64', 7_000_000); const data = Buffer.from(base64, 'base64');
    requireValue(data.length <= 5_000_000 && data.toString('base64') === base64, 400, 'INVALID_IMAGE', 'Invalid image encoding or size');
    const png = data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
    const jpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    const gif = ['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString());
    const webp = data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP';
    requireValue((mime === 'image/png' && png) || (mime === 'image/jpeg' && jpeg) || (mime === 'image/gif' && gif) || (mime === 'image/webp' && webp), 400, 'INVALID_IMAGE', 'Only PNG, JPEG, GIF and WebP images with matching signatures are accepted');
    const id = randomUUID();
    this.content.store.transaction(() => {
      this.content.store.run('INSERT INTO assets VALUES (?,?,?,?,?,?,?)', id, article.owner_id, articleId, data, mime, digest(data), new Date().toISOString());
      this.content.store.audit(actor.subject, article.owner_id, 'asset.upload', id, trace, { articleId });
    });
    return { id, markdown: `![image](asset:${id})` };
  }
  async get(actor: Actor, id: string) {
    const asset = this.content.store.get('SELECT * FROM assets WHERE id=?', id);
    requireValue(asset, 404, 'NOT_FOUND', 'Image not found');
    const article = this.content.article(asset.article_id);
    const revision = await this.content.visibleRevision(actor, article);
    requireValue(article.creator === actor.subject || Buffer.from(revision.markdown).toString('utf8').includes(`asset:${id}`), 403, 'FORBIDDEN', 'Image is not part of an authorized revision');
    return { data: Buffer.from(asset.content), mime: asset.mime };
  }
}
