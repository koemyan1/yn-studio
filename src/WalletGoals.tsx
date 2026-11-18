/* Wallet Goals: pick a product from the shop, a category or your own picture + a price, then watch the picture fill with colour as the wallet grows.
   A goal never moves money. Progress = the wallet balance in the goal's currency compared with the goal price.
   Saved in Supabase (supabase-wallet-goals.sql); until that file is run, goals are kept on this device so it still works. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, X, Check, Sparkles, ImagePlus, Trash2, Smartphone, Laptop, Plane, Bike, Home, GraduationCap, Gift, Shirt,
  Gamepad2, Camera, Heart, ShieldCheck, PartyPopper, Store, Search, ChevronLeft,
} from 'lucide-react';
import { supabase } from './supabase';
import { tr } from './lang';
import { RollNumber } from './delight';
import './walletGoals.css';

type Cur = 'USD' | 'KHR';
type Goal = { id: string; title: string; category: string; image_url: string | null; target: number; currency: Cur; created_at: string };
type Draft = { title: string; category: string; image_url: string | null; target: number; currency: Cur };

const MAX_GOALS = 8;
const KHR_RATE = 4100;

type Cat = { k: string; en: string; km: string; Icon: React.ComponentType<any>; a: string; b: string; usd: number };
const CATS: Cat[] = [
  { k: 'phone', en: 'Phone', km: 'ទូរស័ព្ទ', Icon: Smartphone, a: '#6366f1', b: '#a855f7', usd: 800 },
  { k: 'laptop', en: 'Laptop', km: 'កុំព្យូទ័រ', Icon: Laptop, a: '#0ea5e9', b: '#6366f1', usd: 1200 },
  { k: 'trip', en: 'Trip', km: 'ដំណើរកំសាន្ត', Icon: Plane, a: '#06b6d4', b: '#10b981', usd: 1500 },
  { k: 'bike', en: 'Motorbike', km: 'ម៉ូតូ', Icon: Bike, a: '#f97316', b: '#ef4444', usd: 2000 },
  { k: 'home', en: 'Home', km: 'ផ្ទះ', Icon: Home, a: '#f59e0b', b: '#f97316', usd: 5000 },
  { k: 'study', en: 'Study', km: 'ការសិក្សា', Icon: GraduationCap, a: '#3b82f6', b: '#8b5cf6', usd: 600 },
  { k: 'gift', en: 'Gift', km: 'អំណោយ', Icon: Gift, a: '#ec4899', b: '#f43f5e', usd: 100 },
  { k: 'fashion', en: 'Fashion', km: 'ម៉ូដ', Icon: Shirt, a: '#d946ef', b: '#ec4899', usd: 150 },
  { k: 'gaming', en: 'Gaming', km: 'ហ្គេម', Icon: Gamepad2, a: '#8b5cf6', b: '#06b6d4', usd: 500 },
  { k: 'camera', en: 'Camera', km: 'កាមេរ៉ា', Icon: Camera, a: '#64748b', b: '#0ea5e9', usd: 700 },
  { k: 'wedding', en: 'Wedding', km: 'អាពាហ៍ពិពាហ៍', Icon: Heart, a: '#fb7185', b: '#f59e0b', usd: 3000 },
  { k: 'safety', en: 'Safety fund', km: 'ទុនសុវត្ថិភាព', Icon: ShieldCheck, a: '#10b981', b: '#14b8a6', usd: 1000 },
];
const CUSTOM: Cat = { k: 'custom', en: 'My own', km: 'ផ្ទាល់ខ្លួន', Icon: ImagePlus, a: '#7c3aed', b: '#ec4899', usd: 0 };
const catOf = (k: string): Cat => CATS.find(c => c.k === k) || CUSTOM;
const catName = (c: Cat) => tr(c.en, c.km);
const defaultPrice = (c: Cat, cur: Cur) => (c.usd ? (cur === 'KHR' ? Math.round((c.usd * KHR_RATE) / 10000) * 10000 : c.usd) : 0);

const fmt = (n: number, c: Cur) => (c === 'KHR' ? Math.round(n).toLocaleString('en-US') + ' ៛' : '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ----------------------------------------------------------------- storage (Supabase, or this device until the SQL is run) */
const fromRow = (r: any): Goal => ({ id: r.id, title: r.title, category: r.category || 'custom', image_url: r.image_url || null, target: Number(r.target_amount), currency: r.currency === 'KHR' ? 'KHR' : 'USD', created_at: r.created_at });
const lsKey = (u: string) => 'yn-goals-' + u;
const readLocal = (u: string): Goal[] => { try { const v = JSON.parse(localStorage.getItem(lsKey(u)) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const writeLocal = (u: string, g: Goal[]) => { try { localStorage.setItem(lsKey(u), JSON.stringify(g)); return true; } catch { return false; } };
const missingTable = (e: any) => /wallet_goals|schema cache|does not exist|PGRST20\d|42P01/i.test(String(e?.code || '') + ' ' + String(e?.message || ''));

function useGoals() {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const mode = useRef<'db' | 'local'>('db');
  const user = useRef('');

  useEffect(() => {
    let on = true;
    (async () => {
      const u = (await supabase.auth.getUser()).data.user?.id;
      if (!on) return;
      if (!u) { setGoals([]); return; }
      user.current = u;
      const r = await supabase.from('wallet_goals').select('*').eq('user_id', u).order('created_at', { ascending: true });
      if (!on) return;
      if (r.error) { mode.current = 'local'; setGoals(readLocal(u)); } else { mode.current = 'db'; setGoals((r.data || []).map(fromRow)); }
    })();
    return () => { on = false; };
  }, []);

  const save = useCallback(async (d: Draft, id?: string): Promise<string | null> => {
    const u = user.current;
    if (!u) return tr('Please sign in again.', 'សូមចូលគណនីម្តងទៀត។');
    const local = (): string | null => {
      const list = readLocal(u);
      const next: Goal[] = id ? list.map(g => (g.id === id ? { ...g, ...d } : g)) : [...list, { ...d, id: 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), created_at: new Date().toISOString() }];
      if (!writeLocal(u, next)) return tr('Not enough space for this picture. Try a smaller one.', 'កន្លែងផ្ទុកមិនគ្រប់គ្រាន់ សូមសាកល្បងរូបតូចជាងនេះ។');
      mode.current = 'local';
      setGoals(next);
      return null;
    };
    if (mode.current === 'local') return local();
    const row = { title: d.title, category: d.category, image_url: d.image_url, target_amount: d.target, currency: d.currency };
    const r = id ? await supabase.from('wallet_goals').update(row).eq('id', id).select().single() : await supabase.from('wallet_goals').insert({ ...row, user_id: u }).select().single();
    if (r.error) { if (missingTable(r.error)) return local(); return r.error.message; }
    const g = fromRow(r.data);
    setGoals(l => (id ? (l || []).map(x => (x.id === id ? g : x)) : [...(l || []), g]));
    return null;
  }, []);

  const remove = useCallback(async (id: string) => {
    const u = user.current;
    if (mode.current === 'db') await supabase.from('wallet_goals').delete().eq('id', id);
    else writeLocal(u, readLocal(u).filter(g => g.id !== id));
    setGoals(l => (l || []).filter(g => g.id !== id));
  }, []);

  return { goals, save, remove };
}

/* resize + compress a picked photo so it stays small (about 40-120 KB) */
async function compress(file: File, max = 720, q = 0.8): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('bad image')); i.src = url; });
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * s));
    c.height = Math.max(1, Math.round(img.naturalHeight * s));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  } finally { URL.revokeObjectURL(url); }
}

/* ----------------------------------------------------------------- pieces */
function Art({ image, cat }: { image: string | null; cat: Cat }) {
  return (
    <span className="wgArt" style={{ backgroundImage: image ? `url("${image}")` : `linear-gradient(150deg,${cat.a},${cat.b})` }}>
      {!image && <cat.Icon />}
    </span>
  );
}

const CONFETTI = ['#ffd23f', '#ff5d8f', '#2ec4b6', '#8338ec', '#ff9f1c', '#3a86ff'];
function Burst() {
  const bits = useMemo(() => Array.from({ length: 26 }, (_, i) => {
    const a = (i / 26) * Math.PI * 2 + Math.random() * 0.4, d = 70 + Math.random() * 90;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d - 30, r: Math.random() * 540 - 270, c: CONFETTI[i % CONFETTI.length], s: 6 + Math.random() * 6, dl: Math.random() * 0.12 };
  }), []);
  return <span className="wgBurst" aria-hidden="true">{bits.map((b, i) => <i key={i} style={{ '--x': b.x + 'px', '--y': b.y + 'px', '--r': b.r + 'deg', '--dl': b.dl + 's', width: b.s, height: b.s * 0.6, background: b.c } as React.CSSProperties} />)}</span>;
}

const celebratedKey = 'yn-goals-celebrated';
const wasCelebrated = (id: string) => { try { return (JSON.parse(localStorage.getItem(celebratedKey) || '[]') as string[]).includes(id); } catch { return false; } };
const markCelebrated = (id: string) => { try { const l = JSON.parse(localStorage.getItem(celebratedKey) || '[]') as string[]; if (!l.includes(id)) localStorage.setItem(celebratedKey, JSON.stringify([...l, id].slice(-60))); } catch { /* ignore */ } };

function GoalCard({ g, bal, ready, i, leaving, onOpen }: { g: Goal; bal: number; ready: boolean; i: number; leaving: boolean; onOpen: () => void }) {
  const cat = catOf(g.category);
  const [go, setGo] = useState(false);
  const [burst, setBurst] = useState(false);
  const pct = Math.max(0, Math.min(1, bal / g.target));
  const done = ready && bal + 1e-9 >= g.target;
  const p = ready && go ? pct : 0;
  const level = done && go ? 1.1 : p;

  useEffect(() => { const t = window.setTimeout(() => setGo(true), 120 + i * 90); return () => window.clearTimeout(t); }, [i]);
  useEffect(() => {
    if (!done || !go || wasCelebrated(g.id)) return;
    markCelebrated(g.id);
    if (reduced()) return;
    const a = window.setTimeout(() => setBurst(true), 1100);
    const b = window.setTimeout(() => setBurst(false), 2700);
    return () => { window.clearTimeout(a); window.clearTimeout(b); };
  }, [done, go, g.id]);

  return (
    <div
      role="button" tabIndex={0}
      className={'wgCard' + (done ? ' done' : '') + (leaving ? ' leave' : '')}
      style={{ '--p': level, '--i': i, '--c1': cat.a, '--c2': cat.b } as React.CSSProperties}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      aria-label={g.title}
    >
      <span className="wgLayer wgBase"><Art image={g.image_url} cat={cat} /></span>
      <span className="wgLayer wgFill b" aria-hidden="true" />
      <span className="wgLayer wgFill a"><span className="wgFillIn"><Art image={g.image_url} cat={cat} /></span></span>
      <span className="wgShade" />
      <span className="wgPct"><RollNumber n={Math.round(p * 100) + '%'} /></span>
      {done && <span className="wgBadge"><Check />{tr('Reached', 'សម្រេចបាន')}</span>}
      <span className="wgInfo"><b>{g.title}</b><small>{fmt(Math.min(bal, g.target), g.currency)} <em>/ {fmt(g.target, g.currency)}</em></small></span>
      {burst && <Burst />}
    </div>
  );
}

function AddTile({ big, onClick }: { big?: boolean; onClick: () => void }) {
  const floats = [Smartphone, Plane, Gift, Laptop];
  return (
    <button type="button" className={'wgAdd' + (big ? ' big' : '')} onClick={onClick} aria-label={tr('New goal', 'គោលដៅថ្មី')}>
      {big && floats.map((F, i) => <F key={i} className={'wgFloat f' + i} />)}
      <span className="wgPlus"><Plus /></span>
      <span className="wgAddText">{big ? tr('Start a goal', 'ចាប់ផ្តើមគោលដៅ') : tr('New goal', 'គោលដៅថ្មី')}</span>
    </button>
  );
}


/* ----------------------------------------------------------------- pick a product from the shop */
type ShopItem = { id: string; name: string; price: number; original_price: number | null; image: string | null; currency: Cur };
/** Home's own price lookup (the first option's price when a product is priced through its options). Passed in from main.tsx so both show the same number. */
export type ShopPrices = (rows: any[]) => Promise<Map<string, number>>;
let shopCache: ShopItem[] | null = null;
function ShopPicker({ onBack, onPick, shopPrices }: { onBack: () => void; onPick: (p: ShopItem) => void; shopPrices?: ShopPrices }) {
  const [items, setItems] = useState<ShopItem[] | null>(shopCache);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState('');
  useEffect(() => {
    let on = true;
    (async () => {
      /* select('*') like Home does, so a column this shop does not have can never stop the list from loading */
      const r = await supabase.from('products').select('*').eq('status', 'published').order('created_at', { ascending: false }).limit(400);
      if (!on) return;
      if (r.error) { if (!shopCache) setFailed(true); return; }
      /* same list as Home: products made for the Snacks page are not part of it */
      const rows: any[] = (r.data || []).filter((x: any) => !x.store_page);
      /* same price as the card on Home: a product priced through its options has no usable base price */
      let shown = new Map<string, number>();
      try { if (shopPrices) shown = await shopPrices(rows); } catch { /* fall back to each product's own price */ }
      if (!on) return;
      shopCache = rows.map((x: any) => {
        const price = Number(shown.has(x.id) ? shown.get(x.id) : x.price) || 0;
        return { id: x.id, name: String(x.name || ''), price, original_price: x.original_price ? Number(x.original_price) : null, image: x.main_image_url || null, currency: x.currency === 'KHR' ? 'KHR' : 'USD' } as ShopItem;
      }).filter(x => x.price > 0);
      setItems(shopCache);
    })();
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const list = useMemo(() => { const t = q.trim().toLowerCase(); return (items || []).filter(x => !t || x.name.toLowerCase().includes(t)); }, [items, q]);
  return (
    <div className="wgShop">
      <div className="wgShopHead">
        <button type="button" className="wgShopBack" onClick={onBack} aria-label={tr('Back', 'ត្រឡប់ក្រោយ')}><ChevronLeft /></button>
        <h3>{tr('Choose from the shop', 'ជ្រើសពីហាង')}</h3>
      </div>
      <label className="wgShopSearch"><Search /><input value={q} onChange={e => setQ(e.target.value)} placeholder={tr('Search products', 'ស្វែងរកទំនិញ')} aria-label={tr('Search products', 'ស្វែងរកទំនិញ')} /></label>
      {items === null && !failed && <div className="wgShopGrid" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <div className="wgSkel" key={i} />)}</div>}
      {failed && <p className="wgErr">{tr('The shop could not be loaded. Check your connection and try again.', 'មិនអាចផ្ទុកហាងបានទេ។ សូមពិនិត្យអ៊ីនធឺណិត រួចព្យាយាមម្តងទៀត។')}</p>}
      {items && list.length === 0 && <p className="wgShopEmpty">{q ? tr('No product matches "' + q.trim() + '".', 'រកមិនឃើញទំនិញ "' + q.trim() + '" ទេ។') : tr('There are no products in the shop yet.', 'មិនទាន់មានទំនិញក្នុងហាងទេ។')}</p>}
      {items && list.length > 0 && (
        <div className="wgShopGrid">
          {list.map(x => (
            <button type="button" key={x.id} className="wgShopItem" onClick={() => onPick(x)}>
              <span className="wgShopImg" style={x.image ? { backgroundImage: `url("${x.image.replace(/"/g, '%22')}")` } : undefined}>{!x.image && <Store />}</span>
              <b>{x.name}</b>
              <small>{fmt(x.price, x.currency)}{x.original_price && x.original_price > x.price ? <del>{fmt(x.original_price, x.currency)}</del> : null}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- the sheet (new / edit) */
function GoalSheet({ goal, onClose, onSave, onDelete, shopPrices }: { goal?: Goal; onClose: () => void; onSave: (d: Draft, id?: string) => Promise<string | null>; onDelete: (id: string) => void; shopPrices?: ShopPrices }) {
  const [shown, setShown] = useState(false);
  const [cat, setCat] = useState(goal?.category || 'phone');
  const [cur, setCur] = useState<Cur>(goal?.currency || 'USD');
  const [title, setTitle] = useState(goal?.title || catName(catOf('phone')));
  const [amount, setAmount] = useState(goal ? String(goal.target) : String(defaultPrice(catOf('phone'), 'USD')));
  const [image, setImage] = useState<string | null>(goal?.image_url || null);
  const [titleTouched, setTitleTouched] = useState(!!goal);
  const [amountTouched, setAmountTouched] = useState(!!goal);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [shop, setShop] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y0: number; dy: number } | null>(null);
  const c = catOf(cat);

  useEffect(() => { const t = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true))); return () => cancelAnimationFrame(t); }, []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', k);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', k); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() { setShown(false); window.setTimeout(onClose, 340); }

  function pickCat(next: Cat) {
    if (next.k === 'custom') { setCat('custom'); if (!image) file.current?.click(); if (!titleTouched) setTitle(''); return; }
    setCat(next.k);
    if (!titleTouched) setTitle(catName(next));
    if (!amountTouched) setAmount(String(defaultPrice(next, cur)));
  }
  function pickCur(n: Cur) {
    if (n === cur) return;
    setCur(n);
    if (!amountTouched) setAmount(String(defaultPrice(c, n) || ''));
  }
  function pickProduct(p: ShopItem) {
    setCat('custom'); setCur(p.currency); setTitle(p.name.slice(0, 60)); setAmount(String(p.price)); setImage(p.image);
    setTitleTouched(true); setAmountTouched(true); setErr(''); setShop(false);
  }
  async function onFile(f?: File | null) {
    if (!f) return;
    setErr('');
    try { setImage(await compress(f)); if (cat !== 'custom' && !titleTouched) { /* keep the category name */ } } catch { setErr(tr('This picture could not be read. Try another one.', 'មិនអាចអានរូបនេះបានទេ។ សូមសាកល្បងរូបផ្សេង។')); }
  }

  const n = cur === 'KHR' ? Math.round(Number(amount)) : Math.round(Number(amount) * 100) / 100;
  const ok = Number.isFinite(n) && n > 0 && (title.trim().length > 0 || cat !== 'custom');

  async function submit() {
    if (!ok || busy) return;
    setBusy(true); setErr('');
    const e = await onSave({ title: (title.trim() || catName(c)).slice(0, 60), category: cat, image_url: image, target: n, currency: cur }, goal?.id);
    setBusy(false);
    if (e) { setErr(e); return; }
    close();
  }

  /* drag the handle down to dismiss */
  function down(e: React.PointerEvent) { drag.current = { y0: e.clientY, dy: 0 }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); if (sheet.current) sheet.current.style.transition = 'none'; }
  function move(e: React.PointerEvent) { const d = drag.current; if (!d || !sheet.current) return; d.dy = Math.max(0, e.clientY - d.y0); sheet.current.style.transform = `translateY(${d.dy}px)`; }
  function up() { const d = drag.current; drag.current = null; if (!sheet.current) return; sheet.current.style.transition = ''; sheet.current.style.transform = ''; if (d && d.dy > 110) close(); }

  const cats = [...CATS, CUSTOM];

  return createPortal(
    <div className={'wgOverlay' + (shown ? ' in' : '')} onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="wgSheet" ref={sheet} role="dialog" aria-modal="true" aria-label={goal ? tr('Edit goal', 'កែគោលដៅ') : tr('New goal', 'គោលដៅថ្មី')}>
        <div className="wgGrab" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}><i /></div>
        <button type="button" className="wgX" onClick={close} aria-label={tr('Close', 'បិទ')}><X /></button>

        {shop ? <ShopPicker onBack={() => setShop(false)} onPick={pickProduct} shopPrices={shopPrices} /> : <>
        <div className="wgPreview" style={{ '--c1': c.a, '--c2': c.b } as React.CSSProperties}>
          <div className="wgPreviewArt" key={cat + (image ? 'p' : 'c')}><Art image={image} cat={c} /></div>
          <div className="wgPreviewShade" />
          <div className="wgPreviewText"><b>{title || catName(c)}</b><small>{n > 0 ? fmt(n, cur) : '—'}</small></div>
          <div className="wgPreviewBtns">
            {image && <button type="button" className="wgGlass" onClick={() => setImage(null)} aria-label={tr('Remove picture', 'លុបរូប')}><X /></button>}
            <button type="button" className="wgGlass wide" onClick={() => file.current?.click()}><ImagePlus />{image ? tr('Change', 'ប្តូរ') : tr('Your picture', 'រូបរបស់អ្នក')}</button>
          </div>
          <input ref={file} type="file" accept="image/*" hidden onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>

        <button type="button" className="wgShopBtn" onClick={() => setShop(true)}><Store />{tr('Choose a product from the shop', 'ជ្រើសទំនិញពីហាង')}</button>

        <div className="wgCats" role="listbox" aria-label={tr('Category', 'ប្រភេទ')}>
          {cats.map((x, i) => (
            <button type="button" key={x.k} role="option" aria-selected={cat === x.k} className={'wgCat' + (cat === x.k ? ' on' : '')} style={{ '--i': i, '--c1': x.a, '--c2': x.b } as React.CSSProperties} onClick={() => pickCat(x)}>
              <span><x.Icon /></span><em>{catName(x)}</em>
            </button>
          ))}
        </div>

        <div className="wgForm">
          <input className="wgText" value={title} maxLength={60} onChange={e => { setTitle(e.target.value); setTitleTouched(true); }} placeholder={tr('Name your goal', 'ដាក់ឈ្មោះគោលដៅ')} aria-label={tr('Name', 'ឈ្មោះ')} />
          <div className="wgCurTabs" role="tablist">
            <button type="button" className={cur === 'USD' ? 'on' : ''} onClick={() => pickCur('USD')}>$ USD</button>
            <button type="button" className={cur === 'KHR' ? 'on' : ''} onClick={() => pickCur('KHR')}>៛ KHR</button>
          </div>
          <div className="wgPrice">
            <span>{cur === 'KHR' ? '៛' : '$'}</span>
            <input type="number" inputMode={cur === 'KHR' ? 'numeric' : 'decimal'} min={0} step={cur === 'KHR' ? 1000 : 0.01} value={amount} aria-label={tr('Price', 'តម្លៃ')} placeholder={cur === 'KHR' ? '0' : '0.00'} onChange={e => { setAmount(e.target.value); setAmountTouched(true); }} />
          </div>
          {err && <p className="wgErr">{err}</p>}
          <button type="button" className="wgSave" disabled={!ok || busy} onClick={submit}>{busy ? tr('Saving…', 'កំពុងរក្សាទុក…') : goal ? tr('Save', 'រក្សាទុក') : tr('Create goal', 'បង្កើតគោលដៅ')}<PartyPopper /></button>
          {goal && <button type="button" className="wgDel" onClick={() => { onDelete(goal.id); close(); }}><Trash2 />{tr('Delete goal', 'លុបគោលដៅ')}</button>}
        </div>
        </>}
      </div>
    </div>,
    document.body,
  );
}

/* ----------------------------------------------------------------- section */
export default function WalletGoals({ usd, khr, ready, shopPrices }: { usd: number; khr: number; ready: boolean; shopPrices?: ShopPrices }) {
  const { goals, save, remove } = useGoals();
  const [sheet, setSheet] = useState<null | { goal?: Goal }>(null);
  const [leaving, setLeaving] = useState<string | null>(null);

  function del(id: string) {
    window.setTimeout(() => { setLeaving(id); window.setTimeout(async () => { await remove(id); setLeaving(null); }, 380); }, 360);
  }

  if (goals === null) return <section className="wg"><div className="sectionHead"><h2><Sparkles />{tr('Goals', 'គោលដៅ')}</h2></div><div className="wgGrid"><div className="wgSkel" /><div className="wgSkel" /></div></section>;

  const canAdd = goals.length < MAX_GOALS;
  return (
    <section className="wg" aria-label={tr('Goals', 'គោលដៅ')}>
      <div className="sectionHead"><h2><Sparkles />{tr('Goals', 'គោលដៅ')}</h2></div>
      {goals.length === 0 ? (
        <AddTile big onClick={() => setSheet({})} />
      ) : (
        <div className="wgGrid">
          {goals.map((g, i) => <GoalCard key={g.id} g={g} i={i} bal={g.currency === 'KHR' ? khr : usd} ready={ready} leaving={leaving === g.id} onOpen={() => setSheet({ goal: g })} />)}
          {canAdd && <AddTile onClick={() => setSheet({})} />}
        </div>
      )}
      {sheet && <GoalSheet key={sheet.goal?.id || 'new'} goal={sheet.goal} onClose={() => setSheet(null)} onSave={save} onDelete={del} shopPrices={shopPrices} />}
    </section>
  );
}
