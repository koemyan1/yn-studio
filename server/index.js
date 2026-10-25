import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createStore } from './security/store.js';
import { createAlerts } from './security/alerts.js';
import { createShield } from './security/shield.js';
import { createAdminApi } from './security/adminApi.js';
import { createIntegrity } from './security/integrity.js';
import { createIntel } from './security/intel.js';
import { createGeoLookup } from './security/geo.js';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const distPath = path.join(__dirname, '..', 'dist');
const env = process.env;

app.set('trust proxy', 1); // Render / most hosts terminate HTTPS in front of Node

app.disable('x-powered-by');
// Security shield (headers incl. the camera permission for the package scanner, honeypots, WAF-lite, rate limits,
// auto IP blocking). It is created further down once the database helpers exist; until then requests just pass through.
let shield = null;
app.use((req, res, next) => (shield ? shield.middleware(req, res, next) : next()));
// The app can be opened from more than one address (ynstudio.site, www., the old onrender.com address...). Calls to /api carry a
// Bearer token (no cookies), so allowing any origin is safe and stops "works on one address, not on the other" payment problems.
app.use('/api', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.get('/api/health', (_req, res) => res.json({ ok: true }));

/* ------------------------------------------------------------------ *
 *  ABA PayWay (hosted checkout: ABA Pay, KHQR, cards)
 *  Docs: https://developer.payway.com.kh  — setup guide: docs/setup/ABA-PAYWAY-SETUP.md
 *
 *  1. The browser asks POST /api/aba/purchase for a signed form for one of the
 *     customer's own unpaid orders. The amount always comes from the database.
 *  2. The browser posts that form to PayWay's hosted checkout page.
 *  3. PayWay calls POST /api/aba/callback. We never trust that body: we ask PayWay
 *     "check-transaction-2" directly and only then mark the order paid.
 *  4. POST /api/aba/sync does the same check for the signed-in customer's pending
 *     orders (used when they come back from PayWay, and as a safety net).
 * ------------------------------------------------------------------ */
const ABA = {
  merchant: env.ABA_PAYWAY_MERCHANT_ID || '',
  key: env.ABA_PAYWAY_API_KEY || '',
  base: (env.ABA_PAYWAY_BASE_URL || (env.ABA_PAYWAY_ENV === 'production' ? 'https://checkout.payway.com.kh' : 'https://checkout-sandbox.payway.com.kh')).replace(/\/$/, ''),
  // e.g. abapay_khqr, abapay, cards, bakong. Must be enabled on your merchant profile.
  option: env.ABA_PAYWAY_PAYMENT_OPTION === undefined ? 'abapay_khqr' : env.ABA_PAYWAY_PAYMENT_OPTION,
  currency: (env.ABA_PAYWAY_CURRENCY || 'USD').toUpperCase(),
  khrRate: Number(env.ABA_PAYWAY_KHR_RATE || 4100),
};
const SB = {
  url: (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, ''),
  service: env.SUPABASE_SERVICE_ROLE_KEY || '',
  anon: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '',
};
const abaEnabled = () => !!(ABA.merchant && ABA.key && SB.url && SB.service && SB.anon);

const jsonBody = express.json({ limit: '50kb' });
const formBody = express.urlencoded({ extended: false, limit: '50kb' });
const publicUrl = req => (env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
const b64 = s => Buffer.from(String(s), 'utf8').toString('base64');
const sign = s => crypto.createHmac('sha512', ABA.key).update(s, 'utf8').digest('base64');
const reqTime = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14); // UTC YYYYMMDDHHmmss
const cleanName = v => String(v || '').replace(/[^\p{L}\p{N} ]/gu, '').trim().slice(0, 20);

// Per-IP rate limit for the authenticated endpoints (now backed by the security shield: real client IP behind
// Cloudflare, automatic cleanup, and repeated abuse feeds the auto-block score).
function limited(req, max = 30) { return shield ? shield.limited(req, max) : false; }

async function sb(pathAndQuery, init = {}) {
  const r = await fetch(`${SB.url}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: { apikey: SB.service, Authorization: `Bearer ${SB.service}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text.slice(0, 200)}`);
  return data;
}
async function userFromToken(req) {
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const r = await fetch(`${SB.url}/auth/v1/user`, { headers: { apikey: SB.anon, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? { id: u.id, email: u.email || '' } : null;
}

/* ------------------------------------------------------------------ *
 *  Security layer (setup + dashboard: docs/setup/SECURITY-SETUP.md, /admin/security)
 * ------------------------------------------------------------------ */
// Location + device of everyone the shield detects or blocks. Cloudflare headers first; the free lookup only fills gaps
// (GEO_LOOKUP=off disables it, GEO_LOOKUP_URL swaps the provider). See docs/setup/SECURITY-SETUP.md "Who was it?".
const geoLookup = /^off$/i.test(process.env.GEO_LOOKUP || '') ? null : createGeoLookup({ url: process.env.GEO_LOOKUP_URL || undefined });
const secIntel = createIntel({ lookup: geoLookup });
const secStore = createStore({ sb, enabled: !!(SB.url && SB.service), intel: secIntel });
const secAlerts = createAlerts({ notify: (title, message, link) => notifyAdmin(title, message, link) });
shield = createShield({ store: secStore, alerts: secAlerts, intel: secIntel });
const integrity = createIntegrity({ sb, store: secStore, alerts: secAlerts });
const adminApi = createAdminApi({ shield, store: secStore, sb, userFromToken });
app.use('/api/admin/security', adminApi.handler);
app.post('/api/security/csp-report', shield.limiter('csp-report', 30), express.json({ type: ['application/csp-report', 'application/reports+json', 'application/json'], limit: '20kb' }), adminApi.cspReport);
const ORDER_CHECK_MSG = 'We could not verify this order\'s price. Please go back to your cart and place the order again.';

const toAmount = total => {
  const n = Number(total || 0);
  return ABA.currency === 'KHR' ? String(Math.round(n * ABA.khrRate)) : n.toFixed(2);
};

/** Ask PayWay for the real status of one transaction. */
async function checkTransaction(tranId) {
  const rt = reqTime();
  const r = await fetch(`${ABA.base}/api/payment-gateway/v1/payments/check-transaction-2`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ req_time: rt, merchant_id: ABA.merchant, tran_id: tranId, hash: sign(rt + ABA.merchant + tranId) }),
  });
  const j = await r.json().catch(() => ({}));
  const d = j.data || {};
  const code = String(j.status?.code ?? d.status?.code ?? '');
  return { ok: code === '00', code, data: d };
}

/** Verify with PayWay, then (once) mark the order as paid. Returns true when the order is now paid. */
async function verifyAndApply(order, tranId) {
  if (order.payment_status === 'paid') return true;
  const c = await checkTransaction(tranId);
  if (!c.ok) return false;
  const d = c.data;
  const approved = d.payment_status_code === 0 || String(d.payment_status || '').toUpperCase() === 'APPROVED';
  if (!approved) {
    const st = String(d.payment_status || '').toUpperCase();
    if (st) await sb(`orders?id=eq.${order.id}&payment_status=neq.paid`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ aba_status: st }) }).catch(() => {});
    return false;
  }
  const paidAmount = Number(d.total_amount ?? d.original_amount ?? d.payment_amount);
  const expected = Number(toAmount(order.total));
  if (!Number.isFinite(paidAmount) || Math.abs(paidAmount - expected) > 0.009) {
    console.warn(`ABA amount mismatch for order ${order.id}: paid ${paidAmount}, expected ${expected}`);
    await sb(`orders?id=eq.${order.id}&payment_status=neq.paid`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ aba_status: 'AMOUNT_MISMATCH' }) }).catch(() => {});
    return false;
  }
  if (!(await integrity.check(order, null, 'verifyAndApply')).ok) {
    await sb(`orders?id=eq.${order.id}&payment_status=neq.paid`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ aba_status: 'INTEGRITY_FAIL' }) }).catch(() => {});
    return false;
  }
  const updated = await sb(`orders?id=eq.${order.id}&payment_status=neq.paid`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ payment_status: 'paid', status: 'paid', aba_status: 'APPROVED', aba_apv: String(d.apv || ''), aba_paid_at: new Date().toISOString() }),
  });
  if (Array.isArray(updated) && updated.length) {
    await sb('notifications', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ title: 'Order paid with ABA PayWay', message: `Order ${order.order_number || order.id} was paid with ABA PayWay.`, target_role: 'admin', link: '/admin/orders' }),
    }).catch(() => {});
  }
  return true;
}

app.get('/api/aba/config', shield.limiter('cfg', 60), (_req, res) => res.json({ enabled: abaEnabled(), env: ABA.base.includes('sandbox') ? 'sandbox' : 'production', currency: ABA.currency }));

app.post('/api/aba/purchase', jsonBody, async (req, res) => {
  try {
    if (!abaEnabled()) return res.status(503).json({ error: 'ABA PayWay is not configured on the server yet.' });
    if (limited(req)) return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
    const user = await userFromToken(req);
    if (!user) return res.status(401).json({ error: 'Please sign in again.' });
    const orderId = String(req.body?.order_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return res.status(400).json({ error: 'Invalid order.' });
    const rows = await sb(`orders?id=eq.${orderId}&select=id,order_number,user_id,total,payment_status,status,delivery_name,delivery_phone,aba_tran_ids&limit=1`);
    const order = rows?.[0];
    if (!order || order.user_id !== user.id) return res.status(404).json({ error: 'Order not found.' });
    if (order.payment_status === 'paid') return res.status(409).json({ error: 'This order is already paid.' });
    if (['cancelled', 'rejected'].includes(order.status)) return res.status(409).json({ error: 'This order was cancelled.' });
    if (!(Number(order.total) > 0)) return res.status(400).json({ error: 'This order has no amount to pay.' });
    if (!(await integrity.check(order, req, '/api/aba/purchase')).ok) return res.status(409).json({ error: ORDER_CHECK_MSG });

    const digits = String(order.order_number || '').replace(/\D/g, '') || order.id.replace(/-/g, '').slice(0, 8);
    const tranId = ('YN' + digits + crypto.randomBytes(3).toString('hex')).slice(0, 20); // unique per attempt, alphanumeric
    const amount = toAmount(order.total);
    const base = publicUrl(req);
    const [first = '', ...rest] = cleanName(order.delivery_name).split(' ');
    const phone = String(order.delivery_phone || '').replace(/\D/g, '');
    const f = {
      req_time: reqTime(), merchant_id: ABA.merchant, tran_id: tranId, amount,
      items: b64(JSON.stringify([{ name: `Order ${order.order_number || ''}`.trim().slice(0, 40), quantity: '1', price: amount }])),
      shipping: '', ctid: '', pwt: '',
      firstname: first, lastname: rest.join(' ').slice(0, 20),
      email: user.email.slice(0, 50), phone: phone.length >= 8 && phone.length <= 20 ? phone : '',
      type: 'purchase', payment_option: ABA.option,
      return_url: b64(`${base}/api/aba/callback`), cancel_url: `${base}/orders?aba=cancel`, continue_success_url: `${base}/orders?aba=1`,
      return_deeplink: '', currency: ABA.currency, custom_fields: '', return_params: order.id,
    };
    // Hash order is fixed by PayWay's Purchase API.
    const hash = sign([f.req_time, f.merchant_id, f.tran_id, f.amount, f.items, f.shipping, f.ctid, f.pwt, f.firstname, f.lastname, f.email, f.phone, f.type, f.payment_option, f.return_url, f.cancel_url, f.continue_success_url, f.return_deeplink, f.currency, f.custom_fields, f.return_params].join(''));
    await sb(`orders?id=eq.${order.id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ aba_tran_id: tranId, aba_tran_ids: [...(order.aba_tran_ids || []), tranId].slice(-10), aba_status: 'PENDING', payment_method: 'ABA PayWay' }),
    });
    // Only send fields that have a value; "return_params" is posted as "return_param".
    const fields = { hash, view_type: 'hosted_view' };
    for (const [k, v] of Object.entries(f)) if (v !== '') fields[k === 'return_params' ? 'return_param' : k] = v;
    res.json({ action: `${ABA.base}/api/payment-gateway/v1/payments/purchase`, fields });
  } catch (e) {
    console.error('aba purchase', e);
    res.status(500).json({ error: 'Could not start ABA PayWay. Please try again.' });
  }
});

// PayWay "pushback". We only use the tran_id, then verify with PayWay ourselves.
app.post('/api/aba/callback', shield.limiter('aba-callback', 60), jsonBody, formBody, async (req, res) => {
  res.json({ ok: true });
  try {
    if (!abaEnabled()) return;
    const tranId = String(req.body?.tran_id || '').replace(/[^\w-]/g, '').slice(0, 30);
    if (!tranId) return;
    const rows = await sb(`orders?aba_tran_ids=cs.{${tranId}}&select=id,order_number,total,payment_status&limit=1`);
    if (rows?.[0]) await verifyAndApply(rows[0], tranId);
  } catch (e) { console.error('aba callback', e); }
});

// Customer is back from PayWay (or the Orders page is open): confirm any pending PayWay orders.
app.post('/api/aba/sync', jsonBody, async (req, res) => {
  try {
    if (!abaEnabled()) return res.json({ updated: 0 });
    if (limited(req, 40)) return res.status(429).json({ error: 'Too many requests.' });
    const user = await userFromToken(req);
    if (!user) return res.status(401).json({ error: 'Please sign in again.' });
    const since = new Date(Date.now() - 6.5 * 86400000).toISOString();
    const rows = await sb(`orders?user_id=eq.${user.id}&payment_method=eq.ABA%20PayWay&payment_status=neq.paid&aba_tran_id=not.is.null&created_at=gte.${since}&select=id,order_number,total,payment_status,aba_tran_ids&order=created_at.desc&limit=5`);
    let updated = 0;
    for (const o of rows || []) {
      for (const t of [...(o.aba_tran_ids || [])].reverse().slice(0, 3)) { if (await verifyAndApply(o, t)) { updated++; break; } }
    }
    res.json({ updated });
  } catch (e) {
    console.error('aba sync', e);
    res.json({ updated: 0 });
  }
});

/* ------------------------------------------------------------------ *
 *  Bakong KHQR (dynamic QR per order, any Bakong-connected banking app)
 *  Setup guide: docs/setup/BAKONG-SETUP.md
 *
 *  1. POST /api/bakong/create  -> builds a one-time KHQR for one of the customer's own
 *     unpaid orders (amount comes from the database) and returns the QR image.
 *  2. The browser shows the QR and polls POST /api/bakong/status every few seconds.
 *  3. The server asks Bakong "check_transaction_by_md5" with YOUR API token and only then
 *     marks the order paid (amount, currency and receiving account are all verified).
 *  4. POST /api/bakong/sync re-checks the customer's recent pending orders (safety net).
 *  The API token never leaves the server.
 * ------------------------------------------------------------------ */
const BK = {
  account: (env.BAKONG_ACCOUNT_ID || 'korn_koemyan@bkrt').trim(),
  name: (env.BAKONG_MERCHANT_NAME || 'YN Studio').trim().slice(0, 25),
  city: (env.BAKONG_MERCHANT_CITY || 'Phnom Penh').trim().slice(0, 15),
  token: (env.BAKONG_API_TOKEN || '').trim(),
  base: (env.BAKONG_API_BASE_URL || 'https://api-bakong.nbc.gov.kh').replace(/\/$/, ''),
  currency: (env.BAKONG_CURRENCY || 'USD').toUpperCase() === 'KHR' ? 'KHR' : 'USD',
  khrRate: Number(env.BAKONG_KHR_RATE || 4100),
  minutes: Math.min(Math.max(Number(env.BAKONG_QR_MINUTES || 10), 2), 60),
};
const bakongEnabled = () => !!(BK.token && BK.account && SB.url && SB.service && SB.anon);
const bakongAmount = (total, cur = BK.currency) => {
  const n = Number(total || 0);
  return cur === 'KHR' ? Math.round(n * BK.khrRate) : Number(n.toFixed(2));
};
// Wallet top-ups and debt payments can be in riel: pay.amount is then a whole-riel amount, kept in the separate riel wallet.
const payCur = pay => (pay?.currency === 'KHR' ? 'KHR' : 'USD');
const payExpected = pay => (payCur(pay) === 'KHR' ? Math.round(Number(pay.amount)) : bakongAmount(pay.amount));
const payExpectedCur = pay => (payCur(pay) === 'KHR' ? 'KHR' : BK.currency);
// Loaded on first use so the server still starts if the packages are not installed yet.
let khqrLib = null, qrImageLib = null;
const loadKhqr = () => (khqrLib ||= require('bakong-khqr'));
const loadQrImage = () => (qrImageLib ||= require('qrcode'));

/** Build a one-time KHQR for an order. */
async function makeBakongQr(order, opts = {}) {
  const { BakongKHQR, khqrData, IndividualInfo } = loadKhqr();
  const cur = opts.currency || BK.currency;
  const amount = opts.exactAmount != null ? opts.exactAmount : bakongAmount(order.total);
  const expiresAt = Date.now() + BK.minutes * 60000;
  const info = new IndividualInfo(BK.account, BK.name, BK.city, {
    currency: cur === 'KHR' ? khqrData.currency.khr : khqrData.currency.usd,
    amount,
    billNumber: String(order.order_number || order.id).replace(/[^\w-]/g, '').slice(0, 25),
    expirationTimestamp: expiresAt,
  });
  const r = new BakongKHQR().generateIndividual(info);
  if (!r || r.status?.code !== 0 || !r.data?.qr || !r.data?.md5) {
    throw new Error(`KHQR generation failed: ${r?.status?.message || 'unknown error'}`);
  }
  const image = await loadQrImage().toDataURL(r.data.qr, { errorCorrectionLevel: 'M', margin: 1, width: 360 });
  return { md5: r.data.md5, image, amount, expiresAt, currency: cur };
}

let lastBakongErrorAt = 0; // lets the status routes tell the browser "the bank check is not answering"
const bakongDelayed = () => Date.now() - lastBakongErrorAt < 20000;
const bakongFail = (...args) => { lastBakongErrorAt = Date.now(); console.error(...args); return { state: 'error' }; };

/** Ask Bakong about one QR. Returns { state: 'paid' | 'pending' | 'error', data? }.
 *  "pending" is returned ONLY when Bakong clearly says "transaction not found". Any other answer (expired token,
 *  blocked IP, wrong account, HTML page...) is an error and is logged, so it can never look like "just not paid yet". */
async function bakongCheck(md5) {
  try {
    const r = await fetch(`${BK.base}/v1/check_transaction_by_md5`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${BK.token}` },
      body: JSON.stringify({ md5 }),
      signal: AbortSignal.timeout(10000),
    });
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch { j = null; }
    if (r.status === 401) return bakongFail('Bakong API HTTP 401: the token is invalid or expired. Renew it at https://api-bakong.nbc.gov.kh and update BAKONG_API_TOKEN.');
    if (!j) return bakongFail(`Bakong API HTTP ${r.status} returned a non-JSON body. The API is usually restricted to Cambodian IPs and this server is probably blocked. See docs/setup/BAKONG-SETUP.md.`);
    if (j.responseCode === 0 && j.data) return { state: 'paid', data: j.data };
    const msg = String(j.responseMessage || j.message || '');
    const notFound = j.errorCode === 3 || /could not be found|not found|no transaction/i.test(msg);
    if (j.responseCode === 1 && notFound) return { state: 'pending' };
    return bakongFail(`Bakong API HTTP ${r.status} unexpected answer (responseCode ${j.responseCode}, errorCode ${j.errorCode}): ${msg || text.slice(0, 160)}`);
  } catch (e) {
    return bakongFail('Bakong API request failed (timeout / unreachable / blocked):', e?.message || e);
  }
}

/** Look through a QR's newest md5s for a confirmed Bakong payment of `total` (store currency, USD).
 *  Returns { hash } when confirmed, { mismatch: true } when money arrived but does not match, else null. */
async function findBakongPayment(md5s, total, label, want) {
  let mismatch = false;
  for (const md5 of [...(md5s || [])].reverse().slice(0, 5)) {
    const c = await bakongCheck(md5);
    if (c.state !== 'paid') continue;
    const d = c.data;
    const expected = want?.amount != null ? want.amount : bakongAmount(total);
    const expCur = want?.currency || BK.currency;
    const paid = Number(d.amount);
    const local = v => String(v || '').toLowerCase().split('@')[0];
    const toOk = !d.toAccountId || local(d.toAccountId) === local(BK.account);   // field can be missing on some responses
    const curOk = !d.currency || String(d.currency).toUpperCase() === expCur;
    const amtOk = Number.isFinite(paid) && Math.abs(paid - expected) <= (expCur === 'KHR' ? 0.5 : 0.009);
    if (toOk && curOk && amtOk) return { hash: String(d.hash || '') };
    console.warn(`Bakong mismatch for ${label}: got ${paid} ${d.currency} to ${d.toAccountId}, expected ${expected} ${expCur} to ${BK.account}`);
    mismatch = true;
  }
  return mismatch ? { mismatch: true } : null;
}
const notifyAdmin = (title, message, link) => sb('notifications', {
  method: 'POST', headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({ title, message, target_role: 'admin', link }),
}).catch(() => {});

/** Orders: verify with Bakong, then (once) mark the order as paid. */
async function verifyBakong(order, md5s) {
  if (order.payment_status === 'paid') return true;
  const f = await findBakongPayment(md5s, order.total, `order ${order.id}`);
  if (!f) return false;
  if (f.mismatch) {
    await sb(`orders?id=eq.${order.id}&payment_status=neq.paid`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ bakong_status: 'MISMATCH' }) }).catch(() => {});
    return false;
  }
  if (!(await integrity.check(order, null, 'verifyBakong')).ok) {
    await sb(`orders?id=eq.${order.id}&payment_status=neq.paid`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ bakong_status: 'INTEGRITY_FAIL' }) }).catch(() => {});
    return false;
  }
  const updated = await sb(`orders?id=eq.${order.id}&payment_status=neq.paid`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ payment_status: 'paid', status: 'paid', bakong_status: 'PAID', bakong_hash: f.hash, bakong_paid_at: new Date().toISOString() }),
  });
  if (Array.isArray(updated) && updated.length) await notifyAdmin('Order paid with Bakong KHQR', `Order ${order.order_number || order.id} was paid with Bakong KHQR.`, '/admin/orders');
  return true;
}

/** Wallet top-ups and debt payments: verify with Bakong, then let the database apply it exactly once. */
async function verifyBakongPayment(pay) {
  if (pay.status === 'paid') return true;
  const f = await findBakongPayment(pay.bakong_md5s, pay.amount, `payment ${pay.id}`, { amount: payExpected(pay), currency: payExpectedCur(pay) });
  if (!f) return false;
  if (f.mismatch) {
    await sb(`bakong_payments?id=eq.${pay.id}&status=eq.pending`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'mismatch' }) }).catch(() => {});
    return false;
  }
  const applied = await sb('rpc/bakong_apply_payment', { method: 'POST', body: JSON.stringify({ p_payment_id: pay.id, p_hash: f.hash }) });
  if (applied === true) {
    const what = pay.kind === 'debt' ? 'a debt payment' : 'a wallet top-up';
    const shown = payCur(pay) === 'KHR' ? `${Math.round(Number(pay.amount)).toLocaleString('en-US')} KHR` : `$${Number(pay.amount).toFixed(2)}`;
    await notifyAdmin('Bakong KHQR payment received', `A customer paid ${shown} as ${what} with Bakong KHQR.`, pay.kind === 'debt' ? '/admin/debt' : '/admin/transactions');
  }
  return true;
}

const ORDER_FIELDS = 'id,order_number,user_id,total,payment_status,status,bakong_md5s,created_at';
async function ownOrder(req, res) {
  if (!bakongEnabled()) { res.status(503).json({ error: 'Bakong KHQR is not configured on the server yet.' }); return null; }
  if (limited(req, 120)) { res.status(429).json({ error: 'Too many requests. Please wait a moment.' }); return null; }
  const user = await userFromToken(req);
  if (!user) { res.status(401).json({ error: 'Please sign in again.' }); return null; }
  if (shield.userLimited(user.id, 'order-pay', 90, 60000, req)) { res.status(429).json({ error: 'Too many requests. Please wait a moment.' }); return null; }
  const orderId = String(req.body?.order_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) { res.status(400).json({ error: 'Invalid order.' }); return null; }
  const rows = await sb(`orders?id=eq.${orderId}&select=${ORDER_FIELDS}&limit=1`);
  const order = rows?.[0];
  if (!order || order.user_id !== user.id) { res.status(404).json({ error: 'Order not found.' }); return null; }
  return order;
}

app.get('/api/bakong/config', shield.limiter('cfg', 60), (_req, res) => {
  // `missing` only lists the NAMES of unset variables (never values) so you can see why KHQR is off.
  const missing = [];
  if (!BK.token) missing.push('BAKONG_API_TOKEN');
  if (!BK.account) missing.push('BAKONG_ACCOUNT_ID');
  if (!SB.url) missing.push('SUPABASE_URL');
  if (!SB.service) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!SB.anon) missing.push('SUPABASE_ANON_KEY');
  res.json({ enabled: bakongEnabled(), currency: BK.currency, khrRate: BK.khrRate, merchant: BK.name, missing });
});

app.post('/api/bakong/create', jsonBody, async (req, res) => {
  try {
    const order = await ownOrder(req, res); if (!order) return;
    if (order.payment_status === 'paid') return res.json({ paid: true });
    if (['cancelled', 'rejected'].includes(order.status)) return res.status(409).json({ error: 'This order was cancelled.' });
    if (!(Number(order.total) > 0)) return res.status(400).json({ error: 'This order has no amount to pay.' });
    if (!(await integrity.check(order, req, '/api/bakong/create')).ok) return res.status(409).json({ error: ORDER_CHECK_MSG });
    const q = await makeBakongQr(order);
    await sb(`orders?id=eq.${order.id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ bakong_md5: q.md5, bakong_md5s: [...(order.bakong_md5s || []), q.md5].slice(-10), bakong_status: 'PENDING', payment_method: 'Bakong KHQR' }),
    });
    res.json({ image: q.image, amount: q.amount, currency: BK.currency, expiresAt: q.expiresAt, merchant: BK.name, order_number: order.order_number });
  } catch (e) {
    console.error('bakong create', e);
    res.status(500).json({ error: 'Could not create the KHQR. Please try again.' });
  }
});

app.post('/api/bakong/status', jsonBody, async (req, res) => {
  try {
    const order = await ownOrder(req, res); if (!order) return;
    if (order.payment_status === 'paid') return res.json({ paid: true });
    const paid = await verifyBakong(order, order.bakong_md5s);
    res.json({ paid, delayed: !paid && bakongDelayed() });
  } catch (e) {
    console.error('bakong status', e);
    res.json({ paid: false });
  }
});

const PAY_FIELDS = 'id,user_id,kind,amount,status,bakong_md5s,currency';
async function payUser(req, res) {
  if (!bakongEnabled()) { res.status(503).json({ error: 'Bakong KHQR is not configured on the server yet.' }); return null; }
  if (limited(req, 120)) { res.status(429).json({ error: 'Too many requests. Please wait a moment.' }); return null; }
  const user = await userFromToken(req);
  if (!user) { res.status(401).json({ error: 'Please sign in again.' }); return null; }
  return user;
}

// New QR for a wallet top-up or a debt payment (or a fresh QR for an existing unpaid one).
app.post('/api/bakong/pay/create', jsonBody, async (req, res) => {
  try {
    const user = await payUser(req, res); if (!user) return;
    if (shield.userLimited(user.id, 'pay-create', 10, 60000, req)) return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
    let pay = null;
    if (req.body?.payment_id) {
      const id = String(req.body.payment_id);
      if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Invalid payment.' });
      pay = (await sb(`bakong_payments?id=eq.${id}&select=${PAY_FIELDS}&limit=1`))?.[0];
      if (!pay || pay.user_id !== user.id) return res.status(404).json({ error: 'Payment not found.' });
      if (pay.status === 'paid') return res.json({ paid: true, payment_id: pay.id });
    } else {
      const kind = String(req.body?.kind || '');
      if (!['wallet', 'debt'].includes(kind)) return res.status(400).json({ error: 'Invalid payment type.' });
      const inRiel = String(req.body?.currency || '').toUpperCase() === 'KHR';
      // Riel payments are whole riel (min 100 KHR, max 40,000,000 KHR); dollar payments keep cents.
      const amount = inRiel ? Math.round(Number(req.body?.amount)) : Math.round(Number(req.body?.amount) * 100) / 100;
      if (!Number.isFinite(amount) || amount <= 0 || amount > (inRiel ? 40000000 : 10000)) return res.status(400).json({ error: 'Enter a valid amount.' });
      if (inRiel ? amount < 100 : bakongAmount(amount) <= 0) return res.status(400).json({ error: 'Amount is too small.' });
      if (kind === 'debt') {
        const d = (await sb(`debt_accounts?user_id=eq.${user.id}&enabled=eq.true&currency=eq.${inRiel ? 'KHR' : 'USD'}&select=current_balance&limit=1`))?.[0];
        if (!d || !(Number(d.current_balance) > 0)) return res.status(409).json({ error: 'You have no outstanding debt.' });
        if (amount > Number(d.current_balance) + 0.001) return res.status(400).json({ error: 'Payment cannot be greater than your current debt.' });
      }
      pay = (await sb('bakong_payments', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ user_id: user.id, kind, amount, currency: inRiel ? 'KHR' : 'USD', khr_rate: BK.khrRate }) }))?.[0];
      if (!pay) throw new Error('Could not create payment row');
    }
    const q = await makeBakongQr(
      { id: pay.id, total: pay.amount, order_number: (pay.kind === 'debt' ? 'DEBT-' : 'TOPUP-') + pay.id.replace(/-/g, '').slice(0, 8).toUpperCase() },
      payCur(pay) === 'KHR' ? { currency: 'KHR', exactAmount: Math.round(Number(pay.amount)) } : {},
    );
    await sb(`bakong_payments?id=eq.${pay.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ bakong_md5s: [...(pay.bakong_md5s || []), q.md5].slice(-10) }) });
    res.json({ payment_id: pay.id, image: q.image, amount: q.amount, currency: q.currency, expiresAt: q.expiresAt, merchant: BK.name, order_number: pay.kind === 'debt' ? 'debt' : 'wallet' });
  } catch (e) {
    console.error('bakong pay create', e);
    res.status(500).json({ error: 'Could not create the KHQR. Please try again.' });
  }
});

// Pay a RIEL debt from the RIEL wallet (separate from the dollar wallet, no conversion).
app.post('/api/debt/wallet-khr', jsonBody, async (req, res) => {
  try {
    if (!(SB.url && SB.service && SB.anon)) return res.status(503).json({ error: 'Payments are not configured on the server yet.' });
    if (limited(req, 60)) return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
    const user = await userFromToken(req);
    if (!user) return res.status(401).json({ error: 'Please sign in again.' });
    const amount = Math.round(Number(req.body?.amount));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 40000000) return res.status(400).json({ error: 'Enter a valid amount.' });
    const out = await sb('rpc/customer_pay_debt_khr', { method: 'POST', body: JSON.stringify({ p_user_id: user.id, p_amount: amount }) });
    notifyAdmin('Riel debt paid from wallet', `A customer paid ${amount.toLocaleString('en-US')} KHR of their riel debt from their riel wallet.`, '/admin/debt');
    res.json({ ok: true, balance: Number(out?.current_balance ?? 0) });
  } catch (e) {
    const m = String(e?.message || '');
    const known = /Insufficient riel wallet balance|no outstanding riel debt|not enabled|greater than zero/i.exec(m);
    if (!known) console.error('debt wallet-khr', e);
    res.status(known ? 400 : 500).json({ error: known ? (/Insufficient/i.test(m) ? 'Insufficient riel wallet balance. Add riel to your wallet first.' : /not enabled|no outstanding/i.test(m) ? 'You have no outstanding riel debt.' : 'Enter a valid amount.') : 'Could not record the payment. Please try again.' });
  }
});

app.post('/api/bakong/pay/status', jsonBody, async (req, res) => {
  try {
    const user = await payUser(req, res); if (!user) return;
    const id = String(req.body?.payment_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Invalid payment.' });
    const pay = (await sb(`bakong_payments?id=eq.${id}&select=${PAY_FIELDS}&limit=1`))?.[0];
    if (!pay || pay.user_id !== user.id) return res.status(404).json({ error: 'Payment not found.' });
    const paid = await verifyBakongPayment(pay);
    res.json({ paid, delayed: !paid && bakongDelayed() });
  } catch (e) {
    console.error('bakong pay status', e);
    res.json({ paid: false });
  }
});

// Safety net: customer opened the Orders page; re-check their recent unpaid Bakong orders.
app.post('/api/bakong/sync', jsonBody, async (req, res) => {
  try {
    if (!bakongEnabled()) return res.json({ updated: 0 });
    if (limited(req, 120)) return res.status(429).json({ error: 'Too many requests.' });
    const user = await userFromToken(req);
    if (!user) return res.status(401).json({ error: 'Please sign in again.' });
    const since = new Date(Date.now() - 86400000).toISOString();
    const rows = await sb(`orders?user_id=eq.${user.id}&payment_method=eq.Bakong%20KHQR&payment_status=neq.paid&created_at=gte.${since}&select=${ORDER_FIELDS}&order=created_at.desc&limit=5`);
    let updated = 0;
    for (const o of rows || []) if (await verifyBakong(o, o.bakong_md5s)) updated++;
    const pays = await sb(`bakong_payments?user_id=eq.${user.id}&status=eq.pending&created_at=gte.${since}&select=${PAY_FIELDS}&order=created_at.desc&limit=5`);
    for (const p of pays || []) if (await verifyBakongPayment(p)) updated++;
    const cvs = await sb(`cv_orders?user_id=eq.${user.id}&status=eq.pending&created_at=gte.${since}&select=${CV_FIELDS}&order=created_at.desc&limit=5`).catch(() => []);
    for (const c of cvs || []) if (await verifyBakongCv(c)) updated++;
    res.json({ updated });
  } catch (e) {
    console.error('bakong sync', e);
    res.json({ updated: 0 });
  }
});

/* ------------------------------------------------------------------ *
 *  CV maker ($3, table cv_orders, see supabase-cv-maker.sql)
 *  Same Bakong flow as orders: the price is read from the database row, never from the browser.
 * ------------------------------------------------------------------ */
const CV_FIELDS = 'id,user_id,price,status,bakong_md5s,created_at';
const cvNo = cv => 'CV-' + String(cv.id).replace(/-/g, '').slice(0, 8).toUpperCase();

async function ownCv(req, res) {
  if (!bakongEnabled()) { res.status(503).json({ error: 'Bakong KHQR is not configured on the server yet.' }); return null; }
  if (limited(req, 120)) { res.status(429).json({ error: 'Too many requests. Please wait a moment.' }); return null; }
  const user = await userFromToken(req);
  if (!user) { res.status(401).json({ error: 'Please sign in again.' }); return null; }
  const id = String(req.body?.cv_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) { res.status(400).json({ error: 'Invalid CV order.' }); return null; }
  const cv = (await sb(`cv_orders?id=eq.${id}&select=${CV_FIELDS}&limit=1`))?.[0];
  if (!cv || cv.user_id !== user.id) { res.status(404).json({ error: 'CV order not found.' }); return null; }
  return cv;
}

async function verifyBakongCv(cv) {
  if (cv.status === 'paid') return true;
  const f = await findBakongPayment(cv.bakong_md5s, cv.price, `cv ${cv.id}`);
  if (!f || f.mismatch) return false;
  const updated = await sb(`cv_orders?id=eq.${cv.id}&status=neq.paid`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ status: 'paid', payment_method: 'Bakong KHQR', bakong_hash: f.hash, paid_at: new Date().toISOString() }),
  });
  if (Array.isArray(updated) && updated.length) await notifyAdmin('CV paid with Bakong KHQR', `${cvNo(cv)} was paid with Bakong KHQR.`, '/admin/requests');
  return true;
}

const bigJson = express.json({ limit: '1500kb' });
const CV_TEMPLATES = ['rosa', 'jonathan', 'donna', 'daniel', 'muhammad', 'richard', 'director', 'sacha', 'olivia', 'sanchez', 'thomas', 'adam', 'john'];
/* Create or update the customer's CV row through the server (service role), so it never depends on table grants. */
app.post('/api/cv/save', bigJson, async (req, res) => {
  try {
    if (!(SB.url && SB.service && SB.anon)) return res.status(503).json({ error: 'The server is not connected to the database yet.' });
    if (limited(req, 120)) return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
    const user = await userFromToken(req);
    if (!user) return res.status(401).json({ error: 'Please sign in again.' });
    if (shield.userLimited(user.id, 'cv-save', 30, 60000, req)) return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
    const b = req.body || {};
    const data = b.data && typeof b.data === 'object' && !Array.isArray(b.data) ? b.data : null;
    if (!data || JSON.stringify(data).length > 1200000) return res.status(400).json({ error: 'The CV data is missing or too big.' });
    const template = CV_TEMPLATES.includes(b.template) ? b.template : 'rosa';
    const lang = b.lang === 'km' ? 'km' : 'en';
    if (b.cv_id) {
      const id = String(b.cv_id);
      if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Invalid CV order.' });
      const cur = (await sb(`cv_orders?id=eq.${id}&select=id,user_id,status,price&limit=1`))?.[0];
      if (!cur || cur.user_id !== user.id) return res.status(404).json({ error: 'CV order not found.' });
      const patch = cur.status === 'paid' ? { data } : { data, template, lang }; // template + language are locked once paid
      await sb(`cv_orders?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
      return res.json({ id, price: Number(cur.price), status: cur.status });
    }
    const row = (await sb('cv_orders', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ user_id: user.id, template, lang, data }) }))?.[0];
    if (!row) throw new Error('insert returned nothing');
    res.json({ id: row.id, price: Number(row.price), status: row.status });
  } catch (e) {
    console.error('cv save', e);
    res.status(500).json({ error: 'Could not save your CV. Please try again.' });
  }
});

app.post('/api/bakong/cv/create', jsonBody, async (req, res) => {
  try {
    const cv = await ownCv(req, res); if (!cv) return;
    if (cv.status === 'paid') return res.json({ paid: true });
    if (!(Number(cv.price) > 0)) return res.status(400).json({ error: 'This CV has no amount to pay.' });
    const q = await makeBakongQr({ id: cv.id, total: cv.price, order_number: cvNo(cv) });
    await sb(`cv_orders?id=eq.${cv.id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ bakong_md5s: [...(cv.bakong_md5s || []), q.md5].slice(-10), payment_method: 'Bakong KHQR' }),
    });
    res.json({ image: q.image, amount: q.amount, currency: BK.currency, expiresAt: q.expiresAt, merchant: BK.name, order_number: cvNo(cv) });
  } catch (e) {
    console.error('bakong cv create', e);
    res.status(500).json({ error: 'Could not create the KHQR. Please try again.' });
  }
});

app.post('/api/bakong/cv/status', jsonBody, async (req, res) => {
  try {
    const cv = await ownCv(req, res); if (!cv) return;
    const paid = await verifyBakongCv(cv);
    res.json({ paid, delayed: !paid && bakongDelayed() });
  } catch (e) {
    console.error('bakong cv status', e);
    res.json({ paid: false });
  }
});

/* Diagnose "the QR shows but never gets approved": open /api/bakong/health in the browser.
   It asks Bakong about a made-up MD5 and tells you whether the token, the IP or the network is the problem. */
const healthCache = { t: 0, body: null };
app.get('/api/bakong/health', shield.limiter('bakong-health', 6), async (_req, res) => {
  // Each call asks Bakong a live question, so answers are cached for 30s (stops this public page being used to burn your Bakong API quota).
  if (healthCache.body && Date.now() - healthCache.t < 30000) return res.json(healthCache.body);
  const send = res.json.bind(res);
  res.json = body => { healthCache.t = Date.now(); healthCache.body = body; return send(body); };
  const out = { tokenSet: !!BK.token, account: BK.account, base: BK.base, currency: BK.currency };
  if (!BK.token) return res.json({ ...out, ok: false, verdict: 'BAKONG_API_TOKEN is not set on the server.' });
  try {
    const r = await fetch(`${BK.base}/v1/check_transaction_by_md5`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${BK.token}` },
      body: JSON.stringify({ md5: '0'.repeat(32) }), signal: AbortSignal.timeout(10000),
    });
    const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch { j = null; }
    out.httpStatus = r.status;
    if (r.status === 401) return res.json({ ...out, ok: false, verdict: 'TOKEN_REJECTED', hint: 'The Bakong token is invalid or expired. Renew it and update BAKONG_API_TOKEN.' });
    if (!j) return res.json({ ...out, ok: false, verdict: 'BLOCKED_OR_NOT_API', hint: 'Bakong answered with a non-JSON page (HTTP ' + r.status + '). The API is restricted to Cambodian IPs, so this server is blocked. Host the server in Cambodia or set BAKONG_API_BASE_URL to a proxy in Cambodia.' });
    const notFound = j.errorCode === 3 || /could not be found|not found/i.test(String(j.responseMessage || ''));
    if (j.responseCode === 1 && notFound) return res.json({ ...out, ok: true, verdict: 'OK', hint: 'Token and network are fine. If payments still stay pending, check the server log for "Bakong mismatch".' });
    return res.json({ ...out, ok: false, verdict: 'UNEXPECTED', responseCode: j.responseCode, errorCode: j.errorCode, message: j.responseMessage || null, hint: 'Bakong answered, but not with "transaction not found". Usually a token problem.' });
  } catch (e) {
    return res.json({ ...out, ok: false, verdict: 'UNREACHABLE', hint: 'This server cannot reach Bakong (' + (e?.message || e) + '). Usually the IP is blocked outside Cambodia.' });
  }
});

/* ---------- Wedding invitation link previews (Telegram, Messenger, Facebook...) ----------
   The site is a single-page app, so every link would show the same generic card. For /i/:slug we read the
   PUBLISHED invitation (public data only, with the anon key) and write its own title, description and picture into
   index.html before it is sent. No new packages; any failure falls back to the normal page. */
const KH_D = '០១២៣៤៥៦៧៨៩';
const KH_M = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
const khDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); if (!m) return ''; const kh = n => String(n).replace(/\d/g, c => KH_D[+c]); return `ថ្ងៃទី${kh(+m[3])} ខែ${KH_M[+m[2] - 1]} ឆ្នាំ${kh(m[1])}`; };
const escAttr = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ogCache = new Map();
let indexHtml = null;
async function inviteMeta(slug) {
  const hit = ogCache.get(slug);
  if (hit && Date.now() - hit.t < 60_000) return hit.v;
  let v = null;
  try {
    if (SB.url && SB.anon && /^[a-z0-9][a-z0-9-]{2,60}$/.test(slug)) {
      const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 2500);
      const r = await fetch(`${SB.url}/rest/v1/wedding_invitations?slug=eq.${encodeURIComponent(slug)}&published=eq.true&select=title,data&limit=1`, { headers: { apikey: SB.anon, Authorization: `Bearer ${SB.anon}` }, signal: ac.signal });
      clearTimeout(to);
      if (r.ok) { const rows = await r.json(); if (rows[0]) v = rows[0]; }
    }
  } catch { /* fall back to the plain page */ }
  ogCache.set(slug, { t: Date.now(), v });
  if (ogCache.size > 500) ogCache.delete(ogCache.keys().next().value);
  return v;
}
app.get(['/i/:slug', '/i/:slug/:code'], shield.limiter('og', 240), async (req, res, next) => {
  try {
    const row = await inviteMeta(String(req.params.slug).toLowerCase());
    if (!row) return next();
    if (!indexHtml) indexHtml = (await import('node:fs')).readFileSync(path.join(distPath, 'index.html'), 'utf8');
    const d = row.data || {}, c = d.cine || {};
    const names = [d.groom, d.bride].filter(Boolean).join(' & ') || [c.groomEn, c.brideEn].filter(Boolean).join(' & ') || row.title || 'Wedding invitation';
    const when = khDate(d.date);
    const title = `${names} · សិរីសួស្តីអាពាហ៍ពិពាហ៍`;
    const desc = `សូមគោរពអញ្ជើញចូលរួមក្នុងពិធីអាពាហ៍ពិពាហ៍${when ? ' · ' + when : ''} — You are invited to our wedding`;
    const img = [c.ogImage, d.opening && d.opening.image, d.gallery && d.gallery[0]].find(u => typeof u === 'string' && /^https:\/\//.test(u)) || '';
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol).split(',')[0];
    const origin = (env.PUBLIC_URL || `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`).replace(/\/$/, '');
    const tags = [
      `<title>${escAttr(title)}</title>`,
      '<meta property="og:type" content="website">', '<meta property="og:locale" content="km_KH">', '<meta property="og:site_name" content="YN Studio">',
      `<meta property="og:title" content="${escAttr(title)}">`, `<meta property="og:description" content="${escAttr(desc)}">`, `<meta property="og:url" content="${escAttr(origin + req.originalUrl)}">`,
      img ? `<meta property="og:image" content="${escAttr(img)}">` : '', img && c.ogImage ? '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">' : '',
      `<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}">`, `<meta name="twitter:title" content="${escAttr(title)}">`, `<meta name="twitter:description" content="${escAttr(desc)}">`, img ? `<meta name="twitter:image" content="${escAttr(img)}">` : '',
      `<meta name="description" content="${escAttr(desc)}">`, '<meta name="theme-color" content="#14160c">',
    ].filter(Boolean).join('\n    ');
    const html = indexHtml.replace(/<title>[\s\S]*?<\/title>/i, '').replace(/<meta\s+(?:property="og:[^"]*"|name="(?:twitter:[^"]*|description)")[^>]*>\s*/gi, '').replace('</head>', `    ${tags}\n  </head>`);
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' }).send(html);
  } catch { next(); }
});

app.use(express.static(distPath));
app.get('/{*splat}', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(distPath, 'index.html'));
});

// Last-resort error handler: never leak stack traces / internal messages; count malformed payloads as mild abuse.
app.use((err, req, res, _next) => {
  const status = Number(err?.status || err?.statusCode) || 500;
  if (status >= 500) console.error('unhandled error', err);
  else shield?.strike(req.sec?.ip || 'unknown', 'bad_payload', 1, { method: req.method, path: String(req.originalUrl || '').split('?')[0], ua: req.get?.('user-agent'), details: { status, type: err?.type } });
  if (res.headersSent) return;
  res.status(status >= 400 && status < 600 ? status : 500).json({ error: status === 413 ? 'Request too large.' : status < 500 ? 'Bad request.' : 'Server error.' });
});
process.on('unhandledRejection', e => console.error('unhandledRejection', e));

const port = Number(process.env.PORT || 3000);
shield.init().catch(e => console.warn('[security] init failed (shield keeps working in memory):', e?.message || e));
app.listen(port, () => console.log(`YN Studio server listening on ${port}${abaEnabled() ? ' (ABA PayWay ' + (ABA.base.includes('sandbox') ? 'sandbox' : 'production') + ')' : ''}${bakongEnabled() ? ' (Bakong KHQR ' + BK.account + ')' : ''}`));
