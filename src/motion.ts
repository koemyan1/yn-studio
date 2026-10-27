/* Site-wide motion layer (no libraries, $0).
   Everything here only ADDS data attributes / body-level elements, so React never loses its own classes.
   - scroll reveal : list cards fade/slide in the first time they scroll into view (data-mv)
   - tap ripple    : soft circle at the finger/cursor on buttons and cards (body-level, never inside React nodes)
   - scroll progress bar under the top edge
   - sheet / toast / modal entrances are pure CSS (motion.css)
   Skipped completely when the device asks for "reduce motion". */
let started = false;

const REVEAL = [
  '.cartItem', '.cartrow', '.ordercard', '.transaction', '.notificationCard', '.rewardCard', '.profilePanel',
  '.shop .panel', '.cartPage .panel', '.ordersPage .panel', '.walletPage .panel', '.profilePage .panel',
  '.sectionHead', '.summaryLine', '.miniitem', '.debtStats>*', '.profileQuickGrid>*', '.rewardGrid>*',
].join(',');
const SKIP = '.admin,.categoryRail,.chips,.bannerSlider,.payModal,.scannerOverlay,[data-mv-skip],[data-rv]';
const RIPPLE = 'button:not(:disabled),.button,a.icon,.bottom a,.categoryRail button,.notificationCard,.profileQuickGrid a';

export function initMotion() {
  if (started || typeof window === 'undefined' || typeof document === 'undefined') return;
  started = true;
  const reduce = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  document.documentElement.setAttribute('data-motion', 'on');

  /* ---------------- scroll reveal ---------------- */
  const seen = new WeakSet<Element>();
  let batch = 0, batchTimer = 0;
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const el = en.target as HTMLElement;
          io!.unobserve(el);
          el.style.setProperty('--mv-d', Math.min(batch++, 6) * 70 + 'ms');
          window.clearTimeout(batchTimer);
          batchTimer = window.setTimeout(() => { batch = 0; }, 120);
          el.setAttribute('data-mv', '1');
          window.setTimeout(() => { el.removeAttribute('data-mv'); el.style.removeProperty('--mv-d'); }, 1100);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 })
    : null;

  const prep = (el: HTMLElement) => {
    if (!io || seen.has(el) || el.closest(SKIP)) return;
    seen.add(el);
    const r = el.getBoundingClientRect();
    // already on screen (the page-in animation handles these) or not laid out: leave alone
    if (r.height === 0 || r.top < window.innerHeight * 0.96) return;
    el.setAttribute('data-mv', '0');
    io.observe(el);
    // safety net: never leave anything hidden
    window.setTimeout(() => { if (el.getAttribute('data-mv') === '0') { el.setAttribute('data-mv', '1'); window.setTimeout(() => el.removeAttribute('data-mv'), 1100); } }, 9000);
  };
  const scan = (root: ParentNode) => root.querySelectorAll<HTMLElement>(REVEAL).forEach(prep);

  let scanQueued = false;
  const queueScan = () => {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => { scanQueued = false; scan(document); });
  };
  new MutationObserver(queueScan).observe(document.body, { childList: true, subtree: true });
  queueScan();

  /* ---------------- tap ripple ---------------- */
  window.addEventListener('pointerdown', (e: PointerEvent) => {
    const t = e.target as Element | null;
    const hit = t && t.closest ? (t.closest(RIPPLE) as HTMLElement | null) : null;
    if (!hit || hit.closest('.admin,[data-mv-skip]')) return;
    const r = hit.getBoundingClientRect();
    if (r.width < 24 || r.height < 24 || r.width > 520) return;
    const d = Math.max(r.width, r.height) * 1.5;
    const s = document.createElement('span');
    s.className = 'mvRipple';
    s.setAttribute('aria-hidden', 'true');
    s.style.cssText = `left:${e.clientX - d / 2}px;top:${e.clientY - d / 2}px;width:${d}px;height:${d}px`;
    document.body.appendChild(s);
    window.setTimeout(() => s.remove(), 650);
  }, { passive: true });

  /* ---------------- scroll progress ---------------- */
  const bar = document.createElement('div');
  bar.className = 'mvProgress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);
  let pTick = false;
  const onScroll = () => {
    if (pTick) return;
    pTick = true;
    requestAnimationFrame(() => {
      pTick = false;
      const h = document.documentElement.scrollHeight - window.innerHeight;
      const p = h > 40 ? Math.min(1, Math.max(0, window.scrollY / h)) : 0;
      bar.style.transform = `scaleX(${p})`;
      bar.style.opacity = p > 0.01 && p < 0.995 ? '1' : '0';
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();
}
