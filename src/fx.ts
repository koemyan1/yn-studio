/* Tiny, dependency-free motion helpers for the customer storefront.
   - sets data-scrolled on <html> once the page is scrolled (header gets a stronger shadow)
   - cursor "spotlight": cards glow where the pointer is (--mx / --my set on the hovered card only) */
let started = false;

export function initFx() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const root = document.documentElement;

  let ticking = false, scrolled = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const now = (window.scrollY || 0) > 8;
      if (now === scrolled) return;
      scrolled = now;
      if (now) root.setAttribute('data-scrolled', '1'); else root.removeAttribute('data-scrolled');
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const hover = window.matchMedia?.('(hover: hover)').matches;
  if (reduce || !hover) return;

  const SEL = '.product,.profileStats a,.profileQuickGrid a';
  let raf = 0, el: HTMLElement | null = null, px = 0, py = 0;
  window.addEventListener('pointermove', (e: PointerEvent) => {
    const t = e.target as Element | null;
    const hit = (t && t.closest ? t.closest(SEL) : null) as HTMLElement | null;
    if (!hit) return;
    el = hit; px = e.clientX; py = e.clientY;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (px - r.left) + 'px');
      el.style.setProperty('--my', (py - r.top) + 'px');
    });
  }, { passive: true });
}
