import React from 'react';
import { tr } from './lang';

/* ---------------------------------------------------------------------------------------------
   Animated scenes for the "Payment received" screen. One scene per payment type:
   - order      : the item drops into a box, the flaps close, tape seals it, the box hops.
   - wallet     : a banknote showing the amount (plus coins) flies into a wallet.
   - debt       : a jar fills with the debt, then a chunk is scooped out (what the customer paid).
   - debtClear  : a paper that says DEBT shakes and is ripped in two, then a big tick.
   All motion lives in paymentScenes.css (switched off by prefers-reduced-motion).
   --------------------------------------------------------------------------------------------- */

export type SceneKind = 'order' | 'wallet' | 'debt' | 'debtClear';

const css = (o: Record<string, string | number>) => o as React.CSSProperties;

/** Check mark badge that pops in. (x, y) is its centre, r its radius, delay when it appears. */
function Tick({ x, y, r, delay }: { x: number; y: number; r: number; delay: string }) {
  const d = `M${(-r * 0.45).toFixed(2)} ${(r * 0.02).toFixed(2)}l${(r * 0.33).toFixed(2)} ${(r * 0.33).toFixed(2)} ${(r * 0.6).toFixed(2)} ${(-r * 0.66).toFixed(2)}`;
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="pdsTick" style={css({ '--td': delay })}>
        <circle r={r} fill="#16a34a" />
        <path d={d} pathLength={1} strokeWidth={(r * 0.26).toFixed(2)} />
      </g>
    </g>
  );
}

function Sparks({ cx, cy, delay }: { cx: number; cy: number; delay: string }) {
  const pts = [[-46, -26], [-26, -44], [0, -50], [28, -44], [48, -24], [60, -4]];
  return (
    <g aria-hidden="true">
      {pts.map(([dx, dy], i) => (
        <circle key={i} className="pdSpark" cx={cx} cy={cy} r={i % 2 ? 3 : 4.5}
          fill={i % 2 ? '#ffffff' : '#facc15'}
          style={css({ '--dx': dx + 'px', '--dy': dy + 'px', '--sd': `calc(${delay} + ${i * 35}ms)` })} />
      ))}
    </g>
  );
}

/* ---------- 1. order: item goes into a box ---------- */
function OrderScene() {
  return (
    <svg className="pdSvg pdOrder" viewBox="0 0 240 170" aria-hidden="true">
      <defs>
        <linearGradient id="pdBoxF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e7b57c" /><stop offset="1" stopColor="#c68a4d" /></linearGradient>
        <linearGradient id="pdItemG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#d946ef" /></linearGradient>
      </defs>
      <ellipse className="pdShadow" cx="120" cy="154" rx="66" ry="7" />
      <g className="pdBoxIn"><g className="pdHop">
        <rect x="60" y="88" width="120" height="14" rx="3" fill="#6b4220" />
        <g className="pdItemFall"><g className="pdItemTilt">
          <rect x="97" y="100" width="46" height="46" rx="11" fill="url(#pdItemG)" />
          <rect x="104" y="107" width="32" height="32" rx="16" fill="#fff" />
          <image href="/yn-logo.png" x="108" y="111" width="24" height="24" preserveAspectRatio="xMidYMid meet" />
        </g></g>
        <rect x="60" y="94" width="120" height="56" rx="5" fill="url(#pdBoxF)" />
        <rect x="60" y="94" width="120" height="7" fill="#000" opacity=".1" />
        <rect x="60" y="143" width="120" height="7" rx="3" fill="#000" opacity=".08" />
        <rect className="pdFlap l" x="60" y="86" width="60" height="10" rx="2" fill="#f0c58c" />
        <rect className="pdFlap r" x="120" y="86" width="60" height="10" rx="2" fill="#e8b878" />
        <rect className="pdTape" x="114" y="86" width="12" height="36" rx="2" fill="#fde68a" />
      </g></g>
      <Sparks cx={120} cy={88} delay="2.1s" />
      <Tick x={196} y={80} r={15} delay="2.3s" />
    </svg>
  );
}

/* ---------- 2. wallet top-up: money with the amount flies into the wallet ---------- */
function WalletScene({ amountText }: { amountText: string }) {
  const fs = amountText.length <= 6 ? 15 : amountText.length <= 9 ? 12 : 10;
  const coins = [
    { x: 104, sx: '-70px', sy: '-80px', mx: '-14px', d: '.6s' },
    { x: 120, sx: '-110px', sy: '-60px', mx: '0px', d: '.78s' },
    { x: 136, sx: '-40px', sy: '-100px', mx: '14px', d: '.96s' },
  ];
  return (
    <svg className="pdSvg pdWallet" viewBox="0 0 240 170" aria-hidden="true">
      <defs>
        <linearGradient id="pdWalG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#6d28d9" /></linearGradient>
        <linearGradient id="pdBillG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4ade80" /><stop offset="1" stopColor="#16a34a" /></linearGradient>
        <radialGradient id="pdCoinG" cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#fde68a" /><stop offset="1" stopColor="#f59e0b" /></radialGradient>
      </defs>
      <ellipse className="pdShadow" cx="120" cy="154" rx="68" ry="7" />
      <circle className="pdPulse" cx="120" cy="108" r="44" />
      <g className="pdWalIn"><g className="pdWalJig">
        <rect x="58" y="76" width="124" height="74" rx="16" fill="#4c1d95" />
        {coins.map((c, i) => (
          <g key={i} className="pdCoin" style={css({ '--sx': c.sx, '--sy': c.sy, '--mx': c.mx, animationDelay: c.d })}>
            <circle cx={c.x} cy={118} r={9} fill="url(#pdCoinG)" stroke="#d97706" strokeWidth="1.5" />
            <circle cx={c.x} cy={118} r={5} fill="none" stroke="#d97706" strokeWidth="1" opacity=".7" />
          </g>
        ))}
        <g className="pdBill">
          <rect x="82" y="94" width="76" height="38" rx="6" fill="url(#pdBillG)" stroke="#15803d" strokeWidth="1.5" />
          <rect x="86" y="98" width="68" height="30" rx="4" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="1" strokeDasharray="3 3" />
          <circle cx="92" cy="113" r="3" fill="#fff" fillOpacity=".7" />
          <circle cx="148" cy="113" r="3" fill="#fff" fillOpacity=".7" />
          <text x="120" y={113 + fs * 0.36} textAnchor="middle" fontSize={fs} fontWeight="900" fill="#fff">{amountText}</text>
        </g>
        <rect x="58" y="88" width="124" height="62" rx="16" fill="url(#pdWalG)" />
        <path d="M72 101H168" stroke="#fff" strokeOpacity=".28" strokeWidth="2" strokeDasharray="4 5" fill="none" />
        <rect x="146" y="108" width="44" height="26" rx="13" fill="#5b21b6" />
        <circle cx="162" cy="121" r="6" fill="#fbbf24" />
      </g></g>
      <Sparks cx={120} cy={84} delay="1.95s" />
      <Tick x={196} y={74} r={15} delay="2.3s" />
    </svg>
  );
}

/* ---------- 3. debt paid in part: a jar fills, then a chunk is removed ---------- */
const JAR = 'M98 40 H142 V54 C162 60 168 74 168 92 V128 C168 140 160 148 148 148 H92 C80 148 72 140 72 128 V92 C72 74 78 60 98 54 Z';
const JH = 94; // interior height from the shoulder (y=54) to the bottom (y=148)

function JarScene({ amountText, frac }: { amountText: string; frac: number }) {
  const L0 = 0.88;
  const f = Math.min(Math.max(Number.isFinite(frac) ? frac : 0.5, 0), 1);
  const L1 = Math.max(0.08, Math.min(L0 * f, L0 - 0.1)); // always a visible drop
  const vars = css({ '--h': (JH + 14) + 'px', '--y0': (JH * (1 - L0)).toFixed(1) + 'px', '--y1': (JH * (1 - L1)).toFixed(1) + 'px' });
  return (
    <svg className="pdSvg pdJar" viewBox="0 0 240 170" style={vars} aria-hidden="true">
      <defs>
        <linearGradient id="pdLiqG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fb7185" /><stop offset="1" stopColor="#e11d48" /></linearGradient>
        <clipPath id="pdJarClip"><path d={JAR} /></clipPath>
      </defs>
      <ellipse className="pdShadow" cx="120" cy="156" rx="54" ry="6" />
      <g className="pdJarIn">
        <g clipPath="url(#pdJarClip)">
          <g className="pdLiquid">
            <rect x="60" y="54" width="120" height="120" fill="url(#pdLiqG)" />
            <g className="pdWave"><path d="M30 54q10-7 20 0t20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0v12H30z" fill="#fb7185" /></g>
            <circle className="pdBub" cx="100" cy="132" r="3.5" fill="#fff" fillOpacity=".5" />
            <circle className="pdBub b2" cx="132" cy="126" r="2.5" fill="#fff" fillOpacity=".5" />
            <circle className="pdBub b3" cx="116" cy="138" r="3" fill="#fff" fillOpacity=".45" />
          </g>
        </g>
        <path d={JAR} fill="#fff" fillOpacity=".14" stroke="#c4b5fd" strokeWidth="4" strokeLinejoin="round" />
        <path d="M84 72C80 92 80 110 84 128" stroke="#fff" strokeOpacity=".6" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M160 82h-9M160 102h-9M160 122h-9" stroke="#c4b5fd" strokeWidth="2.5" strokeLinecap="round" />
        <rect x="94" y="26" width="52" height="15" rx="5" fill="#a78bfa" />
        <rect x="98" y="30" width="20" height="3.5" rx="1.75" fill="#fff" fillOpacity=".5" />
      </g>
      <g className="pdChunk">
        <rect x="104" y="88" width="34" height="26" rx="11" fill="url(#pdLiqG)" />
        <rect x="109" y="92" width="11" height="5" rx="2.5" fill="#fff" fillOpacity=".6" />
      </g>
      <g transform="translate(150 20)">
        <g className="pdChip">
          <rect width="78" height="27" rx="13.5" fill="#16a34a" />
          <text x="39" y="18.5" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="900">{'\u2212' + amountText}</text>
        </g>
      </g>
    </svg>
  );
}

/* ---------- 4. debt fully paid: a paper that says DEBT is ripped in two ---------- */
const ZY = [20, 32.8, 45.6, 58.4, 71.2, 84, 96.8, 109.6, 122.4, 135.2, 148];
const ZX = [120, 115, 125, 116, 126, 115, 125, 117, 124, 116, 120];
const ZIG = ZY.map((y, i) => `${ZX[i]},${y}`).join(' ');
const SCRAPS = [
  [-34, 70, -140], [28, 90, 160], [-16, 110, -90], [44, 60, 200], [-48, 50, -200], [10, 120, 120],
  [-26, 96, 80], [38, 104, -170], [-6, 80, 240], [54, 84, -60],
];

function RipScene() {
  return (
    <svg className="pdSvg pdRip" viewBox="0 0 240 170" aria-hidden="true">
      <defs>
        <clipPath id="pdClipL"><polygon points={`0,0 120,0 ${ZIG} 120,170 0,170`} /></clipPath>
        <clipPath id="pdClipR"><polygon points={`240,0 120,0 ${ZIG} 120,170 240,170`} /></clipPath>
        <g id="pdPaperG">
          <rect x="72" y="20" width="96" height="128" rx="6" fill="#fff" stroke="#e5e7eb" strokeWidth="1.5" />
          <path d="M72 54V26a6 6 0 0 1 6-6H162a6 6 0 0 1 6 6V54Z" fill="#ef4444" />
          <text x="120" y="44" textAnchor="middle" fontSize="21" fontWeight="900" fill="#fff" letterSpacing="2">{tr('DEBT', '\u1794\u17c6\u178e\u17bb\u179b')}</text>
          <rect x="84" y="70" width="72" height="5" rx="2.5" fill="#d1d5db" />
          <rect x="84" y="83" width="72" height="5" rx="2.5" fill="#d1d5db" />
          <rect x="84" y="96" width="72" height="5" rx="2.5" fill="#d1d5db" />
          <rect x="84" y="109" width="44" height="5" rx="2.5" fill="#d1d5db" />
          <path d="M84 134q8-10 14-2t12-2 10 4" stroke="#9ca3af" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      </defs>
      <ellipse className="pdShadow" cx="120" cy="158" rx="50" ry="6" />
      <g className="pdPaperIn">
        <g className="pdHalf l"><use href="#pdPaperG" clipPath="url(#pdClipL)" /></g>
        <g className="pdHalf r"><use href="#pdPaperG" clipPath="url(#pdClipR)" /></g>
        <polyline className="pdCrack" points={ZIG} pathLength={1} />
      </g>
      {SCRAPS.map(([dx, dy, r], i) => (
        <rect key={i} className="pdScrap" x={116 + (i % 3) * 3} y={34 + i * 11} width="7" height="4" rx="1" fill="#fff" stroke="#d1d5db" strokeWidth=".8"
          style={css({ '--dx': dx + 'px', '--dy': dy + 'px', '--r': r + 'deg' })} />
      ))}
      <circle className="pdPulse" cx="120" cy="84" r="40" style={css({ animationDelay: '2.1s' })} />
      <Tick x={120} y={84} r={34} delay="2.05s" />
    </svg>
  );
}

export default function PaymentScene({ kind, amountText, frac }: { kind: SceneKind; amountText: string; frac?: number }) {
  if (kind === 'order') return <OrderScene />;
  if (kind === 'wallet') return <WalletScene amountText={amountText} />;
  if (kind === 'debtClear') return <RipScene />;
  return <JarScene amountText={amountText} frac={frac ?? 0.5} />;
}
