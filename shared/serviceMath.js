/* YN Studio - service shop price maths. ONE source of truth, used by the server (real total) and the browser (live preview).
   Plain JS with no imports so Node and Vite can both load it. Types: serviceMath.d.ts.

   How a price is built (all money is handled in whole cents, so there is no floating-point drift):
     Q         = quantity x every "quantity" number group (for example pages x copies). Capped at MAX_UNITS.
     base      = chosen base price amount, x Q when its unit is page | copy | item, x 1 when its unit is job.
     options   = fixed amount (once per job) | per unit (x Q) | percent (of the base subtotal only).
                 A number group (not a quantity) with one option charges that option x the number entered.
     subtotal  = base + options
     delivery  = the admin's delivery settings (same rule as src/deliveryFee.ts calcFee), only for fulfilment "delivery".
     total     = subtotal + delivery
   The browser total is only a preview: the server runs this same function on the catalog it loads itself. */

export const MAX_QTY = 1000;            // the "quantity" field of a request
export const MAX_UNITS = 100000;        // quantity x quantity-groups
export const MAX_TEXT = 1000;           // one text answer
export const MAX_DELIVERY_KM = 100;     // sanity limit so a forged pin cannot produce a nonsense fee
export const MAX_TOTAL_CENTS = 100000 * 100; // $100,000 hard ceiling
export const PHYSICAL_FULFILMENTS = ['pickup', 'delivery'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = v => typeof v === 'string' && UUID.test(v);

export const toCents = n => Math.round(Number(n) * 100 + 1e-9);
export const fromCents = c => Math.round(c) / 100;
const fail = (code, error) => ({ ok: false, code, error });

/** Straight-line distance in km (haversine). Same formula as src/deliveryFee.ts. */
export function distanceKm(a, b) {
  const R = 6371, rad = d => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Same rule as calcFee in src/deliveryFee.ts (a test keeps the two identical). */
export function calcDeliveryFee(cfg, store, to) {
  const km = distanceKm(store, to);
  const baseFee = Number(cfg?.base_fee ?? 1), baseKm = Number(cfg?.base_km ?? 2);
  const extraFee = Number(cfg?.extra_fee ?? 0.5), extraKm = Math.max(0.1, Number(cfg?.extra_km ?? 1));
  const steps = Math.max(0, Math.ceil((km - baseKm) / extraKm));
  return { km, fee: Math.max(0, baseFee + steps * extraFee) };
}

export const validCoord = (lat, lng) => typeof lat === 'number' && typeof lng === 'number'
  && Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

/** Phone: optional +, 8 to 15 digits, spaces / dashes / brackets allowed. Returns the cleaned number or '' when invalid. */
export function cleanPhone(v) {
  const s = String(v ?? '').trim();
  if (!/^\+?[0-9 ()-]{8,24}$/.test(s)) return '';
  const digits = s.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 ? s.replace(/\s+/g, ' ') : '';
}

/** Trim, drop control characters, cap the length. Never returns non-strings. */
export function cleanText(v, max = MAX_TEXT) {
  return String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

const optLabel = o => ({ en: String(o.label_en || ''), km: String(o.label_km || '') });

/**
 * @param input {
 *   service:  { key, kind: 'physical' | 'digital' },
 *   prices:   [{ id, label_en, label_km, amount, unit, enabled }],
 *   groups:   [{ id, label_en, label_km, type, required, is_quantity, min_value, max_value, enabled, options: [{ id, label_en, label_km, price_type, price, enabled }] }],
 *   selection:{ price_id, quantity?, groups: { [groupId]: string | string[] | number } },
 *   fulfilment?: 'pickup' | 'delivery',  deliveryCfg?, deliveryPoint?: { lat, lng }
 * }
 * @returns { ok: true, quote } | { ok: false, code, error }
 */
export function computeQuote(input) {
  const { service, prices = [], groups = [], selection, fulfilment, deliveryCfg, deliveryPoint } = input || {};
  if (!service || !selection || typeof selection !== 'object') return fail('bad_request', 'The request is incomplete.');

  // ---- base price
  const livePrices = prices.filter(p => p.enabled !== false);
  const price = livePrices.find(p => String(p.id) === String(selection.price_id));
  if (!price) return fail('bad_price', 'Please choose one of the prices.');
  const amountCents = toCents(price.amount);
  if (!Number.isFinite(amountCents) || amountCents < 0) return fail('bad_price', 'This price is not available.');

  // ---- quantity
  const qty = selection.quantity === undefined || selection.quantity === null ? 1 : selection.quantity;
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return fail('bad_quantity', `Quantity must be a whole number from 1 to ${MAX_QTY}.`);

  const answers = selection.groups && typeof selection.groups === 'object' && !Array.isArray(selection.groups) ? selection.groups : {};
  const liveGroups = groups.filter(g => g.enabled !== false);
  const byId = new Map(liveGroups.map(g => [String(g.id), g]));
  for (const id of Object.keys(answers)) if (!byId.has(id)) return fail('bad_group', 'One of the choices does not belong to this service.');

  // ---- read + validate every group
  const parsed = []; // { g, kind, value, options: [opt] }
  let units = qty;
  for (const g of liveGroups) {
    const raw = answers[String(g.id)];
    const opts = (g.options || []).filter(o => o.enabled !== false);
    const label = g.label_en || 'A choice';
    if (g.type === 'single') {
      if (raw === undefined || raw === null || raw === '') { if (g.required) return fail('missing', `Please choose: ${label}.`); continue; }
      if (typeof raw !== 'string') return fail('bad_option', `Invalid choice for: ${label}.`);
      const o = opts.find(x => String(x.id) === raw);
      if (!o) return fail('bad_option', `Invalid choice for: ${label}.`);
      parsed.push({ g, value: raw, options: [o] });
    } else if (g.type === 'multi') {
      const arr = raw === undefined || raw === null ? [] : raw;
      if (!Array.isArray(arr) || arr.length > opts.length) return fail('bad_option', `Invalid choice for: ${label}.`);
      if (new Set(arr).size !== arr.length) return fail('bad_option', `Invalid choice for: ${label}.`);
      const chosen = [];
      for (const id of arr) {
        const o = typeof id === 'string' ? opts.find(x => String(x.id) === id) : null;
        if (!o) return fail('bad_option', `Invalid choice for: ${label}.`);
        chosen.push(o);
      }
      if (!chosen.length) { if (g.required) return fail('missing', `Please choose at least one: ${label}.`); continue; }
      parsed.push({ g, value: arr, options: chosen });
    } else if (g.type === 'number') {
      const min = Number.isFinite(Number(g.min_value)) ? Math.trunc(Number(g.min_value)) : 1;
      const max = Number.isFinite(Number(g.max_value)) ? Math.trunc(Number(g.max_value)) : 1000;
      if (raw === undefined || raw === null || raw === '') {
        if (g.required) return fail('missing', `Please enter: ${label}.`);
        if (min > 0) continue;
        parsed.push({ g, value: 0, options: opts.slice(0, 1) }); continue;
      }
      if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < min || raw > max) return fail('bad_number', `${label} must be a whole number from ${min} to ${max}.`);
      parsed.push({ g, value: raw, options: opts.slice(0, 1) });
      if (g.is_quantity) { units *= raw; if (units > MAX_UNITS) return fail('too_big', 'That quantity is too large. Please contact us for big jobs.'); }
    } else if (g.type === 'text') {
      if (raw === undefined || raw === null || raw === '') { if (g.required) return fail('missing', `Please fill in: ${label}.`); continue; }
      if (typeof raw !== 'string') return fail('bad_text', `Invalid text for: ${label}.`);
      const t = cleanText(raw);
      if (!t) { if (g.required) return fail('missing', `Please fill in: ${label}.`); continue; }
      parsed.push({ g, value: t, options: [] });
    } else return fail('bad_group', 'This service has an unsupported question.');
  }
  // required groups that were skipped above because they were empty are caught inside each branch; a quantity group with
  // value 0 can never be accepted because min_value >= 1 is enforced when is_quantity is set (see the SQL check).
  if (units < 1 || units > MAX_UNITS) return fail('too_big', 'That quantity is not allowed.');

  // ---- base subtotal
  const perUnit = price.unit === 'job' ? 1 : units;
  const baseCents = amountCents * perUnit;

  // ---- option extras
  const choices = [];
  let extraCents = 0;
  for (const p of parsed) {
    const { g } = p;
    if (g.type === 'text') { choices.push({ group_id: g.id, group_en: g.label_en, group_km: g.label_km, type: 'text', text: p.value, amount: 0 }); continue; }
    const entries = [];
    for (const o of p.options) {
      const pr = toCents(o.price);
      if (!Number.isFinite(pr) || pr < 0) return fail('bad_option', 'An option has an invalid price.');
      const times = g.type === 'number' ? p.value : 1;
      let cents = 0;
      if (o.price_type === 'fixed') cents = pr * times;
      else if (o.price_type === 'per_unit') cents = pr * units * times;
      else if (o.price_type === 'percent') cents = Math.round((baseCents * Number(o.price) * times) / 100);
      else return fail('bad_option', 'An option has an unsupported price type.');
      extraCents += cents;
      entries.push({ option_id: o.id, ...(() => { const l = optLabel(o); return { label_en: l.en, label_km: l.km }; })(), price_type: o.price_type, price: Number(o.price), amount: fromCents(cents) });
    }
    choices.push({ group_id: g.id, group_en: g.label_en, group_km: g.label_km, type: g.type, ...(g.type === 'number' ? { number: p.value, is_quantity: !!g.is_quantity } : {}), options: entries, amount: fromCents(entries.reduce((s, e) => s + toCents(e.amount), 0)) });
  }
  const subtotalCents = baseCents + extraCents;

  // ---- fulfilment + delivery
  let fulfil = 'digital', feeCents = 0, km = null;
  if (service.kind === 'physical') {
    if (!PHYSICAL_FULFILMENTS.includes(fulfilment)) return fail('bad_fulfilment', 'Please choose pick up or delivery.');
    fulfil = fulfilment;
    if (fulfil === 'delivery') {
      const lat = deliveryPoint?.lat, lng = deliveryPoint?.lng;
      if (!validCoord(lat, lng)) return fail('bad_location', 'Please choose your delivery location on the map.');
      const store = { lat: Number(deliveryCfg?.store_lat), lng: Number(deliveryCfg?.store_lng) };
      if (!validCoord(store.lat, store.lng)) return fail('no_store', 'Delivery is not available right now.');
      const r = calcDeliveryFee(deliveryCfg, store, { lat, lng });
      if (r.km > MAX_DELIVERY_KM) return fail('too_far', 'That location is too far for delivery. Please choose pick up.');
      km = Math.round(r.km * 100) / 100;
      feeCents = toCents(r.fee);
    }
  } else if (fulfilment && fulfilment !== 'digital') {
    return fail('bad_fulfilment', 'This service is delivered digitally.');
  }

  const totalCents = subtotalCents + feeCents;
  if (!(totalCents > 0)) return fail('zero_total', 'This order has no amount to pay.');
  if (totalCents > MAX_TOTAL_CENTS) return fail('too_big', 'The total is too large. Please contact us.');

  return {
    ok: true,
    quote: {
      service_key: service.key,
      price_id: price.id,
      price_label_en: String(price.label_en || ''), price_label_km: String(price.label_km || ''),
      unit: price.unit,
      unit_price: fromCents(amountCents),
      quantity: units,
      base: fromCents(baseCents),
      extras: fromCents(extraCents),
      subtotal: fromCents(subtotalCents),
      fulfilment: fulfil,
      distance_km: km,
      delivery_fee: fromCents(feeCents),
      total: fromCents(totalCents),
      currency: 'USD',
      choices,
    },
  };
}
