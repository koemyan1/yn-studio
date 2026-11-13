import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CUSTOM_BOX, DEFAULT_KHMER_FONT, KHMER_FONTS, SHEET_H, SHEET_W, hasKhmer, isCustomId } from '../shared/bookCoverMath.js';
import type { BcCover, BcField, BcPos } from '../shared/bookCoverMath.js';
import { canvasesToPdfBlob, downloadBlob } from './pdfSave';

/* ---------------------------------------------------------------------------------------------
   Book cover sheet.
   One A4 page (794 x 1123 px, the same size the CV maker uses) = the admin's blank cover picture + the customer's texts.
   Every text sits at a point given in % of the page (its middle), so it looks the same in the small preview, the editor and the
   full-size copy that is turned into a PDF. The same component is used by the customer (preview + drag) and the admin (print).
   --------------------------------------------------------------------------------------------- */

/** `id` starting with "custom-" = the customer's own picture: a white rectangle is laid over it for the text. */
export type BcDesignLike = { image: string; fields: BcField[]; id?: string | null };

export function ensureBcFonts() {
  const add = (id: string, href: string) => {
    if (document.getElementById(id)) return;
    const l = document.createElement('link');
    l.id = id; l.rel = 'stylesheet'; l.href = href;
    document.head.appendChild(l);
  };
  add('bc-fonts', 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&family=Montserrat:wght@400;700&family=Anton&family=Playfair+Display:wght@400;700&family=Lato:wght@400;700&family=Noto+Sans+Khmer:wght@400;700&family=Battambang:wght@400;700&family=Moul&family=Koulen&family=Hanuman:wght@400;700&display=swap');
  // the extra Khmer fonts the admin can pick; kept in their own file so one slow font can never hold back the rest
  add('bc-fonts-km', 'https://fonts.googleapis.com/css2?family=Content:wght@400;700&family=Nokora:wght@400;700&family=Siemreap&family=Bayon&family=Bokor&family=Dangrek&family=Angkor&family=Moulpali&family=Taprom&family=Fasthand&display=swap');
}

/** Khmer text uses the field's Khmer font first, everything else its normal font first; the other one is the fallback. */
const fontStack = (f: BcField, text: string) => {
  const km = KHMER_FONTS.includes(f.font_km) ? f.font_km : DEFAULT_KHMER_FONT;
  const first = hasKhmer(text) ? [km, f.font] : [f.font, km];
  return [...first, 'Noto Sans Khmer', 'Battambang'].map(x => `'${x}'`).join(', ') + ', system-ui, sans-serif';
};

/** Where one text sits: the customer's own spot when there is one, else the spot the admin chose for that question. */
export function spotOf(f: BcField, pos?: Record<string, BcPos>): BcPos & { color: string } {
  const p = pos?.[f.key];
  return { x: p?.x ?? f.x, y: p?.y ?? f.y, size: p?.size ?? f.size, color: p?.color || f.color };   // colour: the customer's pick, else the admin's
}

export const labelOf = (f: BcField, km: boolean) => (km && f.label_km ? f.label_km : f.label_en);

type SheetProps = {
  design: BcDesignLike;
  cover?: BcCover | null;                     // the real texts; when missing, `sample` is shown instead (admin editor, design cards)
  sample?: boolean;
  km?: boolean;
  imgSrc?: string;                            // data: URL of the picture (used for export so nothing can taint the canvas)
  selected?: string | null;
  onSelect?: (key: string | null) => void;
  onMove?: (key: string, x: number, y: number) => void;   // when set the texts can be dragged
  /** "frame" draws a dashed box round the texts so it is obvious they can be moved */
  frame?: boolean;
};

/** The sheet itself at 794 x 1123. Wrap it in <Scaled> to show it small. */
export const BookCoverSheet = React.forwardRef<HTMLDivElement, SheetProps>(function BookCoverSheet(
  { design, cover, sample, km = false, imgSrc, selected, onSelect, onMove, frame }, ref,
) {
  const box = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ key: string; dx: number; dy: number } | null>(null);
  const setRef = (el: HTMLDivElement | null) => { box.current = el; if (typeof ref === 'function') ref(el); else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el; };

  const down = (e: React.PointerEvent, f: BcField) => {
    if (!onMove || !box.current) return;
    e.preventDefault(); e.stopPropagation();
    onSelect?.(f.key);
    const r = box.current.getBoundingClientRect();
    const s = spotOf(f, cover?.pos);
    // remember how far the finger is from the middle of the text, so the text does not jump to the finger
    drag.current = { key: f.key, dx: e.clientX - (r.left + (s.x / 100) * r.width), dy: e.clientY - (r.top + (s.y / 100) * r.height) };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || !onMove || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const x = ((e.clientX - d.dx - r.left) / r.width) * 100, y = ((e.clientY - d.dy - r.top) / r.height) * 100;
    onMove(d.key, Math.min(100, Math.max(0, x)), Math.min(100, Math.max(0, y)));
  };
  const up = () => { drag.current = null; };

  return (
    <div ref={setRef} className={'bcSheet' + (onMove ? ' drag' : '')} style={{ width: SHEET_W, height: SHEET_H }} onPointerDown={() => onSelect?.(null)}>
      <img className="bcSheetImg" src={imgSrc || design.image} alt="" draggable={false} />
      {isCustomId(design.id) && <div className="bcBox" style={{ left: CUSTOM_BOX.left + '%', top: CUSTOM_BOX.top + '%', right: CUSTOM_BOX.right + '%', bottom: CUSTOM_BOX.bottom + '%' }} />}
      {design.fields.map(f => {
        const text = sample ? labelOf(f, km) : (cover?.values?.[f.key] || '');
        if (!text) return null;
        const s = spotOf(f, cover?.pos);
        return (
          <div
            key={f.key}
            className={'bcText' + (selected === f.key ? ' sel' : '') + (frame && onMove ? ' frame' : '')}
            style={{ left: s.x + '%', top: s.y + '%', fontSize: s.size, color: s.color, fontFamily: fontStack(f, text), fontWeight: f.bold ? 700 : 400, maxWidth: SHEET_W * 0.9 }}
            onPointerDown={e => down(e, f)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          >{text}</div>
        );
      })}
    </div>
  );
});

/** Scales a 794 x 1123 sheet to the width of its box (same idea as the CV maker's Scaled). */
export function Scaled({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const el = useRef<HTMLDivElement | null>(null);
  const [s, setS] = useState(0.3);
  useEffect(() => {
    const n = el.current; if (!n) return;
    const f = () => setS(Math.max(0.05, n.clientWidth / SHEET_W));
    f();
    const ro = new ResizeObserver(f); ro.observe(n);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={el} className={'bcScaled ' + className}>
      <div className="bcScaledIn" style={{ transform: `scale(${s})`, pointerEvents: className.includes('live') ? 'auto' : 'none' }}>{children}</div>
    </div>
  );
}

/* ================================================ EXPORT (admin: download + print) ================================================ */

async function toDataUrl(url: string): Promise<string> {
  const r = await fetch(url, { mode: 'cors', cache: 'force-cache' });
  if (!r.ok) throw new Error('Could not load the cover picture.');
  const blob = await r.blob();
  return await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(new Error('Could not read the cover picture.')); fr.readAsDataURL(blob); });
}

/** Draws one finished cover at full size and returns the canvas. Used for the PDF, the PNGs and printing. */
async function coverCanvas(design: BcDesignLike, cover: BcCover, imgSrc: string, ratio: number): Promise<HTMLCanvasElement> {
  const { toCanvas } = await import('html-to-image');
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${SHEET_W}px;height:${SHEET_H}px;pointer-events:none;`;
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    root.render(<BookCoverSheet design={design} cover={cover} imgSrc={imgSrc} />);
    await new Promise(r => setTimeout(r, 60));
    await Promise.all(Array.from(host.querySelectorAll('img')).map(i => (i.complete ? Promise.resolve() : new Promise(r => { i.onload = i.onerror = () => r(null); }))));
    await (document as any).fonts?.ready;
    const sheet = host.firstElementChild as HTMLElement;
    const opts = { width: SHEET_W, height: SHEET_H, pixelRatio: ratio, backgroundColor: '#ffffff' };
    await toCanvas(sheet, opts).catch(() => null);   // warm-up: Safari sometimes misses fonts on the first draw
    return await toCanvas(sheet, opts);
  } finally { root.unmount(); host.remove(); }
}

export type ExportItem = { design_id?: string | null; design_image: string; design_fields: BcField[]; covers: BcCover[] };
/** An order to print: one entry per design, each with its own pages. */
export type ExportOrder = { id: string; items: ExportItem[] };
const safeName = (s: string) => (s || 'book-cover').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'book-cover';

/** Every page of the order as a canvas: design 1's pages, then design 2's, and so on. */
async function canvasesFor(o: ExportOrder, ratio: number, onProgress?: (n: number, total: number) => void) {
  ensureBcFonts();
  const total = o.items.reduce((n, it) => n + it.covers.length, 0);
  const out: HTMLCanvasElement[] = [];
  for (const it of o.items) {
    const design: BcDesignLike = { id: it.design_id, image: it.design_image, fields: it.design_fields };
    const img = await toDataUrl(it.design_image);
    for (const c of it.covers) { onProgress?.(out.length, total); out.push(await coverCanvas(design, c, img, ratio)); }
  }
  onProgress?.(total, total);
  return out;
}

/** One A4 PDF with a page per cover, ready for the printer. */
export async function downloadOrderPdf(o: ExportOrder, name: string, onProgress?: (n: number, t: number) => void) {
  const cs = await canvasesFor(o, 2.5, onProgress);
  downloadBlob(await canvasesToPdfBlob(cs, 0.94), safeName(name) + '.pdf');
}

/** Each cover as its own picture (PNG). */
export async function downloadOrderPngs(o: ExportOrder, name: string, onProgress?: (n: number, t: number) => void) {
  const cs = await canvasesFor(o, 2.5, onProgress);
  for (let i = 0; i < cs.length; i++) {
    const blob: Blob = await new Promise((res, rej) => cs[i].toBlob(b => (b ? res(b) : rej(new Error('png'))), 'image/png'));
    downloadBlob(blob, `${safeName(name)} - page ${i + 1}.png`);
    await new Promise(r => setTimeout(r, 250));   // browsers block a burst of downloads
  }
}

/** Opens the print dialog with one full A4 page per cover (no margins). */
export async function printOrder(o: ExportOrder, onProgress?: (n: number, t: number) => void) {
  const cs = await canvasesFor(o, 2, onProgress);
  const imgs = cs.map(c => c.toDataURL('image/jpeg', 0.92));
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(f);
  const d = f.contentDocument!;
  d.open();
  d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${safeName('Book covers')}</title><style>@page{size:A4;margin:0}html,body{margin:0;padding:0;background:#fff}img{display:block;width:210mm;height:297mm;page-break-after:always;break-after:page}img:last-child{page-break-after:auto;break-after:auto}</style></head><body>${imgs.map(s => `<img src="${s}">`).join('')}</body></html>`);
  d.close();
  await Promise.all(Array.from(d.images).map(i => (i.complete ? Promise.resolve() : new Promise(r => { i.onload = i.onerror = () => r(null); }))));
  const w = f.contentWindow!;
  w.focus();
  w.print();
  window.setTimeout(() => f.remove(), 60000);
}
