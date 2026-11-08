// YN CORE tests. Run: node --test tests/core.test.mjs
//   * Unit tests (crypto, WebAuthn, rotation, URL rules) always run, with no network and no database.
//   * Integration tests run the REAL SQL functions against a scratch Postgres. Set YN_CORE_TEST_PG=host:port to a database
//     where supabase/sql/supabase-yn-core.sql has been applied (roles anon/authenticated/service_role must exist). They are
//     skipped otherwise, so `npm test` stays green on a machine without Postgres. NEVER point this at your real project.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createKeyring, isToken, newRecoveryCode, newToken, normalizeRecoveryCode } from '../server/core/crypto.js';
import { decodeCbor } from '../server/core/cbor.js';
import { verifyAssertion, verifyRegistration, WebAuthnError } from '../server/core/webauthn.js';
import { isEligible, pickDestination } from '../server/core/rotation.js';
import { validateDestinationUrl } from '../server/core/urls.js';
import { createCore } from '../server/core/index.js';
import { cborEncode, makeAuthenticator } from './helpers/softPasskey.mjs';
import { makePg } from './helpers/pgRest.mjs';

const RP = 'ynstudio.site', ORIGIN = 'https://ynstudio.site';
const b64u = b => Buffer.from(b).toString('base64url');

/* ============================================================ unit: tokens + keyring */
test('tokens are 256-bit, 43 base64url characters, never repeat', () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i++) { const t = newToken(); assert.match(t, /^[A-Za-z0-9_-]{43}$/); assert.equal(Buffer.from(t, 'base64url').length, 32); seen.add(t); }
  assert.equal(seen.size, 2000);
  assert.ok(!isToken('short') && !isToken('a'.repeat(44)) && !isToken('a'.repeat(42) + '!') && !isToken(null));
});
test('recovery codes carry 100 bits and normalize', () => {
  const c = newRecoveryCode();
  assert.match(c, /^([A-Z2-9]{5}-){3}[A-Z2-9]{5}$/);
  assert.equal(normalizeRecoveryCode(c.toLowerCase().replace(/-/g, ' ')).length, 20);
});
test('keyring fails closed and supports pepper rotation', () => {
  assert.equal(createKeyring({}).ready, false);
  assert.equal(createKeyring({ YN_CORE_PEPPER_CURRENT: 'v1', YN_CORE_PEPPER_V1: 'short' }).ready, false);
  const k1 = createKeyring({ YN_CORE_PEPPER_CURRENT: 'v1', YN_CORE_PEPPER_V1: 'a'.repeat(40) });
  const k2 = createKeyring({ YN_CORE_PEPPER_CURRENT: 'v2', YN_CORE_PEPPER_V1: 'a'.repeat(40), YN_CORE_PEPPER_V2: 'b'.repeat(40) });
  assert.ok(k1.ready && k2.ready);
  assert.equal(k2.hmac('v1', 'token', 'x'), k1.current('token', 'x'));          // old key still verifies old hashes
  assert.notEqual(k2.current('token', 'x'), k1.current('token', 'x'));
  assert.notEqual(k1.current('token', 'x'), k1.current('session', 'x'));         // purposes are separated
  assert.equal(k2.all('token', 'x').length, 2);
  assert.notEqual(k1.ipHash('1.2.3.4', Date.UTC(2026, 0, 1)), k1.ipHash('1.2.3.4', Date.UTC(2026, 0, 2)));
});

/* ============================================================ unit: CBOR */
test('cbor round trip and hostile input', () => {
  const m = new Map([[1, 2], [-1, 1], ['k', Buffer.from('ab')], ['a', [1, 'x']]]);
  const [v, n] = decodeCbor(cborEncode(m));
  assert.equal(n, cborEncode(m).length);
  assert.equal(v.get(-1), 1); assert.deepEqual(v.get('k'), Buffer.from('ab')); assert.deepEqual(v.get('a'), [1, 'x']);
  assert.throws(() => decodeCbor(Buffer.from([0x9f, 0x01, 0xff])), /indefinite/);   // indefinite array
  assert.throws(() => decodeCbor(Buffer.from([0x5a, 0xff, 0xff, 0xff, 0xff])), /truncated/);
  assert.throws(() => decodeCbor(Buffer.alloc(0)), /truncated/);
});

/* ============================================================ unit: WebAuthn */
const opts = () => ({ challenge: b64u(crypto.randomBytes(32)) });
function register(over = {}) {
  const auth = makeAuthenticator({ rpId: RP, origin: ORIGIN });
  const o = opts();
  const cred = auth.create(o, over);
  return { auth, o, cred, reg: () => verifyRegistration({ credential: cred, expectedChallenge: o.challenge, rpId: RP, origins: [ORIGIN] }) };
}
test('webauthn: registration of a user-verified ES256 passkey', () => {
  const { reg, auth } = register();
  const r = reg();
  assert.equal(r.credentialId, auth.rawId);
  assert.ok(r.publicKey.length > 60);
});
test('webauthn: registration refusals', () => {
  assert.throws(() => register({ origin: 'https://evil.example' }).reg(), /origin/);
  assert.throws(() => register({ rpId: 'evil.example' }).reg(), /RP ID/);
  assert.throws(() => register({ flags: 0x41 }).reg(), /user verification/);       // no UV
  assert.throws(() => register({ flags: 0x44 }).reg(), /user presence/);           // no UP
  assert.throws(() => register({ alg: -257 }).reg(), /ES256/);
  const x = register();
  assert.throws(() => verifyRegistration({ credential: x.cred, expectedChallenge: b64u(crypto.randomBytes(32)), rpId: RP, origins: [ORIGIN] }), /challenge/);
});
test('webauthn: assertion accepts a good signature and enforces every check', () => {
  const { auth, reg } = register();
  const stored = { publicKey: reg().publicKey, signCount: 0 };
  const run = (o, extra = {}) => { const ch = opts(); const c = auth.get(ch, o); return verifyAssertion({ credential: c, expectedChallenge: extra.expected ?? (o?.challenge ?? ch.challenge), rpId: RP, origins: [ORIGIN], stored: extra.stored ?? stored }); };
  assert.equal(run({}).signCount, 1);
  assert.throws(() => run({ origin: 'https://evil.example' }), /origin/);
  assert.throws(() => run({ rpId: 'evil.example' }), /RP ID/);
  assert.throws(() => run({ flags: 0x01 }), /user verification/);
  assert.throws(() => run({ badSignature: true }), /signature/);
  assert.throws(() => run({}, { expected: b64u(crypto.randomBytes(32)) }), /challenge/);
  assert.throws(() => run({ counter: 5 }, { stored: { ...stored, signCount: 9 } }), /counter/);   // cloned authenticator
  const other = makeAuthenticator({ rpId: RP, origin: ORIGIN }).get(opts());
  assert.throws(() => verifyAssertion({ credential: other, expectedChallenge: JSON.parse(Buffer.from(other.response.clientDataJSON, 'base64url')).challenge, rpId: RP, origins: [ORIGIN], stored }), WebAuthnError); // another key
});
test('webauthn: synced passkeys that always report counter 0 are allowed', () => {
  const { auth, reg } = register();
  const stored = { publicKey: reg().publicKey, signCount: 0 };
  const ch = opts();
  const c = auth.get(ch, { counter: 0 });
  assert.equal(verifyAssertion({ credential: c, expectedChallenge: ch.challenge, rpId: RP, origins: [ORIGIN], stored }).signCount, 0);
});

/* ============================================================ unit: rotation */
const D = (id, priority, extra = {}) => ({ id, url: `https://${id}.example.com/`, priority, active: true, ...extra });
test('rotation: windows decide eligibility in the coin time zone', () => {
  const sat10 = new Date('2026-11-07T03:00:00Z');                    // Saturday 10:00 in Bangkok (UTC+7)
  assert.equal(isEligible(D('a', 1, { weekdays: [1, 2, 3, 4, 5] }), 'Asia/Bangkok', sat10), false);
  assert.equal(isEligible(D('a', 1, { weekdays: [6] }), 'Asia/Bangkok', sat10), true);
  assert.equal(isEligible(D('a', 1, { window_start: '09:00', window_end: '17:00' }), 'Asia/Bangkok', sat10), true);
  assert.equal(isEligible(D('a', 1, { window_start: '09:00', window_end: '17:00' }), 'UTC', sat10), false);
  const night = { window_start: '22:00', window_end: '06:00' };
  assert.equal(isEligible(D('a', 1, night), 'Asia/Bangkok', sat10), false);
  assert.equal(isEligible(D('a', 1, night), 'Asia/Bangkok', new Date('2026-11-07T16:30:00Z')), true);   // 23:30 local
  assert.equal(isEligible(D('a', 1, { starts_at: '2026-12-01T00:00:00Z' }), 'UTC', sat10), false);
  assert.equal(isEligible(D('a', 1, { ends_at: '2026-11-01T00:00:00Z' }), 'UTC', sat10), false);
  assert.equal(isEligible(D('a', 1, { active: false }), 'UTC', sat10), false);
});
test('rotation: fixed, interval round-robin, fallback, nothing', () => {
  const now = new Date('2026-11-07T03:00:00Z');
  const ds = [D('b', 2), D('a', 1)];
  assert.equal(pickDestination({ rotation_mode: 'fixed' }, ds, now).id, 'a');
  const coin = { rotation_mode: 'interval', rotation_interval_seconds: 3600, rotation_anchor: '2026-11-07T00:00:00Z', rotation_tz: 'UTC' };
  assert.equal(pickDestination(coin, ds, now).id, 'b');                                 // 3 intervals elapsed -> index 1
  assert.equal(pickDestination(coin, ds, new Date('2026-11-07T04:00:00Z')).id, 'a');   // next step wraps
  assert.deepEqual(pickDestination({ fallback_url: 'https://fb.example.com/' }, [D('x', 1, { active: false })], now), { id: null, url: 'https://fb.example.com/', fallback: true });
  assert.equal(pickDestination({}, [], now), null);
});

/* ============================================================ unit: destination URLs */
test('destination URLs: https public sites only', () => {
  assert.equal(validateDestinationUrl('https://ynstudio.site/menu?x=1'), 'https://ynstudio.site/menu?x=1');
  for (const bad of ['http://ynstudio.site', 'javascript:alert(1)', 'data:text/html,hi', 'https://127.0.0.1/', 'https://10.0.0.5/', 'https://[::1]/', 'https://localhost/', 'https://printer.local/', 'https://intranet/',
    'https://user:pw@ynstudio.site/', 'https://ynstudio.site:8443/', 'https://yn studio.site/', '', 'ftp://ynstudio.site/', 'https://' + 'a'.repeat(2100) + '.com']) {
    assert.throws(() => validateDestinationUrl(bad), Error, bad.slice(0, 40));
  }
  assert.throws(() => validateDestinationUrl('https://evil.example/', { allowedHosts: ['ynstudio.site'] }), /allowed list/);
  assert.ok(validateDestinationUrl('https://shop.ynstudio.site/', { allowedHosts: ['ynstudio.site'] }));
});

/* ============================================================ unit: configuration fails closed */
test('core is inert when disabled or not configured', async () => {
  const off = createCore({ sb: async () => { throw new Error('db must not be touched'); }, env: { YN_CORE: 'off' } });
  assert.equal(off.enabled, false);
  assert.equal(createCore({ sb: async () => {}, env: {} }).enabled, true); // on by default
  const res = mkRes();
  await off.routes.find(r => r.path === '/nfc/:token').handler({ method: 'GET', params: { token: newToken() }, headers: {} }, res);
  assert.equal(res.statusCode, 404);
  const noPepper = createCore({ sb: async () => { throw new Error('db must not be touched'); }, env: { PUBLIC_URL: ORIGIN } });
  const r2 = mkRes();
  await noPepper.routes.find(r => r.path === '/nfc/:token').handler({ method: 'GET', params: { token: newToken() }, headers: {} }, r2);
  assert.equal(r2.statusCode, 404);
  const r3 = mkRes();
  await noPepper.routes.find(r => r.path === '/api/admin/core/overview').handler({ method: 'GET', params: {}, headers: {}, admin: { id: '11111111-1111-4111-8111-111111111111' } }, r3);
  assert.equal(r3.statusCode, 503);
});

function mkRes() {
  const r = { statusCode: 200, headers: {}, body: undefined, redirectedTo: null,
    setHeader(k, v) { r.headers[k.toLowerCase()] = v; return r; }, status(n) { r.statusCode = n; return r; }, json(b) { r.body = b; return r; },
    type(t) { r.headers['content-type'] = t; return r; }, send(b) { r.body = b; return r; }, redirect(c, u) { r.statusCode = c; r.redirectedTo = u; return r; } };
  return r;
}

/* ============================================================ integration (real SQL) */
const PG = process.env.YN_CORE_TEST_PG;
const it = (name, fn) => test(name, { skip: PG ? false : 'set YN_CORE_TEST_PG=host:port to run the database tests' }, fn);
const A = '/api/admin/core', E = '/api/emergency';
const ADMIN = { id: '11111111-1111-4111-8111-111111111111', email: 'admin@example.com' };
const OTHER = { id: '22222222-2222-4222-8222-222222222222', email: 'other@example.com' };
const ENV = { YN_CORE: 'on', YN_CORE_PEPPER_CURRENT: 'v1', YN_CORE_PEPPER_V1: 'test-pepper-' + 'p'.repeat(40), PUBLIC_URL: ORIGIN, YN_CORE_RECOVERY_DELAY_MIN: '1' };
let pg;
if (PG) { const [host, port] = PG.split(':'); pg = makePg({ host, port }); }

function reset() {
  pg.run(`truncate yn_core_tap_events, yn_core_recovery_requests, yn_core_recovery_codes, yn_core_emergency_sessions, yn_core_webauthn_challenges, yn_core_admin_credentials, yn_core_destinations, yn_core_coin_tokens, yn_core_audit_log restart identity;
    update yn_core_coins set status='uninitialized', label='Coin 0'||slot, policy='redirect', fallback_url=null, rotation_mode='fixed', activated_at=null, written_verified_at=null;
    update yn_core_state set init_locked=false, init_locked_at=null, recovery_window_until=null, recovery_window_by=null;`);
}
function setup() {
  reset();
  const logs = [], strikes = [], notes = [];
  const core = createCore({ sb: pg.sb, shield: { strike: (...a) => strikes.push(a) }, store: { log: e => logs.push(e) }, requireAdmin: async () => ADMIN, notify: (...a) => notes.push(a), env: ENV, log: { error() {}, warn() {} } });
  const auth = makeAuthenticator({ rpId: RP, origin: ORIGIN });
  return { core, auth, logs, strikes, notes };
}
async function call(core, method, path, { admin = ADMIN, body = {}, params = {}, query = {}, headers = {} } = {}) {
  const r = core.routes.find(x => x.method === method && x.path === path);
  assert.ok(r, `no route ${method} ${path}`);
  const req = { method: method.toUpperCase(), params, query, body, headers: { host: 'ynstudio.site', ...headers }, admin, sec: { ip: '203.0.113.7' } };
  const res = mkRes(); await r.handler(req, res); return res;
}
const freshJwt = (ageSec = 5) => { const t = Math.floor(Date.now() / 1000) - ageSec; return 'h.' + b64u(JSON.stringify({ iat: t, amr: [{ method: 'password', timestamp: t }] })) + '.s'; };
const hdrs = (jwt, session) => ({ authorization: 'Bearer ' + jwt, ...(session ? { 'x-yn-emergency': session } : {}) });

async function enroll(core, auth, { jwt = freshJwt(), session, admin = ADMIN } = {}) {
  const o = await call(core, 'post', A + '/passkeys/register/options', { admin, headers: hdrs(jwt, session) });
  if (o.statusCode !== 200) return o;
  return call(core, 'post', A + '/passkeys/register/verify', { admin, body: { challengeId: o.body.challengeId, credential: auth.create(o.body.publicKey), nickname: 'test' } });
}
async function stepUp(core, auth, purpose, slot = null, admin = ADMIN) {
  const o = await call(core, 'post', E + '/auth/options', { admin, body: { purpose, slot } });
  if (o.statusCode !== 200) return o;
  return call(core, 'post', E + '/auth/verify', { admin, body: { challengeId: o.body.challengeId, credential: auth.get(o.body.publicKey) } });
}
async function activate(core, auth, slot, body = {}) {
  const s = await stepUp(core, auth, 'init', slot);
  assert.equal(s.statusCode, 200, JSON.stringify(s.body));
  const a = await call(core, 'post', E + '/coins/:slot/activate', { params: { slot: String(slot) }, headers: { 'x-yn-emergency': s.body.sessionToken }, body });
  return { a, session: s.body.sessionToken };
}
const tokenOf = url => url.split('/nfc/')[1];
async function callTap(core, token, method, ua) {
  const r = core.routes.find(x => x.path === '/nfc/:token');
  const res = mkRes(); await r.handler({ method, params: { token }, headers: { 'user-agent': ua, 'cf-ipcountry': 'KH', host: 'ynstudio.site' }, sec: { ip: '203.0.113.7' } }, res); return res;
}
const withCodes = async (core, auth) => { const r = await enroll(core, auth); assert.equal(r.statusCode, 201, JSON.stringify(r.body)); return r.body.recoveryCodes; };

it('passkey enrollment: first needs a fresh login, extra devices need a passkey step-up, recovery codes appear once', async () => {
  const { core, auth } = setup();
  const stale = await enroll(core, auth, { jwt: freshJwt(3600) });
  assert.equal(stale.statusCode, 401); assert.equal(stale.body.code, 'stale_login');
  const first = await enroll(core, auth);
  assert.equal(first.statusCode, 201);
  assert.equal(first.body.recoveryCodes.length, 10);
  const phone = makeAuthenticator({ rpId: RP, origin: ORIGIN });
  const noStep = await enroll(core, phone);                               // a stolen admin session alone cannot add a passkey
  assert.equal(noStep.statusCode, 401); assert.equal(noStep.body.code, 'step_up');
  const s = await stepUp(core, auth, 'security');
  const second = await enroll(core, phone, { session: s.body.sessionToken });
  assert.equal(second.statusCode, 201); assert.equal(second.body.recoveryCodes, undefined);
  const list = await call(core, 'get', A + '/passkeys');
  assert.equal(list.body.passkeys.length, 2); assert.equal(list.body.recoveryCodesLeft, 10);
  assert.ok(!JSON.stringify(list.body).includes('public_key'));
  const dup = await enroll(core, auth, { session: (await stepUp(core, auth, 'security')).body.sessionToken });
  assert.ok([400, 409].includes(dup.statusCode));                         // same authenticator again is refused
});

it('activation: unique 256-bit URL, hash-only storage, session ends at once, replay refused', async () => {
  const { core, auth, notes } = setup();
  await withCodes(core, auth);
  const { a, session } = await activate(core, auth, 1, { label: 'Front desk', destination_url: 'https://ynstudio.site/menu', policy: 'redirect' });
  assert.equal(a.statusCode, 200, JSON.stringify(a.body));
  assert.match(a.body.url, /^https:\/\/ynstudio\.site\/nfc\/[A-Za-z0-9_-]{43}$/);
  assert.equal(a.body.sessionEnded, true); assert.equal(a.headers['cache-control'], 'no-store');
  const token = tokenOf(a.body.url);
  // the plaintext token is nowhere in the database
  const dump = pg.run(`select string_agg(x::text, ' ') from (select * from yn_core_coin_tokens) x`) + pg.run(`select coalesce(string_agg(x::text, ' '), '') from yn_core_audit_log x`) + pg.run(`select coalesce(string_agg(x::text, ' '), '') from yn_core_emergency_sessions x`);
  assert.ok(!dump.includes(token));
  assert.equal(pg.run(`select count(*) from yn_core_coin_tokens where token_hmac = '${core.keyring.current('token', token)}'`), '1');
  // auto-lock: the very same session cannot do anything else
  assert.equal(pg.run(`select (consumed_at is not null and revoked_at is not null)::text from yn_core_emergency_sessions where scope='init'`), 'true');
  const again = await call(core, 'post', E + '/coins/:slot/activate', { params: { slot: '1' }, headers: { 'x-yn-emergency': session } });
  assert.equal(again.statusCode, 401);
  // a second coin needs a brand new passkey check
  const noSession = await call(core, 'post', E + '/coins/:slot/activate', { params: { slot: '2' } });
  assert.equal(noSession.statusCode, 401);
  const second = await activate(core, auth, 2);
  assert.equal(second.a.statusCode, 200);
  assert.notEqual(tokenOf(second.a.body.url), token);
  assert.ok(notes.length >= 2);
  // already-active coin cannot be re-initialized, even with a fresh session
  const dupe = await activate(core, auth, 1);
  assert.equal(dupe.a.statusCode, 409);
});

it('sessions are bound to one coin and one purpose', async () => {
  const { core, auth } = setup();
  await withCodes(core, auth);
  const s2 = await stepUp(core, auth, 'init', 2);
  const wrongSlot = await call(core, 'post', E + '/coins/:slot/activate', { params: { slot: '3' }, headers: { 'x-yn-emergency': s2.body.sessionToken } });
  assert.equal(wrongSlot.statusCode, 401);
  const sSec = await stepUp(core, auth, 'security');
  const wrongScope = await call(core, 'post', E + '/coins/:slot/activate', { params: { slot: '2' }, headers: { 'x-yn-emergency': sSec.body.sessionToken } });
  assert.equal(wrongScope.statusCode, 401);
  const forged = await call(core, 'post', E + '/coins/:slot/activate', { params: { slot: '2' }, headers: { 'x-yn-emergency': newToken() } });
  assert.equal(forged.statusCode, 401);
  const badSlot = await call(core, 'post', E + '/auth/options', { body: { purpose: 'init', slot: 6 } });
  assert.equal(badSlot.statusCode, 400);
  // opening a new session supersedes the old one
  const a = await stepUp(core, auth, 'init', 4), b = await stepUp(core, auth, 'init', 4);
  const old = await call(core, 'post', E + '/coins/:slot/activate', { params: { slot: '4' }, headers: { 'x-yn-emergency': a.body.sessionToken } });
  assert.equal(old.statusCode, 401);
  assert.equal((await call(core, 'post', E + '/coins/:slot/activate', { params: { slot: '4' }, headers: { 'x-yn-emergency': b.body.sessionToken } })).statusCode, 200);
});

it('passkey checks refuse replays, other accounts, wrong origins, bad signatures and cloned counters', async () => {
  const { core, auth, strikes } = setup();
  await withCodes(core, auth);
  const opt = async () => (await call(core, 'post', E + '/auth/options', { body: { purpose: 'init', slot: 1 } })).body;
  const verify = (o, cred, admin = ADMIN) => call(core, 'post', E + '/auth/verify', { admin, body: { challengeId: o.challengeId, credential: cred } });
  let o = await opt();
  const good = auth.get(o.publicKey);
  assert.equal((await verify(o, good)).statusCode, 200);
  assert.equal((await verify(o, good)).statusCode, 401);                                   // replay of the same assertion
  o = await opt(); assert.equal((await verify(o, auth.get(o.publicKey), OTHER)).statusCode, 401);  // someone else's challenge
  o = await opt(); assert.equal((await verify(o, auth.get(o.publicKey, { origin: 'https://evil.example' }))).statusCode, 401);
  o = await opt(); assert.equal((await verify(o, auth.get(o.publicKey, { badSignature: true }))).statusCode, 401);
  o = await opt(); assert.equal((await verify(o, auth.get(o.publicKey, { flags: 0x01 }))).statusCode, 401);   // no Face ID / PIN
  o = await opt(); assert.equal((await verify(o, auth.get(o.publicKey, { counter: 1 }))).statusCode, 401);    // counter went backwards
  o = await opt(); const stolen = auth.get(o.publicKey); const o2 = await opt();
  assert.equal((await verify(o2, stolen)).statusCode, 401);                                // assertion for challenge A used on challenge B
  assert.ok(strikes.length >= 4);
  // wrong host: passkeys only work on the canonical address
  const wrongHost = await call(core, 'post', E + '/auth/options', { headers: { host: 'yn-studio.onrender.com' }, body: { purpose: 'init', slot: 1 } });
  assert.equal(wrongHost.statusCode, 400);
});

it('five activations trigger the final lock; the initialization page and API disappear', async () => {
  const { core, auth } = setup();
  await withCodes(core, auth);
  for (let slot = 1; slot <= 4; slot++) { const { a } = await activate(core, auth, slot); assert.equal(a.body.finalLock, false); }
  const gate = async () => { const res = mkRes(); let nextCalled = false; await core.pageGate({ method: 'GET', path: '/' }, res, () => { nextCalled = true; }); return { res, nextCalled }; };
  assert.equal((await gate()).nextCalled, true);                                           // open while at least one coin is missing
  const { a: fifth } = await activate(core, auth, 5);
  assert.equal(fifth.body.finalLock, true);
  const g = await gate();
  assert.equal(g.nextCalled, false); assert.equal(g.res.statusCode, 404);                  // direct route access is refused
  const nested = mkRes(); let n2 = false; await core.pageGate({ method: 'GET', path: '/coin/3' }, nested, () => { n2 = true; });
  assert.equal(nested.statusCode, 404); assert.equal(n2, false);
  const rec = mkRes(); let n3 = false; await core.pageGate({ method: 'GET', path: '/recover' }, rec, () => { n3 = true; });
  assert.equal(n3, true);                                                                   // recovery screen stays reachable (needs passkey + code)
  assert.equal((await call(core, 'post', E + '/auth/options', { body: { purpose: 'init', slot: 1 } })).statusCode, 404);
  assert.equal((await call(core, 'post', E + '/coins/:slot/activate', { params: { slot: '1' }, headers: { 'x-yn-emergency': newToken() } })).statusCode, 404);
  const st = await call(core, 'get', E + '/state');
  assert.equal(st.body.locked, true);
  assert.equal(pg.run(`select init_locked::text from yn_core_state`), 'true');
});

it('database failure locks the page (fail closed)', async () => {
  const { core } = setup();
  const broken = createCore({ sb: async () => { throw new Error('db down'); }, env: ENV, log: { error() {}, warn() {} } });
  const res = mkRes(); let next = false; await broken.pageGate({ method: 'GET', path: '/' }, res, () => { next = true; });
  assert.equal(next, false); assert.equal(res.statusCode, 404);
  assert.ok(core);
});

it('NFC tap: permanent URL, server-side destination, safe headers, no token in logs', async () => {
  const { core, auth, logs, strikes } = setup();
  await withCodes(core, auth);
  const { a } = await activate(core, auth, 1, { label: 'Menu', destination_url: 'https://ynstudio.site/menu' });
  const token = tokenOf(a.body.url);
  const r = await callTap(core, token, 'GET', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)');
  assert.equal(r.statusCode, 302); assert.equal(r.redirectedTo, 'https://ynstudio.site/menu');
  assert.match(r.headers['cache-control'], /no-store/); assert.equal(r.headers['referrer-policy'], 'no-referrer');
  // first real tap proves the sticker was written correctly
  assert.notEqual(pg.run(`select coalesce(written_verified_at::text,'') from yn_core_coins where slot=1`), '');
  // the admin changes the destination; the SAME url now leads somewhere else
  const dests = (await call(core, 'get', A + '/coins/:slot', { params: { slot: '1' } })).body.destinations;
  await call(core, 'post', A + '/coins/:slot/destinations/:id/delete', { params: { slot: '1', id: dests[0].id } });
  assert.equal((await callTap(core, token, 'GET', 'x')).statusCode, 404);                  // nothing to show yet
  await call(core, 'post', A + '/coins/:slot/destinations', { params: { slot: '1' }, body: { url: 'https://ynstudio.site/wedding', label: 'Wedding' } });
  assert.equal((await callTap(core, token, 'GET', 'Mozilla/5.0 (Linux; Android 15)')).redirectedTo, 'https://ynstudio.site/wedding');
  // HEAD and crawlers do not inflate analytics
  const before = pg.run(`select count(*) from yn_core_tap_events where is_bot=false`);
  await callTap(core, token, 'HEAD', 'Mozilla/5.0');
  assert.equal(pg.run(`select count(*) from yn_core_tap_events where is_bot=false`), before);
  await callTap(core, token, 'GET', 'Slackbot-LinkExpanding 1.0');
  assert.equal(pg.run(`select count(*) from yn_core_tap_events where is_bot=true`), '1');
  // unknown / malformed tokens: same neutral 404, no database row, strike recorded, token never logged
  const unknown = await callTap(core, newToken(), 'GET', 'x');
  assert.equal(unknown.statusCode, 404); assert.equal(unknown.body, 'Not found');
  assert.equal((await callTap(core, 'abc', 'GET', 'x')).statusCode, 404);
  assert.ok(strikes.some(s => s[1] === 'nfc_unknown_token'));
  assert.ok(!JSON.stringify([logs, strikes]).includes(token));
  assert.ok(logs.every(l => l.path === '/nfc/:token'));
  // analytics + logs carry no secrets
  const an = await call(core, 'get', A + '/coins/:slot/analytics', { params: { slot: '1' }, query: { days: '7' } });
  assert.equal(an.body.totals.taps, 2); assert.equal(an.body.totals.bots, 1); assert.equal(an.body.byCountry[0].name, 'KH');
  const lg = await call(core, 'get', A + '/coins/:slot/logs', { params: { slot: '1' } });
  assert.ok(lg.body.events.length >= 3 && !JSON.stringify(lg.body).includes('203.0.113.7'));
});

it('pause, resume, interstitial policy and destination rules', async () => {
  const { core, auth } = setup();
  await withCodes(core, auth);
  const { a } = await activate(core, auth, 2, { destination_url: 'https://ynstudio.site/a', policy: 'interstitial' });
  const token = tokenOf(a.body.url);
  const page = await callTap(core, token, 'GET', 'Mozilla/5.0');
  assert.equal(page.statusCode, 200); assert.match(page.body, /ynstudio\.site/); assert.match(page.headers['content-security-policy'], /default-src 'none'/);
  assert.equal((await call(core, 'post', A + '/coins/:slot/pause', { params: { slot: '2' } })).statusCode, 200);
  assert.equal((await callTap(core, token, 'GET', 'Mozilla/5.0')).statusCode, 404);
  assert.equal((await call(core, 'post', A + '/coins/:slot/pause', { params: { slot: '2' } })).statusCode, 409);
  await call(core, 'post', A + '/coins/:slot/resume', { params: { slot: '2' } });
  await call(core, 'post', A + '/coins/:slot/update', { params: { slot: '2' }, body: { policy: 'redirect' } });
  assert.equal((await callTap(core, token, 'GET', 'Mozilla/5.0')).statusCode, 302);
  for (const bad of ['http://ynstudio.site', 'javascript:alert(1)', 'https://10.0.0.1/']) {
    assert.equal((await call(core, 'post', A + '/coins/:slot/destinations', { params: { slot: '2' }, body: { url: bad } })).statusCode, 400);
  }
  assert.equal((await call(core, 'post', A + '/coins/:slot/destinations', { params: { slot: '1' }, body: { url: 'https://ynstudio.site/x' } })).statusCode, 409);   // coin 1 not active
  // interval rotation, decided at tap time
  await call(core, 'post', A + '/coins/:slot/destinations', { params: { slot: '2' }, body: { url: 'https://ynstudio.site/b', priority: 200 } });
  await call(core, 'post', A + '/coins/:slot/update', { params: { slot: '2' }, body: { rotation_mode: 'interval', rotation_interval_seconds: 60 } });
  const seen = new Set();
  const coin = (await call(core, 'get', A + '/coins/:slot', { params: { slot: '2' } })).body;
  assert.ok(coin.liveUrl);
  seen.add(coin.liveUrl);
  assert.ok([...seen][0].startsWith('https://ynstudio.site/'));
});

it('regenerate: new URL, grace window for the old one, immediate death without grace; revoke kills every URL', async () => {
  const { core, auth } = setup();
  await withCodes(core, auth);
  const { a } = await activate(core, auth, 3, { destination_url: 'https://ynstudio.site/c' });
  const t1 = tokenOf(a.body.url);
  const sec = async () => (await stepUp(core, auth, 'coin_security', 3)).body.sessionToken;
  const noSession = await call(core, 'post', E + '/coins/:slot/regenerate', { params: { slot: '3' }, body: {}, headers: {} });
  assert.equal(noSession.statusCode, 401);
  const r1 = await call(core, 'post', E + '/coins/:slot/regenerate', { params: { slot: '3' }, body: { grace_minutes: 60 }, headers: { 'x-yn-emergency': await sec() } });
  assert.equal(r1.statusCode, 200); const t2 = tokenOf(r1.body.url); assert.notEqual(t1, t2);
  assert.equal((await callTap(core, t1, 'GET', 'Mozilla/5.0')).statusCode, 302);          // grace: both work
  assert.equal((await callTap(core, t2, 'GET', 'Mozilla/5.0')).statusCode, 302);
  pg.run(`update yn_core_coin_tokens set grace_until = now() - interval '1 minute' where status='grace'`);
  assert.equal((await callTap(core, t1, 'GET', 'Mozilla/5.0')).statusCode, 404);          // grace over
  const r2 = await call(core, 'post', E + '/coins/:slot/regenerate', { params: { slot: '3' }, body: { grace_minutes: 0 }, headers: { 'x-yn-emergency': await sec() } });
  const t3 = tokenOf(r2.body.url);
  assert.equal((await callTap(core, t2, 'GET', 'Mozilla/5.0')).statusCode, 404);          // no grace: dead at once
  assert.equal((await callTap(core, t3, 'GET', 'Mozilla/5.0')).statusCode, 302);
  assert.equal(pg.run(`select count(*) from yn_core_coin_tokens where slot=3 and status='current'`), '1');
  const rv = await call(core, 'post', E + '/coins/:slot/revoke', { params: { slot: '3' }, body: { reason: 'lost' }, headers: { 'x-yn-emergency': await sec() } });
  assert.equal(rv.statusCode, 200);
  assert.equal((await callTap(core, t3, 'GET', 'Mozilla/5.0')).statusCode, 404);
  assert.equal((await call(core, 'post', E + '/coins/:slot/regenerate', { params: { slot: '3' }, body: {}, headers: { 'x-yn-emergency': await sec() } })).statusCode, 409);
  // an init session can never be used to revoke
  const init = (await stepUp(core, auth, 'init', 4)).body.sessionToken;
  assert.equal((await call(core, 'post', E + '/coins/:slot/revoke', { params: { slot: '4' }, body: {}, headers: { 'x-yn-emergency': init } })).statusCode, 401);
});

it('overview and audit expose no secrets; audit chain is intact', async () => {
  const { core, auth } = setup();
  await withCodes(core, auth);
  const { a } = await activate(core, auth, 1);
  const ov = await call(core, 'get', A + '/overview');
  assert.equal(ov.statusCode, 200); assert.equal(ov.body.coins.length, 5); assert.equal(ov.body.coins[0].status, 'active'); assert.equal(ov.body.passkeys, 1);
  const au = await call(core, 'get', A + '/audit');
  assert.ok(au.body.entries.some(e => e.action === 'coin.activate' && e.result === 'ok'));
  const all = JSON.stringify([ov.body, au.body]);
  assert.ok(!all.includes(tokenOf(a.body.url)) && !/hmac/i.test(all));
  assert.equal(pg.run(`select bool_and(prev_hash is not distinct from lag_h)::text from (select prev_hash, lag(row_hash) over (order by id) lag_h from yn_core_audit_log) t`), 'true');
  assert.throws(() => pg.run(`delete from yn_core_audit_log`), /append-only/);
});

it('cannot remove the only passkey; removing another needs a step-up', async () => {
  const { core, auth } = setup();
  await withCodes(core, auth);
  const id = (await call(core, 'get', A + '/passkeys')).body.passkeys[0].id;
  const s = await stepUp(core, auth, 'security');
  assert.equal((await call(core, 'post', A + '/passkeys/:id/delete', { params: { id }, headers: { 'x-yn-emergency': s.body.sessionToken } })).statusCode, 409);
  const phone = makeAuthenticator({ rpId: RP, origin: ORIGIN });
  const s2 = await stepUp(core, auth, 'security');
  assert.equal((await enroll(core, phone, { session: s2.body.sessionToken })).statusCode, 201);
  assert.equal((await call(core, 'post', A + '/passkeys/:id/delete', { params: { id } })).statusCode, 401);   // no step-up
  const s3 = await stepUp(core, auth, 'security');
  assert.equal((await call(core, 'post', A + '/passkeys/:id/delete', { params: { id }, headers: { 'x-yn-emergency': s3.body.sessionToken } })).statusCode, 200);
  assert.equal((await call(core, 'get', A + '/passkeys')).body.passkeys.length, 1);
});

it('recovery: passkey + offline code + cooling-off delay reopens YN EMERGENCY for a short window', async () => {
  const { core, auth, notes } = setup();
  const codes = await withCodes(core, auth);
  for (let slot = 1; slot <= 5; slot++) await activate(core, auth, slot);
  const startWith = async code => {
    const o = await call(core, 'post', E + '/auth/options', { body: { purpose: 'recover' } });
    assert.equal(o.statusCode, 200);
    return call(core, 'post', E + '/recovery/start', { body: { challengeId: o.body.challengeId, credential: auth.get(o.body.publicKey), code } });
  };
  const openNow = async () => {
    const o = await call(core, 'post', E + '/auth/options', { body: { purpose: 'recover_open' } });
    return call(core, 'post', E + '/recovery/open', { body: { challengeId: o.body.challengeId, credential: auth.get(o.body.publicKey) } });
  };
  assert.equal((await startWith('AAAAA-AAAAA-AAAAA-AAAAA')).statusCode, 401);                // wrong code
  assert.equal((await openNow()).statusCode, 403);                                           // nothing started
  const ok = await startWith(codes[0].toLowerCase());
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
  assert.ok(notes.some(n => /recovery requested/i.test(n[0])));
  assert.equal((await startWith(codes[1])).statusCode, 409);                                 // one request at a time
  assert.equal((await openNow()).statusCode, 403);                                           // cooling-off delay still running
  assert.equal((await startWith(codes[0])).statusCode, 409);
  // the owner can cancel from any admin session
  assert.equal((await call(core, 'post', A + '/recovery/cancel')).body.cancelled, 1);
  assert.equal((await openNow()).statusCode, 403);
  const again = await startWith(codes[2]); assert.equal(again.statusCode, 200);
  assert.equal((await startWith(codes[0])).statusCode, 409);                                 // used codes stay dead
  pg.run(`update yn_core_recovery_requests set ready_at = now() - interval '1 second' where status='pending'`);
  const opened = await openNow();
  assert.equal(opened.statusCode, 200, JSON.stringify(opened.body));
  const gate = mkRes(); let next = false; await core.pageGate({ method: 'GET', path: '/' }, gate, () => { next = true; });
  assert.equal(next, true);                                                                  // the page is back during the window
  // revoke coin 3, then re-initialize it inside the window; the 5th active coin re-locks everything
  const sec = (await stepUp(core, auth, 'coin_security', 3)).body.sessionToken;
  assert.equal((await call(core, 'post', E + '/coins/:slot/revoke', { params: { slot: '3' }, body: {}, headers: { 'x-yn-emergency': sec } })).statusCode, 200);
  const { a } = await activate(core, auth, 3);
  assert.equal(a.statusCode, 200); assert.equal(a.body.finalLock, true);
  const g2 = mkRes(); let n2 = false; await core.pageGate({ method: 'GET', path: '/' }, g2, () => { n2 = true; });
  assert.equal(n2, false); assert.equal(g2.statusCode, 404);
  assert.equal(pg.run(`select (recovery_window_until is null)::text from yn_core_state`), 'true');
  // an expired window locks again by itself
  pg.run(`update yn_core_state set init_locked = true, recovery_window_until = now() - interval '1 minute'`);
  const g3 = mkRes(); let n3 = false; await core.pageGate({ method: 'GET', path: '/' }, g3, () => { n3 = true; });
  assert.equal(n3, false);
});

it('housekeeping removes old data and ends expired grace tokens', async () => {
  const { core, auth } = setup();
  await withCodes(core, auth);
  await activate(core, auth, 1);
  pg.run(`insert into yn_core_tap_events (ts, slot, outcome) values (now() - interval '100 days', 1, 'redirected'), (now(), 1, 'redirected')`);
  await pg.sb('rpc/yn_core_housekeeping', { method: 'POST', body: '{}' });
  assert.equal(pg.run(`select count(*) from yn_core_tap_events`), '1');
  assert.ok(core);
});
