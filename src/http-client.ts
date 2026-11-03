import { AppError, requireValue } from './errors.ts';

export class RemoteError extends AppError {
  uncertain: boolean;
  constructor(code: string, message: string, uncertain = false) { super(502, code, message); this.uncertain = uncertain; }
}
export async function remote(url: string | URL, options: RequestInit = {}, maxBytes = 4_000_000): Promise<{ response: Response; text: string; bytes: Buffer }> {
  const writing = !['GET', 'HEAD'].includes(options.method ?? 'GET');
  let response: Response;
  try { response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(12_000) }); }
  catch { throw new RemoteError('REMOTE_UNCERTAIN', 'Remote request interrupted; reconcile before retrying', writing); }
  const reader = response.body?.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    if (reader) for (;;) {
      const result = await reader.read(); if (result.done) break;
      total += result.value.length;
      if (total > maxBytes) throw new Error('Response too large');
      chunks.push(result.value);
    }
  } catch { throw new RemoteError('REMOTE_UNCERTAIN', 'Remote response unavailable; reconcile before retrying', writing); }
  finally { reader?.releaseLock(); }
  if (!response.ok) throw new RemoteError(response.status === 401 || response.status === 403 ? 'REMOTE_AUTHORIZATION' : response.status === 429 ? 'REMOTE_RATE_LIMIT' : response.status === 404 ? 'REMOTE_NOT_FOUND' : response.status === 410 ? 'REMOTE_GONE' : 'REMOTE_FAILURE', `Remote service returned HTTP ${response.status}`, writing && response.status >= 500);
  const bytes=Buffer.concat(chunks);
  return { response, text: bytes.toString('utf8'), bytes };
}
export async function remoteJson(url: string | URL, options: RequestInit = {}): Promise<any> {
  const { text } = await remote(url, options);
  try { const result = JSON.parse(text); requireValue(result && typeof result === 'object', 502, 'REMOTE_CONTRACT', 'Invalid remote response'); return result; }
  catch { throw new RemoteError('REMOTE_CONTRACT', 'Invalid remote JSON response', !['GET', 'HEAD'].includes(options.method ?? 'GET')); }
}
