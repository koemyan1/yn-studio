/* "Something just happened" feedback animations. Free, no libraries; visuals live in actionFx.css.
   - actionFx('removed')            centre-screen badge: ring + drawn icon + sparkles (+ light vibration)
   - actionFx('wish',{at:'pressed'}) same, but small and centred on the button that was just tapped
   - exitRow()                      the cart row the user just tapped slides out before the list refreshes
   - initActionFx()                 AUTO mode: when a toast / notice appears within seconds of a tap and says
                                    saved / added / sent / applied / removed / copied ... the right badge plays;
                                    an error message shakes instead. So most buttons get feedback with no extra code.
   Mounted once as <ActionFxHost/> in <App/>. Skipped when the device asks for "reduce motion". */
import React, { useEffect, useRef, useState } from 'react';
import { tr } from './lang';
import './actionFx.css';

export type ActionKind = 'success' | 'saved' | 'added' | 'removed' | 'sent' | 'claimed' | 'coupon' | 'copied' | 'wish' | 'unwish';
type Opts = { label?: string; at?: 'pressed' | 'center' };
type Fx = { id: number; kind: ActionKind; label: string; x: number; y: number; small: boolean };

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const EVT = 'yn-action-fx';

let pressed: Element | null = null;
let pressedAt = 0;
let lastFx = 0;
let seq = 0;

const LABEL: Record<ActionKind, [string, string]> = {
  success: ['Done', 'រួចរាល់'],
  saved: ['Saved', 'បានរក្សាទុក'],
  added: ['Added', 'បានបន្ថែម'],
  removed: ['Removed', 'បានលុប'],
  sent: ['Sent', 'បានផ្ញើ'],
  claimed: ['Received', 'បានទទួល'],
  coupon: ['Coupon applied', 'បានប្រើគូប៉ុង'],
  copied: ['Copied', 'បានចម្លង'],
  wish: ['Saved to wishlist', 'បានរក្សាទុកក្នុងចំណូលចិត្ត'],
  unwish: ['Removed from wishlist', 'បានដកចេញ'],
};

export function actionFx(kind: ActionKind, opts: Opts = {}) {
  if (typeof window === 'undefined' || reduced()) return;
  lastFx = Date.now();
  let x = window.innerWidth / 2, y = window.innerHeight * 0.45, small = false;
  if (opts.at === 'pressed' && pressed && pressed.isConnected && Date.now() - pressedAt < 8000) {
    const r = pressed.getBoundingClientRect();
    if (r.width > 0) { x = r.left + r.width / 2; y = r.top + r.height / 2; small = true; }
  }
  const label = opts.label ?? tr(LABEL[kind][0], LABEL[kind][1]);
  try { navigator.vibrate?.(kind === 'removed' || kind === 'unwish' ? 10 : [12, 30, 12]); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent<Fx>(EVT, { detail: { id: ++seq, kind, label: small ? '' : label, x, y, small } }));
}

/* The row (cart item) containing the button the user just tapped slides out. Call BEFORE the delete request. */
export function exitRow(sel = '.cartItem,.cartrow') {
  if (reduced() || !pressed || !pressed.isConnected || Date.now() - pressedAt > 8000) return;
  const el = pressed.closest(sel) as HTMLElement | null;
  if (!el || !el.animate) return;
  const a = el.animate(
    [{ opacity: 1, transform: 'translateX(0) scale(1)' }, { opacity: 0, transform: 'translateX(-70px) scale(.92)' }],
    { duration: 360, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' },
  );
  window.setTimeout(() => { try { a.cancel(); } catch { /* ignore */ } }, 2500); // if the delete failed, the row comes back
}

/* ------------------------------------------------------------------ icons (drawn with stroke-dashoffset) */
const ICON: Record<ActionKind, string[]> = {
  success: ['M5 12.5l4.6 4.6L19 7.6'],
  saved: ['M5 12.5l4.6 4.6L19 7.6'],
  added: ['M12 5v14', 'M5 12h14'],
  removed: ['M5 7h14', 'M9.5 7V5h5v2', 'M7 7l1 12h8l1-12'],
  sent: ['M4 12l16-8-6 16-2.6-6.4z'],
  claimed: ['M4 11h16v9H4z', 'M3 7h18v4H3z', 'M12 7v13', 'M12 7c-2-4.5-6-3-5 0', 'M12 7c2-4.5 6-3 5 0'],
  coupon: ['M6 18L18 6', 'M8 8h.01', 'M16 16h.01'],
  copied: ['M9 9h10v10H9z', 'M5 15V5h10'],
  wish: ['M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10z'],
  unwish: ['M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10z'],
};

export function ActionFxHost() {
  const [fx, setFx] = useState<Fx | null>(null);
  const timer = useRef(0);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<Fx>).detail;
      if (!d) return;
      setFx(d);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setFx(null), d.small ? 1050 : 1600);
    };
    window.addEventListener(EVT, on);
    return () => { window.removeEventListener(EVT, on); window.clearTimeout(timer.current); };
  }, []);
  if (!fx) return null;
  return (
    <div className={'afx afx-' + fx.kind + (fx.small ? ' afxSmall' : '')} key={fx.id} style={{ left: fx.x, top: fx.y }} role="status" aria-live="polite">
      <i className="afxGlow" />
      <i className="afxRing" />
      <i className="afxRing afxRing2" />
      {Array.from({ length: 10 }, (_, i) => <b className="afxSpark" key={i} style={{ ['--a' as any]: i * 36 + 'deg', ['--d' as any]: (i % 2 ? 62 : 82) + 'px' }} />)}
      <span className="afxBadge">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {ICON[fx.kind].map((d, i) => <path key={i} d={d} pathLength={1} style={{ ['--k' as any]: i }} />)}
        </svg>
      </span>
      {fx.label && <em className="afxLabel">{fx.label}</em>}
    </div>
  );
}

/* ------------------------------------------------------------------ AUTO mode */
const OK_RE = /(saved|added|applied|sent|received|claimed|removed|deleted|updated|copied|success|created|submitted|approved|recorded|restored|thank|ជោគជ័យ|បានរក្សាទុក|បានបន្ថែម|បានផ្ញើ|បានលុប|បានចម្លង|បានទទួល|បានអនុវត្ត|បានធ្វើបច្ចុប្បន្នភាព|បានបង្កើត)/i;
const ERR_RE = /(error|fail|invalid|please|cannot|can't|unable|not enough|insufficient|incorrect|wrong|required|denied|expired|សូម|បរាជ័យ|មិនអាច|កំហុស|មិនគ្រប់គ្រាន់|មិនត្រឹមត្រូវ)/i;
const SKIP_TEXT = /(added to cart|បានបន្ថែមទៅកន្ត្រក)/i; // fly-to-cart already celebrates this
const BUSY = '.asOverlay,.csOverlay,.payDone,.payModal,.msgBox,.scannerOverlay,.afx';

function kindOf(t: string): ActionKind {
  if (/remov|delet|បានលុប/i.test(t)) return 'removed';
  if (/copied|បានចម្លង/i.test(t)) return 'copied';
  if (/coupon|applied|គូប៉ុង|បានអនុវត្ត/i.test(t)) return 'coupon';
  if (/claimed|received|reward|បានទទួល/i.test(t)) return 'claimed';
  if (/\bsent\b|បានផ្ញើ/i.test(t)) return 'sent';
  if (/added|បានបន្ថែម/i.test(t)) return 'added';
  if (/saved|updated|បានរក្សាទុក|បានធ្វើបច្ចុប្បន្នភាព/i.test(t)) return 'saved';
  return 'success';
}

function shake(el: HTMLElement) {
  if (!el.animate) return;
  try {
    el.animate(
      [{ translate: '0' }, { translate: '-9px' }, { translate: '8px' }, { translate: '-5px' }, { translate: '3px' }, { translate: '0' }] as any,
      { duration: 480, easing: 'ease-out' },
    );
  } catch { /* ignore */ }
}

let started = false;
export function initActionFx() {
  if (started || typeof window === 'undefined' || typeof document === 'undefined') return;
  started = true;
  if (reduced()) return;

  let lastTouch = 0, path = location.pathname, pathAt = Date.now();
  const touch = (e: Event) => {
    lastTouch = Date.now();
    if (e.type === 'pointerdown') { pressed = e.target as Element | null; pressedAt = lastTouch; }
  };
  window.addEventListener('pointerdown', touch, { capture: true, passive: true });
  window.addEventListener('keydown', touch, { capture: true, passive: true });

  const seen = new WeakMap<Element, string>();
  const check = (el: HTMLElement) => {
    const text = (el.textContent || '').trim();
    if (!text || text.length > 240 || seen.get(el) === text) return;
    seen.set(el, text);
    const now = Date.now();
    if (location.pathname !== path) { path = location.pathname; pathAt = now; }
    if (now - pathAt < 1500) return;          // page just opened: static notices don't count
    if (now - lastTouch > 7000) return;       // nobody tapped anything: not a reaction to an action
    const cls = el.className && typeof el.className === 'string' ? el.className : '';
    const bad = /\b(err|error|danger|bad|warn)/i.test(cls) || (!/\b(ok|success|good)\b/i.test(cls) && ERR_RE.test(text) && !OK_RE.test(text));
    if (bad) { shake(el); return; }
    if (!OK_RE.test(text) && !/\b(ok|success|good)\b/i.test(cls)) return;
    if (SKIP_TEXT.test(text)) return;
    window.setTimeout(() => {                 // let admin / payment scenes claim the screen first
      if (document.querySelector(BUSY) || Date.now() - lastFx < 1300) return;
      actionFx(kindOf(text), { at: 'center' });
    }, 90);
  };

  const target = (n: Node): HTMLElement | null => {
    const e = n.nodeType === 1 ? (n as Element) : n.parentElement;
    return e ? (e.closest('.toast,.notice,.ynToast') as HTMLElement | null) : null;
  };
  new MutationObserver((list) => {
    const hit = new Set<HTMLElement>();
    list.forEach((m) => {
      if (m.type === 'characterData') { const t = target(m.target); if (t) hit.add(t); return; }
      m.addedNodes.forEach((n) => {
        const t = target(n);
        if (t) hit.add(t);
        else if (n.nodeType === 1) (n as Element).querySelectorAll?.('.toast,.notice,.ynToast').forEach((x) => hit.add(x as HTMLElement));
      });
    });
    hit.forEach(check);
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}
