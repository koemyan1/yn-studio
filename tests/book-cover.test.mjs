// Book cover service: price comes from the database (250 riel a page), phone + location are required before paying, paid only after
// Bakong confirms the exact riel amount, the layout is saved only after payment, and nobody can touch another customer's order.
// Runs with no network and no database: node --test tests/book-cover.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookCoverShop } from '../server/bookCover.js';
import { buildCovers, buildOrder, cleanFields, cleanLayout, defaultSpot, itemsPages, itemsTotal, orderItems, orderTotal, validateContact, hasSubjectFields, MAX_COVERS, MAX_ITEMS } from '../shared/bookCoverMath.js';

const quiet = { warn() {}, error() {}, log() {} };
const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222';
const D1 = '00000000-0000-4000-8000-000000000001', D_OFF = '00000000-0000-4000-8000-000000000002', D2 = '00000000-0000-4000-8000-000000000003';
const FIELDS = [
  { key: 'subject', label_en: 'Subject', per_subject: true, required: true, x: 50, y: 40, size: 56 },
  { key: 'name', label_en: 'Name', required: true, x: 50, y: 50, size: 40 },
  { key: 'school', label_en: 'School', required: false, x: 50, y: 59, size: 30 },
];

function makeShop() {
  const db = {
    designs: [
      { id: D1, name_en: 'Blue', image_url: 'https://x/y.jpg', price_per_page: 250, fields: FIELDS, enabled: true },
      { id: D_OFF, name_en: 'Hidden', image_url: 'https://x/z.jpg', price_per_page: 250, fields: FIELDS, enabled: false },
      { id: D2, name_en: 'Gold', image_url: 'https://x/g.jpg', price_per_page: 400, fields: FIELDS, enabled: true },
    ],
    orders: [], profiles: [{ user_id: U1, name: '', phone: '', delivery_address: '' }], notified: [], bakongOn: true, paid: false, want: null, qrOpts: null,
  };
  const handlers = {};
  const app = { post: (p, _mw, h) => { handlers[p] = h; } };
  const parseQ = q => Object.fromEntries(q.split('&').map(x => { const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1)]; }));
  const match = (o, f) => Object.entries(f).every(([k, v]) => {
    if (['select', 'order', 'limit'].includes(k)) return true;
    if (v.startsWith('eq.')) return String(o[k]) === v.slice(3);
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').includes(String(o[k]));
    if (v.startsWith('gte.')) return o[k] >= v.slice(4);
    return true;
  });
  const sb = async (pq, init = {}) => {
    const [table, query = ''] = pq.split('?'); const f = parseQ(query); const method = init.method || 'GET';
    if (table === 'book_cover_designs') return db.designs.filter(x => match(x, f));
    if (table === 'profiles') {
      const rows = db.profiles.filter(x => match(x, f));
      if (method === 'PATCH') { rows.forEach(r => Object.assign(r, JSON.parse(init.body))); return null; }
      return rows;
    }
    if (table === 'book_cover_orders') {
      if (method === 'POST') {
        const row = { id: `99999999-9999-4999-8999-${String(db.orders.length + 1).padStart(12, '0')}`, status: 'pending', bakong_md5s: [], phone: '', address: '', created_at: new Date().toISOString(), ...JSON.parse(init.body) };
        db.orders.push(row); return [row];
      }
      const rows = db.orders.filter(o => match(o, f));
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
    makeBakongQr: async (o, opts) => { db.qrOpts = opts; return { md5: 'md5-' + o.id, image: 'data:image/png;base64,AA', amount: Number(opts.exactAmount), expiresAt: Date.now() + 600000 }; },
    findBakongPayment: async (_m, _t, _l, want) => { db.want = want; return db.paid ? { hash: 'hash-1' } : null; },
    bakongDelayed: () => false, notifyAdmin: async (...a) => { db.notified.push(a); }, jsonBody: (_q, _r, n) => n(), log: quiet,
  };
  const shop = createBookCoverShop(deps);
  const call = async (route, body, token = 'u1') => {
    const out = {}; const req = { body, get: h => (h.toLowerCase() === 'authorization' && token ? 'Bearer ' + token : '') };
    const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; out.status ||= 200; return this; } };
    await handlers[route](req, res); return out;
  };
  return { db, shop, call };
}
const covers3 = [{ values: { subject: 'Math', name: 'Sok Dara', school: 'ABC' } }, { values: { subject: 'Khmer', name: 'HACKER' } }, { values: { subject: 'Science' } }];
const contact = { name: 'Sok', phone: '012 345 678', address: 'Phnom Penh, Sen Sok' };

test('price = pages x 250 riel from the database; the browser cannot set it', async () => {
  const { call, db } = makeShop();
  const r = await call('/api/bookcover/save', { design_id: D1, covers: covers3, total: 1, price_per_page: 1, pages: 1, user_id: U2, status: 'paid' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.pages, 3); assert.equal(r.body.price_per_page, 250); assert.equal(r.body.total, 750);
  const o = db.orders[0];
  assert.equal(o.user_id, U1); assert.equal(o.status, 'pending'); assert.equal(o.total, 750); assert.equal(o.currency, 'KHR');
  assert.equal(o.covers[1].values.name, 'Sok Dara', 'shared answers follow page 1');
  assert.equal(o.covers[1].values.subject, 'Khmer');
});

test('save: validation and switched-off designs', async () => {
  const { call, db } = makeShop();
  assert.equal((await call('/api/bookcover/save', { design_id: D1, covers: covers3 }, null)).status, 401);
  assert.equal((await call('/api/bookcover/save', { design_id: 'nope', covers: covers3 })).status, 400);
  assert.equal((await call('/api/bookcover/save', { design_id: D_OFF, covers: covers3 })).status, 404);
  assert.equal((await call('/api/bookcover/save', { design_id: D1, covers: [{ values: { subject: 'Math' } }] })).status, 400, 'name is required');
  assert.equal((await call('/api/bookcover/save', { design_id: D1, covers: [] })).status, 400);
  assert.equal((await call('/api/bookcover/save', { design_id: D1, covers: Array.from({ length: MAX_COVERS + 1 }, () => ({ values: { subject: 'x', name: 'y' } })) })).status, 400);
  assert.equal(db.orders.length, 0);
});

test('pay: refused without phone + location, then a KHQR in RIEL for the exact total', async () => {
  const { call, db } = makeShop();
  const id = (await call('/api/bookcover/save', { design_id: D1, covers: covers3 })).body.id;
  const no = await call('/api/bookcover/pay', { order_id: id });
  assert.equal(no.status, 400); assert.equal(no.body.code, 'no_contact');
  assert.equal((await call('/api/bookcover/contact', { order_id: id, phone: 'abc', address: 'Phnom Penh' })).status, 400);
  assert.equal((await call('/api/bookcover/contact', { order_id: id, phone: '012 345 678', address: '' })).status, 400);
  assert.equal((await call('/api/bookcover/contact', { order_id: id, ...contact })).status, 200);
  const r = await call('/api/bookcover/pay', { order_id: id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.currency, 'KHR'); assert.equal(r.body.amount, 750);
  assert.deepEqual(db.qrOpts, { currency: 'KHR', exactAmount: 750 });
});

test('contact fills only the profile fields that are still empty', async () => {
  const { call, db } = makeShop();
  db.profiles[0].phone = '099 111 222';
  const id = (await call('/api/bookcover/save', { design_id: D1, covers: covers3 })).body.id;
  await call('/api/bookcover/contact', { order_id: id, ...contact, lat: 11.55, lng: 104.9 });
  assert.equal(db.profiles[0].phone, '099 111 222', 'an existing phone is not overwritten');
  assert.equal(db.profiles[0].delivery_address, 'Phnom Penh, Sen Sok');
  assert.equal(db.profiles[0].delivery_lat, 11.55);
  assert.equal(db.orders[0].address, 'Phnom Penh, Sen Sok'); assert.equal(db.orders[0].lat, 11.55);
});

test('paid only after Bakong confirms the exact riel amount; then the texts are locked and the admin is told once', async () => {
  const { call, db } = makeShop();
  const id = (await call('/api/bookcover/save', { design_id: D1, covers: covers3 })).body.id;
  await call('/api/bookcover/contact', { order_id: id, ...contact });
  await call('/api/bookcover/pay', { order_id: id });
  assert.equal((await call('/api/bookcover/status', { order_id: id })).body.paid, false);
  assert.equal(db.orders[0].status, 'pending');
  db.paid = true;
  assert.equal((await call('/api/bookcover/status', { order_id: id })).body.paid, true);
  assert.deepEqual(db.want, { amount: 750, currency: 'KHR' });
  assert.equal(db.orders[0].status, 'paid');
  await call('/api/bookcover/status', { order_id: id });
  assert.equal(db.notified.length, 1); assert.match(db.notified[0][1], /750/);
  const edit = await call('/api/bookcover/save', { order_id: id, covers: [{ values: { subject: 'Math', name: 'Changed' } }] });
  assert.equal(edit.status, 409); assert.equal(edit.body.code, 'locked');
});

test('layout: only after payment, positions are cleaned, send-to-print tells the admin', async () => {
  const { call, db } = makeShop();
  const id = (await call('/api/bookcover/save', { design_id: D1, covers: covers3.slice(0, 2) })).body.id;
  const early = await call('/api/bookcover/layout', { order_id: id, covers: [] });
  assert.equal(early.status, 409); assert.equal(early.body.code, 'unpaid');
  db.orders[0].status = 'paid';
  const r = await call('/api/bookcover/layout', { order_id: id, covers: [{ pos: { name: { x: 30.123, y: 150, size: 9999 }, evil: { x: 1, y: 1 } } }, { pos: {} }] });
  assert.equal(r.status, 200);
  const p = db.orders[0].covers[0].pos;
  assert.deepEqual(p.name, { x: 30.12, y: 100, size: 160 }); assert.equal('evil' in p, false);
  assert.equal(db.orders[0].covers[0].values.name, 'Sok Dara', 'the texts are never touched by a layout save');
  assert.equal(db.orders[0].status, 'paid'); assert.equal(db.notified.length, 0);
  const s = await call('/api/bookcover/layout', { order_id: id, covers: [{ pos: {} }, { pos: {} }], submit: true });
  assert.equal(s.body.status, 'submitted'); assert.equal(db.orders[0].status, 'submitted'); assert.equal(db.notified.length, 1);
  db.orders[0].status = 'printed';
  assert.equal((await call('/api/bookcover/layout', { order_id: id, covers: [] })).status, 409);
});

test("nobody can read, pay for or change another customer's order", async () => {
  const { call } = makeShop();
  const id = (await call('/api/bookcover/save', { design_id: D1, covers: covers3 })).body.id;
  for (const route of ['contact', 'pay', 'status', 'layout']) assert.equal((await call('/api/bookcover/' + route, { order_id: id, ...contact }, 'u2')).status, 404, route);
  assert.equal((await call('/api/bookcover/save', { order_id: id, covers: covers3 }, 'u2')).status, 404);
});

test('Bakong switched off: pay and status say so', async () => {
  const { call, db } = makeShop();
  const id = (await call('/api/bookcover/save', { design_id: D1, covers: covers3 })).body.id;
  db.bakongOn = false;
  const r = await call('/api/bookcover/pay', { order_id: id });
  assert.equal(r.status, 503); assert.equal(r.body.code, 'no_bakong');
});

test('shared maths', () => {
  assert.equal(orderTotal(1, 250), 250); assert.equal(orderTotal(4, 250), 1000); assert.equal(orderTotal(0, 250), 0); assert.equal(orderTotal(21, 250), 0); assert.equal(orderTotal(2, 5), 0);
  const f = cleanFields([...FIELDS, { key: 'BAD KEY' }, { key: 'subject' }, null]);
  assert.equal(f.length, 3); assert.equal(hasSubjectFields(f), true); assert.equal(hasSubjectFields([f[1]]), false);
  assert.equal(f[0].font, 'Poppins'); assert.equal(f[0].color, '#1b1b1b');
  assert.ok(buildCovers(f, [{ values: { subject: 'A', name: 'B' } }]).covers);
  assert.match(buildCovers(f, [{ values: { subject: 'A', name: 'B' } }, { values: {} }]).error, /page 2/);
  assert.equal(cleanLayout(f, [{ pos: { name: { x: 'x', y: 10 } } }], 2).length, 2);
  // new questions start in the middle band, one under the other
  for (let i = 0; i < 12; i++) { const s = defaultSpot(i); assert.equal(s.x, 50); assert.ok(s.y >= 38 && s.y <= 86); }
  assert.equal(validateContact({ phone: '012 345 678', address: 'ab' }).ok, false);
  assert.equal(validateContact({ phone: '012 345 678', address: 'Siem Reap', lat: 200, lng: 5 }).contact.lat, null);
});

/* ------------------------------------------------ more than one design in one order ------------------------------------------------ */
const A = [{ values: { subject: 'Math', name: 'Sok Dara' } }, { values: { subject: 'Khmer' } }];   // 2 pages of Blue (250 each)
const B = [{ values: { subject: 'Science', name: 'Ignored on purpose' } }];                          // 1 page of Gold (400)

test('one order, two designs: each design is priced by its own price and the total is the sum', async () => {
  const { call, db } = makeShop();
  const r = await call('/api/bookcover/save', { items: [{ design_id: D1, covers: A, price_per_page: 1 }, { design_id: D2, covers: B, total: 1 }], total: 1, pages: 1 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.pages, 3); assert.equal(r.body.total, 2 * 250 + 400);
  assert.equal(r.body.items.length, 2);
  const o = db.orders[0];
  assert.equal(o.items.length, 2); assert.equal(o.items[0].design_name, 'Blue'); assert.equal(o.items[1].price_per_page, 400);
  assert.equal(o.items[0].covers[1].values.name, 'Sok Dara', 'shared answers follow page 1 inside a design');
  assert.equal(o.items[1].covers[0].values.name, 'Ignored on purpose', 'a second design has its own page 1');
  assert.equal(o.pages, 3); assert.equal(o.total, 900);
  assert.equal(o.design_id, D1, 'the single-design columns mirror the first design'); assert.equal(o.covers.length, 2); assert.match(o.design_name, /Blue \+ Gold/);
});

test('multi-design save: every rule still applies', async () => {
  const { call, db } = makeShop();
  const dup = await call('/api/bookcover/save', { items: [{ design_id: D1, covers: A }, { design_id: D1, covers: A }] });
  assert.equal(dup.status, 400); assert.match(dup.body.error, /once/);
  assert.equal((await call('/api/bookcover/save', { items: [{ design_id: D1, covers: A }, { design_id: D_OFF, covers: B }] })).status, 404, 'a switched-off design cannot be added');
  assert.equal((await call('/api/bookcover/save', { items: [{ design_id: D1, covers: A }, { design_id: 'nope', covers: B }] })).status, 400);
  const bad = await call('/api/bookcover/save', { items: [{ design_id: D1, covers: A }, { design_id: D2, covers: [{ values: { subject: 'x' } }] }] });
  assert.equal(bad.status, 400); assert.match(bad.body.error, /Gold/, 'the error says which design');
  assert.equal((await call('/api/bookcover/save', { items: [] })).status, 400);
  const many = Array.from({ length: 11 }, () => ({ values: { subject: 'x', name: 'y' } }));
  assert.equal((await call('/api/bookcover/save', { items: [{ design_id: D1, covers: many }, { design_id: D2, covers: many }] })).status, 400, 'pages are counted over all designs');
  assert.equal(db.orders.length, 0);
});

test('an unpaid order can gain or lose a design; the price of a design already on it stays frozen', async () => {
  const { call, db } = makeShop();
  const id = (await call('/api/bookcover/save', { items: [{ design_id: D1, covers: A }] })).body.id;
  assert.equal(db.orders[0].total, 500);
  db.designs[0].price_per_page = 999;                         // the admin changes the price afterwards
  const more = await call('/api/bookcover/save', { order_id: id, items: [{ design_id: D1, covers: A }, { design_id: D2, covers: B }] });
  assert.equal(more.status, 200, JSON.stringify(more.body));
  assert.equal(more.body.total, 2 * 250 + 400, 'Blue keeps the price it was ordered at; Gold is read from the database');
  const less = await call('/api/bookcover/save', { order_id: id, items: [{ design_id: D2, covers: B }] });
  assert.equal(less.body.total, 400); assert.equal(db.orders[0].items.length, 1); assert.equal(db.orders[0].design_id, D2);
  assert.equal(db.orders.length, 1, 'updating never makes a second order');
});

test('KHQR for a multi-design order is the exact sum; layout saves one list per design', async () => {
  const { call, db } = makeShop();
  const id = (await call('/api/bookcover/save', { items: [{ design_id: D1, covers: A }, { design_id: D2, covers: B }] })).body.id;
  await call('/api/bookcover/contact', { order_id: id, ...contact });
  const q = await call('/api/bookcover/pay', { order_id: id });
  assert.equal(q.body.amount, 900); assert.deepEqual(db.qrOpts, { currency: 'KHR', exactAmount: 900 });
  db.paid = true; await call('/api/bookcover/status', { order_id: id });
  assert.equal(db.orders[0].status, 'paid'); assert.match(db.notified[0][1], /2 designs/);
  const r = await call('/api/bookcover/layout', { order_id: id, items: [{ covers: [{ pos: { name: { x: 20, y: 30, size: 44 } } }, { pos: {} }] }, { covers: [{ pos: { name: { x: 70, y: 80, size: 20 }, evil: { x: 1, y: 1 } } }] }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(db.orders[0].items[0].covers[0].pos.name, { x: 20, y: 30, size: 44 });
  assert.deepEqual(db.orders[0].items[1].covers[0].pos.name, { x: 70, y: 80, size: 20 }); assert.equal('evil' in db.orders[0].items[1].covers[0].pos, false);
  assert.equal(db.orders[0].items[1].covers[0].values.subject, 'Science', 'a layout save never changes the texts');
  assert.deepEqual(db.orders[0].covers[0].pos.name, { x: 20, y: 30, size: 44 }, 'the mirror of the first design follows');
});

test('an order made before multi-design (no items) is still read, priced and laid out', async () => {
  const { call, db } = makeShop();
  db.orders.push({ id: '88888888-8888-4888-8888-888888888888', user_id: U1, design_id: D1, design_name: 'Blue', design_image: 'https://x/y.jpg', design_fields: FIELDS, covers: [{ values: { subject: 'Math', name: 'Old' }, pos: {} }], pages: 1, price_per_page: 250, total: 250, status: 'paid', bakong_md5s: [], phone: '012 345 678', address: 'PP' });
  const old = db.orders[0];
  assert.equal(orderItems(old).length, 1); assert.equal(itemsPages(orderItems(old)), 1); assert.equal(itemsTotal(orderItems(old)), 250);
  const r = await call('/api/bookcover/layout', { order_id: old.id, covers: [{ pos: { name: { x: 40, y: 40, size: 30 } } }] });   // old browser shape
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(old.items.length, 1); assert.deepEqual(old.items[0].covers[0].pos.name, { x: 40, y: 40, size: 30 });
});

test('buildOrder maths', () => {
  const look = id => ({ [D1]: { id: D1, name: 'Blue', image: 'i', price_per_page: 250, fields: FIELDS }, [D2]: { id: D2, name: 'Gold', image: 'j', price_per_page: 400, fields: FIELDS } })[id];
  const ok = buildOrder([{ design_id: D1, covers: A }, { design_id: D2, covers: B }], look);
  assert.equal(ok.total, 900); assert.equal(ok.pages, 3); assert.equal(itemsTotal(ok.items), 900);
  assert.equal(buildOrder([{ design_id: D1, covers: A }], look).total, 500);
  assert.ok(buildOrder(Array.from({ length: MAX_ITEMS + 1 }, (_, i) => ({ design_id: 'd' + i, covers: A })), look).error);
  assert.equal(buildOrder([{ design_id: 'unknown', covers: A }], look).code, 'design');
  assert.equal(MAX_COVERS, 20);
});

test('layout: the customer can pick a text colour (#rrggbb only), nothing else is kept', () => {
  const f = cleanFields([{ key: 'name', label_en: 'Name', x: 50, y: 50, size: 30, color: '#111111' }]);
  const out = cleanLayout(f, [{ pos: { name: { x: 10, y: 20, size: 40, color: '#FF00AA' } } }, { pos: { name: { x: 10, y: 20, size: 40, color: 'red' } } }, { pos: { name: { x: 1, y: 2, size: 20, color: 'url(javascript:alert(1))' } } }], 3);
  assert.deepEqual(out[0].name, { x: 10, y: 20, size: 40, color: '#ff00aa' }, 'a valid colour is kept (lower-cased)');
  assert.deepEqual(out[1].name, { x: 10, y: 20, size: 40 }, 'a colour name is dropped');
  assert.equal('color' in out[2].name, false, 'anything that is not #rrggbb is dropped');
});
