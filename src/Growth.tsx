/* "More sales per visit" helpers:
   - ShareButton / shareProduct : native share sheet (Telegram, Messenger, ...) with a copy-link fallback
   - RelatedProducts            : "You may also like" rail on the product page
   - RecentlyViewed / recordViewed : "Recently viewed" rail (kept on this device)
   - buyAgain                   : put every item of a past order back in the cart in one tap
   The rails get ProductCard from main.tsx as a prop (this file never imports main.tsx). */
import React, { useEffect, useState } from 'react';
import { Share2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';
import { tr, useLang } from './lang';

type CardComp = React.ComponentType<{ p: any }>;
type Prep = (rows: any[]) => Promise<any[]>;

const shuffle = <T,>(a: T[]): T[] => {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
};

/* ---------- share ---------- */
export function productLink(id: string): string {
  let base = window.location.origin;
  try {
    // inside the Android / iOS app the page origin is "localhost", so use the public web address instead
    if (Capacitor.isNativePlatform()) base = String((import.meta as any).env?.VITE_PUBLIC_URL || 'https://ynstudio.site');
  } catch { /* plain browser */ }
  return base.replace(/\/$/, '') + '/product/' + encodeURIComponent(id);
}

export async function shareProduct(p: { id: string; name: string; price?: number | string | null }): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const url = productLink(p.id);
  const title = p.name + ' · YN Studio';
  const hasPrice = p.price !== undefined && p.price !== null && p.price !== '' && Number(p.price) > 0;
  const text = hasPrice ? `${p.name} — $${Number(p.price).toFixed(2)} on YN Studio` : `${p.name} on YN Studio`;
  const n: any = navigator;
  if (typeof n.share === 'function') {
    try { await n.share({ title, text, url }); return 'shared'; }
    catch (e: any) { if (e && e.name === 'AbortError') return 'cancelled'; /* anything else: fall back to copying */ }
  }
  try { await navigator.clipboard.writeText(url); return 'copied'; } catch { /* older browser: try the textarea trick */ }
  try {
    const t = document.createElement('textarea');
    t.value = url; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    const ok = document.execCommand('copy');
    t.remove();
    return ok ? 'copied' : 'failed';
  } catch { return 'failed'; }
}

export function ShareButton({ product, onResult }: { product: { id: string; name: string; price?: number | string | null }; onResult?: (r: 'shared' | 'copied' | 'cancelled' | 'failed') => void }) {
  useLang();
  return (
    <button type="button" className="shareBtn" aria-label={tr('Share this product', 'ចែករំលែកផលិតផលនេះ')}
      onClick={async () => { const r = await shareProduct(product); onResult?.(r); }}>
      <Share2 /><span>{tr('Share', 'ចែករំលែក')}</span>
    </button>
  );
}

/* ---------- recently viewed (this device only) ---------- */
const RV_KEY = 'yn-recent-v1';
const RV_EVT = 'yn-recent-updated';
export function getRecentIds(): string[] {
  try {
    const a = JSON.parse(localStorage.getItem(RV_KEY) || '[]');
    return Array.isArray(a) ? a.filter((x: any) => typeof x === 'string').slice(0, 12) : [];
  } catch { return []; }
}
export function recordViewed(id: string) {
  if (!id) return;
  try {
    localStorage.setItem(RV_KEY, JSON.stringify([id, ...getRecentIds().filter(x => x !== id)].slice(0, 12)));
    window.dispatchEvent(new Event(RV_EVT));
  } catch { /* storage full or blocked: not important */ }
}
export function clearRecent() { try { localStorage.removeItem(RV_KEY); } catch { /* ignore */ } }

function Rail({ title, rows, Card, className = '' }: { title: string; rows: any[]; Card: CardComp; className?: string }) {
  if (!rows.length) return null;
  return (
    <section className={'growRail ' + className} aria-label={title}>
      <div className="growHead"><h2>{title}</h2></div>
      <div className="growTrack shop">{rows.map(x => <div className="growItem" key={x.id}><Card p={x} /></div>)}</div>
    </section>
  );
}

export function RecentlyViewed({ prep, excludeId }: { Card?: CardComp; prep?: Prep; excludeId?: string }) {
  useLang();
  const [ids, setIds] = useState<string[]>(getRecentIds);
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    const f = () => setIds(getRecentIds());
    window.addEventListener(RV_EVT, f);
    return () => window.removeEventListener(RV_EVT, f);
  }, []);
  const want = ids.filter(x => x !== excludeId).slice(0, 10);
  const key = want.join(',');
  useEffect(() => {
    let live = true;
    if (!want.length) { setRows([]); return; }
    (async () => {
      const { data } = await supabase.from('products').select('*').in('id', want).eq('status', 'published');
      let list: any[] = (data || []).filter((x: any) => !x.store_page);
      if (prep && list.length) list = await prep(list).catch(() => list);
      const by = new Map(list.map((x: any) => [x.id, x]));
      if (live) setRows(want.map(i => by.get(i)).filter(Boolean));
    })().catch(() => { /* offline: keep what we have */ });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!rows.length) return null;
  const title = tr('Recently viewed', 'បានមើលថ្មីៗ');
  return (
    <section className="rvTrail" aria-label={title}>
      <div className="rvHead">
        <h2>{title}</h2>
        <button type="button" className="rvClear" onClick={() => { clearRecent(); setIds([]); setRows([]); }}>{tr('Clear', 'សម្អាត')}</button>
      </div>
      <ol className="rvList">
        {rows.map((x, i) => {
          const price = Number((x.display_price ?? x.price) || 0);
          return (
            <li key={x.id} className="rvItem" style={{ ['--age' as any]: Math.min(i, 7) }}>
              <Link to={'/product/' + x.id} className="rvLink">
                <span className="rvThumb">
                  {x.main_image_url ? <img src={x.main_image_url} alt="" loading="lazy" decoding="async" /> : <img className="rvLogo" src="/yn-logo.png" alt="" />}
                </span>
                <span className="rvName">{x.name}</span>
                <span className="rvPrice">${price.toFixed(2)}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ---------- you may also like ---------- */
export function RelatedProducts({ product, Card, prep }: { product: any; Card: CardComp; prep?: Prep }) {
  useLang();
  const [rows, setRows] = useState<any[]>([]);
  const pid = product?.id as string | undefined;
  const cat = product?.category_id as string | undefined;
  useEffect(() => {
    let live = true;
    setRows([]);
    if (!pid) return;
    (async () => {
      let same: any[] = [];
      if (cat) {
        const r = await supabase.from('products').select('*').eq('status', 'published').eq('category_id', cat).neq('id', pid).limit(30);
        same = shuffle((r.data || []).filter((x: any) => !x.store_page)).slice(0, 10);
      }
      let out = same;
      if (out.length < 10) { // not enough in the same category: top up with other products
        const r2 = await supabase.from('products').select('*').eq('status', 'published').neq('id', pid).order('created_at', { ascending: false }).limit(40);
        const have = new Set(out.map(x => x.id));
        out = out.concat(shuffle((r2.data || []).filter((x: any) => !x.store_page && !have.has(x.id))).slice(0, 10 - out.length));
      }
      if (prep && out.length) out = await prep(out).catch(() => out);
      if (live) setRows(out);
    })().catch(() => { /* leave the rail empty */ });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, cat]);
  return <Rail title={tr('You may also like', 'អ្នកប្រហែលជាចូលចិត្ត')} rows={rows} Card={Card} className="growRelated" />;
}

/* ---------- buy again ---------- */
const optKey = (o: any) => JSON.stringify(Object.keys(o || {}).sort().map(k => [k, o[k]]));

/** Adds every item of an old order to the cart again. Items that were removed, unpublished or whose
    options changed are skipped and returned by name. Prices come from today's catalogue, never the old order. */
const DIRECT_KEY = 'yn-direct-rows';
/** Removes rows left over from a "Buy again" checkout that was never finished, so they never show up in the cart. */
export async function dropDirectRows() {
  try {
    const ids: string[] = JSON.parse(localStorage.getItem(DIRECT_KEY) || '[]');
    localStorage.removeItem(DIRECT_KEY);
    if (!Array.isArray(ids) || !ids.length) return;
    await supabase.from('cart_items').delete().in('id', ids);
    try {
      const sel = JSON.parse(sessionStorage.getItem('yn-checkout-items') || '[]');
      if (Array.isArray(sel)) sessionStorage.setItem('yn-checkout-items', JSON.stringify(sel.filter((x: string) => !ids.includes(x))));
    } catch { /* ignore */ }
  } catch { /* ignore */ }
}

/** direct = true: "Buy again" goes straight to payment. The items are kept apart from the customer's real cart
    (never merged into it) and returned as `ids` for checkout to use; checkout deletes them once the order is placed. */
export async function buyAgain(items: any[], opts: { direct?: boolean } = {}): Promise<{ added: number; skipped: string[]; ids: string[] }> {
  const direct = !!opts.direct;
  if (direct) await dropDirectRows();
  const user = (await supabase.auth.getUser()).data.user?.id;
  if (!user) throw new Error(tr('Please sign in first.', 'សូមចូលគណនីជាមុនសិន។'));
  const lines = (items || []).filter(i => i && i.product_id);
  if (!lines.length) return { added: 0, skipped: [], ids: [] };
  const ids = Array.from(new Set(lines.map(i => i.product_id as string)));

  const prods = (await supabase.from('products').select('id,name,price,status').in('id', ids)).data || [];
  const live = new Map<string, any>(prods.filter((p: any) => p.status === 'published').map((p: any) => [p.id, p]));
  const options = ((await supabase.from('product_options').select('id,product_id,name,sort_order').in('product_id', ids).order('sort_order')).data || []) as any[];
  const optIds = options.map(o => o.id);
  const values = optIds.length ? ((await supabase.from('product_option_values').select('option_id,value,price_adjustment').in('option_id', optIds)).data || []) as any[] : [];

  const optsOf = new Map<string, any[]>();
  options.forEach(o => { const a = optsOf.get(o.product_id) || []; a.push(o); optsOf.set(o.product_id, a); });
  const valsOf = new Map<string, any[]>();
  values.forEach(v => { const a = valsOf.get(v.option_id) || []; a.push(v); valsOf.set(v.option_id, a); });

  // the customer's cart (same way "Add to cart" finds / creates it)
  const { data: carts, error: cartErr } = await supabase.from('carts').select('id,created_at').eq('user_id', user).order('created_at', { ascending: true }).limit(1);
  if (cartErr) throw cartErr;
  let cart = carts?.[0];
  if (!cart) {
    const r = await supabase.from('carts').insert({ user_id: user }).select('id,created_at').single();
    if (r.error) throw r.error;
    cart = r.data;
  }
  const existing = ((await supabase.from('cart_items').select('id,quantity,selected_options,product_id').eq('cart_id', cart.id).in('product_id', ids)).data || []) as any[];

  let added = 0;
  const skipped: string[] = [];
  const newIds: string[] = [];
  for (const line of lines) {
    const prod = live.get(line.product_id);
    if (!prod) { skipped.push(line.product_name || tr('A product', 'ផលិតផលមួយ')); continue; }
    const pick = line.selected_options || {};
    const clean: Record<string, any> = {};
    const adj: number[] = [];
    let ok = true;
    for (const o of optsOf.get(prod.id) || []) {
      const v = (valsOf.get(o.id) || []).find(x => x.value === pick[o.name]);
      if (!v) { ok = false; break; }
      clean[o.name] = v.value;
      const a = Number(v.price_adjustment || 0);
      if (a > 0) adj.push(a);
    }
    if (!ok) { skipped.push(line.product_name || prod.name); continue; }
    const price = adj.length ? adj[adj.length - 1] : Number(prod.price || 0); // same rule as the product page
    const qty = Math.max(1, Math.floor(Number(line.quantity) || 1));
    const same = direct ? undefined : existing.find(x => x.product_id === prod.id && optKey(x.selected_options) === optKey(clean));
    if (same) {
      const r = await supabase.from('cart_items').update({ quantity: Number(same.quantity || 0) + qty, price }).eq('id', same.id);
      if (r.error) throw r.error;
      same.quantity = Number(same.quantity || 0) + qty;
    } else {
      const r = await supabase.from('cart_items').insert({ cart_id: cart.id, product_id: prod.id, quantity: qty, selected_options: clean, price }).select('id,quantity,selected_options,product_id').single();
      if (r.error) throw r.error;
      existing.push(r.data);
      newIds.push(r.data.id);
    }
    added++;
  }
  if (direct) {
    try { localStorage.setItem(DIRECT_KEY, JSON.stringify(newIds)); } catch { /* ignore */ }
  } else if (added) {
    window.dispatchEvent(new Event('yn-cart-updated'));
    window.dispatchEvent(new Event('yn-cart-badge'));
  }
  return { added, skipped, ids: newIds };
}
