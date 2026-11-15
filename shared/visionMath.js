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
