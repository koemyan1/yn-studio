// Book cover service (250 riel per page by default). Setup: docs/setup/BOOK-COVERS-SETUP.md
//
//   POST /api/bookcover/save     { order_id?, items:[{ design_id, covers:[{values}] }] } -> creates / updates the UNPAID order, price computed here
//                                (one order can hold several DIFFERENT designs, each with its own pages; the old { design_id, covers } shape still works)
//   POST /api/bookcover/contact  { order_id, name, phone, address, notes, lat, lng } -> phone + location (also fills an empty profile)
//   POST /api/bookcover/pay      { order_id } -> one-time KHQR in RIEL for exactly pages x price (refused until phone + location are saved)
//   POST /api/bookcover/status   { order_id } -> asks Bakong; only then is the order marked paid
//   POST /api/bookcover/layout   { order_id, items:[{ covers:[{pos}] }], submit? } -> after payment: where each text sits; submit = "send to print"
//
// The browser is never trusted for money: it sends a design id and the texts. The price is read from book_cover_designs with the
// service-role key (and frozen on the order), the amount Bakong must confirm is that exact riel amount, and the admin is told only then.
import { isUuid } from '../shared/serviceMath.js';
import { bcNo, buildOrder, cleanFields, cleanLayout, cleanPricePerPage, designsLabel, orderItems, validateContact, MAX_ITEMS } from '../shared/bookCoverMath.js';

const OPEN_UNPAID_MAX = 10;
const FIELDS = 'id,user_id,design_id,design_name,design_image,design_fields,covers,items,pages,price_per_page,total,status,phone,address,bakong_md5s,created_at';

export function createBookCoverShop(deps) {
  const { app, sb, SB, BK, userFromToken, shield, limited, bakongEnabled, makeBakongQr, findBakongPayment, bakongDelayed, notifyAdmin, log = console } = deps;
  const jsonBody = deps.jsonBody;   // index.js passes a 300 kb parser: covers can hold Khmer text (3 bytes a letter)

  async function gate(req, res, name, max, { needBakong = false } = {}) {
    if (!(SB.url && SB.service && SB.anon)) { res.status(503).json({ error: 'The server is not connected to the database yet.' }); return null; }
    if (needBakong && !bakongEnabled()) { res.status(503).json({ error: 'Bakong KHQR is not configured on the server yet.', code: 'no_bakong' }); return null; }
    if (limited(req, 120)) { res.status(429).json({ error: 'Too many requests. Please wait a moment.' }); return null; }
    const user = await userFromToken(req);
    if (!user) { res.status(401).json({ error: 'Please sign in again.' }); return null; }
    if (shield.userLimited(user.id, name, max, 60000, req)) { res.status(429).json({ error: 'Too many requests. Please wait a moment.' }); return null; }
    return user;
  }

  /** The signed-in customer's own order, or an error response. */
  async function ownOrder(res, user, id) {
    const oid = String(id || '');
    if (!isUuid(oid)) { res.status(400).json({ error: 'Invalid order.' }); return null; }
    const o = (await sb(`book_cover_orders?id=eq.${oid}&select=${FIELDS}&limit=1`))?.[0];
    if (!o || o.user_id !== user.id) { res.status(404).json({ error: 'Order not found.' }); return null; }
    return o;
  }

  const isPaidStatus = s => s === 'paid' || s === 'submitted' || s === 'printed' || s === 'delivered';

  async function qrFor(o) {
    // Riel, whole amount: the QR and the check both use exactly o.total
    const q = await makeBakongQr({ id: o.id, total: o.total, order_number: bcNo(o.id) }, { currency: 'KHR', exactAmount: o.total });
    await sb(`book_cover_orders?id=eq.${o.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ bakong_md5s: [...(o.bakong_md5s || []), q.md5].slice(-10), payment_method: 'Bakong KHQR' }) });
    return { order_id: o.id, order_number: bcNo(o.id), image: q.image, amount: q.amount, currency: 'KHR', expiresAt: q.expiresAt, merchant: BK.name, total: o.total };
  }

  /** Bakong confirmed exactly o.total riel -> mark the order paid exactly once and tell the admin. */
  async function verifyOrder(o) {
    if (isPaidStatus(o.status)) return true;
    if (o.status !== 'pending') return false;
    const f = await findBakongPayment(o.bakong_md5s, o.total, `book cover ${o.id}`, { amount: o.total, currency: 'KHR' });
    if (!f || f.mismatch) return false;
    const updated = await sb(`book_cover_orders?id=eq.${o.id}&status=eq.pending`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'paid', payment_method: 'Bakong KHQR', bakong_hash: f.hash, paid_at: new Date().toISOString() }),
    });
    if (Array.isArray(updated) && updated.length) {
      const n = orderItems(o).length;
      await notifyAdmin('Book cover paid', `${bcNo(o.id)} · ${n > 1 ? `${n} designs · ` : ''}${o.pages} page${o.pages === 1 ? '' : 's'} · ${Number(o.total).toLocaleString('en-US')} KHR was paid with Bakong KHQR.`, '/admin/book-covers');
    }
    return true;
  }

  /** Safety net used by /api/bakong/sync: re-check this customer's recent unpaid book cover orders. */
  async function syncForUser(userId, sinceIso) {
    let updated = 0;
    const rows = await sb(`book_cover_orders?user_id=eq.${userId}&status=eq.pending&created_at=gte.${sinceIso}&select=${FIELDS}&order=created_at.desc&limit=5`).catch(() => []);
    for (const o of rows || []) if ((o.bakong_md5s || []).length && await verifyOrder(o).catch(() => false)) updated++;
    return updated;
  }

  /* ---------------------------------------------------------------- routes */
  app.post('/api/bookcover/save', jsonBody, async (req, res) => {
    try {
      const user = await gate(req, res, 'bc-save', 30); if (!user) return;
      const b = req.body || {};
      let order = null;
      if (b.order_id) {
        order = await ownOrder(res, user, b.order_id); if (!order) return;
        if (order.status !== 'pending') return res.status(409).json({ error: 'This order is already paid, so the texts are locked.', code: 'locked' });
      }
      const own = order ? orderItems(order) : [];
      // New shape: items:[{design_id, covers}]. Old shape: one design + covers (for an open order, the design it already has).
      const rawItems = Array.isArray(b.items) ? b.items
        : Array.isArray(b.covers) ? [{ design_id: order ? (own[0]?.design_id || '') : b.design_id, covers: b.covers }] : [];
      // Resolve every design the browser named. A design that is already on this order keeps its frozen copy (price included);
      // a new one is read from the database and must be switched on. The browser never says what anything costs.
      const known = new Map();
      for (const r of rawItems.slice(0, MAX_ITEMS + 1)) {
        const id = String(r?.design_id || '');
        if (known.has(id)) continue;
        const snap = own.find(x => String(x.design_id || '') === id);
        if (snap) { known.set(id, { id: snap.design_id, name: snap.design_name, image: snap.design_image, price_per_page: snap.price_per_page, fields: snap.design_fields }); continue; }
        if (!isUuid(id)) return res.status(400).json({ error: 'Invalid design.' });
        const d = (await sb(`book_cover_designs?id=eq.${id}&enabled=eq.true&select=id,name_en,image_url,price_per_page,fields&limit=1`))?.[0];
        if (!d) return res.status(404).json({ error: 'This design is not available right now.' });
        known.set(id, { id: d.id, name: d.name_en, image: d.image_url, price_per_page: cleanPricePerPage(d.price_per_page), fields: d.fields });
      }
      const built = buildOrder(rawItems, id => known.get(id));
      if (built.error) return res.status(400).json({ error: built.error });
      const { items, pages, total } = built;                // total = sum over designs of pages x that design's price
      const first = items[0];
      // The old single-design columns mirror the first design so nothing that still reads them breaks.
      const mirror = { design_id: first.design_id, design_name: designsLabel(items), design_image: first.design_image, design_fields: first.design_fields, covers: first.covers, price_per_page: first.price_per_page };
      const summary = items.map(it => ({ design_id: it.design_id, name: it.design_name, pages: it.covers.length, price_per_page: it.price_per_page }));
      if (order) {
        await sb(`book_cover_orders?id=eq.${order.id}&status=eq.pending`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ...mirror, items, pages, total, updated_at: new Date().toISOString() }) });
        return res.json({ id: order.id, pages, total, price_per_page: first.price_per_page, items: summary, status: 'pending' });
      }
      if (shield.userLimited(user.id, 'bc-new-hour', 30, 3600000, req)) return res.status(429).json({ error: 'Too many tries. Please wait a while.' });
      const open = await sb(`book_cover_orders?user_id=eq.${user.id}&status=eq.pending&select=id&limit=${OPEN_UNPAID_MAX}`);
      if ((open || []).length >= OPEN_UNPAID_MAX) return res.status(429).json({ error: 'You have several unpaid covers. Please pay for them or delete them first.' });
      const row = (await sb('book_cover_orders', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ user_id: user.id, ...mirror, items, pages, total, currency: 'KHR' }),
      }))?.[0];
      if (!row) throw new Error('insert returned nothing');
      res.json({ id: row.id, pages, total, price_per_page: first.price_per_page, items: summary, status: row.status });
    } catch (e) {
      log.error('bookcover save', e);
      res.status(500).json({ error: 'Could not save your covers. Please try again.' });
    }
  });

  app.post('/api/bookcover/contact', jsonBody, async (req, res) => {
    try {
      const user = await gate(req, res, 'bc-contact', 30); if (!user) return;
      const o = await ownOrder(res, user, req.body?.order_id); if (!o) return;
      if (o.status === 'printed' || o.status === 'delivered' || o.status === 'cancelled') return res.status(409).json({ error: 'This order can no longer be changed.' });
      const v = validateContact(req.body);
      if (!v.ok) return res.status(400).json({ error: v.error, code: v.code });
      const c = v.contact;
      await sb(`book_cover_orders?id=eq.${o.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ contact_name: c.name, phone: c.phone, address: c.address, notes: c.notes, lat: c.lat, lng: c.lng, updated_at: new Date().toISOString() }) });
      // "if they haven't": only fill what the customer's profile is still missing. Nothing already saved there is overwritten.
      try {
        const p = (await sb(`profiles?user_id=eq.${user.id}&select=name,phone,delivery_address,delivery_lat,delivery_lng&limit=1`))?.[0];
        if (p) {
          const patch = {};
          if (!String(p.phone || '').trim()) patch.phone = c.phone;
          if (!String(p.delivery_address || '').trim()) { patch.delivery_address = c.address; if (c.notes) patch.delivery_notes = c.notes; if (c.lat != null) { patch.delivery_lat = c.lat; patch.delivery_lng = c.lng; } }
          if (!String(p.name || '').trim() && c.name) patch.name = c.name;
          if (Object.keys(patch).length) await sb(`profiles?user_id=eq.${user.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
        }
      } catch (e) { log.warn?.('bookcover profile fill', e?.message || e); }
      res.json({ ok: true });
    } catch (e) {
      log.error('bookcover contact', e);
      res.status(500).json({ error: 'Could not save your phone and location. Please try again.' });
    }
  });

  app.post('/api/bookcover/pay', jsonBody, async (req, res) => {
    try {
      const user = await gate(req, res, 'bc-pay', 20, { needBakong: true }); if (!user) return;
      const o = await ownOrder(res, user, req.body?.order_id); if (!o) return;
      if (isPaidStatus(o.status)) return res.json({ paid: true });
      if (o.status !== 'pending') return res.status(409).json({ error: 'This order is cancelled.' });
      if (!String(o.phone || '').trim() || !String(o.address || '').trim()) return res.status(400).json({ error: 'Please add your phone number and location first.', code: 'no_contact' });
      if (!(Number(o.total) > 0)) return res.status(400).json({ error: 'This order has no amount to pay.' });
      if (shield.userLimited(user.id, 'bc-pay-hour', 40, 3600000, req)) return res.status(429).json({ error: 'Too many tries. Please wait a while.' });
      res.json(await qrFor(o));
    } catch (e) {
      log.error('bookcover pay', e);
      res.status(500).json({ error: 'Could not create the KHQR. Please try again.' });
    }
  });

  app.post('/api/bookcover/status', jsonBody, async (req, res) => {
    try {
      const user = await gate(req, res, 'bc-status', 90, { needBakong: true }); if (!user) return;
      const o = await ownOrder(res, user, req.body?.order_id); if (!o) return;
      const paid = await verifyOrder(o);
      res.json({ paid, delayed: !paid && bakongDelayed() });
    } catch (e) {
      log.error('bookcover status', e);
      res.json({ paid: false });
    }
  });

  app.post('/api/bookcover/layout', jsonBody, async (req, res) => {
    try {
      const user = await gate(req, res, 'bc-layout', 40); if (!user) return;
      const o = await ownOrder(res, user, req.body?.order_id); if (!o) return;
      if (o.status !== 'paid' && o.status !== 'submitted') return res.status(409).json({ error: o.status === 'pending' ? 'Please pay first.' : 'This order can no longer be changed.', code: o.status === 'pending' ? 'unpaid' : 'locked' });
      // One entry per design, in the order's own order. The old shape (covers:[{pos}] for a single-design order) still works.
      const own = orderItems(o);
      const rawItems = Array.isArray(req.body?.items) ? req.body.items : [{ covers: req.body?.covers }];
      const next = own.map((it, k) => {
        const pos = cleanLayout(it.design_fields, rawItems[k]?.covers, it.covers.length);
        return { ...it, covers: it.covers.map((c, i) => ({ values: c.values || {}, pos: pos[i] })) };
      });
      const submit = req.body?.submit === true;
      const patch = { items: next, covers: next[0]?.covers || [], updated_at: new Date().toISOString() };
      if (submit) { patch.status = 'submitted'; patch.submitted_at = new Date().toISOString(); }
      await sb(`book_cover_orders?id=eq.${o.id}&status=in.(paid,submitted)`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
      if (submit) await notifyAdmin('Book covers ready to print', `${bcNo(o.id)} · ${own.length > 1 ? `${own.length} designs · ` : ''}${o.pages} page${o.pages === 1 ? '' : 's'} · the customer finished the layout.`, '/admin/book-covers');
      res.json({ ok: true, status: submit ? 'submitted' : o.status });
    } catch (e) {
      log.error('bookcover layout', e);
      res.status(500).json({ error: 'Could not save the layout. Please try again.' });
    }
  });

  return { syncForUser, verifyOrder };
}
