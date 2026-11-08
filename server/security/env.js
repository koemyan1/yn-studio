// Environment audit. Reports WHICH settings are present / missing / malformed - never their values.
// Used at startup (one log block) and by the admin-only endpoint GET /api/admin/env-check.

// Server-only secrets: must never appear in a VITE_ variable (Vite copies VITE_* into the public JavaScript bundle).
export const SECRET_NAMES = ['SUPABASE_SERVICE_ROLE_KEY', 'ABA_PAYWAY_API_KEY', 'BAKONG_API_TOKEN', 'GEMINI_API_KEY'];

const SPEC = [
  // [name, required for, check]
  ['SUPABASE_URL', 'database access', v => /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(v)],
  ['SUPABASE_ANON_KEY', 'sign-in check', v => v.split('.').length === 3],
  ['SUPABASE_SERVICE_ROLE_KEY', 'payments, admin audit log', v => v.split('.').length === 3],
  ['PUBLIC_URL', 'safe payment return links', v => /^https:\/\/[^/\s]+$/i.test(v)],
  ['BAKONG_API_TOKEN', 'Bakong KHQR (optional)', v => v.length > 20, true],
  ['ABA_PAYWAY_MERCHANT_ID', 'ABA PayWay (optional)', v => v.length > 0, true],
  ['ABA_PAYWAY_API_KEY', 'ABA PayWay (optional)', v => v.length > 8, true],
  ['GEMINI_API_KEY', 'CV AI helper (optional)', v => v.length > 10, true],
  ['YN_CORE_PEPPER_CURRENT', 'YN CORE token keys (optional)', v => /^[A-Za-z0-9]{1,8}$/.test(v), true],
];

export function auditEnv(env = process.env) {
  const items = SPEC.map(([name, purpose, ok, optional]) => {
    const raw = String(env[name] ?? '').trim();
    const status = !raw ? (optional ? 'unset (optional)' : 'MISSING') : ok(raw) ? 'ok' : 'MALFORMED';
    return { name, purpose, status };
  });
  const problems = [];
  // 1) a secret exposed through a VITE_ variable would be shipped to every visitor's browser
  for (const key of Object.keys(env)) {
    if (!key.startsWith('VITE_')) continue;
    if (SECRET_NAMES.some(n => key.includes(n.replace(/^SUPABASE_/, '')) && /SERVICE_ROLE|API_KEY|TOKEN/.test(key))) problems.push(`${key} looks like a server secret - VITE_ variables are public. Rename it (no VITE_ prefix).`);
    const v = String(env[key] || '');
    if (v.split('.').length === 3) { try { const role = JSON.parse(Buffer.from(v.split('.')[1], 'base64url').toString()).role; if (role === 'service_role') problems.push(`${key} contains a service_role key - remove it and rotate that key in Supabase now.`); } catch { /* not a JWT */ } }
  }
  // 2) the anon key must really be the anon key
  const anon = String(env.SUPABASE_ANON_KEY || '');
  if (anon.split('.').length === 3) { try { if (JSON.parse(Buffer.from(anon.split('.')[1], 'base64url').toString()).role === 'service_role') problems.push('SUPABASE_ANON_KEY holds the service_role key. Put the anon (public) key there.'); } catch { /* ignore */ } }
  for (const i of items) if (i.status === 'MISSING' || i.status === 'MALFORMED') problems.push(`${i.name} is ${i.status.toLowerCase()} (${i.purpose}).`);
  if (!/^(off|0|false|no)$/i.test(String(env.YN_CORE || '').trim()) && (env.YN_CORE_PEPPER_CURRENT || env.YN_CORE)) {
    const cur = String(env.YN_CORE_PEPPER_CURRENT || '').toUpperCase();
    if (!cur || String(env['YN_CORE_PEPPER_' + cur] || '').length < 32) problems.push('YN_CORE=on but YN_CORE_PEPPER_CURRENT / YN_CORE_PEPPER_<id> is missing or shorter than 32 characters - YN CORE refuses to run.');
    if (!/^https:\/\/[^/\s]+$/i.test(String(env.PUBLIC_URL || ''))) problems.push('YN_CORE=on needs PUBLIC_URL set to your https address (passkeys are bound to it).');
  }
  if (env.SECURITY_SHIELD && /^off$/i.test(env.SECURITY_SHIELD)) problems.push('SECURITY_SHIELD=off - the shield is disabled.');
  if (/^(off)$/i.test(env.CSP_MODE || '')) problems.push('CSP_MODE=off - no Content-Security-Policy.');
  return { items, problems, ok: problems.length === 0 };
}

export function logEnvAudit(log = console, env = process.env) {
  const r = auditEnv(env);
  const line = r.items.map(i => `${i.name}=${i.status}`).join('  ');
  log.log(`[env] ${line}`);
  for (const p of r.problems) log.warn(`[env] WARNING: ${p}`);
  return r;
}
