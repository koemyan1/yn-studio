// Paid software downloads ($1 per file by default). Setup: docs/setup/SOFTWARE-DOWNLOADS-SETUP.md
//
//   POST /api/software/buy       { file_id } -> creates (or reuses) the unpaid purchase and its Bakong KHQR
//   POST /api/software/status    { file_id } -> asks Bakong whether the QR was paid; only then is the purchase marked paid
//   POST /api/software/download  { file_id } -> after payment only: a short-lived download link (or the admin's link)
//
// The browser is never trusted for money or for the file location: it sends a file id. The price is read from
// software_files with the service-role key, and the real file path / link lives in software_sources, which no
// customer can read. Same payment shape and safety net as the service shop (server/serviceShop.js).
import { isUuid } from '../shared/serviceMath.js';

export const STALE_MS = 48 * 3600 * 1000;      // an unpaid purchase is cancelled (never deleted) after 48 hours
export const LINK_SECONDS = 120;               // a download link works for two minutes
const OPEN_UNPAID_MAX = 10;
export const swNo = id => 'SW-' + String(id).replace(/-/g, '').slice(0, 8).toUpperCase();
const FIELDS = 'id,user_id,file_id,title,price,status,bakong_md5s,download_count,created_at';

export function createSoftwareShop(deps) {
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

  const fileOf = async id => (await sb(`software_files?id=eq.${id}&enabled=eq.true&select=id,title_en,price,file_name&limit=1`))?.[0] || null;
  const purchasesOf = (userId, fileId, extra = '') => sb(`software_purchases?user_id=eq.${userId}&file_id=eq.${fileId}${extra}&select=${FIELDS}&order=created_at.desc&limit=10`);

  /** Reads and checks the file id from the request body. */
  function fileId(res, body) {
    const id = String(body?.file_id || '');
    if (!isUuid(id)) { res.status(400).json({ error: 'Invalid file.' }); return null; }
    return id;
  }

  async function qrFor(p) {
    const q = await makeBakongQr({ id: p.id, total: p.price, order_number: swNo(p.id) });
    await sb(`software_purchases?id=eq.${p.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ bakong_md5s: [...(p.bakong_md5s || []), q.md5].slice(-10), payment_method: 'Bakong KHQR' }) });
    return { file_id: p.file_id, order_number: swNo(p.id), image: q.image, amount: q.amount, currency: BK.currency, expiresAt: q.expiresAt, merchant: BK.name, total: Number(p.price) };
  }

  /** Bakong confirmed the money -> mark the purchase paid exactly once. */
  async function verifyPurchase(p) {
    if (p.status === 'paid') return true;
    if (p.status !== 'awaiting_payment') return false;
    const f = await findBakongPayment(p.bakong_md5s, p.price, `software ${p.id}`);
    if (!f || f.mismatch) return false;
    const updated = await sb(`software_purchases?id=eq.${p.id}&status=eq.awaiting_payment`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'paid', payment_method: 'Bakong KHQR', bakong_hash: f.hash, paid_at: new Date(now()).toISOString() }),
    });
    if (Array.isArray(updated) && updated.length) await notifyAdmin('Software sold', `${swNo(p.id)} (${p.title || 'software'}) was paid with Bakong KHQR.`, '/admin/software');
    return true;
  }

  /** Unpaid for 48 hours -> cancelled (never deleted). One last Bakong check first, so a late payment is never lost. */
  let lastSweep = 0;
  async function sweepStale(force = false) {
    if (!force && now() - lastSweep < 600000) return 0;
    lastSweep = now();
    const cutoff = new Date(now() - STALE_MS).toISOString();
    const rows = await sb(`software_purchases?status=eq.awaiting_payment&created_at=lt.${cutoff}&select=${FIELDS}&limit=50`).catch(() => []);
    let n = 0;
    for (const p of rows || []) {
      if (bakongEnabled() && (p.bakong_md5s || []).length && await verifyPurchase(p).catch(() => false)) continue;
      const r = await sb(`software_purchases?id=eq.${p.id}&status=eq.awaiting_payment`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: 'cancelled' }) }).catch(() => null);
      if (Array.isArray(r) && r.length) n++;
    }
    return n;
  }

  /** Safety net used by /api/bakong/sync: re-check this customer's recent unpaid purchases. */
  async function syncForUser(userId, sinceIso) {
    let updated = 0;
    const rows = await sb(`software_purchases?user_id=eq.${userId}&status=eq.awaiting_payment&created_at=gte.${sinceIso}&select=${FIELDS}&order=created_at.desc&limit=5`).catch(() => []);
    for (const p of rows || []) if (await verifyPurchase(p)) updated++;
    sweepStale().catch(() => {});
    return updated;
  }

  /** A short-lived link to the private file. */
  const signUrl = deps.signUrl || (async (path, name) => {
    const r = await fetch(`${SB.url}/storage/v1/object/sign/software-files/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST', headers: { apikey: SB.service, Authorization: `Bearer ${SB.service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: LINK_SECONDS }),
    });
    if (!r.ok) return '';
    const j = await r.json().catch(() => ({}));
    const rel = j.signedURL || j.signedUrl || '';
    return rel ? `${SB.url}/storage/v1${rel.startsWith('/') ? '' : '/'}${rel}&download=${encodeURIComponent(name || '')}` : '';
  });

  /* ---------------------------------------------------------------- routes */
  app.post('/api/software/buy', jsonBody, async (req, res) => {
    try {
      const user = await gate(req, res, 'sw-buy', 20, { needBakong: true }); if (!user) return;
      const fid = fileId(res, req.body); if (!fid) return;
      const file = await fileOf(fid);
      if (!file) return res.status(404).json({ error: 'This file is not available right now.' });
      const mine = (await purchasesOf(user.id, fid)) || [];
      if (mine.some(p => p.status === 'paid')) return res.json({ paid: true });
      const fresh = mine.find(p => p.status === 'awaiting_payment' && now() - new Date(p.created_at).getTime() <= STALE_MS && Number(p.price) === Number(file.price));
      if (fresh) return res.json(await qrFor(fresh));
      if (shield.userLimited(user.id, 'sw-buy-hour', 30, 3600000, req)) return res.status(429).json({ error: 'Too many tries. Please wait a while.' });
      const since = new Date(now() - STALE_MS).toISOString();
      const open = await sb(`software_purchases?user_id=eq.${user.id}&status=eq.awaiting_payment&created_at=gte.${since}&select=id&limit=${OPEN_UNPAID_MAX}`);
      if ((open || []).length >= OPEN_UNPAID_MAX) return res.status(429).json({ error: 'You have several unpaid downloads. Please pay or wait for them to expire first.' });
      if (!(Number(file.price) > 0)) return res.status(400).json({ error: 'This file has no price set.' });
      sweepStale().catch(() => {});
      // the price comes from the database row, never from the browser
      const row = (await sb('software_purchases', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ user_id: user.id, file_id: file.id, title: String(file.title_en).slice(0, 80), price: Number(file.price), currency: 'USD' }),
      }))?.[0];
      if (!row) throw new Error('insert returned nothing');
      res.json(await qrFor(row));
    } catch (e) {
      log.error('software buy', e);
      res.status(500).json({ error: 'Could not create the payment. Please try again.' });
    }
  });

  app.post('/api/software/status', jsonBody, async (req, res) => {
    try {
      const user = await gate(req, res, 'sw-status', 90, { needBakong: true }); if (!user) return;
      const fid = fileId(res, req.body); if (!fid) return;
      const mine = (await purchasesOf(user.id, fid)) || [];
      if (mine.some(p => p.status === 'paid')) return res.json({ paid: true, delayed: false });
      let paid = false;
      for (const p of mine.filter(x => x.status === 'awaiting_payment').slice(0, 3)) if (await verifyPurchase(p)) { paid = true; break; }
      res.json({ paid, delayed: !paid && bakongDelayed() });
    } catch (e) {
      log.error('software status', e);
      res.status(500).json({ error: 'Could not check the payment. Please try again.' });
    }
  });

  app.post('/api/software/download', jsonBody, async (req, res) => {
    try {
      const user = await gate(req, res, 'sw-dl', 12); if (!user) return;
      if (shield.userLimited(user.id, 'sw-dl-hour', 60, 3600000, req)) return res.status(429).json({ error: 'Too many downloads. Please wait a while.' });
      const fid = fileId(res, req.body); if (!fid) return;
      const paid = ((await purchasesOf(user.id, fid, '&status=eq.paid')) || [])[0];
      if (!paid) return res.status(402).json({ error: 'Please pay for this file first.', code: 'unpaid' });   // checked here, on the server, every time
      const src = (await sb(`software_sources?file_id=eq.${fid}&select=kind,file_path,external_url&limit=1`))?.[0];
      const file = (await sb(`software_files?id=eq.${fid}&select=file_name&limit=1`))?.[0];
      if (!src) return res.status(404).json({ error: 'This file is not ready yet. Please contact us.' });
      let url = '';
      if (src.kind === 'link') url = src.external_url || '';
      else if (src.file_path) url = await signUrl(src.file_path, file?.file_name || 'download');
      if (!url) return res.status(502).json({ error: 'Could not prepare the download. Please try again.' });
      sb(`software_purchases?id=eq.${paid.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ download_count: Number(paid.download_count || 0) + 1, last_download_at: new Date(now()).toISOString() }) }).catch(() => {});
      res.json({ url, name: file?.file_name || '', kind: src.kind });
    } catch (e) {
      log.error('software download', e);
      res.status(500).json({ error: 'Could not prepare the download. Please try again.' });
    }
  });

  const timer = setInterval(() => { if (SB.url && SB.service) sweepStale(true).catch(() => {}); }, 3600000);
  timer.unref?.();
  return { verifyPurchase, syncForUser, sweepStale };
}
