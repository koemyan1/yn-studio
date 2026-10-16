import { useSyncExternalStore } from 'react';
import { Globe } from 'lucide-react';

/* ------------------------------------------------------------------ *
 *  Language (English / Khmer)
 *
 *  • tr('English','ខ្មែរ') – the helper the app already uses everywhere.
 *  • setLang()/toggleLang() – the customer-facing switch (saved in localStorage 'yn-lang').
 *  • A DOM translator covers any customer-visible English text that is not wrapped in
 *    tr() yet (it only matches exact strings listed below, so product names, user text
 *    and admin screens are never touched).
 * ------------------------------------------------------------------ */

export type Lang = 'en' | 'km';
const KEY = 'yn-lang';
const EVT = 'yn-lang-change';

export const getLang = (): Lang => { try { return localStorage.getItem(KEY) === 'km' ? 'km' : 'en'; } catch { return 'en'; } };
export const isKm = () => getLang() === 'km';
export const tr = (en: string, km: string) => (isKm() ? km : en);

export function setLang(l: Lang) {
  try { localStorage.setItem(KEY, l); } catch { /* private mode */ }
  applyLang();
  window.dispatchEvent(new Event(EVT));
}
export const toggleLang = () => setLang(isKm() ? 'en' : 'km');

const subscribe = (cb: () => void) => {
  window.addEventListener(EVT, cb); window.addEventListener('storage', cb);
  return () => { window.removeEventListener(EVT, cb); window.removeEventListener('storage', cb); };
};
/** Re-renders the calling component whenever the language changes. */
export const useLang = (): Lang => useSyncExternalStore(subscribe, getLang, () => 'en' as Lang);

export function LangButton({ className = '' }: { className?: string }) {
  const lang = useLang();
  return (
    <button type="button" className={'langButton ' + className} onClick={toggleLang} data-notranslate="1"
      aria-label={lang === 'km' ? 'Switch to English' : 'ប្តូរទៅភាសាខ្មែរ'} title={lang === 'km' ? 'English' : 'ភាសាខ្មែរ'}>
      <Globe /><span>{lang === 'km' ? 'EN' : 'ខ្មែរ'}</span>
    </button>
  );
}

/* ------------------------------ Khmer dictionary ------------------------------ */

export const KM: Record<string, string> = {
  'Customer': 'អតិថិជន',
  'Please enter your name.': 'សូមបញ្ចូលឈ្មោះរបស់អ្នក។',
  'Supabase did not return an account. Please check your project URL and public anon key.': 'មិនអាចបង្កើតគណនីបានទេ។ សូមពិនិត្យការកំណត់ប្រព័ន្ធ។',
  'Email or password is incorrect. Make sure this account exists in the Supabase project connected to this app.': 'អ៊ីមែល ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ។ សូមពិនិត្យឡើងវិញ។',
  'Unable to continue. Please try again.': 'មិនអាចបន្តបានទេ។ សូមព្យាយាមម្តងទៀត។',
  'Debt': 'បំណុល',
  'Notifications': 'ការជូនដំណឹង',
  'Log out': 'ចាកចេញ',
  'Remove from wishlist': 'ដកចេញពីចំណូលចិត្ត',
  'Add to wishlist': 'បន្ថែមទៅចំណូលចិត្ត',
  'Delivery rider': 'អ្នកដឹកជញ្ជូន',
  'Map': 'ផែនទី',
  'YN Studio delivery': 'ការដឹកជញ្ជូន YN Studio',
  'Delivery location': 'ទីតាំងដឹកជញ្ជូន',
  'Rider': 'អ្នកដឹក',
  'LIVE': 'ផ្ទាល់',
  'DESTINATION': 'គោលដៅ',
  'Please enter your city or province.': 'សូមបញ្ចូលក្រុង ឬខេត្តរបស់អ្នក។',
  'Please enter your phone number.': 'សូមបញ្ចូលលេខទូរស័ព្ទរបស់អ្នក។',
  'Delivery information saved to your account.': 'ព័ត៌មានដឹកជញ្ជូនត្រូវបានរក្សាទុកក្នុងគណនីរបស់អ្នក។',
  'DELIVERY INFORMATION': 'ព័ត៌មានដឹកជញ្ជូន',
  'Phone:': 'ទូរស័ព្ទ:',
  'Full name': 'ឈ្មោះពេញ',
  'Phone number': 'លេខទូរស័ព្ទ',
  'City / Province': 'ក្រុង / ខេត្ត',
  'Delivery notes': 'កំណត់ចំណាំដឹកជញ្ជូន',
  '(optional)': '(ស្រេចចិត្ត)',
  'Your name': 'ឈ្មោះរបស់អ្នក',
  'e.g. Siem Reap, Phnom Penh': 'ឧ. សៀមរាប ភ្នំពេញ',
  'Village, district, landmark, or other details': 'ភូមិ ស្រុក/ខណ្ឌ ទីកន្លែងសម្គាល់ ឬព័ត៌មានផ្សេងៗ',
  'District, village, landmark, or other details': 'ស្រុក/ខណ្ឌ ភូមិ ទីកន្លែងសម្គាល់ ឬព័ត៌មានផ្សេងៗ',
  'Your delivery information is ready': 'ព័ត៌មានដឹកជញ្ជូនរបស់អ្នករួចរាល់',
  'Add your delivery information': 'បន្ថែមព័ត៌មានដឹកជញ្ជូនរបស់អ្នក',
  'Saving…': 'កំពុងរក្សាទុក…',
  'Save delivery information': 'រក្សាទុកព័ត៌មានដឹកជញ្ជូន',
  'Enter the city or province where your order should be delivered.': 'បញ្ចូលក្រុង ឬខេត្តដែលត្រូវដឹកជញ្ជូនការបញ្ជាទិញរបស់អ្នក។',
  'YN STUDIO MARKETPLACE': 'ទីផ្សារ YN STUDIO',
  'Finding something good…': 'កំពុងស្វែងរកអ្វីដែលល្អ…',
  'Loading the latest products for you.': 'កំពុងផ្ទុកផលិតផលថ្មីៗសម្រាប់អ្នក។',
  'SAVED FOR LATER': 'រក្សាទុកសម្រាប់ពេលក្រោយ',
  'WALLET TRANSACTION': 'ប្រតិបត្តិការកាបូប',
  'Received': 'បានទទួល',
  'GIFT ENVELOPE': 'សំបុត្រអំណោយ',
  'REFUND': 'សងប្រាក់វិញ',
  'COUPON': 'គូប៉ុង',
  'Coupon': 'គូប៉ុង',
  'Receive coupon': 'ទទួលគូប៉ុង',
  'Receive reward': 'ទទួលរង្វាន់',
  'Receiving…': 'កំពុងទទួល…',
  'A little something from YN Studio.': 'អំណោយតូចមួយពី YN Studio។',
  'Enter your secret code.': 'សូមបញ្ចូលកូដសម្ងាត់របស់អ្នក។',
  'That code is invalid or inactive.': 'កូដនេះមិនត្រឹមត្រូវ ឬមិនដំណើរការទេ។',
  'Could not activate theme.': 'មិនអាចបើករចនាប័ទ្មបានទេ។',
  'Normal mode restored.': 'បានត្រឡប់ទៅរបៀបធម្មតា។',
  'Send picture': 'ផ្ញើរូបភាព',
  'YN STUDIO CHAT': 'ជជែក YN STUDIO',
  'Preview': 'មើលជាមុន',
  'Close': 'បិទ',
  'Previous image': 'រូបភាពមុន',
  'Next image': 'រូបភាពបន្ទាប់',
  'Save this as my default delivery information': 'រក្សាទុកជាព័ត៌មានដឹកជញ្ជូនលំនាំដើមរបស់ខ្ញុំ',
  'Delivery': 'ដឹកជញ្ជូន',
  'Delivery details saved': 'បានរក្សាទុកព័ត៌មានដឹកជញ្ជូន',
  'Where should we deliver?': 'តើត្រូវដឹកជញ្ជូនទៅណា?',
  'Enter your phone number and city/province.': 'បញ្ចូលលេខទូរស័ព្ទ និងក្រុង/ខេត្តរបស់អ្នក។',
  'Cancel': 'បោះបង់',
  'Enter / edit delivery information': 'បញ្ចូល / កែព័ត៌មានដឹកជញ្ជូន',
  'LIVE DELIVERY': 'ការដឹកជញ្ជូនផ្ទាល់',
  'Motorbike delivery': 'ដឹកជញ្ជូនដោយម៉ូតូ',
  'Waiting for rider location': 'កំពុងរង់ចាំទីតាំងអ្នកដឹក',
  'YN STUDIO REWARDS': 'រង្វាន់ YN STUDIO',
  'All': 'ទាំងអស់',
  'Coupons': 'គូប៉ុង',
  'Rewards': 'រង្វាន់',
  'Minimum order': 'ការបញ្ជាទិញអប្បបរមា',
  'Use coupon': 'ប្រើគូប៉ុង',
  'Receive': 'ទទួល',
  'Coupon reward': 'រង្វាន់គូប៉ុង',
  'Sent by YN Studio customer service.': 'ផ្ញើដោយសេវាអតិថិជន YN Studio។',
  'No coupons yet.': 'មិនទាន់មានគូប៉ុងទេ។',
  'No rewards yet.': 'មិនទាន់មានរង្វាន់ទេ។',
  'View your current debt and payment history': 'មើលបំណុលបច្ចុប្បន្ន និងប្រវត្តិទូទាត់របស់អ្នក',
  'Admin Panel': 'ផ្ទាំងអ្នកគ្រប់គ្រង',
  'Preparing your marketplace…': 'កំពុងរៀបចំទីផ្សាររបស់អ្នក…',
  '♡ Add YN Studio to Home Screen': '♡ បន្ថែម YN Studio ទៅអេក្រង់ដើម',
  'Tap Share, then “Add to Home Screen”.': 'ចុច Share បន្ទាប់មកជ្រើស “Add to Home Screen”។',
  'Keep your favorite little shop one tap away.': 'ទុកហាងតូចដែលអ្នកចូលចិត្តឱ្យនៅជិតដៃ។',
  'Got it': 'យល់ហើយ',
  'How?': 'ធ្វើយ៉ាងម៉េច?',
  'Add': 'បន្ថែម',
  'Add YN Studio to home screen': 'បន្ថែម YN Studio ទៅអេក្រង់ដើម',
  /* strings used by the new features */
  'Pay now with ABA PayWay': 'ទូទាត់ភ្លាមៗតាម ABA PayWay',
  'Orders': 'ការបញ្ជាទិញ',
  'Home': 'ទំព័រដើម',
};

/** Dynamic strings (numbers, names, amounts inside the sentence). */
const PATTERNS: [RegExp, (...m: string[]) => string][] = [
  [/^Phone: (.+)$/, (_m, a) => `ទូរស័ព្ទ: ${a}`],
  [/^Updated (.+)$/, (_m, a) => `បានធ្វើបច្ចុប្បន្នភាព ${a}`],
  [/^Delivery · ([\d.]+) km$/, (_m, a) => `ដឹកជញ្ជូន · ${a} គីឡូម៉ែត្រ`],
  [/^Secret theme activated: (.+)\. It will stay on this account until you return to normal mode\.$/, (_m, a) => `បានបើករចនាប័ទ្មសម្ងាត់: ${a}។ វានឹងនៅលើគណនីនេះរហូតដល់អ្នកត្រឡប់ទៅរបៀបធម្មតា។`],
  [/^([\d.]+)% OFF$/, (_m, a) => `បញ្ចុះ ${a}%`],
  [/^\$([\d.,]+) OFF$/, (_m, a) => `បញ្ចុះ $${a}`],
  [/^(\$[\d.,]+) refund$/, (_m, a) => `សងវិញ ${a}`],
  [/^(\$[\d.,]+) gift$/, (_m, a) => `អំណោយ ${a}`],
  [/^Used (\d+)(?: \/ (\d+))?$/, (_m, a, b) => `បានប្រើ ${a}${b ? ' / ' + b : ''}`],
  [/^Order ([A-Z0-9-]+) was paid with ABA PayWay\.$/, (_m, a) => `ការបញ្ជាទិញ ${a} ត្រូវបានទូទាត់តាម ABA PayWay។`],
  [/^Order ([A-Z0-9-]+) was paid with Bakong KHQR\.$/, (_m, a) => `ការបញ្ជាទិញ ${a} ត្រូវបានទូទាត់តាម Bakong KHQR។`],
];

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Translate one string to Khmer if we know it, otherwise return it unchanged. */
export function translateKm(s: string): string {
  const core = normalize(s);
  if (!core || !/[A-Za-z]/.test(core)) return s;
  let out = KM[core];
  if (!out) for (const [re, fn] of PATTERNS) { const m = core.match(re); if (m) { out = fn(...(m as unknown as string[])); break; } }
  if (!out) return s;
  const lead = s.match(/^\s*/)?.[0] || '', trail = s.match(/\s*$/)?.[0] || '';
  return lead + out + trail;
}

/* ------------------------------ DOM translator ------------------------------ */

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const origText = new WeakMap<Node, string>();
const wroteText = new WeakMap<Node, string>();
const origAttr = new WeakMap<Element, Record<string, { o: string; w: string }>>();
let observer: MutationObserver | null = null;

const skipped = (el: Element | null): boolean => {
  for (let n: Element | null = el; n; n = n.parentElement) {
    if (n.hasAttribute?.('data-notranslate') || n.classList?.contains('admin')) return true;
    const t = n.tagName;
    if (t === 'SCRIPT' || t === 'STYLE' || t === 'TEXTAREA' || t === 'CODE') return true;
  }
  return false;
};

function xText(node: Text) {
  const cur = node.nodeValue || '';
  if (wroteText.get(node) === cur) return;           // this is our own translation
  if (skipped(node.parentElement)) return;
  const out = translateKm(cur);
  if (out !== cur) { origText.set(node, cur); wroteText.set(node, out); node.nodeValue = out; }
  else { origText.delete(node); wroteText.delete(node); }
}
function xAttrs(el: Element) {
  if (skipped(el)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a); if (v == null) continue;
    const rec = origAttr.get(el) || {};
    if (rec[a] && rec[a].w === v) continue;
    const out = translateKm(v);
    if (out !== v) { rec[a] = { o: v, w: out }; origAttr.set(el, rec); el.setAttribute(a, out); }
    else if (rec[a]) { delete rec[a]; }
  }
}
function walk(root: Node, fn: (n: Node) => void) {
  if (root.nodeType === 1 || root.nodeType === 3) fn(root);
  if (root.nodeType !== 1) return;
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = tw.nextNode())) fn(n);
}
const visit = (n: Node) => { if (n.nodeType === 3) xText(n as Text); else if (n.nodeType === 1) xAttrs(n as Element); };
function restore(n: Node) {
  if (n.nodeType === 3) { const t = n as Text; const o = origText.get(t); if (o != null && wroteText.get(t) === t.nodeValue) t.nodeValue = o; origText.delete(t); wroteText.delete(t); }
  else if (n.nodeType === 1) {
    const el = n as Element, rec = origAttr.get(el);
    if (rec) { for (const a of Object.keys(rec)) if (el.getAttribute(a) === rec[a].w) el.setAttribute(a, rec[a].o); origAttr.delete(el); }
  }
}

function startObserver() {
  if (observer || typeof MutationObserver === 'undefined') return;
  observer = new MutationObserver(records => {
    for (const r of records) {
      if (r.type === 'characterData') xText(r.target as Text);
      else if (r.type === 'attributes') xAttrs(r.target as Element);
      else r.addedNodes.forEach(n => walk(n, visit));
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
function stopObserver() { observer?.disconnect(); observer = null; }

/* ------------------------------ font + html lang ------------------------------ */

/** Khmer fonts the admin can choose from (Look tab → Khmer font). All load from Google Fonts only when a customer uses Khmer. */
export const KHMER_FONTS: { key: string; label: string; gf: string }[] = [
  { key: 'Noto Sans Khmer', label: 'Noto Sans Khmer – clean & modern (default)', gf: 'Noto+Sans+Khmer:wght@400;500;600;700' },
  { key: 'Kantumruy Pro', label: 'Kantumruy Pro – friendly & rounded', gf: 'Kantumruy+Pro:wght@400;500;600;700' },
  { key: 'Battambang', label: 'Battambang – classic book style', gf: 'Battambang:wght@400;700' },
  { key: 'Siemreap', label: 'Siemreap – light & airy', gf: 'Siemreap' },
  { key: 'Hanuman', label: 'Hanuman – serif, elegant', gf: 'Hanuman:wght@400;700' },
  { key: 'Content', label: 'Content – soft & simple', gf: 'Content:wght@400;700' },
];
export const DEFAULT_KHMER_FONT = KHMER_FONTS[0].key;
let khFont = DEFAULT_KHMER_FONT;

/** Pick the Khmer font (from the theme). Unknown / empty = default. Updates live if Khmer is showing. */
export function setKhmerFont(key?: string | null) {
  const k = KHMER_FONTS.some(f => f.key === key) ? (key as string) : DEFAULT_KHMER_FONT;
  if (k === khFont) return;
  khFont = k;
  if (typeof document !== 'undefined' && document.getElementById('yn-km-style')) ensureKhmerStyle();
}

function ensureKhmerStyle() {
  const f = KHMER_FONTS.find(x => x.key === khFont) || KHMER_FONTS[0];
  // Repeating the attribute makes this rule more specific than the themes' own `!important` font rules (Chiikawa's handwriting has no Khmer letters).
  const H = 'html[lang="km"][lang="km"][lang="km"][lang="km"][lang="km"][lang="km"]';
  const css = `${H} body,${H} body *{font-family:"${f.key}","Noto Sans Khmer","Kantumruy Pro","Khmer UI","Leelawadee UI","Khmer OS Battambang",Inter,system-ui,sans-serif!important}
html[lang="km"] .eyebrow,html[lang="km"] .bottom a,html[lang="km"] small{letter-spacing:0!important;text-transform:none!important}
html[lang="km"] h1,html[lang="km"] h2,html[lang="km"] h3{line-height:1.35!important}
html[lang="km"] p,html[lang="km"] .muted,html[lang="km"] small{line-height:1.6}
html[lang="km"] button,html[lang="km"] .button{line-height:1.4}`;
  let st = document.getElementById('yn-km-style') as HTMLStyleElement | null;
  if (!st) { st = document.createElement('style'); st.id = 'yn-km-style'; document.head.appendChild(st); }
  if (st.textContent !== css) st.textContent = css;
  const href = `https://fonts.googleapis.com/css2?family=${f.gf}&display=swap`;
  let l = document.getElementById('yn-km-font') as HTMLLinkElement | null;
  if (!l) { l = document.createElement('link'); l.id = 'yn-km-font'; l.rel = 'stylesheet'; document.head.appendChild(l); }
  if (l.getAttribute('href') !== href) l.setAttribute('href', href);
}

let wrapped = false;
function wrapDialogs() {
  if (wrapped || typeof window === 'undefined') return; wrapped = true;
  const a = window.alert.bind(window), c = window.confirm.bind(window);
  window.alert = (m?: any) => a(isKm() ? translateKm(String(m ?? '')) : m);
  window.confirm = (m?: string) => c(isKm() ? translateKm(String(m ?? '')) : m);
}

export function applyLang() {
  if (typeof document === 'undefined') return;
  const km = isKm();
  document.documentElement.lang = km ? 'km' : 'en';
  wrapDialogs();
  if (km) { ensureKhmerStyle(); walk(document.body, visit); startObserver(); }
  else { stopObserver(); walk(document.body, restore); }
}

/** Call once on startup. */
export function initLang() {
  if (typeof document === 'undefined') return;
  const go = () => applyLang();
  if (document.body) go(); else window.addEventListener('DOMContentLoaded', go, { once: true });
}
