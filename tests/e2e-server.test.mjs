// End-to-end check of server/index.js with a FAKE Supabase (no network, no real keys). Run: node --test tests/e2e-server.test.mjs
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

const PORT = 4300 + Math.floor(Math.random() * 500);
Object.assign(process.env, { PORT: String(PORT), SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', BAKONG_API_TOKEN: 'tok', BAKONG_ACCOUNT_ID: 'shop@bkrt', PUBLIC_URL: 'http://localhost' });

const ORDER_ID = '123e4567-e89b-12d3-a456-426614174000';
const state = { integrityMode: 'report', integrityOk: false, events: [], blocks: [] };
const realFetch = globalThis.fetch;
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (!u.startsWith('https://sb.test')) return realFetch(url, init);
  const auth = (init.headers?.Authorization || init.headers?.authorization || '');
  if (u.includes('/auth/v1/user')) {
    if (auth.includes('admin-token')) return json({ id: 'admin-1', email: 'admin@x.y' });
    if (auth.includes('user-token')) return json({ id: 'user-1', email: 'u@x.y' });
    return json({}, 401);
  }
  if (u.includes('/rest/v1/profiles')) return json([{ role: u.includes('admin-1') ? 'admin' : 'customer' }]);
  if (u.includes('/rest/v1/security_settings')) return json(init.method === 'POST' ? null : [{ value: state.integrityMode }]);
  if (u.includes('/rest/v1/security_events')) { if (init.method === 'POST') { state.events.push(...JSON.parse(init.body)); return json(null, 201); } return json([]); }
  if (u.includes('/rest/v1/security_blocks')) { if (init.method === 'POST') state.blocks.push(JSON.parse(init.body)); return init.method === 'GET' || !init.method ? json([]) : json(null, 201); }
  if (u.includes('/rest/v1/security_allowlist')) return json([]);
  if (u.includes('/rpc/yn_check_order_integrity')) return json(state.integrityOk ? { ok: true } : { ok: false, reason: 'price_tampered', total: 0.01, expected: 50 });
  if (u.includes('/rest/v1/orders?id=eq.')) return json([{ id: ORDER_ID, order_number: 'YN-1', user_id: 'user-1', total: 0.01, payment_status: 'pending', status: 'payment pending', bakong_md5s: [] }]);
  if (u.includes('/rest/v1/notifications')) return json(null, 201);
  return json([]);
};

const base = `http://127.0.0.1:${PORT}`;
const call = (path, { ip = '203.0.113.200', token, method = 'GET', body, headers = {} } = {}) =>
  realFetch(base + path, { method, headers: { 'x-forwarded-for': ip, ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });

before(async () => { await import('../server/index.js'); await new Promise(r => setTimeout(r, 300)); });
after(() => setTimeout(() => process.exit(0), 100));

test('health check works and leaks no framework header', async () => {
  const r = await call('/api/health'); assert.equal(r.status, 200); assert.deepEqual(await r.json(), { ok: true });
  assert.equal(r.headers.get('x-powered-by'), null);
});
test('pages get security headers; CSP is report-only by default', async () => {
  const r = await call('/orders');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff'); assert.ok(r.headers.get('content-security-policy-report-only'));
  assert.match(r.headers.get('permissions-policy'), /camera=\(self\)/);
});
test('scanner trips honeypot -> blocked everywhere, other visitors unaffected', async () => {
  assert.equal((await call('/wp-login.php', { ip: '198.51.100.11' })).status, 404);
  assert.equal((await call('/api/aba/config', { ip: '198.51.100.11' })).status, 403);
  assert.equal((await call('/api/aba/config', { ip: '198.51.100.12' })).status, 200);
});
test('SQL-injection style request is refused', async () => {
  assert.equal((await call("/api/aba/config?x=1' OR '1'='1", { ip: '198.51.100.13' })).status, 403);
});
test('hammering a public endpoint gets 429 then a temporary block', async () => {
  let saw429 = false;
  for (let i = 0; i < 80; i++) { const r = await call('/api/aba/config', { ip: '198.51.100.14' }); if (r.status === 429) saw429 = true; }
  assert.ok(saw429);
});
test('malformed JSON gives a clean 400 (no stack trace)', async () => {
  const r = await call('/api/bakong/status', { method: 'POST', body: '{not json', ip: '198.51.100.15', token: 'user-token' });
  assert.equal(r.status, 400); const t = await r.text(); assert.ok(!/at .*\.js/.test(t)); assert.match(t, /Bad request/);
});
test('payment endpoints require login', async () => {
  assert.equal((await call('/api/bakong/create', { method: 'POST', body: { order_id: ORDER_ID }, ip: '198.51.100.16' })).status, 401);
  assert.equal((await call('/api/bakong/create', { method: 'POST', body: { order_id: 'nope' }, ip: '198.51.100.16', token: 'user-token' })).status, 400);
});
test('price tampering: report mode lets it through but logs it; enforce mode refuses (409)', async () => {
  state.integrityMode = 'report'; state.integrityOk = false;
  let r = await call('/api/bakong/create', { method: 'POST', body: { order_id: ORDER_ID }, ip: '198.51.100.17', token: 'user-token' });
  assert.notEqual(r.status, 409);
  await new Promise(x => setTimeout(x, 200));
  state.integrityMode = 'enforce'; await new Promise(x => setTimeout(x, 31000)); // settings cache is 30s
  r = await call('/api/bakong/create', { method: 'POST', body: { order_id: ORDER_ID }, ip: '198.51.100.18', token: 'user-token' });
  assert.equal(r.status, 409); assert.match((await r.json()).error, /verify this order/);
  state.integrityOk = true;
  r = await call('/api/bakong/create', { method: 'POST', body: { order_id: ORDER_ID }, ip: '198.51.100.19', token: 'user-token' });
  assert.notEqual(r.status, 409, 'a consistent order is never refused');
});
test('admin security API: anonymous 401, customer 403, admin 200', async () => {
  assert.equal((await call('/api/admin/security/summary', { ip: '198.51.100.21' })).status, 401);
  assert.equal((await call('/api/admin/security/summary', { ip: '198.51.100.22', token: 'user-token' })).status, 403);
  const r = await call('/api/admin/security/summary', { ip: '198.51.100.23', token: 'admin-token' });
  assert.equal(r.status, 200); const j = await r.json(); assert.ok(j.totals && j.timeline.length === 24);
  assert.equal((await call('/api/admin/security/block', { method: 'POST', body: { ip: '203.0.113.250', minutes: 5 }, ip: '198.51.100.23', token: 'admin-token' })).status, 200);
  assert.equal((await call('/api/aba/config', { ip: '203.0.113.250' })).status, 403, 'admin-blocked IP is refused');
});
test('CSP report endpoint accepts browser reports', async () => {
  const r = await call('/api/security/csp-report', { method: 'POST', ip: '198.51.100.24', headers: { 'content-type': 'application/csp-report' }, body: { 'csp-report': { 'effective-directive': 'script-src', 'blocked-uri': 'https://evil.example', 'document-uri': 'https://shop/' } } });
  assert.equal(r.status, 204);
});
test('events reached the (fake) database', async () => {
  await new Promise(x => setTimeout(x, 11000));
  const types = new Set(state.events.map(e => e.type));
  for (const t of ['honeypot', 'ip_blocked', 'waf_sqli', 'order_integrity']) assert.ok(types.has(t), 'missing event type ' + t + ' (have ' + [...types] + ')');
});
