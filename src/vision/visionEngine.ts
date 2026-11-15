/**
 * YN Vision engine – image search that costs $0.
 *
 * - Model: OpenAI CLIP ViT-B/32 (MIT licence), ONNX build `Xenova/clip-vit-base-patch32`, 8-bit quantised (~90 MB).
 * - Runtime: Transformers.js (Apache-2.0) running ONNX Runtime Web (WASM) INSIDE the customer's browser.
 * - No server, no API key, no per-use fee. The customer's photo never leaves their phone.
 * - The model files come from the free public Hugging Face Hub and are stored in the browser cache after the first
 *   download, so every later search works instantly (and offline once the catalog has been indexed).
 * - Catalog picture "fingerprints" (512 numbers each) are cached in IndexedDB. If `public/vision-index.json` exists
 *   (made by `npm run vision:index`, also free) they are loaded from it, so customers never have to compute them.
 */
import { base64ToVec, imageKey, normalize, rankSimilar } from '../../shared/visionMath.js';

export const VISION_MODEL = 'Xenova/clip-vit-base-patch32';
export const VISION_MODEL_MB = 90; // shown to the customer before the first download

export type VisionProduct = { id: string; main_image_url?: string | null };
export type VisionHit = { id: string; score: number };
export type VisionPhase = 'idle' | 'model' | 'index' | 'search' | 'done' | 'error';
export type VisionProgress = { phase: VisionPhase; pct: number; done?: number; total?: number };
type Progress = (p: VisionProgress) => void;

/* ---------------------------------------------------------------- IndexedDB cache */
const DB_NAME = 'yn-vision-v1';
const STORE = 'vec';
let dbPromise: Promise<IDBDatabase | null> | null = null;
function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise(resolve => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch { resolve(null); }
    });
  }
  return dbPromise;
}
async function dbGetAll(): Promise<Map<string, Float32Array>> {
  const out = new Map<string, Float32Array>();
  const db = await openDb();
  if (!db) return out;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const rq = tx.objectStore(STORE).openCursor();
      rq.onsuccess = () => {
        const c = rq.result;
        if (c) { out.set(String(c.key), new Float32Array(c.value as ArrayBuffer)); c.continue(); } else resolve(out);
      };
      rq.onerror = () => resolve(out);
    } catch { resolve(out); }
  });
}
async function dbPut(key: string, vec: Float32Array) {
  const db = await openDb();
  if (!db) return;
  try { db.transaction(STORE, 'readwrite').objectStore(STORE).put(vec.buffer.slice(0), key); } catch { /* cache is optional */ }
}
async function dbDelete(keys: string[]) {
  const db = await openDb();
  if (!db || !keys.length) return;
  try { const s = db.transaction(STORE, 'readwrite').objectStore(STORE); keys.forEach(k => s.delete(k)); } catch { /* optional */ }
}

/* ---------------------------------------------------------------- model (loaded once, on first use) */
type Loaded = { model: any; processor: any; RawImage: any };
let modelPromise: Promise<Loaded> | null = null;

export function visionSupported(): boolean {
  return typeof WebAssembly === 'object' && typeof indexedDB !== 'undefined';
}

export function loadVisionModel(onProgress?: Progress): Promise<Loaded> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const tf: any = await import('@huggingface/transformers');
      tf.env.allowLocalModels = false;   // always fetch from the free Hugging Face Hub
      tf.env.useBrowserCache = true;     // keep the files on the device after the first download
      /* Transformers.js reports one progress event per file; combine them into a single 0-100 bar. */
      const files = new Map<string, { loaded: number; total: number }>();
      const progress_callback = (e: any) => {
        if (e?.status === 'progress' && e.file && e.total) {
          files.set(e.file, { loaded: e.loaded, total: e.total });
          let l = 0, t = 0;
          files.forEach(f => { l += f.loaded; t += f.total; });
          onProgress?.({ phase: 'model', pct: t ? Math.min(99, Math.round((l / t) * 100)) : 0 });
        }
      };
      onProgress?.({ phase: 'model', pct: 0 });
      const [processor, model] = await Promise.all([
        tf.AutoProcessor.from_pretrained(VISION_MODEL, { progress_callback }),
        tf.CLIPVisionModelWithProjection.from_pretrained(VISION_MODEL, { dtype: 'q8', progress_callback }),
      ]);
      onProgress?.({ phase: 'model', pct: 100 });
      return { model, processor, RawImage: tf.RawImage };
    })().catch(e => { modelPromise = null; throw e; });
  }
  return modelPromise;
}

/** The picture's 512-number fingerprint. `src` is a Blob (customer photo) or an image URL (catalog photo). */
async function embed(src: Blob | string, loaded: Loaded): Promise<Float32Array> {
  const { model, processor, RawImage } = loaded;
  const image = typeof src === 'string' ? await RawImage.fromURL(src) : await RawImage.fromBlob(src);
  const inputs = await processor(image);
  const out = await model(inputs);
  return normalize(out.image_embeds.data as Float32Array);
}

/* ---------------------------------------------------------------- photo prep */
/** Shrink a big phone photo (and honour its EXIF rotation) before the AI sees it: faster and uses less memory. */
export async function prepareImage(file: Blob, max = 640): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); // transparent PNGs become white, like a product photo
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    return await new Promise<Blob>(res => c.toBlob(b => res(b || file), 'image/jpeg', 0.9));
  } catch { return file; }
}

/* ---------------------------------------------------------------- catalog index */
const index = new Map<string, Float32Array>(); // imageKey -> vector (memory copy)
let hydrated = false;
let staticTried = false;

async function hydrate() {
  if (hydrated) return;
  hydrated = true;
  (await dbGetAll()).forEach((v, k) => index.set(k, v));
}
/** Optional pre-built index shipped with the site (`public/vision-index.json`). Silent if it does not exist. */
async function loadStaticIndex() {
  if (staticTried) return;
  staticTried = true;
  try {
    const r = await fetch('/vision-index.json', { cache: 'no-cache' });
    if (!r.ok || !/json/.test(r.headers.get('content-type') || '')) return;
    const j = await r.json();
    if (j?.model !== VISION_MODEL || typeof j.items !== 'object') return;
    for (const k of Object.keys(j.items)) {
      if (!index.has(k)) { const v = base64ToVec(j.items[k]); if (v.length) { index.set(k, v); void dbPut(k, v); } }
    }
  } catch { /* optional */ }
}

/** Make sure every product picture has a fingerprint. Only pictures that are new or changed are processed. */
export async function ensureIndex(products: VisionProduct[], loaded: Loaded | null, onProgress?: Progress, signal?: AbortSignal) {
  await hydrate();
  await loadStaticIndex();
  const want = products.filter(p => p.main_image_url).map(p => ({ id: p.id, url: p.main_image_url as string, key: imageKey(p.id, p.main_image_url) }));
  /* forget fingerprints of pictures that were replaced or removed */
  const live = new Set(want.map(w => w.key));
  const stale = [...index.keys()].filter(k => !live.has(k));
  stale.forEach(k => index.delete(k));
  void dbDelete(stale);
  const missing = want.filter(w => !index.has(w.key));
  if (!missing.length) return;
  if (!loaded) throw new Error('model-needed');
  let done = 0;
  for (const m of missing) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    try { const v = await embed(m.url, loaded); index.set(m.key, v); void dbPut(m.key, v); } catch { /* one broken picture must not stop the rest */ }
    done++;
    onProgress?.({ phase: 'index', pct: Math.round((done / missing.length) * 100), done, total: missing.length });
    await new Promise(r => setTimeout(r, 0)); // let the screen animate between pictures
  }
}

/** True when the catalog is already indexed (so a search needs no catalog work). */
export async function isIndexed(products: VisionProduct[]): Promise<boolean> {
  await hydrate();
  await loadStaticIndex();
  return products.filter(p => p.main_image_url).every(p => index.has(imageKey(p.id, p.main_image_url)));
}

/** Find the catalog products that look most like the customer's photo. */
export async function searchByImage(photo: Blob, products: VisionProduct[], onProgress?: Progress, signal?: AbortSignal): Promise<VisionHit[]> {
  const loaded = await loadVisionModel(onProgress);
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  await ensureIndex(products, loaded, onProgress, signal);
  onProgress?.({ phase: 'search', pct: 100 });
  const q = await embed(await prepareImage(photo), loaded);
  const entries = products.flatMap(p => {
    const v = p.main_image_url ? index.get(imageKey(p.id, p.main_image_url)) : undefined;
    return v ? [{ id: p.id, vec: v }] : [];
  });
  return rankSimilar(q, entries, { limit: 24, min: 0.45 });
}
