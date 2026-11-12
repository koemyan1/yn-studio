// Paid software downloads: the browser cannot set a price, nobody downloads before paying, the file location stays private.
// Runs with no network and no database: node --test tests/software-shop.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createSoftwareShop, swNo, STALE_MS } from '../server/softwareShop.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const quiet = { warn() {}, error() {}, log() {} };
const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222';
const F1 = '00000000-0000-4000-8000-000000000001', F2 = '00000000-0000-4000-8000-000000000002', F_OFF = '00000000-0000-4000-8000-000000000003';

function makeShop(over = {}) {
  const db = {
    files: [
      { id: F1, title_en: 'Photo Editor', price: 1, file_name: 'editor-setup.exe', enabled: true },
      { id: F2, title_en: 'Big Tool', price: 1, file_name: 'tool.zip', enabled: true },
      { id: F_OFF, title_en: 'Hidden', price: 1, file_name: 'x.zip', enabled: false },
    ],
    sources: { [F1]: { kind: 'upload', file_path: `${F1}/aaaaaaaa-aaaa-4aaa-8aaa-000000000001-editor.exe`, external_url: null }, [F2]: { kind: 'link', file_path: null, external_url: 'https://drive.example.com/file/abc' } },
    purchases: [], notified: [], bakongOn: true, paid: new Set(), signed: [],
  };
  const handlers = {};
  const app = { post: (p, _mw, h) => { handlers[p] = h; } };
  const parseQ = q => Object.fromEntries(q.split('&').map(x => { const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1)]; }));
  const match = (o, f) => Object.entries(f).every(([k, v]) => {
    if (['select', 'order', 'limit'].includes(k)) return true;
    if (v.startsWith('eq.')) return String(o[k]) === v.slice(3);
    if (v.startsWith('gte.')) return o[k] >= v.slice(4);
    if (v.startsWith('lt.')) return o[k] < v.slice(3);
    return true;
  });
  const sb = async (pq, init = {}) => {
    const [table, query = ''] = pq.split('?'); const f = parseQ(query); const method = init.method || 'GET';
    if (table === 'software_files') return db.files.filter(x => match(x, f));
    if (table === 'software_sources') return Object.entries(db.sources).filter(([id]) => f.file_id === 'eq.' + id).map(([file_id, s]) => ({ file_id, ...s }));
    if (table === 'software_purchases') {
      if (method === 'POST') {
        const row = { id: `99999999-9999-4999-8999-${String(db.purchases.length + 1).padStart(12, '0')}`, created_at: new Date(over.now?.() ?? Date.now()).toISOString(), status: 'awaiting_payment', bakong_md5s: [], download_count: 0, ...JSON.parse(init.body) };
        db.posted = JSON.parse(init.body); db.purchases.push(row); return [row];
      }
      const rows = db.purchases.filter(o => match(o, f)).sort((a, b) => b.created_at.localeCompare(a.created_at));
      if (method === 'PATCH') { const patch = JSON.parse(init.body); rows.forEach(r => Object.assign(r, patch)); return init.headers?.Prefer?.includes('representation') ? rows : null; }
      return rows;
    }
    return [];
  };
  const tokens = { u1: { id: U1 }, u2: { id: U2 } };
  const deps = {
    app, sb, SB: { url: 'https://sb.test', service: 'svc', anon: 'anon' }, BK: { currency: 'USD', name: 'YN Studio' },
    userFromToken: async req => tokens[(req.get('authorization') || '').replace('Bearer ', '')] || null,
    shield: { userLimited: () => false }, limited: () => false, bakongEnabled: () => db.bakongOn,
    makeBakongQr: async o => ({ md5: 'md5-' + o.id + '-' + Math.random(), image: 'data:image/png;base64,AA', amount: Number(o.total), expiresAt: Date.now() + 600000 }),
    findBakongPayment: async md5s => ((md5s || []).some(m => db.paid.has(m.split('-').slice(1, 6).join('-'))) ? { hash: 'hash-' + md5s.at(-1) } : null),
    bakongDelayed: () => false, notifyAdmin: async (...a) => { db.notified.push(a); }, jsonBody: (_q, _r, n) => n(), log: quiet,
    signUrl: async (p, name) => { db.signed.push([p, name]); return 'https://sb.test/storage/v1/object/sign/software-files/x?token=t&download=' + name; }, now: over.now,
  };
  const shop = createSoftwareShop(deps);
  const call = async (route, body, token = 'u1') => {
    const out = {}; const req = { body, get: h => (h.toLowerCase() === 'authorization' && token ? 'Bearer ' + token : '') };
    const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; out.status ||= 200; return this; } };
    await handlers[route](req, res); return out;
  };
  return { db, shop, call };
}
const payFor = (db, i = 0) => db.paid.add(db.purchases[i].id);

test('buy: the price comes from the database ($1), never from the browser', async () => {
  const { call, db } = makeShop();
  const r = await call('/api/software/buy', { file_id: F1, price: 0.01, total: 0.01, amount: 0.01, user_id: U2, status: 'paid' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.amount, 1); assert.equal(r.body.total, 1);
  assert.equal(db.posted.price, 1); assert.equal(db.posted.user_id, U1);
  for (const k of ['status', 'paid_at', 'bakong_hash', 'bakong_md5s']) assert.equal(k in db.posted, false, k + ' must not come from the browser');
  assert.equal(db.purchases[0].status, 'awaiting_payment');
  assert.match(swNo(db.purchases[0].id), /^SW-99999999$/);
});

test('buy: validation, sign-in, switched-off files, Bakong off', async () => {
  const { call, db } = makeShop();
  assert.equal((await call('/api/software/buy', { file_id: F1 }, null)).status, 401);
  assert.equal((await call('/api/software/buy', { file_id: 'nope' })).status, 400);
  assert.equal((await call('/api/software/buy', { file_id: '../x' })).status, 400);
  assert.equal((await call('/api/software/buy', {})).status, 400);
  assert.equal((await call('/api/software/buy', { file_id: F_OFF })).status, 404);               // switched off = does not exist
  assert.equal((await call('/api/software/buy', { file_id: '00000000-0000-4000-8000-0000000000ff' })).status, 404);
  assert.equal(db.purchases.length, 0);
  db.bakongOn = false;
  const r = await call('/api/software/buy', { file_id: F1 });
  assert.equal(r.status, 503); assert.equal(r.body.code, 'no_bakong');
});

test('NO DOWNLOAD BEFORE PAYING, and the file location is never in any answer', async () => {
  const { call, db } = makeShop();
  assert.equal((await call('/api/software/download', { file_id: F1 })).status, 402);              // never bought
  const b = await call('/api/software/buy', { file_id: F1 });
  assert.doesNotMatch(JSON.stringify(b.body), /editor\.exe|drive\.example|file_path|external_url/);
  const d = await call('/api/software/download', { file_id: F1 });
  assert.equal(d.status, 402); assert.equal(d.body.code, 'unpaid');                               // bought but not paid
  assert.equal(db.signed.length, 0);
  assert.equal((await call('/api/software/download', { file_id: F1 }, null)).status, 401);
});

test('payment: marked paid only when Bakong confirms, exactly once, admin told once', async () => {
  const { call, db } = makeShop();
  await call('/api/software/buy', { file_id: F1 });
  let s = await call('/api/software/status', { file_id: F1 });
  assert.deepEqual(s.body, { paid: false, delayed: false }); assert.equal(db.purchases[0].status, 'awaiting_payment');
  payFor(db);
  s = await call('/api/software/status', { file_id: F1 });
  assert.equal(s.body.paid, true);
  assert.equal(db.purchases[0].status, 'paid'); assert.equal(db.purchases[0].payment_method, 'Bakong KHQR'); assert.ok(db.purchases[0].paid_at);
  assert.equal(db.notified.length, 1); assert.match(db.notified[0][0], /Software sold/);
  s = await call('/api/software/status', { file_id: F1 });
  assert.equal(s.body.paid, true); assert.equal(db.notified.length, 1);
  assert.deepEqual((await call('/api/software/buy', { file_id: F1 })).body, { paid: true });      // already owned: no second charge
  assert.equal(db.purchases.length, 1);
});

test('after paying: download works again and again, upload gets a signed link, link files get the admin link', async () => {
  const { call, db } = makeShop();
  await call('/api/software/buy', { file_id: F1 }); payFor(db, 0); await call('/api/software/status', { file_id: F1 });
  const a = await call('/api/software/download', { file_id: F1 });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.match(a.body.url, /^https:\/\/sb\.test\/storage\/v1\/object\/sign\//); assert.equal(a.body.kind, 'upload'); assert.equal(a.body.name, 'editor-setup.exe');
  assert.equal(db.signed[0][0], db.sources[F1].file_path);
  await call('/api/software/download', { file_id: F1 });
  assert.equal(db.purchases[0].download_count, 2);
  await call('/api/software/buy', { file_id: F2 }); payFor(db, 1); await call('/api/software/status', { file_id: F2 });
  const l = await call('/api/software/download', { file_id: F2 });
  assert.equal(l.body.kind, 'link'); assert.equal(l.body.url, 'https://drive.example.com/file/abc');
});

test('ownership: paying for a file does not unlock it for anybody else, or other files', async () => {
  const { call, db } = makeShop();
  await call('/api/software/buy', { file_id: F1 }); payFor(db); await call('/api/software/status', { file_id: F1 });
  assert.equal((await call('/api/software/download', { file_id: F1 }, 'u2')).status, 402);
  assert.equal((await call('/api/software/download', { file_id: F2 })).status, 402);
  assert.equal((await call('/api/software/status', { file_id: F1 }, 'u2')).body.paid, false);
  assert.equal((await call('/api/software/status', { file_id: F1 }, null)).status, 401);
});

test('resume: an unpaid purchase is reused (no duplicates); a changed price makes a new one', async () => {
  const { call, db } = makeShop();
  await call('/api/software/buy', { file_id: F1 });
  const r = await call('/api/software/buy', { file_id: F1 });
  assert.equal(r.status, 200); assert.equal(db.purchases.length, 1); assert.equal(db.purchases[0].bakong_md5s.length, 2);
  db.files[0].price = 2;
  const n = await call('/api/software/buy', { file_id: F1 });
  assert.equal(n.body.amount, 2); assert.equal(db.purchases.length, 2);
});

test('open unpaid purchases are capped per customer', async () => {
  const { call, db } = makeShop();
  for (let i = 0; i < 12; i++) db.files.push({ id: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`, title_en: 'f' + i, price: 1, file_name: 'f', enabled: true });
  let last;
  for (let i = 0; i < 12; i++) last = await call('/api/software/buy', { file_id: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}` });
  assert.equal(last.status, 429);
});

test('48 hours: unpaid purchases are cancelled (not deleted); a late payment is honoured first', async () => {
  let t = Date.now();
  const { call, db, shop } = makeShop({ now: () => t });
  await call('/api/software/buy', { file_id: F1 }); await call('/api/software/buy', { file_id: F2 });
  payFor(db, 1);                                                                                   // F2 was paid just before the deadline
  t += STALE_MS + 60000;
  assert.equal(await shop.sweepStale(true), 1);
  assert.equal(db.purchases[0].status, 'cancelled'); assert.equal(db.purchases[1].status, 'paid'); assert.equal(db.purchases.length, 2);
  const again = await call('/api/software/buy', { file_id: F1 });                                 // a cancelled one never blocks a new try
  assert.equal(again.status, 200); assert.equal(db.purchases.length, 3);
});

test('errors never leak database text', async () => {
  const { call, db } = makeShop();
  const real = db.purchases.push; db.purchases.push = () => { throw new Error('duplicate key value violates unique constraint "secret_table_pkey"'); };
  const r = await call('/api/software/buy', { file_id: F1 });
  db.purchases.push = real;
  assert.equal(r.status, 500); assert.doesNotMatch(JSON.stringify(r.body), /duplicate|constraint|secret_table/);
});

/* ------------------------------------------------------------ the SQL keeps customers away from money and files */
const sql = fs.readFileSync(path.join(root, 'supabase/sql/supabase-software-downloads.sql'), 'utf8');
test('SQL: $1 default, customers cannot write purchases or read file locations', () => {
  assert.match(sql, /price\s+numeric\(10,2\) not null default 1\.00/);
  assert.match(sql, /grant select on public\.software_purchases to authenticated/);
  assert.doesNotMatch(sql, /grant[^;]*(insert|update|delete)[^;]*on public\.software_purchases/i);
  assert.match(sql, /create policy "sw sources admin" on public\.software_sources for all[\s\S]*?yn_svc_is_admin\(\)/);
  assert.doesNotMatch(sql, /grant[^;]*on public\.software_sources[^;]*to[^;]*anon/i);
  assert.match(sql, /values \('software-files', 'software-files', false/);                       // the files bucket is private
  assert.match(sql, /software_purchases_one_paid_uidx[\s\S]*where status = 'paid'/);
  assert.match(sql, /on delete restrict/);                                                         // a file with buyers cannot be deleted
});
test('the pay modal, routes and admin menu are wired', () => {
  const main = fs.readFileSync(path.join(root, 'src/main.tsx'), 'utf8');
  assert.match(main, /\/api\/software\/buy/); assert.match(main, /\/api\/software\/status/);
  assert.match(main, /path="\/services\/software"/); assert.match(main, /path="\/admin\/software"/);
  assert.match(fs.readFileSync(path.join(root, 'server/index.js'), 'utf8'), /softwareShop\.syncForUser/);
});
