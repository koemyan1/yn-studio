import test from 'node:test';
import assert from 'node:assert/strict';
import { scanDir, scanText } from '../tools/scan-secrets.mjs';
import { auditEnv } from '../server/security/env.js';
import { createAdminApi } from '../server/security/adminApi.js';

const jwt = role => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.c2lnbmF0dXJlLXNpZw';

test('the project contains no real secrets or .env files', () => {
  assert.deepEqual(scanDir().map(h => `${h.file}:${h.line} ${h.name}`), []);
});
test('scanner flags a service_role key but not the public anon key', () => {
  assert.equal(scanText(`const k = "${jwt('service_role')}"`).length, 1);
  assert.equal(scanText(`const k = "${jwt('anon')}"`).length, 0);
});
test('env audit reports status only, never values, and catches a service_role key in a VITE_ variable', () => {
  const r = auditEnv({ SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_ANON_KEY: jwt('anon'), SUPABASE_SERVICE_ROLE_KEY: jwt('service_role'), PUBLIC_URL: 'https://ynstudio.site', VITE_SUPABASE_ANON_KEY: jwt('service_role') });
  assert.ok(r.problems.some(p => /VITE_SUPABASE_ANON_KEY.*service_role/.test(p)));
  assert.ok(!JSON.stringify(r).includes('c2lnbmF0dXJl'));
});
test('env audit flags a service_role key placed in SUPABASE_ANON_KEY', () => {
  const r = auditEnv({ SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_ANON_KEY: jwt('service_role'), SUPABASE_SERVICE_ROLE_KEY: jwt('service_role'), PUBLIC_URL: 'https://x.site' });
  assert.ok(r.problems.some(p => /SUPABASE_ANON_KEY holds the service_role/.test(p)));
});
test('admin API: isAdmin is false without a token, for customers, and true only for role=admin', async () => {
  const mk = role => createAdminApi({ shield: { strike() {} }, store: {}, sb: async () => [{ role }], userFromToken: async () => ({ id: 'u1' }), log: { warn() {}, error() {} } });
  assert.equal(await mk('admin').isAdmin({ headers: {} }), false);
  assert.equal(await mk('customer').isAdmin({ headers: { authorization: 'Bearer x' } }), false);
  assert.equal(await mk('admin').isAdmin({ headers: { authorization: 'Bearer x' } }), true);
});
