import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';

/* ------------------------------------------------------------------ *
 *  On-screen editing toolbar for the theme editor.
 *  It floats right above whatever the admin tapped in the phone preview, so
 *  nothing has to be scrolled to: change picture, colours, size, hide… all in place.
 *  The preview (an iframe) reports where the selected thing is (`anchor`, in the
 *  iframe's own pixels); this bar converts that to the editor's coordinates.
 * ------------------------------------------------------------------ */

export type Anchor = { left: number; top: number; width: number; height: number };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type BarProps = {
  title: string;
  /** null = the selection has no box (e.g. the whole page background) */
  anchor: Anchor | null;
  stageRef: React.RefObject<HTMLDivElement | null>;
  frameRef: React.RefObject<HTMLIFrameElement | null>;
  onClose: () => void;
  onMore?: () => void;
  moreLabel?: string;
  /** anything that should re-run the positioning (device size, page…) */
  deps?: unknown[];
  children: React.ReactNode;
};

export function FloatingBar({ title, anchor, stageRef, frameRef, onClose, onMore, moreLabel = 'More options', deps = [], children }: BarProps) {
  const bar = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: 8, top: 8 });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick(t => t + 1);
    window.addEventListener('resize', bump);
    window.addEventListener('scroll', bump, true);
    return () => { window.removeEventListener('resize', bump); window.removeEventListener('scroll', bump, true); };
  }, []);

  useLayoutEffect(() => {
    const stage = stageRef.current, fr = frameRef.current, el = bar.current;
    if (!stage || !fr || !el) return;
    const s = stage.getBoundingClientRect(), f = fr.getBoundingClientRect(), b = el.getBoundingClientRect();
    let left: number, top: number;
    if (anchor) {
      const ax = f.left - s.left + anchor.left, ay = f.top - s.top + anchor.top;
      left = ax + anchor.width / 2 - b.width / 2;
      top = ay - b.height - 10;                                   // above the thing
      if (top < 4) top = ay + anchor.height + 10;                 // no room above → below it
      if (top + b.height > s.height - 4) top = ay + 8;            // thing is huge → sit inside its top edge
    } else { left = s.width / 2 - b.width / 2; top = 6; }
    left = Math.round(clamp(left, 4, Math.max(4, s.width - b.width - 4)));
    top = Math.round(clamp(top, 4, Math.max(4, s.height - b.height - 4)));
    setPos(p => (p.left === left && p.top === top ? p : { left, top }));
  });
  void tick; void deps;

  return (
    <div ref={bar} className="ynQBar" style={{ left: pos.left, top: pos.top }} role="toolbar" aria-label={title}
      onPointerDown={e => e.stopPropagation()}>
      <div className="ynQHead">
        <b title={title}>{title}</b>
        {onMore ? <button type="button" className="ynQLink" onClick={onMore}>{moreLabel}</button> : null}
        <button type="button" className="ynQX" onClick={onClose} title="Done (Esc)" aria-label="Close toolbar"><X size={14} /></button>
      </div>
      <div className="ynQTools">{children}</div>
    </div>
  );
}

/** A little round colour swatch. */
export function QColor({ label, value, fallback = '#ffffff', onChange, onClear }: { label: string; value?: string; fallback?: string; onChange: (v: string) => void; onClear?: () => void }) {
  const hex = /^#[0-9a-f]{6}$/i.test(value || '') ? (value as string) : /^#[0-9a-f]{6}$/i.test(fallback) ? fallback : '#ffffff';
  return (
    <span className="ynQTool">
      <label className={'ynQColor' + (value ? ' set' : '')} title={label}>
        <i style={{ background: hex }} />
        <input type="color" value={hex} onChange={e => onChange(e.target.value)} />
      </label>
      <small>{label}</small>
      {value && onClear ? <button type="button" className="ynQReset" title={'Reset ' + label} onClick={onClear}>×</button> : null}
    </span>
  );
}

/** Replace-a-picture button. */
export function QPic({ label, has, onPick, onClear }: { label: string; has?: boolean; onPick: (f: File) => void; onClear?: () => void }) {
  return (
    <span className="ynQTool">
      <label className={'ynQBtn' + (has ? ' set' : '')} title={(has ? 'Replace ' : 'Add ') + label}>
        <ImagePlus size={16} />
        <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (f) onPick(f); }} />
      </label>
      <small>{label}</small>
      {has && onClear ? <button type="button" className="ynQReset" title={'Remove ' + label} onClick={onClear}>×</button> : null}
    </span>
  );
}

/** Icon button. */
export function QBtn({ label, icon, on, danger, onClick }: { label: string; icon: React.ReactNode; on?: boolean; danger?: boolean; onClick: () => void }) {
  return (
    <span className="ynQTool">
      <button type="button" className={'ynQBtn' + (on ? ' on' : '') + (danger ? ' danger' : '')} title={label} onClick={onClick}>{icon}</button>
      <small>{label}</small>
    </span>
  );
}

/** A number setting: tap the chip, a slider opens in the bar. */
export function QRange({ label, icon, value, shown, min, max, step = 1, unit = 'px', open, onOpen, onChange, onClear }: {
  label: string; icon: React.ReactNode; value?: number | null; shown?: string; min: number; max: number; step?: number; unit?: string;
  open: boolean; onOpen: () => void; onChange: (v: number) => void; onClear?: () => void;
}) {
  const set = value != null;
  return (
    <>
      <span className="ynQTool">
        <button type="button" className={'ynQBtn' + (open ? ' on' : '') + (set ? ' set' : '')} title={label} onClick={onOpen}>{icon}</button>
        <small>{label}</small>
      </span>
      {open ? (
        <div className="ynQSlider">
          <span>{label}: <b>{shown ?? (set ? value + unit : 'default')}</b></span>
          <input type="range" min={min} max={max} step={step} value={set ? value! : min} onChange={e => onChange(Number(e.target.value))} />
          {set && onClear ? <button type="button" className="ynQLink" onClick={onClear}>reset</button> : null}
        </div>
      ) : null}
    </>
  );
}

export function QSelect({ label, value, onChange, children }: { label: string; value: string | number; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <span className="ynQTool">
      <select className="ynQSelect" title={label} value={value} onChange={e => onChange(e.target.value)}>{children}</select>
      <small>{label}</small>
    </span>
  );
}

export const QSep = () => <i className="ynQSep" aria-hidden="true" />;
