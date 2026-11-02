// Pay-first service shop (Printing, Copy, Social post, Poster, Logo). Setup: docs/setup/SERVICE-SHOP-SETUP.md
//
//   POST /api/service/quote   -> server-calculated price for a form (nothing is saved)
//   POST /api/service/order   -> validates against the catalog, creates the order (awaiting_payment) and its Bakong KHQR
//                                (send { order_id } instead to get a fresh QR for an unpaid order of your own)
//   POST /api/service/status  -> asks Bakong whether the QR was paid; only then is the order marked paid
//
// The browser is never trusted for money: it sends choices (ids, numbers, text), and every price comes from the catalog tables
// read here with the service-role key. Same payment shape and safety net as the CV maker (/api/bakong/cv/*).
import { computeQuote, isUuid, cleanPhone, cleanText, validCoord } from '../shared/serviceMath.js';

export const SERVICE_FIELDS = 'id,user_id,service_key,price_label,total,status,payment_status,bakong_md5s,created_at';
export const svcNo = id => 'SV-' + String(id).replace(/-/g, '').slice(0, 8).toUpperCase();

export const STALE_MS = 48 * 3600 * 1000;      // an unpaid order is cancelled (never deleted) after 48 hours
export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'application/pdf'];
const FILE_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]{1,120}$/i;
const KEY = /^[a-z0-9_-]{1,32}$/;
const OPEN_UNPAID_MAX = 10;

const plain = v => v && typeof v === 'object' && !Array.isArray(v);

/** Turns the request body into a clean selection, or an error message. Anything price-like in the body is never read. */
export function parseOrderBody(b, userId, { forOrder }) {
  if (!plain(b)) return { error: 'The request is incomplete.' };
  const key = typeof b.service === 'string' && KEY.test(b.service) ? b.service : '';
  if (!key) return { error: 'Please choose a service.' };
  if (!isUuid(b.price_id)) return { error: 'Please choose one of the prices.' };
  if (b.quantity !== undefined && !Number.isInteger(b.quantity)) return { error: 'Quantity must be a whole number.' };
  if (b.groups !== undefined && !plain(b.groups)) return { error: 'The choices are invalid.' };
  const groups = {};
  for (const [id, v] of Object.entries(b.groups || {})) {
    if (!isUuid(id)) return { error: 'The choices are invalid.' };
    const ok = typeof v === 'string' || typeof v === 'number' || (Array.isArray(v) && v.length <= 50 && v.every(x => typeof x === 'string'));
    if (!ok) return { error: 'The choices are invalid.' };
    groups[id] = v;
  }
  if (b.fulfilment !== undefined && typeof b.fulfilment !== 'string') return { error: 'Please choose pick up or delivery.' };
  const d = plain(b.delivery) ? b.delivery : null;
  const point = d && validCoord(d.lat, d.lng) ? { lat: d.lat, lng: d.lng } : null;
  const out = {
    key, fulfilment: b.fulfilment, point,
    selection: { price_id: b.price_id, quantity: b.quantity, groups },
    phone: '', address: '', note: '', files: [],
  };
  if (!forOrder) return out;

  out.note = cleanText(b.note, 500);
  if (b.fulfilment === 'delivery') {
    out.phone = cleanPhone(d?.phone);
    if (!out.phone) return { error: 'Please enter a valid phone number so we can reach you.' };
    out.address = cleanText(d?.address, 300);
    if (out.address.length < 3) return { error: 'Please add an address or a note for the driver.' };
  }
  if (b.files !== undefined) {
    if (!Array.isArray(b.files) || b.files.length > MAX_FILES) return { error: `You can attach up to ${MAX_FILES} files.` };
    const seen = new Set();
    for (const f of b.files) {
      // path = <your user id>/<uuid>-<name>: only files in YOUR own folder can be attached to YOUR order
      if (typeof f !== 'string' || !FILE_PATH.test(f) || !f.startsWith(userId + '/') || seen.has(f)) return { error: 'One of the files is not valid. Please upload it again.' };
      seen.add(f);
    }
    out.files = [...seen];
  }
  return out;
}

export function createServiceShop(deps) {
  const { app, sb, SB, BK, userFromToken, shield, limited, bakongEnabled, makeBakongQr, findBakongPayment, bakongDelayed, notifyAdmin, jsonBody, log = console } = deps;
  const now = deps.now || (() => Date.now());

  async function gate(req, res, name, max, { needBakong = false } = {}) {
    if (!(SB.url && SB.service && SB.anon)) { res.status(503).json({ error: 'The server is not connected to the database yet.' }); return null; }
    if (needBakong && !bakongEnabled()) { res.status(503).json({ error: 'Bakong KHQR is not configured on the server yet.', code: 'no_bakong' }); return null; }
    if (limited(req, 120)) { res.status(429).json({ error: 'Too many requests. Please wait a moment.' }); return null; }
    const user = await userFromToken(req);
    if (!user) { res.status(401).json({ error: 'Please sign in again.' }); return null; }
    if (shield.userLimited(user.id, name, max, 60000, req)) { res.status(429).json({ error: 'Too many requests. Please wait a moment.' }); return null; }
    return user;
  }

  /** The live catalog for one service, read with the service key. Disabled services / prices / options simply do not exist here. */
  async function loadCatalog(key) {
    const service = (await sb(`service_catalog?key=eq.${key}&enabled=eq.true&select=key,kind,name_en,name_km&limit=1`))?.[0];
    if (!service) return null;
    const [prices, groups] = await Promise.all([
      sb(`service_prices?service_key=eq.${key}&enabled=eq.true&select=id,label_en,label_km,amount,unit,enabled&order=sort_order.asc`),
      sb(`service_option_groups?service_key=eq.${key}&enabled=eq.true&select=id,label_en,label_km,type,required,is_quantity,min_value,max_value,enabled,service_options(id,label_en,label_km,price_type,price,enabled)&order=sort_order.asc`),
    ]);
    for (const g of groups || []) { g.options = (g.service_options || []).filter(o => o.enabled); delete g.service_options; }
    return { service, prices: prices || [], groups: groups || [] };
  }
  const loadDeliveryCfg = async () => (await sb('delivery_settings?id=eq.1&select=base_fee,base_km,extra_fee,extra_km,store_lat,store_lng&limit=1'))?.[0] || null;

  async function priceRequest(p) {
    const cat = await loadCatalog(p.key);
    if (!cat) return { status: 404, error: 'This service is not available right now.' };
    const deliveryCfg = p.fulfilment === 'delivery' ? await loadDeliveryCfg() : null;
    const r = computeQuote({ service: cat.service, prices: cat.prices, groups: cat.groups, selection: p.selection, fulfilment: p.fulfilment, deliveryCfg, deliveryPoint: p.point });
    if (!r.ok) return { status: 400, error: r.error, code: r.code };
    return { quote: r.quote };
  }

  /** Checks (with the service key) that each attached file exists in the customer's own folder and is small + the right type. */
  const fileInfo = deps.fileInfo || (async path => {
    const r = await fetch(`${SB.url}/storage/v1/object/info/service-private/${path.split('/').map(encodeURIComponent).join('/')}`, { headers: { apikey: SB.service, Authorization: `Bearer ${SB.service}` } });
    if (r.status === 404 || r.status === 400) return { missing: true };
    if (!r.ok) return { unknown: true };
    const j = await r.json().catch(() => ({}));
    return { size: Number(j.size ?? j.metadata?.size), type: String(j.content_type ?? j.metadata?.mimetype ?? '').toLowerCase().split(';')[0] };
  });
  async function checkFiles(paths) {
    for (const p of paths) {
      let info;
      try { info = await fileInfo(p); } catch (e) { log.error('service file check', e?.message || e); info = { unknown: true }; }
      if (info.missing) return 'A file was not found. Please upload it again.';
      // when the storage API cannot answer we rely on the bucket itself, which already enforces 10 MB and the type list
      if (info.unknown) continue;
      if (Number.isFinite(info.size) && info.size > MAX_FILE_BYTES) return 'A file is bigger than 10 MB.';
      if (info.type && !FILE_TYPES.includes(info.type)) return 'Only pictures and PDF files are allowed.';
    }
    return '';
  }

  async function qrFor(order) {
    const q = await makeBakongQr({ id: order.id, total: order.total, order_number: svcNo(order.id) });
    await sb(`service_orders?id=eq.${order.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ bakong_md5s: [...(order.bakong_md5s || []), q.md5].slice(-10) }) });
    return { order_id: order.id, order_number: svcNo(order.id), image: q.image, amount: q.amount, currency: BK.currency, expiresAt: q.expiresAt, merchant: BK.name, total: Number(order.total) };
  }

  async function ownOrder(res, user, id) {
    if (!isUuid(id)) { res.status(400).json({ error: 'Invalid order.' }); return null; }
    const o = (await sb(`service_orders?id=eq.${id}&select=${SERVICE_FIELDS}&limit=1`))?.[0];
    if (!o || o.user_id !== user.id) { res.status(404).json({ error: 'Order not found.' }); return null; }   // same answer for "not yours" and "does not exist"
    return o;
  }

  /** Bakong confirmed the money -> mark the order paid exactly once. */
  async function verifyBakongService(o) {
    if (o.payment_status === 'paid') return true;
    if (o.status !== 'awaiting_payment') return false;
    const f = await findBakongPayment(o.bakong_md5s, o.total, `service ${o.id}`);
    if (!f || f.mismatch) return false;
    const updated = await sb(`service_orders?id=eq.${o.id}&payment_status=eq.unpaid&status=eq.awaiting_payment`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ payment_status: 'paid', status: 'paid', payment_method: 'Bakong KHQR', bakong_hash: f.hash, paid_at: new Date(now()).toISOString() }),
    });
    if (Array.isArray(updated) && updated.length) await notifyAdmin('Service order paid', `${svcNo(o.id)} (${o.price_label || o.service_key}) was paid with Bakong KHQR.`, '/admin/service-orders');
    return true;
  }

  /** Unpaid for 48 hours -> cancelled (never deleted). One last Bakong check first, so a late payment is never lost. */
  let lastSweep = 0;
  async function sweepStale(force = false) {
    if (!force && now() - lastSweep < 600000) return 0;
    lastSweep = now();
    const cutoff = new Date(now() - STALE_MS).toISOString();
    const rows = await sb(`service_orders?status=eq.awaiting_payment&payment_status=eq.unpaid&created_at=lt.${cutoff}&select=${SERVICE_FIELDS}&limit=50`).catch(() => []);
    let n = 0;
    for (const o of rows || []) {
      if (bakongEnabled() && (o.bakong_md5s || []).length && await verifyBakongService(o).catch(() => false)) continue;
      const r = await sb(`service_orders?id=eq.${o.id}&status=eq.awaiting_payment&payment_status=eq.unpaid`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ status: 'cancelled', cancel_reason: 'Not paid within 48 hours.' }),
      }).catch(() => null);
      if (Array.isArray(r) && r.length) n++;
    }
    return n;
  }

  /** Safety net used by /api/bakong/sync: re-check this customer's recent unpaid service orders. */
  async function syncForUser(userId, sinceIso) {
    let updated = 0;
    const rows = await sb(`service_orders?user_id=eq.${userId}&status=eq.awaiting_payment&payment_status=eq.unpaid&created_at=gte.${sinceIso}&select=${SERVICE_FIELDS}&order=created_at.desc&limit=5`).catch(() => []);
    for (const o of rows || []) if (await verifyBakongService(o)) updated++;
    sweepStale().catch(() => {});
    return updated;
  }

  /* ---------------------------------------------------------------- routes */
  app.post('/api/service/quote', jsonBody, async (req, res) => {
    try {
      const user = await gate(req, res, 'svc-quote', 60); if (!user) return;
      const p = parseOrderBody(req.body, user.id, { forOrder: false });
      if (p.error) return res.status(400).json({ error: p.error });
      const r = await priceRequest(p);
      if (r.error) return res.status(r.status).json({ error: r.error, code: r.code });
      res.json({ quote: r.quote });
    } catch (e) {
      log.error('service quote', e);
      res.status(500).json({ error: 'Could not calculate the price. Please try again.' });
    }
  });

  app.post('/api/service/order', jsonBody, async (req, res) => {
    try {
      const body = req.body || {};
      // 1) a fresh QR for an unpaid order the customer already has
      if (body.order_id !== undefined) {
        const user = await gate(req, res, 'svc-pay', 20, { needBakong: true }); if (!user) return;
        const o = await ownOrder(res, user, String(body.order_id)); if (!o) return;
        if (o.payment_status === 'paid') return res.json({ paid: true });
        if (o.status !== 'awaiting_payment' || now() - new Date(o.created_at).getTime() > STALE_MS) return res.status(409).json({ error: 'This order can no longer be paid. Please make a new one.' });
        if (!(Number(o.total) > 0)) return res.status(400).json({ error: 'This order has no amount to pay.' });
        return res.json(await qrFor(o));
      }
      // 2) a new order
      const user = await gate(req, res, 'svc-order', 8, { needBakong: true }); if (!user) return;
      if (shield.userLimited(user.id, 'svc-order-hour', 40, 3600000, req)) return res.status(429).json({ error: 'Too many orders. Please wait a while.' });
      const p = parseOrderBody(body, user.id, { forOrder: true });
      if (p.error) return res.status(400).json({ error: p.error });
      const r = await priceRequest(p);
      if (r.error) return res.status(r.status).json({ error: r.error, code: r.code });
      const bad = await checkFiles(p.files);
      if (bad) return res.status(400).json({ error: bad });

      const since = new Date(now() - STALE_MS).toISOString();
      const open = await sb(`service_orders?user_id=eq.${user.id}&status=eq.awaiting_payment&payment_status=eq.unpaid&created_at=gte.${since}&select=id&limit=${OPEN_UNPAID_MAX}`);
      if ((open || []).length >= OPEN_UNPAID_MAX) return res.status(429).json({ error: 'You have several unpaid orders. Please pay or wait for them to expire first.' });
      sweepStale().catch(() => {});

      const q = r.quote, delivery = q.fulfilment === 'delivery';
      const row = (await sb('service_orders', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          user_id: user.id, service_key: q.service_key, price_id: q.price_id, price_label: q.price_label_en,
          choices: q.choices, unit_price: q.unit_price, quantity: q.quantity, subtotal: q.subtotal, delivery_fee: q.delivery_fee, total: q.total,
          currency: 'USD', fulfilment: q.fulfilment,
          delivery_lat: delivery ? p.point.lat : null, delivery_lng: delivery ? p.point.lng : null, delivery_km: delivery ? q.distance_km : null,
          delivery_address: delivery ? p.address : null, delivery_phone: delivery ? p.phone : null,
          customer_note: p.note || null, file_paths: p.files,
        }),
      }))?.[0];
      if (!row) throw new Error('insert returned nothing');
      res.json({ ...(await qrFor(row)), quote: q });
    } catch (e) {
      log.error('service order', e);
      res.status(500).json({ error: 'Could not create your order. Please try again.' });
    }
  });

  app.post('/api/service/status', jsonBody, async (req, res) => {
    try {
      const user = await gate(req, res, 'svc-status', 90, { needBakong: true }); if (!user) return;
      const o = await ownOrder(res, user, String(req.body?.order_id || '')); if (!o) return;
      const paid = await verifyBakongService(o);
      res.json({ paid, delayed: !paid && bakongDelayed() });
    } catch (e) {
      log.error('service status', e);
      res.status(500).json({ error: 'Could not check the payment. Please try again.' });
    }
  });

  const timer = setInterval(() => { if (SB.url && SB.service) sweepStale(true).catch(() => {}); }, 3600000);
  timer.unref?.();
  return { verifyBakongService, syncForUser, sweepStale, loadCatalog, parseOrderBody };
}
