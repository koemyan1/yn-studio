// YN Vision: the maths behind "find similar products from a photo".
// Plain JS, no dependencies, no network: runs in the browser and in `node --test tests/vision.test.mjs`.
// Embeddings are Float32Array / number[] vectors produced by a free open-source CLIP model.

export const VISION_DIM = 512; // CLIP ViT-B/32 image embedding size

/** Scale a vector to length 1 (so a dot product == cosine similarity). Returns a new Float32Array. */
export function normalize(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

/** Dot product of two same-length vectors (cosine similarity when both are normalised). */
export function dot(a, b) {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/** Average several vectors (e.g. all photos of one product) and re-normalise. */
export function meanVector(vs) {
  if (!vs.length) return new Float32Array(0);
  const out = new Float32Array(vs[0].length);
  for (const v of vs) for (let i = 0; i < out.length; i++) out[i] += v[i];
  return normalize(out);
}

/**
 * Rank catalog entries by similarity to a query vector.
 * entries: [{ id, vec }]; returns [{ id, score }] best first, score in [-1, 1].
 * Only entries scoring at least `min` are kept, at most `limit` are returned.
 */
export function rankSimilar(query, entries, { limit = 24, min = 0 } = {}) {
  const q = normalize(query);
  const out = [];
  for (const e of entries) {
    if (!e || !e.vec || !e.vec.length) continue;
    const score = dot(q, e.vec);
    if (score >= min) out.push({ id: e.id, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, Math.max(0, limit));
}

/**
 * Turn a raw cosine score into a friendly 0-100 "match" percentage.
 * CLIP image-to-image similarity for related items is typically 0.55-0.95; unrelated is below ~0.5.
 * This is only for display, ranking always uses the raw score.
 */
export function matchPercent(score) {
  const lo = 0.5, hi = 0.95;
  const t = (score - lo) / (hi - lo);
  return Math.round(Math.max(0, Math.min(1, t)) * 100);
}

/** Cache key that changes when a product's picture changes, so stale embeddings are never reused. */
export function imageKey(id, url) {
  return String(id) + '|' + String(url || '');
}

/** Float32Array <-> base64, for the optional pre-built public/vision-index.json file (small, no dependencies). */
export function vecToBase64(v) {
  const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return (typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64'));
}
export function base64ToVec(b64) {
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

/* ------------------------------------------------------------------ several products in one photo */

/** Overlap of two boxes {x,y,w,h}: intersection / union (0..1). */
export function iou(a, b) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const uni = a.w * a.h + b.w * b.h - inter;
  return uni > 0 ? inter / uni : 0;
}

/**
 * Square look-here windows that cover a W x H photo (CLIP looks at squares, so a square never loses the edges).
 * Side = frac * the short edge; neighbouring windows overlap so an item is rarely cut in half. At most maxPerAxis^2 windows.
 * Returns pixel boxes [{x,y,w,h}].
 */
export function cropGrid(W, H, { frac = 0.5, stride = 0.75, maxPerAxis = 4 } = {}) {
  const side = Math.max(1, Math.min(W, H) * frac);
  const axis = L => {
    if (L <= side * 1.05) return [Math.max(0, (L - side) / 2)];
    const n = Math.min(maxPerAxis, Math.ceil((L - side) / (side * stride)) + 1);
    return Array.from({ length: n }, (_, i) => (n === 1 ? 0 : (i * (L - side)) / (n - 1)));
  };
  const out = [];
  for (const y of axis(H)) for (const x of axis(W)) out.push({ x, y, w: side, h: side });
  return out;
}

/**
 * Work out which products are in the photo and how similar each one is.
 * crops: [{ box:{x,y,w,h} (0..1 of the photo), vec, full?:true }]  - one crop must be the whole photo (full:true).
 * entries: [{ id, vec }] catalog fingerprints.
 * Returns [{ box, score, hits:[{id,score}] }] - one entry per detected item, best first.
 *  - A photo of ONE product: the whole-photo match is strong and no window beats it -> a single group.
 *  - A photo of SEVERAL: windows that match a catalog product are kept; overlapping windows or windows that
 *    point at the same product are merged, so each item appears once with its own similarity list.
 */
export function groupMatches(crops, entries, { minScore = 0.62, showMin = 0.45, singleScore = 0.8, perGroup = 4, maxGroups = 4, overlap = 0.35 } = {}) {
  const ranked = crops.map(c => ({ c, r: rankSimilar(c.vec, entries, { limit: perGroup + 2, min: showMin }) })).filter(x => x.r.length);
  const full = ranked.find(x => x.c.full);
  const subs = ranked.filter(x => !x.c.full && x.r[0].score >= minScore).sort((a, b) => b.r[0].score - a.r[0].score);
  const asGroup = x => ({ box: x.c.box, score: x.r[0].score, hits: x.r.slice(0, perGroup) });
  if (full && full.r[0].score >= singleScore && (!subs.length || full.r[0].score >= subs[0].r[0].score - 0.02)) return [asGroup(full)];
  const groups = [];
  for (const s of subs) {
    if (groups.length >= maxGroups) break;
    const top = s.r[0].id;
    if (groups.some(g => g.hits[0].id === top || iou(g.box, s.c.box) > overlap)) continue;
    groups.push(asGroup(s));
  }
  if (!groups.length && full) groups.push(asGroup(full));
  return groups;
}
