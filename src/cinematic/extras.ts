/* Free elements the admin adds on top of the cinematic invitation (text, picture, button, shape) and the small per-part tweaks
   (move / size / turn / photo focus) of the built-in parts. Plain data in, HTML out; positions are percentages of the section they sit on. */
export type CineEl = {
  id: string; sec: string; type: 'text' | 'image' | 'button' | 'shape';
  x: number; y: number; w: number; rot: number; op: number; z: number; anim: 'none' | 'float' | 'pulse' | 'spin' | 'wiggle' | 'sway';
  text: string; fs: number; weight: number; color: string; font: 'body' | 'title' | 'script' | 'serif'; foil: boolean; align: 'left' | 'center' | 'right';
  image: string; fit: 'cover' | 'contain'; ar: number; radius: number;
  bg: string; url: string;
  shape: 'rect' | 'circle' | 'line' | 'heart' | 'diamond'; border: number; bcolor: string;
};
export type Tweak = { dx: number; dy: number; s: number; r: number; fx: number; fy: number };
export const TWEAK_DEFAULT: Tweak = { dx: 0, dy: 0, s: 1, r: 0, fx: 50, fy: 50 };

const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const FONTS: Record<string, string> = { body: 'var(--cn-body)', title: 'var(--cn-moulpali)', script: 'var(--cn-script)', serif: 'var(--cn-serif)' };
const color = (v: string) => (/^#[0-9a-f]{3,8}$/i.test(v || '') ? v : '');

/* only real web links, phone numbers and mail; "@name" and bare numbers are understood too */
export function safeUrl(u: string): string {
  const v = (u || '').trim(); if (!v) return '';
  if (/^(https?:|tel:|mailto:)/i.test(v)) return v;
  if (/^@[\w.]+$/.test(v)) return `https://t.me/${v.slice(1)}`;
  if (/^\+?[\d\s-]{6,}$/.test(v)) return `tel:${v.replace(/[\s-]/g, '')}`;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(v)) return `https://${v}`;
  return '';
}
const safeImg = (u: string) => (/^(https?:|data:image\/|blob:|\/)/i.test(u || '') ? u : '');

export function blankEl(type: CineEl['type'], sec: string, y: number, o: Partial<CineEl> = {}): CineEl {
  const id = 'x' + Math.random().toString(36).slice(2, 9);
  const base: CineEl = { id, sec, type, x: 50, y, w: 50, rot: 0, op: 100, z: 5, anim: 'none', text: '', fs: 6, weight: 600, color: '', font: 'body', foil: false, align: 'center',
    image: '', fit: 'cover', ar: 0, radius: 0, bg: '', url: '', shape: 'rect', border: 0, bcolor: '' };
  if (type === 'text') Object.assign(base, { text: 'Your text', w: 60, fs: 6 });
  if (type === 'image') Object.assign(base, { w: 45 });
  if (type === 'button') Object.assign(base, { text: 'Tap me', w: 44, fs: 4, weight: 700, radius: 999 });
  if (type === 'shape') Object.assign(base, { w: 30, ar: 1, shape: 'circle', bg: '#d4af37' });
  return { ...base, ...o };
}
export const EL_LABEL: Record<CineEl['type'], string> = { text: 'Text', image: 'Picture', button: 'Button', shape: 'Shape' };

const SHAPES: Record<string, string> = {
  heart: '<path d="M50 90 C10 58 2 38 14 22 C26 8 44 14 50 30 C56 14 74 8 86 22 C98 38 90 58 50 90Z"/>',
  diamond: '<path d="M50 4 L96 50 L50 96 L4 50Z"/>',
};

export function extraHtml(e: CineEl, edit: boolean): string {
  const w = num(e.w, 40), op = num(e.op, 100);
  const outer = `left:${num(e.x, 50)}%;top:${num(e.y, 50)}%;width:${w}%;--r:${num(e.rot, 0)}deg;--z:${num(e.z, 5)};opacity:${(op / 100).toFixed(2)}`;
  const ed = edit ? ` data-ed="x:${esc(e.id)}" data-edl="${esc(EL_LABEL[e.type] || 'Element')}" data-x="${esc(e.id)}"` : '';
  const anim = e.anim && e.anim !== 'none' ? ` cn-a-${e.anim}` : '';
  let inner = '';
  if (e.type === 'text') {
    const st = [`font-size:calc(${num(e.fs, 6)} * 1cqw)`, `font-weight:${num(e.weight, 600)}`, `font-family:${FONTS[e.font] || FONTS.body}`, `text-align:${['left', 'right'].includes(e.align) ? e.align : 'center'}`, color(e.color) && !e.foil ? `color:${color(e.color)}` : ''].filter(Boolean).join(';');
    inner = `<div class="cn-xi cn-xt${e.foil ? ' cn-foil' : ''}${anim}" style="${st}">${esc(e.text).replace(/\n/g, '<br>')}</div>`;
  } else if (e.type === 'image') {
    const src = safeImg(e.image);
    const st = [`border-radius:${num(e.radius, 0)}%`, `object-fit:${e.fit === 'contain' ? 'contain' : 'cover'}`, e.ar > 0 ? `aspect-ratio:1/${num(e.ar, 1)}` : ''].filter(Boolean).join(';');
    inner = src ? `<img class="cn-xi cn-xm${anim}" src="${esc(src)}" alt="" draggable="false" style="${st}">` : `<div class="cn-xi cn-xm cn-xph${anim}" style="aspect-ratio:1/${e.ar > 0 ? num(e.ar, 1) : 1};border-radius:${num(e.radius, 0)}%">＋</div>`;
  } else if (e.type === 'button') {
    const href = safeUrl(e.url);
    const st = [`font-size:calc(${num(e.fs, 4)} * 1cqw)`, `font-weight:${num(e.weight, 700)}`, `border-radius:${Math.min(999, num(e.radius, 999))}px`, color(e.bg) ? `background:${color(e.bg)}` : '', color(e.color) ? `color:${color(e.color)}` : ''].filter(Boolean).join(';');
    inner = `<a class="cn-xi cn-xb${anim}" ${href ? `href="${esc(href)}" target="_blank" rel="noopener noreferrer"` : 'href="#"'} style="${st}">${esc(e.text)}</a>`;
  } else {
    const fill = color(e.bg) || 'var(--gold)', ar = e.shape === 'line' ? 0.02 : e.ar > 0 ? num(e.ar, 1) : 1;
    const brd = num(e.border, 0) > 0 ? `border:${num(e.border, 0)}px solid ${color(e.bcolor) || 'var(--gold-hi)'};` : '';
    if (SHAPES[e.shape]) inner = `<svg class="cn-xi cn-xs${anim}" viewBox="0 0 100 100" style="aspect-ratio:1;fill:${fill};stroke:${color(e.bcolor) || 'none'};stroke-width:${num(e.border, 0)}" aria-hidden="true">${SHAPES[e.shape]}</svg>`;
    else inner = `<div class="cn-xi cn-xs${anim}" style="aspect-ratio:1/${ar};background:${fill};${brd}border-radius:${e.shape === 'circle' ? '50%' : e.shape === 'line' ? '99px' : `${num(e.radius, 0)}%`}"></div>`;
  }
  return `<div class="cn-x" data-xt="${e.type}"${ed} style="${outer}">${inner}</div>`;
}

export const extrasFor = (list: CineEl[] | undefined, sec: string, edit: boolean) => (list || []).filter(e => e && e.sec === sec).map(e => extraHtml(e, edit)).join('');
