/* ------------------------------------------------------------------ *
 *  Image tools (100% in the browser, no AI service, no extra packages)
 *
 *  removeBackground()  – cuts out a product photo that was shot on a plain
 *                        background (white, grey, pastel, any single colour).
 *                        It samples the picture's edge, then flood-fills inwards
 *                        so only background that touches the border is removed.
 *  processedImageUrl() – cached + queued wrapper for the storefront.
 *  colorForProduct()   – stable random colour per product (re-roll with a seed).
 * ------------------------------------------------------------------ */

export type BgRemoveOptions = {
  /** 0–100. Higher removes more of the background (and risks eating light products). Default 35. */
  tolerance?: number;
  /** Longest side of the result in px. Smaller = faster. Default 900. */
  maxSize?: number;
  /** Also clear enclosed holes (handles, rings) that match the background. Default false. */
  fillHoles?: boolean;
};

export const PALETTES: Record<string, string[]> = {
  pastel: ['#ffd6e0', '#ffe5b4', '#fff3b0', '#d4f8e8', '#cdeefd', '#d9d4ff', '#f5d0fe', '#ffd9c7', '#e2f0cb', '#c7ecee'],
  vivid: ['#ff5d8f', '#ff9f1c', '#ffd23f', '#2ec4b6', '#3a86ff', '#8338ec', '#ef476f', '#06d6a0', '#fb5607', '#00b4d8'],
  dark: ['#1b1b3a', '#2d1e4f', '#12333f', '#3a1f2b', '#10353a', '#2b2d42', '#3b2a1e', '#1f2f4a'],
};

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Same product + same seed always gives the same colour; change the seed to shuffle everything. */
export function colorForProduct(id: string, seed: number, palette: string = 'pastel', custom?: string[]): string {
  const list = palette === 'custom' && custom && custom.length ? custom : (PALETTES[palette] || PALETTES.pastel);
  return list[hashString(id + ':' + seed) % list.length];
}
export function gradientForProduct(id: string, seed: number, palette: string = 'pastel', custom?: string[]): string {
  const a = colorForProduct(id, seed, palette, custom), b = colorForProduct(id + '~', seed + 7, palette, custom);
  return `linear-gradient(${(hashString(id + seed) % 8) * 45}deg,${a},${b})`;
}
export function randomHex(): string {
  const h = Math.floor(Math.random() * 360), s = 65 + Math.random() * 20, l = 72 + Math.random() * 12;
  return hslToHex(h, s, l);
}
export function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('');
}

/* --------------------------- background removal core --------------------------- */

const dist = (d: Uint8ClampedArray, i: number, r: number, g: number, b: number) => {
  const dr = d[i] - r, dg = d[i + 1] - g, db = d[i + 2] - b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

/**
 * Pure pixel function (kept separate so it can be unit-tested without a canvas).
 * Mutates `data` (RGBA). Returns the fraction of pixels removed, or null if the picture
 * does not have a removable background (then `data` is left untouched).
 */
export function cutBackground(data: Uint8ClampedArray, W: number, H: number, opts: BgRemoveOptions = {}): number | null {
  const tol = Math.max(0, Math.min(100, opts.tolerance ?? 35));
  const hi = 10 + tol * 1.1;     // max distance from the background colour
  const step = 6 + tol * 0.35;   // max jump between neighbouring pixels (lets soft gradients/shadows through)

  // 1) Estimate the background colour from the outer ring of the picture.
  const ring: number[] = [];
  const stepPx = Math.max(1, Math.floor(Math.max(W, H) / 120));
  const pushPx = (x: number, y: number) => { const i = (y * W + x) * 4; if (data[i + 3] > 200) ring.push(i); };
  for (let x = 0; x < W; x += stepPx) { pushPx(x, 0); pushPx(x, H - 1); }
  for (let y = 0; y < H; y += stepPx) { pushPx(0, y); pushPx(W - 1, y); }
  if (ring.length < 8) return null; // already transparent around the edge
  const med = (c: number) => { const v = ring.map(i => data[i + c]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const br = med(0), bg = med(1), bb = med(2);
  let close = 0;
  for (const i of ring) if (dist(data, i, br, bg, bb) <= hi * 1.4) close++;
  if (close / ring.length < 0.55) return null; // busy / multi-colour edge: not a plain background

  // 2) Flood fill from the border.
  const N = W * H, mask = new Uint8Array(N), queue = new Int32Array(N);
  let qh = 0, qt = 0;
  const trySeed = (p: number) => { if (!mask[p] && dist(data, p * 4, br, bg, bb) <= hi) { mask[p] = 1; queue[qt++] = p; } };
  for (let x = 0; x < W; x++) { trySeed(x); trySeed((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { trySeed(y * W); trySeed(y * W + W - 1); }
  while (qh < qt) {
    const p = queue[qh++], x = p % W, y = (p / W) | 0, pi = p * 4;
    const nb = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1];
    for (const n of nb) {
      if (n < 0 || mask[n]) continue;
      const ni = n * 4;
      if (dist(data, ni, br, bg, bb) <= hi && dist(data, ni, data[pi], data[pi + 1], data[pi + 2]) <= step) { mask[n] = 1; queue[qt++] = n; }
    }
  }

  // 3) Optional: clear enclosed pockets that are very close to the background colour (rings, handles).
  if (opts.fillHoles) {
    const strict = hi * 0.55, seen = new Uint8Array(N), minArea = Math.max(40, Math.round(N * 0.0015));
    for (let s = 0; s < N; s++) {
      if (mask[s] || seen[s] || dist(data, s * 4, br, bg, bb) > strict) continue;
      const comp: number[] = [s]; seen[s] = 1;
      for (let k = 0; k < comp.length; k++) {
        const p = comp[k], x = p % W, y = (p / W) | 0;
        for (const n of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) {
          if (n >= 0 && !mask[n] && !seen[n] && dist(data, n * 4, br, bg, bb) <= strict) { seen[n] = 1; comp.push(n); }
        }
      }
      if (comp.length >= minArea) for (const p of comp) mask[p] = 1;
    }
  }

  let removed = 0;
  for (let p = 0; p < N; p++) if (mask[p]) removed++;
  const frac = removed / N;
  if (frac < 0.02 || frac > 0.97) return null; // nothing to remove, or it would erase the whole product

  // 4) Soft edge: 3×3 blur of the alpha around the boundary + remove background colour bleeding into edge pixels.
  const alpha = new Float32Array(N);
  for (let p = 0; p < N; p++) alpha[p] = mask[p] ? 0 : 1;
  const soft = new Float32Array(alpha);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      const s = alpha[p - W - 1] + alpha[p - W] + alpha[p - W + 1] + alpha[p - 1] + alpha[p] + alpha[p + 1] + alpha[p + W - 1] + alpha[p + W] + alpha[p + W + 1];
      if (s > 0 && s < 9) soft[p] = s / 9;
    }
  }
  for (let p = 0; p < N; p++) {
    const i = p * 4, a = soft[p];
    if (a <= 0) { data[i + 3] = 0; continue; }
    if (a < 1) {
      // un-mix the background colour from partially covered edge pixels (removes the light halo)
      const inv = 1 / Math.max(a, 0.35);
      data[i] = Math.max(0, Math.min(255, (data[i] - br * (1 - a)) * inv));
      data[i + 1] = Math.max(0, Math.min(255, (data[i + 1] - bg * (1 - a)) * inv));
      data[i + 2] = Math.max(0, Math.min(255, (data[i + 2] - bb * (1 - a)) * inv));
    }
    data[i + 3] = Math.round(data[i + 3] * a);
  }
  return frac;
}

async function toBitmap(src: Blob | string): Promise<ImageBitmap | HTMLImageElement | null> {
  try {
    if (typeof src === 'string') {
      const res = await fetch(src, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error('fetch ' + res.status);
      return await createImageBitmap(await res.blob());
    }
    return await createImageBitmap(src);
  } catch {
    if (typeof src !== 'string') return null;
    return await new Promise(resolve => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src;
    });
  }
}

/** Returns a canvas with a transparent background, or null when the picture has no removable plain background. */
export async function removeBackground(src: Blob | string, opts: BgRemoveOptions = {}): Promise<HTMLCanvasElement | null> {
  const bmp = await toBitmap(src);
  if (!bmp) return null;
  const w0 = (bmp as any).width as number, h0 = (bmp as any).height as number;
  if (!w0 || !h0) return null;
  const k = Math.min(1, (opts.maxSize ?? 900) / Math.max(w0, h0));
  const W = Math.max(1, Math.round(w0 * k)), H = Math.max(1, Math.round(h0 * k));
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bmp as CanvasImageSource, 0, 0, W, H);
  if ('close' in bmp) { try { (bmp as ImageBitmap).close(); } catch { /* ignore */ } }
  let img: ImageData;
  try { img = ctx.getImageData(0, 0, W, H); } catch { return null; } // tainted canvas (no CORS)
  if (cutBackground(img.data, W, H, opts) === null) return null;
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Paint a colour or CSS gradient behind a transparent canvas (used when saving images for good). */
export function fillBehind(canvas: HTMLCanvasElement, fill: string): HTMLCanvasElement {
  const out = document.createElement('canvas'); out.width = canvas.width; out.height = canvas.height;
  const ctx = out.getContext('2d')!;
  if (/gradient/.test(fill)) {
    const m = fill.match(/(#[0-9a-f]{3,8})/gi) || ['#fff', '#fff'];
    const g = ctx.createLinearGradient(0, 0, out.width, out.height);
    g.addColorStop(0, m[0]); g.addColorStop(1, m[1] || m[0]); ctx.fillStyle = g;
  } else ctx.fillStyle = fill;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  return out;
}

export const canvasToBlob = (c: HTMLCanvasElement, type = 'image/png', q = 0.92): Promise<Blob> =>
  new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Could not export image.'))), type, q));

/** Encode a canvas as small as possible: WebP when the browser can, otherwise JPEG (opaque) or PNG (transparent). */
async function encodeSmall(c: HTMLCanvasElement, opaque: boolean): Promise<Blob> {
  let blob = await canvasToBlob(c, 'image/webp', 0.86);
  if (blob.type !== 'image/webp') blob = opaque ? await canvasToBlob(c, 'image/jpeg', 0.86) : await canvasToBlob(c, 'image/png');
  return blob;
}
const extFor = (type: string) => (type === 'image/webp' ? '.webp' : type === 'image/jpeg' ? '.jpg' : '.png');

/** Admin upload helper: returns a transparent File (WebP/PNG, max 1200px) or the original when removal is not possible. */
export async function removeBackgroundFile(file: File, opts: BgRemoveOptions & { fill?: string } = {}): Promise<{ file: File; removed: boolean }> {
  const c = await removeBackground(file, { maxSize: 1200, ...opts });
  if (!c) return { file, removed: false };
  const out = opts.fill ? fillBehind(c, opts.fill) : c;
  const blob = await encodeSmall(out, false);
  return { file: new File([blob], file.name.replace(/\.[^.]+$/, '') + (opts.fill ? '-color' : '-transparent') + extFor(blob.type), { type: blob.type }), removed: true };
}

/** Shrink a photo to at most `maxSide` px and re-encode it (WebP when supported) so product pages load fast. Falls back to the original file on any problem. */
export async function optimizeImage(file: File, maxSide = 1200): Promise<File> {
  try {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const W = Math.max(1, Math.round(bmp.width * k)), H = Math.max(1, Math.round(bmp.height * k));
    if (k === 1 && file.type === 'image/webp' && file.size < 250_000) { bmp.close(); return file; }
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    if (!ctx) { bmp.close(); return file; }
    ctx.drawImage(bmp, 0, 0, W, H); bmp.close();
    const blob = await encodeSmall(c, file.type === 'image/jpeg');
    if (k === 1 && blob.size >= file.size) return file; // no gain
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + extFor(blob.type), { type: blob.type });
  } catch { return file; }
}

/** Shrink a picture before it is embedded in a theme (keeps the saved JSON small). */
export async function shrinkImage(file: File, maxSide = 1100): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
  const keepAlpha = /png|gif|webp|svg/.test(file.type);
  return c.toDataURL(keepAlpha ? 'image/png' : 'image/jpeg', 0.86);
}

/* ------------------------------ storefront cache ------------------------------ */

const cache = new Map<string, Promise<string>>();
let running = 0; const waiting: (() => void)[] = [];
const acquire = () => new Promise<void>(res => { if (running < 2) { running++; res(); } else waiting.push(() => { running++; res(); }); });
const release = () => { running--; const n = waiting.shift(); if (n) n(); };

/** Resolves to a blob: URL of the cut-out picture, or the original URL if it can't be processed. */
export function processedImageUrl(url: string, opts: BgRemoveOptions = {}): Promise<string> {
  const key = `${url}|${opts.tolerance ?? 35}|${opts.maxSize ?? 900}|${opts.fillHoles ? 1 : 0}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      await acquire();
      try {
        const c = await removeBackground(url, opts);
        if (!c) return url;
        const blob = await canvasToBlob(c);
        return URL.createObjectURL(blob);
      } catch { return url; } finally { release(); }
    })();
    cache.set(key, p);
  }
  return p;
}
