/* Original decorative elements for the cinematic invitation, drawn as SVG strings.
   No Khmer text is ever placed inside SVG (vowel signs and subscripts misplace there): text is always HTML. */

export type FoilName = 'gold' | 'rose' | 'silver';

/* metallic foil: a gradient with real highlights, never a flat colour */
export const FOILS: Record<FoilName, string[]> = {
  gold: ['#6b4a0f', '#b98a2d', '#f3dc94', '#c9a24b', '#fbf0c4', '#a8761f', '#e6c872', '#7a5412'],
  rose: ['#7a4a45', '#c48b82', '#f6d3c8', '#d1a096', '#fdeae2', '#a86f66', '#ecc2b6', '#7d4c46'],
  silver: ['#5d6670', '#aab4be', '#f2f6fa', '#c3ccd5', '#ffffff', '#8d98a3', '#e1e7ec', '#606a74'],
};
const STOPS = [0, 14, 28, 42, 56, 70, 85, 100];
export const foilCss = (f: FoilName) => `linear-gradient(115deg, ${FOILS[f].map((c, i) => `${c} ${STOPS[i]}%`).join(', ')})`;
export const foilStops = (f: FoilName) => FOILS[f].map((c, i) => `<stop offset="${STOPS[i]}%" stop-color="${c}"/>`).join('');

/* ---------- tileable paper textures (fine grain + faint fibres, very low contrast) ---------- */
/* single quotes + %27: the value is placed inside an inline style="..." attribute, so no double quote may appear */
const svgUri = (svg: string) => `url('data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}')`;
export const grainTexture = () => svgUri(
  `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='g' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.92' numOctaves='2' seed='4' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 .22  0 0 0 0 .17  0 0 0 0 .1  0 0 0 .34 -.07'/></filter><rect width='100%' height='100%' filter='url(#g)'/></svg>`);
export const fibreTexture = () => svgUri(
  `<svg xmlns='http://www.w3.org/2000/svg' width='360' height='360'><filter id='f' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.011 .42' numOctaves='2' seed='9' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 .3  0 0 0 0 .24  0 0 0 0 .16  .55 0 0 0 -.29'/></filter><rect width='100%' height='100%' filter='url(#f)'/></svg>`);

/* ---------- math helpers ---------- */
type P = [number, number];
const bez = (t: number, a: P, b: P, c: P, d: P): P => {
  const u = 1 - t;
  return [u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]];
};
const r1 = (n: number) => Math.round(n * 100) / 100;

/* ---------- scalloped flap outline in 0..1 (objectBoundingBox) coordinates ---------- */
export function flapPath(scallops = 9, amp = 0.016, inset = 1): string {
  const tip: P = [0.5, 1];
  const side = (from: P, to: P, dir: number): P[] => {
    const pts: P[] = [], n = scallops * 10;
    const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy);
    const nx = (dy / len) * dir, ny = (-dx / len) * dir; // outward normal
    for (let i = 0; i <= n; i++) {
      const t = i / n, bump = Math.abs(Math.sin(Math.PI * t * scallops)) * amp * Math.sin(Math.PI * t) ** 0.35;
      pts.push([from[0] + dx * t + nx * bump * (1 + (len > 0.8 ? 0 : 0)), from[1] + dy * t + ny * bump]);
    }
    return pts;
  };
  const left = side([0, 0], tip, -1), right = side(tip, [1, 0], -1);
  const pts = [...left, ...right].map(([x, y]) => [0.5 + (x - 0.5) * inset, y * inset] as P);
  return 'M0 0 ' + pts.map(([x, y]) => `L${r1(x * 1000) / 1000} ${r1(y * 1000) / 1000}`).join(' ') + ' L1 0 Z';
}
/* open scalloped line (the two slanted edges only) for the gold trim */
export function flapTrim(scallops = 9, amp = 0.016, inset = 0.93): string {
  const d = flapPath(scallops, amp, inset);
  return d.replace(/^M0 0 L/, 'M').replace(/ L1 0 Z$/, '');
}

/* ---------- fan-shaped crest ---------- */
const F = (id: string) => (/^(#|rgb)/.test(id) ? id : `url(#${id})`);
export function crestSvg(fillId: string, opts: { line?: string; attrs?: string } = {}): string {
  const rays = Array.from({ length: 9 }, (_, i) => -80 + i * 20);
  const line = opts.line || 'rgba(60,35,5,.55)';
  return `<svg viewBox="0 0 120 92" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" ${opts.attrs || ''}>
  <g fill="${F(fillId)}" stroke="${line}" stroke-width=".8" stroke-linejoin="round">
    ${rays.map(a => `<path d="M60 84 C51 62 52 30 60 7 C68 30 69 62 60 84Z" transform="rotate(${a} 60 84) translate(60 84) scale(${r1(a === 0 ? 1 : 0.9 - Math.abs(a) * 0.0014)}) translate(-60 -84)"/>`).join('')}
    <path d="M10 84 A50 50 0 0 1 110 84" fill="none" stroke="${F(fillId)}" stroke-width="2.4"/>
    <path d="M22 84 A38 38 0 0 1 98 84" fill="none" stroke="${F(fillId)}" stroke-width="1.4" stroke-dasharray="1.2 3.2" stroke-linecap="round"/>
    <path d="M6 87 H114" fill="none" stroke="${F(fillId)}" stroke-width="2" stroke-linecap="round"/>
    <path d="M60 86 C52 84 46 78 44 70 C52 72 58 76 60 82 C62 76 68 72 76 70 C74 78 68 84 60 86Z"/>
    <circle cx="60" cy="9" r="3"/>
  </g></svg>`;
}

/* ---------- flowing leaf-scroll corner (top-left; mirror with a transform on an inner <g>) ---------- */
export function cornerSvg(fillId: string, mirror: '' | 'x' | 'y' | 'xy' = ''): string {
  const flip = mirror === 'x' ? 'translate(100 0) scale(-1 1)' : mirror === 'y' ? 'translate(0 100) scale(1 -1)' : mirror === 'xy' ? 'translate(100 100) scale(-1 -1)' : '';
  const leaf = (x: number, y: number, ang: number, s: number) =>
    `<path d="M0 0 C3 -5 11 -6 19 0 C11 6 3 5 0 0Z" transform="translate(${r1(x)} ${r1(y)}) rotate(${r1(ang)}) scale(${r1(s)})"/>`;
  const stem1: [P, P, P, P] = [[5, 96], [5, 58], [14, 28], [44, 17]];
  const stem2: [P, P, P, P] = [[44, 17], [60, 11], [78, 14], [95, 5]];
  const curl: [P, P, P, P] = [[44, 17], [32, 30], [36, 48], [51, 45]];
  const leaves: string[] = [];
  const addLeaves = (seg: [P, P, P, P], n: number, s0: number, flip = 1) => {
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1), p = bez(t, ...seg), q = bez(Math.min(1, t + 0.02), ...seg);
      const ang = (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;
      leaves.push(leaf(p[0], p[1], ang + 52 * flip * (i % 2 ? 1 : -1), s0 * (1 - t * 0.35)));
    }
  };
  addLeaves(stem1, 5, 0.95); addLeaves(stem2, 4, 0.85); addLeaves(curl, 2, 0.6, -1);
  const pathOf = (s: [P, P, P, P]) => `M${s[0][0]} ${s[0][1]} C${s[1][0]} ${s[1][1]} ${s[2][0]} ${s[2][1]} ${s[3][0]} ${s[3][1]}`;
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <g ${flip ? `transform="${flip}"` : ''}><g fill="url(#${fillId})" stroke="rgba(60,35,5,.4)" stroke-width=".5">${leaves.join('')}
    <circle cx="51" cy="45" r="2.3"/><circle cx="95" cy="5" r="2"/><circle cx="5" cy="96" r="2"/></g>
  <g fill="none" stroke="url(#${fillId})" stroke-width="1.7" stroke-linecap="round">
    <path d="${pathOf(stem1)}"/><path d="${pathOf(stem2)}"/><path d="${pathOf(curl)}"/></g></g></svg>`;
}

/* ---------- name-logo pieces ---------- */
export const flourishSvg = (fillId: string) => `<svg viewBox="0 0 200 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet">
  <path class="cn-fl-line" pathLength="1" d="M3 8 C28 -2 46 12 62 26 C78 40 92 44 104 32 C112 24 104 14 96 20 M104 32 C124 52 158 54 197 50" fill="none" stroke="url(#${fillId})" stroke-width="2" stroke-linecap="round"/></svg>`;
export const heartSvg = (fillId: string) => `<svg viewBox="-12 -12 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M0 8 C-12 -1 -8 -11 0 -5 C8 -11 12 -1 0 8Z" fill="url(#${fillId})" stroke="rgba(60,35,5,.45)" stroke-width=".6"/></svg>`;
export const butterflySvg = (fillId: string) => `<svg viewBox="0 0 60 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <g fill="url(#${fillId})" stroke="rgba(60,35,5,.45)" stroke-width=".6" stroke-linejoin="round">
    <g class="cn-wing cn-wing-l"><path d="M30 24 C22 4 4 2 3 14 C2 25 17 29 30 24Z"/><path d="M30 26 C20 30 8 36 12 44 C18 50 28 38 30 26Z"/></g>
    <g class="cn-wing cn-wing-r"><path d="M30 24 C38 4 56 2 57 14 C58 25 43 29 30 24Z"/><path d="M30 26 C40 30 52 36 48 44 C42 50 32 38 30 26Z"/></g>
    <rect x="28.8" y="14" width="2.4" height="22" rx="1.2"/>
    <path d="M29.5 15 C27 8 23 6 21 4 M30.5 15 C33 8 37 6 39 4" fill="none" stroke="url(#${fillId})" stroke-width="1" stroke-linecap="round"/></g></svg>`;

/* ---------- scalloped photo frame (objectBoundingBox 0..1) ---------- */
export function scallopFrame(nx = 7, ny = 9, amp = 0.022): string {
  const pts: [number, number][] = [];
  const bump = (t: number, n: number) => Math.abs(Math.sin(Math.PI * t * n)) * amp;
  const S = 14;
  for (let i = 0; i <= nx * S; i++) { const t = i / (nx * S); pts.push([t, amp - bump(t, nx) ]); }                 // top edge
  for (let i = 1; i <= ny * S; i++) { const t = i / (ny * S); pts.push([1 - amp + bump(t, ny), t]); }               // right
  for (let i = 1; i <= nx * S; i++) { const t = i / (nx * S); pts.push([1 - t, 1 - amp + bump(t, nx)]); }          // bottom
  for (let i = 1; i < ny * S; i++) { const t = i / (ny * S); pts.push([amp - bump(t, ny), 1 - t]); }               // left
  return 'M' + pts.map(([x, y]) => `${Math.max(0, Math.min(1, x)).toFixed(4)} ${Math.max(0, Math.min(1, y)).toFixed(4)}`).join(' L') + ' Z';
}

/* ---------- line icons for the programme (stroke only, drawn with pathLength=1) ---------- */
const ICONS: string[] = [
  `<circle cx="32" cy="32" r="5"/>${[0, 72, 144, 216, 288].map(a => `<ellipse cx="32" cy="19" rx="5" ry="8" transform="rotate(${a} 32 32)"/>`).join('')}`,
  `<circle cx="25" cy="38" r="10"/><circle cx="39" cy="38" r="10"/><path d="M28 21 L32 15 L36 21 Z"/>`,
  `<circle cx="32" cy="32" r="9"/>${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<path d="M32 12 V18" transform="rotate(${a} 32 32)"/>`).join('')}`,
  `<path d="M32 47 C13 34 15 20 25 19 C29 18.5 31 21 32 23.5 C33 21 35 18.5 39 19 C49 20 51 34 32 47 Z"/>`,
  `<circle cx="22" cy="45" r="6"/><circle cx="42" cy="45" r="6"/><path d="M26 40 L42 14 M38 40 L22 14"/>`,
  `<path d="M22 14 V50 M17 14 V27 Q17 33 22 33 Q27 33 27 27 V14"/><path d="M43 50 V14 Q52 22 43 34"/>`,
  `<path d="M27 44 V20 L45 16 V40"/><circle cx="22" cy="44" r="5"/><circle cx="40" cy="40" r="5"/>`,
  `<path d="M14 40 C20 28 28 24 32 14 C36 24 44 28 50 40 C44 36 38 36 32 44 C26 36 20 36 14 40Z"/>`,
];
export const iconSvg = (i: number, id: string) =>
  `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect class="cn-ic-box" x="2" y="2" width="60" height="60" rx="15" pathLength="1" fill="none" stroke="url(#${id})" stroke-width="1.6"/><g fill="none" stroke="url(#${id})" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="cn-ic-g">${ICONS[i % ICONS.length].replace(/<(circle|path|ellipse)/g, '<$1 pathLength="1"')}</g></svg>`;

/* share-button logos (simple marks, drawn here) */
export const LOGOS = {
  telegram: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.5 3.6 2.9 10.8c-.9.4-.9 1.1-.2 1.3l4.8 1.5 1.8 5.6c.2.6.5.7 1 .4l2.7-2.2 5 3.7c.9.5 1.6.2 1.8-.9L22.9 4.9c.3-1.2-.5-1.7-1.4-1.3ZM8.6 13.2l9.6-6c.5-.3.9-.1.5.2l-8 7.2-.3 3.3-1.8-4.7Z"/></svg>`,
  messenger: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2C6.4 2 2 6.2 2 11.5c0 2.9 1.3 5.5 3.4 7.2V22l3.1-1.7c1 .3 2.3.4 3.5.4 5.6 0 10-4.2 10-9.2S17.6 2 12 2Zm1 12.4-2.5-2.7-4.9 2.7 5.4-5.7 2.6 2.7 4.8-2.7-5.4 5.7Z"/></svg>`,
  facebook: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 22v-8.2h2.8l.5-3.3h-3.3V8.6c0-1 .4-1.7 1.8-1.7h1.6V4.1c-.3 0-1.3-.1-2.4-.1-2.5 0-4.1 1.5-4.1 4.2v2.300H7.600v3.300h2.800V22h3.100Z"/></svg>`,
  link: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.200 7 13 7 13s7-7.800 7-13a7 7 0 0 0-7-7Zm0 9.500A2.500 2.500 0 1 1 12 6.500a2.500 2.500 0 0 1 0 5Z"/></svg>`,
  cal: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 7h16M7 3v4M17 3v4M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM8 12h3v3H8z"/></svg>`,
  save: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 4v11m0 0 4-4m-4 4-4-4M5 20h14"/></svg>`,
};
