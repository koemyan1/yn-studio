import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from './supabase';

/* ------------------------------------------------------------------ *
 *  Secret theme engine
 *  A theme is a JSON config saved in site_themes.config. The runtime turns
 *  that config into real CSS that restyles the actual customer storefront,
 *  so whatever the admin designs in the editor is exactly what customers get.
 * ------------------------------------------------------------------ */

export type StyleProps = {
  background?: string; backgroundImage?: string; color?: string;
  borderColor?: string; borderWidth?: number; radius?: number;
  shadow?: 'none' | 'soft' | 'medium' | 'strong';
  fontSize?: number; fontWeight?: number; padding?: number; opacity?: number;
  hidden?: boolean; fit?: 'cover' | 'contain';
};
export type PropName = keyof StyleProps;

const BOX: PropName[] = ['background', 'backgroundImage', 'color', 'borderColor', 'borderWidth', 'radius', 'shadow', 'padding', 'opacity', 'hidden'];
const TEXT: PropName[] = ['color', 'fontSize', 'fontWeight', 'opacity', 'hidden'];

export type ComponentDef = { key: string; label: string; group: string; selector: string; props: PropName[] };

/** Every restylable part of the real customer storefront. */
export const COMPONENTS: ComponentDef[] = [
  { key: 'header', label: 'Top bar (inner pages)', group: 'Header & search', selector: '.shop .top, .detail .top', props: BOX },
  { key: 'brandEyebrow', label: 'Small heading above store name', group: 'Header & search', selector: '.brandrow .eyebrow', props: TEXT },
  { key: 'brandTitle', label: 'Store name heading', group: 'Header & search', selector: '.brandrow h1', props: TEXT },
  { key: 'headerIcons', label: 'Bell / profile buttons', group: 'Header & search', selector: '.homeActions .icon, .homeActions .avatar', props: BOX },
  { key: 'search', label: 'Search bar', group: 'Header & search', selector: '.shop .search', props: BOX },
  { key: 'hero', label: 'Hero card (when no banners)', group: 'Home', selector: '.shop .hero', props: BOX },
  { key: 'banner', label: 'Banner slider', group: 'Home', selector: '.shop .bannerSlider', props: ['borderColor', 'borderWidth', 'radius', 'shadow', 'opacity', 'hidden'] },
  { key: 'categoryRail', label: 'Category row', group: 'Home', selector: '.categoryRail', props: ['background', 'padding', 'hidden'] },
  { key: 'categoryChip', label: 'Category button', group: 'Home', selector: '.categoryRail button', props: BOX.concat(['fontSize', 'fontWeight']) },
  { key: 'categoryChipActive', label: 'Selected category button', group: 'Home', selector: '.categoryRail button.on', props: BOX.concat(['fontSize', 'fontWeight']) },
  { key: 'sectionTitle', label: 'Section titles', group: 'Home', selector: '.sectionHead h2, .shop .sectionHead h3', props: TEXT },
  { key: 'productCard', label: 'Product card', group: 'Products', selector: '.product', props: BOX },
  { key: 'productImage', label: 'Product image area', group: 'Products', selector: '.product > img, .product .ph', props: ['background', 'radius', 'opacity', 'fit'] },
  { key: 'productName', label: 'Product name', group: 'Products', selector: '.product .pcopy strong', props: TEXT.concat(['background']) },
  { key: 'productPrice', label: 'Product price', group: 'Products', selector: '.product .pcopy span', props: TEXT },
  { key: 'heart', label: 'Wishlist heart', group: 'Products', selector: '.product .heart', props: BOX },
  { key: 'detailCard', label: 'Product page card', group: 'Products', selector: '.detail .detailCard', props: BOX },
  { key: 'gallery', label: 'Product page gallery', group: 'Products', selector: '.detail .gallery', props: BOX },
  { key: 'button', label: 'Main buttons', group: 'Buttons & forms', selector: '.shop button:not(.secondary):not(.icon):not(.heart):not(.on), .detail button:not(.secondary):not(.icon):not(.heart), .profilePage button:not(.secondary):not(.icon), .button', props: BOX.concat(['fontSize', 'fontWeight']) },
  { key: 'secondaryButton', label: 'Secondary buttons', group: 'Buttons & forms', selector: 'button.secondary', props: BOX.concat(['fontSize', 'fontWeight']) },
  { key: 'input', label: 'Text fields', group: 'Buttons & forms', selector: '.shop input, .shop select, .shop textarea, .detail input, .detail select, .profilePage input, .profilePage textarea', props: BOX.concat(['fontSize']) },
  { key: 'panel', label: 'Panels & cards (cart, orders, wallet, profile)', group: 'Other pages', selector: '.shop .panel, .cartrow, .ordercard, .transaction, .profilePanel, .profileHero', props: BOX },
  { key: 'walletHero', label: 'Wallet balance card', group: 'Other pages', selector: '.walletHero', props: BOX },
  { key: 'pageHeading', label: 'Page headings', group: 'Other pages', selector: '.shop h1, .shop h2, .detail h1, .profilePage h1, .cartHeader h1', props: TEXT },
  { key: 'bottomNav', label: 'Bottom navigation bar', group: 'Navigation', selector: 'nav.bottom', props: BOX },
  { key: 'bottomNavItem', label: 'Bottom navigation item', group: 'Navigation', selector: 'nav.bottom a', props: ['color', 'fontSize', 'fontWeight', 'radius'] },
  { key: 'bottomNavActive', label: 'Bottom navigation (current page)', group: 'Navigation', selector: 'nav.bottom a.active', props: BOX.concat(['fontWeight']) },
];

export const PAGES: { key: string; label: string; path: string }[] = [
  { key: 'home', label: 'Home', path: '/' },
  { key: 'products', label: 'Product page', path: '/product' },
  { key: 'wishlist', label: 'Wishlist', path: '/wishlist' },
  { key: 'cart', label: 'Cart', path: '/cart' },
  { key: 'checkout', label: 'Checkout', path: '/checkout' },
  { key: 'orders', label: 'Orders', path: '/orders' },
  { key: 'wallet', label: 'Wallet', path: '/wallet' },
  { key: 'profile', label: 'Profile', path: '/profile' },
];

export const TEXT_KEYS: { key: string; label: string; fallback: string; multiline?: boolean }[] = [
  { key: 'brandEyebrow', label: 'Small heading above store name', fallback: 'MARKETPLACE' },
  { key: 'brandTitle', label: 'Store name', fallback: 'YN Studio' },
  { key: 'searchPlaceholder', label: 'Search placeholder', fallback: 'Search anything…' },
  { key: 'heroEyebrow', label: 'Hero small label', fallback: 'FRESH PICKS' },
  { key: 'heroTitle', label: 'Hero title (new line = line break)', fallback: 'Little things.\nBetter days.', multiline: true },
  { key: 'heroText', label: 'Hero text', fallback: 'Discover products selected for you.' },
  { key: 'categoryAll', label: '"All" category label', fallback: 'All' },
  { key: 'navHome', label: 'Nav: Home', fallback: 'Home' },
  { key: 'navWishlist', label: 'Nav: Wishlist', fallback: 'Wishlist' },
  { key: 'navCart', label: 'Nav: Cart', fallback: 'Cart' },
  { key: 'navOrders', label: 'Nav: Orders', fallback: 'Orders' },
  { key: 'navWallet', label: 'Nav: Wallet', fallback: 'Wallet' },
  { key: 'navProfile', label: 'Nav: Profile', fallback: 'Profile' },
];

/** The real colours of the default storefront (from style.css :root). */
export const DEFAULT_TOKENS = {
  background: '#faf8ff', surface: '#ffffff', text: '#241b35', muted: '#776f86',
  border: '#e9e2f4', accent: '#7c3aed', accent2: '#9b5cff',
};

export const blankTheme = () => ({
  version: 2,
  preset: 'custom',
  background: '', surface: '', text: '', muted: '', border: '', accent: '', accent2: '',
  radius: null as number | null,
  font: '', headingFont: '', fontUrl: '',
  backgroundImage: '', bannerImage: '',
  layout: { columns: 0, maxWidth: 0, navStyle: 'floating' as 'floating' | 'flat' | 'hidden' },
  texts: {} as Record<string, string>,
  components: {} as Record<string, StyleProps>,
  pageStyles: {} as Record<string, { background?: string; backgroundImage?: string }>,
  elements: [] as any[],
  customCss: '',
  allowedCategories: [] as string[],
  bannerIds: [] as string[],
});

/** Merge saved JSON onto the blank config so old themes keep working. */
export function normalizeTheme(raw: any) {
  const b = blankTheme();
  const c = raw || {};
  const tok = (k: string) => (typeof c[k] === 'string' ? c[k] : '');
  return {
    ...b, ...c,
    background: tok('background'), surface: tok('surface'), text: tok('text'), muted: tok('muted'),
    border: tok('border'), accent: tok('accent'), accent2: tok('accent2'),
    radius: typeof c.radius === 'number' ? c.radius : null,
    layout: { ...b.layout, ...(c.layout || {}) },
    texts: { ...(c.texts || {}) },
    components: { ...(c.components || {}) },
    pageStyles: { ...(c.pageStyles || {}) },
    elements: Array.isArray(c.elements) ? c.elements : [],
    allowedCategories: Array.isArray(c.allowedCategories) ? c.allowedCategories : [],
    bannerIds: Array.isArray(c.bannerIds) ? c.bannerIds : [],
    customCss: typeof c.customCss === 'string' ? c.customCss : '',
  };
}

export const THEME_PRESETS: { id: string; label: string; swatch: string[]; cfg: Partial<ReturnType<typeof blankTheme>> }[] = [
  { id: 'default', label: 'Default look', swatch: ['#faf8ff', '#7c3aed', '#9b5cff'], cfg: {} },
  { id: 'midnight', label: 'Midnight', swatch: ['#120b22', '#a78bfa', '#f0abfc'], cfg: { background: '#120b22', surface: '#1e1433', text: '#f6f0ff', muted: '#b7a8d6', border: '#3a2a5c', accent: '#a78bfa', accent2: '#f0abfc', radius: 22 } },
  { id: 'mint', label: 'Mint', swatch: ['#f2fbf7', '#10b981', '#34d399'], cfg: { background: '#f2fbf7', surface: '#ffffff', text: '#1f3d36', muted: '#6b8a82', border: '#d3ece3', accent: '#10b981', accent2: '#34d399', radius: 20 } },
  { id: 'sunset', label: 'Sunset', swatch: ['#fff6ef', '#f97316', '#ec4899'], cfg: { background: '#fff6ef', surface: '#fffdfb', text: '#4a2c2a', muted: '#946c63', border: '#f5dccb', accent: '#f97316', accent2: '#ec4899', radius: 28 } },
  { id: 'chiikawa', label: 'Chiikawa pastel', swatch: ['#fff8fb', '#f3a9c2', '#e9caff'], cfg: { preset: 'chiikawa', background: '#fff8fb', surface: '#fffefd', text: '#49384f', accent: '#f3a9c2', radius: 24, font: 'Trebuchet MS, system-ui, sans-serif' } },
];

/* ------------------------------ CSS generation ------------------------------ */

const PREFIX = 'html[data-secret-theme="on"][data-secret-preset][data-yn-theme]:root';
const SHADOWS: Record<string, string> = {
  none: 'none', soft: '0 6px 18px rgba(30,20,50,.10)', medium: '0 12px 30px rgba(30,20,50,.18)', strong: '0 18px 46px rgba(30,20,50,.32)',
};
const cssUrl = (u: string) => `url("${String(u).replace(/"/g, '%22')}")`;
const safe = (v: any) => String(v).replace(/[;{}<>]/g, '');
const scoped = (selector: string) => selector.split(',').map(s => `${PREFIX} ${s.trim()}`).join(',');

function declarations(p: StyleProps): string {
  const d: string[] = [];
  if (p.hidden) return 'display:none!important;';
  if (p.background) d.push(`background:${safe(p.background)}!important`);
  if (p.backgroundImage) d.push(`background-image:${cssUrl(p.backgroundImage)}!important`, 'background-size:cover!important', 'background-position:center!important');
  if (p.color) d.push(`color:${safe(p.color)}!important`);
  if (p.borderColor || p.borderWidth != null) d.push(`border:${p.borderWidth ?? 1}px solid ${safe(p.borderColor || 'var(--line)')}!important`);
  if (p.radius != null) d.push(`border-radius:${Number(p.radius)}px!important`);
  if (p.shadow) d.push(`box-shadow:${SHADOWS[p.shadow] || 'none'}!important`);
  if (p.fontSize) d.push(`font-size:${Number(p.fontSize)}px!important`);
  if (p.fontWeight) d.push(`font-weight:${Number(p.fontWeight)}!important`);
  if (p.padding != null) d.push(`padding:${Number(p.padding)}px!important`);
  if (p.opacity != null) d.push(`opacity:${Number(p.opacity) / 100}!important`);
  if (p.fit) d.push(`object-fit:${p.fit}!important`);
  return d.join(';') + (d.length ? ';' : '');
}

/** Scope author-written CSS so it only affects the customer storefront while the theme is on. */
export function scopeCustomCss(css: string): string {
  try {
    const clean = String(css || '').replace(/@import[^;]*;?/gi, '').replace(/<\/?style[^>]*>/gi, '');
    const walk = (s: string): string => {
      let out = '', i = 0;
      while (i < s.length) {
        const open = s.indexOf('{', i);
        if (open < 0) break;
        const head = s.slice(i, open).trim();
        let depth = 1, j = open + 1;
        while (j < s.length && depth > 0) { if (s[j] === '{') depth++; else if (s[j] === '}') depth--; j++; }
        const body = s.slice(open + 1, j - 1);
        if (/^@(media|supports)/i.test(head)) out += `${head}{${walk(body)}}`;
        else if (head.startsWith('@')) out += `${head}{${body}}`;
        else {
          const sel = head.split(',').map(x => x.trim()).filter(Boolean).map(x => {
            if (/^(html|:root)$/i.test(x)) return PREFIX;
            if (/^body$/i.test(x)) return `${PREFIX} body`;
            return `${PREFIX} ${x.replace(/^(html|:root)\s+/i, '')}`;
          }).join(',');
          out += `${sel}{${body}}`;
        }
        i = j;
      }
      return out;
    };
    return walk(clean);
  } catch { return ''; }
}

export function pageKeyFor(path: string): string {
  return path.includes('/cart') ? 'cart' : path.includes('/wishlist') ? 'wishlist' : path.includes('/orders') ? 'orders'
    : path.includes('/wallet') ? 'wallet' : path.includes('/profile') ? 'profile' : path.includes('/checkout') ? 'checkout'
    : path.includes('/product') ? 'products' : 'home';
}

const PAGE_SELECTORS = '.shop, .detail, .cartPage, .checkoutPage, .ordersPage, .walletPage, .profilePage, .wishlistPage';

export function buildThemeCss(input: any, path = '/'): string {
  const c = normalizeTheme(input);
  let css = '';
  const vars: string[] = [];
  if (c.accent) vars.push(`--purple:${safe(c.accent)}`, `--purple2:${safe(c.accent2 || c.accent)}`);
  else if (c.accent2) vars.push(`--purple2:${safe(c.accent2)}`);
  if (c.text) vars.push(`--ink:${safe(c.text)}`);
  if (c.muted) vars.push(`--muted:${safe(c.muted)}`);
  if (c.border) vars.push(`--line:${safe(c.border)}`);
  if (c.surface) vars.push(`--card:${safe(c.surface)}`);
  if (c.surface || c.accent) vars.push(`--soft:color-mix(in srgb,${safe(c.accent || DEFAULT_TOKENS.accent)} 12%,${safe(c.surface || DEFAULT_TOKENS.surface)})`);
  if (vars.length) css += `${PREFIX}{${vars.join(';')};}`;

  if (c.background) css += `${PREFIX}, ${PREFIX} body{background-color:${safe(c.background)}!important;}`;
  if (c.text) css += `${PREFIX} body{color:${safe(c.text)};}`;
  if (c.backgroundImage) css += `${PREFIX} body{background-image:${cssUrl(c.backgroundImage)}!important;background-size:cover;background-position:center;background-attachment:fixed;}`;
  if (c.surface) css += scoped('.product, .panel, .detailCard, .cartrow, .ordercard, .transaction, .profilePanel, .profileHero, .search, .bottom') + `{background-color:${safe(c.surface)}!important;}`;
  if (c.text) css += scoped('.product, .panel, .detailCard, .cartrow, .ordercard, .transaction, .profilePanel, .profileHero, .shop h1, .shop h2, .shop h3, .detail h1, .profilePage h1') + `{color:${safe(c.text)};}`;
  if (c.font) css += `${PREFIX}, ${PREFIX} body, ${PREFIX} button, ${PREFIX} input, ${PREFIX} select, ${PREFIX} textarea{font-family:${safe(c.font)}!important;}`;
  if (c.headingFont) css += scoped('h1, h2, h3, .brandrow h1') + `{font-family:${safe(c.headingFont)}!important;}`;
  if (c.radius != null) {
    const r = Number(c.radius);
    css += scoped('.product, .panel, .detailCard, .cartrow, .ordercard, .transaction, .profilePanel, .profileHero, .hero, .bannerSlider, .search, .walletHero, .gallery') + `{border-radius:${r}px!important;}`;
    css += scoped('.bottom') + `{border-radius:${Math.round(r * .9)}px!important;}`;
    css += scoped('button:not(.icon):not(.heart), .button, input, select, textarea') + `{border-radius:${Math.round(r * .6)}px!important;}`;
  }

  const L = c.layout;
  if (L.columns) css += scoped('.homeProductGrid, .grid') + `{grid-template-columns:repeat(${Number(L.columns)},minmax(0,1fr))!important;}`;
  if (L.maxWidth) css += scoped('.shop') + `{width:min(${Number(L.maxWidth)}px,100%)!important;}`;
  if (L.navStyle === 'flat') css += scoped('nav.bottom') + '{bottom:0!important;width:100%!important;border-radius:0!important;border-left:0!important;border-right:0!important;border-bottom:0!important;}';
  if (L.navStyle === 'hidden') css += scoped('nav.bottom') + '{display:none!important;}';

  const ps = c.pageStyles[pageKeyFor(path)] || {};
  if (ps.background) css += scoped(PAGE_SELECTORS) + `{background-color:${safe(ps.background)}!important;}`;
  if (ps.backgroundImage) css += scoped(PAGE_SELECTORS) + `{background-image:${cssUrl(ps.backgroundImage)}!important;background-size:cover!important;background-position:center!important;}`;

  for (const def of COMPONENTS) {
    const p = c.components[def.key];
    if (!p) continue;
    const d = declarations(p);
    if (d) css += `${scoped(def.selector)}{${d}}`;
  }
  if (c.customCss.trim()) css += scopeCustomCss(c.customCss);
  return css;
}

/* ------------------------------ Runtime state ------------------------------ */

let current: any | null = null;
const EVENT = 'yn-secret-theme-applied';
export const isPreviewFrame = () => typeof window !== 'undefined' && window.name === 'yn-theme-preview';

export function useThemeConfig(): any | null {
  const [cfg, setCfg] = useState<any | null>(current);
  useEffect(() => {
    const h = () => setCfg(current);
    window.addEventListener(EVENT, h);
    h();
    return () => window.removeEventListener(EVENT, h);
  }, []);
  return cfg;
}

/** Text override helper: t('brandTitle','YN Studio') */
export function useThemeText() {
  const cfg = useThemeConfig();
  return (key: string, fallback: string) => {
    const v = cfg?.texts?.[key];
    return typeof v === 'string' && v.trim() ? v : fallback;
  };
}
export const Lines = ({ text }: { text: string }) => <>{String(text).split('\n').map((l, i, a) => <React.Fragment key={i}>{l}{i < a.length - 1 && <br />}</React.Fragment>)}</>;

function styleEl(id: string): HTMLStyleElement {
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
  return el;
}

function clearTheme() {
  const root = document.documentElement;
  root.removeAttribute('data-secret-theme'); root.removeAttribute('data-secret-preset'); root.removeAttribute('data-yn-theme');
  ['--secret-bg', '--secret-surface', '--secret-text', '--secret-accent', '--secret-radius', '--secret-font', '--secret-wallpaper', '--secret-banner'].forEach(k => root.style.removeProperty(k));
  document.getElementById('yn-theme-style')?.remove();
  document.getElementById('yn-theme-font')?.remove();
  current = null;
  window.dispatchEvent(new Event(EVENT));
}

function applyTheme(raw: any, path: string) {
  const c = normalizeTheme(raw);
  const root = document.documentElement;
  root.setAttribute('data-secret-theme', 'on');
  root.setAttribute('data-secret-preset', c.preset || 'custom');
  root.setAttribute('data-yn-theme', '1');
  // Variables the built-in Chiikawa preset (and older themes) read.
  root.style.setProperty('--secret-bg', c.background || DEFAULT_TOKENS.background);
  root.style.setProperty('--secret-surface', c.surface || DEFAULT_TOKENS.surface);
  root.style.setProperty('--secret-text', c.text || DEFAULT_TOKENS.text);
  root.style.setProperty('--secret-accent', c.accent || DEFAULT_TOKENS.accent);
  root.style.setProperty('--secret-radius', (c.radius ?? 20) + 'px');
  root.style.setProperty('--secret-font', c.font || 'Inter, system-ui, sans-serif');
  root.style.setProperty('--secret-wallpaper', c.backgroundImage ? cssUrl(c.backgroundImage) : 'none');
  root.style.setProperty('--secret-banner', c.bannerImage ? cssUrl(c.bannerImage) : 'none');
  styleEl('yn-theme-style').textContent = buildThemeCss(c, path);
  const fontLink = document.getElementById('yn-theme-font') as HTMLLinkElement | null;
  if (c.fontUrl && /^https:\/\/fonts\.googleapis\.com\//.test(c.fontUrl)) {
    if (fontLink) { if (fontLink.href !== c.fontUrl) fontLink.href = c.fontUrl; }
    else { const l = document.createElement('link'); l.id = 'yn-theme-font'; l.rel = 'stylesheet'; l.href = c.fontUrl; document.head.appendChild(l); }
  } else fontLink?.remove();
  current = c;
  window.dispatchEvent(new Event(EVENT));
}

/** Finds which restylable part of the page was clicked (deepest match wins). */
function componentAt(target: Element | null): ComponentDef | null {
  if (!target) return null;
  let best: ComponentDef | null = null, bestDepth = -1;
  for (const def of COMPONENTS) {
    let hit: Element | null = null;
    try { hit = target.closest(def.selector); } catch { hit = null; }
    if (!hit) continue;
    let depth = 0, n: Element | null = hit;
    while (n) { depth++; n = n.parentElement; }
    if (depth > bestDepth) { best = def; bestDepth = depth; }
  }
  return best;
}

export function SecretThemeRuntime() {
  const location = useLocation();
  const preview = isPreviewFrame();
  const path = location.pathname;
  const [draft, setDraft] = useState<any | null>(null);
  const [customer, setCustomer] = useState<any | null>(null);

  // Customer mode: load the activated theme from the account.
  useEffect(() => {
    if (preview) return;
    let alive = true;
    async function load() {
      if (path.startsWith('/admin')) { if (alive) setCustomer(null); return; }
      const { data } = await supabase.auth.getUser();
      if (!data.user) { if (alive) setCustomer(null); return; }
      const r = await supabase.rpc('get_customer_secret_theme');
      if (!alive) return;
      const row = Array.isArray(r.data) ? r.data[0] : r.data;
      if (row?.id) { localStorage.setItem('yn-secret-theme-id', row.id); setCustomer(row); }
      else { localStorage.removeItem('yn-secret-theme-id'); setCustomer(null); }
    }
    void load();
    const reload = () => { void load(); };
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('yn-secret-theme-change', reload);
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; window.removeEventListener('yn-secret-theme-change', reload); document.removeEventListener('visibilitychange', onVisible); };
  }, [path, preview]);

  // Preview mode: receive the unsaved draft from the admin editor.
  useEffect(() => {
    if (!preview) return;
    let selectMode = true, selectedKey = '';
    const hl = styleEl('yn-theme-preview-style');
    const paint = () => {
      const def = COMPONENTS.find(x => x.key === selectedKey);
      hl.textContent = (selectMode ? `html *{cursor:crosshair!important}` : '') +
        (def ? `${def.selector}{outline:3px solid #ff3d8b!important;outline-offset:2px!important}` : '') +
        (selectMode ? `.secretThemeOverlay{pointer-events:none!important}` : '');
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== 'yn-theme-draft') return;
      selectMode = e.data.selectMode !== false; selectedKey = e.data.selectedKey || '';
      setDraft(e.data.config); paint();
    };
    const onClick = (e: MouseEvent) => {
      if (!selectMode) return;
      e.preventDefault(); e.stopPropagation();
      const def = componentAt(e.target as Element);
      if (def) { selectedKey = def.key; paint(); window.parent.postMessage({ type: 'yn-theme-select', key: def.key }, window.location.origin); }
    };
    const block = (e: Event) => { if (selectMode) { e.preventDefault(); e.stopPropagation(); } };
    window.addEventListener('message', onMessage);
    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', block, true);
    window.parent.postMessage({ type: 'yn-theme-ready' }, window.location.origin);
    return () => { window.removeEventListener('message', onMessage); document.removeEventListener('click', onClick, true); document.removeEventListener('submit', block, true); hl.remove(); };
  }, [preview]);

  useEffect(() => { if (preview) window.parent.postMessage({ type: 'yn-theme-path', path }, window.location.origin); }, [path, preview]);

  const active = preview ? draft : customer?.config;
  useEffect(() => {
    if (active) applyTheme(active, path); else clearTheme();
    return () => { /* theme stays applied across route changes; cleared when inactive */ };
  }, [active, path]);

  const els: any[] = active?.elements || [];
  return els.length ? (
    <div className="secretThemeOverlay" aria-hidden="true">
      {els.map((el: any) => (
        <div key={el.id} className="secretThemeElement" style={{ left: el.x + '%', top: el.y + '%', width: el.w + '%', minHeight: el.h + 'px', color: el.color, background: el.background, borderRadius: el.radius + 'px', fontSize: el.fontSize + 'px', zIndex: el.z || 1 }}>
          {el.image && <img src={el.image} alt="" />}{el.text}
        </div>
      ))}
    </div>
  ) : null;
}
