import React, { useEffect, useRef, useState } from 'react';
import { MASCOT_GROUPS, type MascotGroup, type MascotPos } from './chiikawaMascots';

/* ------------------------------------------------------------------ *
 *  Preview-only layer: draws a dashed, draggable box over every Chiikawa mascot
 *  so the admin can grab a picture and drop it anywhere. The real mascots are CSS
 *  pictures (pseudo-elements), so each box is placed by measuring the element it
 *  belongs to; dragging only changes the group's x/y offset in the theme.
 * ------------------------------------------------------------------ */

type Box = { left: number; top: number; width: number; height: number };

const px = (v: string) => { const f = parseFloat(v); return Number.isFinite(f) ? f : NaN; };

function visibleHost(selector: string): HTMLElement | null {
  let list: NodeListOf<HTMLElement>;
  try { list = document.querySelectorAll<HTMLElement>(selector); } catch { return null; }
  for (const el of Array.from(list)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/** Where the mascot is on screen right now (viewport coordinates), or null when it is not on this page. */
function measure(g: MascotGroup): Box | null {
  const host = visibleHost(g.host);
  if (!host) return null;
  const hr = host.getBoundingClientRect();
  if (!g.pseudo) return { left: hr.left, top: hr.top, width: hr.width, height: hr.height };

  const cs = getComputedStyle(host, g.pseudo);
  if (cs.content === 'none' || cs.display === 'none') return null;
  const w = px(cs.width), h = px(cs.height);
  if (!(w > 0) || !(h > 0)) return null;

  // translate (our drag offset) + scale, as computed individual properties
  const t = (cs.translate && cs.translate !== 'none' ? cs.translate : '0px 0px').split(' ').map(px);
  const dx = Number.isFinite(t[0]) ? t[0] : 0, dy = Number.isFinite(t[1]) ? t[1] : 0;
  const sc = cs.scale && cs.scale !== 'none' ? px(cs.scale.split(' ')[0]) || 1 : 1;
  // the stylesheet's own transform (e.g. translateY(-50%)) – only its translation matters here
  let ex = 0, ey = 0;
  if (cs.transform && cs.transform !== 'none') { try { const m = new DOMMatrixReadOnly(cs.transform); ex = m.e; ey = m.f; } catch { /* ignore */ } }

  let left: number, top: number;
  if (cs.position === 'absolute' || cs.position === 'fixed') {
    const hcs = getComputedStyle(host);
    const l = px(cs.left), tp = px(cs.top);
    if (Number.isFinite(l) && Number.isFinite(tp)) {
      left = hr.left + (cs.position === 'fixed' ? 0 : px(hcs.borderLeftWidth) || 0) + l;
      top = hr.top + (cs.position === 'fixed' ? 0 : px(hcs.borderTopWidth) || 0) + tp;
      if (cs.position === 'fixed') { left = l; top = tp; }
    } else { left = hr.left + (hr.width - w) / 2; top = hr.top + (hr.height - h) / 2; }
  } else {
    // inline picture after some text (the one next to the store name): sit after the last line of text
    const rg = document.createRange(); rg.selectNodeContents(host);
    const rects = rg.getClientRects();
    const last = rects.length ? rects[rects.length - 1] : hr;
    left = last.right + (px(cs.marginLeft) || 0);
    top = last.top + (last.height - h) / 2;
  }
  left += ex + dx - (w * sc - w) / 2;
  top += ey + dy - (h * sc - h) / 2;
  return { left, top, width: w * sc, height: h * sc };
}

/** Where a built-in mascot is right now and which picture it shows (used by "Duplicate this mascot"). */
export type MascotInfo = { box: Box | null; image: string; /** the mascot is glued to the glass of the screen (fixed bar) rather than to the page */ fixed: boolean; scrollY: number; column: { left: number; width: number } | null };
export function measureMascotInfo(groupKey: string): MascotInfo {
  const col = document.querySelector('.shop, .detail') as HTMLElement | null;
  const cr = col ? col.getBoundingClientRect() : null;
  const column = cr && cr.width > 40 ? { left: cr.left, width: cr.width } : null;
  const g = MASCOT_GROUPS.find(x => x.key === groupKey);
  if (!g) return { box: null, image: '', fixed: false, scrollY: window.scrollY, column };
  const box = measure(g);
  let image = '';
  const host = visibleHost(g.host);
  // fixed bars (the bottom navigation…) do not scroll, so a copy of their mascot must not scroll either
  let fixed = false;
  for (let n: HTMLElement | null = host; n && n !== document.documentElement; n = n.parentElement) { if (getComputedStyle(n).position === 'fixed') { fixed = true; break; } }
  if (host && !fixed && g.pseudo && getComputedStyle(host, g.pseudo).position === 'fixed') fixed = true;
  if (host) {
    const cs = getComputedStyle(host, g.pseudo || undefined);
    const m = /url\(["']?(.*?)["']?\)/.exec(cs.backgroundImage || '');
    if (m) image = m[1];
  }
  if (image.startsWith(window.location.origin)) image = image.slice(window.location.origin.length);
  return { box, image, fixed, scrollY: window.scrollY, column };
}

type Props = {
  pos: Record<string, MascotPos>; selected: string; path: string;
  onSelect: (group: string) => void; onPatch: (group: string, patch: MascotPos) => void;
};

export function MascotHandles({ pos, selected, path, onSelect, onPatch }: Props) {
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  const [live, setLive] = useState<Record<string, { dx: number; dy: number }>>({});
  const posRef = useRef(pos); posRef.current = pos;
  const dragging = useRef(false);
  const raf = useRef(0);
  const pending = useRef<{ g: string; dx: number; dy: number } | null>(null);

  // re-measure now and keep doing it (the page scrolls, images load, the theme CSS arrives a moment after a drag)
  useEffect(() => {
    let alive = true;
    const run = () => {
      if (!alive) return;
      const next: Record<string, Box> = {};
      for (const g of MASCOT_GROUPS) if (g.handle) { const b = measure(g); if (b) next[g.key] = b; }
      setBoxes(prev => {
        const keys = Object.keys(next);
        const same = keys.length === Object.keys(prev).length && keys.every(k => prev[k] && Math.abs(prev[k].left - next[k].left) < 0.5 && Math.abs(prev[k].top - next[k].top) < 0.5 && Math.abs(prev[k].width - next[k].width) < 0.5 && Math.abs(prev[k].height - next[k].height) < 0.5);
        return same ? prev : next;
      });
    };
    run();
    const id = window.setInterval(run, 200);
    window.addEventListener('scroll', run, { passive: true });
    window.addEventListener('resize', run);
    return () => { alive = false; window.clearInterval(id); window.removeEventListener('scroll', run); window.removeEventListener('resize', run); };
  }, [path, pos]);
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  const flush = () => {
    raf.current = 0;
    const p = pending.current; pending.current = null;
    if (p) onPatch(p.g, { dx: p.dx, dy: p.dy });
  };

  const start = (e: React.PointerEvent, g: MascotGroup, box: Box) => {
    e.preventDefault(); e.stopPropagation();
    onSelect(g.key);
    const target = e.currentTarget as HTMLElement;
    try { target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const sx = e.clientX, sy = e.clientY;
    const ox = posRef.current[g.key]?.dx || 0, oy = posRef.current[g.key]?.dy || 0;
    dragging.current = true;
    const move = (ev: PointerEvent) => {
      const dx = Math.round(ox + ev.clientX - sx), dy = Math.round(oy + ev.clientY - sy);
      setLive(l => ({ ...l, [g.key]: { dx, dy } }));
      pending.current = { g: g.key, dx, dy };
      if (!raf.current) raf.current = requestAnimationFrame(flush);
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      if (raf.current) { cancelAnimationFrame(raf.current); flush(); }
      dragging.current = false;
      window.setTimeout(() => setLive(l => { const n = { ...l }; delete n[g.key]; return n; }), 500);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    void box;
  };

  return (
    <div className="ynMascotLayer" aria-hidden="true">
      {MASCOT_GROUPS.filter(g => g.handle && boxes[g.key]).map(g => {
        const b = boxes[g.key];
        const base = pos[g.key], l = live[g.key], locked = !!base?.locked;
        // while dragging the real picture lags a frame behind, so the box follows the pointer immediately
        const shiftX = l ? l.dx - (base?.dx || 0) : 0, shiftY = l ? l.dy - (base?.dy || 0) : 0;
        return (
          <div key={g.key} className={'ynMascotBox' + (selected === g.key ? ' on' : '') + (locked ? ' locked' : '')}
            style={{ left: b.left + shiftX, top: b.top + shiftY, width: Math.max(24, b.width), height: Math.max(24, b.height) }}
            onPointerDown={locked ? undefined : e => start(e, g, b)} title={locked ? g.label + ' (locked)' : g.label}>
            <span className="ynMascotTag">{(locked ? '🔒 ' : '') + g.label.replace(/\s*\(.*\)$/, '')}</span>
          </div>
        );
      })}
    </div>
  );
}
