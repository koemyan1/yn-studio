import { supabase } from '../supabase';
import { getPasskey } from './webauthn';

const API_BASE: string = (((import.meta as any).env?.VITE_API_BASE_URL as string | undefined) || '').replace(/\/$/, '');

export class ApiError extends Error {
  status: number; code?: string; extra: any;
  constructor(message: string, status: number, code?: string, extra?: any) { super(message); this.status = status; this.code = code; this.extra = extra; }
}

/** Calls the YN CORE API with the admin's Supabase token. `session` is the one-time emergency session (kept in memory by callers). */
export async function coreApi(path: string, opts: { method?: string; body?: any; session?: string } = {}): Promise<any> {
  const { data } = await supabase.auth.getSession();
  const headers: Record<string, string> = { Authorization: 'Bearer ' + (data.session?.access_token || '') };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.session) headers['X-YN-Emergency'] = opts.session;
  const r = await fetch(API_BASE + path, { method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'), headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, cache: 'no-store' });
  let j: any = null; try { j = await r.json(); } catch { j = null; }
  if (!r.ok) throw new ApiError(j?.error || 'Request failed (' + r.status + ').', r.status, j?.code, j);
  return j;
}

/** Fresh passkey check (Face ID / Touch ID / PIN) -> a single-use session for ONE purpose (and one coin). Keep it in memory only. */
export async function stepUp(purpose: 'init' | 'coin_security' | 'security', slot?: number): Promise<{ sessionToken: string; expiresAt: string }> {
  const o = await coreApi('/api/emergency/auth/options', { body: { purpose, slot } });
  const credential = await getPasskey(o.publicKey);
  return coreApi('/api/emergency/auth/verify', { body: { challengeId: o.challengeId, credential } });
}

export const pad = (n: number) => String(n).padStart(2, '0');
export const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '—');
