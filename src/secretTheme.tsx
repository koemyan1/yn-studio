import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from './supabase';
import { ThemeOverlay, designViewport, normalizeElement, screenScale, zoomK, type OverlayMode, type ThemeEl } from './themeElements';
import { colorForProduct, gradientForProduct, processedImageUrl } from './imageTools';
import { LIVE_EVT, getDarkPref, getLiveBg, getSeedOffset, isPreviewFrame, setDarkPref } from './themeLive';
import { MascotHandles, measureMascotInfo } from './MascotHandles';
import { PartIcons, type PartIconSpec } from './PartIcons';
import { setKhmerFont } from './lang';
import { mascotVars, normalizeMascotImages, normalizeMascotPos, type MascotPos } from './chiikawaMascots';
import { blankProductMascots, normalizeProductMascots } from './productMascotsCore';

export { isPreviewFrame };

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
  /** Locked in the editor (like Adobe Illustrator): cannot be dragged or changed until unlocked. Has no effect on customers. */
  locked?: boolean;
  /** Move the part (px) without touching the page layout around it. */
  moveX?: number; moveY?: number;
  /** A picture used as the part's icon (replaces the little built-in icon of buttons / nav items). */
  icon?: string; iconSize?: number; iconSide?: 'left' | 'right' | 'top'; iconKeep?: boolean;
};
export type PropName = keyof StyleProps;

const BOX: PropName[] = ['background', 'backgroundImage', 'color', 'borderColor', 'borderWidth', 'radius', 'shadow', 'padding', 'opacity', 'hidden'];
const TEXT: PropName[] = ['color', 'fontSize', 'fontWeight', 'opacity', 'hidden'];

export type ComponentDef = { key: string; label: string; group: string; selector: string; props: PropName[] };

/** Every restylable part of the real customer storefront. */
const BASE_COMPONENTS: ComponentDef[] = [
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

/** Every part can be moved, get a background colour / picture, and (except plain pictures) an icon picture. */
const UNIVERSAL: PropName[] = ['background', 'backgroundImage', 'moveX', 'moveY'];
const ICON_PROPS: PropName[] = ['icon', 'iconSize', 'iconSide'];
export const COMPONENTS: ComponentDef[] = BASE_COMPONENTS.map(d => {
  const extra = [...UNIVERSAL, ...(d.key === 'productImage' ? [] : ICON_PROPS)].filter(x => !d.props.includes(x));
  const hasHidden = d.props.includes('hidden');
  const base = d.props.filter(x => x !== 'hidden');
  return { ...d, props: [...base, ...extra, ...(hasHidden ? ['hidden' as PropName] : [])] };
});

/** Anything the admin taps in the preview that is not in the list above becomes a "tapped part" with every tool. */
export const AUTO_PROPS: PropName[] = ['background', 'backgroundImage', 'color', 'borderColor', 'borderWidth', 'radius', 'shadow', 'fontSize', 'fontWeight', 'padding', 'opacity', 'fit', 'moveX', 'moveY', 'icon', 'iconSize', 'iconSide', 'hidden'];
export type CustomPart = { selector: string; label: string };
export function cleanSelector(v: any): string {
  return typeof v === 'string' ? v.replace(/[{};<@\\\n\r]/g, '').trim().slice(0, 240) : '';
}
export function allComponents(c: any): ComponentDef[] {
  const cp: Record<string, CustomPart> = (c && c.customParts) || {};
  const extra: ComponentDef[] = Object.keys(cp).map(key => ({ key, label: String(cp[key].label || 'Tapped part').slice(0, 60), group: 'Tapped parts', selector: cleanSelector(cp[key].selector), props: AUTO_PROPS }))
    .filter(d => d.selector);
  return extra.length ? [...COMPONENTS, ...extra] : COMPONENTS;
}

export const PAGES: { key: string; label: string; path: string }[] = [
  { key: 'home', label: 'Home', path: '/' },
  { key: 'products', label: 'Product page', path: '/product' },
  { key: 'wishlist', label: 'Wishlist', path: '/wishlist' },
  { key: 'cart', label: 'Cart', path: '/cart' },
  { key: 'checkout', label: 'Checkout', path: '/checkout' },
  { key: 'orders', label: 'Orders', path: '/orders' },
  { key: 'wallet', label: 'Wallet', path: '/wallet' },
  { key: 'profile', label: 'Profile', path: '/profile' },
  { key: 'notifications', label: 'Notifications', path: '/notifications' },
  { key: 'rewards', label: 'Rewards', path: '/rewards' },
  { key: 'snacks', label: 'Snacks (Chiikawa)', path: '/snacks' },
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
  { key: 'snacksChip', label: 'Snacks: button on Home + page title', fallback: 'Snacks' },
  { key: 'snacksEyebrow', label: 'Snacks page: small heading', fallback: 'CHIIKAWA SNACK TIME' },
  { key: 'snacksTitle', label: 'Snacks page: big title', fallback: 'Yummy little snacks.' },
  { key: 'snacksIntro', label: 'Snacks page: text under the title', fallback: 'Pick your favorite treats and add them to your cart.' },
];

/** The real colours of the default storefront (from style.css :root). */
export const DEFAULT_TOKENS = {
  background: '#faf8ff', surface: '#ffffff', text: '#241b35', muted: '#776f86',
  border: '#e9e2f4', accent: '#7c3aed', accent2: '#9b5cff',
};

/* ------------------------------ per-page edits ------------------------------ */

/** Everything the Studio can change for a single page. Anything not listed here is shared by every page. */
export type PageOverride = {
  components?: Record<string, StyleProps>;
  mascotPos?: Record<string, MascotPos>;
  mascotImages?: Record<string, string>;
  texts?: Record<string, string>;
  customParts?: Record<string, CustomPart>;
};
export const PAGE_OVERRIDE_FIELDS = ['components', 'mascotPos', 'mascotImages', 'texts', 'customParts'] as const;

/** Merge the page's own edits on top of the shared ones. Used by the live store, the editor preview and the editor's own panels. */
export function effectiveTheme<T extends Record<string, any>>(c: T, pageKey: string): T {
  const po: PageOverride | undefined = c && c.pageOverrides ? c.pageOverrides[pageKey] : undefined;
  if (!po) return c;
  const mergeMap = (a: Record<string, any> = {}, b: Record<string, any> = {}) => {
    const out: Record<string, any> = { ...a };
    for (const k of Object.keys(b)) out[k] = a[k] && typeof a[k] === 'object' && typeof b[k] === 'object' ? { ...a[k], ...b[k] } : b[k];
    return out;
  };
  return {
    ...c,
    components: mergeMap(c.components, po.components),
    mascotPos: mergeMap(c.mascotPos, po.mascotPos),
    mascotImages: { ...(c.mascotImages || {}), ...(po.mascotImages || {}) },
    texts: { ...(c.texts || {}), ...(po.texts || {}) },
    customParts: { ...(c.customParts || {}), ...(po.customParts || {}) },
  };
}

/** How many separate edits a page has of its own (for the “clear this page” button). */
export function pageOverrideCount(c: any, pageKey: string): number {
  const po: PageOverride | undefined = c?.pageOverrides?.[pageKey];
  if (!po) return 0;
  return PAGE_OVERRIDE_FIELDS.reduce((n, f) => n + Object.keys((po as any)[f] || {}).length, 0);
}

/** Text override helper that already knows which page it is on. */
export function textFor(cfg: any, pageKey: string, key: string): string {
  const v = effectiveTheme(cfg || {}, pageKey)?.texts?.[key];
  return typeof v === 'string' ? v : '';
}

export const blankTheme = () => ({
  version: 3,
  preset: 'custom',
  background: '', surface: '', text: '', muted: '', border: '', accent: '', accent2: '',
  radius: null as number | null,
  font: '', headingFont: '', fontUrl: '', khmerFont: '',
  backgroundImage: '', bannerImage: '',
  layout: { columns: 0, maxWidth: 0, navStyle: 'floating' as 'floating' | 'flat' | 'hidden' },
  texts: {} as Record<string, string>,
  components: {} as Record<string, StyleProps>,
  customParts: {} as Record<string, CustomPart>,
  pageStyles: {} as Record<string, { background?: string; backgroundImage?: string }>,
  /** Edits that belong to ONE page only (Home, Cart, Wallet…). Same shape as the global fields, merged on top of them on that page. */
  pageOverrides: {} as Record<string, PageOverride>,
  elements: [] as any[],
  mascotImages: {} as Record<string, string>,
  mascotPos: {} as Record<string, MascotPos>,
  cloudSeconds: null as number | null,
  /** a mascot on every product card – managed on Admin → Product Mascots */
  productMascots: blankProductMascots(),
  customCss: '',
  allowedCategories: [] as string[],
  hideUncategorized: false,
  bannerIds: [] as string[],
  delivery: { locationMode: 'manual' as 'manual' | 'map' },
  dark: { mode: 'off' as 'off' | 'auto' | 'on', background: '', surface: '', text: '', muted: '', border: '' },
  bg: { type: 'none' as 'none' | 'gradient', from: '#ffd1e8', to: '#c7b8ff', angle: 160, animated: false, glass: false },
  productImage: { mode: 'original' as 'original' | 'remove' | 'color' | 'random' | 'gradient', color: '#ffe0ec', palette: 'pastel' as string, customColors: [] as string[], tolerance: 35, fillHoles: false, seed: 1, fit: 'contain' as 'contain' | 'cover', padding: 10 },
});

function normalizePageOverrides(raw: any): Record<string, PageOverride> {
  const out: Record<string, PageOverride> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const key of Object.keys(raw)) {
    const r = raw[key];
    if (!r || typeof r !== 'object') continue;
    const o: PageOverride = {};
    if (r.components && typeof r.components === 'object') o.components = { ...r.components };
    if (r.mascotPos && typeof r.mascotPos === 'object') {
      const mp: Record<string, MascotPos> = {};
      for (const g of Object.keys(r.mascotPos)) { const v = r.mascotPos[g]; if (v && typeof v === 'object') mp[g] = { ...v }; }
      o.mascotPos = mp;
    }
    if (r.mascotImages && typeof r.mascotImages === 'object') o.mascotImages = normalizeMascotImages(r.mascotImages);
    if (r.texts && typeof r.texts === 'object') o.texts = { ...r.texts };
    if (r.customParts && typeof r.customParts === 'object') {
      o.customParts = Object.fromEntries(Object.entries(r.customParts as Record<string, any>)
        .map(([k, v]) => [k, { selector: cleanSelector(v?.selector), label: String(v?.label || 'Tapped part').slice(0, 60) }])
        .filter(([, v]) => (v as CustomPart).selector)) as Record<string, CustomPart>;
    }
    if (Object.keys(o).length) out[key] = o;
  }
  return out;
}

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
    customParts: Object.fromEntries(Object.entries((c.customParts && typeof c.customParts === 'object' ? c.customParts : {}) as Record<string, any>)
      .map(([k, v]) => [k, { selector: cleanSelector(v?.selector), label: String(v?.label || 'Tapped part').slice(0, 60) }]).filter(([, v]) => (v as CustomPart).selector)) as Record<string, CustomPart>,
    pageStyles: { ...(c.pageStyles || {}) },
    pageOverrides: normalizePageOverrides(c.pageOverrides),
    elements: (Array.isArray(c.elements) ? c.elements : []).map((e: any, i: number) => normalizeElement(e, i)) as ThemeEl[],
    mascotImages: normalizeMascotImages(c.mascotImages),
    mascotPos: normalizeMascotPos(c.mascotPos),
    cloudSeconds: typeof c.cloudSeconds === 'number' && c.cloudSeconds > 0 ? c.cloudSeconds : null,
    productMascots: normalizeProductMascots(c.productMascots),
    dark: { ...b.dark, ...(c.dark || {}) },
    bg: { ...b.bg, ...(c.bg || {}) },
    productImage: { ...b.productImage, ...(c.productImage || {}) },
    hideUncategorized: !!c.hideUncategorized,
    allowedCategories: Array.isArray(c.allowedCategories) ? c.allowedCategories : [],
    bannerIds: Array.isArray(c.bannerIds) ? c.bannerIds : [],
    delivery: { locationMode: c.delivery?.locationMode === 'map' ? 'map' : 'manual' },
    customCss: typeof c.customCss === 'string' ? c.customCss : '',
    khmerFont: typeof c.khmerFont === 'string' ? c.khmerFont : '',
  };
}

export const THEME_PRESETS: { id: string; label: string; swatch: string[]; cfg: Partial<ReturnType<typeof blankTheme>> }[] = [
  { id: 'default', label: 'Default look', swatch: ['#faf8ff', '#7c3aed', '#9b5cff'], cfg: {} },
  { id: 'midnight', label: 'Midnight', swatch: ['#120b22', '#a78bfa', '#f0abfc'], cfg: { background: '#120b22', surface: '#1e1433', text: '#f6f0ff', muted: '#b7a8d6', border: '#3a2a5c', accent: '#a78bfa', accent2: '#f0abfc', radius: 22 } },
  { id: 'mint', label: 'Mint', swatch: ['#f2fbf7', '#10b981', '#34d399'], cfg: { background: '#f2fbf7', surface: '#ffffff', text: '#1f3d36', muted: '#6b8a82', border: '#d3ece3', accent: '#10b981', accent2: '#34d399', radius: 20 } },
  { id: 'sunset', label: 'Sunset', swatch: ['#fff6ef', '#f97316', '#ec4899'], cfg: { background: '#fff6ef', surface: '#fffdfb', text: '#4a2c2a', muted: '#946c63', border: '#f5dccb', accent: '#f97316', accent2: '#ec4899', radius: 28 } },
  {
    id: 'chiikawa', label: 'Chiikawa storybook', swatch: ['#cfe6fa', '#ff9fbe', '#ffe9a8'],
    // The full look (sky, grass, mascots, sticker cards, handwriting) lives in chiikawa.css and turns on through `preset`.
    // These tokens keep the engine, the dark-mode maths and the admin previews in agreement with that stylesheet.
    cfg: {
      preset: 'chiikawa', background: '#fffaf0', surface: '#fffdf7', text: '#3d3656', muted: '#7a7298', border: '#cfe0f2', accent: '#ff9fbe', accent2: '#ffb8cf',
      font: "'Gaegu', 'Patrick Hand', 'Nunito', 'Comic Sans MS', system-ui, sans-serif",
      headingFont: "'Gaegu', 'Patrick Hand', 'Comic Sans MS', system-ui, sans-serif",
      fontUrl: 'https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&family=Patrick+Hand&display=swap',
      bannerImage: '/chiikawa/banner-delivery.png',
    },
  },
  {
    id: 'spidey', label: 'Spidey web-slinger', swatch: ['#060b1d', '#d6182b', '#ffc83d'],
    // Full look lives in spidey.css and turns on through `preset`. Tokens keep the engine and admin previews in agreement with it.
    cfg: {
      preset: 'spidey', background: '#060b1d', surface: '#101a3a', text: '#eef2ff', muted: '#9aa8d6', border: '#0c2d78', accent: '#d6182b', accent2: '#ffc83d', radius: 8,
      font: "'Outfit', system-ui, sans-serif",
      headingFont: "'Bangers', Impact, sans-serif",
      fontUrl: 'https://fonts.googleapis.com/css2?family=Bangers&family=Outfit:wght@400;600;700&display=swap',
    },
  },
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
  if (p.moveX || p.moveY) d.push(`translate:${Number(p.moveX || 0)}px ${Number(p.moveY || 0)}px!important`);
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
  const p = path || '/';
  return p.includes('/cart') ? 'cart' : p.includes('/wishlist') ? 'wishlist' : p.includes('/orders') ? 'orders'
    : p.includes('/wallet') ? 'wallet' : p.includes('/profile') ? 'profile' : p.includes('/checkout') ? 'checkout'
    : p.includes('/notifications') ? 'notifications' : p.includes('/rewards') ? 'rewards' : p.includes('/debt') ? 'debt'
    : p.includes('/snacks') ? 'snacks' : p.includes('/product') ? 'products' : p.includes('/support') ? 'support' : p === '/' || p === '' ? 'home' : 'other';
}

const PAGE_SELECTORS = '.shop, .detail, .cartPage, .checkoutPage, .ordersPage, .walletPage, .profilePage, .wishlistPage';

/* ------------------------------ dark mode ------------------------------ */

const HEX = /^#[0-9a-f]{6}$/i;
function mix(a: string, b: string, t: number): string {
  if (!HEX.test(a) || !HEX.test(b)) return b;
  const v = (h: string, k: number) => parseInt(h.slice(1 + k * 2, 3 + k * 2), 16);
  return '#' + [0, 1, 2].map(k => Math.round(v(a, k) * t + v(b, k) * (1 - t)).toString(16).padStart(2, '0')).join('');
}
/** Light colours chosen for the light theme are deepened automatically when the theme is shown in dark mode. */
const deepen = (c: string, dark: boolean) => (dark ? mix(c, '#0d0a14', 0.22) : c);
export function darkTokens(c: any) {
  const acc = c.accent && HEX.test(c.accent) ? c.accent : DEFAULT_TOKENS.accent, d = c.dark || {}, base = '#0d0a14';
  return {
    background: d.background || mix(acc, base, 0.09), surface: d.surface || mix(acc, base, 0.17),
    text: d.text || '#f5f0ff', muted: d.muted || '#b9b0cc', border: d.border || mix(acc, base, 0.3),
  };
}
/** Customer choice (button / saved) beats the theme setting; "auto" follows the phone. */
export function isDarkActive(c: any): boolean {
  const pref = getDarkPref();
  if (pref) return pref === '1';
  const m = c?.dark?.mode;
  if (m === 'on') return true;
  if (m === 'auto') return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return false;
}

const SURFACES = '.product, .panel, .detailCard, .cartrow, .ordercard, .transaction, .profilePanel, .profileHero, .search, .bottom';
const DARK_SURFACES = '.bottom,.cartItem,.categoryRail button:not(.on),.chatBubble.theirs,.chatComposer,.chatPanel,.checkoutbar,.chips button:not(.on),.couponCard,.customerMetrics,.detailCard,.gallery,.galleryArrow,.galleryViewport,.glass,.googleBtn,.icon,.miniCheckout,.notificationCard,.ordercard,.panel,.payModalCard,.profilePanel,.profileQuickGrid a,.profileStats a,.pwaInstall,.qtyControl,.rewardStandalone,.rewardTabs button:not(.on),.search,.secondary,.supportThread,.transaction,.walletDirectPay,.product,.heart,.cartrow,.profileHero,input,select,textarea';

export function buildThemeCss(input: any, path = '/', opts: { dark?: boolean; liveBg?: string } = {}): string {
  const c = effectiveTheme(normalizeTheme(input), pageKeyFor(path));   // shared edits + this page's own edits
  const dark = !!opts.dark;
  const t = dark ? { ...c, ...darkTokens(c) } : c;   // effective colours
  let css = '';
  const vars: string[] = [];
  if (t.accent) vars.push(`--purple:${safe(t.accent)}`, `--purple2:${safe(t.accent2 || t.accent)}`);
  else if (t.accent2) vars.push(`--purple2:${safe(t.accent2)}`);
  if (t.text) vars.push(`--ink:${safe(t.text)}`);
  if (t.muted) vars.push(`--muted:${safe(t.muted)}`);
  if (t.border) vars.push(`--line:${safe(t.border)}`);
  if (t.surface) vars.push(`--card:${safe(t.surface)}`);
  if (t.surface || t.accent) vars.push(`--soft:color-mix(in srgb,${safe(t.accent || DEFAULT_TOKENS.accent)} 14%,${safe(t.surface || DEFAULT_TOKENS.surface)})`);
  if (dark) vars.push('color-scheme:dark');
  if (c.preset === 'chiikawa') vars.push(...mascotVars(c.mascotImages, c.mascotPos, c.cloudSeconds));
  if (vars.length) css += `${PREFIX}{${vars.join(';')};}`;

  if (t.background) css += `${PREFIX}, ${PREFIX} body{background-color:${safe(t.background)}!important;}`;
  if (t.text) css += `${PREFIX} body{color:${safe(t.text)};}`;
  if (c.backgroundImage) css += `${PREFIX} body{background-image:${cssUrl(c.backgroundImage)}!important;background-size:cover;background-position:center;background-attachment:fixed;}`;
  if (t.surface) css += scoped(SURFACES) + `{background-color:${safe(t.surface)}!important;}`;
  if (dark) css += scoped(DARK_SURFACES) + `{background-color:${safe(t.surface)}!important;color:${safe(t.text)};border-color:${safe(t.border)};}`
    + scoped('.secondary, .icon, .categoryRail button:not(.on)') + `{color:${safe(t.text)}!important;}`
    + scoped('.heart') + `{background-color:${safe(t.surface)}cc!important;}`
    + scoped('input::placeholder, textarea::placeholder') + `{color:${safe(t.muted)};}`
    + scoped('.pcopy span, .price') + `{color:${safe(t.accent || DEFAULT_TOKENS.accent2)};}`;
  if (t.text) css += scoped(`${SURFACES}, .shop h1, .shop h2, .shop h3, .detail h1, .profilePage h1`) + `{color:${safe(t.text)};}`;
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

  // Background of everything: gradient, animated gradient, glass cards, and the customer's "random colour" button.
  const gradient = c.bg.type === 'gradient' ? `linear-gradient(${Number(c.bg.angle)}deg,${safe(deepen(c.bg.from, dark))},${safe(deepen(c.bg.to, dark))})` : '';
  const live = opts.liveBg ? safe(deepen(opts.liveBg, dark)) : '';
  if (gradient && !live) {
    css += `${PREFIX} body{background-image:${gradient}!important;background-attachment:fixed;${c.bg.animated ? 'background-size:300% 300%!important;animation:ynGradShift 16s ease infinite;' : 'background-size:cover;'}}`;
    css += scoped(PAGE_SELECTORS) + '{background:transparent!important;}';
  }
  if (live) {
    css += `${PREFIX}, ${PREFIX} body{background-color:${live}!important;background-image:none!important;animation:none!important;}`;
    css += scoped(PAGE_SELECTORS) + '{background:transparent!important;}';
  }
  if (c.bg.glass) css += scoped(DARK_SURFACES.split(',').filter(x => !/input|select|textarea|\.icon|\.heart|\.secondary/.test(x)).join(',')) + `{background-color:color-mix(in srgb,${safe(t.surface || DEFAULT_TOKENS.surface)} 58%,transparent)!important;backdrop-filter:blur(16px) saturate(1.2);-webkit-backdrop-filter:blur(16px) saturate(1.2);}`;

  const ps = c.pageStyles[pageKeyFor(path)] || {};
  if (ps.background) css += scoped(PAGE_SELECTORS) + `{background-color:${safe(ps.background)}!important;}`;
  if (ps.backgroundImage) css += scoped(PAGE_SELECTORS) + `{background-image:${cssUrl(ps.backgroundImage)}!important;background-size:cover!important;background-position:center!important;}`;

  for (const def of allComponents(c)) {
    const p = c.components[def.key];
    if (!p) continue;
    const d = declarations(p);
    if (d) css += `${scoped(def.selector)}{${d}}`;
    // an icon picture replaces the part's own little icon (unless "keep" is on); the picture itself is added by <PartIcons/>
    if (p.icon && !p.hidden && !p.iconKeep) css += scoped(def.selector.split(',').map(x => `${x.trim()} > svg`).join(',')) + '{display:none!important;}';
  }
  if (c.customCss.trim()) css += scopeCustomCss(c.customCss);
  return css;
}

/* ------------------------------ Runtime state ------------------------------ */

let current: any | null = null;
const EVENT = 'yn-secret-theme-applied';

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

/** Re-renders when a theme button changes something live (dark mode, random colour, shuffle). */
export function useLiveTick(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const h = () => setN(x => x + 1);
    window.addEventListener(LIVE_EVT, h);
    return () => window.removeEventListener(LIVE_EVT, h);
  }, []);
  return n;
}

/** Text override helper: t('brandTitle','YN Studio') */
export function useThemeText() {
  const cfg = useThemeConfig();
  const loc = useLocation();
  const pk = pageKeyFor(loc.pathname);
  return (key: string, fallback: string) => {
    const v = cfg ? textFor(cfg, pk, key) : '';
    return v.trim() ? v : fallback;
  };
}
export const Lines = ({ text }: { text: string }) => <>{String(text).split('\n').map((l, i, a) => <React.Fragment key={i}>{l}{i < a.length - 1 && <br />}</React.Fragment>)}</>;

const TRANSPARENT_GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

/**
 * Product picture that follows the active theme: optionally cuts out the background and
 * paints a colour / random colour / gradient behind it. Without a theme it is a plain <img>.
 */
export function ThemedImg({ src, alt = '', productId = '', className, style, loading }: { src: string; alt?: string; productId?: string; className?: string; style?: React.CSSProperties; loading?: 'lazy' | 'eager' }) {
  const cfg = useThemeConfig();
  useLiveTick();
  const pi = cfg?.productImage;
  const mode: string = pi?.mode || 'original';
  const [url, setUrl] = useState<string>(mode === 'original' ? src : '');
  useEffect(() => {
    if (mode === 'original') { setUrl(src); return; }
    let alive = true;
    setUrl('');
    processedImageUrl(src, { tolerance: pi?.tolerance, fillHoles: pi?.fillHoles }).then(u => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [src, mode, pi?.tolerance, pi?.fillHoles]);
  if (mode === 'original') return <img src={src} alt={alt} className={className} style={style} loading={loading} />;
  const seed = Number(pi.seed || 0) + getSeedOffset();
  const id = productId || src;
  const bg = mode === 'color' ? pi.color : mode === 'random' ? colorForProduct(id, seed, pi.palette, pi.customColors) : mode === 'gradient' ? gradientForProduct(id, seed, pi.palette, pi.customColors) : undefined;
  return <img src={url || TRANSPARENT_GIF} alt={alt} className={className} loading={loading}
    style={{ ...style, background: bg || style?.background, objectFit: pi.fit === 'contain' ? 'contain' : undefined, padding: pi.fit === 'contain' ? (pi.padding || 0) : undefined, boxSizing: 'border-box', transition: 'background .35s' }} />;
}

function styleEl(id: string): HTMLStyleElement {
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
  return el;
}

function clearTheme() {
  setKhmerFont('');
  const root = document.documentElement;
  root.removeAttribute('data-secret-theme'); root.removeAttribute('data-secret-preset'); root.removeAttribute('data-yn-theme'); root.removeAttribute('data-yn-dark'); root.removeAttribute('data-yn-pm');
  ['--secret-bg', '--secret-surface', '--secret-text', '--secret-accent', '--secret-radius', '--secret-font', '--secret-wallpaper', '--secret-banner'].forEach(k => root.style.removeProperty(k));
  document.getElementById('yn-theme-style')?.remove();
  document.getElementById('yn-theme-font')?.remove();
  current = null;
  window.dispatchEvent(new Event(EVENT));
}

function applyTheme(raw: any, path: string) {
  const c = normalizeTheme(raw);
  const dark = isDarkActive(c);
  const t = dark ? { ...c, ...darkTokens(c) } : c;
  const rawLive = getLiveBg();
  const live = rawLive ? deepen(rawLive, dark) : '';
  const root = document.documentElement;
  root.setAttribute('data-secret-theme', 'on');
  root.setAttribute('data-secret-preset', c.preset || 'custom');
  root.setAttribute('data-yn-theme', '1');
  root.setAttribute('data-yn-dark', dark ? '1' : '0');
  root.setAttribute('data-yn-pm', c.productMascots.enabled ? 'on' : 'off');
  // Variables the built-in Chiikawa preset (and older themes) read.
  root.style.setProperty('--secret-bg', live || t.background || DEFAULT_TOKENS.background);
  root.style.setProperty('--secret-surface', t.surface || DEFAULT_TOKENS.surface);
  root.style.setProperty('--secret-text', t.text || DEFAULT_TOKENS.text);
  root.style.setProperty('--secret-accent', c.accent || DEFAULT_TOKENS.accent);
  root.style.setProperty('--secret-radius', (c.radius ?? 20) + 'px');
  root.style.setProperty('--secret-font', c.font || 'Inter, system-ui, sans-serif');
  const gradient = c.bg.type === 'gradient' && !live ? `linear-gradient(${Number(c.bg.angle)}deg,${safe(deepen(c.bg.from, dark))},${safe(deepen(c.bg.to, dark))})` : '';
  root.style.setProperty('--secret-wallpaper', live ? 'none' : gradient || (c.backgroundImage ? cssUrl(c.backgroundImage) : 'none'));
  root.style.setProperty('--secret-banner', c.bannerImage ? cssUrl(c.bannerImage) : 'none');
  styleEl('yn-theme-style').textContent = buildThemeCss(c, path, { dark, liveBg: rawLive });
  const fontLink = document.getElementById('yn-theme-font') as HTMLLinkElement | null;
  if (c.fontUrl && /^https:\/\/fonts\.googleapis\.com\//.test(c.fontUrl)) {
    if (fontLink) { if (fontLink.href !== c.fontUrl) fontLink.href = c.fontUrl; }
    else { const l = document.createElement('link'); l.id = 'yn-theme-font'; l.rel = 'stylesheet'; l.href = c.fontUrl; document.head.appendChild(l); }
  } else fontLink?.remove();
  setKhmerFont(c.khmerFont);
  current = c;
  window.dispatchEvent(new Event(EVENT));
}

/** Finds which restylable part of the page was clicked (deepest match wins). */
function componentAt(target: Element | null, defs: ComponentDef[] = COMPONENTS): ComponentDef | null {
  if (!target) return null;
  let best: ComponentDef | null = null, bestDepth = -1;
  for (const def of defs) {
    let hit: Element | null = null;
    try { hit = target.closest(def.selector); } catch { hit = null; }
    if (!hit) continue;
    let depth = 0, n: Element | null = hit;
    while (n) { depth++; n = n.parentElement; }
    if (depth > bestDepth) { best = def; bestDepth = depth; }
  }
  return best;
}

/** True for the page itself / empty space (→ page background tools) rather than a thing on the page. */
export function isPageLevel(t: Element): boolean {
  if (t === document.documentElement || t === document.body || t.id === 'root') return true;
  try { return t.matches(PAGE_SELECTORS); } catch { return false; }
}

/** Builds a CSS selector (class based, so it also matches its look-alikes) for something the admin tapped. */
export function autoSelectorFor(rawTarget: Element): { selector: string; label: string } | null {
  const target: Element = rawTarget.closest('svg') || rawTarget;        // tapping a stroke inside an icon means the icon
  const SKIP = /^(on|active|selected|open|current|hover|focus|disabled|liked|show|yn.*|secretTheme.*)$/;
  const ok = (c: string) => /^[A-Za-z_][\w-]*$/.test(c) && !SKIP.test(c);
  const okId = (el: Element) => !!el.id && /^[A-Za-z_][\w-]*$/.test(el.id) && !/^(radix|r\d)/.test(el.id);
  const seg = (el: Element) => el.tagName.toLowerCase() + (okId(el) ? '#' + el.id : Array.from(el.classList).filter(ok).slice(0, 2).map(c => '.' + c).join(''));
  const hasCls = (el: Element) => okId(el) || Array.from(el.classList).some(ok);
  const parts: string[] = [seg(target)];
  let n: Element | null = target;
  for (let i = 0; i < 3 && n && !hasCls(n); i++) { n = n.parentElement; if (!n || isPageLevel(n)) break; parts.unshift(seg(n)); }
  let sel = parts.join(' > ');
  const matches = (x: string) => { try { return Array.from(document.querySelectorAll(x)).includes(target); } catch { return false; } };
  if (!matches(sel)) sel = parts.join(' ');
  if (!matches(sel)) {
    // last resort: this exact element, by its position
    const path: string[] = []; let e: Element | null = target;
    while (e && e !== document.body && path.length < 6) {
      const par: Element | null = e.parentElement; const same: Element[] = par ? Array.from(par.children).filter(x => x.tagName === e!.tagName) : [];
      path.unshift(e.tagName.toLowerCase() + (same.length > 1 ? `:nth-of-type(${same.indexOf(e) + 1})` : '')); e = par;
    }
    sel = path.join(' > ');
    if (!matches(sel)) return null;
  }
  const text = (target.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 22);
  const tag = target.tagName.toLowerCase();
  const label = text ? `“${text}”` : tag === 'img' ? 'Picture' : tag === 'svg' || tag === 'path' ? 'Icon' : '<' + seg(target) + '>';
  return { selector: cleanSelector(sel), label: 'Tapped: ' + label };
}
const hash36 = (str: string) => { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h).toString(36); };

export function SecretThemeRuntime() {
  const location = useLocation();
  const preview = isPreviewFrame();
  const path = location.pathname;
  const [draft, setDraft] = useState<any | null>(null);
  const [customer, setCustomer] = useState<any | null>(null);
  const [mode, setMode] = useState<OverlayMode>('edit');
  const [selEl, setSelEl] = useState('');
  const [selMascot, setSelMascot] = useState('');
  const [paused, setPaused] = useState(false);
  const tick = useLiveTick();
  const [osTick, setOsTick] = useState(0);
  const modeRef = useRef<OverlayMode>('edit');
  const draftRef = useRef<any | null>(null);
  draftRef.current = draft;

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

  // "Follow my phone" dark mode.
  useEffect(() => {
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (!mq) return;
    const h = () => setOsTick(x => x + 1);
    mq.addEventListener?.('change', h);
    return () => mq.removeEventListener?.('change', h);
  }, []);

  // Preview mode: receive the unsaved draft from the admin editor.
  useEffect(() => {
    if (!preview) return;
    let selectedKey = '', selKind = '', selElId = '', lastDark = '__', lastAnchor = '', clicked: Element | null = null;
    const autoDefs: Record<string, ComponentDef> = {};          // tapped parts the editor has not echoed back yet
    /** The draft as this page shows it (shared edits + the page's own edits). */
    const eff = (): any => { const d = draftRef.current; return d ? effectiveTheme(normalizeTheme(d), pageKeyFor(window.location.pathname)) : null; };
    const defs = (): ComponentDef[] => { const base = allComponents(eff()); return [...base, ...Object.values(autoDefs).filter(a => !base.some(b => b.key === a.key))]; };
    let drag: { el: HTMLElement; def: ComponentDef; sx: number; sy: number; bx: number; by: number; moved: boolean; mx: number; my: number } | null = null;
    let justDragged = false;
    const hl = styleEl('yn-theme-preview-style');
    const editing = () => modeRef.current !== 'try';
    const paint = () => {
      const m = modeRef.current;
      const def = selKind === 'part' ? defs().find(x => x.key === selectedKey) : undefined;
      // crosshair everywhere except on things that can be dragged (mascots, your own elements)
      hl.textContent = (m !== 'try' ? 'html *{user-select:none!important;-webkit-user-select:none!important}html *:not(.ynMascotBox):not(.ynMascotBox *):not(.ynEl):not(.ynEl *){cursor:crosshair!important}' : '') +
        (def && m !== 'try' ? `${def.selector}{outline:3px solid #ff3d8b!important;outline-offset:2px!important;cursor:move!important;touch-action:none!important}` : '');
    };
    const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    /** Where the selected thing is inside this frame (so the editor can float its toolbar above it). */
    const rectOf = (): { left: number; top: number; width: number; height: number } | null | undefined => {
      let el: Element | null = null;
      if (selKind === 'part') {
        const def = defs().find(x => x.key === selectedKey);
        if (!def) return undefined;
        try {
          if (clicked && clicked.isConnected && clicked.matches(def.selector) && visible(clicked)) el = clicked;
          else el = Array.from(document.querySelectorAll(def.selector)).find(visible) || null;
        } catch { el = null; }
      } else if (selKind === 'element') el = document.querySelector(`[data-el="${selElId.replace(/"/g, '')}"]`);
      else if (selKind === 'mascot') el = document.querySelector('.ynMascotBox.on');
      else if (selKind === 'page') return null;
      else return undefined;
      if (!el) return undefined;
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
    };
    const report = () => {
      const r = rectOf();
      const sig = JSON.stringify([r, window.innerWidth, window.innerHeight]);
      if (sig === lastAnchor) return;
      lastAnchor = sig;
      window.parent.postMessage({ type: 'yn-theme-anchor', rect: r === undefined ? undefined : r, hasRect: r !== null }, window.location.origin);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'yn-mascot-measure') {
        const g = String(e.data.group || '');
        window.parent.postMessage({ type: 'yn-mascot-measured', group: g, info: measureMascotInfo(g), vw: designViewport().width, vh: designViewport().height, k: screenScale(), path: window.location.pathname }, window.location.origin);
        return;
      }
      if (e.data?.type !== 'yn-theme-draft') return;
      const m: OverlayMode = e.data.mode === 'try' || e.data.mode === 'elements' || e.data.mode === 'mascots' || e.data.mode === 'parts' ? e.data.mode : 'edit';
      modeRef.current = m; setMode(m);
      selectedKey = e.data.selectedKey || '';
      selElId = e.data.selectedElementId || '';
      const nextKind = typeof e.data.selKind === 'string' ? e.data.selKind : (selectedKey ? 'part' : selElId ? 'element' : e.data.selectedMascot ? 'mascot' : '');
      if (nextKind !== 'part') clicked = null;
      selKind = nextKind;
      if (typeof e.data.previewDark === 'string' && e.data.previewDark !== lastDark) { lastDark = e.data.previewDark; setDarkPref(lastDark as '' | '1' | '0'); }
      setSelEl(selElId); setPaused(!!e.data.pauseMotion);
      setSelMascot(e.data.selectedMascot || '');
      setDraft(e.data.config); paint();
      window.setTimeout(report, 60);
    };
    const inOverlay = (t: EventTarget | null) => !!(t as Element | null)?.closest?.('.secretThemeOverlay, .ynOverlayPage, .ynMascotLayer');
    const onClick = (e: MouseEvent) => {
      if (!editing()) return;
      if (inOverlay(e.target)) { e.preventDefault(); return; }
      e.preventDefault(); e.stopPropagation();
      if (justDragged) { justDragged = false; return; }          // the click that ends a drag is not a new selection
      const target = e.target as Element;
      let def = componentAt(target, defs());
      // not one of the known parts → make it a "tapped part" so ANYTHING can be edited (blank space stays the page background)
      if (!def && !isPageLevel(target)) {
        const auto = autoSelectorFor(target);
        if (auto) {
          const key = 'auto-' + hash36(auto.selector);
          def = { key, label: auto.label, group: 'Tapped parts', selector: auto.selector, props: AUTO_PROPS };
          autoDefs[key] = def;
          window.parent.postMessage({ type: 'yn-theme-auto-part', key, selector: auto.selector, label: auto.label }, window.location.origin);
        }
      }
      // a part → its own tools; blank space → the page background tools
      selectedKey = def ? def.key : ''; selKind = def ? 'part' : 'page'; clicked = def ? target.closest(def.selector) : null;
      paint(); report();
      window.parent.postMessage({ type: 'yn-theme-select', key: def ? def.key : '__page' }, window.location.origin);
    };
    // Drag any part to move it (up / down / sideways). The picture follows the finger live; the position is saved on release.
    const onDown = (e: PointerEvent) => {
      if (!editing() || (e.pointerType === 'mouse' && e.button !== 0) || inOverlay(e.target)) return;
      const target = e.target as Element;
      let def = componentAt(target, defs());
      if (!def && !isPageLevel(target)) { const a = autoSelectorFor(target); if (a) { const key = 'auto-' + hash36(a.selector); def = autoDefs[key] || { key, label: a.label, group: 'Tapped parts', selector: a.selector, props: AUTO_PROPS }; } }
      if (!def || !def.props.includes('moveX')) return;
      if ((eff()?.components || {})[def.key]?.locked) return;      // locked parts cannot be dragged
      // on a touch screen only the part that is already selected can be dragged (otherwise the page could not be scrolled)
      if (e.pointerType !== 'mouse' && !(selKind === 'part' && selectedKey === def.key)) return;
      const el = target.closest(def.selector) as HTMLElement | null;
      if (!el) return;
      const cur = (eff()?.components || {})[def.key] || {};
      drag = { el, def, sx: e.clientX, sy: e.clientY, bx: Number(cur.moveX) || 0, by: Number(cur.moveY) || 0, moved: false, mx: 0, my: 0 };
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      const kz = zoomK(), dx = (e.clientX - drag.sx) / kz, dy = (e.clientY - drag.sy) / kz; // drawn px -> CSS px
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      drag.moved = true; e.preventDefault();
      drag.mx = Math.max(-600, Math.min(600, Math.round(drag.bx + dx))); drag.my = Math.max(-600, Math.min(600, Math.round(drag.by + dy)));
      drag.el.style.setProperty('translate', `${drag.mx}px ${drag.my}px`, 'important');
    };
    const onUp = () => {
      const d = drag; drag = null;
      if (!d || !d.moved) return;
      justDragged = true; window.setTimeout(() => { justDragged = false; }, 400);
      if (selectedKey !== d.def.key) {
        selectedKey = d.def.key; selKind = 'part'; clicked = d.el;
        if (d.def.key.startsWith('auto-')) { autoDefs[d.def.key] = d.def; window.parent.postMessage({ type: 'yn-theme-auto-part', key: d.def.key, selector: d.def.selector, label: d.def.label }, window.location.origin); }
        window.parent.postMessage({ type: 'yn-theme-select', key: d.def.key }, window.location.origin);
      }
      window.parent.postMessage({ type: 'yn-theme-part-move', key: d.def.key, x: d.mx, y: d.my, path: window.location.pathname }, window.location.origin);
      paint(); report();
      window.setTimeout(() => d.el.style.removeProperty('translate'), 300);   // the saved value (same position) takes over
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') window.parent.postMessage({ type: 'yn-theme-deselect' }, window.location.origin); };
    const block = (e: Event) => { if (editing()) { e.preventDefault(); e.stopPropagation(); } };
    const timer = window.setInterval(report, 120);
    window.addEventListener('scroll', report, { passive: true, capture: true });
    window.addEventListener('resize', report);
    window.addEventListener('message', onMessage);
    document.addEventListener('click', onClick, true);
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove, { passive: false, capture: true });
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    document.addEventListener('submit', block, true);
    document.addEventListener('dragstart', block, true);
    document.addEventListener('keydown', onKey);
    window.parent.postMessage({ type: 'yn-theme-ready' }, window.location.origin);
    return () => {
      window.clearInterval(timer); window.removeEventListener('scroll', report, true); window.removeEventListener('resize', report);
      window.removeEventListener('message', onMessage); document.removeEventListener('click', onClick, true); document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove, true); window.removeEventListener('pointerup', onUp, true); window.removeEventListener('pointercancel', onUp, true); document.removeEventListener('submit', block, true); document.removeEventListener('dragstart', block, true); document.removeEventListener('keydown', onKey); hl.remove();
    };
  }, [preview]);

  useEffect(() => { if (preview) window.parent.postMessage({ type: 'yn-theme-path', path }, window.location.origin); }, [path, preview]);

  const active = preview ? draft : customer?.config;
  useEffect(() => {
    if (active) applyTheme(active, path); else clearTheme();
  }, [active, path, tick, osTick]);

  const norm = active ? effectiveTheme(normalizeTheme(active), pageKeyFor(path)) : null;   // this page's own edits on top of the shared ones
  const els: ThemeEl[] = norm ? norm.elements : [];
  const showHandles = preview && (mode === 'edit' || mode === 'mascots') && !!norm && norm.preset === 'chiikawa';
  const iconParts: PartIconSpec[] = norm
    ? allComponents(norm).filter(d => norm.components[d.key]?.icon && !norm.components[d.key]?.hidden).map(d => {
        const p = norm.components[d.key] as StyleProps;
        return { key: d.key, selector: scoped(d.selector), icon: p.icon as string, size: p.iconSize || 22, side: p.iconSide || 'left' };
      })
    : [];
  return (
    <>
      <PartIcons parts={iconParts} />
      {els.length ? (
        <ThemeOverlay elements={els} pageKey={pageKeyFor(path)} mode={preview ? mode : 'live'} selectedId={selEl} paused={preview && paused}
          onSelect={id => { setSelEl(id); if (preview) window.parent.postMessage({ type: 'yn-theme-element-select', id }, window.location.origin); }}
          onPatch={(id, patch) => { if (preview) window.parent.postMessage({ type: 'yn-theme-element-patch', id, patch }, window.location.origin); }} />
      ) : null}
      {showHandles ? (
        <MascotHandles pos={norm!.mascotPos} selected={selMascot} path={path}
          onSelect={g => { setSelMascot(g); window.parent.postMessage({ type: 'yn-theme-mascot-select', group: g }, window.location.origin); }}
          onPatch={(g, patch) => window.parent.postMessage({ type: 'yn-theme-mascot-patch', group: g, patch, path }, window.location.origin)} />
      ) : null}
    </>
  );
}
