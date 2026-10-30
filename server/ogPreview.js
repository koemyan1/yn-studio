// Link previews (Open Graph / Twitter card tags).
//
// The shop is a single-page app: every URL returns the same index.html, so when a product link is pasted into Telegram,
// Facebook, Messenger or WhatsApp those apps (which do NOT run JavaScript) only ever saw a plain "YN Studio" page.
// For /product/:id the server now looks the product up and writes its name, price, rating and photo into the <head> of
// the page before sending it. The app itself is unchanged: it boots exactly as before.
//
// Pure functions only (no Express / network here) so tests/og-preview.test.mjs can cover them.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escape text for use inside an HTML attribute or element. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Collapse whitespace and cut to `max` characters (by code point, so emoji are never split), adding an ellipsis. */
export function clip(text, max) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  const chars = Array.from(t);
  if (chars.length <= max) return t;
  const cut = chars.slice(0, max - 1).join('');
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:\-–—]+$/u, '') + '…';
}

/** Make `u` an absolute http(s) URL (relative paths are resolved against `base`). Anything else -> ''. */
export function absUrl(u, base) {
  const s = String(u ?? '').trim();
  if (!s) return '';
  try {
    const x = new URL(s, base.replace(/\/$/, '') + '/');
    return /^https?:$/.test(x.protocol) ? x.href : '';
  } catch { return ''; }
}

const money = (n) => (Number.isFinite(Number(n)) && n !== null && n !== '' ? '$' + Number(n).toFixed(2) : '');

/** "$12.00 (was $15.00) · ★ 4.8 (12 reviews) — first words of the description" */
export function describeProduct(p, stats) {
  const parts = [];
  const price = money(p.price);
  if (price) parts.push(price + (Number(p.original_price) > Number(p.price) ? ` (was ${money(p.original_price)})` : ''));
  const n = Number(stats?.review_count);
  if (n > 0) parts.push(`★ ${Number(stats.avg_rating).toFixed(1)} (${n} review${n === 1 ? '' : 's'})`);
  const head = parts.join(' · ');
  const body = clip(p.description, 160);
  return clip([head, body].filter(Boolean).join(' — ') || 'Shop on YN Studio.', 200);
}

/** The preview for one product. `base` is the public address of the shop, e.g. https://ynstudio.site */
export function previewFromProduct(p, stats, base) {
  const b = base.replace(/\/$/, '');
  const photo = absUrl(p.main_image_url, b);
  return {
    title: clip(`${p.name || 'Product'} · YN Studio`, 90),
    description: describeProduct(p, stats),
    image: photo || `${b}/yn-logo.png`,
    url: `${b}/product/${encodeURIComponent(p.id)}`,
    type: 'product',
    card: photo ? 'summary_large_image' : 'summary',
    price: Number.isFinite(Number(p.price)) && p.price !== null && p.price !== '' ? Number(p.price).toFixed(2) : '',
  };
}

/** Everything that is not a product page. */
export function defaultPreview(base, path = '/') {
  const b = base.replace(/\/$/, '');
  return {
    title: 'YN Studio',
    description: 'YN Studio — a little marketplace for little things. Shop, pay with KHQR or your wallet, and track your delivery.',
    image: `${b}/yn-logo.png`,
    url: b + (String(path).startsWith('/') ? path : '/' + path),
    type: 'website',
    card: 'summary',
    price: '',
  };
}

/** The <meta> block (already escaped). */
export function renderTags(pv) {
  const t = esc(pv.title), d = esc(pv.description), i = esc(pv.image), u = esc(pv.url);
  const lines = [
    `<meta name="description" content="${d}" />`,
    `<meta property="og:site_name" content="YN Studio" />`,
    `<meta property="og:type" content="${pv.type === 'product' ? 'product' : 'website'}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:image" content="${i}" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta name="twitter:card" content="${pv.card === 'summary_large_image' ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${i}" />`,
  ];
  if (pv.type === 'product' && pv.price) {
    lines.push(`<meta property="product:price:amount" content="${esc(pv.price)}" />`);
    lines.push(`<meta property="product:price:currency" content="USD" />`);
  }
  return lines.join('\n    ');
}

/** Put the preview into the page: drops the old description / og: / twitter: tags, sets <title>, adds the new block. */
export function injectPreview(html, pv) {
  // NB: function replacers on purpose. A plain replacement string treats "$1", "$&" ... specially, and prices contain "$".
  return String(html)
    .replace(/<meta\s+(?:name|property)=["'](?:description|og:[^"']*|twitter:[^"']*|product:[^"']*)["'][^>]*>[ \t]*\r?\n?/gi, () => '')
    .replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${esc(pv.title)}</title>`)
    .replace(/<\/head>/i, () => `    ${renderTags(pv)}\n  </head>`);
}

/** Small in-memory cache. A hit stores the data; a miss (null) is remembered for a shorter time. */
export function createPreviewCache({ ttlMs = 5 * 60 * 1000, missMs = 60 * 1000, max = 500 } = {}) {
  const m = new Map();
  return {
    get(key) {
      const e = m.get(key);
      if (!e) return undefined;
      if (e.exp < Date.now()) { m.delete(key); return undefined; }
      return e.v;
    },
    set(key, v) {
      if (m.size >= max) m.delete(m.keys().next().value);
      m.set(key, { v, exp: Date.now() + (v ? ttlMs : missMs) });
    },
    size: () => m.size,
  };
}

/** Allows at most `max` database lookups per `windowMs` for the whole server (protects the database quota from scanners). */
export function createBudget(max, windowMs) {
  let start = Date.now();
  let n = 0;
  return () => {
    const now = Date.now();
    if (now - start >= windowMs) { start = now; n = 0; }
    return ++n <= max;
  };
}

export const isProductId = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));

/** Looks one published, non-hidden product up through the server's `sb(path)` REST helper. Returns { p, st } or null. */
export async function loadProductPreview(sb, id) {
  if (!isProductId(id)) return null;
  const q = encodeURIComponent(id);
  const [prod, stats] = await Promise.allSettled([
    // store_page=is.null: products that only live on a secret-theme page (e.g. Snacks) never get a public preview
    sb(`products?id=eq.${q}&status=eq.published&store_page=is.null&select=id,name,description,price,original_price,main_image_url&limit=1`),
    sb(`product_rating_stats?product_id=eq.${q}&select=review_count,avg_rating&limit=1`), // fails quietly if reviews SQL is not installed
  ]);
  const p = prod.status === 'fulfilled' ? prod.value?.[0] : null;
  if (!p) return null;
  return { p, st: stats.status === 'fulfilled' ? stats.value?.[0] || null : null };
}

/** The two page builders the server uses. Everything outside (reading index.html, the public address, the database) is
    passed in, so tests can fake it and no web framework is needed to run them.
    req needs: params.id (product route), path, and whatever publicUrl(req) reads. */
export function createPreviewPages({ readIndexHtml, publicUrl, sb, hasDb = () => true, cache = createPreviewCache(), budget = createBudget(120, 60000) }) {
  return {
    /** GET /product/:id */
    async product(req) {
      const html = await readIndexHtml();
      const base = publicUrl(req);
      const id = String(req.params?.id ?? '');
      let found; // { p, st } | null (known miss) | undefined (not looked up)
      if (isProductId(id) && hasDb()) {
        found = cache.get(id);
        if (found === undefined && budget()) {
          found = await loadProductPreview(sb, id).catch(() => null);
          cache.set(id, found);
        }
      }
      return injectPreview(html, found ? previewFromProduct(found.p, found.st, base) : defaultPreview(base, req.path));
    },
    /** every other page */
    async page(req) {
      return injectPreview(await readIndexHtml(), defaultPreview(publicUrl(req), req.path));
    },
  };
}
