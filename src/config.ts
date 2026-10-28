import { resolve } from 'node:path';
import { requireValue } from './errors.ts';

export interface Config {
  database: string; host: string; port: number; publicUrl: string; issuer: string;
  clientId: string; clientSecret?: string; serviceAudience: string; cmsAudience: string;
  introspectionUrl: string; authorityUrl: string; authorityToken: string;
  encryptionKey: string; publicMediaDirectory: string; trackingSecret: string;
  allowLoopback: boolean; analyticsEnabled: boolean; requireConsent: boolean;
}
export function safeUrl(value: string, allowLoopback = false): URL {
  const url = new URL(value);
  requireValue(url.protocol === 'https:' || (allowLoopback && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)), 500, 'CONFIGURATION', 'HTTPS URL required');
  requireValue(!url.username && !url.password && !url.hash, 500, 'CONFIGURATION', 'Invalid service URL');
  return url;
}
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  function required(name: string) { const value = env[name]; requireValue(value, 500, 'CONFIGURATION', `Missing ${name}`); return value; }
  const allowLoopback = env.ALLOW_LOOPBACK_HTTP === 'true';
  const publicUrl = safeUrl(required('PUBLIC_URL'), allowLoopback).origin;
  const issuer = safeUrl(required('NYXID_ISSUER'), allowLoopback).href.replace(/\/$/, '');
  const authorityUrl = safeUrl(required('NYXID_AUTHORITY_URL'), allowLoopback).href.replace(/\/$/, '');
  const introspectionUrl = safeUrl(required('NYXID_INTROSPECTION_URL'), allowLoopback).href;
  const encryptionKey = required('ENCRYPTION_KEY');
  requireValue(/^[a-f0-9]{64}$/.test(encryptionKey), 500, 'CONFIGURATION', 'ENCRYPTION_KEY must be 32 random bytes in hex');
  const port = Number(env.PORT ?? '3100');
  requireValue(Number.isInteger(port) && port > 1023 && port < 65536, 500, 'CONFIGURATION', 'Invalid PORT');
  return { database: resolve(env.DATABASE_PATH ?? '.runtime/platform.sqlite'), host: env.HOST ?? '127.0.0.1', port, publicUrl, issuer,
    clientId: required('NYXID_CLIENT_ID'), clientSecret: env.NYXID_CLIENT_SECRET, serviceAudience: required('NYXID_SERVICE_AUDIENCE'), cmsAudience: required('NYXID_CMS_AUDIENCE'),
    introspectionUrl, authorityUrl, authorityToken: required('NYXID_AUTHORITY_TOKEN'), encryptionKey,
    publicMediaDirectory: resolve(env.PUBLIC_MEDIA_DIRECTORY ?? '.runtime/public-media'), trackingSecret: required('TRACKING_SECRET'),
    allowLoopback, analyticsEnabled: env.ANALYTICS_ENABLED === 'true', requireConsent: env.ANALYTICS_REQUIRE_CONSENT !== 'false' };
}
