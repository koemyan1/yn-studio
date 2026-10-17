import React, { useEffect, useState } from 'react';
import PaymentScene from './PaymentScenes';
import './admin-scenes.css';

/* ---------------------------------------------------------------------------------------------
   Animated scenes for the ADMIN side, in the same illustrated style as the "Payment received"
   screens (PaymentScenes.tsx):
   1. <AdminSceneBanner/>  – a looping scene at the top of each admin page (hide / show chip, remembered).
   2. <AdminActionScene/>  – a one-shot celebration card after an admin action (order payment approved,
                             wallet deposit approved, debt payment recorded, product saved, coupon created).
                             Trigger it from anywhere with  adminScene({ kind, label, … }).
   All motion lives in admin-scenes.css (switched off by prefers-reduced-motion).
   --------------------------------------------------------------------------------------------- */

const css = (o: Record<string, string | number>) => o as React.CSSProperties;
const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ helpers */
/** Re-mounts its children every `every` ms so a one-shot PaymentScene plays again and again. */
function Replay({ children, every = 7200 }: { children: React.ReactNode; every?: number }) {
  const [k, setK] = useState(0);
  useEffect(() => {
    if (reduced()) return;
    const t = window.setInterval(() => { if (!document.hidden) setK(x => x + 1); }, every);
    return () => window.clearInterval(t);
  }, [every]);
  return <div key={k} className="asReplay">{children}</div>;
}

const Star = ({ x, y, s = 1, d = 0 }: { x: number; y: number; s?: number; d?: number }) => (
  <polygon className="asTwinkle" style={css({ '--d': d + 's' })}
    points={`${x},${y - 7 * s} ${x + 2 * s},${y - 2 * s} ${x + 7 * s},${y} ${x + 2 * s},${y + 2 * s} ${x},${y + 7 * s} ${x - 2 * s},${y + 2 * s} ${x - 7 * s},${y} ${x - 2 * s},${y - 2 * s}`}
    fill="#fbbf24" />
);

/* ------------------------------------------------------------------ scenes */
/* Dashboard: the YN shop – door opens, coins pop out, sun spins, cloud drifts */
function ShopScene() {
  return (
    <svg className="asSvg" viewBox="0 0 240 170" aria-hidden="true">
      <defs><linearGradient id="asShopG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#6d28d9" /></linearGradient>
        <radialGradient id="asCoinG" cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#fde68a" /><stop offset="1" stopColor="#f59e0b" /></radialGradient></defs>
      <g className="asSpin" style={css({ '--t': '14s' })}>
        <circle cx="38" cy="36" r="12" fill="#fde68a" />
        {Array.from({ length: 8 }).map((_, i) => <rect key={i} x="36.5" y="12" width="3" height="7" rx="1.5" fill="#fbbf24" transform={`rotate(${i * 45} 38 36)`} style={{ transformBox: 'view-box', transformOrigin: '0 0' }} />)}
      </g>
      <g className="asDrift"><ellipse cx="190" cy="34" rx="22" ry="8" fill="#fff" /><ellipse cx="178" cy="29" rx="11" ry="8" fill="#fff" /><ellipse cx="198" cy="28" rx="9" ry="7" fill="#fff" /></g>
      <ellipse className="asShadow" cx="120" cy="154" rx="84" ry="7" />
      <rect x="56" y="78" width="128" height="74" rx="6" fill="#fff" stroke="#e5e7eb" strokeWidth="2" />
      <rect x="68" y="102" width="28" height="24" rx="4" fill="#ddd6fe" /><rect x="144" y="102" width="28" height="24" rx="4" fill="#ddd6fe" />
      <g className="asSway">{Array.from({ length: 6 }).map((_, i) => <path key={i} d={`M${52 + i * 22.7} 58h22.7v22a11.35 11.35 0 0 1-22.7 0Z`} fill={i % 2 ? '#fff' : 'url(#asShopG)'} stroke="#6d28d9" strokeWidth="1" />)}</g>
      <rect x="104" y="104" width="32" height="48" rx="4" fill="#4c1d95" />
      <rect className="asDoor" x="104" y="104" width="32" height="48" rx="4" fill="#a78bfa" />
      <circle cx="120" cy="92" r="0" />
      {[[-26, 0], [0, 0.5], [24, 1]].map(([dx, d], i) => (
        <g key={i} className="asCoinUp" style={css({ '--dx': dx + 'px', '--d': d + 's' })}>
          <circle cx="120" cy="128" r="8" fill="url(#asCoinG)" stroke="#d97706" strokeWidth="1.5" /><circle cx="120" cy="128" r="4" fill="none" stroke="#d97706" strokeWidth="1" opacity=".7" />
        </g>
      ))}
    </svg>
  );
}

/* Categories: tags swinging from a rope */
function TagsScene() {
  const tags = [{ x: 70, y: 47.6, c: '#8b5cf6', d: 0 }, { x: 120, y: 51, c: '#f472b6', d: .5 }, { x: 170, y: 47.6, c: '#fbbf24', d: 1 }];
  return (
    <svg className="asSvg" viewBox="0 0 240 170" aria-hidden="true">
      <path d="M26 40Q120 62 214 40" fill="none" stroke="#9ca3af" strokeWidth="3" strokeLinecap="round" />
      {tags.map((t, i) => (
        <g key={i} className="asSwing" style={css({ '--d': t.d + 's', transformOrigin: '50% 0%' })}>
          <line x1={t.x} y1={t.y} x2={t.x} y2={t.y + 14} stroke="#9ca3af" strokeWidth="2" />
          <rect x={t.x - 21} y={t.y + 12} width="42" height="68" rx="9" fill={t.c} />
          <circle cx={t.x} cy={t.y + 24} r="4" fill="#fff" />
          <rect x={t.x - 12} y={t.y + 40} width="24" height="5" rx="2.5" fill="#fff" opacity=".85" />
          <rect x={t.x - 12} y={t.y + 51} width="16" height="5" rx="2.5" fill="#fff" opacity=".6" />
          <rect x={t.x - 12} y={t.y + 62} width="20" height="5" rx="2.5" fill="#fff" opacity=".6" />
        </g>
      ))}
      <ellipse className="asShadow" cx="120" cy="156" rx="70" ry="6" />
    </svg>
  );
}

/* Themes: palette with colour dots popping + a paint stroke drawing itself */
function PaletteScene() {
  const dots = [[84, 78, '#ef4444'], [112, 62, '#f59e0b'], [144, 62, '#22c55e'], [170, 80, '#3b82f6'], [100, 108, '#a855f7']];
  return (
    <svg className="asSvg" viewBox="0 0 240 170" aria-hidden="true">
      <ellipse className="asShadow" cx="120" cy="150" rx="74" ry="6" />
      <g className="asBobSlow">
        <path d="M120 36c-44 0-76 24-76 58 0 30 28 46 52 41 15-3 15-13 26-13 15 0 14 11 31 9 30-4 47-26 47-50 0-27-32-45-80-45z" fill="#f6dcb4" stroke="#d6a86b" strokeWidth="2" />
        <ellipse cx="146" cy="112" rx="9" ry="7" fill="#fff7e6" stroke="#d6a86b" strokeWidth="1.5" />
        {dots.map(([x, y, c], i) => <circle key={i} className="asPopLoop" style={css({ '--d': i * .35 + 's' })} cx={x as number} cy={y as number} r="9" fill={c as string} />)}
      </g>
      <path className="asDrawLoop" d="M52 146q68-26 136-2" fill="none" stroke="#d946ef" strokeWidth="6" strokeLinecap="round" pathLength={1} />
      <g className="asBrush"><rect x="188" y="122" width="7" height="32" rx="3" fill="#92400e" transform="rotate(35 191 138)" /><rect x="186" y="116" width="11" height="12" rx="3" fill="#d946ef" transform="rotate(35 191 138)" /></g>
    </svg>
  );
}

/* Product mascots: a happy blob jumping, blinking, with twinkling stars */
function MascotScene() {
  return (
    <svg className="asSvg" viewBox="0 0 240 170" aria-hidden="true">
      <defs><radialGradient id="asMasG" cx=".35" cy=".3" r=".9"><stop offset="0" stopColor="#c4b5fd" /><stop offset="1" stopColor="#7c3aed" /></radialGradient></defs>
      <ellipse className="asShadow asShadowJump" cx="120" cy="152" rx="40" ry="6" />
      <g className="asJump">
        <circle cx="92" cy="72" r="12" fill="#a78bfa" /><circle cx="148" cy="72" r="12" fill="#a78bfa" />
        <circle cx="120" cy="106" r="44" fill="url(#asMasG)" />
        <g className="asBlink"><circle cx="104" cy="100" r="6" fill="#fff" /><circle cx="136" cy="100" r="6" fill="#fff" /><circle cx="105" cy="101" r="3" fill="#1f1235" /><circle cx="137" cy="101" r="3" fill="#1f1235" /></g>
        <circle cx="94" cy="116" r="6" fill="#f9a8d4" opacity=".8" /><circle cx="146" cy="116" r="6" fill="#f9a8d4" opacity=".8" />
        <path d="M110 118q10 10 20 0" fill="none" stroke="#1f1235" strokeWidth="3" strokeLinecap="round" />
      </g>
      <Star x={44} y={52} s={1.2} /><Star x={196} y={44} s={1} d={.7} /><Star x={200} y={110} s={.8} d={1.3} /><Star x={36} y={118} s={.8} d={.4} />
    </svg>
  );
}

/* Banners: three picture frames take turns popping forward */
function FramesScene() {
  return (
    <svg className="asSvg" viewBox="0 0 240 170" aria-hidden="true">
      <defs><linearGradient id="asFrG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#c4b5fd" /><stop offset="1" stopColor="#f0abfc" /></linearGradient></defs>
      {[0, 1, 2].map(i => (
        <g key={i} className="asFrame" style={css({ '--d': i * 1.4 + 's' })}>
          <rect x={26 + i * 66} y="38" width="62" height="84" rx="10" fill="#fff" stroke="#e5e7eb" strokeWidth="2" />
          <rect x={32 + i * 66} y="44" width="50" height="50" rx="6" fill="url(#asFrG)" />
          <circle cx={46 + i * 66} cy="58" r="6" fill="#fff" opacity=".9" />
          <path d={`M${32 + i * 66} 94l16-20 10 12 8-8 16 16z`} fill="#8b5cf6" opacity=".75" />
          <rect x={34 + i * 66} y="102" width="40" height="5" rx="2.5" fill="#d1d5db" /><rect x={34 + i * 66} y="111" width="26" height="5" rx="2.5" fill="#e5e7eb" />
        </g>
      ))}
      {[0, 1, 2].map(i => <circle key={i} className="asDotHi" style={css({ '--d': i * 1.4 + 's' })} cx={108 + i * 12} cy="144" r="3.5" fill="#8b5cf6" />)}
    </svg>
  );
}

/* Coupons: a wiggling ticket with a shine sweep */
function TicketScene({ burst = false }: { burst?: boolean }) {
  return (
    <svg className="asSvg" viewBox="0 0 240 170" aria-hidden="true">
      <defs><linearGradient id="asTkG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#d946ef" /></linearGradient>
        <clipPath id="asTkClip"><rect x="40" y="50" width="160" height="76" rx="12" /></clipPath></defs>
      <ellipse className="asShadow" cx="120" cy="148" rx="70" ry="6" />
      <g className="asWiggle">
        <rect x="40" y="50" width="160" height="76" rx="12" fill="url(#asTkG)" />
        <circle className="asNotch" cx="40" cy="88" r="9" /><circle className="asNotch" cx="200" cy="88" r="9" />
        <line x1="148" y1="58" x2="148" y2="118" stroke="#fff" strokeOpacity=".6" strokeWidth="2" strokeDasharray="4 5" />
        <text x="92" y="100" textAnchor="middle" fontSize="40" fontWeight="900" fill="#fff">%</text>
        <rect x="158" y="76" width="30" height="6" rx="3" fill="#fff" opacity=".85" /><rect x="158" y="90" width="22" height="6" rx="3" fill="#fff" opacity=".6" />
        <g clipPath="url(#asTkClip)"><rect className="asShine" x="40" y="40" width="26" height="100" fill="#fff" opacity=".35" /></g>
      </g>
      <Star x={34} y={40} /><Star x={206} y={40} s={1.2} d={.5} /><Star x={206} y={134} s={.8} d={1} />
      {burst && <circle className="asPulseRing" cx="120" cy="88" r="50" />}
    </svg>
  );
}

/* Orders: a delivery truck driving along a moving road */
function TruckScene() {
  return (
    <svg className="asSvg" viewBox="0 0 240 170" aria-hidden="true">
      <g className="asDrift"><ellipse cx="60" cy="34" rx="22" ry="8" fill="#fff" /><ellipse cx="50" cy="30" rx="10" ry="7" fill="#fff" /></g>
      <g className="asDrift asDrift2"><ellipse cx="176" cy="48" rx="18" ry="6" fill="#fff" /></g>
      <rect x="0" y="138" width="240" height="8" fill="#9ca3af" opacity=".5" />
      <g className="asRoad">{Array.from({ length: 8 }).map((_, i) => <rect key={i} x={i * 40} y="150" width="20" height="4" rx="2" fill="#d1d5db" />)}</g>
      <g className="asDrive">
        {[0, 1, 2].map(i => <rect key={i} className="asSpeed" style={css({ '--d': i * .18 + 's' })} x={22 - i * 3} y={86 + i * 14} width={24 + i * 4} height="4" rx="2" fill="#c4b5fd" />)}
        <rect x="62" y="68" width="88" height="62" rx="8" fill="#fff" stroke="#ddd6fe" strokeWidth="2" />
        <rect x="72" y="92" width="26" height="30" rx="4" fill="#d6a86b" /><rect x="102" y="102" width="22" height="20" rx="4" fill="#e8b878" />
        <text x="106" y="86" textAnchor="middle" fontSize="11" fontWeight="900" fill="#7c3aed">YN</text>
        <path d="M150 88h22a8 8 0 0 1 7 4l11 18a8 8 0 0 1 1 4v14h-41z" fill="url(#asShopG)" />
        <path d="M158 95h13l9 15h-22z" fill="#e0f2fe" />
        {[84, 166].map(x => (
          <g key={x} className="asWheel"><circle cx={x} cy="134" r="12" fill="#1f2937" /><circle cx={x} cy="134" r="5" fill="#9ca3af" /><rect x={x - 1.5} y="123" width="3" height="22" rx="1.5" fill="#9ca3af" /></g>
        ))}
      </g>
      <defs><linearGradient id="asShopG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#6d28d9" /></linearGradient></defs>
    </svg>
  );
}

/* Package labels: printer pushing out a barcode label */
function LabelScene() {
  return (
    <svg className="asSvg" viewBox="0 0 240 170" aria-hidden="true">
      <ellipse className="asShadow" cx="120" cy="158" rx="76" ry="6" />
      <g className="asPaper">
        <rect x="84" y="96" width="72" height="62" rx="5" fill="#fff" stroke="#e5e7eb" strokeWidth="1.5" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map(i => <rect key={i} x={92 + i * 8} y="126" width={i % 3 ? 3 : 5} height="22" fill="#241b35" />)}
        <rect x="92" y="106" width="40" height="5" rx="2.5" fill="#8b5cf6" /><rect x="92" y="115" width="26" height="4" rx="2" fill="#d1d5db" />
      </g>
      <rect x="58" y="46" width="124" height="58" rx="12" fill="#6d28d9" />
      <rect x="58" y="46" width="124" height="16" rx="8" fill="#8b5cf6" />
      <rect x="74" y="88" width="92" height="7" rx="3.5" fill="#2e1065" />
      <circle className="asBlinkDot" cx="160" cy="75" r="4" fill="#4ade80" /><rect x="74" y="70" width="40" height="5" rx="2.5" fill="#fff" opacity=".35" />
    </svg>
  );
}

/* Order statuses: a pin travels a track, each stop turns green */
function TrackScene() {
  const xs = [40, 93, 147, 200];
  return (
    <svg className="asSvg" viewBox="0 0 240 170" aria-hidden="true">
      <ellipse className="asShadow" cx="120" cy="136" rx="86" ry="6" />
      <rect x="40" y="82" width="160" height="7" rx="3.5" fill="#e5e7eb" />
      <rect className="asProg" x="40" y="82" width="160" height="7" rx="3.5" fill="#16a34a" />
      {xs.map((x, i) => (
        <g key={i}>
          <circle cx={x} cy="86" r="13" fill="#fff" stroke="#e5e7eb" strokeWidth="3" />
          <g className="asNode" style={css({ '--d': i * 1.2 + 's' })}>
            <circle cx={x} cy="86" r="13" fill="#16a34a" />
            <path d={`M${x - 5} 86l4 4 7-8`} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </g>
      ))}
      <g className="asPin"><path d="M40 60c-8 0-13 5-13 12 0 9 13 20 13 20s13-11 13-20c0-7-5-12-13-12z" fill="#8b5cf6" /><circle cx="40" cy="72" r="4.5" fill="#fff" /></g>
    </svg>
  );
}

/* Customers: avatars pop up one by one, a heart floats */
function PeopleScene() {
  const people = [{ x: 62, c: '#a78bfa' }, { x: 120, c: '#f472b6' }, { x: 178, c: '#fbbf24' }];
  return (
    <svg className="asSvg" viewBox="0 0 240 170" aria-hidden="true">
      <ellipse className="asShadow" cx="120" cy="150" rx="86" ry="6" />
      {people.map((p, i) => (
        <g key={i} className="asPopLoop asPopBig" style={css({ '--d': i * .5 + 's' })}>
          <circle cx={p.x} cy={i === 1 ? 70 : 82} r={i === 1 ? 20 : 17} fill="#fde2c8" />
          <path d={`M${p.x - (i === 1 ? 30 : 26)} 148a${i === 1 ? 30 : 26} ${i === 1 ? 34 : 30} 0 0 1 ${i === 1 ? 60 : 52} 0z`} fill={p.c} transform={i === 1 ? '' : 'translate(0 0)'} />
          <circle cx={p.x - 6} cy={i === 1 ? 70 : 82} r="2" fill="#241b35" /><circle cx={p.x + 6} cy={i === 1 ? 70 : 82} r="2" fill="#241b35" />
          <path d={`M${p.x - 5} ${i === 1 ? 77 : 89}q5 4 10 0`} fill="none" stroke="#241b35" strokeWidth="1.8" strokeLinecap="round" />
        </g>
      ))}
      <g className="asHeart"><path d="M120 44c-9-12-24 2-12 12l12 11 12-11c12-10-3-24-12-12z" fill="#f43f5e" /></g>
    </svg>
  );
}

/* Transactions: a receipt printing its lines, coins flipping */
function ReceiptScene() {
  const zig: string[] = [];
  for (let i = 0; i <= 10; i++) zig.push(`${170 - i * 10},${i % 2 ? 150 : 142}`);
  return (
    <svg className="asSvg" viewBox="0 0 240 170" aria-hidden="true">
      <ellipse className="asShadow" cx="120" cy="158" rx="60" ry="6" />
      <g className="asBobSlow">
        <polygon points={`70,18 170,18 ${zig.join(' ')}`} fill="#fff" stroke="#e5e7eb" strokeWidth="2" />
        <rect x="86" y="30" width="44" height="7" rx="3.5" fill="#8b5cf6" />
        {[0, 1, 2, 3].map(i => <g key={i}><rect className="asLine" style={css({ '--d': i * .35 + 's' })} x="86" y={52 + i * 20} width="46" height="5" rx="2.5" fill="#d1d5db" /><rect className="asLine" style={css({ '--d': i * .35 + .2 + 's' })} x="142" y={52 + i * 20} width="16" height="5" rx="2.5" fill="#a78bfa" /></g>)}
        <rect className="asLine" style={css({ '--d': '1.6s' })} x="86" y="128" width="72" height="6" rx="3" fill="#16a34a" />
      </g>
      <g className="asFlip"><circle cx="196" cy="62" r="13" fill="url(#asCoinG)" stroke="#d97706" strokeWidth="1.5" /><circle cx="196" cy="62" r="7" fill="none" stroke="#d97706" strokeWidth="1" opacity=".7" /></g>
      <g className="asFlip" style={css({ '--d': '.9s' })}><circle cx="44" cy="100" r="10" fill="url(#asCoinG)" stroke="#d97706" strokeWidth="1.5" /></g>
      <defs><radialGradient id="asCoinG" cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#fde68a" /><stop offset="1" stopColor="#f59e0b" /></radialGradient></defs>
    </svg>
  );
}

/* Notifications: a bell ringing with sound waves */
function BellScene() {
  return (
    <svg className="asSvg" viewBox="0 0 240 170" aria-hidden="true">
      <ellipse className="asShadow" cx="120" cy="154" rx="50" ry="6" />
      {[0, 1, 2].map(i => <circle key={i} className="asWave" style={css({ '--d': i * .7 + 's' })} cx="120" cy="90" r="40" />)}
      <g className="asRing">
        <path d="M120 38c-26 0-40 20-40 44v24l-12 16h104l-12-16V82c0-24-14-44-40-44z" fill="#fbbf24" stroke="#d97706" strokeWidth="2" />
        <circle cx="120" cy="34" r="6" fill="#d97706" />
        <path d="M100 56q-10 10-10 28" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="4" strokeLinecap="round" />
        <g className="asClapper"><circle cx="120" cy="132" r="9" fill="#d97706" /></g>
      </g>
      <circle className="asBadge" cx="158" cy="48" r="11" fill="#ef4444" stroke="#fff" strokeWidth="3" />
    </svg>
  );
}

/* Support: chat bubbles popping with typing dots */
function ChatScene() {
  return (
    <svg className="asSvg" viewBox="0 0 240 170" aria-hidden="true">
      <g className="asPopLoop asPopBig" style={css({ '--d': '0s', '--o': '0% 100%' })}>
        <rect x="30" y="30" width="116" height="48" rx="18" fill="#8b5cf6" />
        <path d="M44 74l-6 14 20-10z" fill="#8b5cf6" />
        <rect x="46" y="46" width="70" height="6" rx="3" fill="#fff" opacity=".9" /><rect x="46" y="58" width="48" height="6" rx="3" fill="#fff" opacity=".6" />
      </g>
      <g className="asPopLoop asPopBig" style={css({ '--d': '.8s' })}>
        <rect x="94" y="94" width="116" height="48" rx="18" fill="#fff" stroke="#e5e7eb" strokeWidth="2" />
        <path d="M196 138l6 14-20-10z" fill="#fff" stroke="#e5e7eb" strokeWidth="2" />
        {[0, 1, 2].map(i => <circle key={i} className="asTyping" style={css({ '--d': i * .18 + 's' })} cx={130 + i * 16} cy="118" r="5" fill="#a78bfa" />)}
      </g>
    </svg>
  );
}

/* Settings: two gears turning against each other */
function GearsScene() {
  return (
    <svg className="asSvg" viewBox="0 0 240 170" aria-hidden="true">
      <ellipse className="asShadow" cx="120" cy="154" rx="80" ry="6" />
      <g className="asSpin" style={css({ '--t': '9s' })}><circle cx="96" cy="86" r="30" fill="none" stroke="#8b5cf6" strokeWidth="11" strokeDasharray="11.8 11.8" /><circle cx="96" cy="86" r="26" fill="#a78bfa" /><circle cx="96" cy="86" r="10" fill="#fff" /></g>
      <g className="asSpin asSpinRev" style={css({ '--t': '6.5s' })}><circle cx="155" cy="108" r="21" fill="none" stroke="#f472b6" strokeWidth="9" strokeDasharray="8.3 8.3" /><circle cx="155" cy="108" r="18" fill="#f9a8d4" /><circle cx="155" cy="108" r="7" fill="#fff" /></g>
      <g className="asSpin" style={css({ '--t': '5s' })}><circle cx="170" cy="52" r="13" fill="none" stroke="#fbbf24" strokeWidth="6" strokeDasharray="5.1 5.1" /><circle cx="170" cy="52" r="11" fill="#fde68a" /><circle cx="170" cy="52" r="4" fill="#fff" /></g>
    </svg>
  );
}

/* Snacks: two cookies bouncing with crumbs */
function SnackScene() {
  const cookie = (x: number, d: number) => (
    <g className="asBounce" style={css({ '--d': d + 's' })}>
      <circle cx={x} cy="88" r="30" fill="#d9a066" stroke="#b97a3e" strokeWidth="2" />
      {[[-10, -10], [8, -14], [12, 6], [-6, 10], [0, -1]].map(([dx, dy], i) => <circle key={i} cx={x + dx} cy={88 + dy} r="4" fill="#6b3f1d" />)}
    </g>
  );
  return (
    <svg className="asSvg" viewBox="0 0 240 170" aria-hidden="true">
      <ellipse className="asShadow asShadowJump" cx="84" cy="150" rx="28" ry="5" />
      <ellipse className="asShadow asShadowJump" style={css({ '--d': '.5s' })} cx="156" cy="150" rx="28" ry="5" />
      {cookie(84, 0)}{cookie(156, .5)}
      <Star x={120} y={40} s={1.2} /><Star x={36} y={56} s={.8} d={.6} /><Star x={206} y={56} s={.9} d={1} />
    </svg>
  );
}

/* Reused payment-style scenes, replayed on a timer */
const ReplayOrder = () => <Replay><PaymentScene kind="order" amountText="" /></Replay>;
const ReplayWallet = () => <Replay><PaymentScene kind="wallet" amountText="$25" /></Replay>;
const ReplayDebt = () => <Replay><PaymentScene kind="debt" amountText="$80" oldText="$120" newText="$80" /></Replay>;
const ReplayCv = () => <Replay><PaymentScene kind="cv" amountText="" /></Replay>;

/* ------------------------------------------------------------------ page → scene */
type Def = { eyebrow: string; title: string; line: string; Scene: React.ComponentType };
const PAGES: Record<string, Def> = {
  '/admin': { eyebrow: 'YOUR SHOP', title: 'The store is open', line: 'Orders, deposits and customers at a glance.', Scene: ShopScene },
  '/admin/products': { eyebrow: 'CATALOG', title: 'Pack it, price it, publish it', line: 'Every product you add is ready to ship.', Scene: ReplayOrder },
  '/admin/snacks': { eyebrow: 'SNACKS PAGE', title: 'Fresh from the snack shelf', line: 'Keep the sweet stuff stocked and tempting.', Scene: SnackScene },
  '/admin/categories': { eyebrow: 'CATEGORIES', title: 'Everything in its place', line: 'Tag, sort and set delivery fees per category.', Scene: TagsScene },
  '/admin/themes': { eyebrow: 'THEMES', title: 'Give the store a new look', line: 'Pick a palette and watch the app change.', Scene: PaletteScene },
  '/admin/product-mascots': { eyebrow: 'MASCOTS', title: 'Meet your little helpers', line: 'Mascots that make every product smile.', Scene: MascotScene },
  '/admin/banners': { eyebrow: 'BANNERS', title: 'Put your best picture forward', line: 'Rotate banners on the home page.', Scene: FramesScene },
  '/admin/coupons': { eyebrow: 'COUPONS', title: 'Make customers smile', line: 'Create and hand out discounts.', Scene: TicketScene },
  '/admin/orders': { eyebrow: 'ORDERS', title: 'On the road to your customers', line: 'Review payments and keep orders moving.', Scene: TruckScene },
  '/admin/package-labels': { eyebrow: 'LABELS', title: 'Print, stick, ship', line: 'Scan a package and print its label.', Scene: LabelScene },
  '/admin/order-statuses': { eyebrow: 'STATUSES', title: 'Every step, tracked', line: 'Design the journey an order takes.', Scene: TrackScene },
  '/admin/customers': { eyebrow: 'CUSTOMERS', title: 'The people behind the orders', line: 'Wallets, debt and activity per customer.', Scene: PeopleScene },
  '/admin/debt': { eyebrow: 'DEBT', title: 'Chip away, one payment at a time', line: 'Record payments and watch balances shrink.', Scene: ReplayDebt },
  '/admin/wallet': { eyebrow: 'WALLET', title: 'Top-ups flying in', line: 'Review wallet deposit requests.', Scene: ReplayWallet },
  '/admin/transactions': { eyebrow: 'TRANSACTIONS', title: 'Every coin accounted for', line: 'A full receipt trail of the wallet.', Scene: ReceiptScene },
  '/admin/requests': { eyebrow: 'REQUESTS', title: 'Print, copy and CV jobs', line: 'Customer service requests, ready to work on.', Scene: ReplayCv },
  '/admin/notifications': { eyebrow: 'NOTIFICATIONS', title: 'Ding! Something happened', line: 'Everything new in your store.', Scene: BellScene },
  '/admin/support': { eyebrow: 'SUPPORT', title: 'Chat with your customers', line: 'Reply, refund and send rewards.', Scene: ChatScene },
  '/admin/settings': { eyebrow: 'SETTINGS', title: 'Tune the machine', line: 'Delivery, navigation and store options.', Scene: GearsScene },
};

const KEY = 'yn-admin-scenes';

export function AdminSceneBanner({ path }: { path: string }) {
  const def = PAGES[path.replace(/\/+$/, '') || '/admin'];
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(KEY) === '0'; } catch { return false; } });
  if (!def) return null;
  const set = (h: boolean) => { setHidden(h); try { localStorage.setItem(KEY, h ? '0' : '1'); } catch { /* ignore */ } };
  if (hidden) return <button type="button" className="asChip" onClick={() => set(false)}>✨ Show page scene</button>;
  const { Scene } = def;
  return (
    <section className="asBanner" aria-label={def.title}>
      <div className="asText"><span className="eyebrow">{def.eyebrow}</span><b>{def.title}</b><small>{def.line}</small></div>
      <div className="asArt"><Scene /></div>
      <button type="button" className="asHide" aria-label="Hide scene" title="Hide scene" onClick={() => set(true)}>×</button>
    </section>
  );
}

/* ------------------------------------------------------------------ one-shot action scenes */
export type AdminSceneDetail = {
  kind: 'order' | 'wallet' | 'debt' | 'debtClear' | 'cv' | 'ticket';
  label: string; sub?: string; amountText?: string; oldText?: string; newText?: string;
};

export function adminScene(detail: AdminSceneDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('yn-admin-scene', { detail }));
}

export function AdminActionScene() {
  const [d, setD] = useState<(AdminSceneDetail & { n: number }) | null>(null);
  useEffect(() => {
    let t = 0, n = 0;
    const on = (e: Event) => {
      const detail = (e as CustomEvent<AdminSceneDetail>).detail;
      if (!detail) return;
      window.clearTimeout(t);
      setD({ ...detail, n: ++n });
      t = window.setTimeout(() => setD(null), 3300);
    };
    window.addEventListener('yn-admin-scene', on);
    return () => { window.removeEventListener('yn-admin-scene', on); window.clearTimeout(t); };
  }, []);
  if (!d) return null;
  const dark = document.body.classList.contains('yn-admin-dark-page');
  return (
    <div className={'asOverlay' + (dark ? ' dark' : '')} role="status" onClick={() => setD(null)} key={d.n}>
      <div className="asCard">
        <div className="asCardArt">
          {d.kind === 'ticket' ? <TicketScene burst /> : <PaymentScene kind={d.kind} amountText={d.amountText || ''} oldText={d.oldText} newText={d.newText} />}
        </div>
        <b>{d.label}</b>
        {d.sub && <small>{d.sub}</small>}
        <i className="asCardBar" />
      </div>
    </div>
  );
}
