/* Admin-panel motion helpers (admin side only – the customer storefront never loads any of this at runtime).
   - <CountUp n=…/>        numbers that count up (dashboard stats, order totals…)
   - useAdminMotion()      called once by AdminShell: sidebar intro on first open, button ripples, card spotlight.
   All visuals live in admin-motion.css; everything here respects "reduce motion". */
import React, { useLayoutEffect, useRef, useState } from 'react';

const reduced = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ---------------------------------------------------------------- CountUp */
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

export function CountUp({ n, ms = 900 }: { n: any; ms?: number }) {
  const text = n == null ? '—' : String(n);
  const parsed = parse(n);
  const [shown, setShown] = useState<string>(() => (parsed && !reduced() ? fmt(parsed, 0) : text));
  const from = useRef(0);

  useLayoutEffect(() => {
    const p = parse(n);
    if (!p || reduced()) { setShown(text); if (p) from.current = p.num; return; }
    const start = from.current, end = p.num, t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(fmt(p, start + (end - start) * e));
      if (k < 1) raf = requestAnimationFrame(tick);
      else { from.current = end; setShown(text); }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); };
  }, [text, ms]); // eslint-disable-line react-hooks/exhaustive-deps

  return <>{shown}</>;
}

/* ------------------------------------------------------- global admin FX */
let started = false;

const SPOT = '.admin .stat,.admin .quickGrid a,.admin .adminOrderCard,.admin .thCard,.admin .pmxTile';
const RIPPLE = '.admin button,.admin .button,.admin a.secondary';
const RIPPLE_SKIP = '.aiFloat,.aiBot,.adminLiveToast,.ynFrameWrap,.thPrev,.pmxSheetBack,.adminNav';

function startFx() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const reduce = reduced();

  /* sidebar intro – only the first time the admin opens after a page load */
  if (!reduce) {
    const root = document.documentElement;
    root.setAttribute('data-am-boot', '1');
    window.setTimeout(() => root.removeAttribute('data-am-boot'), 2400);
  }
  if (reduce) return;

  /* button ripple */
  document.addEventListener('pointerdown', (e: PointerEvent) => {
    const t = (e.target as Element | null)?.closest?.(RIPPLE) as HTMLElement | null;
    if (!t || (t as HTMLButtonElement).disabled || t.closest(RIPPLE_SKIP)) return;
    const r = t.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const size = Math.max(r.width, r.height) * 2.2;
    const dot = document.createElement('span');
    dot.className = 'amRipple';
    dot.style.cssText = `left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px;width:${size}px;height:${size}px`;
    const wasStatic = getComputedStyle(t).position === 'static';
    t.classList.add('amRH');
    if (wasStatic) t.classList.add('amRP');
    t.appendChild(dot);
    window.setTimeout(() => {
      dot.remove();
      if (!t.querySelector(':scope>.amRipple')) t.classList.remove('amRH', 'amRP');
    }, 650);
  }, { passive: true });

  /* card spotlight that follows the pointer */
  if (!window.matchMedia?.('(hover: hover)').matches) return;
  let raf = 0, el: HTMLElement | null = null, px = 0, py = 0;
  document.addEventListener('pointermove', (e: PointerEvent) => {
    const hit = (e.target as Element | null)?.closest?.(SPOT) as HTMLElement | null;
    if (!hit) return;
    el = hit; px = e.clientX; py = e.clientY;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', px - r.left + 'px');
      el.style.setProperty('--my', py - r.top + 'px');
    });
  }, { passive: true });
}

export function useAdminMotion() {
  // layout effect so the sidebar-intro flag is set before the very first paint of the admin
  useLayoutEffect(() => { startFx(); }, []);
}
