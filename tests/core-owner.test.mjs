// YN CORE OWNER tests: who is the "big boss", and who may appoint admins. Run: node --test tests/core-owner.test.mjs
// Real handlers and gate; a small in-memory stand-in for Supabase and a tiny Express-like dispatcher.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createCore } from '../server/core/index.js';
import { newToken } from '../server/core/crypto.js';

const ORIGIN = 'https://ynstudio.site';
const ENV = { YN_CORE: 'on', YN_CORE_PEPPER_CURRENT: 'v1', YN_CORE_PEPPER_V1: 'test-pepper-' + 'p'.repeat(40), PUBLIC_URL: ORIGIN };
const U = n => `00000000-0000-4000-8000-00000000000${n}`;
const OWNER = U(1), ADMIN = U(2), CUSTOMER = U(3), OTHER = U(4), BOSS2 = U(5);

function mkRes() {
  const r = { statusCode: 200, headers: {}, body: undefined,
    setHeader(k, v) { r.headers[k.toLowerCase()] = v; return r; }, getHeader(k) { return r.headers[k.toLowerCase()]; },
    status(n) { r.statusCode = n; return r; }, json(b) { r.body = b; r._done?.(); return r; }, type() { return r; }, send(b) { r.body = b; r._done?.(); return r; }, redirect(c, u) { r.statusCode = c; r.redirectedTo = u; r._done?.(); return r; } };
  return r;
}
function fakeApp() {
  const uses = [], rts = [];
  const reg = m => (p, ...h) => rts.push({ m, p, h });
  return { uses, rts, use: (p, ...mw) => uses.push({ p, mw }), get: reg('GET'), post: reg('POST'), patch: reg('PATCH'), put: reg('PUT'), delete: reg('DELETE') };
}
async function dispatch(app, method, path, { admin, headers = {}, body, query = {} } = {}) {
  const req = { method, path, headers: { host: 'ynstudio.site', ...headers }, body, query, params: {}, sec: { ip: '203.0.113.7' }, admin };
  const res = mkRes(), chain = [];
  for (const u of app.uses) if (path === u.p || path.startsWith(u.p + '/')) chain.push(...u.mw);
  const r = app.rts.find(x => x.m === method && x.p === path);
  if (!r) throw new Error('no route ' + method + ' ' + path);
  chain.push(...r.h);
  let i = 0;
  const next = async () => { const f = chain[i++]; if (f) await f(req, res, next); };
  // Express does not wait for middleware either: the response is "done" when something answers it.
  await new Promise((resolve, reject) => { res._done = resolve; next().then(() => setTimeout(resolve, 50), reject); });
  return res;
}

function setup({ owners = [OWNER], env = {}, tableMissing = false, dbDown = false } = {}) {
  const profiles = new Map([
    [OWNER, { user_id: OWNER, name: 'Boss', email: 'boss@ynstudio.site', role: 'admin' }],
    [ADMIN, { user_id: ADMIN, name: 'Sok', email: 'sok@example.com', role: 'admin' }],
    [CUSTOMER, { user_id: CUSTOMER, name: 'Dara', email: 'dara@example.com', role: 'customer' }],
    [OTHER, { user_id: OTHER, name: 'Vanna', email: 'vanna@example.com', role: 'customer' }],
  ]);
  const db = { audit: [], alerts: [], queries: [], sessions: [], profiles };
  let core;
  const sb = async (q, opts = {}) => {
    db.queries.push(q);
    const method = opts.method || 'GET';
    if (q.startsWith('yn_core_owners')) {
      if (dbDown) throw new Error('Supabase 500: boom');
      if (tableMissing) throw new Error('Supabase 404: {"code":"PGRST205","message":"Could not find the table public.yn_core_owners"}');
      return owners.map(user_id => ({ user_id }));
    }
    if (q.startsWith('rpc/yn_core_audit')) { db.audit.push(JSON.parse(opts.body)); return null; }
    if (q.startsWith('profiles?role=eq.admin')) return [...profiles.values()].filter(p => p.role === 'admin');
    if (q.startsWith('profiles?or=')) { const t = decodeURIComponent(/ilike\.\*(.*?)\*,/.exec(q)[1]).toLowerCase(); return [...profiles.values()].filter(p => (p.email + p.name).toLowerCase().includes(t)); }
    if (q.startsWith('profiles?user_id=eq.') && method === 'GET') return [profiles.get(/user_id=eq\.([0-9a-f-]+)/.exec(q)[1])].filter(Boolean);
    if (q.startsWith('profiles?user_id=eq.') && method === 'PATCH') {
      const id = /user_id=eq\.([0-9a-f-]+)/.exec(q)[1], role = /role=eq\.(\w+)/.exec(q)?.[1], p = profiles.get(id);
      if (!p || (role && p.role !== role)) return [];
      Object.assign(p, JSON.parse(opts.body)); return [p];
    }
    if (q.startsWith('yn_core_emergency_sessions?') && method === 'PATCH') {
      const h = /session_hmac=eq\.([0-9a-f]+)/.exec(q)[1], uid = /user_id=eq\.([0-9a-f-]+)/.exec(q)[1], scope = /scope=eq\.(\w+)/.exec(q)[1];
      const s = db.sessions.find(x => x.hmac === h && x.uid === uid && x.scope === scope && !x.used);
      if (!s) return []; s.used = true; return [s];
    }
    throw new Error('unexpected db call: ' + q);
  };
  core = createCore({ sb, env: { ...ENV, ...env }, now: Date.now, notify: (t, m) => db.alerts.push({ t, m }),
    requireAdmin: async (req) => req.admin, shield: { strike() {}, limiter: () => (_q, _s, n) => n() }, log: { error() {}, warn() {} } });
  const app = fakeApp();
  core.mount(app, { json: (_q, _s, n) => n(), express: null });
  const faceId = uid => { const token = newToken(); db.sessions.push({ hmac: core.keyring.current('session', token), uid, scope: 'security', used: false }); return token; };
  const call = (method, path, as, extra = {}) => dispatch(app, method, path, { admin: as ? { id: as } : undefined, ...extra });
  return { core, db, call, faceId, app };
}

test('an owner sees the admin list; a normal admin gets a plain 404 on every owner-only door', async () => {
  const s = setup();
  const o = await s.call('GET', '/api/admin/owner/overview', OWNER);
  assert.equal(o.statusCode, 200); assert.equal(o.body.owner, true);
  assert.deepEqual(o.body.admins.map(a => a.userId).sort(), [OWNER, ADMIN].sort());
  assert.equal(o.body.admins.find(a => a.userId === OWNER).isOwner, true);
  for (const [m, p] of [['GET', '/api/admin/owner/overview'], ['GET', '/api/admin/core/overview'], ['GET', '/api/admin/core/audit'], ['POST', '/api/admin/owner/grant']]) {
    const r = await s.call(m, p, ADMIN, { body: { user_id: CUSTOMER } });
    assert.equal(r.statusCode, 404, m + ' ' + p); assert.equal(r.body.error, 'Not found');
  }
  const me = await s.call('GET', '/api/admin/me-owner', ADMIN);
  assert.deepEqual(me.body, { owner: false, bootstrap: false });
  assert.equal((await s.call('GET', '/api/admin/me-owner', OWNER)).body.owner, true);
});

test('YN EMERGENCY also refuses an appointed admin', async () => {
  const s = setup();
  const r = await s.call('GET', '/api/emergency/state', ADMIN);
  assert.equal(r.statusCode, 404);
});

test('making someone admin needs the owner AND a fresh Face ID session, used once', async () => {
  const s = setup();
  const noFaceId = await s.call('POST', '/api/admin/owner/grant', OWNER, { body: { user_id: CUSTOMER } });
  assert.equal(noFaceId.statusCode, 401); assert.equal(noFaceId.body.code, 'step_up');
  assert.equal(s.db.profiles.get(CUSTOMER).role, 'customer');

  const t = s.faceId(OWNER);
  const ok = await s.call('POST', '/api/admin/owner/grant', OWNER, { body: { user_id: CUSTOMER }, headers: { 'x-yn-emergency': t } });
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
  assert.equal(s.db.profiles.get(CUSTOMER).role, 'admin');
  assert.ok(s.db.audit.some(a => a.p_action === 'admin.grant' && a.p_result === 'ok' && a.p_details.target === CUSTOMER));
  assert.ok(s.db.alerts.some(a => /admin appointed/.test(a.t)));

  // the same Face ID session cannot approve a second change
  const again = await s.call('POST', '/api/admin/owner/grant', OWNER, { body: { user_id: OTHER }, headers: { 'x-yn-emergency': t } });
  assert.equal(again.statusCode, 401);
  assert.equal(s.db.profiles.get(OTHER).role, 'customer');
});

test('a Face ID session that belongs to somebody else is useless', async () => {
  const s = setup();
  const t = s.faceId(ADMIN);
  const r = await s.call('POST', '/api/admin/owner/grant', OWNER, { body: { user_id: CUSTOMER }, headers: { 'x-yn-emergency': t } });
  assert.equal(r.statusCode, 401); assert.equal(s.db.profiles.get(CUSTOMER).role, 'customer');
});

test('bad targets are refused before the Face ID session is spent', async () => {
  const s = setup({ owners: [OWNER, BOSS2] });
  const t = s.faceId(OWNER);
  const h = { 'x-yn-emergency': t };
  assert.equal((await s.call('POST', '/api/admin/owner/grant', OWNER, { body: { user_id: 'nope' }, headers: h })).statusCode, 400);
  assert.equal((await s.call('POST', '/api/admin/owner/grant', OWNER, { body: { user_id: ADMIN }, headers: h })).statusCode, 409);       // already admin
  assert.equal((await s.call('POST', '/api/admin/owner/grant', OWNER, { body: { user_id: U(9) }, headers: h })).statusCode, 404);        // no such account
  assert.equal((await s.call('POST', '/api/admin/owner/revoke', OWNER, { body: { user_id: BOSS2 }, headers: h })).statusCode, 409);      // owners cannot be touched here
  assert.equal((await s.call('POST', '/api/admin/owner/revoke', OWNER, { body: { user_id: OWNER }, headers: h })).statusCode, 409);      // not even yourself
  assert.equal((await s.call('POST', '/api/admin/owner/revoke', OWNER, { body: { user_id: CUSTOMER }, headers: h })).statusCode, 409);   // not an admin
  assert.equal(s.db.sessions[0].used, false, 'session still unused');
});

test('removing an admin works the same way and is audited', async () => {
  const s = setup();
  const r = await s.call('POST', '/api/admin/owner/revoke', OWNER, { body: { user_id: ADMIN }, headers: { 'x-yn-emergency': s.faceId(OWNER) } });
  assert.equal(r.statusCode, 200); assert.equal(s.db.profiles.get(ADMIN).role, 'customer');
  assert.ok(s.db.audit.some(a => a.p_action === 'admin.revoke'));
  // the removed admin now sees nothing owner-only (and was never allowed to anyway)
  assert.equal((await s.call('GET', '/api/admin/owner/overview', ADMIN)).statusCode, 404);
});

test('search finds accounts, strips query tricks, and is owner only', async () => {
  const s = setup();
  const r = await s.call('GET', '/api/admin/owner/search', OWNER, { query: { q: 'dara' } });
  assert.deepEqual(r.body.results.map(x => x.userId), [CUSTOMER]);
  await s.call('GET', '/api/admin/owner/search', OWNER, { query: { q: 'x),role.eq.admin,(y' } });
  const q = s.db.queries.filter(x => x.startsWith('profiles?or=')).pop();
  const group = /or=\((.*)\)&select/.exec(q)[1];
  assert.equal(group.split(',').length, 2, 'only the two intended filters, no injected extra one: ' + group);   // the leftover text is just part of the search word
  assert.ok(!/[()]/.test(group.replace(/^email\.ilike\.\*|\*,name\.ilike\.\*|\*$/g, '')), 'no brackets survive');
  assert.equal((await s.call('GET', '/api/admin/owner/search', ADMIN, { query: { q: 'dara' } })).statusCode, 404);
  assert.deepEqual((await s.call('GET', '/api/admin/owner/search', OWNER, { query: { q: 'd' } })).body.results, []);
});

test('no owner yet (empty table): YN CORE keeps working for admins, but nobody can appoint', async () => {
  const s = setup({ owners: [] });
  const me = await s.call('GET', '/api/admin/me-owner', ADMIN);
  assert.deepEqual(me.body, { owner: false, bootstrap: true });
  const ov = await s.call('GET', '/api/admin/owner/overview', ADMIN);
  assert.equal(ov.statusCode, 200); assert.equal(ov.body.bootstrap, true);
  const g = await s.call('POST', '/api/admin/owner/grant', ADMIN, { body: { user_id: CUSTOMER }, headers: { 'x-yn-emergency': s.faceId(ADMIN) } });
  assert.equal(g.statusCode, 409); assert.equal(g.body.code, 'no_owner');
  assert.equal(s.db.profiles.get(CUSTOMER).role, 'customer');
});

test('owner table not created yet behaves like "no owner yet", and says so', async () => {
  const s = setup({ tableMissing: true });
  const ov = await s.call('GET', '/api/admin/owner/overview', ADMIN);
  assert.equal(ov.statusCode, 200); assert.equal(ov.body.tableMissing, true);
});

test('a database error fails closed: nobody gets in', async () => {
  const s = setup({ dbDown: true });
  const r = await s.call('GET', '/api/admin/owner/overview', OWNER);
  assert.equal(r.statusCode, 503);
  assert.equal((await s.call('GET', '/api/admin/core/overview', OWNER)).statusCode, 503);
});

test('signed-out callers are refused', async () => {
  const s = setup();
  assert.equal((await s.call('GET', '/api/admin/owner/overview', null)).statusCode, 401);
});

test('gate scope: by default the ritual guards only the owner areas; scope=all guards the whole admin', async () => {
  const mk = scope => setup({ env: { YN_CORE_GATE: 'on', ...(scope ? { YN_CORE_GATE_SCOPE: scope } : {}) } }).core.guard;
  const run = (guard, path, method = 'GET') => { let nexted = false; const res = mkRes(); guard({ method, path, headers: {} }, res, () => { nexted = true; }); return { nexted, res }; };
  const d = mk();
  assert.ok(run(d, '/admin/orders').nexted); assert.ok(run(d, '/api/admin/orders').nexted); assert.ok(run(d, '/api/admin/me-owner').nexted);
  assert.equal(run(d, '/admin/owner').res.statusCode, 404); assert.equal(run(d, '/admin/core/security').res.statusCode, 404);
  assert.equal(run(d, '/api/admin/owner/grant', 'POST').res.statusCode, 403); assert.equal(run(d, '/api/admin/core/overview').res.body.code, 'gate_locked');
  assert.ok(run(d, '/admin/emergency').nexted);
  const a = mk('all');
  assert.equal(run(a, '/admin/orders').res.statusCode, 404); assert.equal(run(a, '/api/admin/orders').res.statusCode, 403);
  assert.ok(run(a, '/admin/emergency/recover').nexted);
});
