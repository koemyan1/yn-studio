/* Cinematic wedding invitation, phase 1: envelope screen, the opening sequence and the cover.
   Plain DOM + the Web Animations API (no dependencies), so it runs inside Telegram / Messenger browsers and can be tested headless. */
import { foilCss, foilStops, grainTexture, fibreTexture, flapPath, flapTrim, crestSvg, cornerSvg, flourishSvg, heartSvg, butterflySvg, scallopFrame } from './art';
import type { CineCfg, CineHooks, CineHandle } from './types';
import { TEXT } from './text';
import { buildFlow, initFlow } from './sections';

export type { CineCfg, CineHooks, CineHandle } from './types';

const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const firstWord = (s: string) => (s || '').trim().split(/\s+/)[0] || '';
let counter = 0;

export function mountCinematic(host: HTMLElement, cfg0: CineCfg, hooks: CineHooks = {}): CineHandle {
  let cfg = cfg0;
  let phase: 'closed' | 'opening' | 'open' = 'closed';
  let pending: CineCfg | null = null;
  let anims: Animation[] = [];
  let timers: number[] = [];
  let root: HTMLElement;
  let stopFlow: (() => void) | null = null;
  let alive = true;
  const off: (() => void)[] = [];
  const uid = `cn${++counter}`;
  const grain = grainTexture(), fibre = fibreTexture();

  /* ------------------------------------------------------------ markup ------------------------------------------------------------ */
  const ph = (v: string, fallback: string) => (v ? esc(v) : cfg.preview ? `<span class="cn-ph">${esc(fallback)}</span>` : '');

  function logo(variant: 'flap' | 'card' | 'cover' | 'mini'): string {
    const t = TEXT[cfg.lang];
    const g = cfg.groomShort || firstWord(cfg.groomKh) || (cfg.preview ? t.phG : '');
    const b = cfg.brideShort || firstWord(cfg.brideKh) || (cfg.preview ? t.phB : '');
    const fid = `${uid}f`;
    const isPh = !cfg.groomShort && !firstWord(cfg.groomKh);
    return `<div class="cn-logo cn-logo-${variant}${isPh ? ' cn-logo-ph' : ''}">
      ${variant === 'mini' ? '' : `<div class="cn-logo-crest">${crestSvg(fid)}</div>`}
      <div class="cn-logo-grid">
        <span class="cn-fl">${flourishSvg(fid)}<span class="cn-heart">${heartSvg(fid)}</span></span>
        <span class="cn-ln cn-ln-g" style="--n:${Math.max(3, Array.from(g).length)}"><b class="cn-foil cn-reveal">${esc(g)}</b></span>
        <span class="cn-ln cn-ln-b" style="--n:${Math.max(3, Array.from(b).length)}"><b class="cn-foil cn-reveal">${esc(b)}</b></span>
        ${variant === 'mini' ? '' : `<span class="cn-bf">${butterflySvg(fid)}</span>`}
      </div></div>`;
  }

  function dateRow(): string {
    const t = TEXT[cfg.lang];
    const p = cfg.dateParts;
    const vals = p ? [p.wd, p.d, p.m, p.y] : cfg.preview ? t.phD.map(() => '·') : [];
    if (!vals.length) return '';
    return `<div class="cn-date${p ? '' : ' cn-ph'}">${vals.map((v, i) => `<div><small>${esc(t.labels[i])}</small><b class="cn-foil">${esc(v)}</b></div>`).join('<i class="cn-dsep"></i>')}</div>`;
  }

  function seal(): string {
    const id = uid;
    return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="${id}sg" cx=".36" cy=".28" r=".85"><stop offset="0" stop-color="#fff0b5"/><stop offset=".3" stop-color="#e3bb58"/><stop offset=".66" stop-color="#b3842a"/><stop offset="1" stop-color="#694510"/></radialGradient>
        <filter id="${id}w" x="-18%" y="-18%" width="136%" height="136%" color-interpolation-filters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency=".032" numOctaves="3" seed="11" result="n"/>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="14" xChannelSelector="R" yChannelSelector="G" result="d"/>
          <feGaussianBlur in="d" stdDeviation="1.7" result="b"/>
          <feSpecularLighting in="b" surfaceScale="4" specularConstant=".8" specularExponent="22" lighting-color="#ffeebd" result="s"><fePointLight x="36" y="24" z="90"/></feSpecularLighting>
          <feComposite in="s" in2="d" operator="in" result="sc"/>
          <feComposite in="d" in2="sc" operator="arithmetic" k1="0" k2="1" k3=".55" k4="0"/>
        </filter>
      </defs>
      <g filter="url(#${id}w)">
        <circle cx="60" cy="60" r="43" fill="url(#${id}sg)"/>
        <circle cx="22" cy="74" r="7" fill="url(#${id}sg)"/><circle cx="95" cy="40" r="6" fill="url(#${id}sg)"/><circle cx="70" cy="104" r="5" fill="url(#${id}sg)"/>
        <circle cx="60" cy="60" r="33" fill="none" stroke="rgba(70,42,5,.5)" stroke-width="1.6"/>
        <circle cx="60" cy="60" r="29.5" fill="none" stroke="rgba(255,244,200,.55)" stroke-width="1"/>
      </g>
      <g>${crestSvg('rgba(255,246,205,.8)', { line: 'none', attrs: 'x="35" y="40" width="50" height="38"' })}</g>
      <g>${crestSvg('#6a4510', { line: 'none', attrs: 'x="34.4" y="39.4" width="50" height="38"' })}</g>
    </svg>`;
  }

  function buildStage(): string {
    const t = TEXT[cfg.lang];
    const guest = cfg.guestName ? `<div class="cn-guest" style="--gl:${Math.max(6, Array.from(cfg.guestName).length)}"><span>${esc(cfg.guestName)}</span></div>` : '';
    return `<div class="cn-stage" data-stage>
      <div class="cn-bg" style="${cfg.photo ? `background-image:url('${esc(cfg.photo)}')` : ''}"></div>
      <div class="cn-bgShade"></div>
      <header class="cn-head" data-head><p class="cn-kicker cn-foil">${esc(t.title)}</p><p class="cn-sub">${esc(t.sub)}</p></header>
      <div class="cn-float" data-float>
        <div class="cn-env" data-env>
          <div class="cn-part cn-back" data-part></div>
          <div class="cn-card" data-card>
            <div class="cn-cardIn"><i class="cn-cardBorder"></i><div class="cn-cardCrest">${crestSvg(uid + 'f')}</div>${logo('card')}<p class="cn-cardLine">${esc(t.invite)}</p></div>
          </div>
          <div class="cn-part cn-pocket" data-part>
            <div class="cn-pk cn-pk-l"><i></i></div><div class="cn-pk cn-pk-r"><i></i></div><div class="cn-pk cn-pk-b"><i></i></div>${guest}
          </div>
          <div class="cn-part cn-flapShadow" data-part data-fshadow><i></i></div>
          <div class="cn-part cn-flapBox" data-part data-flapbox>
            <div class="cn-flap" data-flap>
              <div class="cn-flapFace cn-flapFront"><div class="cn-flapLogo">${logo('flap')}</div>
                <svg class="cn-trim" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true"><path d="${flapTrim(9, 0.016, 0.93)}" fill="none" stroke="url(#${uid}f)" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg></div>
              <div class="cn-flapFace cn-flapBack"></div>
            </div>
          </div>
          <button type="button" class="cn-seal" data-seal aria-label="${esc(t.tap)}">${seal()}</button>
        </div>
      </div>
      <button type="button" class="cn-hint" data-hint><span>${esc(t.tap)}</span></button>
    </div>`;
  }

  function buildCover(): string {
    const t = TEXT[cfg.lang];
    const en = [cfg.groomEn, cfg.brideEn].filter(Boolean).join('  &  ') || (cfg.preview ? `${TEXT.en.phG}  &  ${TEXT.en.phB}` : '');
    const corner = (pos: string, m: '' | 'x' | 'y' | 'xy') => `<div class="cn-corner cn-corner-${pos}">${cornerSvg(uid + 'f', m)}</div>`;
    const venue = ph(cfg.venue, t.phV), lunar = ph(cfg.lunar, t.phL);
    return `<section class="cn-cover" data-cover>
      <div class="cn-cphoto" style="${cfg.photo ? `background-image:url('${esc(cfg.photo)}')` : ''}"></div><div class="cn-cshade"></div>
      ${corner('tl', '')}${corner('tr', 'x')}${corner('bl', 'y')}${corner('br', 'xy')}
      <div class="cn-cmain">
        <div class="cn-cA"><div class="cn-crest">${crestSvg(uid + 'f')}</div><p class="cn-ctitle cn-foil">${esc(t.title)}</p></div>
        <div class="cn-cB">${logo('cover')}${en ? `<p class="cn-en">${esc(en)}</p>` : ''}</div>
        <div class="cn-cC">
          <p class="cn-invite">${esc(t.invite)}</p>${dateRow()}
          ${lunar ? `<p class="cn-lunar">${lunar}</p>` : ''}${venue ? `<p class="cn-venue">${venue}</p>` : ''}
        </div>
        <div class="cn-scroll" aria-hidden="true"><span>${esc(t.scroll)}</span><i></i></div>
      </div>
    </section>`;
  }

  function render() {
    stopFlow?.(); stopFlow = null;
    const p = cfg.palette;
    host.innerHTML = `<div class="cn-root" data-lang="${cfg.lang}" data-phase="${phase}" style="--paper:${esc(p.paper)};--cream:${esc(p.cream)};--night:${esc(p.night)};--foil:${foilCss(p.foil)};--tex-grain:${grain};--tex-fibre:${fibre}">
      <svg class="cn-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
        <linearGradient id="${uid}f" x1="0" y1="0" x2="1" y2="1">${foilStops(p.foil)}</linearGradient>
        <clipPath id="${uid}c" clipPathUnits="objectBoundingBox"><path d="${flapPath(9, 0.016, 1)}"/></clipPath>
        <clipPath id="${uid}s" clipPathUnits="objectBoundingBox"><path d="${scallopFrame()}"/></clipPath>
      </defs></svg>
      ${phase === 'open' ? '' : buildStage()}
      <div class="cn-scroller" data-scroller>${buildCover()}${buildFlow(cfg, { logo: () => logo('cover'), uid })}</div>
      <div class="cn-top" data-top>${logo('mini')}</div>
      <div class="cn-fade" data-fade></div>
    </div>`;
    root = host.firstElementChild as HTMLElement;
    root.style.setProperty('--flap-clip', `url(#${uid}c)`);
    root.style.setProperty('--frame-clip', `url(#${uid}s)`);
    if (phase === 'open') { root.querySelector('[data-cover]')!.classList.add('is-in', 'is-instant'); root.querySelector('[data-scroller]')!.classList.add('is-shown'); root.querySelector('[data-top]')!.classList.add('is-shown'); }
    stopFlow = initFlow(root, root.querySelector('[data-scroller]') as HTMLElement, cfg);
    armSettle();
    bind();
  }

  function armSettle() {
    const el = root.querySelector('.cn-cover .cn-ln-b .cn-reveal');
    const cover = root.querySelector('[data-cover]');
    if (!el || !cover) return;
    const done = () => cover.classList.add('is-settled');
    el.addEventListener('animationend', done, { once: true });
  }

  /* ------------------------------------------------------------ interaction ------------------------------------------------------------ */
  function clearBinds() { off.splice(0).forEach(f => f()); }
  function bind() {
    clearBinds();
    if (phase !== 'closed') return;
    const stop = (e: Event) => e.stopPropagation();
    const env = root.querySelector('[data-env]') as HTMLElement, seal = root.querySelector('[data-seal]') as HTMLElement, hint = root.querySelector('[data-hint]') as HTMLElement;
    const go = () => open();
    [env, hint].forEach(el => { el.addEventListener('click', go); off.push(() => el.removeEventListener('click', go)); });
    seal.addEventListener('click', stop); const goSeal = (e: Event) => { e.stopPropagation(); open(); };
    seal.addEventListener('click', goSeal); off.push(() => seal.removeEventListener('click', goSeal));

    /* gentle tilt: pointer on desktop, device orientation on phones that allow it */
    const fl = root.querySelector('[data-float]') as HTMLElement;
    const tilt = (rx: number, ry: number) => { fl.style.setProperty('--rx', rx.toFixed(2) + 'deg'); fl.style.setProperty('--ry', ry.toFixed(2) + 'deg'); };
    const mv = (e: PointerEvent) => { const r = root.getBoundingClientRect(); tilt(-((e.clientY - r.top) / r.height - 0.5) * 9, ((e.clientX - r.left) / r.width - 0.5) * 11); };
    root.addEventListener('pointermove', mv); off.push(() => root.removeEventListener('pointermove', mv));
    const mo = (e: DeviceOrientationEvent) => { if (e.beta == null || e.gamma == null) return; tilt(Math.max(-8, Math.min(8, (e.beta - 50) * 0.18)), Math.max(-10, Math.min(10, e.gamma * 0.25))); };
    window.addEventListener('deviceorientation', mo); off.push(() => window.removeEventListener('deviceorientation', mo));
  }

  /* ------------------------------------------------------------ the opening (about 5.9 s, slow, "by hand") ------------------------------------------------------------ */
  function open() {
    if (phase !== 'closed') return;
    phase = 'opening'; root.dataset.phase = 'opening';
    clearBinds();
    hooks.onOpen?.();
    const q = <T extends HTMLElement>(s: string) => root.querySelector(s) as T;
    const rr = root.getBoundingClientRect();
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cover = q('[data-cover]'), scroller = q('[data-scroller]'), fade = q('[data-fade]');
    cover.classList.add('is-in'); armSettle();
    if (reduce) { finish(); return; }

    const env = q('[data-env]'), card = q('[data-card]'), seal = q('[data-seal]'), flap = q('[data-flap]'), fbox = q('[data-flapbox]'), fsh = q('[data-fshadow]');
    const head = q('[data-head]'), hint = q('[data-hint]'), top = q('[data-top]');
    const parts = Array.from(root.querySelectorAll<HTMLElement>('[data-part]'));
    const H = env.offsetHeight, ch = card.offsetHeight;
    const A = (el: HTMLElement, kf: Keyframe[], o: KeyframeAnimationOptions) => { const a = el.animate(kf, { fill: 'forwards', easing: 'ease', ...o }); anims.push(a); return a; };
    const jump = (el: HTMLElement, prop: string, from: string, to: string, at: number) => A(el, [{ [prop]: from }, { [prop]: to }], { delay: at, duration: 1, easing: 'steps(1, jump-start)' });

    /* 0.0 – 1.5  the seal is pressed, lifted (its shadow grows) and set aside off screen */
    A(head, [{ opacity: 1 }, { opacity: 0 }], { delay: 150, duration: 600 });
    A(hint, [{ opacity: 1 }, { opacity: 0 }], { delay: 0, duration: 300 });
    A(seal, [{ transform: 'scale(1)' }, { transform: 'scale(.91)' }], { duration: 330, easing: 'ease-out' });
    A(seal, [{ transform: 'scale(.91) translateY(0)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.45))' }, { transform: 'scale(1.2) translateY(-18px)', filter: 'drop-shadow(0 20px 14px rgba(0,0,0,.5))' }], { delay: 330, duration: 560, easing: 'cubic-bezier(.3,.7,.3,1)' });
    A(seal, [{ transform: 'scale(1.2) translateY(-18px) rotate(0deg)' }, { transform: `translate(${rr.width * 0.65}px, ${-rr.height * 0.55}px) scale(1.1) rotate(70deg)` }], { delay: 900, duration: 700, easing: 'cubic-bezier(.5,0,.85,.45)' });

    /* 1.2 – 2.6  the flap folds back 180° in 3D, its shadow lifting; behind the card once past 90° */
    A(fsh, [{ opacity: 1 }, { opacity: 0 }], { delay: 1200, duration: 800, easing: 'ease-in' });
    A(flap, [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(180deg)' }], { delay: 1200, duration: 1450, easing: 'cubic-bezier(.5,0,.2,1)' });
    jump(fbox, 'zIndex', '4', '1', 1200 + 700);

    /* 2.5 – 3.9  the card is drawn out of the pocket at a slight angle while the envelope settles down a little */
    A(card, [{ transform: 'translateY(0) rotate(0deg) scale(1)' }, { transform: `translateY(${-ch * 0.66}px) rotate(-2.4deg) scale(1.02)` }], { delay: 2500, duration: 1400, easing: 'cubic-bezier(.4,0,.2,1)' });
    parts.forEach(p => A(p, [{ transform: 'translateY(0)' }, { transform: `translateY(${H * 0.08}px)` }], { delay: 2500, duration: 1400, easing: 'ease-in-out' }));

    /* 3.9 – 4.7  the envelope is dropped out of the frame */
    parts.forEach(p => A(p, [{ transform: `translateY(${H * 0.08}px) rotate(0deg)` }, { transform: `translateY(${rr.height * 0.95}px) rotate(7deg)` }], { delay: 3900, duration: 820, easing: 'cubic-bezier(.55,0,.8,.3)' }));

    /* 4.3 – 5.1  the card comes to the camera */
    const cr = card.getBoundingClientRect();
    const sc = Math.min((rr.width * 0.88) / cr.width, (rr.height * 0.72) / cr.height, 2.4);
    const dx = rr.left + rr.width / 2 - (cr.left + cr.width / 2), dy = rr.top + rr.height / 2 - (cr.top + cr.height / 2); // the card rect was measured before it moved
    jump(card, 'zIndex', '2', '9', 4300);
    A(card, [{ transform: `translateY(${-ch * 0.66}px) rotate(-2.4deg) scale(1.02)` }, { transform: `translate(${dx}px, ${dy}px) rotate(0deg) scale(${sc})` }], { delay: 4300, duration: 850, easing: 'cubic-bezier(.5,0,.2,1)' });

    /* 4.95 – 5.9  fade through dark into the cover */
    A(fade, [{ opacity: 0 }, { opacity: 1 }], { delay: 4950, duration: 380, easing: 'ease-in' });
    A(scroller, [{ opacity: 0, visibility: 'hidden' }, { opacity: 1, visibility: 'visible' }], { delay: 5330, duration: 1, easing: 'steps(1, jump-start)' });
    A(top, [{ opacity: 0 }, { opacity: 1 }], { delay: 5600, duration: 700 });
    const last = A(fade, [{ opacity: 1 }, { opacity: 0 }], { delay: 5330, duration: 650, easing: 'ease-out' });
    last.finished.then(() => { if (alive) finish(); }).catch(() => {});
  }

  function finish() {
    const cover = root.querySelector('[data-cover]'), scroller = root.querySelector('[data-scroller]'), top = root.querySelector('[data-top]');
    cover?.classList.add('is-in'); scroller?.classList.add('is-shown'); top?.classList.add('is-shown');
    anims.forEach(a => { try { a.cancel(); } catch { /* ignore */ } }); anims = [];
    root.querySelector('[data-stage]')?.remove(); root.querySelector('[data-fade]')?.remove();
    phase = 'open'; root.dataset.phase = 'open';
    if (pending) { cfg = pending; pending = null; render(); }
    hooks.onOpened?.();
  }

  /* ------------------------------------------------------------ public handle ------------------------------------------------------------ */
  render();
  return {
    update(c) { cfg = c; if (phase === 'opening') { pending = c; return; } const keepAnims = anims; anims = []; keepAnims.forEach(a => a.cancel()); render(); },
    replay() { anims.forEach(a => { try { a.cancel(); } catch { /* ignore */ } }); anims = []; timers.forEach(clearTimeout); timers = []; pending = null; phase = 'closed'; render(); },
    open() { open(); },
    destroy() { alive = false; stopFlow?.(); stopFlow = null; anims.forEach(a => { try { a.cancel(); } catch { /* ignore */ } }); timers.forEach(clearTimeout); clearBinds(); host.innerHTML = ''; },
  };
}
