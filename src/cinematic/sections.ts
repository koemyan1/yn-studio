/* Cinematic invitation, the scrolling sections below the cover. Plain DOM, no dependencies. */
import { iconSvg, LOGOS, crestSvg, scallopFrame } from './art';
import type { CineCfg } from './types';
import { getT } from './text';
import { extrasFor } from './extras';

const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const KH = '០១២៣៤៥៦៧៨៩';
const num = (n: number | string, km: boolean) => (km ? String(n).replace(/\d/g, c => KH[+c]) : String(n));
const bg = (u: string) => (u ? ` style="background-image:url('${esc(u)}')"` : '');
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export type FlowDeps = { logo: (v: 'cover') => string; uid: string; edit?: boolean };

export function buildFlow(cfg: CineCfg, d: FlowDeps): string {
  const t = getT(cfg), km = cfg.lang === 'km', id = d.uid + 'f';
  /* edit mode only: marks an element so the preview editor can hover / select it (guests never get these attributes) */
  const ed = (k: string, label: string) => (d.edit ? ` data-ed="${esc(k)}" data-edl="${esc(label)}"` : '');
  const xs = (sec: string) => extrasFor(cfg.extras, sec, !!d.edit);
  const tw = (id: string) => ` data-tw="${id}"`;
  const addBand = (k: string, label: string, cls: string) => (d.edit ? `<section class="cn-sec cn-addsec ${cls}"${ed(k, label)}><span>＋ ${esc(label)}</span></section>` : '');
  const ph = (v: string, fb: string) => (v ? esc(v) : cfg.preview ? `<span class="cn-ph">${esc(fb)}</span>` : '');
  const person = (father: string, mother: string) => [father && `${t.mr} ${esc(father)}`, mother && `${t.mrs} ${esc(mother)}`].filter(Boolean).join('<br>');
  const divider = `<i class="cn-div" aria-hidden="true"><svg viewBox="0 0 300 24" preserveAspectRatio="xMidYMid meet"><g fill="none" stroke="url(#${id})" stroke-width="1.8" stroke-linecap="round"><path d="M0 12 H110"/><path d="M190 12 H300"/><path d="M122 12 C118 3 108 3 108 12 C108 18 116 18 118 13"/><path d="M178 12 C182 3 192 3 192 12 C192 18 184 18 182 13"/></g><path d="M150 2 L159 12 L150 22 L141 12 Z" fill="url(#${id})"/><circle cx="130" cy="12" r="2.4" fill="url(#${id})"/><circle cx="170" cy="12" r="2.4" fill="url(#${id})"/></svg></i>`;
  const head = (txt: string, tk: string) => `<header class="cn-sh"><h3 class="cn-h cn-foil"${ed('t:' + tk, 'Heading')}>${esc(txt)}</h3>${divider}</header>`;
  const out: string[] = [];

  /* 3 — the formal words, an arched photo and both sets of parents */
  const lines = (cfg.words || t.wordsDefault).split('\n').filter(l => l.trim());
  const pg = person(cfg.groomFather, cfg.groomMother), pb = person(cfg.brideFather, cfg.brideMother);
  out.push(`<section class="cn-sec cn-words cn-light" data-sec="words" data-rv${ed('bg:light', 'Light background')}>
    ${head(t.wordsHead, 'wordsHead')}
    <div class="cn-arch"${tw('w.arch')}${ed('f:archPhoto', 'Arch photo')}><div class="cn-archImg"${bg(cfg.archPhoto || cfg.photo)}>${cfg.archPhoto || cfg.photo ? '' : `<span class="cn-archCrest">${crestSvg(id)}</span>`}</div><i class="cn-archLine"></i></div>
    <p class="cn-wtext"${tw('w.text')}${ed('f:words', 'Invitation words')}>${lines.map((l, i) => `<span class="cn-wl" style="--i:${i}"><span>${esc(l)}</span></span>`).join('')}</p>
    <div class="cn-parents"${tw('w.parents')}>
      <div class="cn-par" style="--i:0"><small class="cn-foil"${ed('t:parentsG', 'Label')}>${esc(t.parentsG)}</small><p${ed('f:groomParents', 'Groom’s parents')}>${pg || ph('', t.parentsG)}</p></div>
      <div class="cn-par" style="--i:1"><small class="cn-foil"${ed('t:parentsB', 'Label')}>${esc(t.parentsB)}</small><p${ed('f:brideParents', 'Bride’s parents')}>${pb || ph('', t.parentsB)}</p></div>
    </div>${xs('words')}</section>`);

  /* 4 — the couple, in scalloped frames */
  const fig = (photo: string, name: string, role: string, i: number, who: 'groom' | 'bride') => `<figure class="cn-fig" style="--i:${i}"${tw('p.' + who)}>
      <div class="cn-frameWrap"${ed('f:' + who, who === 'groom' ? 'Groom' : 'Bride')}><div class="cn-frame"><div class="cn-frameImg"${bg(photo)}>${photo ? '' : `<span class="cn-archCrest">${crestSvg(id)}</span>`}</div></div>
        <svg class="cn-frameLine" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true"><path d="${scallopFrame()}" fill="none" stroke="url(#${id})" stroke-width="2" vector-effect="non-scaling-stroke"/></svg></div>
      <figcaption><small${ed('t:' + who, 'Label')}>${esc(role)}</small><b class="cn-foil"${ed('f:' + who, who === 'groom' ? 'Groom' : 'Bride')}>${name ? esc(name) : cfg.preview ? `<span class="cn-ph">${esc(role)}</span>` : ''}</b></figcaption></figure>`;
  out.push(`<section class="cn-sec cn-couple cn-light" data-sec="couple" data-rv${ed('bg:light', 'Light background')}>${head(t.coupleHead, 'coupleHead')}
    <div class="cn-figs">${fig(cfg.groomPhoto, cfg.groomKh || cfg.groomEn, t.groom, 0, 'groom')}${fig(cfg.bridePhoto, cfg.brideKh || cfg.brideEn, t.bride, 1, 'bride')}</div>${xs('couple')}</section>`);

  /* 5 — countdown over a slow blessing marquee */
  const bl = esc(cfg.blessing || t.blessingDefault);
  out.push(`<section class="cn-sec cn-count cn-dark" data-sec="count" data-rv${ed('bg:dark', 'Dark background')}>
    <div class="cn-marq" aria-hidden="true"><span>${Array(8).fill(bl).join('  ·  ')}</span><span>${Array(8).fill(bl).join('  ·  ')}</span></div>
    <h3 class="cn-h cn-foil"${ed('t:countHead', 'Heading')}>${esc(t.countHead)}</h3>
    <div class="cn-cd" data-cd${tw('n.cd')}${ed('f:countdown', 'Countdown & blessing')}>${t.units.map((u, i) => `<div><b data-u="${i}">${num('00', km)}</b><small>${esc(u)}</small></div>`).join('<i class="cn-cdc">:</i>')}</div>
    <p class="cn-over" data-over hidden>${esc(t.over)}</p>${xs('count')}</section>`);

  /* 6 — programme: a gold thread draws down as you scroll, each icon lights up */
  const steps = cfg.schedule.map((s, n) => ({ ...s, i: s.i ?? n })).filter(s => s.name || s.time);
  if (steps.length || cfg.preview) {
    const list = steps.length ? steps : [{ time: '', name: t.prog, date: '', i: -1 }];
    out.push(`<section class="cn-sec cn-prog cn-light" data-sec="prog" data-rv data-prog${ed('bg:light', 'Light background')}>${head(t.prog, 'prog')}
      <div class="cn-thread"><svg viewBox="0 0 6 100" preserveAspectRatio="none" aria-hidden="true"><path class="cn-thread-bg" d="M3 0 V100" vector-effect="non-scaling-stroke"/><path class="cn-thread-fg" data-thread pathLength="1" d="M3 0 V100" stroke="url(#${id})" vector-effect="non-scaling-stroke"/></svg></div>
      <ol class="cn-steps">${list.map((s, i) => `<li class="cn-step ${i % 2 ? 'R' : 'L'}" data-step${ed(s.i >= 0 ? `f:step:${s.i}` : 'f:step:new', s.i >= 0 ? 'Programme item' : 'Add a programme item')}><span class="cn-ic">${iconSvg(i, id)}</span><div class="cn-stepTxt">${s.time ? `<time>${esc(s.time)}</time>` : ''}<b>${esc(s.name)}</b>${s.date ? `<small>${esc(s.date)}</small>` : ''}</div></li>`).join('')}</ol>${xs('prog')}</section>`);
  }

  /* 7 — love story: a pinned sideways strip, the sky moving from day to dusk */
  const story = cfg.story.map((s, n) => ({ ...s, i: s.i ?? n })).filter(s => s.photo || s.caption);
  if (story.length) {
    out.push(`<section class="cn-story" data-story style="--n:${story.length}"><div class="cn-pin" data-sec="story"><h3 class="cn-h cn-foil cn-storyH"${ed('t:story', 'Heading')}>${esc(t.story)}</h3>
      <div class="cn-track" data-track>${story.map((s, i) => `<div class="cn-slide${i === 0 ? ' on' : ''}"><div class="cn-polaroid" style="--r:${i % 2 ? 2.5 : -2.5}deg"${tw('s.' + s.i)}${ed('f:story:' + s.i, 'Love-story moment')}><div class="cn-pimg"${bg(s.photo)}></div></div><p${ed('f:story:' + s.i, 'Love-story moment')}>${esc(s.caption)}</p></div>`).join('')}</div>
      <div class="cn-dots">${story.map((_, i) => `<i${i === 0 ? ' class="on"' : ''}></i>`).join('')}</div>${xs('story')}</div></section>`);
  } else out.push(addBand('f:story:new', 'Add a love-story moment', 'cn-light'));

  /* 8 — candlelight: touch the water, ripples spread and a small lotus lantern floats up */
  const cp = cfg.candlePhoto || cfg.photo;
  if (cp) {
    out.push(`<section class="cn-candle cn-dark" data-sec="candle" data-candle${ed('f:candle', 'Candlelight photo')}><div class="cn-candleImg"${bg(cp)}></div><div class="cn-candleShade"></div><canvas data-cv aria-hidden="true"></canvas><p class="cn-candleHint"${ed('t:candle', 'Hint text')}>${esc(t.candle)}</p><div class="cn-lanterns" data-lanterns></div>${xs('candle')}</section>`);
  } else out.push(addBand('f:candle', 'Add a candlelight photo', 'cn-dark'));

  /* 9 — gallery */
  if (cfg.gallery.length) {
    out.push(`<section class="cn-sec cn-gallery cn-light" data-sec="gallery" data-rv${ed('bg:light', 'Light background')}>${head(t.gallery, 'gallery')}<div class="cn-masonry">${cfg.gallery.map((u, i) => `<button type="button" class="cn-gi" data-act="open" data-i="${i}" style="--i:${i % 6}"${ed('f:gallery:' + i, 'Gallery photo')}><img src="${esc(u)}" alt="" loading="lazy" decoding="async"></button>`).join('')}</div>${xs('gallery')}</section>`);
  } else out.push(addBand('f:gallery:new', 'Add gallery photos', 'cn-light'));

  /* 10 — venue */
  const hasMap = cfg.lat && cfg.lng;
  if (cfg.venue || hasMap || cfg.mapUrl || d.edit) {
    const mapHref = cfg.mapUrl || (hasMap ? `https://www.google.com/maps?q=${encodeURIComponent(cfg.lat + ',' + cfg.lng)}` : '');
    out.push(`<section class="cn-sec cn-venue-s cn-dark" data-sec="venue" data-rv${ed('bg:dark', 'Dark background')}><div class="cn-crest2"${ed('f:foil', 'Gold style')}>${crestSvg(id)}</div>${head(t.venue, 'venue')}
      <p class="cn-vname"${tw('v.name')}${ed('f:venue', 'Venue')}>${ph(cfg.venue, t.phV)}</p>${cfg.dateLong ? `<p class="cn-vdate"${ed('f:date', 'Date & time')}>${esc(cfg.dateLong)}</p>` : ''}
      ${hasMap ? `<div class="cn-map"${tw('v.map')}${ed('f:map', 'Map location')}><iframe title="map" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?q=${encodeURIComponent(cfg.lat + ',' + cfg.lng)}&z=16&output=embed"></iframe></div>` : d.edit ? `<div class="cn-map cn-mapPh"${tw('v.map')}${ed('f:map', 'Map location')}><span>${LOGOS.pin}</span></div>` : ''}
      <div class="cn-btns">${mapHref || d.edit ? `<a class="cn-btn" href="${esc(mapHref || '#')}" target="_blank" rel="noopener noreferrer"${ed('f:mapbtn', 'Map button')}>${LOGOS.pin}<span>${esc(t.openMap)}</span></a>` : ''}${cfg.ics ? `<button type="button" class="cn-btn cn-btn2" data-act="ics"${ed('t:saveCal', 'Button text')}>${LOGOS.cal}<span>${esc(t.saveCal)}</span></button>` : ''}</div>${xs('venue')}</section>`);
  }

  /* 11 — wedding gift: QR codes always visible */
  const qrs = cfg.qrs.map((q, n) => ({ ...q, i: q.i ?? n }));
  if (qrs.length) {
    out.push(`<section class="cn-sec cn-gift cn-light" data-sec="gift" data-rv${ed('bg:light', 'Light background')}>${head(t.gift, 'gift')}<div class="cn-qrs">${qrs.map((q, i) => `<figure class="cn-qr" style="--i:${i}"${ed('f:qr:' + q.i, 'Gift QR code')}><div class="cn-qrImg"><img src="${esc(q.url)}" alt="${esc(q.label)}" loading="lazy"></div><figcaption>${esc(q.label)}</figcaption><button type="button" class="cn-btn cn-btn3" data-act="qr" data-url="${esc(q.url)}" data-name="${esc(q.label || 'qr')}"${ed('t:saveQr', 'Button text')}>${LOGOS.save}<span>${esc(t.saveQr)}</span></button></figure>`).join('')}</div>${xs('gift')}</section>`);
  } else out.push(addBand('f:qr:new', 'Add a gift QR code', 'cn-light'));

  /* 12 — thank you: candles light one by one, share buttons, name logo, credit */
  out.push(`<section class="cn-sec cn-thanks cn-dark" data-sec="thanks" data-rv${ed('bg:dark', 'Dark background')}>
    <div class="cn-candles" aria-hidden="true">${[0, 1, 2, 3, 4].map(i => `<span class="cn-cdl" style="--i:${i}"><i class="cn-flame"></i><i class="cn-wick"></i><i class="cn-wax"></i></span>`).join('')}</div>
    <h2 class="cn-big cn-foil"${ed('t:thanksHead', 'Heading')}>${esc(t.thanksHead)}</h2>${cfg.thanks || d.edit ? `<p class="cn-thanksTxt"${tw('t.text')}${ed('f:thanks', 'Thank-you message')}>${cfg.thanks ? esc(cfg.thanks) : `<span class="cn-ph">${esc(t.thanksHead)}…</span>`}</p>` : ''}
    <div class="cn-logoBox"${tw('t.logo')}>${d.logo('cover')}</div>
    <p class="cn-shareH"${ed('t:shareHead', 'Text')}>${esc(t.shareHead)}</p>
    <div class="cn-share">
      <a class="cn-sb" data-share="tg" href="#"${ed('t:shareTg', 'Button text')}>${LOGOS.telegram}<span>${esc(t.shareTg)}</span></a>
      <a class="cn-sb" data-share="ms" href="#"${ed('t:shareMs', 'Button text')}>${LOGOS.messenger}<span>${esc(t.shareMs)}</span></a>
      <a class="cn-sb" data-share="fb" href="#"${ed('t:shareFb', 'Button text')}>${LOGOS.facebook}<span>${esc(t.shareFb)}</span></a>
      <button type="button" class="cn-sb" data-act="copy"${ed('t:copy', 'Button text')}>${LOGOS.link}<span data-copy>${esc(t.copy)}</span></button>
    </div>
    <p class="cn-credit"><a href="https://ynstudio.site" target="_blank" rel="noopener noreferrer">${esc(t.credit)}</a></p>${xs('thanks')}</section>`);

  /* full-screen gallery viewer (outside the flow) */
  out.push(`<div class="cn-viewer" data-viewer hidden role="dialog" aria-modal="true"><button type="button" class="cn-vclose" data-act="vclose" aria-label="${esc(t.close)}">✕</button>
    <div class="cn-vtrack" data-vtrack>${cfg.gallery.map(u => `<div class="cn-vslide"><img src="${esc(u)}" alt="" decoding="async"></div>`).join('')}</div><div class="cn-vcount" data-vcount></div></div>`);
  return out.join('\n');
}

/* ------------------------------------------------------------------ behaviour ------------------------------------------------------------------ */
export function initFlow(root: HTMLElement, scroller: HTMLElement, cfg: CineCfg): () => void {
  const t = getT(cfg), km = cfg.lang === 'km';
  const cleanups: (() => void)[] = [];
  const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, ev: string, fn: (e: any) => void, o?: AddEventListenerOptions) => { el.addEventListener(ev, fn as EventListener, o); cleanups.push(() => el.removeEventListener(ev, fn as EventListener, o)); };
  const top = root.querySelector('[data-top]') as HTMLElement | null;

  /* reveal on enter */
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { (e.target as HTMLElement).classList.add('in'); io.unobserve(e.target); } }), { root: scroller, threshold: 0.16 });
    root.querySelectorAll('[data-rv]').forEach(el => io.observe(el)); cleanups.push(() => io.disconnect());
  } else root.querySelectorAll('[data-rv]').forEach(el => el.classList.add('in'));

  /* scroll-linked work: top bar, programme thread, love-story strip */
  const prog = root.querySelector('[data-prog]') as HTMLElement | null, thread = root.querySelector('[data-thread]') as SVGPathElement | null;
  const story = root.querySelector('[data-story]') as HTMLElement | null, track = root.querySelector('[data-track]') as HTMLElement | null;
  let raf = 0;
  const frame = () => {
    raf = 0;
    const vh = scroller.clientHeight, st = scroller.scrollTop;
    top?.classList.toggle('is-scrolled', st > 40);
    if (prog && thread) {
      const r = prog.getBoundingClientRect(), sr = scroller.getBoundingClientRect();
      const p = clamp((sr.top + vh * 0.62 - r.top) / r.height, 0, 1);
      thread.style.strokeDashoffset = String(1 - p);
      const steps = prog.querySelectorAll<HTMLElement>('[data-step]');
      steps.forEach(li => { const lr = li.getBoundingClientRect(); li.classList.toggle('lit', lr.top + lr.height / 2 < sr.top + vh * 0.62); });
    }
    if (story && track) {
      const r = story.getBoundingClientRect(), n = Number(story.style.getPropertyValue('--n')) || 1;
      const p = clamp(-r.top / Math.max(1, r.height - vh), 0, 1);
      story.style.setProperty('--t', p.toFixed(3));
      /* hold on each photo, then glide to the next */
      const x = p * (n - 1), k = Math.min(n - 2 < 0 ? 0 : n - 2, Math.floor(x)), f = n > 1 ? x - k : 0;
      const e = f < 0.22 ? 0 : f > 0.78 ? 1 : (() => { const u = (f - 0.22) / 0.56; return u * u * (3 - 2 * u); })();
      const pos = n > 1 ? k + e : 0;
      track.style.transform = `translate3d(${(-pos / n * 100).toFixed(3)}%,0,0)`;
      const idx = Math.round(pos);
      track.querySelectorAll('.cn-slide').forEach((s, i) => s.classList.toggle('on', i === idx));
      story.querySelectorAll('.cn-dots i').forEach((s, i) => s.classList.toggle('on', i === idx));
    }
  };
  const queue = () => { if (!raf) raf = requestAnimationFrame(frame); };
  on(scroller, 'scroll', queue, { passive: true }); on(window, 'resize', queue);
  cleanups.push(() => cancelAnimationFrame(raf)); queue();

  /* countdown, in Khmer numerals in Khmer mode */
  const cd = root.querySelector('[data-cd]'), over = root.querySelector('[data-over]') as HTMLElement | null;
  if (cd && cfg.target) {
    const cells = Array.from(cd.querySelectorAll<HTMLElement>('[data-u]'));
    const tick = () => {
      const s = Math.max(0, Math.floor(((cfg.target as number) - Date.now()) / 1000));
      const v = [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60];
      cells.forEach((c, i) => { const nv = num(String(v[i]).padStart(2, '0'), km); if (c.textContent !== nv) { c.textContent = nv; c.classList.remove('tick'); void c.offsetWidth; c.classList.add('tick'); } });
      if (over) over.hidden = s > 0; (cd as HTMLElement).classList.toggle('done', s === 0);
    };
    tick(); const iv = window.setInterval(tick, 1000); cleanups.push(() => clearInterval(iv));
  }

  /* candlelight water: 2D ripples, only while visible, sized by its parent (never by itself) */
  const sec = root.querySelector('[data-candle]') as HTMLElement | null;
  if (sec) {
    const cv = sec.querySelector('canvas') as HTMLCanvasElement, ctx = cv.getContext('2d')!, lan = sec.querySelector('[data-lanterns]') as HTMLElement;
    let rip: { x: number; y: number; r: number; a: number }[] = [], visible = false, run = 0, last = 0;
    const size = () => { const r = sec.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    const ro = new ResizeObserver(size); ro.observe(sec); cleanups.push(() => ro.disconnect()); size();
    const draw = () => {
      run = 0; ctx.clearRect(0, 0, cv.width, cv.height);
      rip = rip.filter(p => p.a > 0.02);
      rip.forEach(p => { p.r += 1.9; p.a *= 0.968; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r - k * 9, 0, Math.PI * 2); ctx.strokeStyle = `rgba(255,232,170,${Math.max(0, p.a - k * 0.14).toFixed(3)})`; ctx.lineWidth = 2 - k * 0.5; if (p.r - k * 9 > 0) ctx.stroke(); } });
      if (rip.length && visible) run = requestAnimationFrame(draw);
    };
    const kick = () => { if (!run && visible) run = requestAnimationFrame(draw); };
    const vio = new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) kick(); }, { root: scroller, threshold: 0.05 }); vio.observe(sec); cleanups.push(() => { vio.disconnect(); cancelAnimationFrame(run); });
    const at = (e: PointerEvent) => { const r = sec.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    on(sec, 'pointerdown', (e: PointerEvent) => {
      const { x, y } = at(e); rip.push({ x, y, r: 4, a: 0.9 }); kick();
      if (lan.children.length < 6) { const el = document.createElement('div'); el.className = 'cn-lantern'; el.style.left = x + 'px'; el.style.top = y + 'px'; el.innerHTML = `<svg viewBox="0 0 60 50"><g fill="#ffd98a" stroke="#b07a1e" stroke-width="1"><path d="M30 6 C38 18 38 30 30 40 C22 30 22 18 30 6Z"/><path d="M30 12 C46 18 52 30 46 38 C40 36 34 32 30 26Z" opacity=".85"/><path d="M30 12 C14 18 8 30 14 38 C20 36 26 32 30 26Z" opacity=".85"/></g><ellipse cx="30" cy="42" rx="20" ry="4" fill="#ffefc0" opacity=".5"/></svg>`; el.addEventListener('animationend', () => el.remove()); lan.appendChild(el); }
    });
    on(sec, 'pointermove', (e: PointerEvent) => { const n = performance.now(); if (n - last < 90 || e.buttons === 0 && e.pointerType !== 'mouse') return; last = n; const { x, y } = at(e); rip.push({ x, y, r: 2, a: 0.32 }); kick(); });
  }

  /* gallery viewer (swipe with native scroll-snap) */
  const viewer = root.querySelector('[data-viewer]') as HTMLElement | null, vt = root.querySelector('[data-vtrack]') as HTMLElement | null, vc = root.querySelector('[data-vcount]') as HTMLElement | null;
  const updCount = () => { if (vt && vc) { const i = Math.round(vt.scrollLeft / Math.max(1, vt.clientWidth)); vc.textContent = `${num(i + 1, km)} / ${num(cfg.gallery.length, km)}`; } };
  if (vt) on(vt, 'scroll', updCount, { passive: true });
  const closeViewer = () => { if (viewer) viewer.hidden = true; };
  on(window, 'keydown', (e: KeyboardEvent) => { if (!viewer || viewer.hidden) return; if (e.key === 'Escape') closeViewer(); if (vt && e.key === 'ArrowRight') vt.scrollBy({ left: vt.clientWidth, behavior: 'smooth' }); if (vt && e.key === 'ArrowLeft') vt.scrollBy({ left: -vt.clientWidth, behavior: 'smooth' }); });

  /* delegated clicks: viewer, calendar, QR download, copy, share */
  const url = () => cfg.shareUrl || location.href, title = () => cfg.shareTitle || document.title;
  on(root, 'click', async (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest('[data-act],[data-share]') as HTMLElement | null; if (!a) return;
    const act = a.dataset.act, sh = a.dataset.share;
    if (act === 'open' && viewer && vt) { viewer.hidden = false; vt.scrollLeft = Number(a.dataset.i) * vt.clientWidth; updCount(); }
    else if (act === 'vclose') closeViewer();
    else if (act === 'ics' && cfg.ics) {
      const f = (s: string) => s.replace(/[-:]/g, '').replace(/\.\d+/, '').replace(/Z$/, ''); const esc2 = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
      const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//YN Studio//Wedding//EN', 'BEGIN:VEVENT', `UID:${Date.now()}@ynstudio.site`, `DTSTAMP:${f(new Date().toISOString())}Z`, `DTSTART:${f(cfg.ics.start)}`, `DTEND:${f(cfg.ics.end)}`, `SUMMARY:${esc2(cfg.ics.title)}`, `LOCATION:${esc2(cfg.ics.location)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
      const l = document.createElement('a'); l.href = URL.createObjectURL(new Blob([body], { type: 'text/calendar' })); l.download = 'wedding.ics'; document.body.appendChild(l); l.click(); l.remove();
    } else if (act === 'qr') {
      const u = a.dataset.url || '', name = (a.dataset.name || 'qr').replace(/[^\w.-]+/g, '_');
      try { const b = await (await fetch(u, { mode: 'cors' })).blob(); const l = document.createElement('a'); l.href = URL.createObjectURL(b); l.download = name + '.png'; document.body.appendChild(l); l.click(); l.remove(); } catch { window.open(u, '_blank', 'noopener'); }
    } else if (act === 'copy') {
      try { await navigator.clipboard.writeText(url()); const s = a.querySelector('[data-copy]'); if (s) { s.textContent = t.copied; setTimeout(() => { s.textContent = t.copy; }, 1800); } } catch { prompt(t.copy, url()); }
    } else if (sh) {
      e.preventDefault(); const u = encodeURIComponent(url()), tt = encodeURIComponent(title());
      const href = sh === 'tg' ? `https://t.me/share/url?url=${u}&text=${tt}` : sh === 'fb' ? `https://www.facebook.com/sharer/sharer.php?u=${u}` : (/Android|iPhone|iPad/i.test(navigator.userAgent) ? `fb-messenger://share/?link=${u}` : `https://www.facebook.com/sharer/sharer.php?u=${u}`);
      window.open(href, '_blank', 'noopener');
    }
  });
  return () => { cleanups.splice(0).forEach(f => f()); };
}
