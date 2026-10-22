import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Type, Image as ImageIcon, Square, Circle, Minus, Pencil, MousePointer2, MousePointerClick, Timer, Trash2, Copy,
  ArrowUp, ArrowDown, ChevronUp, ChevronDown, Undo2, Redo2, Plus, Lock, Unlock, X, Upload, AlignLeft, AlignCenter, AlignRight,
  Bold, Italic, ZoomIn, ZoomOut, Save, Check, Layers, ChevronsUp, ChevronsDown,
} from 'lucide-react';

/* =====================================================================================================
   Blank-canvas invitation: the admin places text, pictures, buttons, shapes, drawings and a countdown
   anywhere on 390 px wide "pages", drags / resizes / rotates them directly on the preview.
   Guests see the same pages scaled to their screen.
   ===================================================================================================== */

export const CANVAS_W = 390;

export type ElType = 'text' | 'image' | 'shape' | 'button' | 'draw' | 'countdown';
export type El = {
  id: string; type: ElType;
  x: number; y: number; w: number; h: number; rot: number; opacity: number; locked?: boolean;
  anim: string; delay: number;
  text?: string; font?: string; size?: number; color?: string; bold?: boolean; italic?: boolean;
  align?: 'left' | 'center' | 'right'; lh?: number; ls?: number; shadow?: boolean;
  src?: string; fit?: 'cover' | 'contain'; radius?: number; bw?: number; bc?: string;
  shape?: 'rect' | 'ellipse' | 'line'; fill?: string;
  bg?: string; action?: 'link' | 'tel' | 'telegram' | 'map' | 'page'; value?: string; target?: string;
  d?: string; sw?: number; vw?: number; vh?: number;
};
export type Page = { id: string; h: number; bg: string; bgImage?: string; bgFit?: 'cover' | 'contain'; hidden?: boolean; els: El[] };
export type Canvas = { pages: Page[] };

const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const rnd = (v: number) => Math.round(v * 10) / 10;
export const emptyCanvas = (): Canvas => ({ pages: [{ id: uid(), h: 844, bg: '#fff5f7', els: [] }] });

/* ------------------------------------------------------------------ fonts & animations ------------------------------------------------------------------ */

export const FONT_OPTS: { id: string; label: string; stack: string; group: string }[] = [
  { id: 'moul', label: 'Khmer OS Muol Light', stack: "'Khmer OS Muol Light','Moul',serif", group: 'Khmer' },
  { id: 'moulpali', label: 'Khmer OS Muol Pali', stack: "'Khmer OS Muol Pali','Moulpali',serif", group: 'Khmer' },
  { id: 'kantumruy', label: 'Kantumruy Pro (easy to read)', stack: "'Kantumruy Pro','Noto Serif Khmer',sans-serif", group: 'Khmer' },
  { id: 'battambang', label: 'Battambang', stack: "'Battambang','Noto Serif Khmer',serif", group: 'Khmer' },
  { id: 'koulen', label: 'Koulen (bold titles)', stack: "'Koulen','Moul',sans-serif", group: 'Khmer' },
  { id: 'greatvibes', label: 'Great Vibes (script)', stack: "'Great Vibes','Moul',cursive", group: 'English' },
  { id: 'parisienne', label: 'Parisienne (script)', stack: "'Parisienne','Moul',cursive", group: 'English' },
  { id: 'dancing', label: 'Dancing Script', stack: "'Dancing Script','Moul',cursive", group: 'English' },
  { id: 'playfair', label: 'Playfair Display (serif)', stack: "'Playfair Display','Noto Serif Khmer',serif", group: 'English' },
  { id: 'cormorant', label: 'Cormorant Garamond', stack: "'Cormorant Garamond','Noto Serif Khmer',serif", group: 'English' },
  { id: 'outfit', label: 'Outfit (clean)', stack: "'Outfit','Kantumruy Pro',sans-serif", group: 'English' },
];
const fontStack = (id?: string) => (FONT_OPTS.find(f => f.id === id) || FONT_OPTS[2]).stack;
const ANIMS = [['none', 'None'], ['fade', 'Fade in'], ['up', 'Slide up'], ['down', 'Slide down'], ['left', 'Slide from left'], ['right', 'Slide from right'], ['zoom', 'Zoom in'], ['float', 'Floating (loop)'], ['pulse', 'Pulse (loop)'], ['spin', 'Spin (loop)']] as const;

let canvasFonts = false;
function useCanvasFonts() {
  useEffect(() => {
    if (canvasFonts) return; canvasFonts = true;
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Great+Vibes&family=Cormorant+Garamond:wght@400;700&family=Parisienne&family=Dancing+Script:wght@500;700&family=Outfit:wght@400;700&family=Kantumruy+Pro:wght@400;700&family=Battambang:wght@400;700&family=Koulen&family=Moul&family=Moulpali&family=Noto+Serif+Khmer:wght@400;700&display=swap';
    document.head.appendChild(l);
  }, []);
}

/* ------------------------------------------------------------------ element content (shared by guests and the editor) ------------------------------------------------------------------ */

type Labels = { days: string; hours: string; mins: string; secs: string };

function useCountdown(date: string, time: string) {
  const target = useMemo(() => { if (!date) return null; const t = new Date(`${date}T${time || '09:00'}:00`).getTime(); return Number.isFinite(t) ? t : null; }, [date, time]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!target) return; const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, [target]);
  const s = target ? Math.max(0, Math.floor((target - now) / 1000)) : 0;
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), mins: Math.floor((s % 3600) / 60), secs: s % 60, has: !!target };
}

function Countdown({ el, date, time, labels }: { el: El; date: string; time: string; labels: Labels }) {
  const c = useCountdown(date, time);
  const items: [string, number][] = [[labels.days, c.days], [labels.hours, c.hours], [labels.mins, c.mins], [labels.secs, c.secs]];
  return (
    <div className="cvCount" style={{ color: el.color || '#4a2b36' }}>
      {items.map(([l, v]) => (
        <div key={l} style={{ background: el.bg || 'rgba(255,255,255,.85)', borderRadius: el.radius ?? 14 }}>
          <b style={{ fontFamily: fontStack(el.font), fontSize: (el.size || 28) }}>{c.has ? String(v).padStart(2, '0') : '--'}</b>
          <small>{l}</small>
        </div>))}
    </div>
  );
}

function textStyle(el: El): React.CSSProperties {
  return {
    fontFamily: fontStack(el.font), fontSize: el.size || 24, color: el.color || '#3b2a33', fontWeight: el.bold ? 700 : 400,
    fontStyle: el.italic ? 'italic' : 'normal', textAlign: el.align || 'center', lineHeight: el.lh || 1.5, letterSpacing: (el.ls || 0) + 'px',
    textShadow: el.shadow ? '0 2px 10px rgba(0,0,0,.45)' : undefined, whiteSpace: 'pre-wrap', wordBreak: 'break-word', width: '100%',
  };
}

function ElBody({ el, date, time, labels }: { el: El; date: string; time: string; labels: Labels }) {
  switch (el.type) {
    case 'text': return <div style={textStyle(el)}>{el.text}</div>;
    case 'image': return <div className="cvImg" style={{ backgroundImage: el.src ? `url("${el.src}")` : undefined, backgroundSize: el.fit || 'cover', borderRadius: el.radius ?? 0, border: el.bw ? `${el.bw}px solid ${el.bc || '#fff'}` : undefined }}>{!el.src && <ImageIcon />}</div>;
    case 'shape': return <div style={{ width: '100%', height: '100%', background: el.fill || '#c25b7a', borderRadius: el.shape === 'ellipse' ? '50%' : el.shape === 'line' ? 99 : el.radius ?? 0, border: el.bw ? `${el.bw}px solid ${el.bc || '#fff'}` : undefined, boxSizing: 'border-box' }} />;
    case 'button': return <div className="cvBtn" style={{ background: el.bg || '#c25b7a', color: el.color || '#fff', borderRadius: el.radius ?? 999, fontFamily: fontStack(el.font), fontSize: el.size || 16, fontWeight: el.bold ? 700 : 600 }}>{el.text}</div>;
    case 'draw': return <svg width="100%" height="100%" viewBox={`0 0 ${el.vw || el.w} ${el.vh || el.h}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}><path d={el.d} fill="none" stroke={el.color || '#c25b7a'} strokeWidth={el.sw || 4} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /></svg>;
    case 'countdown': return <Countdown el={el} date={date} time={time} labels={labels} />;
  }
}

const elBox = (el: El): React.CSSProperties => ({ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, transform: el.rot ? `rotate(${el.rot}deg)` : undefined, opacity: el.opacity });

function actionHref(el: El): string | undefined {
  const v = (el.value || '').trim(); if (!v) return undefined;
  if (el.action === 'tel') return `tel:${v.replace(/[^+\d]/g, '')}`;
  if (el.action === 'telegram') return `https://t.me/${v.replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '')}`;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/* ------------------------------------------------------------------ guest view ------------------------------------------------------------------ */

function useScale() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [s, setS] = useState(0.9);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const upd = () => setS(Math.max(0.2, el.clientWidth / CANVAS_W));
    upd();
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', upd); return () => window.removeEventListener('resize', upd); }
    const ro = new ResizeObserver(upd); ro.observe(el); return () => ro.disconnect();
  }, []);
  return [ref, s] as const;
}

function PageBg({ p }: { p: Page }): React.CSSProperties {
  return { background: p.bg, backgroundImage: p.bgImage ? `url("${p.bgImage}")` : undefined, backgroundSize: p.bgFit || 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' };
}

function GuestPage({ p, s, date, time, labels, onGo }: { p: Page; s: number; date: string; time: string; labels: Labels; onGo: (pageId: string) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (!('IntersectionObserver' in window)) { setOn(true); return; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setOn(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} id={'cvp-' + p.id} className={'cvPage ' + (on ? 'on' : '')} style={{ width: CANVAS_W * s, height: p.h * s }}>
      <div className="cvPageIn" style={{ width: CANVAS_W, height: p.h, transform: `scale(${s})`, ...PageBg({ p }) }}>
        {p.els.map(el => {
          const isPage = el.type === 'button' && el.action === 'page';
          const href = el.type === 'button' && !isPage ? actionHref(el) : undefined;
          const inner = <div className={'cvAnim cvAn-' + el.anim} style={{ ['--dl' as any]: (el.delay || 0) + 's' }}><ElBody el={el} date={date} time={time} labels={labels} /></div>;
          if (isPage) return <a key={el.id} className="cvEl cvLinkEl" style={elBox(el)} href="#" role="button" onClick={e => { e.preventDefault(); onGo(el.target || ''); }}>{inner}</a>;
          return href
            ? <a key={el.id} className="cvEl cvLinkEl" style={elBox(el)} href={href} target={el.action === 'tel' ? undefined : '_blank'} rel="noopener noreferrer">{inner}</a>
            : <div key={el.id} className="cvEl" style={{ ...elBox(el), pointerEvents: el.type === 'button' ? 'none' : undefined }}>{inner}</div>;
        })}
      </div>
    </div>
  );
}

export function CanvasPages({ canvas, date, time, labels }: { canvas: Canvas; date: string; time: string; labels: Labels }) {
  useCanvasFonts();
  const [ref, s] = useScale();
  const [overlay, setOverlay] = useState<string | null>(null);
  const shown = canvas.pages.filter(p => !p.hidden);
  const ov = overlay ? canvas.pages.find(p => p.id === overlay) : undefined;
  /* a button can jump to a page in the scroll, or open a hidden page as its own screen */
  const go = (id: string) => {
    const t = canvas.pages.find(p => p.id === id); if (!t) return;
    if (t.hidden) { setOverlay(id); return; }
    document.getElementById('cvp-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  useEffect(() => {
    if (!overlay) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOverlay(null); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [overlay]);
  return (
    <div ref={ref} className="cvWrap">
      {shown.map(p => <GuestPage key={p.id} p={p} s={s} date={date} time={time} labels={labels} onGo={go} />)}
      {ov && (
        <div className="cvOverlay" style={{ background: ov.bg }}>
          <button type="button" className="cvBack" onClick={() => setOverlay(null)} aria-label="Back">←</button>
          <div className="cvOverlayIn"><GuestPage key={ov.id} p={ov} s={s} date={date} time={time} labels={labels} onGo={id => { const t = canvas.pages.find(q => q.id === id); if (t && !t.hidden) setOverlay(null); window.setTimeout(() => go(id), 0); if (t?.hidden) setOverlay(id); }} /></div>
        </div>)}
    </div>
  );
}

/* ------------------------------------------------------------------ builder ------------------------------------------------------------------ */

type Drag =
  | { pushed?: boolean } & { kind: 'move'; pid: string; id: string; px: number; py: number; ox: number; oy: number; w: number; h: number; ph: number }
  | { pushed?: boolean } & { kind: 'resize'; pid: string; id: string; hx: number; hy: number; px: number; py: number; o: El }
  | { pushed?: boolean } & { kind: 'rotate'; pid: string; id: string }
  | { kind: 'draw'; pid: string; pts: [number, number][] };

const HANDLES: [number, number, string][] = [[-1, -1, 'nwse'], [0, -1, 'ns'], [1, -1, 'nesw'], [1, 0, 'ew'], [1, 1, 'nwse'], [0, 1, 'ns'], [-1, 1, 'nesw'], [-1, 0, 'ew']];

function smoothPath(pts: [number, number][]): string {
  if (pts.length === 1) return `M ${pts[0][0]} ${pts[0][1]} L ${pts[0][0] + 0.1} ${pts[0][1] + 0.1}`;
  let d = `M ${rnd(pts[0][0])} ${rnd(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q ${rnd(pts[i][0])} ${rnd(pts[i][1])} ${rnd(mx)} ${rnd(my)}`;
  }
  const l = pts[pts.length - 1]; d += ` L ${rnd(l[0])} ${rnd(l[1])}`;
  return d;
}

function EditorEl({ el, selected, editing, s, date, time, labels, onDown, onDbl, onText, onAutoH }: {
  el: El; selected: boolean; editing: boolean; s: number; date: string; time: string; labels: Labels;
  onDown: (e: React.PointerEvent) => void; onDbl: () => void; onText: (t: string) => void; onAutoH: (h: number) => void;
}) {
  const inner = useRef<HTMLDivElement | null>(null);
  /* text boxes grow to fit their words, like in Canva */
  const measure = useCallback(() => {
    if (el.type !== 'text' || !inner.current) return;
    const h = Math.ceil(inner.current.offsetHeight);
    if (h > 4 && Math.abs(h - el.h) > 1) onAutoH(h);
  }, [el.type, el.h, onAutoH]);
  useLayoutEffect(() => { measure(); }, [el.text, el.size, el.font, el.w, el.lh, el.ls, el.bold, el.italic, editing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (el.type !== 'text') return; (document as any).fonts?.ready?.then(measure); }, [el.font]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (editing && inner.current) { inner.current.focus(); const r = document.createRange(); r.selectNodeContents(inner.current); const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(r); } }, [editing]);

  return (
    <div className={'cvEl cvEditEl' + (selected ? ' sel' : '') + (el.locked ? ' locked' : '')} style={elBox(el)} onPointerDown={onDown} onDoubleClick={onDbl}>
      {el.type === 'text'
        ? <div ref={inner} className="cvTextEdit" contentEditable={editing} suppressContentEditableWarning style={textStyle(el)}
            onPointerDown={e => { if (editing) e.stopPropagation(); }}
            onBlur={e => { if (editing) onText(e.currentTarget.innerText.replace(/\n$/, '')); }}>{el.text}</div>
        : <ElBody el={el} date={date} time={time} labels={labels} />}
    </div>
  );
}

export function CanvasBuilder({ canvas, onChange, onClose, onSave, saving, upload, date, time, labels }: {
  canvas: Canvas; onChange: (c: Canvas) => void; onClose: () => void; onSave: () => void; saving: boolean;
  upload: (f: File) => Promise<string>; date: string; time: string; labels: Labels;
}) {
  useCanvasFonts();
  const [cv, setCv] = useState<Canvas>(canvas);
  const cvRef = useRef(cv); cvRef.current = cv;
  const past = useRef<Canvas[]>([]); const future = useRef<Canvas[]>([]);
  const [, bump] = useState(0);
  const [sel, setSel] = useState<{ pid: string; id: string } | null>(null);
  const [curPage, setCurPage] = useState(canvas.pages[0]?.id || '');
  const [tool, setTool] = useState<'select' | 'draw'>('select');
  const [pen, setPen] = useState({ color: '#c25b7a', width: 4 });
  const [editing, setEditing] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0);
  const [guides, setGuides] = useState<{ pid: string; v: number | null; h: number | null } | null>(null);
  const [livePath, setLivePath] = useState<{ pid: string; pts: [number, number][] } | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [menu, setMenu] = useState<'' | 'text' | 'shape'>('');
  const [tab, setTab] = useState<'props' | 'layers'>('props');
  const stage = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const drag = useRef<Drag | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const replaceRef = useRef<HTMLInputElement | null>(null);
  const bgRef = useRef<HTMLInputElement | null>(null);
  const clip = useRef<El | null>(null);

  /* push every change up to the invitation form */
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } onChange(cv); }, [cv]); // eslint-disable-line react-hooks/exhaustive-deps

  /* fit the first zoom to the screen */
  useLayoutEffect(() => { const w = stage.current?.clientWidth || 600; setZoom(clamp((w - 56) / CANVAS_W, 0.5, 1.2)); }, []);
  const s = zoom || 0.9;

  const push = () => { past.current.push(cvRef.current); if (past.current.length > 80) past.current.shift(); future.current = []; bump(n => n + 1); };
  const update = (fn: (c: Canvas) => Canvas, record = true) => { if (record) push(); setCv(c => { const n = fn(c); cvRef.current = n; return n; }); };
  const undo = () => { const p = past.current.pop(); if (!p) return; future.current.push(cvRef.current); cvRef.current = p; setCv(p); setSel(null); bump(n => n + 1); };
  const redo = () => { const n = future.current.pop(); if (!n) return; past.current.push(cvRef.current); cvRef.current = n; setCv(n); setSel(null); bump(n2 => n2 + 1); };

  const page = (pid: string) => cv.pages.find(p => p.id === pid);
  const selPage = sel ? page(sel.pid) : undefined;
  const selEl = selPage?.els.find(e => e.id === sel?.id);
  const patchEl = (pid: string, id: string, patch: Partial<El>, record = true) =>
    update(c => ({ ...c, pages: c.pages.map(p => (p.id === pid ? { ...p, els: p.els.map(e => (e.id === id ? { ...e, ...patch } : e)) } : p)) }), record);
  const patchPage = (pid: string, patch: Partial<Page>) => update(c => ({ ...c, pages: c.pages.map(p => (p.id === pid ? { ...p, ...patch } : p)) }));
  const flash = (t: string) => { setMsg(t); window.setTimeout(() => setMsg(''), 2600); };

  /* ---------- adding things ---------- */
  const targetPage = () => page(curPage) || cv.pages[0];
  function addEl(partial: Partial<El> & { type: ElType; w: number; h: number }) {
    const p = targetPage(); if (!p) return;
    const el: El = { id: uid(), x: Math.round((CANVAS_W - partial.w) / 2), y: Math.round(clamp((p.h - partial.h) / 2, 20, p.h - partial.h)), rot: 0, opacity: 1, anim: 'none', delay: 0, ...partial };
    update(c => ({ ...c, pages: c.pages.map(q => (q.id === p.id ? { ...q, els: [...q.els, el] } : q)) }));
    setSel({ pid: p.id, id: el.id }); setTool('select'); setMenu(''); setTab('props');
    return el;
  }
  const addText = (kind: 'heading' | 'sub' | 'body') => {
    const preset = { heading: { size: 40, font: 'moul', text: 'ឈ្មោះកូនកំលោះ & កូនក្រមុំ', w: 320, h: 70, color: '#8a1f3d' }, sub: { size: 22, font: 'moulpali', text: 'សូមអញ្ជើញ', w: 300, h: 40, color: '#c25b7a' }, body: { size: 16, font: 'kantumruy', text: 'ជាមួយក្រុមគ្រួសារទាំងសងខាង យើងខ្ញុំសូមអញ្ជើញលោកអ្នកចូលរួមក្នុងពិធីមង្គលការរបស់យើង', w: 300, h: 80, color: '#3b2a33' } }[kind];
    addEl({ type: 'text', align: 'center', lh: kind === 'body' ? 1.8 : 1.6, ...preset });
  };
  const addShape = (shape: 'rect' | 'ellipse' | 'line') => addEl({ type: 'shape', shape, fill: '#f4a6c0', w: shape === 'line' ? 200 : 140, h: shape === 'line' ? 4 : 140, radius: shape === 'rect' ? 16 : 0 });
  const addButton = () => addEl({ type: 'button', text: 'បើកផែនទី', bg: '#c25b7a', color: '#ffffff', size: 16, font: 'kantumruy', radius: 999, action: 'link', value: '', w: 180, h: 48 });
  const addCountdown = () => addEl({ type: 'countdown', w: 330, h: 80, color: '#4a2b36', bg: 'rgba(255,255,255,.88)', size: 28, font: 'outfit', radius: 14 });
  async function onFiles(files: FileList | null, mode: 'add' | 'replace' | 'bg') {
    const f = files?.[0]; if (!f) return;
    setBusy('Uploading…');
    try {
      const url = await upload(f);
      if (mode === 'bg' && targetPage()) patchPage(targetPage().id, { bgImage: url });
      else if (mode === 'replace' && sel) patchEl(sel.pid, sel.id, { src: url });
      else {
        const dim = await new Promise<{ w: number; h: number }>(res => { const im = new window.Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res({ w: 4, h: 3 }); im.src = url; });
        const w = Math.min(300, dim.w), h = Math.round(w * dim.h / dim.w);
        addEl({ type: 'image', src: url, fit: 'cover', radius: 0, w, h });
      }
    } catch (e: any) { flash(e?.message || 'Upload failed'); }
    setBusy('');
  }

  /* ---------- selection helpers ---------- */
  const del = () => { if (!sel) return; update(c => ({ ...c, pages: c.pages.map(p => (p.id === sel.pid ? { ...p, els: p.els.filter(e => e.id !== sel.id) } : p)) })); setSel(null); };
  const dup = () => {
    if (!selEl || !sel) return; const copy = { ...selEl, id: uid(), x: selEl.x + 16, y: selEl.y + 16 };
    update(c => ({ ...c, pages: c.pages.map(p => (p.id === sel.pid ? { ...p, els: [...p.els, copy] } : p)) })); setSel({ pid: sel.pid, id: copy.id });
  };
  const order = (how: 'front' | 'back' | 'up' | 'down') => {
    if (!sel) return;
    update(c => ({ ...c, pages: c.pages.map(p => {
      if (p.id !== sel.pid) return p;
      const i = p.els.findIndex(e => e.id === sel.id); if (i < 0) return p;
      const arr = [...p.els]; const [x] = arr.splice(i, 1);
      const j = how === 'front' ? arr.length : how === 'back' ? 0 : how === 'up' ? Math.min(arr.length, i + 1) : Math.max(0, i - 1);
      arr.splice(j, 0, x); return { ...p, els: arr };
    }) }));
  };
  const addPage = (after?: string) => update(c => {
    const np: Page = { id: uid(), h: 844, bg: c.pages[0]?.bg || '#fff5f7', els: [] };
    const i = after ? c.pages.findIndex(p => p.id === after) : c.pages.length - 1;
    const pages = [...c.pages]; pages.splice(i + 1, 0, np); setCurPage(np.id); return { ...c, pages };
  });
  const dupPage = (pid: string) => update(c => {
    const i = c.pages.findIndex(p => p.id === pid); const src = c.pages[i];
    const np: Page = { ...src, id: uid(), els: src.els.map(e => ({ ...e, id: uid() })) };
    const pages = [...c.pages]; pages.splice(i + 1, 0, np); return { ...c, pages };
  });
  const delPage = (pid: string) => {
    const p = page(pid); if (!p || cv.pages.length < 2) { flash('A canvas needs at least one page.'); return; }
    if (p.els.length && !confirm('Delete this page and everything on it?')) return;
    update(c => ({ ...c, pages: c.pages.filter(q => q.id !== pid).map(q => ({ ...q, els: q.els.map(e => (e.target === pid ? { ...e, target: '' } : e)) })) })); setSel(null); setCurPage(cv.pages.find(q => q.id !== pid)!.id);
  };
  const movePage = (pid: string, dir: -1 | 1) => update(c => {
    const i = c.pages.findIndex(p => p.id === pid); const j = i + dir; if (j < 0 || j >= c.pages.length) return c;
    const pages = [...c.pages]; [pages[i], pages[j]] = [pages[j], pages[i]]; return { ...c, pages };
  });

  /* ---------- pointer interactions ---------- */
  const toPage = (pid: string, cx: number, cy: number): [number, number] => {
    const r = pageRefs.current[pid]?.getBoundingClientRect(); if (!r) return [0, 0];
    const k = r.width / CANVAS_W; return [(cx - r.left) / k, (cy - r.top) / k];
  };

  const startMove = (e: React.PointerEvent, pid: string, el: El) => {
    if (tool !== 'select' || editing === el.id) return;
    e.stopPropagation(); setSel({ pid, id: el.id }); setCurPage(pid);
    if (el.locked) return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    const [px, py] = toPage(pid, e.clientX, e.clientY);
    drag.current = { kind: 'move', pid, id: el.id, px, py, ox: el.x, oy: el.y, w: el.w, h: el.h, ph: page(pid)?.h || 844 };
  };
  const startResize = (e: React.PointerEvent, hx: number, hy: number) => {
    if (!sel || !selEl) return; e.stopPropagation(); e.preventDefault();
    const [px, py] = toPage(sel.pid, e.clientX, e.clientY);
    drag.current = { kind: 'resize', pid: sel.pid, id: sel.id, hx, hy, px, py, o: { ...selEl } };
  };
  const startRotate = (e: React.PointerEvent) => { if (!sel) return; e.stopPropagation(); e.preventDefault(); drag.current = { kind: 'rotate', pid: sel.pid, id: sel.id }; };
  const startDraw = (e: React.PointerEvent, pid: string) => {
    if (tool !== 'draw') return; e.preventDefault(); setCurPage(pid);
    const pt = toPage(pid, e.clientX, e.clientY); drag.current = { kind: 'draw', pid, pts: [pt] }; setLivePath({ pid, pts: [pt] });
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current; if (!d) return;
      const [mx, my] = toPage(d.pid, e.clientX, e.clientY);
      if (d.kind === 'draw') { d.pts.push([mx, my]); setLivePath({ pid: d.pid, pts: [...d.pts] }); return; }
      if (!d.pushed) { push(); d.pushed = true; }
      if (d.kind === 'move') {
        let nx = d.ox + (mx - d.px), ny = d.oy + (my - d.py);
        const thr = 6 / (zoomRef.current || 1);
        let gv: number | null = null, gh: number | null = null;
        for (const [off, line] of [[0, 0], [d.w / 2, CANVAS_W / 2], [d.w, CANVAS_W]] as [number, number][]) if (Math.abs(nx + off - line) < thr) { nx = line - off; gv = line; break; }
        for (const [off, line] of [[0, 0], [d.h / 2, d.ph / 2], [d.h, d.ph]] as [number, number][]) if (Math.abs(ny + off - line) < thr) { ny = line - off; gh = line; break; }
        setGuides({ pid: d.pid, v: gv, h: gh });
        patchEl(d.pid, d.id, { x: rnd(nx), y: rnd(ny) }, false);
      } else if (d.kind === 'resize') {
        const o = d.o, th = (o.rot * Math.PI) / 180, cos = Math.cos(th), sin = Math.sin(th);
        const dx = mx - d.px, dy = my - d.py;
        const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos; // pointer delta in the element's own axes
        let nw = o.w + d.hx * lx, nh = o.h + d.hy * ly;
        const corner = d.hx !== 0 && d.hy !== 0;
        if (corner && (o.type === 'image' || o.type === 'draw' || o.type === 'text' || o.type === 'countdown')) { const k = Math.max(nw / o.w, nh / o.h); nw = o.w * k; nh = o.h * k; }
        nw = Math.max(16, nw); nh = Math.max(o.type === 'shape' && o.shape === 'line' ? 1 : 12, nh);
        if (d.hx === 0) nw = o.w; if (d.hy === 0) nh = o.h;
        const sx = d.hx * (nw - o.w) / 2, sy = d.hy * (nh - o.h) / 2;
        const cx = o.x + o.w / 2 + sx * cos - sy * sin, cy = o.y + o.h / 2 + sx * sin + sy * cos;
        const patch: Partial<El> = { w: rnd(nw), h: rnd(nh), x: rnd(cx - nw / 2), y: rnd(cy - nh / 2) };
        if (o.type === 'text' && corner) patch.size = Math.max(8, Math.round((o.size || 24) * (nw / o.w)));
        patch.h = o.type === 'text' ? o.h : patch.h;
        patchEl(d.pid, d.id, patch, false);
      } else if (d.kind === 'rotate') {
        const el = cvRef.current.pages.find(p => p.id === d.pid)?.els.find(x => x.id === d.id); if (!el) return;
        let a = (Math.atan2(my - (el.y + el.h / 2), mx - (el.x + el.w / 2)) * 180) / Math.PI + 90;
        a = ((a % 360) + 360) % 360; if (a > 180) a -= 360;
        for (const snap of [0, 45, 90, 135, 180, -45, -90, -135, -180]) if (Math.abs(a - snap) < 4) a = snap;
        patchEl(d.pid, d.id, { rot: Math.round(a) }, false);
      }
    };
    const up = () => {
      const d = drag.current; drag.current = null; setGuides(null);
      if (d?.kind === 'draw') {
        setLivePath(null);
        const pts = d.pts; if (!pts.length) return;
        const pad = pen.width / 2 + 2;
        const minX = Math.min(...pts.map(p => p[0])) - pad, minY = Math.min(...pts.map(p => p[1])) - pad;
        const maxX = Math.max(...pts.map(p => p[0])) + pad, maxY = Math.max(...pts.map(p => p[1])) + pad;
        const rel = pts.map(p => [p[0] - minX, p[1] - minY] as [number, number]);
        const el: El = { id: uid(), type: 'draw', x: rnd(minX), y: rnd(minY), w: rnd(maxX - minX), h: rnd(maxY - minY), rot: 0, opacity: 1, anim: 'none', delay: 0, d: smoothPath(rel), color: pen.color, sw: pen.width, vw: rnd(maxX - minX), vh: rnd(maxY - minY) };
        update(c => ({ ...c, pages: c.pages.map(p => (p.id === d.pid ? { ...p, els: [...p.els, el] } : p)) }));
        setSel({ pid: d.pid, id: el.id });
      }
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, [pen]); // eslint-disable-line react-hooks/exhaustive-deps
  const zoomRef = useRef(s); zoomRef.current = s;

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); dup(); return; }
      if (mod && e.key.toLowerCase() === 'c' && selEl) { clip.current = { ...selEl }; return; }
      if (mod && e.key.toLowerCase() === 'v' && clip.current) { const p = targetPage(); const c = { ...clip.current, id: uid(), x: clip.current.x + 16, y: clip.current.y + 16 }; clip.current = c; update(cc => ({ ...cc, pages: cc.pages.map(q => (q.id === p.id ? { ...q, els: [...q.els, c] } : q)) })); setSel({ pid: p.id, id: c.id }); return; }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); onSave(); return; }
      if (!sel || !selEl) { if (e.key === 'Escape') setTool('select'); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); del(); }
      else if (e.key === 'Escape') { setSel(null); setTool('select'); }
      else if (e.key.startsWith('Arrow') && !selEl.locked) {
        e.preventDefault(); const st = e.shiftKey ? 10 : 1;
        patchEl(sel.pid, sel.id, { x: selEl.x + (e.key === 'ArrowRight' ? st : e.key === 'ArrowLeft' ? -st : 0), y: selEl.y + (e.key === 'ArrowDown' ? st : e.key === 'ArrowUp' ? -st : 0) });
      }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }); // re-bound each render so it always sees fresh state

  /* ---------- panels ---------- */
  const num = (label: string, v: number, on: (n: number) => void, step = 1) => (
    <label className="cvNum">{label}<input type="number" step={step} value={Number.isFinite(v) ? Math.round(v * 10) / 10 : 0} onChange={e => on(Number(e.target.value))} /></label>);
  const color = (label: string, v: string, on: (c: string) => void) => (
    <label className="cvColor">{label}<input type="color" value={/^#[0-9a-f]{6}$/i.test(v) ? v : '#ffffff'} onChange={e => on(e.target.value)} /></label>);

  const E = selEl, SP = sel?.pid || '';
  const setE = (patch: Partial<El>) => { if (sel) patchEl(sel.pid, sel.id, patch); };
  const curP = selPage || targetPage();

  return (
    <div className="cvBuilder" onPointerDown={() => setMenu('')}>
      {/* top bar */}
      <div className="cvTop" onPointerDown={e => e.stopPropagation()}>
        <button className="cvTb" onClick={onClose} title="Back to the invitation settings"><X /> <span>Close</span></button>
        <span className="cvSep" />
        <button className="cvTb" onClick={undo} disabled={!past.current.length} title="Undo (Ctrl+Z)"><Undo2 /></button>
        <button className="cvTb" onClick={redo} disabled={!future.current.length} title="Redo (Ctrl+Shift+Z)"><Redo2 /></button>
        <span className="cvSep" />
        <button className={'cvTb ' + (tool === 'select' ? 'on' : '')} onClick={() => setTool('select')} title="Select and move"><MousePointer2 /><span>Select</span></button>
        <div className="cvMenuWrap">
          <button className="cvTb" onClick={() => setMenu(menu === 'text' ? '' : 'text')}><Type /><span>Text</span></button>
          {menu === 'text' && <div className="cvMenu"><button onClick={() => addText('heading')}>Big heading</button><button onClick={() => addText('sub')}>Subheading</button><button onClick={() => addText('body')}>Paragraph</button></div>}
        </div>
        <button className="cvTb" onClick={() => fileRef.current?.click()}><ImageIcon /><span>Image</span></button>
        <button className="cvTb" onClick={addButton}><MousePointerClick /><span>Button</span></button>
        <div className="cvMenuWrap">
          <button className="cvTb" onClick={() => setMenu(menu === 'shape' ? '' : 'shape')}><Square /><span>Shape</span></button>
          {menu === 'shape' && <div className="cvMenu"><button onClick={() => addShape('rect')}><Square /> Rectangle</button><button onClick={() => addShape('ellipse')}><Circle /> Circle</button><button onClick={() => addShape('line')}><Minus /> Line</button></div>}
        </div>
        <button className={'cvTb ' + (tool === 'draw' ? 'on' : '')} onClick={() => { setTool(tool === 'draw' ? 'select' : 'draw'); setSel(null); }} title="Draw freehand on the page"><Pencil /><span>Draw</span></button>
        <button className="cvTb" onClick={addCountdown}><Timer /><span>Countdown</span></button>
        {tool === 'draw' && <span className="cvPen"><input type="color" value={pen.color} onChange={e => setPen(p => ({ ...p, color: e.target.value }))} /><input type="range" min={1} max={24} value={pen.width} onChange={e => setPen(p => ({ ...p, width: Number(e.target.value) }))} /><b>{pen.width}px</b></span>}
        <div className="grow" />
        {msg && <span className="cvMsg">{msg}</span>}
        {busy && <span className="cvMsg">{busy}</span>}
        <button className="cvTb" onClick={() => setZoom(z => clamp((z || s) - 0.1, 0.3, 1.8))}><ZoomOut /></button>
        <span className="cvZoom">{Math.round(s * 100)}%</span>
        <button className="cvTb" onClick={() => setZoom(z => clamp((z || s) + 0.1, 0.3, 1.8))}><ZoomIn /></button>
        <button className="cvTb cvSave" onClick={onSave} disabled={saving}><Save /> <span>{saving ? 'Saving…' : 'Save'}</span></button>
        <button className="cvTb cvDone" onClick={onClose}><Check /> <span>Done</span></button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { onFiles(e.target.files, 'add'); e.target.value = ''; }} />
      <input ref={replaceRef} type="file" accept="image/*" hidden onChange={e => { onFiles(e.target.files, 'replace'); e.target.value = ''; }} />
      <input ref={bgRef} type="file" accept="image/*" hidden onChange={e => { onFiles(e.target.files, 'bg'); e.target.value = ''; }} />

      <div className="cvBody">
        {/* stage */}
        <div className="cvStage" ref={stage} onPointerDown={() => { if (tool === 'select') { setSel(null); setEditing(null); } }}>
          {cv.pages.map((p, pi) => (
            <div className="cvPageBlock" key={p.id} onPointerDown={e => e.stopPropagation()}>
              <div className="cvPageBar">
                <b onClick={() => setCurPage(p.id)} className={curPage === p.id ? 'cur' : ''}>Page {pi + 1}{p.hidden ? ' · hidden' : ''}</b>
                <button onClick={() => movePage(p.id, -1)} disabled={pi === 0} title="Move up"><ChevronUp /></button>
                <button onClick={() => movePage(p.id, 1)} disabled={pi === cv.pages.length - 1} title="Move down"><ChevronDown /></button>
                <button onClick={() => dupPage(p.id)} title="Duplicate page"><Copy /></button>
                <button onClick={() => delPage(p.id)} title="Delete page"><Trash2 /></button>
              </div>
              <div className={'cvPage cvPageEdit' + (tool === 'draw' ? ' drawing' : '')} ref={n => { pageRefs.current[p.id] = n; }} style={{ width: CANVAS_W * s, height: p.h * s }}
                onPointerDown={e => { setCurPage(p.id); if (tool === 'draw') startDraw(e, p.id); else { setSel(null); setEditing(null); } }}>
                <div className="cvPageIn" style={{ width: CANVAS_W, height: p.h, transform: `scale(${s})`, ...PageBg({ p }) }}>
                  {p.els.map(el => (
                    <EditorEl key={el.id} el={el} s={s} date={date} time={time} labels={labels}
                      selected={sel?.id === el.id} editing={editing === el.id}
                      onDown={e => startMove(e, p.id, el)}
                      onDbl={() => { if (el.type === 'text' && !el.locked) { setSel({ pid: p.id, id: el.id }); setEditing(el.id); } }}
                      onText={t => { setEditing(null); patchEl(p.id, el.id, { text: t }); }}
                      onAutoH={h => patchEl(p.id, el.id, { h }, false)} />
                  ))}
                  {/* selection frame with handles, drawn at the same scale as the page */}
                  {sel?.pid === p.id && E && !editing && tool === 'select' && (
                    <div className="cvFrame" style={{ position: 'absolute', left: E.x, top: E.y, width: E.w, height: E.h, transform: E.rot ? `rotate(${E.rot}deg)` : undefined, outlineWidth: 1.5 / s }}>
                      {!E.locked && HANDLES.filter(([hx, hy]) => !(E.type === 'text' && hx === 0 && hy !== 0)).map(([hx, hy, cur]) => (
                        <i key={`${hx}${hy}`} className="cvHandle" style={{ left: `${(hx + 1) * 50}%`, top: `${(hy + 1) * 50}%`, width: 12 / s, height: 12 / s, marginLeft: -6 / s, marginTop: -6 / s, cursor: `${cur}-resize`, borderWidth: 1.5 / s }} onPointerDown={e => startResize(e, hx, hy)} />
                      ))}
                      {!E.locked && <><span className="cvRotStem" style={{ height: 22 / s, top: -22 / s }} /><i className="cvHandle cvRot" style={{ left: '50%', top: -30 / s, width: 14 / s, height: 14 / s, marginLeft: -7 / s, marginTop: -7 / s, borderWidth: 1.5 / s }} onPointerDown={startRotate} /></>}
                    </div>
                  )}
                  {guides?.pid === p.id && <>
                    {guides.v !== null && <span className="cvGuide v" style={{ left: guides.v, width: 1 / s }} />}
                    {guides.h !== null && <span className="cvGuide h" style={{ top: guides.h, height: 1 / s }} />}
                  </>}
                  {livePath?.pid === p.id && <svg className="cvLive" width={CANVAS_W} height={p.h}><path d={smoothPath(livePath.pts)} fill="none" stroke={pen.color} strokeWidth={pen.width} strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </div>
              </div>
            </div>
          ))}
          <button className="cvAddPage" onPointerDown={e => e.stopPropagation()} onClick={() => addPage()}><Plus /> Add page</button>
        </div>

        {/* side panel */}
        <aside className="cvPanel" onPointerDown={e => e.stopPropagation()}>
          <div className="cvTabs"><button className={tab === 'props' ? 'on' : ''} onClick={() => setTab('props')}>{E ? 'Edit ' + E.type : 'Page'}</button><button className={tab === 'layers' ? 'on' : ''} onClick={() => setTab('layers')}><Layers /> Layers</button></div>

          {tab === 'layers' && curP && (
            <div className="cvLayers">
              {[...curP.els].reverse().map(el => (
                <button key={el.id} className={'cvLayer' + (sel?.id === el.id ? ' on' : '')} onClick={() => { setSel({ pid: curP.id, id: el.id }); setTab('props'); }}>
                  <span className="cvLType">{el.type === 'text' ? <Type /> : el.type === 'image' ? <ImageIcon /> : el.type === 'button' ? <MousePointerClick /> : el.type === 'draw' ? <Pencil /> : el.type === 'countdown' ? <Timer /> : <Square />}</span>
                  <span className="cvLName">{el.type === 'text' || el.type === 'button' ? (el.text || '').slice(0, 26) : el.type}</span>
                  {el.locked && <Lock />}
                </button>))}
              {!curP.els.length && <p className="muted">Nothing on this page yet. Use the buttons at the top to add text, pictures, buttons, shapes or draw.</p>}
            </div>)}

          {tab === 'props' && E && (
            <div className="cvProps">
              <div className="cvActions">
                <button onClick={dup} title="Duplicate (Ctrl+D)"><Copy /></button>
                <button onClick={() => setE({ locked: !E.locked })} title={E.locked ? 'Unlock' : 'Lock'}>{E.locked ? <Lock /> : <Unlock />}</button>
                <button onClick={() => order('front')} title="Bring to front"><ChevronsUp /></button>
                <button onClick={() => order('up')} title="Forward"><ArrowUp /></button>
                <button onClick={() => order('down')} title="Backward"><ArrowDown /></button>
                <button onClick={() => order('back')} title="Send to back"><ChevronsDown /></button>
                <button className="danger" onClick={del} title="Delete"><Trash2 /></button>
              </div>

              {E.type === 'text' && <>
                <label>Text<textarea rows={3} value={E.text || ''} onChange={e => setE({ text: e.target.value })} /></label>
                <label>Font<select value={E.font || 'kantumruy'} onChange={e => setE({ font: e.target.value })}>
                  {['Khmer', 'English'].map(g => <optgroup key={g} label={g}>{FONT_OPTS.filter(f => f.group === g).map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</optgroup>)}</select></label>
                <div className="cvRow">{num('Size', E.size || 24, v => setE({ size: clamp(v, 6, 200) }))}{color('Colour', E.color || '#3b2a33', c => setE({ color: c }))}</div>
                <div className="cvRow">
                  <button className={'cvIcon ' + (E.bold ? 'on' : '')} onClick={() => setE({ bold: !E.bold })}><Bold /></button>
                  <button className={'cvIcon ' + (E.italic ? 'on' : '')} onClick={() => setE({ italic: !E.italic })}><Italic /></button>
                  {(['left', 'center', 'right'] as const).map(a => <button key={a} className={'cvIcon ' + ((E.align || 'center') === a ? 'on' : '')} onClick={() => setE({ align: a })}>{a === 'left' ? <AlignLeft /> : a === 'center' ? <AlignCenter /> : <AlignRight />}</button>)}
                  <button className={'cvIcon ' + (E.shadow ? 'on' : '')} onClick={() => setE({ shadow: !E.shadow })} title="Shadow">S</button>
                </div>
                <div className="cvRow">{num('Line height', E.lh || 1.5, v => setE({ lh: clamp(v, 0.8, 3) }), 0.1)}{num('Letter gap', E.ls || 0, v => setE({ ls: clamp(v, -5, 30) }), 0.5)}</div>
              </>}

              {E.type === 'image' && <>
                <button className="cvWide" onClick={() => replaceRef.current?.click()}><Upload /> Replace picture</button>
                <label>Fit<select value={E.fit || 'cover'} onChange={e => setE({ fit: e.target.value as any })}><option value="cover">Fill (crop)</option><option value="contain">Show whole picture</option></select></label>
                <label>Corner roundness: {E.radius || 0}px<input type="range" min={0} max={Math.round(Math.min(E.w, E.h) / 2)} value={E.radius || 0} onChange={e => setE({ radius: Number(e.target.value) })} /></label>
                <button className="cvWide" onClick={() => setE({ radius: Math.round(Math.min(E.w, E.h) / 2) })}>Make it a circle</button>
                <div className="cvRow">{num('Border', E.bw || 0, v => setE({ bw: clamp(v, 0, 30) }))}{color('Border colour', E.bc || '#ffffff', c => setE({ bc: c }))}</div>
              </>}

              {E.type === 'shape' && <>
                <label>Shape<select value={E.shape || 'rect'} onChange={e => setE({ shape: e.target.value as any })}><option value="rect">Rectangle</option><option value="ellipse">Circle / oval</option><option value="line">Line</option></select></label>
                {color('Fill colour', E.fill || '#f4a6c0', c => setE({ fill: c }))}
                {E.shape === 'rect' && <label>Corner roundness: {E.radius || 0}px<input type="range" min={0} max={Math.round(Math.min(E.w, E.h) / 2)} value={E.radius || 0} onChange={e => setE({ radius: Number(e.target.value) })} /></label>}
                <div className="cvRow">{num('Border', E.bw || 0, v => setE({ bw: clamp(v, 0, 30) }))}{color('Border colour', E.bc || '#ffffff', c => setE({ bc: c }))}</div>
              </>}

              {E.type === 'button' && <>
                <label>Button text<input value={E.text || ''} onChange={e => setE({ text: e.target.value })} /></label>
                <label>When tapped<select value={E.action || 'link'} onChange={e => setE({ action: e.target.value as any })}><option value="link">Open a website link</option><option value="map">Open Google Maps</option><option value="tel">Call a phone number</option><option value="telegram">Open Telegram</option><option value="page">Go to another page</option></select></label>
                {E.action === 'page' ? (
                  <label>Which page<select value={E.target || ''} onChange={e => setE({ target: e.target.value })}>
                    <option value="">Choose a page…</option>
                    {cv.pages.map((q, qi) => <option key={q.id} value={q.id}>{`Page ${qi + 1}${q.hidden ? ' (hidden page: opens as its own screen)' : ' (scrolls to it)'}`}</option>)}
                  </select></label>
                ) : (
                <label>{E.action === 'tel' ? 'Phone number' : E.action === 'telegram' ? 'Telegram username' : 'Link'}<input value={E.value || ''} onChange={e => setE({ value: e.target.value })} placeholder={E.action === 'tel' ? '+855 12 345 678' : E.action === 'telegram' ? '@username' : 'https://…'} /></label>
                )}
                <label>Font<select value={E.font || 'kantumruy'} onChange={e => setE({ font: e.target.value })}>
                  {['Khmer', 'English'].map(g => <optgroup key={g} label={g}>{FONT_OPTS.filter(f => f.group === g).map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</optgroup>)}</select></label>
                <div className="cvRow">{num('Size', E.size || 16, v => setE({ size: clamp(v, 8, 60) }))}{color('Text', E.color || '#ffffff', c => setE({ color: c }))}{color('Button', E.bg || '#c25b7a', c => setE({ bg: c }))}</div>
                <label>Corner roundness: {E.radius ?? 999}px<input type="range" min={0} max={Math.round(E.h / 2)} value={Math.min(E.radius ?? 999, Math.round(E.h / 2))} onChange={e => setE({ radius: Number(e.target.value) })} /></label>
                <small className="muted">Buttons are tappable for guests but not in this editor.</small>
              </>}

              {E.type === 'draw' && <>
                {color('Pen colour', E.color || '#c25b7a', c => setE({ color: c }))}
                <label>Pen thickness: {E.sw || 4}px<input type="range" min={1} max={30} value={E.sw || 4} onChange={e => setE({ sw: Number(e.target.value) })} /></label>
              </>}

              {E.type === 'countdown' && <>
                <small className="muted">Counts down to the wedding date and time set in the invitation settings.</small>
                <div className="cvRow">{num('Number size', E.size || 28, v => setE({ size: clamp(v, 10, 80) }))}{color('Text', E.color || '#4a2b36', c => setE({ color: c }))}{color('Box', /^#/.test(E.bg || '') ? E.bg! : '#ffffff', c => setE({ bg: c }))}</div>
                <label>Font<select value={E.font || 'outfit'} onChange={e => setE({ font: e.target.value })}>{FONT_OPTS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
              </>}

              <h5>Position & size</h5>
              <div className="cvRow">{num('X', E.x, v => setE({ x: v }))}{num('Y', E.y, v => setE({ y: v }))}</div>
              <div className="cvRow">{num('Width', E.w, v => setE({ w: Math.max(8, v) }))}{E.type !== 'text' && num('Height', E.h, v => setE({ h: Math.max(1, v) }))}</div>
              <div className="cvRow">{num('Rotate °', E.rot, v => setE({ rot: v }))}<label className="cvNum">Opacity<input type="range" min={0.05} max={1} step={0.05} value={E.opacity} onChange={e => setE({ opacity: Number(e.target.value) })} /></label></div>
              <div className="cvRow"><button className="cvMini" onClick={() => setE({ x: Math.round((CANVAS_W - E.w) / 2) })}>Centre across</button><button className="cvMini" onClick={() => setE({ y: Math.round(((curP?.h || 844) - E.h) / 2) })}>Centre down</button></div>
              <h5>Animation for guests</h5>
              <label>Effect<select value={E.anim} onChange={e => setE({ anim: e.target.value })}>{ANIMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              {E.anim !== 'none' && <label>Delay: {E.delay}s<input type="range" min={0} max={5} step={0.1} value={E.delay} onChange={e => setE({ delay: Number(e.target.value) })} /></label>}
            </div>)}

          {tab === 'props' && !E && curP && (
            <div className="cvProps">
              <small className="muted">Click anything on the page to edit it. Drag to move, use the round handles to resize, the top circle to rotate, double-click text to type on the page.</small>
              <h5>This page</h5>
              {color('Background colour', curP.bg, c => patchPage(curP.id, { bg: c }))}
              <div className="cvRow"><button className="cvMini" onClick={() => bgRef.current?.click()}><Upload /> Background picture</button>{curP.bgImage && <button className="cvMini" onClick={() => patchPage(curP.id, { bgImage: '' })}><X /> Remove</button>}</div>
              {curP.bgImage && <label>Picture fit<select value={curP.bgFit || 'cover'} onChange={e => patchPage(curP.id, { bgFit: e.target.value as any })}><option value="cover">Fill page</option><option value="contain">Show whole picture</option></select></label>}
              <label className="cvCheck"><input type="checkbox" checked={!!curP.hidden} onChange={e => patchPage(curP.id, { hidden: e.target.checked })} /> Hidden page: only opens when a guest taps a button that goes to it (shown as its own screen with a back arrow)</label>
              {num('Page height (px)', curP.h, v => patchPage(curP.id, { h: clamp(Math.round(v), 300, 3000) }), 10)}
              <div className="cvRow"><button className="cvMini" onClick={() => addPage(curP.id)}><Plus /> Page below</button><button className="cvMini" onClick={() => dupPage(curP.id)}><Copy /> Duplicate</button></div>
              <h5>Shortcuts</h5>
              <ul className="cvKeys"><li><b>Delete</b> remove</li><li><b>Arrows</b> nudge (Shift = 10px)</li><li><b>Ctrl+D</b> duplicate</li><li><b>Ctrl+Z</b> undo</li><li><b>Ctrl+C / V</b> copy / paste</li></ul>
            </div>)}
        </aside>
      </div>
    </div>
  );
}
