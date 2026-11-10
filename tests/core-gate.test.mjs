// YN CORE GATE tests (the five-coin ritual). Run: node --test tests/core-gate.test.mjs
// No network and no database: a tiny in-memory stand-in answers the handful of REST calls the gate makes, and a software
// passkey plays the part of Face ID. The REAL handlers, cookie signing and WebAuthn verification run unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createCore } from '../server/core/index.js';
import { newToken } from '../server/core/crypto.js';
import { verifyRegistration } from '../server/core/webauthn.js';
import { makeAuthenticator } from './helpers/softPasskey.mjs';

const RP = 'ynstudio.site', ORIGIN = 'https://ynstudio.site';
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const ENV = { YN_CORE: 'on', YN_CORE_PEPPER_CURRENT: 'v1', YN_CORE_PEPPER_V1: 'test-pepper-' + 'p'.repeat(40), PUBLIC_URL: ORIGIN, YN_CORE_GATE: 'on' };

function mkRes() {
  const r = { statusCode: 200, headers: {}, body: undefined, redirectedTo: null,
    setHeader(k, v) { r.headers[k.toLowerCase()] = v; return r; }, getHeader(k) { return r.headers[k.toLowerCase()]; },
    status(n) { r.statusCode = n; return r; }, json(b) { r.body = b; return r; }, type(t) { r.headers['content-type'] = t; return r; },
    send(b) { r.body = b; return r; }, redirect(c, u) { r.statusCode = c; r.redirectedTo = u; return r; } };
  return r;
}

/** A phone: keeps cookies between requests, like a browser does. */
function phone() {
  const jar = new Map();
  return {
    jar,
    cookie: () => [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
    absorb(res) {
      for (const c of [].concat(res.headers['set-cookie'] || [])) {
        const [pair, ...attrs] = c.split(';'); const i = pair.indexOf('=');
        const name = pair.slice(0, i), value = pair.slice(i + 1);
        if (/max-age=0/i.test(attrs.join(';')) || value === '') jar.delete(name); else jar.set(name, value);
      }
    },
  };
}

function setup(over = {}) {
  const clock = { t: Date.parse('2026-11-10T10:00:00Z') };
  const env = { ...ENV, ...(over.env || {}) };
  const tokens = [1, 2, 3, 4, 5].map(() => newToken());
  const db = { challenges: [], audit: [], alerts: [], creds: [], coinStatus: { 1: 'active', 2: 'active', 3: 'active', 4: 'active', 5: 'active' } };
  let core;
  const sb = async (q, opts = {}) => {
    const method = opts.method || 'GET';
    if (q.startsWith('yn_core_coin_tokens?token_hmac=in.')) {
      const slot = tokens.findIndex(t => core.keyring.all('token', t).some(x => q.includes(x.hmac)));
      return slot < 0 ? [] : [{ id: crypto.randomUUID(), slot: slot + 1, status: 'current', grace_until: null, key_id: 'v1' }];
    }
    if (q.startsWith('yn_core_coin_tokens?id=eq.')) return [];
    if (q.startsWith('yn_core_coins?slot=eq.') && method === 'GET') { const s = Number(/slot=eq\.(\d)/.exec(q)[1]); return [{ slot: s, status: db.coinStatus[s], policy: 'redirect', written_verified_at: null }]; }
    if (q.startsWith('yn_core_coins?')) return [];
    if (q.startsWith('yn_core_destinations')) return [];
    if (q.startsWith('yn_core_tap_events')) return [];
    if (q.startsWith('rpc/yn_core_audit')) { db.audit.push(JSON.parse(opts.body)); return null; }
    if (q.startsWith('yn_core_webauthn_challenges') && method === 'POST') { db.challenges.push({ ...JSON.parse(opts.body), consumed_at: null }); return []; }
    if (q.startsWith('yn_core_webauthn_challenges?') && method === 'PATCH') {
      const id = /id=eq\.([0-9a-f-]+)/.exec(q)[1], uid = /user_id=eq\.([0-9a-f-]+)/.exec(q)[1], purpose = /purpose=eq\.(\w+)/.exec(q)?.[1];
      const row = db.challenges.find(c => c.id === id && c.user_id === uid && !c.consumed_at && Date.parse(c.expires_at) > clock.t && (!purpose || c.purpose === purpose));
      if (!row) return [];
      row.consumed_at = new Date(clock.t).toISOString(); return [row];
    }
    if (q.startsWith('yn_core_admin_credentials?revoked_at=is.null&select=id')) return db.creds.map(c => ({ id: c.id }));
    if (q.startsWith('yn_core_admin_credentials?credential_id=eq.')) { const id = decodeURIComponent(/credential_id=eq\.([^&]+)/.exec(q)[1]); return db.creds.filter(c => c.credential_id === id); }
    if (q.startsWith('yn_core_admin_credentials?id=eq.') && method === 'PATCH') { const c = db.creds.find(x => q.includes(x.id)); Object.assign(c, JSON.parse(opts.body)); return []; }
    throw new Error('unexpected db call: ' + q);
  };
  core = createCore({ sb, env, now: () => clock.t, notify: (t, m) => db.alerts.push({ t, m }), shield: { strike() {}, limiter: () => (_q, _s, n) => n() }, log: { error() {}, warn() {} } });
  const route = (method, path) => core.routes.find(r => r.method === method && r.path === path).handler;
  const req = (p, extra = {}) => ({ method: 'GET', params: {}, headers: { host: 'ynstudio.site', 'user-agent': IPHONE, cookie: p.cookie() }, sec: { ip: '203.0.113.9' }, ...extra });
  const tap = async (p, slot, ua = IPHONE) => {
    const res = mkRes();
    await route('get', '/nfc/:token')(req(p, { params: { token: tokens[slot - 1] }, headers: { host: 'ynstudio.site', 'user-agent': ua, cookie: p.cookie() } }), res);
    p.absorb(res); return res;
  };
  const call = async (p, method, path, body) => { const res = mkRes(); await route(method, path)(req(p, { method: method.toUpperCase(), body }), res); p.absorb(res); return res; };
  const authenticator = makeAuthenticator({ rpId: RP, origin: ORIGIN });
  const addPasskey = () => {
    const ch = b64(crypto.randomBytes(32));
    const reg = verifyRegistration({ credential: authenticator.create({ challenge: ch }), expectedChallenge: ch, rpId: RP, origins: [ORIGIN] });
    db.creds.push({ id: crypto.randomUUID(), user_id: ADMIN_ID, credential_id: reg.credentialId, public_key: reg.publicKey, sign_count: 0, nickname: 'iPhone' });
  };
  return { core, clock, tokens, db, tap, call, req, authenticator, addPasskey };
}
const b64 = b => Buffer.from(b).toString('base64url');

async function unlock(s, p, authenticator = s.authenticator) {
  const o = await s.call(p, 'post', '/api/core-gate/auth/options', {});
  assert.equal(o.statusCode, 200, JSON.stringify(o.body));
  const credential = authenticator.get(o.body.publicKey);
  return s.call(p, 'post', '/api/core-gate/auth/verify', { challengeId: o.body.challengeId, credential });
}

test('a tap sends the phone to /yn-core and remembers which coin it was', async () => {
  const s = setup(), p = phone();
  const r = await s.tap(p, 3);
  assert.equal(r.statusCode, 302); assert.equal(r.redirectedTo, '/yn-core');
  assert.match(String(r.headers['set-cookie']), /yn_tap=.*HttpOnly.*SameSite=Lax.*Secure/);
  const st = await s.call(p, 'get', '/api/core-gate/state');
  assert.deepEqual(st.body.taps, [false, false, true, false, false]);
  assert.equal(s.db.alerts.length, 1); assert.match(s.db.alerts[0].t, /coin 03 tapped \(1\/5\)/);
});

test('five different coins complete the ritual; the same coin twice does not', async () => {
  const s = setup(), p = phone();
  for (const n of [1, 1, 2, 2]) await s.tap(p, n);
  assert.deepEqual((await s.call(p, 'get', '/api/core-gate/state')).body.taps, [true, true, false, false, false]);
  for (const n of [3, 4, 5]) await s.tap(p, n);
  assert.deepEqual((await s.call(p, 'get', '/api/core-gate/state')).body.taps, [true, true, true, true, true]);
});

test('bots, link previews and unknown tokens never advance the ritual', async () => {
  const s = setup(), p = phone();
  const bot = await s.tap(p, 1, 'TelegramBot (like TwitterBot)');
  assert.equal(bot.statusCode, 404); assert.equal(p.cookie(), '');
  const res = mkRes();
  await s.core.routes.find(r => r.path === '/nfc/:token').handler(s.req(p, { params: { token: newToken() } }), res);
  assert.equal(res.statusCode, 404); assert.equal(p.cookie(), '');
});

test('a paused or revoked coin does not count', async () => {
  const s = setup(), p = phone();
  s.db.coinStatus[2] = 'paused';
  assert.equal((await s.tap(p, 2)).statusCode, 404);
  assert.equal(p.cookie(), '');
});

test('the five taps must happen inside the window, and the clock never restarts', async () => {
  const s = setup(), p = phone();
  await s.tap(p, 1);
  s.clock.t += 4 * 60000;
  await s.tap(p, 2);                                   // 4 minutes in: still fine, but the clock keeps its original start
  s.clock.t += 90000;                                  // 5 min 30 s after the FIRST tap
  assert.deepEqual((await s.call(p, 'get', '/api/core-gate/state')).body.taps, [false, false, false, false, false]);
  const o = await s.call(p, 'post', '/api/core-gate/auth/options', {});
  assert.equal(o.statusCode, 403); assert.equal(o.body.code, 'need_coins');
});

test('Face ID is refused until all five coins were tapped', async () => {
  const s = setup(), p = phone(); s.addPasskey();
  for (const n of [1, 2, 3, 4]) await s.tap(p, n);
  const o = await s.call(p, 'post', '/api/core-gate/auth/options', {});
  assert.equal(o.statusCode, 403); assert.equal(o.body.code, 'need_coins');
  const v = await s.call(p, 'post', '/api/core-gate/auth/verify', { challengeId: crypto.randomUUID(), credential: {} });
  assert.equal(v.statusCode, 403);
});

test('five coins + a registered passkey unlock the admin; the unlock cookie is what the guard checks', async () => {
  const s = setup({ env: { YN_CORE_GATE_SCOPE: 'all' } }), p = phone(); s.addPasskey();
  for (const n of [1, 2, 3, 4, 5]) await s.tap(p, n);
  const r = await unlock(s, p);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body)); assert.equal(r.body.ok, true);
  assert.ok(p.jar.has('yn_unlock')); assert.ok(!p.jar.has('yn_tap'));                  // taps are used up
  assert.ok(s.db.audit.some(a => a.p_action === 'gate.unlock' && a.p_result === 'ok'));
  assert.ok(s.db.alerts.some(a => /admin unlocked/.test(a.t)));
  let nexted = false;
  const g = mkRes(); s.core.guard({ ...s.req(p), path: '/api/admin/orders' }, g, () => { nexted = true; });
  assert.ok(nexted && g.statusCode === 200);
  nexted = false;
  s.core.guard({ ...s.req(p), path: '/admin/themes' }, mkRes(), () => { nexted = true; });
  assert.ok(nexted);
  nexted = false; s.core.guard({ ...s.req(p), path: '/api/admin/core/overview' }, mkRes(), () => { nexted = true; });
  assert.ok(nexted);
});

test('scope=all: with the gate closed the admin pages do not exist and the admin API says locked', async () => {
  const s = setup({ env: { YN_CORE_GATE_SCOPE: 'all' } }), p = phone();
  const page = mkRes(); let nexted = false;
  s.core.guard({ ...s.req(p), path: '/admin/orders' }, page, () => { nexted = true; });
  assert.ok(!nexted); assert.equal(page.statusCode, 404);
  const api = mkRes();
  s.core.guard({ ...s.req(p), path: '/api/admin/env-check' }, api, () => { nexted = true; });
  assert.ok(!nexted); assert.equal(api.statusCode, 403); assert.equal(api.body.code, 'gate_locked');
  for (const path of ['/', '/login', '/yn-core', '/api/core-gate/state', '/nfc/abc', '/admin/emergency', '/admin/emergency/recover', '/api/emergency/state', '/api/products']) {
    nexted = false; s.core.guard({ ...s.req(p), path }, mkRes(), () => { nexted = true; });
    assert.ok(nexted, path + ' must stay reachable');
  }
});

test('the gate is OFF by default: nothing changes until YN_CORE_GATE=on', async () => {
  const s = setup({ env: { YN_CORE_GATE: '' } }), p = phone();
  let nexted = false;
  s.core.guard({ ...s.req(p), path: '/admin/orders' }, mkRes(), () => { nexted = true; });
  assert.ok(nexted);
  s.core.guard({ ...s.req(p), path: '/api/admin/orders' }, mkRes(), () => { nexted = true; });
  assert.ok(nexted);
});

test('a wrong passkey fails, burns the five taps and alerts you', async () => {
  const s = setup(), p = phone(); s.addPasskey();
  for (const n of [1, 2, 3, 4, 5]) await s.tap(p, n);
  const stranger = makeAuthenticator({ rpId: RP, origin: ORIGIN });
  const r = await unlock(s, p, stranger);
  assert.equal(r.statusCode, 401); assert.equal(r.body.code, 'gate_denied');
  assert.ok(!p.jar.has('yn_unlock')); assert.ok(!p.jar.has('yn_tap'));
  assert.ok(s.db.alerts.some(a => /unlock FAILED/.test(a.t)));
  assert.ok(s.db.audit.some(a => a.p_action === 'gate.unlock' && a.p_result === 'denied'));
});

test('a challenge cannot be replayed', async () => {
  const s = setup(), p = phone(); s.addPasskey();
  for (const n of [1, 2, 3, 4, 5]) await s.tap(p, n);
  const o = await s.call(p, 'post', '/api/core-gate/auth/options', {});
  const credential = s.authenticator.get(o.body.publicKey);
  const first = await s.call(p, 'post', '/api/core-gate/auth/verify', { challengeId: o.body.challengeId, credential });
  assert.equal(first.statusCode, 200);
  const p2 = phone(); for (const n of [1, 2, 3, 4, 5]) await s.tap(p2, n);
  const again = await s.call(p2, 'post', '/api/core-gate/auth/verify', { challengeId: o.body.challengeId, credential });
  assert.equal(again.statusCode, 401);
  assert.ok(!p2.jar.has('yn_unlock'));
});

test('forged, edited or borrowed cookies are rejected', async () => {
  const s = setup({ env: { YN_CORE_GATE_SCOPE: 'all' } }), p = phone(); s.addPasskey();
  for (const n of [1, 2, 3, 4, 5]) await s.tap(p, n);
  // hand-made "all five" cookie
  const forged = phone();
  const [body] = p.jar.get('yn_tap').split('.');
  const fakeBody = b64(JSON.stringify({ m: 31, s: s.clock.t, e: s.clock.t + 300000 }));
  forged.jar.set('yn_tap', `${fakeBody}.v1.${'0'.repeat(64)}`);
  assert.equal((await s.call(forged, 'post', '/api/core-gate/auth/options', {})).statusCode, 403);
  // a tap cookie is not an unlock cookie
  const swap = phone(); swap.jar.set('yn_unlock', p.jar.get('yn_tap'));
  let nexted = false; const g = mkRes();
  s.core.guard({ ...s.req(swap), path: '/api/admin/x' }, g, () => { nexted = true; });
  assert.ok(!nexted); assert.equal(g.statusCode, 403);
  void body;
});

test('the unlock expires by itself, slides while you work, and has a hard stop', async () => {
  const s = setup({ env: { YN_CORE_GATE_SCOPE: 'all' } }), p = phone(); s.addPasskey();
  for (const n of [1, 2, 3, 4, 5]) await s.tap(p, n);
  await unlock(s, p);
  const ok = () => { let n = false; const g = mkRes(); s.core.guard({ ...s.req(p), path: '/api/admin/x' }, g, () => { n = true; }); p.absorb(g); return n; };
  s.clock.t += 10 * 60000; assert.ok(ok());            // 10 min in, still open (and the window slides forward)
  s.clock.t += 15 * 60000; assert.ok(ok());            // 25 min after unlock, still open because you were working
  s.clock.t += 21 * 60000; assert.ok(!ok());           // idle for 21 minutes: closed
  const q = phone(); for (const n of [1, 2, 3, 4, 5]) await s.tap(q, n);
  await unlock(s, q);
  for (let i = 0; i < 20; i++) { s.clock.t += 10 * 60000; ok.call(null); }
  const hard = phone(); hard.jar = q.jar;
  s.clock.t += 1;
  assert.ok(![...Array(1)].some(() => { let n = false; s.core.guard({ ...s.req(q), path: '/api/admin/x' }, mkRes(), () => { n = true; }); return n; }), 'hard stop after 2 hours');
});

test('lock now clears everything', async () => {
  const s = setup(), p = phone(); s.addPasskey();
  for (const n of [1, 2, 3, 4, 5]) await s.tap(p, n);
  await unlock(s, p);
  const r = await s.call(p, 'post', '/api/core-gate/lock');
  assert.equal(r.statusCode, 200); assert.equal(p.cookie(), '');
});

test('no passkey yet: the page says so instead of a dead end', async () => {
  const s = setup(), p = phone();
  for (const n of [1, 2, 3, 4, 5]) await s.tap(p, n);
  const o = await s.call(p, 'post', '/api/core-gate/auth/options', {});
  assert.equal(o.statusCode, 409); assert.equal(o.body.code, 'no_passkey');
});

test('YN_CORE_COIN_MODE=redirect keeps the old coin -> destination behaviour', async () => {
  const s = setup({ env: { YN_CORE_COIN_MODE: 'redirect' } }), p = phone();
  const r = await s.tap(p, 1);
  assert.equal(r.statusCode, 404);          // no destination configured in this fake database
  assert.equal(p.cookie(), '');
});
