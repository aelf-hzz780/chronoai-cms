import { resolve } from 'node:path';
import { requireValue } from './errors.ts';

export interface Config {
  database: string; host: string; port: number; publicUrl: string; issuer: string;
  clientId: string; clientSecret?: string; serviceAudience: string; cmsAudience: string;
  introspectionUrl: string; authorityUrl: string; discoveryUrl?: string; nyxAudience?: string; serviceId?: string; serviceSlug?: string;
  oauthScopes?: string; operationScopes?: Record<string,string[]>; connectionsFile?: string;
  encryptionKey: string; publicMediaDirectory: string; trackingSecret: string;
  allowLoopback: boolean; analyticsEnabled: boolean; requireConsent: boolean;
  trustedProxyCidrs?: string[];
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
  const issuer = required('NYXID_ISSUER');
  requireValue(issuer.length <= 500 && !/[\s\x00-\x1f]/.test(issuer),500,'CONFIGURATION','Invalid issuer identifier');
  const authorityUrl = safeUrl(required('NYXID_API_URL'), allowLoopback).href.replace(/\/$/, '');
  const discoveryUrl = safeUrl(env.NYXID_DISCOVERY_URL ?? `${authorityUrl}/.well-known/openid-configuration`,allowLoopback).href;
  let operationScopes: Record<string,string[]> | undefined;
  if (env.NYXID_OPERATION_SCOPES_JSON) {
    try { operationScopes = JSON.parse(env.NYXID_OPERATION_SCOPES_JSON); } catch { throw new Error('Invalid NYXID_OPERATION_SCOPES_JSON'); }
    requireValue(operationScopes && Object.values(operationScopes).every(v => Array.isArray(v) && v.length > 0 && v.every(s => typeof s === 'string' && s.length > 0)),500,'CONFIGURATION','Operation scope mappings must contain explicit nonempty scope arrays');
  }
  const introspectionUrl = safeUrl(required('NYXID_INTROSPECTION_URL'), allowLoopback).href;
  const encryptionKey = required('ENCRYPTION_KEY');
  requireValue(/^[a-f0-9]{64}$/.test(encryptionKey), 500, 'CONFIGURATION', 'ENCRYPTION_KEY must be 32 random bytes in hex');
  const port = Number(env.PORT ?? '3100');
  requireValue(Number.isInteger(port) && port > 1023 && port < 65536, 500, 'CONFIGURATION', 'Invalid PORT');
  return { database: resolve(env.DATABASE_PATH ?? '.runtime/platform.sqlite'), host: env.HOST ?? '127.0.0.1', port, publicUrl, issuer,
    clientId: required('NYXID_CLIENT_ID'), clientSecret: env.NYXID_CLIENT_SECRET, serviceAudience: required('NYXID_SERVICE_AUDIENCE'), cmsAudience: required('NYXID_CMS_AUDIENCE'),
    introspectionUrl, authorityUrl, discoveryUrl, nyxAudience: env.NYXID_TOKEN_AUDIENCE, serviceId: env.NYXID_SERVICE_ID, serviceSlug: env.NYXID_SERVICE_SLUG,
    oauthScopes: env.NYXID_OAUTH_SCOPES, operationScopes, connectionsFile: env.NYXID_CONNECTIONS_FILE, encryptionKey,
    publicMediaDirectory: resolve(env.PUBLIC_MEDIA_DIRECTORY ?? '.runtime/public-media'), trackingSecret: required('TRACKING_SECRET'),
    trustedProxyCidrs: env.TRUST_PROXY_CIDRS?.split(',').map(value=>value.trim()).filter(Boolean),
    allowLoopback, analyticsEnabled: env.ANALYTICS_ENABLED === 'true', requireConsent: env.ANALYTICS_REQUIRE_CONSENT !== 'false' };
}
