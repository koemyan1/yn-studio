// YN Studio specific commands: navigation, theme, language, shop search, sign out...
import type { Assistant } from './assistant';
import { clickLabel, findClickable } from './builtins';
import { setDarkPref, getDarkPref, queueHomeAction } from '../themeLive';
import { setLang } from '../lang';
import { supabase } from '../supabase';

// Spoken name -> route
const SHOP_PAGES: Record<string, string> = {
  home: '/', shop: '/', store: '/', 'home page': '/', 'main page': '/',
  cart: '/cart', basket: '/cart', 'shopping cart': '/cart', 'my cart': '/cart',
  checkout: '/checkout', 'check out': '/checkout',
  orders: '/orders', 'my orders': '/orders', order: '/orders',
  wallet: '/wallet', 'my wallet': '/wallet',
  debt: '/debt', debts: '/debt', 'my debt': '/debt',
  profile: '/profile', 'my profile': '/profile', account: '/profile', settings: '/profile',
  wishlist: '/wishlist', 'wish list': '/wishlist', favorites: '/wishlist', favourites: '/wishlist', 'my wishlist': '/wishlist',
  notifications: '/notifications', alerts: '/notifications',
  support: '/support', chat: '/support', 'customer support': '/support', help: '/support',
  rewards: '/rewards', coupons: '/rewards', 'my rewards': '/rewards',
  login: '/login', 'sign in': '/login',
};

const ADMIN_PAGES: Record<string, string> = {
  admin: '/admin', dashboard: '/admin', 'admin dashboard': '/admin',
  products: '/admin/products', 'admin products': '/admin/products',
  'add product': '/admin/products/new', 'new product': '/admin/products/new', 'create product': '/admin/products/new',
  banners: '/admin/banners', 'admin banners': '/admin/banners',
  coupons: '/admin/coupons', 'admin coupons': '/admin/coupons',
  categories: '/admin/categories', 'admin categories': '/admin/categories',
  orders: '/admin/orders', 'admin orders': '/admin/orders',
  'package labels': '/admin/package-labels', labels: '/admin/package-labels',
  'order statuses': '/admin/order-statuses', statuses: '/admin/order-statuses',
  customers: '/admin/customers', 'admin customers': '/admin/customers',
  debt: '/admin/debt', debts: '/admin/debt', 'admin debt': '/admin/debt',
  wallet: '/admin/wallet', 'admin wallet': '/admin/wallet',
  transactions: '/admin/transactions',
  notifications: '/admin/notifications', 'admin notifications': '/admin/notifications',
  support: '/admin/support', 'admin support': '/admin/support', chat: '/admin/support',
  'secret code': '/admin/secret-code', 'secret theme': '/admin/secret-code', 'theme editor': '/admin/secret-code', 'theme studio': '/admin/secret-code',
  settings: '/admin/settings', 'admin settings': '/admin/settings', 'store settings': '/admin/settings',
};

const inAdmin = () => window.location.pathname.startsWith('/admin');
const tidy = (s: string) =>
  s.toLowerCase().replace(/^(the|my|a)\s+/, '').replace(/\s+(page|screen|section|tab)$/, '').trim();

function resolvePage(raw: string): string | undefined {
  const key = tidy(raw);
  const withoutAdmin = key.replace(/^admin\s+/, '');
  if (/^admin\b/.test(key) && key !== 'admin') return ADMIN_PAGES[key] || ADMIN_PAGES[withoutAdmin];
  return inAdmin()
    ? ADMIN_PAGES[key] || SHOP_PAGES[key]
    : SHOP_PAGES[key] || ADMIN_PAGES[key];
}

function setAdminDark(on: boolean) {
  try { localStorage.setItem('yn-admin-dark', on ? '1' : '0'); } catch { /* ignore */ }
  // AdminShell listens for this event, so it updates instantly.
  window.dispatchEvent(new StorageEvent('storage', { key: 'yn-admin-dark', newValue: on ? '1' : '0' }));
}

function applyDark(on: boolean) {
  if (inAdmin()) setAdminDark(on);
  else setDarkPref(on ? '1' : '0');
}

function currentlyDark(): boolean {
  if (inAdmin()) return localStorage.getItem('yn-admin-dark') === '1';
  const p = getDarkPref();
  if (p) return p === '1';
  return document.documentElement.classList.contains('dark') || !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u1780-\u17ff ]/g, '').trim();

export function registerYNCommands(a: Assistant) {
  const go = (path: string) => a.navigate(path);

  // ---- navigation ----
  a.register(['go to {page}', 'open {page}', 'take me to {page}', 'navigate to {page}', 'show {page}', 'show me {page}', 'show me my {page}'], ({ groups }) => {
    const path = resolvePage(groups.page);
    if (path) {
      go(path);
      return `Opening ${tidy(groups.page)}.`;
    }
    // not a page — maybe it's a button on screen
    const clicked = clickLabel(a, tidy(groups.page));
    if (clicked) return clicked;
    return `I don't know a page called ${groups.page}.`;
  });

  // ---- dark / light ----
  a.register(['dark mode on', 'turn on dark mode', 'enable dark mode', 'dark mode', 'go dark', 'switch to dark mode', 'turn dark mode on'], () => {
    applyDark(true);
    return 'Dark mode on.';
  });
  a.register(['dark mode off', 'turn off dark mode', 'disable dark mode', 'light mode', 'switch to light mode', 'turn on light mode', 'turn dark mode off'], () => {
    applyDark(false);
    return 'Light mode on.';
  });
  a.register(['toggle dark mode', 'switch theme', 'switch mode'], () => {
    const next = !currentlyDark();
    applyDark(next);
    return next ? 'Dark mode on.' : 'Light mode on.';
  });

  // ---- language ----
  a.register(['switch to khmer', 'change language to khmer', 'speak khmer', 'khmer', 'khmer language'], () => {
    setLang('km');
    return 'Switched to Khmer.';
  });
  a.register(['switch to english', 'change language to english', 'speak english', 'english', 'english language'], () => {
    setLang('en');
    return 'Switched to English.';
  });

  // ---- shop ----
  a.register(['search for {q}', 'search {q}', 'find {q}', 'look for {q}', 'i want to buy {q}', 'show me some {q}'], ({ groups }) => {
    queueHomeAction({ search: groups.q, category: '' });
    if (window.location.pathname !== '/') go('/');
    return `Searching for ${groups.q}.`;
  });
  a.register(['clear search', 'clear the search', 'show everything', 'show all products', 'all products', 'all categories'], () => {
    queueHomeAction({ search: '', category: '' });
    if (window.location.pathname !== '/') go('/');
    return 'Showing everything.';
  });
  a.register(['show category {name}', 'show {name} category', 'open category {name}', 'category {name}', 'filter by {name}', 'show me {name} products'], async ({ groups }) => {
    const { data } = await supabase.from('categories').select('id,name').eq('status', 'active');
    const q = norm(groups.name).replace(/ category$/, '');
    const hit = (data || []).find((c: any) => norm(c.name) === q) || (data || []).find((c: any) => norm(c.name).includes(q) || q.includes(norm(c.name)));
    if (!hit) return `I couldn't find a category called ${groups.name}.`;
    queueHomeAction({ category: hit.id, search: '' });
    if (window.location.pathname !== '/') go('/');
    return `Showing ${hit.name}.`;
  });
  a.register(['open product {name}', 'show product {name}', 'view product {name}', 'open the product {name}'], async ({ groups }) => {
    const { data } = await supabase
      .from('products').select('id,name').eq('status', 'published')
      .ilike('name', `%${groups.name.replace(/[%_]/g, '')}%`).limit(1);
    const p = data?.[0];
    if (!p) return `I couldn't find a product called ${groups.name}.`;
    go(`/product/${p.id}`);
    return `Opening ${p.name}.`;
  });

  // Common on-screen actions, with friendlier phrasing than "click ..."
  const tapIf = (patterns: string[], label: string, miss: string) =>
    a.register(patterns, () => clickLabel(a, label) ?? miss);
  tapIf(['add to cart', 'add this to cart', 'add this to my cart', 'add it to my cart', 'put it in my cart'], 'add to cart', "I can't see an add to cart button here. Open a product first.");
  tapIf(['place order', 'place my order', 'order now', 'buy now'], 'place order', "I can't see a place order button on this page.");

  // ---- account ----
  a.register(['sign out', 'log out', 'logout', 'sign me out'], () =>
    a.askConfirm('That will sign you out.', async () => {
      await supabase.auth.signOut();
      go('/login');
      return 'Signed out.';
    })
  );

  // ---- about me ----
  a.register(['where am i', 'what page is this', 'what page am i on'], () => {
    const p = window.location.pathname;
    const found = Object.entries({ ...ADMIN_PAGES, ...SHOP_PAGES }).find(([, v]) => v === p);
    return found ? `You're on ${found[0]}.` : `You're on ${p}.`;
  });
  a.register(['go to sleep', 'stop listening', 'mute yourself', 'goodbye', 'bye'], () => {
    window.setTimeout(() => a.stop(), 1800);
    return "Okay. Tap the mic when you want me back.";
  });
  a.register(['help', 'what can you do', 'what can i say'], () =>
    'Try: go to cart, search for shoes, show category toys, open product and a name, dark mode on, switch to Khmer, click any button, type something in any field, scroll down, or sign out.'
  );

  // ---- anything else: if it is exactly the name of something on screen, tap it ----
  a.opts.onUnknown = (text) => {
    const page = resolvePage(text);
    if (page) {
      go(page);
      return `Opening ${tidy(text)}.`;
    }
    if (findClickable(text, true)) return clickLabel(a, text, true) ?? undefined;
    return undefined;
  };
}
