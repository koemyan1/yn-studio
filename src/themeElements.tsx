import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toggleLang, setLang } from './lang';
import { randomHex } from './imageTools';
import { bumpSeed, getDarkPref, isPreviewFrame, queueHomeAction, setDarkPref, setLiveBg } from './themeLive';

/* ------------------------------------------------------------------ *
 *  Theme elements – buttons, text and pictures that float on top of the store.
 *  Each element can: do something when tapped (action), move (animation),
 *  and be dragged / resized right inside the Studio preview.
 * ------------------------------------------------------------------ */

export type ActionType =
  | 'none' | 'page' | 'url' | 'category' | 'product' | 'search' | 'language' | 'dark'
  | 'randomBg' | 'resetBg' | 'shuffleColors' | 'confetti' | 'scrollTop' | 'call' | 'telegram' | 'message';
export type AnimType = 'none' | 'float' | 'pulse' | 'spin' | 'wiggle' | 'jump' | 'wander' | 'dvd' | 'cross' | 'crossBack' | 'fall' | 'orbit';
export type ElementType = 'button' | 'text' | 'image';
export type Variant = 'solid' | 'gradient' | 'outline' | 'glass' | 'image' | 'plain';

export type ElAction = { type: ActionType; value: string; newTab: boolean };
export type ThemeEl = {
  v: 2; id: string; type: ElementType; name: string;
  text: string; image: string; icon: string;
  x: number; y: number; w: number; h: number; rotate: number; opacity: number; z: number;
  variant: Variant; color: string; background: string; gradientTo: string; angle: number;
  radius: number; fontSize: number; fontWeight: number; borderColor: string; borderWidth: number;
  shadow: 'none' | 'soft' | 'medium' | 'strong' | 'glow';
  fit: 'cover' | 'contain'; imageMode: 'background' | 'icon'; imageSize: number;
  hover: 'none' | 'lift' | 'grow' | 'glow';
  action: ElAction; anim: { type: AnimType; speed: number }; pages: string[];
};

export const ELEMENT_PAGES: { key: string; label: string }[] = [
  { key: 'home', label: 'Home' }, { key: 'products', label: 'Product page' }, { key: 'wishlist', label: 'Wishlist' },
  { key: 'cart', label: 'Cart' }, { key: 'checkout', label: 'Checkout' }, { key: 'orders', label: 'Orders' },
  { key: 'wallet', label: 'Wallet' }, { key: 'profile', label: 'Profile' }, { key: 'support', label: 'Customer service' },
];

export const STORE_PAGES: { path: string; label: string }[] = [
  { path: '/', label: 'Home' }, { path: '/cart', label: 'Cart' }, { path: '/wishlist', label: 'Wishlist' },
  { path: '/orders', label: 'Orders' }, { path: '/wallet', label: 'Wallet' }, { path: '/profile', label: 'Profile' },
  { path: '/rewards', label: 'Rewards' }, { path: '/notifications', label: 'Notifications' }, { path: '/support', label: 'Customer service' },
];

export type ActionNeeds = 'none' | 'page' | 'url' | 'category' | 'product' | 'text' | 'phone' | 'handle' | 'lang' | 'dark';
export const ACTION_TYPES: { type: ActionType; label: string; group: string; needs: ActionNeeds }[] = [
  { type: 'none', label: 'Nothing (decoration only)', group: 'Basic', needs: 'none' },
  { type: 'page', label: 'Open a page of the store', group: 'Go to', needs: 'page' },
  { type: 'category', label: 'Show a category on Home', group: 'Go to', needs: 'category' },
  { type: 'product', label: 'Open one product', group: 'Go to', needs: 'product' },
  { type: 'search', label: 'Search for a word', group: 'Go to', needs: 'text' },
  { type: 'url', label: 'Open a web link', group: 'Go to', needs: 'url' },
  { type: 'call', label: 'Call a phone number', group: 'Contact', needs: 'phone' },
  { type: 'telegram', label: 'Open Telegram chat', group: 'Contact', needs: 'handle' },
  { type: 'language', label: 'Change language (Khmer / English)', group: 'Change the store', needs: 'lang' },
  { type: 'dark', label: 'Dark / light mode', group: 'Change the store', needs: 'dark' },
  { type: 'randomBg', label: 'Random background colour', group: 'Change the store', needs: 'none' },
  { type: 'resetBg', label: 'Reset background colour', group: 'Change the store', needs: 'none' },
  { type: 'shuffleColors', label: 'Shuffle product picture colours', group: 'Change the store', needs: 'none' },
  { type: 'confetti', label: 'Confetti burst 🎉', group: 'Fun', needs: 'none' },
  { type: 'message', label: 'Show a pop-up message', group: 'Fun', needs: 'text' },
  { type: 'scrollTop', label: 'Scroll to the top', group: 'Fun', needs: 'none' },
];

export const ANIM_TYPES: { type: AnimType; label: string; hint: string }[] = [
  { type: 'none', label: 'Still', hint: 'Stays where you put it.' },
  { type: 'float', label: 'Float', hint: 'Gently bobs up and down.' },
  { type: 'pulse', label: 'Pulse', hint: 'Grows and shrinks.' },
  { type: 'wiggle', label: 'Wiggle', hint: 'Shakes side to side.' },
  { type: 'jump', label: 'Jump', hint: 'Hops up and down.' },
  { type: 'spin', label: 'Spin', hint: 'Turns around and around.' },
  { type: 'wander', label: 'Fly around the screen', hint: 'Drifts to random places all over the screen.' },
  { type: 'dvd', label: 'Bounce off the edges', hint: 'Zooms around and bounces off the screen edges.' },
  { type: 'cross', label: 'Sweep across →', hint: 'Travels left to right, again and again.' },
  { type: 'crossBack', label: 'Sweep across ←', hint: 'Travels right to left, again and again.' },
  { type: 'fall', label: 'Fall down', hint: 'Drifts from the top to the bottom, like confetti.' },
  { type: 'orbit', label: 'Orbit in a circle', hint: 'Circles around where you placed it.' },
];
const CSS_ANIMS = new Set<AnimType>(['float', 'pulse', 'spin', 'wiggle', 'jump']);
const JS_ANIMS = new Set<AnimType>(['wander', 'dvd', 'cross', 'crossBack', 'fall', 'orbit']);

const num = (v: any, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: any, d: string) => (typeof v === 'string' ? v : d);
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const newId = () => (globalThis.crypto && 'randomUUID' in globalThis.crypto ? globalThis.crypto.randomUUID() : 'el-' + Math.random().toString(36).slice(2));

export function blankElement(type: ElementType, o: Partial<ThemeEl> = {}, z = 1): ThemeEl {
  const base: ThemeEl = {
    v: 2, id: newId(), type, name: '', text: '', image: '', icon: '',
    x: 30, y: 40, w: 150, h: 0, rotate: 0, opacity: 100, z,
    variant: 'plain', color: '#241b35', background: 'transparent', gradientTo: '#ec4899', angle: 135,
    radius: 12, fontSize: 22, fontWeight: 700, borderColor: '#ffffff', borderWidth: 0, shadow: 'none',
    fit: 'contain', imageMode: 'background', imageSize: 28, hover: 'none',
    action: { type: 'none', value: '', newTab: true }, anim: { type: 'none', speed: 5 }, pages: [],
  };
  if (type === 'button') Object.assign(base, {
    text: 'Tap me', variant: 'gradient', background: '#7c3aed', gradientTo: '#ec4899', color: '#ffffff',
    radius: 999, fontSize: 16, fontWeight: 800, w: 150, h: 48, shadow: 'medium', hover: 'lift', x: 32, y: 78,
    action: { type: 'confetti', value: '', newTab: true },
  });
  if (type === 'text') Object.assign(base, { text: 'Your custom text', w: 220, h: 0, fontSize: 24, x: 10, y: 30 });
  if (type === 'image') Object.assign(base, { w: 140, h: 0, radius: 16, fit: 'contain', x: 55, y: 40 });
  return { ...base, ...o };
}

/** Accepts anything saved earlier (including the first generation of text/image elements). */
export function normalizeElement(raw: any, index = 0): ThemeEl {
  const r = raw || {};
  const type: ElementType = r.type === 'button' ? 'button' : r.type === 'image' ? 'image' : 'text';
  if (r.v === 2) {
    const b = blankElement(type, {}, index + 1);
    const el: ThemeEl = { ...b, ...r, action: { ...b.action, ...(r.action || {}) }, anim: { ...b.anim, ...(r.anim || {}) }, pages: Array.isArray(r.pages) ? r.pages : [] };
    el.anim.speed = clamp(num(el.anim.speed, 5), 1, 10);
    return el;
  }
  // legacy: x/y/w in %, h = min-height px, background = css colour
  const legacyW = num(r.w, 42);
  const hasBg = typeof r.background === 'string' && r.background && r.background !== 'transparent';
  return blankElement(type, {
    id: str(r.id, newId()), text: str(r.text, ''), image: str(r.image, ''),
    x: num(r.x, 8), y: num(r.y, 12), w: Math.round((legacyW / 100) * 390), h: type === 'image' ? 0 : 0,
    color: str(r.color, '#241b35'), background: hasBg ? r.background : 'transparent', variant: hasBg ? 'solid' : 'plain',
    radius: num(r.radius, 12), fontSize: num(r.fontSize, 22), z: num(r.z, index + 1),
  }, index + 1);
}

/* ------------------------------ tiny helpers ------------------------------ */

export function safeUrl(u: string): string {
  const v = (u || '').trim();
  if (!v) return '';
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(v)) return 'https://' + v;
  return '';
}

export function showToast(text: string) {
  if (typeof document === 'undefined' || !text) return;
  const t = document.createElement('div');
  t.className = 'ynToast'; t.setAttribute('role', 'status'); t.textContent = text;
  document.body.appendChild(t);
  window.setTimeout(() => t.classList.add('out'), 2300);
  window.setTimeout(() => t.remove(), 2800);
}

export function confetti(x = window.innerWidth / 2, y = window.innerHeight * 0.7) {
  const box = document.createElement('div'); box.className = 'ynConfetti';
  const bits = ['🎉', '✨', '💖', '⭐', '🎈', '💜', '🌸'], colors = ['#ff5d8f', '#ffd23f', '#2ec4b6', '#3a86ff', '#8338ec', '#ff9f1c'];
  for (let i = 0; i < 42; i++) {
    const s = document.createElement('span');
    const emoji = i % 3 === 0;
    s.textContent = emoji ? bits[i % bits.length] : '';
    s.style.left = x + 'px'; s.style.top = y + 'px';
    if (!emoji) { s.style.background = colors[i % colors.length]; s.className = 'bit'; }
    const ang = Math.random() * Math.PI * 2, dist = 90 + Math.random() * 230;
    s.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
    s.style.setProperty('--dy', Math.sin(ang) * dist - 140 + 'px');
    s.style.setProperty('--rot', Math.round(Math.random() * 720 - 360) + 'deg');
    s.style.animationDelay = Math.random() * 90 + 'ms';
    box.appendChild(s);
  }
  document.body.appendChild(box);
  window.setTimeout(() => box.remove(), 1800);
}

export function runAction(a: ElAction, navigate: (to: string) => void, at?: { x: number; y: number }) {
  const v = (a.value || '').trim();
  switch (a.type) {
    case 'page': navigate(v || '/'); break;
    case 'category': navigate('/'); queueHomeAction({ category: v }); break;
    case 'search': navigate('/'); queueHomeAction({ search: v }); break;
    case 'product': if (v) navigate('/product/' + v); break;
    case 'url': { const u = safeUrl(v); if (!u) break; if (a.newTab === false) window.location.href = u; else window.open(u, '_blank', 'noopener,noreferrer'); break; }
    case 'call': { const d = v.replace(/[^\d+]/g, ''); if (d) window.location.href = 'tel:' + d; break; }
    case 'telegram': { const h = v.replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '').replace(/[^\w]/g, ''); if (h) window.open('https://t.me/' + h, '_blank', 'noopener,noreferrer'); break; }
    case 'language': if (v === 'en' || v === 'km') setLang(v); else toggleLang(); break;
    case 'dark': {
      const cur = getDarkPref();
      if (v === 'on') setDarkPref('1'); else if (v === 'off') setDarkPref('0');
      else setDarkPref(cur === '1' || (cur === '' && document.documentElement.getAttribute('data-yn-dark') === '1') ? '0' : '1');
      break;
    }
    case 'randomBg': setLiveBg(randomHex()); break;
    case 'resetBg': setLiveBg(''); break;
    case 'shuffleColors': bumpSeed(); break;
    case 'confetti': confetti(at?.x, at?.y); break;
    case 'message': showToast(v); break;
    case 'scrollTop': window.scrollTo({ top: 0, behavior: 'smooth' }); break;
    default: break;
  }
}

/* ------------------------------ looks ------------------------------ */

function shadowOf(el: ThemeEl): string {
  switch (el.shadow) {
    case 'soft': return '0 6px 18px rgba(30,20,50,.20)';
    case 'medium': return '0 12px 30px rgba(30,20,50,.30)';
    case 'strong': return '0 18px 46px rgba(30,20,50,.45)';
    case 'glow': return `0 0 24px ${el.background && el.background !== 'transparent' ? el.background : '#a78bfa'}`;
    default: return 'none';
  }
}

export function elementStyle(el: ThemeEl): React.CSSProperties {
  const s: React.CSSProperties = {
    color: el.color, borderRadius: el.radius, fontSize: el.fontSize, fontWeight: el.fontWeight, boxShadow: shadowOf(el),
  };
  const bw = el.borderWidth;
  if (bw > 0) s.border = `${bw}px solid ${el.borderColor}`;
  switch (el.variant) {
    case 'solid': s.background = el.background; break;
    case 'gradient': s.background = `linear-gradient(${el.angle}deg,${el.background},${el.gradientTo})`; break;
    case 'outline': s.background = 'transparent'; s.border = `${Math.max(2, bw)}px solid ${el.borderColor === '#ffffff' ? el.color : el.borderColor}`; break;
    case 'glass': s.background = 'rgba(255,255,255,.18)'; s.backdropFilter = 'blur(12px)'; (s as any).WebkitBackdropFilter = 'blur(12px)'; s.border = '1px solid rgba(255,255,255,.4)'; break;
    case 'image': if (el.image) { s.backgroundImage = `url("${el.image.replace(/"/g, '%22')}")`; s.backgroundSize = el.fit; s.backgroundPosition = 'center'; s.backgroundRepeat = 'no-repeat'; } break;
    default: break;
  }
  return s;
}

const iconNode = (el: ThemeEl) => (
  <>
    {el.imageMode === 'icon' && el.image ? <img className="ynElIcon" src={el.image} alt="" style={{ width: el.imageSize, height: el.imageSize }} draggable={false} /> : null}
    {el.icon ? <span className="ynElEmoji" aria-hidden="true">{el.icon}</span> : null}
  </>
);

/* ------------------------------ motion ------------------------------ */

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function useMotion(ref: React.RefObject<HTMLDivElement | null>, type: AnimType, speedIn: number, enabled: boolean, sig: string) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.transition = ''; node.style.transform = '';
    if (!enabled || !JS_ANIMS.has(type)) return;
    if (!isPreviewFrame() && reducedMotion()) return;
    const speed = clamp(speedIn, 1, 10);
    let alive = true, raf = 0, timer = 0;
    const r = node.getBoundingClientRect();
    const m = { left: r.left, top: r.top, w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight };
    const minX = -m.left, maxX = Math.max(minX, m.vw - m.left - m.w), minY = -m.top, maxY = Math.max(minY, m.vh - m.top - m.h);

    if (type === 'wander') {
      let cx = 0, cy = 0;
      const go = () => {
        if (!alive) return;
        const tx = rand(minX, maxX), ty = rand(minY, maxY), d = Math.hypot(tx - cx, ty - cy);
        const dur = clamp(d / (speed * 55), 1.2, 9);
        node.style.transition = `transform ${dur}s cubic-bezier(.45,.05,.55,.95)`;
        node.style.transform = `translate3d(${tx}px,${ty}px,0) rotate(${rand(-14, 14)}deg)`;
        cx = tx; cy = ty;
        timer = window.setTimeout(go, dur * 1000);
      };
      timer = window.setTimeout(go, 150);
    } else {
      let x = 0, y = 0, t = 0, last = performance.now();
      let vx = speed * 45 * (Math.random() < 0.5 ? -1 : 1), vy = speed * 38 * (Math.random() < 0.5 ? -1 : 1);
      if (type === 'cross') x = minX - m.w; if (type === 'crossBack') x = maxX + m.w; if (type === 'fall') y = minY - m.h;
      const R = 50 + speed * 10;
      const loop = (now: number) => {
        if (!alive) return;
        const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
        let ty = 0, rot = 0;
        if (type === 'dvd') {
          x += vx * dt; y += vy * dt;
          if (x < minX) { x = minX; vx = Math.abs(vx); } else if (x > maxX) { x = maxX; vx = -Math.abs(vx); }
          if (y < minY) { y = minY; vy = Math.abs(vy); } else if (y > maxY) { y = maxY; vy = -Math.abs(vy); }
        } else if (type === 'cross') { x += speed * 60 * dt; if (x > maxX + m.w) x = minX - m.w; ty = Math.sin(t * 2) * 8; }
        else if (type === 'crossBack') { x -= speed * 60 * dt; if (x < minX - m.w) x = maxX + m.w; ty = Math.sin(t * 2) * 8; }
        else if (type === 'fall') { y += speed * 55 * dt; if (y > maxY + m.h) y = minY - m.h; x = Math.sin(t * 1.6) * 22; rot = Math.sin(t * 2) * 18; }
        else if (type === 'orbit') { const a = t * (0.4 + speed * 0.25); x = R * (Math.cos(a) - 1); y = R * Math.sin(a); }
        node.style.transform = `translate3d(${x}px,${y + ty}px,0) rotate(${rot}deg)`;
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    return () => { alive = false; cancelAnimationFrame(raf); window.clearTimeout(timer); node.style.transition = ''; node.style.transform = ''; };
  }, [ref, type, speedIn, enabled, sig]);
}

/* ------------------------------ one element ------------------------------ */

type ViewProps = {
  el: ThemeEl; edit: boolean; animate: boolean; selected: boolean; offPage: boolean;
  onMoveStart: (e: React.PointerEvent, el: ThemeEl) => void;
  onResizeStart: (e: React.PointerEvent, el: ThemeEl) => void;
  onActivate: (e: React.MouseEvent, el: ThemeEl) => void;
};

function ElementView({ el, edit, animate, selected, offPage, onMoveStart, onResizeStart, onActivate }: ViewProps) {
  const animRef = useRef<HTMLDivElement | null>(null);
  const sig = `${el.x}|${el.y}|${el.w}|${el.h}|${el.fontSize}|${el.text}`;
  useMotion(animRef, el.anim.type, el.anim.speed, animate && !edit, sig);
  const cssAnim = !edit && animate && CSS_ANIMS.has(el.anim.type) && (isPreviewFrame() || !reducedMotion());
  const interactive = el.action.type !== 'none';
  const fill = el.h > 0;
  const st = elementStyle(el);
  const common: React.CSSProperties = { ...st, width: '100%', height: fill ? '100%' : 'auto', pointerEvents: 'none' };

  let body: React.ReactNode;
  if (el.type === 'button') {
    body = (
      <button type="button" className={`ynBtn ynHover-${el.hover}`} style={{ ...common, pointerEvents: edit ? 'none' : 'auto' }} tabIndex={edit ? -1 : 0}
        onClick={e => onActivate(e, el)}>
        {iconNode(el)}<span className="ynElText">{el.text}</span>
      </button>
    );
  } else if (el.type === 'image') {
    body = el.image
      ? <img className={`ynPic ynHover-${el.hover}`} src={el.image} alt="" draggable={false} onClick={e => onActivate(e as any, el)}
          style={{ ...common, objectFit: el.fit, pointerEvents: !edit && interactive ? 'auto' : 'none', cursor: interactive ? 'pointer' : 'default' }} />
      : <div className="ynPic ynPicEmpty" style={{ ...common, background: 'rgba(124,58,237,.12)', border: '2px dashed #7c3aed88', minHeight: 80 }}>🖼️</div>;
  } else {
    body = (
      <div className={`ynTextEl ynHover-${el.hover}`} style={{ ...common, padding: el.variant === 'plain' ? 0 : '10px 14px', pointerEvents: !edit && interactive ? 'auto' : 'none', cursor: interactive ? 'pointer' : 'default' }}
        onClick={e => onActivate(e, el)}>
        {iconNode(el)}<span className="ynElText">{el.text}</span>
      </div>
    );
  }

  const outer: React.CSSProperties = {
    position: 'absolute', left: el.x + '%', top: el.y + '%', width: el.w, height: fill ? el.h : 'auto',
    zIndex: el.z, transform: el.rotate ? `rotate(${el.rotate}deg)` : undefined, opacity: (offPage ? 0.35 : 1) * el.opacity / 100,
    pointerEvents: edit ? 'auto' : 'none', touchAction: edit ? 'none' : undefined, cursor: edit ? 'move' : undefined,
  };
  return (
    <div className={'ynEl' + (selected ? ' ynElSel' : '') + (edit ? ' ynElEdit' : '')} style={outer} data-el={el.id}
      onPointerDown={edit ? e => onMoveStart(e, el) : undefined}>
      <div ref={animRef} className={'ynAnim' + (cssAnim ? ' ynA-' + el.anim.type : '')}
        style={cssAnim ? { animationDuration: (({ float: 3.2, pulse: 1.6, spin: 6, wiggle: 0.8, jump: 1.1 } as Record<string, number>)[el.anim.type] || 2) * (6 / el.anim.speed) + 's' } : undefined}>
        {body}
      </div>
      {edit && selected ? <span className="ynHandle" onPointerDown={e => onResizeStart(e, el)} title="Drag to resize" /> : null}
    </div>
  );
}

/* ------------------------------ overlay ------------------------------ */

export type OverlayMode = 'live' | 'parts' | 'elements' | 'try' | 'mascots';
type OverlayProps = {
  elements: ThemeEl[]; pageKey: string; mode: OverlayMode; selectedId: string;
  onSelect?: (id: string) => void; onPatch?: (id: string, patch: Partial<ThemeEl>) => void;
};

export function ThemeOverlay({ elements, pageKey, mode, selectedId, onSelect, onPatch }: OverlayProps) {
  const navigate = useNavigate();
  const edit = mode === 'elements';
  const animate = mode === 'live' || mode === 'try';
  const [drag, setDrag] = useState<Record<string, Partial<ThemeEl>>>({});
  const pending = useRef<Record<string, Partial<ThemeEl>>>({});
  const raf = useRef(0);

  const flush = () => {
    raf.current = 0;
    const p = pending.current; pending.current = {};
    for (const id of Object.keys(p)) onPatch?.(id, p[id]);
  };
  const queuePatch = (id: string, patch: Partial<ThemeEl>) => {
    pending.current[id] = { ...(pending.current[id] || {}), ...patch };
    setDrag(d => ({ ...d, [id]: { ...(d[id] || {}), ...patch } }));
    if (!raf.current) raf.current = requestAnimationFrame(flush);
  };
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  const track = (e: React.PointerEvent, el: ThemeEl, kind: 'move' | 'resize') => {
    e.preventDefault(); e.stopPropagation();
    onSelect?.(el.id);
    const target = e.currentTarget as HTMLElement;
    try { target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const sx = e.clientX, sy = e.clientY, ox = el.x, oy = el.y, ow = el.w;
    const oh = el.h > 0 ? el.h : ((document.querySelector(`[data-el="${el.id}"]`) as HTMLElement | null)?.getBoundingClientRect().height || 60);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (kind === 'move') queuePatch(el.id, { x: Math.round(clamp(ox + (dx / window.innerWidth) * 100, -30, 105) * 10) / 10, y: Math.round(clamp(oy + (dy / window.innerHeight) * 100, -20, 105) * 10) / 10 });
      else queuePatch(el.id, { w: Math.round(clamp(ow + dx, 24, 900)), h: Math.round(clamp(oh + dy, 20, 900)) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      if (raf.current) { cancelAnimationFrame(raf.current); flush(); }
      window.setTimeout(() => setDrag({}), 450);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };

  const activate = (e: React.MouseEvent, el: ThemeEl) => {
    if (edit) return;
    e.stopPropagation();
    runAction(el.action, navigate, { x: e.clientX, y: e.clientY });
  };

  const visible = elements.filter(e => edit || !e.pages.length || e.pages.includes(pageKey));
  if (!visible.length) return null;
  return (
    <div className={'secretThemeOverlay ynOverlay' + (edit ? ' ynOverlayEdit' : '')}>
      {visible.map(raw => {
        const el = drag[raw.id] ? { ...raw, ...drag[raw.id] } : raw;
        return (
          <ElementView key={raw.id} el={el} edit={edit} animate={animate} selected={raw.id === selectedId} offPage={raw.pages.length > 0 && !raw.pages.includes(pageKey)}
            onMoveStart={(e, x) => track(e, x, 'move')} onResizeStart={(e, x) => track(e, x, 'resize')} onActivate={activate} />
        );
      })}
    </div>
  );
}
