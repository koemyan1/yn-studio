// Pay-first services: price maths, ownership, and "the browser can never set a price".
// Runs with no network and no database: node --test tests/service-shop.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { computeQuote, calcDeliveryFee, toCents, cleanPhone, MAX_DELIVERY_KM } from '../shared/serviceMath.js';
import { createServiceShop, parseOrderBody, STALE_MS, svcNo } from '../server/serviceShop.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const quiet = { warn() {}, error() {}, log() {} };

/* ------------------------------------------------------------ catalog fixture */
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SERVICE = { key: 'print', kind: 'physical', name_en: 'Printing', name_km: 'x' };
const PRICES = [
  { id: id(1), label_en: 'Black and white, per page', label_km: '', amount: 0.05, unit: 'page', enabled: true },
  { id: id(2), label_en: 'Colour, per page', label_km: '', amount: 0.25, unit: 'page', enabled: true },
];
const G_PAGES = id(10), G_COPIES = id(11), G_SIZE = id(12), G_PAPER = id(13), G_NOTE = id(14), G_FORMAT = id(15), G_REV = id(16);
const O_A4 = id(20), O_A3 = id(21), O_PLAIN = id(22), O_PHOTO = id(23), O_F1 = id(24), O_F2 = id(25), O_REV = id(26);
const GROUPS = [
  { id: G_PAGES, label_en: 'Pages', label_km: '', type: 'number', required: true, is_quantity: true, min_value: 1, max_value: 500, enabled: true, options: [] },
  { id: G_COPIES, label_en: 'Copies', label_km: '', type: 'number', required: true, is_quantity: true, min_value: 1, max_value: 100, enabled: true, options: [] },
  { id: G_SIZE, label_en: 'Paper size', label_km: '', type: 'single', required: true, enabled: true, options: [
    { id: O_A4, label_en: 'A4', label_km: '', price_type: 'fixed', price: 0, enabled: true },
    { id: O_A3, label_en: 'A3', label_km: '', price_type: 'percent', price: 100, enabled: true }] },
  { id: G_PAPER, label_en: 'Paper type', label_km: '', type: 'single', required: false, enabled: true, options: [
    { id: O_PLAIN, label_en: 'Plain', label_km: '', price_type: 'fixed', price: 0, enabled: true },
    { id: O_PHOTO, label_en: 'Photo', label_km: '', price_type: 'per_unit', price: 0.15, enabled: true }] },
  { id: G_NOTE, label_en: 'Text', label_km: '', type: 'text', required: false, enabled: true, options: [] },
  { id: G_FORMAT, label_en: 'Format', label_km: '', type: 'multi', required: false, enabled: true, options: [
    { id: O_F1, label_en: 'PNG', label_km: '', price_type: 'fixed', price: 0, enabled: true },
    { id: O_F2, label_en: 'Source', label_km: '', price_type: 'fixed', price: 5, enabled: true }] },
  { id: G_REV, label_en: 'Extra revisions', label_km: '', type: 'number', required: false, is_quantity: false, min_value: 0, max_value: 5, enabled: true, options: [
    { id: O_REV, label_en: 'Per revision', label_km: '', price_type: 'fixed', price: 2, enabled: true }] },
];
const CFG = { base_fee: 1, base_km: 2, extra_fee: 0.5, extra_km: 1, store_lat: 11.5564, store_lng: 104.9282 };
const NEAR = { lat: 11.5764, lng: 104.9282 };     // about 2.2 km north of the store
const base = over => ({ service: SERVICE, prices: PRICES, groups: GROUPS, fulfilment: 'pickup', deliveryCfg: CFG, ...over });
const sel = (groups = {}, extra = {}) => ({ price_id: id(1), groups: { [G_PAGES]: 10, [G_COPIES]: 3, [G_SIZE]: O_A4, ...groups }, ...extra });

/* ------------------------------------------------------------ price maths */
test('price: base x pages x copies, A4 adds nothing', () => {
  const r = computeQuote(base({ selection: sel() }));
  assert.equal(r.ok, true);
  assert.equal(r.quote.quantity, 30);
  assert.equal(r.quote.base, 1.5);
  assert.equal(r.quote.total, 1.5);
});
test('price: percent applies to the base only, per-unit x quantity, fixed once', () => {
  const r = computeQuote(base({ selection: sel({ [G_SIZE]: O_A3, [G_PAPER]: O_PHOTO }) }));
  assert.equal(r.quote.base, 1.5);
  assert.equal(r.quote.extras, 1.5 + 4.5);           // A3 +100% of 1.50, photo paper 0.15 x 30
  assert.equal(r.quote.total, 7.5);
  const f = computeQuote(base({ prices: [{ ...PRICES[0], unit: 'job', amount: 10 }], selection: sel({ [G_FORMAT]: [O_F1, O_F2] }) }));
  assert.equal(f.quote.base, 10);                    // unit "job" is not multiplied by quantity
  assert.equal(f.quote.total, 15);                   // the +5 option is charged once
});
test('price: a number group with an option charges option x number', () => {
  const r = computeQuote(base({ selection: sel({ [G_REV]: 3 }) }));
  assert.equal(r.quote.extras, 6);
  assert.equal(r.quote.quantity, 30);                // revisions are not a quantity group
});
test('price: money is exact (no floating point drift)', () => {
  const r = computeQuote(base({ prices: [{ ...PRICES[0], amount: 0.1 }], selection: sel({ [G_PAGES]: 3, [G_COPIES]: 1 }) }));
  assert.equal(r.quote.total, 0.3);
  assert.equal(toCents(0.29), 29);
  assert.equal(toCents(1.005 * 100 / 100), 101);     // rounds half up on the cent
});
test('price: disabled prices and options do not exist', () => {
  const off = PRICES.map((p, i) => (i === 0 ? { ...p, enabled: false } : p));
  assert.equal(computeQuote(base({ prices: off, selection: sel() })).code, 'bad_price');
  const groups = GROUPS.map(g => (g.id === G_SIZE ? { ...g, options: g.options.map(o => (o.id === O_A3 ? { ...o, enabled: false } : o)) } : g));
  assert.equal(computeQuote(base({ groups, selection: sel({ [G_SIZE]: O_A3 }) })).code, 'bad_option');
});
test('validation: required, ranges, unknown ids, duplicates, wrong types', () => {
  const bad = (s, code) => assert.equal(computeQuote(base({ selection: s })).code, code, JSON.stringify(s));
  bad({ price_id: id(1), groups: { [G_COPIES]: 1, [G_SIZE]: O_A4 } }, 'missing');           // pages missing
  bad(sel({ [G_PAGES]: 0 }), 'bad_number');
  bad(sel({ [G_PAGES]: 501 }), 'bad_number');
  bad(sel({ [G_PAGES]: 1.5 }), 'bad_number');
  bad(sel({ [G_PAGES]: '10' }), 'bad_number');
  bad(sel({ [G_SIZE]: id(99) }), 'bad_option');                  // an option id that is not in this service
  bad(sel({ [G_SIZE]: [O_A4] }), 'bad_option');                  // array for a single choice
  bad(sel({ [G_FORMAT]: [O_F1, O_F1] }), 'bad_option');          // duplicate
  bad(sel({ [id(98)]: 'x' }), 'bad_group');                      // question from another service
  bad({ ...sel(), price_id: id(77) }, 'bad_price');
  bad({ ...sel(), quantity: 0 }, 'bad_quantity');
  bad({ ...sel(), quantity: 1001 }, 'bad_quantity');
  bad({ ...sel(), quantity: 2.5 }, 'bad_quantity');
  bad(sel({ [G_PAGES]: 500, [G_COPIES]: 100 }, { quantity: 1000 }), 'too_big');             // 50,000,000 units
  assert.equal(computeQuote(base({ selection: { ...sel(), groups: JSON.parse('{"__proto__":1}') } })).code, 'bad_group');
});
test('fulfilment: print needs pick up or delivery, design is always digital', () => {
  assert.equal(computeQuote(base({ fulfilment: undefined, selection: sel() })).code, 'bad_fulfilment');
  assert.equal(computeQuote(base({ fulfilment: 'teleport', selection: sel() })).code, 'bad_fulfilment');
  const d = computeQuote({ service: { key: 'logo', kind: 'digital' }, prices: [{ ...PRICES[0], unit: 'job', amount: 25 }], groups: [], selection: { price_id: id(1), groups: {} }, fulfilment: 'delivery', deliveryCfg: CFG, deliveryPoint: NEAR });
  assert.equal(d.ok, false);
  const ok = computeQuote({ service: { key: 'logo', kind: 'digital' }, prices: [{ ...PRICES[0], unit: 'job', amount: 25 }], groups: [], selection: { price_id: id(1), groups: {} }, deliveryCfg: CFG, deliveryPoint: NEAR });
  assert.equal(ok.quote.fulfilment, 'digital'); assert.equal(ok.quote.delivery_fee, 0); assert.equal(ok.quote.total, 25);
});
test('delivery: fee comes from the admin settings and the pin is range checked', () => {
  const r = computeQuote(base({ fulfilment: 'delivery', deliveryPoint: NEAR, selection: sel() }));
  const fee = calcDeliveryFee(CFG, { lat: CFG.store_lat, lng: CFG.store_lng }, NEAR).fee;
  assert.equal(r.quote.delivery_fee, fee); assert.equal(r.quote.total, 1.5 + fee);
  assert.ok(r.quote.distance_km > 2 && r.quote.distance_km < 2.5);
  const code = pt => computeQuote(base({ fulfilment: 'delivery', deliveryPoint: pt, selection: sel() })).code;
  assert.equal(code(null), 'bad_location');
  assert.equal(code({ lat: 91, lng: 104 }), 'bad_location');
  assert.equal(code({ lat: 11, lng: '104' }), 'bad_location');
  assert.equal(code({ lat: NaN, lng: 104 }), 'bad_location');
  assert.equal(code({ lat: 1.35, lng: 103.82 }), 'too_far');       // Singapore
  const far = computeQuote(base({ fulfilment: 'delivery', deliveryPoint: { lat: 11.9, lng: 104.9 }, selection: sel() }));  // ~38 km: just outside Phnom Penh is allowed
  assert.equal(far.ok, true); assert.ok(far.quote.distance_km < MAX_DELIVERY_KM);
});
test('delivery fee rule is identical to calcFee in src/deliveryFee.ts', async () => {
  const ts = fs.readFileSync(path.join(root, 'src/deliveryFee.ts'), 'utf8')
    .replace(/export type Pt = \{[^}]*\};/, '').replace(/: Pt/g, '').replace(/: any/g, '').replace(/: number/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const m = await import('data:text/javascript;base64,' + Buffer.from(ts).toString('base64'));
  const store = { lat: 11.5564, lng: 104.9282 };
  for (const cfg of [CFG, { base_fee: 2, base_km: 1, extra_fee: 0.25, extra_km: 0.5 }, {}, { extra_km: 0 }]) {
    for (const to of [{ lat: 11.5564, lng: 104.9282 }, NEAR, { lat: 11.62, lng: 105.01 }, { lat: 11.9, lng: 104.9 }]) {
      assert.deepEqual(calcDeliveryFee({ ...CFG, ...cfg }, store, to), m.calcFee({ ...CFG, ...cfg }, store, to));
    }
  }
});
test('phone numbers', () => {
  assert.equal(cleanPhone('012 345 678'), '012 345 678');
  assert.equal(cleanPhone('+855 12 345 678'), '+855 12 345 678');
  for (const bad of ['', 'abc', '123', '<script>', '0123456789012345678', '012-345-678; drop']) assert.equal(cleanPhone(bad), '', bad);
});

/* ------------------------------------------------------------ routes with a fake database */
const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222';
const fid = (user, n = 1) => `${user}/aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}-scan.pdf`;

function makeShop(over = {}) {
  const db = { orders: [], notified: [], bakongOn: true, paid: new Set(), files: {}, patches: [] };
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
    if (table === 'service_catalog') return f.key === 'eq.print' ? [SERVICE] : f.key === 'eq.logo' ? [{ key: 'logo', kind: 'digital', name_en: 'Logo' }] : [];
    if (table === 'service_prices') return f.service_key === 'eq.logo' ? [{ id: id(50), label_en: 'Logo', label_km: '', amount: 25, unit: 'job', enabled: true }] : PRICES;
    if (table === 'service_option_groups') return f.service_key === 'eq.logo' ? [] : GROUPS.map(g => ({ ...g, service_options: g.options, options: undefined }));
    if (table === 'delivery_settings') return [CFG];
    if (table === 'service_orders') {
      if (method === 'POST') { const row = { id: `99999999-9999-4999-8999-${String(db.orders.length + 1).padStart(12, '0')}`, created_at: new Date(over.now?.() ?? Date.now()).toISOString(), status: 'awaiting_payment', payment_status: 'unpaid', bakong_md5s: [], ...JSON.parse(init.body) }; db.posted = JSON.parse(init.body); db.orders.push(row); return [row]; }
      const rows = db.orders.filter(o => match(o, f));
      if (method === 'PATCH') { const patch = JSON.parse(init.body); db.patches.push(patch); rows.forEach(r => Object.assign(r, patch)); return init.headers?.Prefer?.includes('representation') ? rows : null; }
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
    fileInfo: async p => db.files[p] || { size: 1000, type: 'application/pdf' }, now: over.now,
  };
  const shop = createServiceShop(deps);
  const call = async (route, body, token = 'u1') => {
    const out = {}; const req = { body, get: h => (h.toLowerCase() === 'authorization' && token ? 'Bearer ' + token : '') };
    const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; out.status ||= 200; return this; } };
    await handlers[route](req, res); return out;
  };
  return { db, shop, call };
}
const form = (over = {}) => ({ service: 'print', price_id: id(1), groups: { [G_PAGES]: 10, [G_COPIES]: 3, [G_SIZE]: O_A4 }, fulfilment: 'pickup', ...over });

test('quote: needs a signed-in user and returns the server total', async () => {
  const { call } = makeShop();
  assert.equal((await call('/api/service/quote', form(), null)).status, 401);
  const r = await call('/api/service/quote', form());
  assert.equal(r.status, 200); assert.equal(r.body.quote.total, 1.5);
});

test('CLIENT CANNOT CHANGE THE PRICE: total, prices, status and payment fields in the body are ignored', async () => {
  const { call, db } = makeShop();
  const r = await call('/api/service/order', form({
    total: 0.01, subtotal: 0.01, unit_price: 0.0001, delivery_fee: 0, price: 0.01, amount: 0.01, currency: 'KHR',
    status: 'paid', payment_status: 'paid', paid_at: '2020-01-01', bakong_hash: 'x', bakong_md5s: ['a'], user_id: U2, quantity: undefined,
  }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.amount, 1.5);                                     // the QR is for the catalog price
  assert.equal(db.posted.total, 1.5); assert.equal(db.posted.subtotal, 1.5); assert.equal(db.posted.unit_price, 0.05);
  assert.equal(db.posted.user_id, U1);                                  // the signed-in user, not the body
  for (const k of ['status', 'payment_status', 'paid_at', 'bakong_hash']) assert.equal(k in db.posted, false, k + ' must not come from the browser');
  assert.deepEqual(db.posted.bakong_md5s ?? undefined, undefined);
  assert.equal(db.orders[0].status, 'awaiting_payment');                // the database default, not the browser
  // when the admin changes the catalog price, the next order changes too
  PRICES[0].amount = 0.10;
  try { const r2 = await call('/api/service/order', form({ total: 0.01 })); assert.equal(r2.body.amount, 3); } finally { PRICES[0].amount = 0.05; }
});

test('order: validation of every input', async () => {
  const { call, db } = makeShop();
  const bad = async (over, why) => { const r = await call('/api/service/order', form(over)); assert.equal(r.status, 400, why + ' ' + JSON.stringify(r.body)); assert.equal(db.orders.length, 0, why); };
  await bad({ service: '../etc' }, 'service key');
  await bad({ price_id: 'nope' }, 'price id');
  await bad({ price_id: id(66) }, 'price id from another service');
  await bad({ quantity: 0 }, 'quantity');
  await bad({ quantity: 1001 }, 'quantity');
  await bad({ groups: { [G_PAGES]: 10, [G_COPIES]: 3, [G_SIZE]: id(77) } }, 'foreign option id');
  await bad({ groups: [] }, 'groups array');
  await bad({ fulfilment: 'delivery', delivery: { lat: 91, lng: 0, phone: '012 345 678', address: 'Street 1' } }, 'latitude');
  await bad({ fulfilment: 'delivery', delivery: { lat: 11.57, lng: 104.92, phone: 'abc', address: 'Street 1' } }, 'phone');
  await bad({ fulfilment: 'delivery', delivery: { lat: 11.57, lng: 104.92, phone: '012 345 678', address: '' } }, 'address');
  await bad({ fulfilment: 'delivery', delivery: { lat: 1.35, lng: 103.82, phone: '012 345 678', address: 'Singapore' } }, 'too far');
  await bad({ files: [fid(U2)] }, 'file in somebody else\'s folder');
  await bad({ files: ['../../etc/passwd'] }, 'path traversal');
  await bad({ files: Array.from({ length: 6 }, (_, i) => fid(U1, i + 1)) }, 'too many files');
  await bad({ files: [fid(U1), fid(U1)] }, 'duplicate file');
  db.files[fid(U1, 2)] = { size: 11 * 1024 * 1024, type: 'application/pdf' }; await bad({ files: [fid(U1, 2)] }, 'file too big');
  db.files[fid(U1, 3)] = { size: 10, type: 'application/zip' };                await bad({ files: [fid(U1, 3)] }, 'wrong file type');
  db.files[fid(U1, 4)] = { missing: true };                                     await bad({ files: [fid(U1, 4)] }, 'file does not exist');
});

test('order: delivery and pick-up are stored correctly; design orders are digital', async () => {
  const { call, db } = makeShop();
  const d = await call('/api/service/order', form({ fulfilment: 'delivery', delivery: { lat: NEAR.lat, lng: NEAR.lng, phone: '012 345 678', address: 'Street 1, near the school' }, files: [fid(U1)], note: ' hello ' }));
  assert.equal(d.status, 200, JSON.stringify(d.body));
  assert.equal(db.posted.fulfilment, 'delivery'); assert.equal(db.posted.delivery_phone, '012 345 678'); assert.equal(db.posted.customer_note, 'hello');
  assert.deepEqual(db.posted.file_paths, [fid(U1)]);
  assert.equal(db.posted.total, +(1.5 + db.posted.delivery_fee).toFixed(2));
  const p = await call('/api/service/order', form({ delivery: { lat: NEAR.lat, lng: NEAR.lng, phone: '012 345 678', address: 'ignored for pick-up' } }));
  assert.equal(db.posted.fulfilment, 'pickup'); assert.equal(db.posted.delivery_lat, null); assert.equal(db.posted.delivery_fee, 0); assert.equal(p.body.amount, 1.5);
  const g = await call('/api/service/order', { service: 'logo', price_id: id(50), groups: {}, fulfilment: 'delivery', delivery: { lat: 1, lng: 1 } });
  assert.equal(g.status, 400);                                                // a design service refuses a delivery request
  const g2 = await call('/api/service/order', { service: 'logo', price_id: id(50), groups: {} });
  assert.equal(g2.status, 200); assert.equal(db.posted.fulfilment, 'digital'); assert.equal(db.posted.total, 25);
});

test('order: Bakong not configured -> 503 (the page falls back to the old request form)', async () => {
  const { call, db } = makeShop(); db.bakongOn = false;
  const r = await call('/api/service/order', form());
  assert.equal(r.status, 503); assert.equal(r.body.code, 'no_bakong');
});

test('ownership: nobody can pay, check or restart someone else\'s order', async () => {
  const { call, db } = makeShop();
  const o = (await call('/api/service/order', form())).body.order_id;
  for (const route of ['/api/service/status', '/api/service/order']) {
    const r = await call(route, { order_id: o }, 'u2');
    assert.equal(r.status, 404, route); assert.deepEqual(r.body, { error: 'Order not found.' });
  }
  assert.equal((await call('/api/service/status', { order_id: o }, null)).status, 401);
  assert.equal((await call('/api/service/status', { order_id: 'not-a-uuid' })).status, 400);
  assert.equal((await call('/api/service/status', { order_id: '99999999-9999-4999-8999-000000000999' })).status, 404);   // same answer as "not yours"
  assert.equal(db.orders[0].payment_status, 'unpaid');
});

test('payment: marked paid only when Bakong confirms, exactly once, admin told once', async () => {
  const { call, db } = makeShop();
  const o = (await call('/api/service/order', form())).body.order_id;
  let s = await call('/api/service/status', { order_id: o });
  assert.deepEqual(s.body, { paid: false, delayed: false });
  assert.equal(db.orders[0].status, 'awaiting_payment');
  db.paid.add(o);   // the fake QR md5 is "md5-<order id>-<random>"; the fake bank recognises the order id inside it
  s = await call('/api/service/status', { order_id: o });
  assert.equal(s.body.paid, true);
  assert.equal(db.orders[0].status, 'paid'); assert.equal(db.orders[0].payment_status, 'paid'); assert.equal(db.orders[0].payment_method, 'Bakong KHQR');
  assert.equal(db.notified.length, 1); assert.match(db.notified[0][0], /Service order paid/);
  s = await call('/api/service/status', { order_id: o });
  assert.equal(s.body.paid, true); assert.equal(db.notified.length, 1);       // no second notification
  const again = await call('/api/service/order', { order_id: o });
  assert.deepEqual(again.body, { paid: true });
});

test('resume: a fresh QR for an unpaid order, refused after 48 hours or when cancelled', async () => {
  let t = Date.now();
  const { call, db } = makeShop({ now: () => t });
  const o = (await call('/api/service/order', form())).body.order_id;
  const r = await call('/api/service/order', { order_id: o });
  assert.equal(r.status, 200); assert.equal(r.body.order_id, o); assert.equal(r.body.amount, 1.5);
  assert.equal(db.orders[0].bakong_md5s.length, 2);
  t += STALE_MS + 1000;
  assert.equal((await call('/api/service/order', { order_id: o })).status, 409);
});

test('48 hours: unpaid orders are cancelled (not deleted); a late payment is honoured first', async () => {
  let t = Date.now();
  const { call, db, shop } = makeShop({ now: () => t });
  const a = (await call('/api/service/order', form())).body.order_id;
  const b = (await call('/api/service/order', form({ groups: { [G_PAGES]: 20, [G_COPIES]: 1, [G_SIZE]: O_A4 } }))).body.order_id;
  db.paid.add(b);                                                              // customer b paid just before the deadline
  t += STALE_MS + 60000;
  const n = await shop.sweepStale(true);
  assert.equal(n, 1);
  assert.equal(db.orders.find(o => o.id === a).status, 'cancelled');
  assert.equal(db.orders.find(o => o.id === b).status, 'paid');
  assert.equal(db.orders.length, 2);                                           // nothing deleted
});

test('open unpaid orders are capped per customer', async () => {
  const { call } = makeShop();
  let last;
  for (let i = 0; i < 11; i++) last = await call('/api/service/order', form());
  assert.equal(last.status, 429);
});

test('errors never leak database text', async () => {
  const { call, db } = makeShop();
  const real = db.orders.push; db.orders.push = () => { throw new Error('duplicate key value violates unique constraint "secret_table_pkey"'); };
  const r = await call('/api/service/order', form());
  db.orders.push = real;
  assert.equal(r.status, 500); assert.doesNotMatch(JSON.stringify(r.body), /duplicate|constraint|secret_table/);
});

test('parseOrderBody never reads price-like fields', () => {
  const p = parseOrderBody({ service: 'print', price_id: id(1), total: 1, price: 1, unit_price: 1, status: 'paid', groups: {} }, U1, { forOrder: true });
  assert.deepEqual(Object.keys(p).sort(), ['address', 'files', 'fulfilment', 'key', 'note', 'phone', 'point', 'selection']);
  assert.deepEqual(Object.keys(p.selection).sort(), ['groups', 'price_id', 'quantity']);
  assert.match(svcNo('12345678-aaaa-4aaa-8aaa-000000000000'), /^SV-12345678$/);
});

/* ------------------------------------------------------------ the SQL keeps customers away from money */
test('SQL: customers cannot write orders; admin writes are limited to workflow columns', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase/sql/supabase-service-shop.sql'), 'utf8');
  assert.match(sql, /alter table public\.service_orders\s+enable row level security/);
  assert.match(sql, /grant select on public\.service_orders to authenticated;/);
  const grants = [...sql.matchAll(/grant (?:insert|update|delete)[^;]*public\.service_orders[^;]*;/gi)].map(m => m[0]);
  assert.equal(grants.length, 1, grants.join('\n'));
  assert.match(grants[0], /^grant update \(status, admin_note, result_paths, cancel_reason, refund_status, refund_note\)/);
  for (const col of ['total', 'subtotal', 'delivery_fee', 'unit_price', 'payment_status', 'bakong_hash', 'bakong_md5s', 'user_id', 'choices', 'paid_at']) assert.doesNotMatch(grants[0], new RegExp('\\b' + col + '\\b'), col);
  assert.doesNotMatch(sql, /create policy "[^"]*" on public\.service_orders for (insert|delete)/i);
  for (const t of ['service_catalog', 'service_prices', 'service_option_groups', 'service_options', 'service_orders']) assert.match(sql, new RegExp(`alter table public\\.${t}\\s+enable row level security`), t);
  assert.match(sql, /bucket_id = 'service-private'[\s\S]*auth\.uid\(\)::text/);
  assert.match(sql, /'service-private', 'service-private', false, 10485760/);       // private, 10 MB
});
