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

function CartSvg() {
  return (
    <svg className="csCartSvg" viewBox="0 0 140 110" aria-hidden="true">
      <defs>
        <linearGradient id="csBasket" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#d946ef" /></linearGradient>
      </defs>
      <ellipse cx="70" cy="104" rx="46" ry="5" fill="rgba(36,27,53,.22)" />
      <path d="M4 8h20l6 12" fill="none" stroke="#4c1d95" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M26 20h104l-12 46a8 8 0 0 1-8 6H46a8 8 0 0 1-8-6Z" fill="url(#csBasket)" />
      <path d="M44 32v30M62 32v34M80 32v34M98 32v34M116 32v26" stroke="#fff" strokeOpacity=".28" strokeWidth="3" strokeLinecap="round" />
      <path d="M40 78h72" stroke="#4c1d95" strokeWidth="6" strokeLinecap="round" />
      <g className="csWheel"><circle cx="52" cy="92" r="9" fill="#312e81" /><circle cx="52" cy="92" r="3.5" fill="#c4b5fd" /></g>
      <g className="csWheel"><circle cx="102" cy="92" r="9" fill="#312e81" /><circle cx="102" cy="92" r="3.5" fill="#c4b5fd" /></g>
    </svg>
  );
}

function Scene({ d, done }: { d: CartSceneDetail; done: () => void }) {
  const cartRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const items = (d.items && d.items.length ? d.items : [{}]).slice(0, 10);
  const admin = d.mode === 'admin';

  useEffect(() => {
    let alive = true;
    const cart = cartRef.current;
    if (!cart) { done(); return; }
    const W = window.innerWidth, cw = cart.offsetWidth || 150;
    const off = -cw - 40, out = W + 40;
    const stop = admin ? (W - cw) / 2 : Math.max(16, Math.min(W * 0.32, W - cw - 16));
    const at = (x: number, y = 0, r = 0) => `translate(${x}px,${y}px) rotate(${r}deg)`;
    const run = async () => {
      cart.style.transform = at(off);
      await cart.animate([{ transform: at(off) }, { transform: at(stop + 10, 0, 2), offset: .85 }, { transform: at(stop) }],
        { duration: 800, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' }).finished;
      if (!alive) return;
      if (admin) {
        cart.animate([{ transform: at(stop) }, { transform: at(stop, -10) }, { transform: at(stop) }], { duration: 500, delay: 100, easing: 'ease-in-out' });
        await sleep(2000);
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
        {!admin && (
          <div className="csItems">
            {items.map((it, i) => (
              <div key={i} className="csItem" ref={el => { itemRefs.current[i] = el; }}
                style={{ left: `${14 + ((i * 37) % 52)}px`, zIndex: i }}>
                {it.image ? <img src={it.image} alt="" /> : <span>🛍️</span>}
              </div>
            ))}
          </div>
        )}
        <CartSvg />
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
