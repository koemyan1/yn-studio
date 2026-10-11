// YN Studio ADMIN commands for Alfie: navigate the admin panel, ask about the shop, act on orders.
import type { Assistant } from './assistant';
import { clickLabel, findClickable, findField, setValue } from './builtins';
import { setLang } from '../lang';
import { supabase } from '../supabase';

const ADMIN_PAGES: Record<string, string> = {
  admin: '/admin', dashboard: '/admin', 'admin dashboard': '/admin', home: '/admin', 'home page': '/admin',
  products: '/admin/products', 'add product': '/admin/products/new', 'new product': '/admin/products/new', 'create product': '/admin/products/new',
  banners: '/admin/banners',
  coupons: '/admin/coupons',
  categories: '/admin/categories',
  orders: '/admin/orders', order: '/admin/orders',
  'package labels': '/admin/package-labels', labels: '/admin/package-labels',
  'order statuses': '/admin/order-statuses', statuses: '/admin/order-statuses',
  customers: '/admin/customers',
  debt: '/admin/debt', debts: '/admin/debt',
  wallet: '/admin/wallet',
  transactions: '/admin/transactions',
  notifications: '/admin/notifications', alerts: '/admin/notifications',
  support: '/admin/support', chat: '/admin/support', messages: '/admin/support',
  'secret code': '/admin/secret-code', 'secret theme': '/admin/secret-code', 'theme editor': '/admin/secret-code', 'theme studio': '/admin/secret-code', themes: '/admin/secret-code',
  settings: '/admin/settings', 'store settings': '/admin/settings', 'delivery settings': '/admin/settings',
};

const tidy = (s: string) =>
  s.toLowerCase().replace(/^(the|my|a)\s+/, '').replace(/^admin\s+/, '').replace(/\s+(page|screen|section|tab)$/, '').trim();
const resolvePage = (raw: string) => ADMIN_PAGES[tidy(raw)];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u1780-\u17ff ]/g, '').trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(fn: () => T | null | undefined, ms = 4500): Promise<T | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(150); }
  return null;
}

// "one two three four" / "1234" / "yn 1234 5678" -> "12345678"
const WORD_DIGITS: Record<string, string> = { zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9' };
const digitsOf = (s: string) => s.toLowerCase().split(/[\s-]+/).map((w) => WORD_DIGITS[w] ?? w).join('').replace(/\D/g, '');
const sayNum = (n: string) => String(n).replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1, ');
const sayMoney = (n: number) => `${n.toFixed(2)} dollars`;

const dayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const monthStart = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.toISOString(); };

async function countRows(table: string, f?: (q: any) => any): Promise<number> {
  let q: any = supabase.from(table).select('id', { count: 'exact', head: true });
  if (f) q = f(q);
  const { count } = await q;
  return count || 0;
}
async function paidTotal(since: string): Promise<{ sum: number; n: number }> {
  const { data } = await supabase.from('orders').select('total').eq('payment_status', 'paid').gte('created_at', since);
  const rows = data || [];
  return { sum: rows.reduce((a: number, x: any) => a + Number(x.total || 0), 0), n: rows.length };
}
const unpaidFilter = (q: any) => q.eq('payment_status', 'pending').not('status', 'in', '(cancelled,rejected)');

const ORDER_COLS = 'id,order_number,total,status,payment_status,delivery_name,created_at,user_id,tracking_enabled';
async function findOrder(d: string) {
  const { data } = await supabase.from('orders').select(ORDER_COLS).ilike('order_number', `%${d}%`).order('created_at', { ascending: false }).limit(1);
  return data?.[0];
}
async function customerName(o: any): Promise<string> {
  if (o?.delivery_name) return o.delivery_name;
  const { data } = await supabase.from('profiles').select('name').eq('user_id', o?.user_id).maybeSingle();
  return data?.name || 'a customer';
}
const refreshAdmin = () => window.dispatchEvent(new Event('yn-admin-refresh'));
function flash(el: HTMLElement) {
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const old = el.style.boxShadow;
  el.style.transition = 'box-shadow .3s';
  el.style.boxShadow = '0 0 0 4px #7c3aed';
  window.setTimeout(() => { el.style.boxShadow = old; }, 2600);
}
async function showOrderCard(a: Assistant, o: any): Promise<HTMLElement | null> {
  if (!window.location.pathname.startsWith('/admin/orders')) a.navigate('/admin/orders');
  return waitFor(() => document.getElementById('order-' + o.id));
}

function setAdminDark(on: boolean) {
  try { localStorage.setItem('yn-admin-dark', on ? '1' : '0'); } catch { /* ignore */ }
  window.dispatchEvent(new StorageEvent('storage', { key: 'yn-admin-dark', newValue: on ? '1' : '0' }));
}
const adminDarkNow = () => localStorage.getItem('yn-admin-dark') === '1';

async function summary(): Promise<string> {
  const t0 = dayStart();
  const [today, unpaid, paid, all, admins] = await Promise.all([
    countRows('orders', (q) => q.gte('created_at', t0)),
    countRows('orders', unpaidFilter),
    paidTotal(t0),
    countRows('profiles'),
    countRows('profiles', (q) => q.eq('role', 'admin')),
  ]);
  const parts = [
    today ? `${today} new order${today === 1 ? '' : 's'} today` : 'No new orders today',
    unpaid ? `${unpaid} waiting for payment approval` : 'nothing waiting for payment approval',
    paid.n ? `${sayMoney(paid.sum)} paid today from ${paid.n} order${paid.n === 1 ? '' : 's'}` : 'no paid orders yet today',
    `${Math.max(0, all - admins)} customers in total`,
  ];
  return parts.join('. ') + '.';
}

export function registerYNCommands(a: Assistant) {
  const go = (path: string) => a.navigate(path);

  // ---- navigation ----
  a.register(['go to {page}', 'open {page}', 'take me to {page}', 'navigate to {page}', 'show {page}', 'show me {page}', 'show me my {page}'], ({ groups }) => {
    const path = resolvePage(groups.page);
    if (path) { go(path); return `Opening ${tidy(groups.page)}.`; }
    return clickLabel(a, tidy(groups.page)) ?? `I don't know a page called ${groups.page}.`;
  });

  // ---- look & language ----
  a.register(['dark mode on', 'turn on dark mode', 'enable dark mode', 'dark mode', 'go dark', 'switch to dark mode', 'turn dark mode on'], () => { setAdminDark(true); return 'Dark mode on.'; });
  a.register(['dark mode off', 'turn off dark mode', 'disable dark mode', 'light mode', 'switch to light mode', 'turn on light mode', 'turn dark mode off'], () => { setAdminDark(false); return 'Light mode on.'; });
  a.register(['toggle dark mode', 'switch theme', 'switch mode'], () => { const n = !adminDarkNow(); setAdminDark(n); return n ? 'Dark mode on.' : 'Light mode on.'; });
  a.register(['switch to khmer', 'change language to khmer', 'speak khmer', 'khmer'], () => { setLang('km'); return 'Switched to Khmer.'; });
  a.register(['switch to english', 'change language to english', 'speak english', 'english'], () => { setLang('en'); return 'Switched to English.'; });

  // ---- shop questions (spoken answers) ----
  a.register(['give me a summary', 'summary', 'daily summary', 'brief me', 'briefing', 'give me a briefing', "what's new", 'what is new', 'how is the shop doing', 'how are we doing', 'status report'], () => summary());
  a.register(['how many orders today', 'orders today', 'how many orders did we get today', 'how many new orders', 'any new orders', 'new orders today'], async () => {
    const n = await countRows('orders', (q) => q.gte('created_at', dayStart()));
    return n ? `${n} order${n === 1 ? '' : 's'} today.` : 'No orders yet today.';
  });
  a.register(['how many unpaid orders', 'unpaid orders', 'pending payments', 'how many pending orders', 'pending orders', 'orders waiting for payment', 'how many orders are waiting'], async () => {
    const n = await countRows('orders', unpaidFilter);
    return n ? `${n} order${n === 1 ? ' is' : 's are'} waiting for payment approval.` : 'Nothing is waiting for payment approval.';
  });
  a.register(["today's sales", 'sales today', 'how much did we sell today', 'revenue today', 'how much money today', 'how much have we made today', 'todays sales'], async () => {
    const r = await paidTotal(dayStart());
    return r.n ? `${sayMoney(r.sum)} from ${r.n} paid order${r.n === 1 ? '' : 's'} today.` : 'No paid orders yet today.';
  });
  a.register(['sales this month', 'revenue this month', 'how much did we sell this month', "this month's sales", 'monthly sales'], async () => {
    const r = await paidTotal(monthStart());
    return r.n ? `${sayMoney(r.sum)} from ${r.n} paid order${r.n === 1 ? '' : 's'} this month.` : 'No paid orders this month yet.';
  });
  a.register(['how many customers', 'how many customers do we have', 'customer count', 'number of customers'], async () => {
    const [all, admins] = await Promise.all([countRows('profiles'), countRows('profiles', (q) => q.eq('role', 'admin'))]);
    return `${Math.max(0, all - admins)} customers.`;
  });
  a.register(['how many products', 'how many products do we have', 'product count', 'number of products'], async () => {
    const [pub, all] = await Promise.all([countRows('products', (q) => q.eq('status', 'published')), countRows('products')]);
    return `${pub} published products, ${all} in total.`;
  });
  a.register(['how many categories', 'category count'], async () => `${await countRows('categories', (q) => q.eq('status', 'active'))} active categories.`);
  a.register(['latest order', 'last order', 'read my latest order', 'read the latest order', 'newest order', "what's the latest order"], async () => {
    const { data } = await supabase.from('orders').select(ORDER_COLS).order('created_at', { ascending: false }).limit(1);
    const o = data?.[0];
    if (!o) return 'There are no orders yet.';
    return `Latest order, number ${sayNum(o.order_number)}, from ${await customerName(o)}. ${sayMoney(Number(o.total || 0))}, status ${o.status}, payment ${o.payment_status}.`;
  });

  // ---- orders ----
  a.register(['open order {n}', 'show order {n}', 'find order {n}', 'go to order {n}', 'order number {n}'], async ({ groups }) => {
    const d = digitsOf(groups.n);
    if (!d) return 'Which order number?';
    const o = await findOrder(d);
    if (!o) return `I couldn't find an order matching ${sayNum(d)}.`;
    const el = await showOrderCard(a, o);
    if (!el) return `Order ${sayNum(o.order_number)} exists, but I can't see it on the page. Try clearing the order search.`;
    flash(el);
    return `Order ${sayNum(o.order_number)}, ${sayMoney(Number(o.total || 0))}, status ${o.status}, payment ${o.payment_status}.`;
  });
  a.register(['approve payment for order {n}', 'approve payment order {n}', 'approve order {n}', 'approve payment {n}', 'mark order {n} as paid'], async ({ groups }) => {
    const d = digitsOf(groups.n);
    if (!d) return 'Which order number?';
    const o = await findOrder(d);
    if (!o) return `I couldn't find an order matching ${sayNum(d)}.`;
    if (o.payment_status === 'paid') return `Order ${sayNum(o.order_number)} is already paid.`;
    return a.askConfirm(`Approve payment for order ${sayNum(o.order_number)}, ${sayMoney(Number(o.total || 0))}.`, async () => {
      const { error } = await supabase.rpc('admin_approve_order_payment', { p_order_id: o.id });
      if (error) return `That failed. ${error.message}`;
      refreshAdmin();
      return 'Payment approved.';
    });
  });
  a.register(['set order {n} to {status}', 'mark order {n} as {status}', 'change order {n} to {status}', 'move order {n} to {status}', 'update order {n} to {status}'], async ({ groups }) => {
    const d = digitsOf(groups.n);
    if (!d) return 'Which order number?';
    const o = await findOrder(d);
    if (!o) return `I couldn't find an order matching ${sayNum(d)}.`;
    const { data: sts } = await supabase.from('order_statuses').select('name,label,marks_paid').eq('active', true);
    const q = norm(groups.status);
    const st = (sts || []).find((s: any) => norm(s.label || s.name) === q || norm(s.name) === q) || (sts || []).find((s: any) => norm(s.label || s.name).includes(q) || norm(s.name).includes(q));
    if (!st) return `I don't have a status called ${groups.status}. Your statuses are ${(sts || []).map((s: any) => s.label || s.name).join(', ')}.`;
    return a.askConfirm(`Set order ${sayNum(o.order_number)} to ${st.label || st.name}.`, async () => {
      const paymentStatus = st.name === 'cancelled' || st.name === 'rejected' ? 'failed' : st.marks_paid || o.payment_status === 'paid' ? 'paid' : o.payment_status || 'pending';
      const { error } = await supabase.from('orders').update({ status: st.name, payment_status: paymentStatus }).eq('id', o.id);
      if (error) return `That failed. ${error.message}`;
      if (['completed', 'delivered', 'cancelled', 'rejected'].includes(st.name)) {
        await supabase.from('orders').update({ tracking_active: false, rider_lat: null, rider_lng: null }).eq('id', o.id);
      }
      refreshAdmin();
      return `Order ${sayNum(o.order_number)} is now ${st.label || st.name}.`;
    });
  });

  // ---- live delivery tracking ----
  a.register(['start live tracking for order {n}', 'start tracking order {n}', 'start tracking for order {n}', 'track order {n}', 'start delivery for order {n}'], async ({ groups }) => {
    const d = digitsOf(groups.n);
    if (!d) return 'Which order number?';
    const o = await findOrder(d);
    if (!o) return `I couldn't find an order matching ${sayNum(d)}.`;
    if (!o.tracking_enabled) return `Order ${sayNum(o.order_number)} was not placed with map checkout, so it has no live tracking.`;
    const card = await showOrderCard(a, o);
    if (!card) return "I can't see that order on the page.";
    flash(card);
    const btn = [...card.querySelectorAll<HTMLElement>('button')].find((b) => /live tracking/i.test(b.innerText));
    if (!btn) return 'I could not find the tracking button on that order.';
    if (/stop/i.test(btn.innerText)) return 'Tracking is already running for that order.';
    btn.click();
    return `Starting live tracking for order ${sayNum(o.order_number)}. Allow location if your phone asks.`;
  });
  a.register(['stop live tracking', 'stop tracking', 'stop delivery tracking', 'end live tracking'], () => clickLabel(a, 'stop live tracking') ?? 'I can\'t see a running tracking button on this page. Open the orders page first.');

  // ---- map checkout per category ----
  const setMapCat = async (name: string, on: boolean) => {
    const { data } = await supabase.from('categories').select('id,name').eq('status', 'active');
    const q = norm(name).replace(/ category$/, '');
    const hit = (data || []).find((c: any) => norm(c.name) === q) || (data || []).find((c: any) => norm(c.name).includes(q) || q.includes(norm(c.name)));
    if (!hit) return `I couldn't find a category called ${name}.`;
    const { error } = await supabase.from('categories').update({ delivery_tracking_enabled: on }).eq('id', hit.id);
    if (error) return `That failed. ${error.message}`;
    refreshAdmin();
    return `Map checkout is ${on ? 'on' : 'off'} for ${hit.name}.`;
  };
  a.register(['turn on map checkout for {name}', 'enable map checkout for {name}', 'enable map for {name}', 'turn on the map for {name}'], ({ groups }) => setMapCat(groups.name, true));
  a.register(['turn off map checkout for {name}', 'disable map checkout for {name}', 'disable map for {name}', 'turn off the map for {name}'], ({ groups }) => setMapCat(groups.name, false));

  // ---- on-page helpers ----
  a.register(['search for {q}', 'search {q}', 'find {q}', 'look for {q}'], ({ groups }) => {
    const el = findField('search');
    if (!el) return "There's no search box on this page.";
    el.focus(); setValue(el, groups.q);
    return `Searching for ${groups.q}.`;
  });
  a.register(['clear search', 'clear the search'], () => {
    const el = findField('search');
    if (!el) return "There's no search box on this page.";
    setValue(el, '');
    return 'Search cleared.';
  });
  a.register(['save', 'save it', 'save changes', 'save this'], () => clickLabel(a, 'save') ?? "I can't see a save button here.");

  // ---- account / assistant ----
  a.register(['sign out', 'log out', 'logout', 'sign me out'], () =>
    a.askConfirm('That will sign you out.', async () => { await supabase.auth.signOut(); go('/login'); return 'Signed out.'; })
  );
  a.register(['where am i', 'what page is this', 'what page am i on'], () => {
    const p = window.location.pathname;
    const found = Object.entries(ADMIN_PAGES).find(([, v]) => v === p);
    return found ? `You're on ${found[0]}.` : `You're on ${p}.`;
  });
  a.register(['turn voice off', 'mute voice', 'stop talking', 'be silent', 'voice off'], () => { a.setVoice(false); });
  a.register(['turn voice on', 'unmute voice', 'start talking', 'voice on'], () => { a.setVoice(true); return 'Voice is back on.'; });
  a.register(['go to sleep', 'stop listening', 'mute yourself', 'goodbye', 'bye'], () => {
    window.setTimeout(() => a.stop(), 1800);
    return 'Okay. Tap the mic when you want me back.';
  });
  a.register(['help', 'what can you do', 'what can i say'], () =>
    'Try: give me a summary. How many orders today. Today\'s sales. Unpaid orders. Latest order. Open order, then its number. Approve payment for order, then its number. Set order, its number, to shipped. Start live tracking for order, its number. Turn on map checkout for a category. Go to orders, customers or settings. Dark mode on. Or say click, then any button name.'
  );

  // ---- anything else: a page name, or exactly the label of something on screen ----
  a.opts.onUnknown = (text) => {
    const page = resolvePage(text);
    if (page) { go(page); return `Opening ${tidy(text)}.`; }
    if (findClickable(text, true)) return clickLabel(a, text, true) ?? undefined;
    return undefined;
  };
}
