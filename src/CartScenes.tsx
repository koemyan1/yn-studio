import React, { useEffect, useRef, useState } from 'react';
import './cartScenes.css';

/* ---------------------------------------------------------------------------------------------
   Two full-screen "packing" animations (mounted once in <App/>, so they survive page changes):

   1. customer : after an order is PAID (wallet or KHQR) a box slides onto a conveyor belt, every item of the
                 order drops in (any number of items), the flaps close, tape goes on, a "PAID" stamp lands and
                 the box slides off to the right.
                 cartScene({ mode:'customer', items:[{ image, name }] })
   2. admin    : when a customer's order becomes paid while the admin panel is open, a taped box slides in,
                 stops in the middle for a moment with a label (order number + amount), then leaves to the right.
                 cartScene({ mode:'admin', label:'Order #YN-123', sub:'$12.00' })

   Played with the Web Animations API; switched off by prefers-reduced-motion. Never blocks taps.
   --------------------------------------------------------------------------------------------- */

export type CartSceneItem = { image?: string | null; name?: string | null };
export type CartSceneDetail = { mode: 'customer' | 'admin'; items?: CartSceneItem[]; label?: string; sub?: string };

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms: number) => new Promise<void>(r => window.setTimeout(r, ms));

export function cartScene(detail: CartSceneDetail) {
  if (typeof window === 'undefined' || reduced()) return;
  window.dispatchEvent(new CustomEvent('yn-cart-scene', { detail }));
}

/* Cardboard box, 220 x 170 units, front view with the top slightly visible (back edge y46, front edge y70).
   Two layers so the products drop INSIDE: back (interior + open back flap) -> products -> front (front wall, flaps, tape, stamp). */
function BoxBack() {
  return (
    <svg className="csLayer" viewBox="0 0 220 170" aria-hidden="true">
      <defs>
        <linearGradient id="csInner" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7d522b" /><stop offset="1" stopColor="#9a6a3a" /></linearGradient>
      </defs>
      <ellipse cx="110" cy="152" rx="86" ry="4.5" fill="rgba(36,27,53,.3)" />
      <polygon points="38,46 182,46 190,70 30,70" fill="url(#csInner)" />
      {/* back flap, standing open (flips shut and hands over to the copy in the front layer) */}
      <polygon className="csFlapBa" points="38,46 182,46 186,58 34,58" fill="#e0a868" stroke="#b9783c" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function BoxFront() {
  return (
    <svg className="csLayer" viewBox="0 0 220 170" aria-hidden="true">
      <defs>
        <linearGradient id="csFace" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d29555" /><stop offset="1" stopColor="#bf8040" /></linearGradient>
      </defs>
      <rect x="30" y="70" width="160" height="80" rx="5" fill="url(#csFace)" />
      <path d="M30 138H190V145a5 5 0 0 1-5 5H35a5 5 0 0 1-5-5Z" fill="#b9783c" />
      <rect x="30" y="70" width="160" height="3" fill="#fff" fillOpacity=".28" />
      <rect x="38" y="134" width="40" height="11" rx="5.5" fill="#7c3aed" />
      <text x="58" y="142" textAnchor="middle" fontSize="6.6" fontWeight="900" fill="#fff" letterSpacing=".4">YN SHOP</text>
      {/* closed back half of the lid (starts hidden; takes over from the open flap) */}
      <polygon className="csFlapBb" points="38,46 182,46 186,58 34,58" fill="#e0a868" stroke="#b9783c" strokeWidth="1.2" strokeLinejoin="round" />
      {/* front flap: hangs open over the front face, then swings up to close the lid */}
      <polygon className="csFlapF" points="34,58 186,58 190,70 30,70" fill="#e8b777" stroke="#b9783c" strokeWidth="1.2" strokeLinejoin="round" />
      {/* tape along the seam + a tab down the front */}
      <g className="csTape">
        <path d="M34 55H186V61H34Z" fill="#7c3aed" /><path d="M34 56.4H186" stroke="#fff" strokeOpacity=".45" strokeWidth="1.2" />
        <path d="M101 61H119V84H101Z" fill="#6d28d9" />
      </g>
      {/* PAID stamp */}
      <g transform="rotate(-9 110 114)">
        <g className="csStamp">
          <rect x="68" y="98" width="84" height="34" rx="7" fill="rgba(255,255,255,.2)" stroke="#c026d3" strokeWidth="3.4" />
          <rect x="73" y="103" width="74" height="24" rx="4" fill="none" stroke="#c026d3" strokeWidth="1.2" />
          <text x="110" y="124" textAnchor="middle" fontSize="23" fontWeight="900" fill="#c026d3" letterSpacing="3">PAID</text>
        </g>
      </g>
    </svg>
  );
}

/* where each product rests inside the box (it sinks behind the front wall; only the top peeks out). 2 rows x 5 */
const ITEM = 28;
function slotStyle(i: number): React.CSSProperties {
  const col = i % 5, row = Math.floor(i / 5);
  const cx = 54 + col * 28, top = row ? 46 : 58;
  return { left: `${((cx - ITEM / 2) / 220) * 100}%`, top: `${(top / 170) * 100}%`, width: `${(ITEM / 220) * 100}%` };
}

function Scene({ d, done }: { d: CartSceneDetail; done: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const beltRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const items = (d.items && d.items.length ? d.items : [{}, {}, {}]).slice(0, 10);
  const admin = d.mode === 'admin';

  useEffect(() => {
    let alive = true;
    const box = boxRef.current, belt = beltRef.current;
    if (!box || !belt) { done(); return; }
    const q = (s: string) => box.querySelector<SVGElement | HTMLElement>(s);
    const bob = q('.csBob');
    const W = window.innerWidth, H = window.innerHeight, cw = box.offsetWidth || 260;
    const off = -cw - 40, out = W + 40, stop = (W - cw) / 2;
    const at = (x: number, y = 0) => `translate(${x}px,${y}px)`;
    // play an animation and wait for it; if the scene was removed meanwhile, stop the whole run quietly
    const play = async (el: Element | null | undefined, kf: Keyframe[], o: KeyframeAnimationOptions) => {
      if (!el) return;
      await el.animate(kf, { fill: 'forwards', ...o }).finished.catch(() => undefined);
      if (!alive) throw new Error('gone');
    };
    const wait = async (ms: number) => { await sleep(ms); if (!alive) throw new Error('gone'); };
    const thump = (px = 4, ms = 160) => { bob?.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${px}px)` }, { transform: 'translateY(0)' }], { duration: ms }); };

    const run = async () => {
      play(belt, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'ease-out' });
      box.style.transform = at(off);
      // 1. the box slides onto the conveyor
      await play(box, [{ transform: at(off) }, { transform: at(stop + 10), offset: .85 }, { transform: at(stop) }], { duration: 720, easing: 'cubic-bezier(.2,.8,.3,1)' });

      if (admin) {
        // label pops onto the box, box stays for a moment
        q('.csLabel')?.animate([{ opacity: 0, transform: 'scale(.4) rotate(-6deg)' }, { opacity: 1, transform: 'scale(1.08) rotate(-2deg)', offset: .7 }, { opacity: 1, transform: 'scale(1) rotate(-2deg)' }],
          { duration: 480, delay: 200, easing: 'ease-out', fill: 'forwards' });
        thump(-8, 520);
        await wait(2680);
      } else {
        // 2. the order's items drop in
        const gap = Math.max(90, Math.min(300, 1000 / items.length));
        await Promise.all(items.map(async (_, i) => {
          const el = itemRefs.current[i];
          if (!el) return;
          await wait(i * gap);
          const a = Math.random() * 90 - 45;
          await play(el, [
            { transform: `translate(0,${-H * 0.55}px) rotate(${a}deg) scale(1.1)`, opacity: 0 },
            { opacity: 1, offset: .12 },
            { transform: 'translate(0,5px) rotate(0) scale(.95)', offset: .85, opacity: 1 },
            { transform: 'translate(0,0) rotate(0) scale(1)', opacity: 1 },
          ], { duration: 560, easing: 'cubic-bezier(.5,0,.9,.6)' });
          thump(4, 150);
        }));
        await wait(120);
        // 3. flaps close (front flap swings up, back flap flips over and hands over to the front-layer copy)
        const ease = 'cubic-bezier(.4,0,.2,1)';
        await Promise.all([
          play(q('.csFlapF'), [{ transform: 'scaleY(-1.25)' }, { transform: 'scaleY(1)' }], { duration: 300, easing: ease }),
          play(q('.csFlapBa'), [{ transform: 'scaleY(-1.5)', opacity: 1 }, { transform: 'scaleY(0)', opacity: 1, offset: .98 }, { transform: 'scaleY(0)', opacity: 0 }], { duration: 170, delay: 100, easing: 'ease-in' }),
          play(q('.csFlapBb'), [{ transform: 'scaleY(0)', opacity: 1 }, { transform: 'scaleY(1)', opacity: 1 }], { duration: 170, delay: 270, easing: 'ease-out' }),
        ]);
        itemRefs.current.forEach(el => { if (el) el.style.visibility = 'hidden'; });
        // 4. tape goes on
        await play(q('.csTape'), [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 300, easing: 'ease-in-out' });
        // 5. PAID stamp lands
        play(q('.csStamp'), [{ transform: 'scale(2.6)', opacity: 0 }, { transform: 'scale(.92)', opacity: 1, offset: .6 }, { transform: 'scale(1)', opacity: .95 }], { duration: 360, easing: 'cubic-bezier(.2,.9,.3,1)' });
        await wait(150);
        thump(6, 200);
        await wait(300);
      }

      // 6. the box slides off to the right
      play(belt, [{ opacity: 1 }, { opacity: 0 }], { duration: 350, delay: 650, easing: 'ease-in' });
      await play(box, [{ transform: at(stop) }, { transform: at(stop - 10), offset: .12 }, { transform: at(out) }], { duration: 1000, easing: 'cubic-bezier(.5,0,.9,.5)' });
      if (alive) done();
    };
    run().catch(() => { if (alive) done(); });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={'csOverlay ' + (admin ? 'admin' : 'customer')} aria-hidden="true">
      <div className="csBelt" ref={beltRef}><i /></div>
      <div className="csPack" ref={boxRef}>
        <div className="csBob">
          <BoxBack />
          {!admin && (
            <div className="csItems">
              {items.map((it, i) => (
                <div key={i} className="csItem" ref={el => { itemRefs.current[i] = el; }} style={slotStyle(i)}>
                  {it.image ? <img src={it.image} alt="" /> : <span>{['🛍️', '🍎', '🥛', '🍞', '🧃'][i % 5]}</span>}
                </div>
              ))}
            </div>
          )}
          <BoxFront />
          {admin && (d.label || d.sub) && (
            <div className="csLabel"><b>{d.label}</b>{d.sub && <small>{d.sub}</small>}</div>
          )}
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
