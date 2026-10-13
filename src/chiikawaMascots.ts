/* ------------------------------------------------------------------ *
 *  Chiikawa theme – every mascot picture the theme draws, so the admin can
 *  swap the picture, move it, resize it or hide it (Secret Code → Mascots).
 *
 *  A GROUP is one place on the page (e.g. "the mascot on every category button").
 *  A SLOT is one picture inside a group (the category buttons use several faces).
 *  Pictures live in theme.mascotImages[slot]; position/size/hide in theme.mascotPos[group].
 *  chiikawa.css reads them through CSS variables, falling back to the built-in art.
 * ------------------------------------------------------------------ */

export type MascotSlot = { key: string; group: string; label: string; fallback: string };
export type MascotGroup = {
  key: string; label: string; hint: string;
  /** element the picture belongs to, used to place the drag handle in the preview */
  host: string; pseudo: '' | '::before' | '::after';
  /** false = no drag handle in the preview (full-width clouds, backgrounds) */
  handle: boolean;
  /** false = only the picture can be changed */
  placeable: boolean;
};
export type MascotPos = { dx?: number; dy?: number; s?: number; hide?: boolean };

export const MASCOT_GROUPS: MascotGroup[] = [
  { key: 'clouds', label: 'Clouds (drifting across the top)', hint: 'A wide strip of clouds that slides from right to left.', host: 'body', pseudo: '::before', handle: false, placeable: true },
  { key: 'headLeft', label: 'Top-left mascot (Home)', hint: 'Sits above the store name.', host: '.brandrow', pseudo: '::before', handle: true, placeable: true },
  { key: 'headRight', label: 'Top-right mascot (Home)', hint: 'Sits above the bell / profile buttons.', host: '.brandrow', pseudo: '::after', handle: true, placeable: true },
  { key: 'title', label: 'Mascot next to the store name', hint: 'Small face after the big title.', host: '.brandrow h1', pseudo: '::after', handle: true, placeable: true },
  { key: 'search', label: 'Mascot in the search bar', hint: 'The little face at the end of the search bar.', host: '.shop .search', pseudo: '::after', handle: true, placeable: true },
  { key: 'chips', label: 'Mascots on the category buttons', hint: 'One picture per kind of category. Position and size apply to all of them.', host: '.categoryRail button', pseudo: '::before', handle: true, placeable: true },
  { key: 'cards', label: 'Mascots on the product cards', hint: 'The face in the corner of every product. Position and size apply to all of them.', host: '.product', pseudo: '::after', handle: true, placeable: true },
  { key: 'pageLogo', label: 'Mascot in the top bar (inner pages)', hint: 'Replaces the round logo on Cart, Orders, Wallet…', host: '.top .miniLogo', pseudo: '', handle: true, placeable: true },
  { key: 'nav', label: 'Mascot trio under the bottom bar', hint: 'The three friends peeking from under the navigation bar.', host: 'nav.bottom', pseudo: '::after', handle: true, placeable: true },
  { key: 'empty', label: 'Mascot on empty pages', hint: 'Shown when the cart, orders or wishlist is empty.', host: '.empty', pseudo: '::before', handle: true, placeable: true },
  { key: 'wallet', label: 'Mascot on the wallet card', hint: 'The box mascot on the wallet balance card.', host: '.walletGlow', pseudo: '', handle: true, placeable: true },
  { key: 'noPhoto', label: 'Product with no photo', hint: 'Shown in place of a missing product picture.', host: '.product .ph', pseudo: '', handle: false, placeable: false },
  { key: 'loading', label: 'Loading screen mascot', hint: 'Shown while the store loads.', host: '.marketLoadingOrb', pseudo: '', handle: false, placeable: false },
];

export const MASCOT_SLOTS: MascotSlot[] = [
  { key: 'clouds', group: 'clouds', label: 'Cloud strip (wide, ≈1600×240, no gap at the edges)', fallback: '/chiikawa/clouds.svg' },
  { key: 'headLeft', group: 'headLeft', label: 'Picture', fallback: '/chiikawa/mochi-happy.svg' },
  { key: 'headRight', group: 'headRight', label: 'Picture', fallback: '/chiikawa/bun-happy.svg' },
  { key: 'title', group: 'title', label: 'Picture', fallback: '/chiikawa/mochi.svg' },
  { key: 'search', group: 'search', label: 'Picture', fallback: '/chiikawa/mochi.svg' },
  { key: 'chipA', group: 'chips', label: 'Category button – 1st, 4th, 7th…', fallback: '/chiikawa/mochi.svg' },
  { key: 'chipB', group: 'chips', label: 'Category button – 2nd, 5th, 8th…', fallback: '/chiikawa/bun.svg' },
  { key: 'chipC', group: 'chips', label: 'Category button – 3rd, 6th, 9th…', fallback: '/chiikawa/kiki.svg' },
  { key: 'chipFood', group: 'chips', label: 'Food categories', fallback: '/chiikawa/onigiri.svg' },
  { key: 'chipBurger', group: 'chips', label: 'Burger categories', fallback: '/chiikawa/burger.svg' },
  { key: 'chipSweet', group: 'chips', label: 'Sweets / cake categories', fallback: '/chiikawa/cake.svg' },
  { key: 'chipDrink', group: 'chips', label: 'Drink categories', fallback: '/chiikawa/boba.svg' },
  { key: 'chipCoffee', group: 'chips', label: 'Coffee categories', fallback: '/chiikawa/latte.svg' },
  { key: 'chipIce', group: 'chips', label: 'Ice cream categories', fallback: '/chiikawa/icecream.svg' },
  { key: 'cardA', group: 'cards', label: 'Product card – 1st, 4th, 7th…', fallback: '/chiikawa/mochi-happy.svg' },
  { key: 'cardB', group: 'cards', label: 'Product card – 2nd, 5th, 8th…', fallback: '/chiikawa/bun-happy.svg' },
  { key: 'cardC', group: 'cards', label: 'Product card – 3rd, 6th, 9th…', fallback: '/chiikawa/kiki-happy.svg' },
  { key: 'pageLogo', group: 'pageLogo', label: 'Picture', fallback: '/chiikawa/mochi.svg' },
  { key: 'nav', group: 'nav', label: 'Picture (wide, ≈ 3 characters side by side)', fallback: '/chiikawa/trio.svg' },
  { key: 'empty', group: 'empty', label: 'Picture', fallback: '/chiikawa/mochi-happy.svg' },
  { key: 'wallet', group: 'wallet', label: 'Picture', fallback: '/chiikawa/mochi-box.svg' },
  { key: 'noPhoto', group: 'noPhoto', label: 'Picture', fallback: '/chiikawa/mochi-box.svg' },
  { key: 'loading', group: 'loading', label: 'Picture', fallback: '/chiikawa/mochi-happy.svg' },
];

/** Built-in mascots that already move in chiikawa.css. A copy made with "Duplicate" gets the same movement (type = a themeElements AnimType). */
export const MASCOT_NATIVE_MOTION: Record<string, { type: string; speed: number }> = {
  headLeft: { type: 'float', speed: 5 },
  headRight: { type: 'float', speed: 4 },
};

const cssUrl = (u: string) => `url("${String(u).replace(/"/g, '%22')}")`;
const n = (v: any, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);

/** Seconds the clouds need to cross the screen once (smaller = faster). */
export const DEFAULT_CLOUD_SECONDS = 80;

/** CSS custom properties chiikawa.css reads. Nothing is emitted for untouched mascots. */
export function mascotVars(images: Record<string, string> | undefined, pos: Record<string, MascotPos> | undefined, cloudSeconds?: number | null): string[] {
  const out: string[] = [];
  const im = images || {}, ps = pos || {};
  for (const s of MASCOT_SLOTS) {
    const u = im[s.key];
    if (typeof u === 'string' && u) out.push(`--ck-m-${s.key}:${cssUrl(u)}`);
  }
  for (const g of MASCOT_GROUPS) {
    const p = ps[g.key];
    if (!p) continue;
    if (p.dx) out.push(`--ck-dx-${g.key}:${Math.round(n(p.dx, -2000, 2000, 0))}px`);
    if (p.dy) out.push(`--ck-dy-${g.key}:${Math.round(n(p.dy, -2000, 2000, 0))}px`);
    if (p.s && p.s !== 100) out.push(`--ck-s-${g.key}:${n(p.s, 20, 400, 100) / 100}`);
    if (p.hide) out.push(`--ck-d-${g.key}:none`, `--ck-v-${g.key}:hidden`);
  }
  if (typeof cloudSeconds === 'number' && cloudSeconds > 0 && cloudSeconds !== DEFAULT_CLOUD_SECONDS) out.push(`--ck-cloud-t:${Math.round(n(cloudSeconds, 8, 400, DEFAULT_CLOUD_SECONDS))}s`);
  return out;
}

export function normalizeMascotImages(raw: any): Record<string, string> {
  const o: Record<string, string> = {};
  if (raw && typeof raw === 'object') for (const s of MASCOT_SLOTS) if (typeof raw[s.key] === 'string' && raw[s.key]) o[s.key] = raw[s.key];
  return o;
}
export function normalizeMascotPos(raw: any): Record<string, MascotPos> {
  const o: Record<string, MascotPos> = {};
  if (raw && typeof raw === 'object') for (const g of MASCOT_GROUPS) {
    const r = raw[g.key];
    if (!r || typeof r !== 'object') continue;
    const p: MascotPos = {};
    if (typeof r.dx === 'number') p.dx = r.dx;
    if (typeof r.dy === 'number') p.dy = r.dy;
    if (typeof r.s === 'number') p.s = r.s;
    if (r.hide) p.hide = true;
    if (Object.keys(p).length) o[g.key] = p;
  }
  return o;
}
