#!/usr/bin/env node
// Safe, bounded self-test for YOUR OWN deployment. It sends fewer than ~150 requests in total (this is NOT a load/DDoS tool).
//   node tools/security-smoke.mjs                                   -> tests http://localhost:3000 (pretends to be a test IP, so you are not blocked)
//   node tools/security-smoke.mjs --url https://ynstudio.site --yes -> read-only checks against production (nothing that blocks your IP)
//   add --aggressive to also fire honeypot/injection/rate-limit probes at a remote site. That WILL get your own IP blocked for
//   ~15 minutes unless you first add it under /admin/security -> "Never block" (or ALLOW_IPS on Render).
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const url = (opt('--url', 'http://localhost:3000')).replace(/\/$/, '');
const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url);
const aggressive = local || args.includes('--aggressive');
if (!local && !args.includes('--yes')) { console.error('Refusing to test a remote site without --yes (only test sites you own).'); process.exit(2); }
const testIp = `198.18.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;   // benchmarking range, never a real visitor
const hdrs = (extra = {}) => ({ ...(local ? { 'x-forwarded-for': testIp } : {}), ...extra });
const get = (p, h = {}) => fetch(url + p, { headers: hdrs(h), redirect: 'manual' });
let pass = 0, fail = 0;
const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -> ' + info : ''}`); };

console.log(`Target: ${url}${local ? `  (local mode, simulated visitor ${testIp})` : ''}\n`);
let r = await get('/');
check('Homepage loads', r.status < 400, 'HTTP ' + r.status);
check('X-Content-Type-Options: nosniff', r.headers.get('x-content-type-options') === 'nosniff');
check('Clickjacking protection (X-Frame-Options)', !!r.headers.get('x-frame-options'));
check('Content-Security-Policy present (report-only or enforced)', !!(r.headers.get('content-security-policy') || r.headers.get('content-security-policy-report-only')));
check('Referrer-Policy set', !!r.headers.get('referrer-policy'));
check('No X-Powered-By leak', !r.headers.get('x-powered-by'));
if (url.startsWith('https')) check('HSTS present', !!r.headers.get('strict-transport-security'));
r = await get('/api/admin/security/summary'); check('Admin security API refuses anonymous callers', r.status === 401 || r.status === 403, 'HTTP ' + r.status);
r = await get('/api/health'); check('Health endpoint still answers (uptime monitors keep working)', r.status === 200);
r = await get('/api/bakong/health'); const t = await r.text(); check('Bakong diagnostics page does not print your API token', !/eyJ|Bearer|"token"\s*:\s*"/.test(t));
r = await fetch(url + '/api/bakong/create', { method: 'POST', headers: hdrs({ 'content-type': 'application/json' }), body: '{"order_id":"123e4567-e89b-12d3-a456-426614174000"}' });
check('Payment endpoints require login', r.status === 401 || r.status === 503, 'HTTP ' + r.status);
r = await fetch(url + '/api/bakong/status', { method: 'POST', headers: hdrs({ 'content-type': 'application/json' }), body: '{broken' }); const bt = await r.text();
check('Malformed input returns a clean error (no stack trace)', !/\bat .*\.js:\d+/.test(bt) && r.status < 500, 'HTTP ' + r.status);

if (aggressive) {
  console.log('\n-- active probes (these are what should get an attacker blocked) --');
  const ipE = `198.18.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  r = await fetch(url + '/.env', { headers: local ? { 'x-forwarded-for': ipE } : {} }); const et = await r.text();
  check('/.env never exposes secrets', !/SUPABASE|SERVICE_ROLE|API_KEY|TOKEN=/i.test(et));
  r = await get('/wp-login.php'); check('Trap page /wp-login.php answers 404 and flags the visitor', r.status === 404, 'HTTP ' + r.status);
  r = await get('/'); check('...and the flagged visitor is now refused', r.status === 403, 'HTTP ' + r.status);
  const ip2 = `198.18.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  const g2 = (p, h = {}) => fetch(url + p, { headers: { ...(local ? { 'x-forwarded-for': ip2 } : {}), ...h } });
  r = await g2("/api/aba/config?x=1' OR '1'='1"); check('SQL-injection pattern is refused', r.status === 403, 'HTTP ' + r.status);
  r = await g2('/api/aba/config', { 'user-agent': 'sqlmap/1.7' }); check('Hacking-tool user agent is refused', r.status === 403, 'HTTP ' + r.status);
  const ip3 = `198.18.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`; let limited = 0;
  for (let i = 0; i < 90; i++) { const x = await fetch(url + '/api/aba/config', { headers: local ? { 'x-forwarded-for': ip3 } : {} }); if (x.status === 429) limited++; }
  check('Rapid repeated calls are rate-limited (HTTP 429)', limited > 0, `${limited} of 90 refused`);
  r = await fetch(url + '/', { headers: local ? { 'x-forwarded-for': `198.18.${Math.floor(Math.random() * 250)}.9` } : {} }); check('A different, innocent visitor is NOT affected', r.status === 200, 'HTTP ' + r.status);
} else console.log('\n(skipped active probes; add --aggressive to include them - read the note at the top first)');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
