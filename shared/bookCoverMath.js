// Book cover service: the rules the SERVER enforces and the browser re-uses (so the price on screen is the price charged).
// Pure functions only: no network, no database. Tested in tests/book-cover.test.mjs.
import { cleanPhone } from './serviceMath.js';

export const SHEET_W = 794;                 // a cover is drawn on an A4 sheet of 794 x 1123 px (same size the CV maker uses)
export const SHEET_H = 1123;
export const MAX_COVERS = 20;               // pages in one order (all designs together)
export const MAX_ITEMS = 6;                 // different designs in one order
export const MAX_FIELDS = 12;               // questions the admin can add to one design
export const DEFAULT_PRICE_PER_PAGE = 250;  // riel
export const MIN_PRICE_PER_PAGE = 100;
export const MAX_PRICE_PER_PAGE = 100000;
export const FONTS = ['Poppins', 'Montserrat', 'Playfair Display', 'Anton', 'Lato', 'Noto Sans Khmer', 'Battambang', 'Moul', 'Koulen', 'Hanuman'];

const KEY_RE = /^[a-z][a-z0-9_]{0,23}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const clamp = (n, lo, hi, d) => { const v = Number(n); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
/** One line of text: control characters out, spaces squeezed, length capped. */
export const oneLine = (v, max) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** The questions of a design, cleaned. Anything unusable is dropped; numbers are clamped to sensible ranges. */
export function cleanFields(raw) {
  const out = [], seen = new Set();
  for (const f of Array.isArray(raw) ? raw : []) {
    if (!f || typeof f !== 'object') continue;
    const key = String(f.key || '');
    if (!KEY_RE.test(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      label_en: oneLine(f.label_en, 40) || 'Text',
      label_km: oneLine(f.label_km, 40),
      hint_en: oneLine(f.hint_en, 60),
      hint_km: oneLine(f.hint_km, 60),
      required: f.required !== false,
      per_subject: !!f.per_subject,            // true = asked again for every extra subject (e.g. the subject name)
      x: clamp(f.x, 0, 100, 50),               // where the text sits, in % of the sheet (its middle point)
      y: clamp(f.y, 0, 100, 50),
      size: clamp(f.size, 10, 160, 36),        // text size in sheet pixels (794 px wide)
      color: HEX_RE.test(String(f.color || '')) ? String(f.color) : '#1b1b1b',
      font: FONTS.includes(f.font) ? f.font : 'Poppins',
      bold: !!f.bold,
      max: Math.round(clamp(f.max, 1, 120, 60)),
    });
    if (out.length >= MAX_FIELDS) break;
  }
  return out;
}

/** Where a new question starts: in the middle band of the cover, stacked one under the other. The customer can still move it. */
export function defaultSpot(index) {
  return { x: 50, y: Math.min(86, 38 + index * 9) };
}

/** Does this design have a question that changes from subject to subject? Only then is the "other subjects" step shown. */
export const hasSubjectFields = fields => (fields || []).some(f => f.per_subject);

/**
 * Turns what the browser sent into the covers stored on the order.
 * Rules: 1..MAX_COVERS covers; only the design's own keys; shared answers are copied from the first cover (a customer cannot make
 * page 2 say a different name); every required answer must be present on every page.
 */
export function buildCovers(fields, raw) {
  if (!Array.isArray(raw) || raw.length < 1) return { error: 'Add at least one cover.' };
  if (raw.length > MAX_COVERS) return { error: `You can order up to ${MAX_COVERS} pages at once.` };
  const firstSrc = raw[0] && typeof raw[0].values === 'object' && raw[0].values ? raw[0].values : {};
  const first = {};
  for (const f of fields) first[f.key] = oneLine(firstSrc[f.key], f.max);
  const covers = [];
  for (let i = 0; i < raw.length; i++) {
    const src = raw[i] && typeof raw[i].values === 'object' && raw[i].values ? raw[i].values : {};
    const values = {};
    for (const f of fields) {
      const v = i > 0 && !f.per_subject ? first[f.key] : oneLine(src[f.key], f.max);
      if (f.required && !v) return { error: `Please fill in “${f.label_en}”${i > 0 ? ` for page ${i + 1}` : ''}.` };
      values[f.key] = v;
    }
    covers.push({ values, pos: {} });
  }
  return { covers };
}

/** Riel per page x pages. Always whole riel. */
export function orderTotal(pages, perPage) {
  const n = Math.round(Number(pages)), p = Math.round(Number(perPage));
  if (!(n >= 1 && n <= MAX_COVERS) || !(p >= MIN_PRICE_PER_PAGE && p <= MAX_PRICE_PER_PAGE)) return 0;
  return n * p;
}

export function cleanPricePerPage(v) {
  const n = Math.round(Number(v));
  return n >= MIN_PRICE_PER_PAGE && n <= MAX_PRICE_PER_PAGE ? n : DEFAULT_PRICE_PER_PAGE;
}

const cleanStoredCovers = covers => (Array.isArray(covers) ? covers : []).map(c => ({
  values: c && typeof c.values === 'object' && c.values ? c.values : {},
  pos: c && typeof c.pos === 'object' && c.pos ? c.pos : {},
}));

/**
 * The designs of an order, as a list. Orders now keep them in `items` (one entry per design, each with its own pages).
 * Orders made before that kept ONE design in the design_* columns and one `covers` list, so this reads both shapes.
 */
export function orderItems(o) {
  if (Array.isArray(o?.items) && o.items.length) {
    return o.items.map(it => ({
      design_id: it?.design_id || null,
      design_name: String(it?.design_name || ''),
      design_image: String(it?.design_image || ''),
      design_fields: cleanFields(it?.design_fields),
      price_per_page: cleanPricePerPage(it?.price_per_page),
      covers: cleanStoredCovers(it?.covers),
    }));
  }
  return [{
    design_id: o?.design_id || null,
    design_name: String(o?.design_name || ''),
    design_image: String(o?.design_image || ''),
    design_fields: cleanFields(o?.design_fields),
    price_per_page: cleanPricePerPage(o?.price_per_page),
    covers: cleanStoredCovers(o?.covers),
  }];
}

/** Pages in an order, over all its designs. */
export const itemsPages = items => (items || []).reduce((n, it) => n + (it.covers?.length || 0), 0);

/** Riel for a whole order: every design's pages x that design's own price. 0 when anything is out of range. */
export function itemsTotal(items) {
  let sum = 0;
  for (const it of items || []) { const t = orderTotal(it.covers?.length, it.price_per_page); if (!t) return 0; sum += t; }
  return sum;
}

/** "Blue + Red + Green" for lists and notifications. */
export const designsLabel = items => (items || []).map(it => it.design_name).filter(Boolean).join(' + ').slice(0, 120);

/**
 * Turns what the browser sent into the designs stored on the order.
 *   rawItems: [{ design_id, covers:[{values}] }]   lookup(id) -> { id, name, image, price_per_page, fields } or nothing
 * Rules: 1..MAX_ITEMS designs, each design at most once (more subjects = more pages of the SAME design); every design is built with
 * buildCovers (so every rule above still holds per design); all pages together stay within MAX_COVERS; each design is priced by ITS
 * OWN price from lookup and the total is the sum. The browser never supplies a price.
 */
export function buildOrder(rawItems, lookup) {
  if (!Array.isArray(rawItems) || rawItems.length < 1) return { error: 'Add at least one design.' };
  if (rawItems.length > MAX_ITEMS) return { error: `You can order up to ${MAX_ITEMS} designs at once.` };
  const seen = new Set(), items = [];
  let pages = 0, total = 0;
  for (const raw of rawItems) {
    const id = String(raw?.design_id || '');
    if (seen.has(id)) return { error: 'Each design can only be added once. Add more subjects to it instead.' };
    seen.add(id);
    const d = lookup(id);
    if (!d) return { error: 'One of the designs is not available right now.', code: 'design' };
    const fields = cleanFields(d.fields);
    if (!fields.length) return { error: 'This design is not ready yet.' };
    const built = buildCovers(fields, raw?.covers);
    const name = String(d.name || '').slice(0, 60);
    if (built.error) return { error: rawItems.length > 1 && name ? `${name}: ${built.error}` : built.error };
    pages += built.covers.length;
    if (pages > MAX_COVERS) return { error: `You can order up to ${MAX_COVERS} pages at once.` };
    const price = cleanPricePerPage(d.price_per_page);
    const sub = orderTotal(built.covers.length, price);
    if (!sub) return { error: 'This order has no amount to pay.' };
    total += sub;
    items.push({ design_id: d.id || null, design_name: name, design_image: String(d.image || ''), design_fields: fields, price_per_page: price, covers: built.covers });
  }
  return { items, pages, total };
}

/** The positions (and optional text colour) the customer chose, cleaned, one entry per cover. Unknown keys are dropped. */
export function cleanLayout(fields, raw, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const pos = {};
    const src = raw?.[i]?.pos && typeof raw[i].pos === 'object' ? raw[i].pos : {};
    for (const f of fields) {
      const p = src[f.key];
      if (!p || typeof p !== 'object') continue;
      pos[f.key] = { x: Math.round(clamp(p.x, 0, 100, f.x) * 100) / 100, y: Math.round(clamp(p.y, 0, 100, f.y) * 100) / 100, size: Math.round(clamp(p.size, 10, 160, f.size)) };
      if (HEX_RE.test(String(p.color || ''))) pos[f.key].color = String(p.color).toLowerCase();   // the customer's own text colour (#rrggbb only)
    }
    out.push(pos);
  }
  return out;
}

/** Name, phone and place the printed covers go to. Phone and place are required. Returns { ok, contact } or { ok:false, error }. */
export function validateContact(c) {
  const phone = cleanPhone(c?.phone);
  if (!phone) return { ok: false, code: 'phone', error: 'Please enter a valid phone number.' };
  const address = oneLine(c?.address, 200);
  if (address.length < 3) return { ok: false, code: 'address', error: 'Please tell us your location (city / province, village or landmark).' };
  const lat = Number(c?.lat), lng = Number(c?.lng);
  const hasPoint = c?.lat != null && c?.lng != null && c.lat !== '' && c.lng !== '' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  return { ok: true, contact: { name: oneLine(c?.name, 60), phone, address, notes: oneLine(c?.notes, 200), lat: hasPoint ? lat : null, lng: hasPoint ? lng : null } };
}

export const bcNo = id => 'BC-' + String(id).replace(/-/g, '').slice(0, 8).toUpperCase();
export const ORDER_STATUSES = ['pending', 'paid', 'submitted', 'printed', 'delivered', 'cancelled'];
