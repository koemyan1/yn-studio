import React from 'react';
import type { Canvas, El, Page } from './InviteCanvas';

/* =====================================================================================================
   Decorative artwork for the invitation canvas (drawn in code, every colour editable) and the
   "Khmer Gold" starter template: gold arch frames on warm paper, lotus flowers, a crest, a dotted
   timeline, arch-shaped photos and a Khmer-digit countdown.
   ===================================================================================================== */

export type ArtKey =
  | 'arch' | 'lotus' | 'divider' | 'emblem' | 'corner' | 'path' | 'sparkle'
  | 'ic-heart' | 'ic-rings' | 'ic-scissors' | 'ic-food' | 'ic-music' | 'ic-flower' | 'ic-sun';

export const ART_LIST: { key: ArtKey; label: string; w: number; h: number; color: string; color2: string }[] = [
  { key: 'arch', label: 'Gold arch frame', w: 350, h: 780, color: '#d7a94b', color2: '#fdf0e9' },
  { key: 'lotus', label: 'Lotus flower', w: 120, h: 90, color: '#c98aa0', color2: '#f7c9d6' },
  { key: 'emblem', label: 'Crest / emblem', w: 90, h: 117, color: '#c8943a', color2: '#fff6e2' },
  { key: 'divider', label: 'Ornament divider', w: 260, h: 22, color: '#c8943a', color2: '#c8943a' },
  { key: 'corner', label: 'Corner flourish', w: 70, h: 70, color: '#c8943a', color2: '#c8943a' },
  { key: 'path', label: 'Dotted path', w: 200, h: 420, color: '#c9a56a', color2: '#c9a56a' },
  { key: 'sparkle', label: 'Sparkle', w: 28, h: 28, color: '#f5d77a', color2: '#f5d77a' },
  { key: 'ic-heart', label: 'Icon: heart', w: 52, h: 52, color: '#c8943a', color2: '#fff6e2' },
  { key: 'ic-rings', label: 'Icon: rings', w: 52, h: 52, color: '#c8943a', color2: '#fff6e2' },
  { key: 'ic-scissors', label: 'Icon: scissors', w: 52, h: 52, color: '#c8943a', color2: '#fff6e2' },
  { key: 'ic-food', label: 'Icon: dinner', w: 52, h: 52, color: '#c8943a', color2: '#fff6e2' },
  { key: 'ic-music', label: 'Icon: music', w: 52, h: 52, color: '#c8943a', color2: '#fff6e2' },
  { key: 'ic-flower', label: 'Icon: flower', w: 52, h: 52, color: '#c8943a', color2: '#fff6e2' },
  { key: 'ic-sun', label: 'Icon: sun', w: 52, h: 52, color: '#c8943a', color2: '#fff6e2' },
];

/* concave-cornered arch with a small bump top and bottom */
const ARCH = 'M60 0 L150 0 Q175 -20 200 0 L290 0 A60 60 0 0 0 350 60 L350 720 A60 60 0 0 0 290 780 L200 780 Q175 800 150 780 L60 780 A60 60 0 0 0 0 720 L0 60 A60 60 0 0 0 60 0 Z';

const petal = (rot: number, s: number, c: string, c2: string, k: string | number) => (
  <g key={k} transform={`rotate(${rot} 60 80) translate(60 80) scale(${s}) translate(-60 -80)`}>
    <path d="M60 8 C74 30 74 58 60 80 C46 58 46 30 60 8 Z" fill={c2} stroke={c} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M60 20 C63 38 63 55 60 70" fill="none" stroke={c} strokeWidth="1.2" opacity=".6" />
  </g>
);

function Glyph({ art, c }: { art: ArtKey; c: string }) {
  const p = { fill: 'none', stroke: c, strokeWidth: 2.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (art) {
    case 'ic-heart': return <path {...p} d="M32 47 C13 34 15 20 25 19 C29 18.5 31 21 32 23.5 C33 21 35 18.5 39 19 C49 20 51 34 32 47 Z" />;
    case 'ic-rings': return <g {...p}><circle cx="25" cy="38" r="10" /><circle cx="39" cy="38" r="10" /><path d="M28 21 L32 15 L36 21 Z" /></g>;
    case 'ic-scissors': return <g {...p}><circle cx="22" cy="45" r="6" /><circle cx="42" cy="45" r="6" /><path d="M26 40 L42 14 M38 40 L22 14" /></g>;
    case 'ic-food': return <g {...p}><path d="M22 14 V50 M17 14 V27 Q17 33 22 33 Q27 33 27 27 V14" /><path d="M43 50 V14 Q52 22 43 34" /></g>;
    case 'ic-music': return <g {...p}><path d="M27 44 V20 L45 16 V40" /><circle cx="22" cy="44" r="5" /><circle cx="40" cy="40" r="5" /></g>;
    case 'ic-flower': return <g {...p}><circle cx="32" cy="32" r="5" />{[0, 72, 144, 216, 288].map(a => <ellipse key={a} cx="32" cy="19" rx="5" ry="8" transform={`rotate(${a} 32 32)`} />)}</g>;
    case 'ic-sun': return <g {...p}><circle cx="32" cy="32" r="9" />{[0, 45, 90, 135, 180, 225, 270, 315].map(a => <path key={a} d="M32 12 V18" transform={`rotate(${a} 32 32)`} />)}</g>;
    default: return null;
  }
}

export function ArtSvg({ art, color = '#c8943a', color2 = '#fff6e2' }: { art: string; color?: string; color2?: string }) {
  const k = art as ArtKey;
  const common = { width: '100%', height: '100%', style: { overflow: 'visible' as const, display: 'block' } };
  if (k === 'arch') {
    return (
      <svg {...common} viewBox="0 0 350 780" preserveAspectRatio="none">
        <path d={ARCH} fill={color2} stroke={color} strokeWidth="4" strokeLinejoin="round" />
        <path d={ARCH} fill="none" stroke={color} strokeWidth="1.6" transform="translate(175 390) scale(.94 .955) translate(-175 -390)" />
        {[[0, 0], [350, 0], [0, 780], [350, 780]].map(([x, y]) => (
          <g key={`${x}${y}`} fill="none" stroke={color} strokeWidth="1.6" opacity=".9">
            <circle cx={x} cy={y} r="42" /><circle cx={x} cy={y} r="30" strokeDasharray="2 5" strokeLinecap="round" /><circle cx={x} cy={y} r="8" fill={color} />
          </g>))}
      </svg>
    );
  }
  if (k === 'lotus') {
    return (
      <svg {...common} viewBox="0 0 120 90" preserveAspectRatio="xMidYMid meet">
        {petal(-68, .86, color, color2, 'a')}{petal(68, .86, color, color2, 'b')}{petal(-36, .94, color, color2, 'c')}{petal(36, .94, color, color2, 'd')}{petal(0, 1, color, color2, 'e')}
        <path d="M30 82 Q60 90 90 82" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (k === 'divider') {
    return (
      <svg {...common} viewBox="0 0 300 24" preserveAspectRatio="xMidYMid meet">
        <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round">
          <path d="M0 12 H110" /><path d="M190 12 H300" />
          <path d="M122 12 C118 3 108 3 108 12 C108 18 116 18 118 13" /><path d="M178 12 C182 3 192 3 192 12 C192 18 184 18 182 13" />
        </g>
        <path d="M150 2 L159 12 L150 22 L141 12 Z" fill={color} />
        <circle cx="130" cy="12" r="2.4" fill={color} /><circle cx="170" cy="12" r="2.4" fill={color} />
      </svg>
    );
  }
  if (k === 'emblem') {
    const leaves = Array.from({ length: 16 }, (_, i) => i * 22.5);
    return (
      <svg {...common} viewBox="0 0 100 130" preserveAspectRatio="xMidYMid meet">
        <path d="M50 3 C62 20 94 40 94 76 C94 106 74 126 50 126 C26 126 6 106 6 76 C6 40 38 20 50 3 Z" fill={color2} stroke={color} strokeWidth="2.6" />
        <path d="M50 3 C62 20 94 40 94 76 C94 106 74 126 50 126 C26 126 6 106 6 76 C6 40 38 20 50 3 Z" fill="none" stroke={color} strokeWidth="1.2" transform="translate(50 76) scale(.86) translate(-50 -76)" />
        <path d="M50 -6 C54 2 58 4 62 8 M50 -6 C46 2 42 4 38 8" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
        {leaves.map(a => <ellipse key={a} cx="50" cy="52" rx="3.4" ry="9" fill={color} opacity=".85" transform={`rotate(${a} 50 78)`} />)}
        <circle cx="50" cy="78" r="17" fill={color2} stroke={color} strokeWidth="2" />
      </svg>
    );
  }
  if (k === 'corner') {
    return (
      <svg {...common} viewBox="0 0 80 80" preserveAspectRatio="xMidYMid meet">
        <g fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round">
          <path d="M4 78 V32 C4 15 15 4 32 4 H78" /><path d="M16 78 V38 C16 26 26 16 38 16 H78" opacity=".7" />
          <path d="M26 26 C26 34 34 34 34 26 C34 20 28 20 28 25" />
        </g>
        <circle cx="4" cy="4" r="3.4" fill={color} />
      </svg>
    );
  }
  if (k === 'path') {
    return (
      <svg {...common} viewBox="0 0 200 420" preserveAspectRatio="none">
        <path d="M100 0 C20 50 20 110 100 150 S180 240 100 280 S20 360 100 420" fill="none" stroke={color} strokeWidth="3.2" strokeLinecap="round" strokeDasharray="0.1 9" />
      </svg>
    );
  }
  if (k === 'sparkle') {
    return <svg {...common} viewBox="0 0 40 40"><path d="M20 0 C22 12 28 18 40 20 C28 22 22 28 20 40 C18 28 12 22 0 20 C12 18 18 12 20 0 Z" fill={color} /></svg>;
  }
  if (k.startsWith('ic-')) {
    return (
      <svg {...common} viewBox="0 0 64 64">
        <rect x="2" y="2" width="60" height="60" rx="15" fill={color2} stroke={color} strokeWidth="2.2" />
        <rect x="7" y="7" width="50" height="50" rx="11" fill="none" stroke={color} strokeWidth="1" opacity=".55" />
        <Glyph art={k} c={color} />
      </svg>
    );
  }
  return null;
}

/* ------------------------------------------------------------------ Khmer Gold starter template ------------------------------------------------------------------ */

const uid = () => Math.random().toString(36).slice(2, 10);
const GOLD = '#b07d2b', INK = '#4a3326', LINE = '#d7a94b', PAPER = '#fdf0e9';

const base = (o: Partial<El> & Pick<El, 'type' | 'x' | 'y' | 'w' | 'h'>): El => ({ id: uid(), rot: 0, opacity: 1, anim: 'none', delay: 0, ...o });
const text = (t: string, x: number, y: number, w: number, o: Partial<El> = {}): El =>
  base({ type: 'text', text: t, x, y, w, h: 40, font: 'kantumruy', size: 16, color: INK, align: 'center', lh: 1.7, ...o });
const art = (key: ArtKey, x: number, y: number, w: number, h: number, o: Partial<El> = {}): El => {
  const d = ART_LIST.find(a => a.key === key)!;
  return base({ type: 'art', art: key, x, y, w, h, color: d.color, color2: d.color2, ...o });
};
const frame = (): El => art('arch', 20, 36, 350, 780, { color: LINE, color2: PAPER });
const page = (els: El[], h = 844): Page => ({ id: uid(), h, bg: '#a58a35', bg2: '#c8a84e', els });
const lotusPair = (y = 742): El[] => [
  art('lotus', 36, y, 118, 80, { color: '#c98aa0', color2: '#f7c9d6', anim: 'up', delay: 0.2 }),
  art('lotus', 236, y, 118, 80, { color: '#c98aa0', color2: '#f7c9d6', flip: true, anim: 'up', delay: 0.35 }),
];
const sparkles = (): El[] => [
  art('sparkle', 60, 90, 22, 22, { color: '#f5d77a', anim: 'twinkle', delay: 0 }),
  art('sparkle', 305, 150, 16, 16, { color: '#f5d77a', anim: 'twinkle', delay: 1.1 }),
  art('sparkle', 320, 70, 12, 12, { color: '#fff1b8', anim: 'twinkle', delay: 0.5 }),
];

export function khmerGold(): Canvas {
  /* 1 — save the date */
  const p1 = page([
    frame(), ...sparkles(),
    text('សិរីមង្គល', 45, 120, 300, { font: 'moulpali', size: 22, color: GOLD, anim: 'fade' }),
    text('បុណ្យអាពាហ៍ពិពាហ៍', 40, 170, 310, { font: 'moul', size: 40, color: GOLD, lh: 1.7, anim: 'zoom', delay: 0.3, shadow: false }),
    art('divider', 65, 330, 260, 22, { anim: 'revealL', delay: 0.6 }),
    text('Save the Date', 45, 372, 300, { font: 'cormorant', size: 32, color: INK, anim: 'up', delay: 0.7 }),
    text('{dateNum}', 45, 424, 300, { font: 'outfit', size: 26, color: GOLD, bold: true, ls: 3, anim: 'up', delay: 0.9 }),
    art('emblem', 150, 490, 90, 117, { anim: 'glow', delay: 0 }),
    text('{groom}  &  {bride}', 30, 640, 330, { font: 'moul', size: 22, color: GOLD, lh: 1.8, anim: 'fade', delay: 1.1 }),
    ...lotusPair(),
  ]);

  /* 2 — the invitation wording */
  const p2 = page([
    frame(),
    art('emblem', 150, 76, 90, 117, { anim: 'zoom' }),
    text('ឪពុកម្តាយខាងកូនប្រុស', 42, 212, 150, { size: 12, color: GOLD, bold: true, anim: 'right' }),
    text('{groomParents}', 42, 236, 150, { size: 14, anim: 'right', delay: 0.1 }),
    text('ឪពុកម្តាយខាងកូនស្រី', 198, 212, 150, { size: 12, color: GOLD, bold: true, anim: 'left' }),
    text('{brideParents}', 198, 236, 150, { size: 14, anim: 'left', delay: 0.1 }),
    text('សូមគោរពអញ្ជើញ', 45, 318, 300, { font: 'moulpali', size: 26, color: GOLD, anim: 'fade', delay: 0.3 }),
    text('ជាមួយក្រុមគ្រួសារទាំងសងខាង យើងខ្ញុំសូមគោរពអញ្ជើញលោក លោកស្រី អ្នកនាង អញ្ជើញចូលរួមជាភ្ញៀវកិត្តិយស ក្នុងពិធីមង្គលអាពាហ៍ពិពាហ៍កូនប្រុស កូនស្រីរបស់យើងខ្ញុំ', 48, 372, 294, { size: 14, lh: 1.9, anim: 'up', delay: 0.4 }),
    text('{groom}', 42, 500, 150, { font: 'moul', size: 20, color: GOLD, lh: 1.8, anim: 'right', delay: 0.5 }),
    text('និង', 160, 504, 70, { font: 'moulpali', size: 16, color: INK, anim: 'fade', delay: 0.6 }),
    text('{bride}', 198, 500, 150, { font: 'moul', size: 20, color: GOLD, lh: 1.8, anim: 'left', delay: 0.5 }),
    art('divider', 65, 580, 260, 22, { anim: 'revealL', delay: 0.7 }),
    text('ដែលនឹងប្រព្រឹត្តទៅនៅ', 45, 622, 300, { size: 15, anim: 'fade', delay: 0.8 }),
    text('{date}', 35, 654, 320, { font: 'moulpali', size: 20, color: GOLD, lh: 1.8, anim: 'up', delay: 0.9 }),
    text('{venue}', 50, 716, 290, { size: 14, anim: 'fade', delay: 1 }),
    ...lotusPair(748).map(e => ({ ...e, y: 762, w: 96, h: 64 })),
  ]);

  /* 3 — countdown */
  const p3 = page([
    frame(), ...sparkles(),
    art('emblem', 150, 100, 90, 117, { anim: 'float' }),
    text('ថ្ងៃមង្គលការ', 45, 250, 300, { font: 'moulpali', size: 26, color: GOLD, anim: 'fade' }),
    base({ type: 'countdown', x: 40, y: 330, w: 310, h: 110, color: INK, size: 40, font: 'outfit', cdStyle: 'plain', cdDigits: 'km', cdLang: 'km', anim: 'zoom', delay: 0.3 }),
    base({ type: 'button', x: 95, y: 490, w: 200, h: 48, text: 'បន្ថែមទៅប្រតិទិន', bg: 'rgba(0,0,0,0)', color: GOLD, size: 15, font: 'kantumruy', radius: 999, action: 'calendar', value: '', bold: true, bc: GOLD, bw: 1.5, anim: 'up', delay: 0.6 }),
    art('divider', 65, 580, 260, 22, { anim: 'revealL', delay: 0.6 }),
    text('ការរង់ចាំគឺជាសេចក្តីអំណរ\nយើងរង់ចាំអបអរជាមួយលោកអ្នក', 45, 624, 300, { size: 15, lh: 1.9, anim: 'fade', delay: 0.8 }),
    ...lotusPair(),
  ]);

  /* 4 — photos that drift as you scroll */
  const p4 = page([
    frame(),
    text('រូបភាពអនុស្សាវរីយ៍', 45, 96, 300, { font: 'moulpali', size: 24, color: GOLD, anim: 'fade' }),
    base({ type: 'image', x: 44, y: 160, w: 148, h: 270, fit: 'cover', arch: true, anim: 'kenburns', dur: 14, par: -40, bc: '#fff', bw: 4 }),
    base({ type: 'image', x: 198, y: 215, w: 148, h: 270, fit: 'cover', arch: true, anim: 'kenburns', dur: 16, par: 40, bc: '#fff', bw: 4 }),
    base({ type: 'image', x: 62, y: 520, w: 266, h: 190, fit: 'cover', radius: 20, anim: 'revealL', delay: 0.2, par: -20, bc: '#fff', bw: 4 }),
    art('sparkle', 330, 520, 20, 20, { anim: 'twinkle' }),
    ...lotusPair().map(e => ({ ...e, y: 748, w: 100, h: 66 })),
  ]);

  /* 5 — programme timeline (dotted path with icon boxes) */
  const steps: [ArtKey, string, string][] = [
    ['ic-flower', 'ម៉ោង ៦:០០ ព្រឹក', 'ពិធីសូត្រមន្ត'],
    ['ic-rings', 'ម៉ោង ៧:៣០ ព្រឹក', 'ពិធីជាវខាន់ស្លា'],
    ['ic-sun', 'ម៉ោង ៩:០០ ព្រឹក', 'ពិធីហែជំនូន'],
    ['ic-heart', 'ម៉ោង ១០:៣០ ព្រឹក', 'ពិធីចងដៃ'],
    ['ic-scissors', 'ម៉ោង ១១:៣០ ព្រឹក', 'ពិធីកាត់សក់'],
    ['ic-food', 'ម៉ោង ៥:០០ ល្ងាច', 'ពិធីពិសាភោជនាហារ'],
  ];
  const tl: El[] = [];
  steps.forEach(([ic, time, name], i) => {
    const y = 218 + i * 92, left = i % 2 === 0;
    tl.push(art(ic, left ? 60 : 278, y, 52, 52, { anim: 'zoom', delay: 0.1 + i * 0.12 }));
    tl.push(text(time, left ? 122 : 98, y + 2, 170, { size: 12, color: GOLD, bold: true, align: left ? 'left' : 'right', anim: left ? 'right' : 'left', delay: 0.15 + i * 0.12 }));
    tl.push(text(name, left ? 122 : 98, y + 24, 170, { font: 'moulpali', size: 15, color: INK, align: left ? 'left' : 'right', lh: 1.7, anim: left ? 'right' : 'left', delay: 0.2 + i * 0.12 }));
  });
  const p5 = page([
    frame(),
    text('កម្មវិធីមង្គលការ', 45, 90, 300, { font: 'moulpali', size: 26, color: GOLD, anim: 'fade' }),
    text('{date}', 35, 142, 320, { font: 'moul', size: 14, color: GOLD, lh: 1.8, anim: 'fade', delay: 0.2 }),
    art('path', 95, 200, 200, 520, { anim: 'fade', delay: 0.3 }),
    ...tl,
  ]);

  /* 6 — map */
  const p6 = page([
    frame(), ...sparkles(),
    text('ទីតាំងកម្មវិធី', 45, 100, 300, { font: 'moulpali', size: 26, color: GOLD, anim: 'fade' }),
    base({ type: 'image', x: 50, y: 170, w: 290, h: 230, fit: 'cover', radius: 22, anim: 'zoom', delay: 0.2, bc: '#fff', bw: 4 }),
    text('{venue}', 50, 430, 290, { font: 'moulpali', size: 17, color: INK, lh: 1.8, anim: 'up', delay: 0.4 }),
    base({ type: 'button', x: 70, y: 520, w: 250, h: 52, text: 'បើកក្នុង Google Maps', bg: GOLD, color: '#ffffff', size: 16, font: 'kantumruy', radius: 999, action: 'map', value: '{mapUrl}', bold: true, anim: 'up', delay: 0.6 }),
    art('divider', 65, 620, 260, 22, { anim: 'revealL', delay: 0.7 }),
    ...lotusPair(),
  ]);

  /* 7 — thanks + contact */
  const p7 = page([
    frame(), ...sparkles(),
    art('emblem', 150, 120, 90, 117, { anim: 'float' }),
    text('សូមអរគុណ', 45, 270, 300, { font: 'moul', size: 34, color: GOLD, lh: 1.7, anim: 'zoom', delay: 0.2 }),
    text('យើងខ្ញុំរង់ចាំអបអរសាទរជាមួយលោកអ្នក\nនៅក្នុងថ្ងៃដ៏មានសារៈសំខាន់នេះ', 45, 370, 300, { size: 15, lh: 1.9, anim: 'fade', delay: 0.5 }),
    art('divider', 65, 470, 260, 22, { anim: 'revealL', delay: 0.6 }),
    base({ type: 'button', x: 80, y: 520, w: 230, h: 50, text: 'ទូរស័ព្ទមក', bg: GOLD, color: '#ffffff', size: 16, font: 'kantumruy', radius: 999, action: 'tel', value: '{phone}', bold: true, anim: 'up', delay: 0.7 }),
    base({ type: 'button', x: 80, y: 586, w: 230, h: 50, text: 'Telegram', bg: 'rgba(0,0,0,0)', color: GOLD, size: 16, font: 'outfit', radius: 999, action: 'telegram', value: '{telegram}', bold: true, bc: GOLD, bw: 1.5, anim: 'up', delay: 0.85 }),
    ...lotusPair(),
  ]);

  return { pages: [p1, p2, p3, p4, p5, p6, p7] };
}
