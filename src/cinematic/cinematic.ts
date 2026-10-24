/* Cinematic wedding invitation, phase 1: envelope screen, the opening sequence and the cover.
   Plain DOM + the Web Animations API (no dependencies), so it runs inside Telegram / Messenger browsers and can be tested headless. */
import { foilCss, foilStops, foilStopsDeep, isLight, foilDeepCss, FOILS, FOILS_DEEP, mixHex, waxDefault, linerTexture, sealSvg, sealClip, sealCrackPath, grainTexture, fibreTexture, flapPath, flapTrim, crestSvg, cornerSvg, flourishSvg, heartSvg, butterflySvg, scallopFrame } from './art';
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
    const fid = variant === 'card' || (variant === 'flap' && isLight(cfg.palette.paper)) ? `${uid}d` : `${uid}f`;
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

  /* the seal is one picture cut along a crack: the upper half is stuck to the flap, the lower half to the envelope */
  const waxOf = () => cfg.palette.wax || waxDefault(cfg.palette.foil);
  const sealHalf = (h: 'u' | 'l') => `<div class="cn-sealHalf" style="clip-path:${sealClip(h)};-webkit-clip-path:${sealClip(h)}">${sealSvg(uid + 's' + h, waxOf(), h)}</div>`;
  const rnd = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const dust = () => Array.from({ length: 14 }, (_, i) => `<i style="left:${(rnd(i) * 100).toFixed(1)}%;top:${(18 + rnd(i + 40) * 78).toFixed(1)}%;--sz:${(2 + rnd(i + 80) * 3.2).toFixed(1)}px;--dl:${(-rnd(i + 120) * 14).toFixed(1)}s;--du:${(11 + rnd(i + 160) * 10).toFixed(1)}s;--dx:${((rnd(i + 200) - .5) * 40).toFixed(0)}px"></i>`).join('');
  const crumbs = () => Array.from({ length: 9 }, (_, i) => {
    const a = (-150 + i * 37 + rnd(i + 9) * 20) * Math.PI / 180, r = 30 + rnd(i + 3) * 46;
    return `<i style="--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r * .9}px;--s:${(2.4 + rnd(i + 21) * 3.2).toFixed(1)}px"></i>`;
  }).join('');

  function buildStage(): string {
    const t = TEXT[cfg.lang];
    const guest = cfg.guestName ? `<div class="cn-guest" style="--gl:${Math.max(6, Array.from(cfg.guestName).length)}"><span>${esc(cfg.guestName)}</span></div>` : '';
    return `<div class="cn-stage" data-stage>
      <div class="cn-bgPhoto" style="${cfg.photo ? `background-image:url('${esc(cfg.photo)}')` : ''}"></div>
      <div class="cn-bg"></div>
      <div class="cn-dust" aria-hidden="true">${dust()}</div>
      <header class="cn-head" data-head><p class="cn-kicker cn-foil">${esc(t.title)}</p><p class="cn-sub">${esc(t.sub)}</p></header>
      <div class="cn-float" data-float>
        <div class="cn-env" data-env>
          <div class="cn-part cn-back" data-part></div>
          <div class="cn-part cn-glow" data-part data-glow></div>
          <div class="cn-card" data-card>
            <div class="cn-cardIn"><i class="cn-cardBorder"></i><div class="cn-cardCrest">${crestSvg(uid + 'd')}</div>${logo('card')}<p class="cn-cardLine">${esc(t.invite)}</p></div>
          </div>
          <div class="cn-part cn-pocket" data-part>
            <div class="cn-pk cn-pk-l"><i></i></div><div class="cn-pk cn-pk-r"><i></i></div><div class="cn-pk cn-pk-b"><i></i></div>${guest}
          </div>
          <div class="cn-part cn-flapShadow" data-part data-fshadow><i></i></div>
          <div class="cn-part cn-flapBox" data-part data-flapbox>
            <div class="cn-flap" data-flap>
              <div class="cn-flapFace cn-flapFront"><div class="cn-flapLogo">${logo('flap')}</div>
                <svg class="cn-trim" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true"><path d="${flapTrim(9, 0.016, 0.93)}" fill="none" stroke="url(#${uid}${isLight(cfg.palette.paper) ? 'd' : 'f'})" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg></div>
              <div class="cn-flapFace cn-flapBack"></div>
              <div class="cn-sealU" data-sealu>${sealHalf('u')}</div>
            </div>
          </div>
          <div class="cn-part cn-sealLayer" data-part>
            <div class="cn-sealL" data-seall>${sealHalf('l')}</div>
            <div class="cn-crumbs" data-crumbs aria-hidden="true">${crumbs()}</div>
          </div>
          <button type="button" class="cn-seal" data-seal aria-label="${esc(t.tap)}"><i class="cn-ring"></i>
            <svg class="cn-crack" viewBox="0 0 120 120" aria-hidden="true" focusable="false"><path data-crack d="${sealCrackPath()}" pathLength="1" fill="none"/></svg></button>
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
    host.innerHTML = `<div class="cn-root" data-lang="${cfg.lang}" data-phase="${phase}" data-paper="${isLight(p.paper) ? 'light' : 'dark'}" style="--paper:${esc(p.paper)};--cream:${esc(p.cream)};--night:${esc(p.night)};--foil:${foilCss(p.foil)};--foil-deep:${foilDeepCss(p.foil)};--gold:${FOILS[p.foil][3]};--gold-hi:${FOILS[p.foil][2]};--gold-deep:${FOILS_DEEP[p.foil][3]};--ink:${mixHex('#1a1109', p.paper, .22)};--wax:${esc(p.wax || waxDefault(p.foil))};--liner:${linerTexture(FOILS_DEEP[p.foil][2])};--tex-grain:${grain};--tex-fibre:${fibre}">
      <svg class="cn-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
        <linearGradient id="${uid}f" x1="0" y1="0" x2="1" y2="1">${foilStops(p.foil)}</linearGradient>
        <linearGradient id="${uid}d" x1="0" y1="0" x2="1" y2="1">${foilStopsDeep(p.foil)}</linearGradient>
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

  /* ------------------------------------------------------------ the opening (about 5.3 s) ------------------------------------------------------------
     One physical story, no cuts:
       press   the seal is pressed, cracks along a jagged line and sheds crumbs
       open    the flap lifts, taking its half of the seal with it; the other half stays on the envelope; warm light spills out of the lining
       draw    the card is drawn up out of the pocket and held for a moment so the names can be read
       reveal  the envelope sinks away, the card comes to the camera, and its light fills the screen and settles into the cover */
  function open() {
    if (phase !== 'closed') return;
    phase = 'opening'; root.dataset.phase = 'opening';
    clearBinds();
    hooks.onOpen?.();
    try { navigator.vibrate?.(14); } catch { /* not supported */ }
    const q = <T extends HTMLElement>(s: string) => root.querySelector(s) as T;
    const rr = root.getBoundingClientRect();
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cover = q('[data-cover]'), scroller = q('[data-scroller]'), fade = q('[data-fade]');
    cover.classList.add('is-in'); armSettle();
    if (reduce) { finish(); return; }

    const env = q('[data-env]'), card = q('[data-card]'), flap = q('[data-flap]'), fbox = q('[data-flapbox]'), fsh = q('[data-fshadow]'), glow = q('[data-glow]');
    const sealU = q('[data-sealu]'), sealL = q('[data-seall]'), crack = root.querySelector('[data-crack]') as SVGPathElement;
    const head = q('[data-head]'), hint = q('[data-hint]'), top = q('[data-top]');
    const crumbs = Array.from(root.querySelectorAll<HTMLElement>('[data-crumbs] i'));
    const parts = Array.from(root.querySelectorAll<HTMLElement>('[data-part]'));
    const ch = card.offsetHeight;
    const A = (el: Element, kf: Keyframe[], o: KeyframeAnimationOptions) => { const a = (el as HTMLElement).animate(kf, { fill: 'forwards', easing: 'ease', ...o }); anims.push(a); return a; };
    const jump = (el: HTMLElement, prop: string, from: string, to: string, at: number) => A(el, [{ [prop]: from }, { [prop]: to }], { delay: at, duration: 1, easing: 'steps(1, jump-start)' });

    /* 0.00 – 0.60  press: both halves sink under the thumb, a crack runs across, the wax gives way */
    A(hint, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    A(head, [{ opacity: 1 }, { opacity: 0 }], { delay: 200, duration: 700 });
    [sealU, sealL].forEach(h => A(h, [{ transform: 'scale(1)' }, { offset: .5, transform: 'scale(.9)' }, { transform: 'scale(1)' }], { duration: 480, easing: 'ease-in-out' }));
    A(crack, [{ strokeDashoffset: 1, opacity: 1 }, { strokeDashoffset: 0, opacity: 1 }], { delay: 160, duration: 220, easing: 'ease-out' });
    A(crack, [{ opacity: 1 }, { opacity: 0 }], { delay: 620, duration: 300 });
    A(env, [{ transform: 'translateY(0) rotate(0deg)' }, { offset: .4, transform: 'translateY(2px) rotate(.45deg)' }, { transform: 'translateY(0) rotate(0deg)' }], { delay: 330, duration: 460, easing: 'ease-out' });
    crumbs.forEach(c => {
      const dx = parseFloat(c.style.getPropertyValue('--dx')), dy = parseFloat(c.style.getPropertyValue('--dy'));
      A(c, [{ opacity: 0, transform: 'translate(0,0) scale(.5)', easing: 'cubic-bezier(.15,.7,.35,1)' },
        { opacity: 1, offset: .1 },
        { opacity: 1, transform: `translate(${dx}px, ${dy}px) scale(1)`, offset: .42, easing: 'cubic-bezier(.5,0,.9,.55)' },
        { opacity: 0, transform: `translate(${dx * 1.3}px, ${dy + rr.height * .12}px) scale(.8)` }], { delay: 330, duration: 1000, easing: 'linear' });
    });

    /* 0.55 – 1.90  the flap folds back 180° in 3D; the half of the seal stuck to it goes with it, behind the card once past 90° */
    A(fsh, [{ opacity: 1 }, { opacity: 0 }], { delay: 560, duration: 800, easing: 'ease-in' });
    A(flap, [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(180deg)' }], { delay: 560, duration: 1350, easing: 'cubic-bezier(.5,0,.2,1)' });
    jump(fbox, 'zIndex', '4', '1', 560 + 680);

    /* 1.10 – 2.10  warm light spills from the lining */
    A(glow, [{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, transform: 'scale(1)' }], { delay: 1100, duration: 1000, easing: 'ease-out' });

    /* 1.75 – 3.00  the card is drawn up out of the pocket and held, so the names can be read */
    const cr = card.getBoundingClientRect(); // measured at rest, before anything has moved
    const riseY = Math.min(ch * 0.72, Math.max(ch * 0.34, cr.top - rr.top - 14)); // on a short landscape screen the card must not leave the top
    const rise = `translateY(${-riseY}px) rotate(-1.6deg) scale(1.015)`;
    A(card, [{ transform: 'translateY(0) rotate(0deg) scale(1)' }, { transform: rise }], { delay: 1750, duration: 1250, easing: 'cubic-bezier(.3,0,.15,1)' });

    /* 3.30 – 4.20  the envelope sinks and falls away */
    parts.forEach(p => A(p, [{ transform: 'translateY(0) rotate(0deg)', opacity: 1 }, { transform: `translateY(${rr.height * 0.9}px) rotate(5deg)`, opacity: 0 }], { delay: 3300, duration: 900, easing: 'cubic-bezier(.55,0,.8,.35)' }));

    /* 3.40 – 4.40  the card comes to the camera (it passes in front of the envelope once the pocket has dropped clear of it) */
    const sc = Math.min((rr.width * 0.88) / cr.width, (rr.height * 0.72) / cr.height, 2.4);
    const dx = rr.left + rr.width / 2 - (cr.left + cr.width / 2), dy = rr.top + rr.height / 2 - (cr.top + cr.height / 2); 
    jump(card, 'zIndex', '2', '9', 3650);
    A(card, [{ transform: rise }, { transform: `translate(${dx}px, ${dy}px) rotate(0deg) scale(${sc})` }], { delay: 3400, duration: 1000, easing: 'cubic-bezier(.5,0,.2,1)' });

    /* 4.05 – 5.30  the light of the card fills the screen and settles into the cover */
    A(fade, [{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'scale(1.1)' }], { delay: 4050, duration: 450, easing: 'ease-in' });
    A(scroller, [{ opacity: 0, visibility: 'hidden' }, { opacity: 1, visibility: 'visible' }], { delay: 4500, duration: 1, easing: 'steps(1, jump-start)' });
    A(top, [{ opacity: 0 }, { opacity: 1 }], { delay: 4900, duration: 700 });
    const last = A(fade, [{ opacity: 1, transform: 'scale(1.1)' }, { opacity: 0, transform: 'scale(1.9)' }], { delay: 4500, duration: 800, easing: 'ease-out' });
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
