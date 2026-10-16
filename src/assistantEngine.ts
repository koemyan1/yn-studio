/**
 * YN Studio admin assistant – the brain (no React in here).
 *
 *  - built-in commands (go to a page, count orders, click / type on the page, timers, notes, weather, …)
 *  - commands the admin TAUGHT it (table `assistant_skills`): a plain reply, a list of steps, or JavaScript
 *  - an abortable task runner: while the assistant is working, any real touch / click / key / scroll by the
 *    person stops it immediately (see armTouchStop). Everything the assistant does to the page goes through
 *    `Hands`, which throws as soon as the task is aborted, so a stopped task can never keep clicking.
 *
 * Admin only: this module is only used by AdminAssistant.tsx / AdminAssistantTeach.tsx, which only render for
 * profiles with role = 'admin', and the skills table is protected by an admin-only RLS policy.
 */
import { supabase } from './supabase';

/* ------------------------------------------------------------------ types */
export type Step =
  | { t: 'say'; text: string }
  | { t: 'go'; path: string }
  | { t: 'click'; target: string }
  | { t: 'type'; target: string; text: string }
  | { t: 'wait'; ms: number }
  | { t: 'scroll'; target: string }
  | { t: 'mode'; mode: 'dark' | 'light' }
  | { t: 'refresh' };

export type SkillKind = 'reply' | 'macro' | 'code';
export type Skill = {
  id: string;
  name: string;
  description?: string | null;
  triggers: string[];
  kind: SkillKind;
  reply?: string | null;
  steps?: Step[];
  code?: string | null;
  enabled: boolean;
  hits?: number;
  created_at?: string;
};
export type Settings = { name: string; speak: boolean; showAvatar: boolean };
export type Say = (text: string, kind?: 'bot' | 'act' | 'err') => void;
export type Host = { say: Say; navigate: (path: string) => void; path: () => string; stopSpeaking?: () => void };

export const SKILLS_EVENT = 'yn-ai-skills-changed';
export const SETTINGS_EVENT = 'yn-ai-settings';
const CACHE_KEY = 'yn-ai-skills-cache';
const SETTINGS_KEY = 'yn-ai-settings';
const MISSED_KEY = 'yn-ai-missed';
const NOTES_KEY = 'yn-ai-notes';

/* ---------------------------------------------------------------- settings */
const DEFAULT_SETTINGS: Settings = { name: 'Jarvis', speak: true, showAvatar: true };
export function getSettings(): Settings {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(patch: Partial<Settings>) {
  const next = { ...getSettings(), ...patch };
  if (!next.name.trim()) next.name = 'Jarvis';
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(SETTINGS_EVENT));
  return next;
}

/* ------------------------------------------------- taught skills (Supabase) */
let skillCache: Skill[] = (() => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'); } catch { return []; } })();
export const getSkills = () => skillCache;

const cleanSkill = (r: any): Skill => ({
  id: r.id, name: r.name || 'Untitled', description: r.description, triggers: Array.isArray(r.triggers) ? r.triggers : [],
  kind: (['reply', 'macro', 'code'].includes(r.kind) ? r.kind : 'reply') as SkillKind, reply: r.reply,
  steps: Array.isArray(r.steps) ? r.steps : [], code: r.code, enabled: r.enabled !== false, hits: r.hits || 0, created_at: r.created_at,
});

/** Reloads the taught skills. `error` is set when the table is missing (SQL not run yet) – the cache keeps working. */
export async function refreshSkills(): Promise<{ skills: Skill[]; error?: string; missingTable?: boolean }> {
  const r = await supabase.from('assistant_skills').select('*').order('created_at', { ascending: false });
  if (r.error) {
    const missing = /assistant_skills|42P01|does not exist|schema cache/i.test(r.error.message + (r.error.code || ''));
    return { skills: skillCache, error: r.error.message, missingTable: missing };
  }
  skillCache = (r.data || []).map(cleanSkill);
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(skillCache)); } catch { /* storage full – ignore */ }
  window.dispatchEvent(new Event(SKILLS_EVENT));
  return { skills: skillCache };
}
export async function saveSkill(s: Partial<Skill> & { name: string }): Promise<string | null> {
  const row: any = {
    name: s.name.trim(), description: s.description?.trim() || null, triggers: (s.triggers || []).map(x => x.trim()).filter(Boolean),
    kind: s.kind || 'reply', reply: s.kind === 'reply' ? s.reply || '' : null, steps: s.kind === 'macro' ? s.steps || [] : [],
    code: s.kind === 'code' ? s.code || '' : null, enabled: s.enabled !== false, updated_at: new Date().toISOString(),
  };
  const r = s.id ? await supabase.from('assistant_skills').update(row).eq('id', s.id) : await supabase.from('assistant_skills').insert(row);
  if (r.error) return r.error.message;
  await refreshSkills();
  return null;
}
export async function removeSkill(id: string): Promise<string | null> {
  const r = await supabase.from('assistant_skills').delete().eq('id', id);
  if (r.error) return r.error.message;
  await refreshSkills();
  return null;
}
export async function setSkillEnabled(id: string, enabled: boolean): Promise<string | null> {
  const r = await supabase.from('assistant_skills').update({ enabled, updated_at: new Date().toISOString() }).eq('id', id);
  if (r.error) return r.error.message;
  await refreshSkills();
  return null;
}

/* --------------------------------------------- things it did not understand */
export const getMissed = (): string[] => { try { return JSON.parse(localStorage.getItem(MISSED_KEY) || '[]'); } catch { return []; } };
export function logMissed(t: string) {
  const list = [t, ...getMissed().filter(x => x !== t)].slice(0, 30);
  localStorage.setItem(MISSED_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(SKILLS_EVENT));
}
export function clearMissed(t?: string) {
  localStorage.setItem(MISSED_KEY, JSON.stringify(t ? getMissed().filter(x => x !== t) : []));
  window.dispatchEvent(new Event(SKILLS_EVENT));
}

/* ------------------------------------------------------------ admin pages */
export const ADMIN_PAGES: { label: string; path: string; words: string[] }[] = [
  { label: 'Dashboard', path: '/admin', words: ['dashboard', 'admin home', 'overview'] },
  { label: 'Products', path: '/admin/products', words: ['products', 'product list', 'items'] },
  { label: 'Add product', path: '/admin/products/new', words: ['add product', 'new product', 'create product'] },
  { label: 'Snacks page', path: '/admin/snacks', words: ['snacks', 'snack page', 'snacks page'] },
  { label: 'Add snack', path: '/admin/snacks/new', words: ['add snack', 'new snack'] },
  { label: 'Categories', path: '/admin/categories', words: ['categories', 'category'] },
  { label: 'Themes', path: '/admin/themes', words: ['themes', 'theme', 'theme studio'] },
  { label: 'Product Mascots', path: '/admin/product-mascots', words: ['product mascots', 'mascots', 'mascot'] },
  { label: 'Banners', path: '/admin/banners', words: ['banners', 'banner'] },
  { label: 'Coupons', path: '/admin/coupons', words: ['coupons', 'coupon', 'discounts'] },
  { label: 'Orders', path: '/admin/orders', words: ['orders', 'order list'] },
  { label: 'Package Labels', path: '/admin/package-labels', words: ['package labels', 'labels', 'barcode', 'scan'] },
  { label: 'Order Statuses', path: '/admin/order-statuses', words: ['order statuses', 'statuses', 'status'] },
  { label: 'Customers', path: '/admin/customers', words: ['customers', 'customer list', 'users'] },
  { label: 'Debt Management', path: '/admin/debt', words: ['debt', 'debts', 'debt management'] },
  { label: 'Wallet', path: '/admin/wallet', words: ['wallet', 'deposits', 'deposit requests'] },
  { label: 'Transactions', path: '/admin/transactions', words: ['transactions', 'transaction'] },
  { label: 'Notifications', path: '/admin/notifications', words: ['notifications', 'alerts'] },
  { label: 'Support', path: '/admin/support', words: ['support', 'customer service', 'chat', 'messages'] },
  { label: 'Secret Code', path: '/admin/secret-code', words: ['secret code', 'secret theme', 'theme editor'] },
  { label: 'AI Assistant', path: '/admin/assistant', words: ['assistant', 'ai assistant', 'teach', 'teach page', 'teaching'] },
  { label: 'Settings', path: '/admin/settings', words: ['settings', 'delivery settings'] },
  { label: 'Customer side', path: '/', words: ['customer side', 'storefront', 'shop', 'store', 'customer view'] },
];
export function resolvePage(q: string) {
  const s = q.toLowerCase().replace(/^(the|my|our)\s+/, '').replace(/\s+(page|section|screen|tab)$/, '').trim();
  if (!s) return null;
  let best: { p: (typeof ADMIN_PAGES)[number]; score: number } | null = null;
  for (const p of ADMIN_PAGES) {
    for (const w of [p.label.toLowerCase(), ...p.words]) {
      const score = w === s ? 1000 + w.length : s.includes(w) || w.includes(s) ? w.length : 0;
      if (score && (!best || score > best.score)) best = { p, score };
    }
  }
  return best && best.score >= 4 ? best.p : null;
}

/* --------------------------------------------------------- tiny utilities */
const AbortErr = () => Object.assign(new Error('Stopped'), { name: 'AbortError' });
const isAbort = (e: any) => e?.name === 'AbortError';
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isDark = () => document.body.classList.contains('yn-admin-dark-page');
const fill = (s: string, args: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k) => (args[k] !== undefined ? args[k] : m));
const money = (n: number) => '$' + n.toFixed(2);
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const notes = (): string[] => { try { return JSON.parse(localStorage.getItem(NOTES_KEY) || '[]'); } catch { return []; } };

/** Lower-case, strip the wake name + polite words + trailing punctuation. Works for Khmer too (unicode aware). */
export function normalize(raw: string) {
  const name = escapeRe(getSettings().name.toLowerCase());
  return raw.toLowerCase().trim()
    .replace(new RegExp(`^(hey |ok |okay )?${name}[,.!:]?\\s*`, 'u'), '')
    .replace(/^(please |can you |could you |would you |will you )+/, '')
    .replace(/[?!.។]+$/u, '').replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------- trigger matching (taught) */
type Matcher = (text: string) => Record<string, string> | null;
function compileTrigger(trigger: string): { match: Matcher; weight: number } | null {
  const t = trigger.trim();
  if (!t) return null;
  try {
    const rx = /^\/(.+)\/([gimsuy]*)$/.exec(t);
    if (rx) {
      const re = new RegExp(rx[1], rx[2].replace('g', ''));
      return { weight: t.length, match: text => { const m = re.exec(text); if (!m) return null; const a: Record<string, string> = { ...(m.groups || {}) }; m.slice(1).forEach((v, i) => { if (v !== undefined) a['$' + (i + 1)] = v; }); return a; } };
    }
    const n = t.toLowerCase().replace(/\s+/g, ' ');
    if (/\{\w+\}/.test(n)) {
      const re = new RegExp('^' + n.split(/(\{\w+\})/).map(p => (/^\{\w+\}$/.test(p) ? `(?<${p.slice(1, -1)}>.+?)` : escapeRe(p))).join('') + '$', 'u');
      return { weight: n.replace(/\{\w+\}/g, '').length + 1, match: text => { const m = re.exec(text); return m ? { ...(m.groups || {}) } : null; } };
    }
    const hasLatin = /[a-z]/.test(n);
    return { weight: n.length, match: text => (text === n || (hasLatin ? ` ${text} `.includes(` ${n} `) : text.includes(n)) ? {} : null) };
  } catch { return null; }
}
function matchTaught(text: string) {
  let best: { skill: Skill; args: Record<string, string>; weight: number } | null = null;
  for (const skill of skillCache) {
    if (!skill.enabled) continue;
    for (const trig of skill.triggers) {
      const c = compileTrigger(trig);
      const args = c?.match(text);
      if (c && args && (!best || c.weight > best.weight)) best = { skill, args, weight: c.weight };
    }
  }
  return best;
}

/* -------------------------------------------------------------- the hands */
const visible = (el: Element) => {
  const r = (el as HTMLElement).getClientRects();
  if (!r.length) return false;
  const cs = getComputedStyle(el as HTMLElement);
  return cs.visibility !== 'hidden' && cs.display !== 'none';
};
const labelOf = (e: any): string => {
  const parts = [e.innerText, e.value && typeof e.value === 'string' && e.tagName !== 'TEXTAREA' && e.type !== 'text' ? e.value : '', e.placeholder, e.getAttribute?.('aria-label'), e.title, e.labels?.[0]?.innerText, e.getAttribute?.('name'), e.id];
  return parts.filter(Boolean).join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
};
export function findEl(target: string): HTMLElement | null {
  const raw = target.trim();
  if (/^[#.[]|[>:]/.test(raw)) { try { const el = document.querySelector<HTMLElement>(raw); if (el) return el; } catch { /* not a selector */ } }
  const q = raw.toLowerCase().replace(/^(the|my)\s+/, '').replace(/\s+(button|link|section|page|field|box|input|tab)$/, '').trim();
  if (!q) return null;
  const all = [...document.querySelectorAll<HTMLElement>('a,button,input,textarea,select,summary,h1,h2,h3,h4,label,[role=button],[role=tab],[id],article,.panel')]
    .filter(e => !e.closest('.aiRoot') && visible(e));
  const lab = (e: HTMLElement) => labelOf(e);
  return all.find(e => lab(e) === q) || all.find(e => lab(e).startsWith(q)) || all.find(e => lab(e).includes(q))
    || all.find(e => (e.id || '').toLowerCase().replace(/[-_]/g, ' ').includes(q)) || null;
}
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value); // React ignores plain `el.value = …`
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Everything the assistant does to the page. Every call stops with an AbortError once the task is stopped. */
export class Hands {
  constructor(private sig: AbortSignal, private host: Host, public say: Say) {}
  signal() { return this.sig; }
  check() { if (this.sig.aborted) throw AbortErr(); }
  sleep(ms: number) {
    return new Promise<void>((ok, no) => {
      if (this.sig.aborted) return no(AbortErr());
      const t = window.setTimeout(() => { this.sig.removeEventListener('abort', ab); ok(); }, ms);
      const ab = () => { clearTimeout(t); no(AbortErr()); };
      this.sig.addEventListener('abort', ab, { once: true });
    });
  }
  async waitFor(target: string, ms = 4500) {
    const end = Date.now() + ms;
    for (;;) { this.check(); const el = findEl(target); if (el) return el; if (Date.now() > end) return null; await this.sleep(150); }
  }
  async point(el: HTMLElement) {
    this.check();
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await this.sleep(380);
    el.classList.add('aiFlash'); window.setTimeout(() => el.classList.remove('aiFlash'), 1600);
    const r = el.getBoundingClientRect(), tap = document.createElement('i');
    tap.className = 'aiTap'; tap.style.left = r.left + r.width / 2 + 'px'; tap.style.top = r.top + r.height / 2 + 'px';
    document.body.appendChild(tap); window.setTimeout(() => tap.remove(), 800);
    await this.sleep(260);
  }
  async go(path: string) {
    this.check();
    if (this.host.path() !== path) { this.host.navigate(path); await this.sleep(550); }
  }
  async click(target: string) {
    const el = await this.waitFor(target);
    if (!el) throw new Error(`I couldn't find "${target}" on this page.`);
    await this.point(el); this.check(); el.click();
  }
  async type(target: string, text: string) {
    const el = await this.waitFor(target) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    if (!el || !('value' in el)) throw new Error(`I can't find a field called "${target}".`);
    await this.point(el); el.focus();
    if (el instanceof HTMLSelectElement) {
      const o = [...el.options].find(x => x.text.toLowerCase().includes(text.toLowerCase()) || x.value.toLowerCase() === text.toLowerCase());
      if (!o) throw new Error(`"${target}" has no choice called "${text}".`);
      el.value = o.value; el.dispatchEvent(new Event('change', { bubbles: true })); return;
    }
    if (text.length <= 60) { for (let i = 1; i <= text.length; i++) { this.check(); setNativeValue(el, text.slice(0, i)); await this.sleep(22); } } else setNativeValue(el, text);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  async scroll(target: string) {
    this.check();
    const t = target.toLowerCase();
    if (t === 'top') return void window.scrollTo({ top: 0, behavior: 'smooth' });
    if (t === 'bottom') return void window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    if (t === 'down' || t === 'up') return void window.scrollBy({ top: (t === 'down' ? 1 : -1) * innerHeight * 0.8, behavior: 'smooth' });
    const el = await this.waitFor(target, 2500);
    if (!el) throw new Error(`I couldn't find "${target}" on this page.`);
    await this.point(el);
  }
  async mode(mode: 'dark' | 'light') {
    if (!location.pathname.startsWith('/admin')) throw new Error('Dark / light mode switching works on the admin pages.');
    if (isDark() !== (mode === 'dark')) (document.querySelector<HTMLElement>('.adminTopActions button') || null)?.click();
  }
  refresh() { this.check(); window.dispatchEvent(new Event('yn-admin-refresh')); }
  async fetchJSON(url: string) { this.check(); const r = await fetch(url, { signal: this.sig }); return r.json(); }
  async runStep(s: Step, args: Record<string, string>) {
    this.check();
    const f = (x: string) => fill(x || '', args);
    switch (s.t) {
      case 'say': return this.say(f(s.text));
      case 'go': { const page = ADMIN_PAGES.find(p => p.path === f(s.path)); this.say(`Opening ${page ? page.label : f(s.path)}…`, 'act'); return this.go(f(s.path)); }
      case 'click': this.say(`Clicking “${f(s.target)}”`, 'act'); return this.click(f(s.target));
      case 'type': this.say(`Typing into “${f(s.target)}”`, 'act'); return this.type(f(s.target), f(s.text));
      case 'wait': return this.sleep(Math.max(0, Math.min(15000, Number(s.ms) || 0)));
      case 'scroll': this.say(`Scrolling to ${f(s.target)}`, 'act'); return this.scroll(f(s.target));
      case 'mode': return this.mode(s.mode);
      case 'refresh': return this.refresh();
    }
  }
}

/* --------------------------------------------------- free public-data skills */
const wmo = (c: number) => (c === 0 ? 'clear' : c < 4 ? 'partly cloudy' : c < 50 ? 'foggy' : c < 70 ? 'rainy' : c < 80 ? 'snowy' : c < 90 ? 'showery' : 'stormy');
async function weather(h: Hands, city?: string) {
  let lat: number, lon: number, name = city || '';
  if (!city) {
    const p: any = await new Promise((ok, no) => (navigator.geolocation ? navigator.geolocation.getCurrentPosition(ok, no) : no(0))).catch(() => null);
    if (!p) return 'Tell me a city, for example: weather in Phnom Penh.';
    lat = p.coords.latitude; lon = p.coords.longitude; name = 'your location';
  } else {
    const g = (await h.fetchJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`)).results?.[0];
    if (!g) return `I couldn't find "${city}".`;
    lat = g.latitude; lon = g.longitude; name = g.name + ', ' + g.country;
  }
  const w = await h.fetchJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`);
  const c = w.current, d = w.daily;
  return `${name}: ${Math.round(c.temperature_2m)}°C, ${wmo(c.weather_code)}, feels like ${Math.round(c.apparent_temperature)}°C, wind ${Math.round(c.wind_speed_10m)} km/h. Today ${Math.round(d.temperature_2m_min[0])} to ${Math.round(d.temperature_2m_max[0])}°C, ${d.precipitation_probability_max[0]}% chance of rain.`;
}
async function wiki(h: Hands, q: string) {
  const s = await h.fetchJSON(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=1&format=json&origin=*`);
  if (!s[1]?.length) return null;
  const r = await h.fetchJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(s[1][0])}`);
  return r.extract ? (r.extract.length > 450 ? r.extract.slice(0, 450).replace(/\s\S*$/, '') + '…' : r.extract) : null;
}
function calc(s: string) {
  s = s.replace(/plus/g, '+').replace(/minus/g, '-').replace(/(times|multiplied by|\bx\b)/g, '*').replace(/(divided by|over)/g, '/').replace(/to the power of|\^/g, '**').replace(/,/g, '').replace(/(\d)\s*%\s*of\s*(\d)/g, '($1/100)*$2');
  if (!/^[\d\s+\-*/().%]+$/.test(s) || !/\d/.test(s) || !/[+\-*/%]/.test(s)) return null;
  try { const v = Function('"use strict";return (' + s + ')')(); return isFinite(v) ? String(+v.toFixed(6)) : null; } catch { return null; }
}
const SITES: Record<string, string> = { youtube: 'https://youtube.com', google: 'https://google.com', github: 'https://github.com', facebook: 'https://facebook.com', telegram: 'https://web.telegram.org', maps: 'https://maps.google.com', gmail: 'https://mail.google.com', supabase: 'https://supabase.com/dashboard', render: 'https://dashboard.render.com' };
const JOKES = ['I would tell you a UDP joke, but you might not get it.', 'There are 10 kinds of people: those who understand binary and those who don’t.', 'Why do programmers prefer dark mode? Because light attracts bugs.', 'A SQL query walks into a bar, sees two tables and asks: can I join you?'];

/* ------------------------------------------------------- built-in commands */
type Rule = { re: RegExp; run: (m: RegExpMatchArray, h: Hands, e: Engine) => Promise<string | false | void> | string | false | void };
const count = async (q: any) => { const r = await q; if (r.error) throw new Error(r.error.message); return r.count || 0; };
const RISKY = /\b(delete|remove|refund|cancel|reject|sign ?out|log ?out|clear|reset|wipe|deactivate|disable)\b/i;
const UNPAID = 'payment_status.is.null,payment_status.not.in.(paid,completed)';

const RULES: Rule[] = [
  { re: /^(help|what can you do|commands|what do you know)/, run: () => 'Here is what I can do:\n• Go to pages: “open orders”, “go to customers”, “add product”\n• Store numbers: “pending orders”, “sales today”, “latest orders”, “how many customers”, “how many products”, “unread notifications”\n• Work on the page: “find order YN-123”, “click Save”, “type hello into search”, “scroll to bottom”, “refresh”\n• Extras: “dark mode”, “weather in Siem Reap”, “25 times 4”, “timer for 5 minutes”, “remember …”, “my notes”, “who is …”\n• Stop me at any time by touching the screen.\n' + (skillCache.filter(s => s.enabled).length ? `I also know ${skillCache.filter(s => s.enabled).length} command(s) you taught me.` : 'Teach me new commands on the AI Assistant page (say “open assistant”).') },

  { re: /^(?:go to|open|show|take me to|navigate to|visit|switch to)\s+(?:the\s+)?(.+)$/, run: async (m, h) => { const p = resolvePage(m[1]); if (!p) return false; h.say(`Opening ${p.label}…`, 'act'); await h.go(p.path); return `Here is ${p.label}.`; } },

  { re: /(?:unread|new) notifications?|notifications? (?:count|unread)/, run: async () => { const n = await count(supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('target_role', 'admin').is('read_at', null)); return n ? `You have ${n} unread notification${n > 1 ? 's' : ''}.` : 'No unread notifications.'; } },
  { re: /pending orders?|orders? (?:waiting|awaiting|unpaid)|unpaid orders?/, run: async () => { const n = await count(supabase.from('orders').select('*', { count: 'exact', head: true }).or(UNPAID)); return `${n} order${n === 1 ? ' is' : 's are'} waiting for payment.`; } },
  { re: /(?:how many|number of|count)\s+orders(?:\s+(?:today|do we have today))?|(?:orders today|today'?s orders)/, run: async m => { const today = /today/.test(m.input || ''); const q = supabase.from('orders').select('*', { count: 'exact', head: true }); const n = await count(today ? q.gte('created_at', startOfToday()) : q); return `${n} order${n === 1 ? '' : 's'}${today ? ' today' : ' in total'}.`; } },
  { re: /(?:sales|revenue|income|money)(?:\s+(?:today|so far))?|how much (?:did we|have we) (?:make|earn|sell)/, run: async m => { const today = /today/.test(m.input || ''); let q = supabase.from('orders').select('total').in('payment_status', ['paid', 'completed']); if (today) q = q.gte('created_at', startOfToday()); const r = await q.range(0, 4999); if (r.error) throw new Error(r.error.message); const sum = (r.data || []).reduce((a: number, x: any) => a + Number(x.total || 0), 0); return `${today ? 'Today’s' : 'Total'} paid sales: ${money(sum)} from ${(r.data || []).length} order${(r.data || []).length === 1 ? '' : 's'}.`; } },
  { re: /(?:latest|recent|last)\s*(\d+)?\s*orders?/, run: async m => { const n = Math.min(10, Number(m[1]) || 5); const r = await supabase.from('orders').select('order_number,total,status,payment_status,created_at').order('created_at', { ascending: false }).limit(n); if (r.error) throw new Error(r.error.message); return (r.data || []).length ? (r.data || []).map((o: any) => `#${o.order_number} · ${money(Number(o.total || 0))} · ${o.status || 'new'} / ${o.payment_status || 'pending'} · ${new Date(o.created_at).toLocaleString()}`).join('\n') : 'No orders yet.'; } },
  { re: /^(?:find|search|look up|lookup|show)\s+(?:the\s+)?order\s+(?:number\s+)?(.+)$/, run: async (m, h) => { const code = m[1].trim().toUpperCase(); await h.go('/admin/orders'); await h.type('search order', code); return `Searching orders for ${code}.`; } },
  { re: /(?:how many|number of|count)\s+customers?|customers? count/, run: async () => `${await count(supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer'))} customers.` },
  { re: /(?:how many|number of|count)\s+products?|products? count/, run: async () => { const all = await count(supabase.from('products').select('*', { count: 'exact', head: true })); const pub = await count(supabase.from('products').select('*', { count: 'exact', head: true }).eq('status', 'published')); return `${all} products in total, ${pub} published.`; } },

  { re: /(dark|light)\s*(?:mode|theme)|(?:go|switch to|turn on)\s*(dark|light)/, run: async (m, h) => { const mode = /dark/.test(m[0]) ? 'dark' : 'light'; await h.mode(mode); return `${mode === 'dark' ? 'Dark' : 'Light'} mode on.`; } },
  { re: /^(?:refresh|reload|update)(?: the)?(?: data| list| page)?$/, run: (_m, h) => { h.refresh(); return 'Refreshed the page data.'; } },
  { re: /^scroll\s*(?:to\s*)?(?:the\s*)?(top|bottom|down|up)$/, run: async (m, h) => { await h.scroll(m[1]); return 'Done.'; } },
  { re: /^scroll to\s+(.+)/, run: async (m, h) => { await h.scroll(m[1]); return `Here is ${m[1]}.`; } },
  { re: /^(?:type|fill|enter|write|put)\s+(.+?)\s+(?:in|into|in the|into the)\s+(.+)$/, run: async (m, h) => { h.say(`Typing into “${m[2]}”`, 'act'); await h.type(m[2], m[1]); return `Typed “${m[1]}” into ${m[2]}.`; } },
  { re: /^(?:click|press|tap|hit|select|open)\s+(.+)/, run: async (m, h, e) => {
      const el = await h.waitFor(m[1], 1200);
      if (!el) return `I couldn't find “${m[1]}” on this page.`;
      const label = labelOf(el);
      if (RISKY.test(label)) { e.askConfirm(`“${label.slice(0, 40)}” looks destructive. Say “yes” and I’ll click it, or anything else to cancel.`, async hh => { h.say(`Clicking “${m[1]}”`, 'act'); await hh.click(m[1]); return 'Clicked.'; }); return; }
      h.say(`Clicking “${m[1]}”`, 'act'); await h.click(m[1]); return `Clicked ${m[1]}.`;
    } },
  { re: /read\s*(?:this|the)?\s*page|what(?:'s| is) on (?:this|the) page|summari[sz]e\s*(?:this|the)?\s*page/, run: () => { const hs = [...document.querySelectorAll('main h1,main h2,main h3,.adminContent h2,.adminContent h3')].filter(e => !e.closest('.aiRoot')).map(e => (e as HTMLElement).innerText.trim()).filter(Boolean).slice(0, 10); return `${document.title}. Sections: ${hs.join(', ') || 'none found'}.`; } },

  { re: /timer.*?(\d+)\s*(second|sec|minute|min|hour)/, run: (m, _h, e) => { const n = +m[1], ms = n * (/^h/.test(m[2]) ? 3600 : /^m/.test(m[2]) ? 60 : 1) * 1000; window.setTimeout(() => e.host.say(`⏰ Your ${n} ${m[2]} timer is up.`), ms); return `Timer set for ${n} ${m[2]}${n > 1 ? 's' : ''}.`; } },
  { re: /^(?:remember|note|make a note)(?: that)?\s+(.+)/, run: m => { localStorage.setItem(NOTES_KEY, JSON.stringify([...notes(), m[1]])); return 'Noted.'; } },
  { re: /(?:my notes|show notes|what did i (?:ask you to )?remember)/, run: () => (notes().length ? 'Your notes:\n' + notes().map((n, i) => `${i + 1}) ${n}`).join('\n') : 'You have no notes.') },
  { re: /clear (?:my )?notes/, run: () => { localStorage.removeItem(NOTES_KEY); return 'Notes cleared.'; } },
  { re: /weather|temperature|forecast|will it rain/, run: async (m, h) => { const c = (m.input || '').match(/(?:in|for|at)\s+([\p{L}\s'.-]+?)(?:\s+(?:today|tomorrow|now|please))?$/u); return weather(h, c ? c[1].trim() : undefined); } },
  { re: /what('?s| is)?\s+the\s+(time|date|day)|current (time|date)|what time/, run: () => new Date().toLocaleString([], { dateStyle: 'full', timeStyle: 'short' }) },
  { re: /joke/, run: () => JOKES[Math.random() * JOKES.length | 0] },
  { re: /^(hi|hello|hey|good (morning|evening|afternoon))\b/, run: () => 'Hello. What should I do?' },
  { re: /who are you|your name/, run: () => `I'm ${getSettings().name}, the YN Studio admin assistant. Teach me new commands on the AI Assistant page.` },
  { re: /^(thanks|thank you)/, run: () => 'Anytime.' },
  { re: /^(?:open|launch|go to|visit)\s+(?:the\s+)?(\w+)(?:\.com)?$/, run: (m) => { const u = SITES[m[1]]; if (!u) return false; window.open(u, '_blank', 'noopener'); return `Opening ${m[1]}.`; } },
  { re: /^(?:search(?: google)?(?: for)?|google|look up)\s+(.+)/, run: async (m, h) => { const w = await wiki(h, m[1]).catch(() => null); window.open('https://www.google.com/search?q=' + encodeURIComponent(m[1]), '_blank', 'noopener'); return (w || `Nothing on Wikipedia for “${m[1]}”.`) + '\nI also opened a Google search.'; } },
  { re: /^(?:who|what) (?:is|was|are|were)\s+(?:an?\s+|the\s+)?(.+)|^(?:tell me about|define|explain)\s+(.+)/, run: async (m, h) => { const w = await wiki(h, m[1] || m[2]); return w || false; } },
];

/* ----------------------------------------------------------------- engine */
export class Engine {
  busy = false;
  lastStopAt = 0;
  private ctrl: AbortController | null = null;
  private listeners = new Set<() => void>();
  private pending: ((h: Hands) => Promise<string | void>) | null = null;
  private disarm: (() => void) | null = null;
  constructor(public host: Host) {}

  onChange(cb: () => void) { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
  private emit() { this.listeners.forEach(f => f()); }
  askConfirm(question: string, run: (h: Hands) => Promise<string | void>) { this.pending = run; this.host.say(question); }

  /** Stops whatever the assistant is doing right now. */
  stop() {
    if (!this.ctrl) return false;
    this.lastStopAt = performance.now();
    this.ctrl.abort();
    this.host.stopSpeaking?.();
    return true;
  }

  /** While a task runs, a REAL touch / click / key / scroll by the person stops it. (Synthetic events are ignored.) */
  private armTouchStop() {
    const started = performance.now();
    const hit = (e: Event) => { if (!e.isTrusted || performance.now() - started < 300) return; this.stop(); };
    const evs = ['pointerdown', 'touchstart', 'mousedown', 'wheel', 'keydown'] as const;
    evs.forEach(n => window.addEventListener(n, hit, { capture: true, passive: true }));
    this.disarm = () => evs.forEach(n => window.removeEventListener(n, hit, { capture: true } as any));
  }

  async run(raw: string) {
    const text = normalize(raw);
    if (!text) return this.host.say('Yes?');
    if (this.busy) this.stop();
    if (/^(stop|cancel|abort|never ?mind|enough)$/.test(text)) return this.host.say('Nothing is running right now.');

    if (this.pending) {
      const p = this.pending; this.pending = null;
      if (!/^(yes|yeah|yep|confirm|do it|ok|okay|sure|go ahead)\b/.test(text)) return this.host.say('Okay, cancelled.');
      return this.exec(async h => { const r = await p(h); if (r) h.say(r); });
    }
    return this.exec(async h => {
      const hit = matchTaught(text);
      if (hit) { await this.runSkill(hit.skill, hit.args, raw, h); return; }
      const sum = calc(text.replace(/^(what is|what's|calculate|how much is|compute)\s+/, ''));
      if (sum) return void h.say(sum);
      for (const rule of RULES) {
        const m = text.match(rule.re);
        if (!m) continue;
        (m as any).input = text;
        const out = await rule.run(m, h, this);
        if (typeof out === 'string') { if (out) h.say(out); return; }
        if (out === undefined) return; // handled silently
      }
      logMissed(text);
      h.say('I don’t know that one yet. Say “open assistant” and you can teach me — I saved this phrase there so you can turn it into a command.');
    });
  }

  private async exec(fn: (h: Hands) => Promise<void>) {
    const ctrl = new AbortController();
    this.ctrl = ctrl; this.busy = true; this.armTouchStop(); this.emit();
    const hands = new Hands(ctrl.signal, this.host, (t, k) => { if (!ctrl.signal.aborted) this.host.say(t, k); });
    const aborted = new Promise<never>((_, no) => ctrl.signal.addEventListener('abort', () => no(AbortErr()), { once: true }));
    try {
      await Promise.race([fn(hands), aborted]);
    } catch (e: any) {
      if (isAbort(e)) this.host.say('Stopped. ✋', 'act');
      else this.host.say(e?.message ? String(e.message) : 'That failed. Check your connection and try again.', 'err');
    } finally {
      if (this.ctrl === ctrl) { this.ctrl = null; this.busy = false; this.disarm?.(); this.disarm = null; this.emit(); }
    }
  }

  private async runSkill(skill: Skill, args: Record<string, string>, raw: string, h: Hands) {
    supabase.from('assistant_skills').update({ hits: (skill.hits || 0) + 1 }).eq('id', skill.id).then(() => {}, () => {});
    skill.hits = (skill.hits || 0) + 1;
    if (skill.kind === 'reply') return void h.say(fill(skill.reply || '…', args));
    if (skill.kind === 'macro') {
      for (const s of skill.steps || []) await h.runStep(s, args);
      return;
    }
    const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...a: any[]) => Promise<any>;
    let fn: (...a: any[]) => Promise<any>;
    try { fn = new AsyncFunction('ctx', 'args', 'text', skill.code || ''); } catch (e: any) { throw new Error(`The code of “${skill.name}” has a mistake: ${e.message}`); }
    const ctx = {
      args, text: raw, supabase, signal: h.signal(), say: (t: string) => h.say(String(t)),
      go: (p: string) => h.go(p), click: (t: string) => h.click(t), type: (t: string, v: string) => h.type(t, v), scroll: (t: string) => h.scroll(t),
      wait: (ms: number) => h.sleep(ms), find: findEl, mode: (m: 'dark' | 'light') => h.mode(m), refresh: () => h.refresh(), fetchJSON: (u: string) => h.fetchJSON(u), stopped: () => h.signal().aborted, check: () => h.check(),
    };
    try { await fn(ctx, args, raw); } catch (e: any) { if (isAbort(e)) throw e; throw new Error(`“${skill.name}” failed: ${e?.message || e}`); }
  }
}
