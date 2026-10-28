import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppError } from './errors.ts';
export class Vault {
  key: Buffer;
  constructor(hex: string) { this.key = Buffer.from(hex, 'hex'); if (this.key.length !== 32) throw new Error('Invalid encryption key'); }
  seal(value: unknown): string {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), ciphertext].map(x => x.toString('base64url')).join('.');
  }
  open<T>(value: string): T {
    try {
      const [iv, tag, ciphertext] = value.split('.').map(x => Buffer.from(x, 'base64url'));
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv); decipher.setAuthTag(tag);
      return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'));
    } catch { throw new AppError(500, 'CREDENTIAL_UNAVAILABLE', 'Stored authorization cannot be decrypted'); }
  }
}
