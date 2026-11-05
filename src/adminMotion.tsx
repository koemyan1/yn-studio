/* Admin-panel motion helpers (admin side only – the customer storefront never loads any of this at runtime).
   - <CountUp n=…/>        numbers that count up (dashboard stats, order totals…)
   - useAdminMotion()      called by AdminShell: sidebar intro on first open, button ripples, card spotlight,
                           sliding sidebar indicator, 3D card tilt, magnetic buttons, cursor glow.
   - themeWipe()           light/dark switch that spreads out from the button that was tapped.
   All visuals live in admin-motion.css; everything here respects "reduce motion". */
import React, { useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

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

/* ---------------------------------------------- aurora layer (pointer FX) */
const TILT = '.admin .stat,.admin .quickGrid a,.admin .thCard,.admin .pmxTile';
const MAGNET = '.admin .adminTopActions>*,.admin .welcome .button';

function startAurora() {
  if (typeof window === 'undefined' || reduced()) return;
  if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return;

  /* soft light that follows the pointer (only shown while an admin page is open – see admin-aurora.css) */
  const glow = document.createElement('div');
  glow.className = 'amCursor';
  glow.setAttribute('aria-hidden', 'true');
  document.body.appendChild(glow);

  let raf = 0, x = 0, y = 0, tx: EventTarget | null = null;
  let tilted: HTMLElement | null = null, pulled: HTMLElement | null = null;

  const release = (el: HTMLElement | null, ...props: string[]) => { if (el) props.forEach(p => el.style.removeProperty(p)); };

  const frame = () => {
    raf = 0;
    glow.style.transform = `translate3d(${x}px,${y}px,0)`;
    const t = tx as Element | null;

    /* 3D tilt towards the pointer */
    const card = (t?.closest?.(TILT) as HTMLElement | null) || null;
    if (tilted && tilted !== card) release(tilted, '--rx', '--ry');
    tilted = card;
    if (card) {
      const r = card.getBoundingClientRect();
      if (r.width && r.height) {
        card.style.setProperty('--rx', ((0.5 - (y - r.top) / r.height) * 8).toFixed(2) + 'deg');
        card.style.setProperty('--ry', (((x - r.left) / r.width - 0.5) * 10).toFixed(2) + 'deg');
      }
    }

    /* magnetic pull on the main action buttons */
    const mag = (t?.closest?.(MAGNET) as HTMLElement | null) || null;
    if (pulled && pulled !== mag) release(pulled, '--tx', '--ty');
    pulled = mag;
    if (mag) {
      const r = mag.getBoundingClientRect();
      mag.style.setProperty('--tx', ((x - (r.left + r.width / 2)) * 0.22).toFixed(1) + 'px');
      mag.style.setProperty('--ty', ((y - (r.top + r.height / 2)) * 0.3).toFixed(1) + 'px');
    }
  };

  document.addEventListener('pointermove', (e: PointerEvent) => {
    x = e.clientX; y = e.clientY; tx = e.target;
    if (!raf) raf = requestAnimationFrame(frame);
  }, { passive: true });

  document.documentElement.addEventListener('pointerleave', () => {
    release(tilted, '--rx', '--ry'); release(pulled, '--tx', '--ty'); tilted = pulled = null;
  });
}

/* ------------------------------------------------ sidebar sliding pill */
/* AdminShell is mounted again on every admin page, so the last pill position and the sidebar scroll are
   remembered here: the pill starts where it was and glides to the new link instead of popping in. */
let pillY = -1, pillH = 0, navScroll = 0;

function syncNav(): (() => void) | void {
  const nav = document.querySelector<HTMLElement>('.admin .adminNav');
  if (!nav) return;
  nav.scrollTop = navScroll;
  const onScroll = () => { navScroll = nav.scrollTop; };
  nav.addEventListener('scroll', onScroll, { passive: true });

  const place = (animate: boolean) => {
    const a = nav.querySelector<HTMLElement>('a.active');
    if (!a) { nav.style.setProperty('--ind-o', '0'); return; }
    const y = a.offsetTop, h = a.offsetHeight;
    const fromY = animate && pillY >= 0 ? pillY : y, fromH = animate && pillY >= 0 ? pillH : h;
    nav.style.setProperty('--ind-t', '0s');
    nav.style.setProperty('--ind-y', fromY + 'px');
    nav.style.setProperty('--ind-h', fromH + 'px');
    nav.style.setProperty('--ind-o', '1');
    void nav.offsetHeight; // commit the start position, then let the transition run
    nav.style.removeProperty('--ind-t');
    nav.style.setProperty('--ind-y', y + 'px');
    nav.style.setProperty('--ind-h', h + 'px');
    pillY = y; pillH = h;
  };
  place(!reduced());
  const onResize = () => place(false);
  window.addEventListener('resize', onResize, { passive: true });
  return () => { nav.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onResize); };
}

/* ------------------------------------------- light / dark circular wipe */
export function themeWipe(apply: () => void, ev?: { currentTarget?: any }) {
  const doc: any = typeof document !== 'undefined' ? document : null;
  if (!doc || reduced() || typeof doc.startViewTransition !== 'function') { apply(); return; }
  const r = (ev?.currentTarget as HTMLElement | undefined)?.getBoundingClientRect?.();
  const x = r ? r.left + r.width / 2 : window.innerWidth / 2;
  const y = r ? r.top + r.height / 2 : 0;
  const root = document.documentElement;
  root.style.setProperty('--wipe-x', x + 'px');
  root.style.setProperty('--wipe-y', y + 'px');
  root.style.setProperty('--wipe-r', Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 'px');
  root.classList.add('am-wipe');
  const done = () => root.classList.remove('am-wipe');
  try {
    const vt = doc.startViewTransition(() => { flushSync(apply); });
    vt.finished.then(done, done);
  } catch { done(); apply(); }
}

function startFx() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const reduce = reduced();
  startAurora();

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
  // every admin page mounts its own shell, so the sidebar pill is placed again each time
  useLayoutEffect(() => syncNav(), []);
}
