import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const distPath = path.join(__dirname, '..', 'dist');
const env = process.env;

app.set('trust proxy', 1); // Render / most hosts terminate HTTPS in front of Node

// Camera permission for the package scanner in the deployed app/PWA.
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(self)');
  next();
});
app.get('/api/health', (_req, res) => res.json({ ok: true }));

/* ------------------------------------------------------------------ *
 *  ABA PayWay (hosted checkout: ABA Pay, KHQR, cards)
 *  Docs: https://developer.payway.com.kh  — setup guide: ABA-PAYWAY-SETUP.md
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

// very small per-IP rate limit for the authenticated endpoints
const hits = new Map();
function limited(req, max = 30) {
  const k = req.ip, now = Date.now(), arr = (hits.get(k) || []).filter(t => now - t < 60000);
  arr.push(now); hits.set(k, arr);
  return arr.length > max;
}

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

app.get('/api/aba/config', (_req, res) => res.json({ enabled: abaEnabled(), env: ABA.base.includes('sandbox') ? 'sandbox' : 'production', currency: ABA.currency }));

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
app.post('/api/aba/callback', jsonBody, formBody, async (req, res) => {
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

app.use(express.static(distPath));
app.get('/{*splat}', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(distPath, 'index.html'));
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`YN Studio server listening on ${port}${abaEnabled() ? ' (ABA PayWay ' + (ABA.base.includes('sandbox') ? 'sandbox' : 'production') + ')' : ''}`));
