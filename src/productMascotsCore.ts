/* ------------------------------------------------------------------ *
 *  Product mascots – every product card gets its own mascot(s).
 *
 *  The admin chooses HOW MANY different mascots are in the pool; the pool is picked
 *  at random (or by hand) and every product then gets one picked from the pool.
 *  The pick is a pure function of (product id, seed), so
 *    - it is the same on every phone / tablet / computer and after every reload,
 *    - a product added later gets a mascot automatically (nothing has to be saved for it),
 *    - the admin can still override a single product, or press "Shuffle" for a new draw.
 *
 *  Saved inside the theme JSON (theme.productMascots) – no SQL needed.
 *  No imports on purpose, so the theme engine and the admin page can both use it.
 * ------------------------------------------------------------------ */

export type LibraryMascot = { id: string; label: string; url: string; kind: 'friend' | 'treat' };
export type CustomMascot = { id: string; url: string; name: string };
export type PMMotion = 'none' | 'float' | 'wiggle' | 'jump' | 'pulse' | 'mixed';

export type ProductMascotCfg = {
  enabled: boolean;
  /** how many different mascots the admin wants in the pool */
  count: number;
  /** ids of the mascots in the pool (library ids or custom ids) */
  pool: string[];
  /** 1–3 mascots on each product */
  perProduct: number;
  /** change this to draw a new random assignment */
  seed: number;
  /** % of the normal size */
  size: number;
  motion: PMMotion;
  /** productId → the ids chosen by hand for that product ([] = no mascot on it) */
  overrides: Record<string, string[]>;
  custom: CustomMascot[];
};

export const MASCOT_LIBRARY: LibraryMascot[] = [
  { id: 'mochi', label: 'Mochi', url: '/chiikawa/mochi.svg', kind: 'friend' },
  { id: 'mochi-happy', label: 'Mochi happy', url: '/chiikawa/mochi-happy.svg', kind: 'friend' },
  { id: 'mochi-open', label: 'Mochi open mouth', url: '/chiikawa/mochi-open.svg', kind: 'friend' },
  { id: 'mochi-cap', label: 'Mochi with cap', url: '/chiikawa/mochi-cap.svg', kind: 'friend' },
  { id: 'mochi-box', label: 'Mochi in a box', url: '/chiikawa/mochi-box.svg', kind: 'friend' },
  { id: 'bun', label: 'Bun', url: '/chiikawa/bun.svg', kind: 'friend' },
  { id: 'bun-happy', label: 'Bun happy', url: '/chiikawa/bun-happy.svg', kind: 'friend' },
  { id: 'bun-open', label: 'Bun open mouth', url: '/chiikawa/bun-open.svg', kind: 'friend' },
  { id: 'kiki', label: 'Kiki', url: '/chiikawa/kiki.svg', kind: 'friend' },
  { id: 'kiki-happy', label: 'Kiki happy', url: '/chiikawa/kiki-happy.svg', kind: 'friend' },
  { id: 'kiki-open', label: 'Kiki open mouth', url: '/chiikawa/kiki-open.svg', kind: 'friend' },
  { id: 'onigiri', label: 'Onigiri', url: '/chiikawa/onigiri.svg', kind: 'treat' },
  { id: 'burger', label: 'Burger', url: '/chiikawa/burger.svg', kind: 'treat' },
  { id: 'cake', label: 'Cake', url: '/chiikawa/cake.svg', kind: 'treat' },
  { id: 'boba', label: 'Boba', url: '/chiikawa/boba.svg', kind: 'treat' },
  { id: 'latte', label: 'Latte', url: '/chiikawa/latte.svg', kind: 'treat' },
  { id: 'icecream', label: 'Ice cream', url: '/chiikawa/icecream.svg', kind: 'treat' },
];

export const MOTIONS: { key: PMMotion; label: string }[] = [
  { key: 'none', label: 'Still' },
  { key: 'float', label: 'Float up and down' },
  { key: 'wiggle', label: 'Wiggle' },
  { key: 'jump', label: 'Hop' },
  { key: 'pulse', label: 'Pulse' },
  { key: 'mixed', label: 'Mixed (each product moves differently)' },
];

const clampN = (v: any, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
const safeUrl = (u: any) => (typeof u === 'string' && /^(https?:|data:image\/|\/)/i.test(u.trim()) ? u.trim() : '');

export function blankProductMascots(): ProductMascotCfg {
  return { enabled: false, count: 6, pool: [], perProduct: 1, seed: 1, size: 100, motion: 'float', overrides: {}, custom: [] };
}

export function normalizeProductMascots(raw: any): ProductMascotCfg {
  const b = blankProductMascots();
  if (!raw || typeof raw !== 'object') return b;
  const custom: CustomMascot[] = (Array.isArray(raw.custom) ? raw.custom : [])
    .map((c: any) => ({ id: typeof c?.id === 'string' ? c.id.slice(0, 60) : '', url: safeUrl(c?.url), name: typeof c?.name === 'string' ? c.name.slice(0, 40) : 'My mascot' }))
    .filter((c: CustomMascot) => c.id && c.url)
    .slice(0, 60);
  const known = new Set([...MASCOT_LIBRARY.map(m => m.id), ...custom.map(c => c.id)]);
  const pool = (Array.isArray(raw.pool) ? raw.pool : []).filter((id: any) => typeof id === 'string' && known.has(id)).slice(0, 80);
  const overrides: Record<string, string[]> = {};
  if (raw.overrides && typeof raw.overrides === 'object') {
    for (const [pid, ids] of Object.entries(raw.overrides as Record<string, any>)) {
      if (!Array.isArray(ids)) continue;
      overrides[pid] = ids.filter((id: any) => typeof id === 'string' && known.has(id)).slice(0, 3);
    }
  }
  const motion: PMMotion = (['none', 'float', 'wiggle', 'jump', 'pulse', 'mixed'] as const).includes(raw.motion) ? raw.motion : b.motion;
  return {
    enabled: !!raw.enabled,
    count: clampN(raw.count, 1, 80, b.count),
    pool, overrides, custom, motion,
    perProduct: clampN(raw.perProduct, 1, 3, 1),
    seed: clampN(raw.seed, 1, 2147483646, 1),
    size: clampN(raw.size, 40, 220, 100),
  };
}

/** Every mascot the admin can use right now (built-in + uploaded). */
export function allMascots(pm: ProductMascotCfg): { id: string; label: string; url: string }[] {
  return [...MASCOT_LIBRARY, ...pm.custom.map(c => ({ id: c.id, label: c.name, url: c.url }))];
}

/** Random pool of `count` mascots (the admin's "pick N for me"). */
export function randomPool(pm: ProductMascotCfg, count: number, rnd: () => number = Math.random): string[] {
  const ids = allMascots(pm).map(m => m.id);
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  return ids.slice(0, Math.max(1, Math.min(count, ids.length)));
}

/* ---- stable "random": same input → same output on every device ---- */
function hash32(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type PickedMascot = { id: string; url: string; label: string };

/** The mascot(s) a product shows. `auto` is true when nobody chose by hand. */
export function mascotsForProduct(pm: ProductMascotCfg, productId: string): { items: PickedMascot[]; auto: boolean } {
  const all = allMascots(pm);
  const byId = new Map(all.map(m => [m.id, m]));
  const manual = pm.overrides[productId];
  if (manual) return { items: manual.map(id => byId.get(id)).filter(Boolean) as PickedMascot[], auto: false };
  const poolIds = pm.pool.filter(id => byId.has(id));
  const ids = poolIds.length ? poolIds : MASCOT_LIBRARY.slice(0, 3).map(m => m.id);   // empty pool → the three classic friends
  const rnd = mulberry32(hash32(`${pm.seed}|${productId}`));
  const order = [...ids];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return { items: order.slice(0, Math.min(pm.perProduct, order.length)).map(id => byId.get(id)!) as PickedMascot[], auto: true };
}

/** Which movement a product's mascot uses (the "mixed" setting varies it per product). */
export function motionFor(pm: ProductMascotCfg, productId: string, index: number): { type: Exclude<PMMotion, 'mixed'>; delay: number } {
  const h = hash32(`m|${productId}|${index}`);
  const delay = -((h % 3000) / 1000);        // start each mascot at a different moment so they do not move in lockstep
  if (pm.motion !== 'mixed') return { type: pm.motion, delay };
  const kinds = ['float', 'wiggle', 'jump', 'pulse'] as const;
  return { type: kinds[h % kinds.length], delay };
}
