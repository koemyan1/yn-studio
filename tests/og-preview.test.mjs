// Link previews for shared product links. Run: node --test tests/og-preview.test.mjs
// Part 1 tests the pure helpers; part 2 tests the page builders server/index.js calls, with a fake database (no Express needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, clip, absUrl, describeProduct, previewFromProduct, defaultPreview, injectPreview, createPreviewCache, createBudget, isProductId, createPreviewPages } from '../server/ogPreview.js';

const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="theme-color" content="#7c3aed" />
    <title>YN Studio</title>
    <meta name="description" content="old description" />
    <meta property="og:title" content="old title" />
    <meta property="og:image" content="/yn-logo.png" />
    <meta name="twitter:card" content="summary" />
  </head>
  <body><div id="root"></div></body>
</html>`;

test('esc stops HTML / attribute injection', () => {
  assert.equal(esc(`"><script>alert(1)</script>'&`), '&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;&#39;&amp;');
  assert.equal(esc(null), '');
});

test('clip shortens on a word boundary, never splits an emoji, collapses whitespace', () => {
  assert.equal(clip('  a   b \n c ', 50), 'a b c');
  const out = clip('word '.repeat(60), 40);
  assert.ok(out.length <= 40 && out.endsWith('…'), out);
  const emoji = clip('😀'.repeat(100), 11);
  assert.equal(Array.from(emoji).length, 11); // 10 emoji + the ellipsis, no broken surrogate
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(emoji));
});

test('absUrl only allows http(s) and resolves relative paths', () => {
  assert.equal(absUrl('/yn-logo.png', 'https://shop.test'), 'https://shop.test/yn-logo.png');
  assert.equal(absUrl('https://cdn.test/a.jpg', 'https://shop.test'), 'https://cdn.test/a.jpg');
  assert.equal(absUrl('javascript:alert(1)', 'https://shop.test'), '');
  assert.equal(absUrl('data:image/png;base64,AAAA', 'https://shop.test'), '');
  assert.equal(absUrl('', 'https://shop.test'), '');
});

test('description shows price, sale price, rating and the start of the description', () => {
  const d = describeProduct({ price: 12, original_price: 15, description: 'Soft cotton tote.' }, { review_count: 12, avg_rating: 4.83 });
  assert.equal(d, '$12.00 (was $15.00) · ★ 4.8 (12 reviews) — Soft cotton tote.');
  assert.equal(describeProduct({ price: 5 }, { review_count: 1, avg_rating: 5 }), '$5.00 · ★ 5.0 (1 review)');
  assert.equal(describeProduct({ price: null, description: '' }, null), 'Shop on YN Studio.');
});

test('injectPreview keeps "$" prices intact (no regex replacement-pattern corruption) and replaces every old tag', () => {
  const pv = previewFromProduct({ id: 'abc', name: 'Tote $& Bag $1', price: 12, description: 'Costs $1 or $& more $$', main_image_url: 'https://cdn.test/t.jpg' }, null, 'https://shop.test');
  const html = injectPreview(PAGE, pv);
  assert.match(html, /<title>Tote \$&amp; Bag \$1 · YN Studio<\/title>/);
  assert.match(html, /content="\$12\.00 — Costs \$1 or \$&amp; more \$\$"/);
  assert.equal((html.match(/property="og:title"/g) || []).length, 1, 'only one og:title');
  assert.equal((html.match(/name="description"/g) || []).length, 1, 'only one description');
  assert.ok(!html.includes('old title') && !html.includes('old description'));
  assert.match(html, /<meta name="theme-color" content="#7c3aed" \/>/, 'unrelated tags are kept');
  assert.match(html, /property="og:image" content="https:\/\/cdn\.test\/t\.jpg"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /property="og:url" content="https:\/\/shop\.test\/product\/abc"/);
  assert.match(html, /property="product:price:amount" content="12\.00"/);
  assert.ok(html.indexOf('og:title') < html.indexOf('</head>'));
});

test('a product without a photo falls back to the logo and a small card; a hostile name cannot break out of the tag', () => {
  const pv = previewFromProduct({ id: 'x', name: '"/><script>alert(1)</script>', price: 3 }, null, 'https://shop.test/');
  const html = injectPreview(PAGE, pv);
  assert.match(html, /property="og:image" content="https:\/\/shop\.test\/yn-logo\.png"/);
  assert.match(html, /name="twitter:card" content="summary"/);
  assert.ok(!html.includes('<script>alert(1)'), 'script tag must be escaped');
});

test('default preview uses absolute URLs', () => {
  const pv = defaultPreview('https://shop.test', '/wallet');
  assert.equal(pv.image, 'https://shop.test/yn-logo.png');
  assert.equal(pv.url, 'https://shop.test/wallet');
});

test('cache: hits and misses expire; size is bounded; budget refills', async () => {
  const c = createPreviewCache({ ttlMs: 30, missMs: 10, max: 2 });
  c.set('a', { x: 1 }); c.set('b', null);
  assert.deepEqual(c.get('a'), { x: 1 }); assert.equal(c.get('b'), null); assert.equal(c.get('zzz'), undefined);
  c.set('c', { y: 2 }); assert.equal(c.size(), 2); assert.equal(c.get('a'), undefined, 'oldest entry evicted');
  await new Promise(r => setTimeout(r, 40)); assert.equal(c.get('c'), undefined, 'expired');
  const ok = createBudget(2, 25);
  assert.deepEqual([ok(), ok(), ok()], [true, true, false]);
  await new Promise(r => setTimeout(r, 30)); assert.equal(ok(), true);
});

test('isProductId accepts only uuids', () => {
  assert.ok(isProductId('123e4567-e89b-12d3-a456-426614174000'));
  for (const bad of ['', 'abc', '1; drop table products', '../etc/passwd', '123e4567-e89b-12d3-a456-42661417400']) assert.ok(!isProductId(bad), bad);
});

// ---------------------------------------------------------------- part 2: the page builders the server calls, with a fake database
const GOOD = '123e4567-e89b-12d3-a456-426614174001';
const MISSING = '123e4567-e89b-12d3-a456-426614174002';
function setup({ db = true, budget } = {}) {
  const calls = [];
  const sb = async (q) => {
    calls.push(q);
    if (q.startsWith('products?')) {
      if (!q.includes('status=eq.published') || !q.includes('store_page=is.null')) throw new Error('query must only return public products: ' + q);
      return q.includes(GOOD) ? [{ id: GOOD, name: 'Pastel <Tote> Bag', description: 'Soft cotton tote for everyday things.', price: 12, original_price: 15, main_image_url: 'https://cdn.test/tote.jpg' }] : [];
    }
    if (q.startsWith('product_rating_stats?')) return [{ review_count: 3, avg_rating: 4.67 }];
    throw new Error('unexpected query ' + q);
  };
  const pages = createPreviewPages({ readIndexHtml: async () => PAGE, publicUrl: () => 'https://shop.test', sb, hasDb: () => db, ...(budget ? { budget } : {}) });
  return { pages, calls };
}
const req = (p, id) => ({ path: p, params: { id } });

test('pages: /product/<id> carries that product in the link-preview tags', async () => {
  const { pages } = setup();
  const html = await pages.product(req('/product/' + GOOD, GOOD));
  assert.match(html, /<title>Pastel &lt;Tote&gt; Bag · YN Studio<\/title>/);
  assert.match(html, /property="og:description" content="\$12\.00 \(was \$15\.00\) · ★ 4\.7 \(3 reviews\) — Soft cotton tote for everyday things\."/);
  assert.match(html, /property="og:image" content="https:\/\/cdn\.test\/tote\.jpg"/);
  assert.match(html, /property="og:url" content="https:\/\/shop\.test\/product\/123e4567-e89b-12d3-a456-426614174001"/);
  assert.ok(html.includes('<div id="root">'), 'the app shell is still there');
});

test('pages: the same product twice costs one lookup (cache), and the lookup is limited to public products', async () => {
  const { pages, calls } = setup();
  await pages.product(req('/product/' + GOOD, GOOD));
  const after1 = calls.length;
  assert.equal(after1, 2, 'product + rating stats');
  await pages.product(req('/product/' + GOOD, GOOD));
  assert.equal(calls.length, after1, 'second request served from the cache');
});

test('pages: unknown product, bad ids, no database -> default preview; bad ids never reach the database', async () => {
  const { pages, calls } = setup();
  for (const [p, id] of [['/product/' + MISSING, MISSING], ['/product/not-a-uuid', 'not-a-uuid'], ['/product/1;drop', '1;drop'], ['/product/', '']]) {
    const html = await pages.product(req(p, id));
    assert.match(html, /property="og:title" content="YN Studio"/, p);
    assert.match(html, /property="og:image" content="https:\/\/shop\.test\/yn-logo\.png"/, p);
    assert.ok(!html.includes('old title'), p);
  }
  assert.equal(calls.length, 2, 'only the well-formed unknown uuid reached the database (product + stats), and a miss is cached');
  const none = setup({ db: false });
  assert.match(await none.pages.product(req('/product/' + GOOD, GOOD)), /property="og:title" content="YN Studio"/);
  assert.equal(none.calls.length, 0);
});

test('pages: when the lookup budget is used up, visitors still get the page (default preview) and the database is left alone', async () => {
  const { pages, calls } = setup({ budget: () => false });
  const html = await pages.product(req('/product/' + GOOD, GOOD));
  assert.match(html, /property="og:title" content="YN Studio"/);
  assert.equal(calls.length, 0);
});

test('pages: a database error never breaks the page', async () => {
  const pages = createPreviewPages({ readIndexHtml: async () => PAGE, publicUrl: () => 'https://shop.test', sb: async () => { throw new Error('boom'); } });
  assert.match(await pages.product(req('/product/' + GOOD, GOOD)), /property="og:title" content="YN Studio"/);
});

test('pages: every other page gets absolute default tags', async () => {
  const { pages } = setup();
  const html = await pages.page({ path: '/wallet' });
  assert.match(html, /property="og:url" content="https:\/\/shop\.test\/wallet"/);
  assert.match(html, /property="og:image" content="https:\/\/shop\.test\/yn-logo\.png"/);
});
