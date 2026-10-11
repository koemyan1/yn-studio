/* Small per-customer toggles that theme buttons can change at runtime. */

export const isPreviewFrame = () => typeof window !== 'undefined' && window.name === 'yn-theme-preview';
export const LIVE_EVT = 'yn-theme-live';
const BG_KEY = 'yn-live-bg';      // session only – "random background" button
const SEED_KEY = 'yn-color-seed'; // session only – "shuffle product colours" button
const DARK_KEY = 'yn-theme-dark'; // remembered – '1' dark, '0' light, missing = follow the theme

const get = (s: Storage, k: string) => { try { return s.getItem(k) || ''; } catch { return ''; } };
const set = (s: Storage, k: string, v: string) => { try { if (v) s.setItem(k, v); else s.removeItem(k); } catch { /* ignore */ } };
const ping = () => window.dispatchEvent(new Event(LIVE_EVT));

export const getLiveBg = () => get(sessionStorage, BG_KEY);
export const setLiveBg = (c: string) => { set(sessionStorage, BG_KEY, c); ping(); };

export const getSeedOffset = () => Number(get(sessionStorage, SEED_KEY) || 0);
export const bumpSeed = () => { set(sessionStorage, SEED_KEY, String(getSeedOffset() + 1)); ping(); };

// Inside the Studio preview the choice is kept in memory only, so it never touches the admin's own storage.
let previewDark: '' | '1' | '0' = '';
export const getDarkPref = (): '' | '1' | '0' => {
  if (isPreviewFrame()) return previewDark;
  const v = get(localStorage, DARK_KEY); return v === '1' ? '1' : v === '0' ? '0' : '';
};
export const setDarkPref = (v: '' | '1' | '0') => { if (isPreviewFrame()) previewDark = v; else set(localStorage, DARK_KEY, v); ping(); };

/** Home-page hand-off used by "show category" / "search" buttons (works even if Home is not mounted yet). */
export const PENDING_KEY = 'yn-pending-home-action';
export function queueHomeAction(a: { category?: string; search?: string }) {
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(a)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('yn-home-action', { detail: a }));
}
export function takeHomeAction(): { category?: string; search?: string } | null {
  try { const v = sessionStorage.getItem(PENDING_KEY); sessionStorage.removeItem(PENDING_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}

