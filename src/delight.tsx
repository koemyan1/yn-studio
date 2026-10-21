/* Small "delight" effects for the customer storefront (all visuals live in delight.css).
   - <RollNumber n="$12.50"/>   money that rolls up/down to its new value instead of snapping
   - flyToCart(photo, button)   product photo shrinks and arcs into the cart icon
   - <CartBadge/>               item-count bubble on the cart icon; bounces when a photo lands
   - <AddedCheck/>              little drawn checkmark for the Add-to-cart button
   Everything is skipped when the device asks for "reduce motion". No libraries, no cost. */
import React, { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

const reduced = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ RollNumber */
type Parsed = { pre: string; num: number; dec: number; commas: boolean; post: string };

function parse(n: any): Parsed | null {
  if (typeof n !== 'number' && typeof n !== 'string') return null;
  const m = /^(\D*?)(-?\d[\d,]*(?:\.\d+)?)(\D*)$/.exec(String(n).trim());
  if (!m) return null;
  const raw = m[2];
  const num = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(num)) return null;
  const dot = raw.indexOf('.');
  return { pre: m[1], num, dec: dot < 0 ? 0 : raw.length - dot - 1, commas: raw.includes(','), post: m[3] };
}

function fmt(p: Parsed, v: number) {
  const body = p.commas
    ? v.toLocaleString('en-US', { minimumFractionDigits: p.dec, maximumFractionDigits: p.dec })
    : v.toFixed(p.dec);
  return p.pre + body + p.post;
}

/* Pass the already-formatted text, e.g. <RollNumber n={money(total)}/>.
   When the number changes it counts from the value on screen to the new one (up OR down).
   A change of currency symbol / decimals (e.g. $ -> ៛) snaps instead of rolling. */
export function RollNumber({ n, ms = 650 }: { n: any; ms?: number }) {
  const text = n == null ? '' : String(n);
  const [shown, setShown] = useState(text);
  const cur = useRef<number | null>(null);
  const kind = useRef('');
  const raf = useRef(0);

  useEffect(() => {
    const p = parse(text);
    if (!p) {
      cancelAnimationFrame(raf.current);
      cur.current = null;
      kind.current = '';
      setShown(text);
      return;
    }
    const k = p.pre + '|' + p.post + '|' + p.dec;
    const from = cur.current;
    const sameKind = kind.current === k;
    kind.current = k;
    if (from == null || !sameKind || from === p.num || reduced()) {
      cancelAnimationFrame(raf.current);
      cur.current = p.num;
      setShown(text);
      return;
    }
    cancelAnimationFrame(raf.current);
    const to = p.num;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - t, 3); // ease-out
      const v = t < 1 ? from + (to - from) * e : to;
      cur.current = v;
      setShown(fmt(p, v));
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [text, ms]);

  return <span className="rollNum" aria-label={text}>{shown}</span>;
}

/* ------------------------------------------------------------------ Cart count + badge */
let lastCount = 0; // remembered between pages so the badge does not flicker on navigation

export function useCartCount() {
  const [count, setCount] = useState(lastCount);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    let alive = true;
    let seq = 0;
    const refresh = async () => {
      const my = ++seq;
      const put = (n: number) => { if (alive && my === seq) { lastCount = n; setCount(n); } };
      try {
        const u = (await supabase.auth.getSession()).data.session?.user?.id;
        if (!u) return put(0);
        const c = await supabase.from('carts').select('id').eq('user_id', u);
        if (c.error) return;
        const ids = (c.data || []).map((x: any) => x.id);
        if (!ids.length) return put(0);
        const r = await supabase.from('cart_items').select('quantity').in('cart_id', ids);
        if (r.error) return;
        put((r.data || []).reduce((a: number, x: any) => a + Math.max(0, Number(x.quantity) || 0), 0));
      } catch { /* badge is cosmetic: ignore network errors */ }
    };
    const onBump = () => setBump(k => k + 1);
    refresh();
    window.addEventListener('yn-cart-updated', refresh);
    window.addEventListener('yn-cart-badge', refresh);
    window.addEventListener('yn-cart-bump', onBump);
    return () => {
      alive = false;
      window.removeEventListener('yn-cart-updated', refresh);
      window.removeEventListener('yn-cart-badge', refresh);
      window.removeEventListener('yn-cart-bump', onBump);
    };
  }, []);
  return [count, bump] as const;
}

export function CartBadge() {
  const [n, bump] = useCartCount();
  if (n < 1) return null;
  return (
    <b key={bump} className={'cartBadge' + (bump ? ' bump' : '')} aria-label={n + ' in cart'}>
      {n > 99 ? '99+' : n}
    </b>
  );
}

/* ------------------------------------------------------------------ Added checkmark */
export function AddedCheck() {
  return (
    <svg className="addedCheck" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
         strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/* ------------------------------------------------------------------ Fly to cart */
export type Fly = { landed: Promise<void>; cancel: () => void };

/* The picture currently shown in the product gallery (null when there is none). */
export function findProductPhoto(): HTMLImageElement | null {
  const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('.galleryViewport img'));
  return imgs.find(i => i.getBoundingClientRect().width > 40) || imgs[0] || null;
}

/* Shrinks a copy of `photo` along a curved path into the visible cart icon ([data-cart-target]).
   If the photo has been scrolled off-screen, the copy starts just above `fromBtn` instead.
   `landed` resolves when the photo arrives (or at once when nothing can be animated);
   `cancel()` fades the copy out, used if adding to the cart fails. */
export function flyToCart(photo: HTMLImageElement | null, fromBtn?: Element | null): Fly {
  const none: Fly = { landed: Promise.resolve(), cancel() {} };
  if (typeof document === 'undefined' || reduced() || !photo) return none;

  const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-cart-target]'))
    .map(a => (a.querySelector('svg') as HTMLElement | null) || a);
  const target = targets.find(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  if (!target) return none;

  let r = photo.getBoundingClientRect();
  const onScreen = r.width > 40 && r.height > 40 && r.bottom > 0 && r.top < window.innerHeight
    && r.right > 0 && r.left < window.innerWidth;
  if (!onScreen) {
    const b = fromBtn?.getBoundingClientRect();
    if (!b) return none;
    const s = 88;
    r = new DOMRect(b.left + b.width / 2 - s / 2, b.top - s - 8, s, s);
  }
  const t = target.getBoundingClientRect();
  const sx = r.left + r.width / 2, sy = r.top + r.height / 2;
  const ex = t.left + t.width / 2, ey = t.top + t.height / 2;
  const size = Math.min(r.width, r.height, 220);
  const endScale = Math.max(0.06, 22 / size);
  // control point of the curve: above both ends, so the photo lifts, then drops into the cart
  const cx = (sx + ex) / 2, cy = Math.min(sy, ey) - Math.max(90, Math.abs(ex - sx) * 0.25);

  const el = document.createElement('img');
  el.src = photo.currentSrc || photo.src;
  el.alt = '';
  el.setAttribute('aria-hidden', 'true');
  el.className = 'flyPhoto';
  el.style.left = sx - size / 2 + 'px';
  el.style.top = sy - size / 2 + 'px';
  el.style.width = size + 'px';
  el.style.height = size + 'px';
  document.body.appendChild(el);

  let raf = 0, done = false, finish = () => {};
  const landed = new Promise<void>(res => {
    finish = () => { if (done) return; done = true; cancelAnimationFrame(raf); el.remove(); res(); };
  });
  const D = 720, t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / D);
    const u = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // ease in-out
    const x = (1 - u) * (1 - u) * sx + 2 * (1 - u) * u * cx + u * u * ex;
    const y = (1 - u) * (1 - u) * sy + 2 * (1 - u) * u * cy + u * u * ey;
    const sc = 1 - (1 - endScale) * Math.pow(u, 0.8);
    el.style.transform = `translate(${x - sx}px,${y - sy}px) scale(${sc}) rotate(${-14 * u}deg)`;
    if (k < 1) raf = requestAnimationFrame(step); else finish();
  };
  raf = requestAnimationFrame(step);
  window.setTimeout(finish, D + 500); // safety net (background tabs pause animation frames)

  return {
    landed,
    cancel() {
      if (done) return;
      cancelAnimationFrame(raf);
      el.style.transition = 'opacity .18s';
      el.style.opacity = '0';
      window.setTimeout(finish, 200);
    },
  };
}
