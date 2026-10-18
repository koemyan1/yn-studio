import React, { useEffect, useRef, useState } from 'react';
import './cartScenes.css';

/* ---------------------------------------------------------------------------------------------
   Two full-screen "shopping cart" animations (mounted once in <App/>, so they survive page changes):

   1. customer : after an order is PAID (wallet or KHQR) the cart rolls in from the left, every item of the
                 order drops into it (any number of items), then the cart drives off to the right.
                 cartScene({ mode:'customer', items:[{ image, name }] })
   2. admin    : when a customer's order becomes paid while the admin panel is open, a cart comes in from the
                 left, stops in the middle for a moment (with the order number), then leaves to the right.
                 cartScene({ mode:'admin', label:'Order #YN-123', sub:'$12.00' })

   Played with the Web Animations API; switched off by prefers-reduced-motion.
   --------------------------------------------------------------------------------------------- */

export type CartSceneItem = { image?: string | null; name?: string | null };
export type CartSceneDetail = { mode: 'customer' | 'admin'; items?: CartSceneItem[]; label?: string; sub?: string };

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms: number) => new Promise<void>(r => window.setTimeout(r, ms));

export function cartScene(detail: CartSceneDetail) {
  if (typeof window === 'undefined' || reduced()) return;
  window.dispatchEvent(new CustomEvent('yn-cart-scene', { detail }));
}

/* Supermarket trolley, side view, 220 x 170 units. Drawn in two layers so the products sit INSIDE the basket:
   back wall (behind the products) -> products -> front wire wall, rim, handle and wheels (in front). */
const BX = (y: number, side: 'l' | 'r') => (side === 'l' ? 40 + ((y - 30) / 70) * 16 : 200 - ((y - 30) / 70) * 16);

function CartBack() {
  return (
    <svg className="csLayer" viewBox="0 0 220 170" aria-hidden="true">
      <defs>
        <linearGradient id="csIn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ddd3f3" /><stop offset="1" stopColor="#b9a9e0" /></linearGradient>
      </defs>
      <ellipse cx="112" cy="164" rx="86" ry="5" fill="rgba(36,27,53,.25)" />
      <polygon points="40,30 200,30 184,100 56,100" fill="url(#csIn)" />
      {[48, 62, 76, 90].map(y => <line key={y} x1={BX(y, 'l')} y1={y} x2={BX(y, 'r')} y2={y} stroke="#fff" strokeOpacity=".55" strokeWidth="1.2" />)}
      {[0.12, 0.3, 0.5, 0.7, 0.88].map(t => <line key={t} x1={40 + 160 * t} y1="30" x2={56 + 128 * t} y2="100" stroke="#fff" strokeOpacity=".45" strokeWidth="1.2" />)}
    </svg>
  );
}

function CartFront() {
  const wire = '#9aa3b5';
  return (
    <svg className="csLayer" viewBox="0 0 220 170" aria-hidden="true">
      <defs>
        <linearGradient id="csGrip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a78bfa" /><stop offset="1" stopColor="#6d28d9" /></linearGradient>
      </defs>
      {/* frame: rear leg from the handle, front leg, lower tray */}
      <path d="M34 20L64 136" stroke={wire} strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M184 100L172 136" stroke={wire} strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M60 100L66 122M180 100L174 122" stroke={wire} strokeWidth="4" strokeLinecap="round" />
      <rect x="54" y="120" width="130" height="8" rx="4" fill="#b7bfce" stroke={wire} strokeWidth="1.5" />
      {[66, 82, 98, 114, 130, 146, 162, 176].map(x => <line key={x} x1={x} y1="121" x2={x} y2="127" stroke={wire} strokeWidth="1.5" />)}
      <rect x="62" y="134" width="116" height="5" rx="2.5" fill={wire} />
      {/* front wire wall (thin, so the products show through) */}
      {[44, 58, 72, 86].map(y => <line key={y} x1={BX(y, 'l')} y1={y} x2={BX(y, 'r')} y2={y} stroke="#8c95a8" strokeWidth="1.8" />)}
      {[0.08, 0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.92].map(t => <line key={t} x1={40 + 160 * t} y1="30" x2={56 + 128 * t} y2="100" stroke="#8c95a8" strokeWidth="1.8" />)}
      {/* basket edges */}
      <path d="M40 30L56 100M200 30L184 100" stroke="#7d8699" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M56 100H184" stroke="#7d8699" strokeWidth="5" strokeLinecap="round" />
      <path d="M38 30H202" stroke="#aeb6c6" strokeWidth="6" strokeLinecap="round" />
      <path d="M40 28H200" stroke="#fff" strokeOpacity=".7" strokeWidth="1.6" strokeLinecap="round" />
      {/* purple handle */}
      <path d="M40 30L26 10" stroke={wire} strokeWidth="5" strokeLinecap="round" />
      <rect x="2" y="3" width="40" height="11" rx="5.5" fill="url(#csGrip)" />
      <rect x="6" y="5" width="30" height="2.6" rx="1.3" fill="#fff" fillOpacity=".4" />
      {/* name plate */}
      <rect x="150" y="18" width="40" height="11" rx="5.5" fill="#7c3aed" />
      <text x="170" y="26.4" textAnchor="middle" fontSize="7.5" fontWeight="900" fill="#fff" letterSpacing=".5">YN SHOP</text>
      {/* wheels */}
      {[66, 172].map(cx => (
        <g key={cx}>
          <path d={`M${cx} 136V142`} stroke="#4b5563" strokeWidth="5" strokeLinecap="round" />
          <circle cx={cx} cy="150" r="11" fill="#1f2937" />
          <g className="csWheel"><circle cx={cx} cy="150" r="6.5" fill="#cbd5e1" /><path d={`M${cx - 6} 150H${cx + 6}M${cx} 144V156`} stroke="#64748b" strokeWidth="1.6" /></g>
          <circle cx={cx} cy="150" r="2" fill="#475569" />
        </g>
      ))}
    </svg>
  );
}

/* where each product rests inside the basket (col, row); row 0 is on the floor */
const SLOTS: [number, number][] = [[0, 0], [1, 0], [2, 0], [3, 0], [0.5, 1], [1.5, 1], [2.5, 1], [1, 2], [2, 2], [1.5, 2]];
const ITEM = 32;
function slotStyle(i: number): React.CSSProperties {
  const [c, r] = SLOTS[i % SLOTS.length];
  const cx = 76 + c * 30.5, top = 98 - ITEM - r * 27;
  return { left: `${((cx - ITEM / 2) / 220) * 100}%`, bottom: `${((170 - (top + ITEM)) / 170) * 100}%`, width: `${(ITEM / 220) * 100}%`, zIndex: i };
}

function Scene({ d, done }: { d: CartSceneDetail; done: () => void }) {
  const cartRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const items = (d.items && d.items.length ? d.items : [{}, {}, {}]).slice(0, 10);
  const admin = d.mode === 'admin';

  useEffect(() => {
    let alive = true;
    const cart = cartRef.current;
    if (!cart) { done(); return; }
    const W = window.innerWidth, cw = cart.offsetWidth || 260;
    const off = -cw - 40, out = W + 40;
    const stop = admin ? (W - cw) / 2 : Math.max(16, Math.min(W * 0.32, W - cw - 16));
    const at = (x: number, y = 0, r = 0) => `translate(${x}px,${y}px) rotate(${r}deg)`;
    const run = async () => {
      cart.style.transform = at(off);
      await cart.animate([{ transform: at(off) }, { transform: at(stop + 10, 0, 2), offset: .85 }, { transform: at(stop) }],
        { duration: 800, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' }).finished;
      if (!alive) return;
      if (admin) {
        itemRefs.current.forEach((el, i) => el?.animate([{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(1.15)', opacity: 1, offset: .7 }, { transform: 'scale(1)', opacity: 1 }],
          { duration: 420, delay: 250 + i * 70, easing: 'ease-out', fill: 'backwards' }));
        cart.animate([{ transform: at(stop) }, { transform: at(stop, -12) }, { transform: at(stop) }], { duration: 520, delay: 150, easing: 'ease-in-out' });
        await sleep(2300);
      } else {
        const H = window.innerHeight, gap = Math.max(110, Math.min(330, 2000 / items.length));
        await Promise.all(items.map(async (_, i) => {
          const el = itemRefs.current[i];
          if (!el) return;
          await sleep(i * gap);
          if (!alive) return;
          const a = Math.random() * 90 - 45;
          el.style.opacity = '1';
          await el.animate([
            { transform: `translate(0,${-H * 0.55}px) rotate(${a}deg) scale(1.1)`, opacity: 0 },
            { opacity: 1, offset: .12 },
            { transform: 'translate(0,6px) rotate(0) scale(.95)', offset: .85, opacity: 1 },
            { transform: 'translate(0,0) rotate(0) scale(1)', opacity: 1 },
          ], { duration: 620, easing: 'cubic-bezier(.5,0,.9,.6)', fill: 'forwards' }).finished;
          cart.animate([{ transform: at(stop) }, { transform: at(stop, 5) }, { transform: at(stop) }], { duration: 160 });
        }));
        await sleep(300);
      }
      if (!alive) return;
      await cart.animate([{ transform: at(stop) }, { transform: at(stop - 24, 0, -3), offset: .15 }, { transform: at(out) }],
        { duration: 1300, easing: 'cubic-bezier(.5,0,.9,.5)', fill: 'forwards' }).finished;
      if (alive) done();
    };
    run().catch(() => done());
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={'csOverlay ' + (admin ? 'admin' : 'customer')} aria-hidden="true">
      <div className="csTrack" />
      <div className="csCart" ref={cartRef}>
        {admin && (d.label || d.sub) && (
          <div className="csTag"><b>{d.label}</b>{d.sub && <small>{d.sub}</small>}</div>
        )}
        <div className="csBob">
          <CartBack />
          <div className="csItems">
            {items.map((it, i) => (
              <div key={i} className={'csItem' + (admin ? ' shown' : '')} ref={el => { itemRefs.current[i] = el; }} style={slotStyle(i)}>
                {it.image ? <img src={it.image} alt="" /> : <span>{['🛍️', '🍎', '🥛', '🍞', '🧃'][i % 5]}</span>}
              </div>
            ))}
          </div>
          <CartFront />
        </div>
      </div>
    </div>
  );
}

/** Mount once near the app root. Scenes queue up so two orders never overlap. */
export function CartSceneHost() {
  const [cur, setCur] = useState<(CartSceneDetail & { n: number }) | null>(null);
  const queue = useRef<CartSceneDetail[]>([]);
  const busy = useRef(false);
  const n = useRef(0);

  const next = () => {
    const d = queue.current.shift();
    if (!d) { busy.current = false; setCur(null); return; }
    busy.current = true;
    setCur({ ...d, n: ++n.current });
  };
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<CartSceneDetail>).detail;
      if (!d) return;
      if (queue.current.length < 5) queue.current.push(d);
      if (!busy.current) next();
    };
    window.addEventListener('yn-cart-scene', on);
    return () => window.removeEventListener('yn-cart-scene', on);
  }, []);
  return cur ? <Scene key={cur.n} d={cur} done={next} /> : null;
}
