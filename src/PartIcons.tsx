import { useEffect, useRef } from 'react';

/* ------------------------------------------------------------------ *
 *  Icon pictures for theme parts.
 *  A real little <span> is placed inside every matching part (button, nav item, card…).
 *  It is added as a real element (not a ::before) so it never collides with the
 *  mascots the Chiikawa theme already draws with ::before / ::after.
 *  A MutationObserver puts it back whenever the page re-renders and drops it.
 * ------------------------------------------------------------------ */

export type PartIconSpec = { key: string; selector: string; icon: string; size: number; side: 'left' | 'right' | 'top' };

const NO_HOST = new Set(['IMG', 'INPUT', 'SELECT', 'TEXTAREA', 'SVG', 'BR', 'HR', 'VIDEO', 'CANVAS', 'IFRAME']);
const ATTR = 'data-yn-icon';

function styleFor(d: PartIconSpec): string {
  const url = `url("${String(d.icon).replace(/"/g, '%22')}")`;
  const size = Math.max(8, Math.min(160, Number(d.size) || 22));
  const base = `width:${size}px;height:${size}px;background:${url} center/contain no-repeat;flex:0 0 auto;pointer-events:none;`;
  if (d.side === 'top') return `display:block;margin:0 auto 4px;${base}`;
  if (d.side === 'right') return `display:inline-block;vertical-align:middle;margin:0 0 0 6px;${base}`;
  return `display:inline-block;vertical-align:middle;margin:0 6px 0 0;${base}`;
}

export function PartIcons({ parts }: { parts: PartIconSpec[] }) {
  const sig = JSON.stringify(parts);
  const specs = useRef<PartIconSpec[]>(parts);
  specs.current = parts;

  useEffect(() => {
    let raf = 0;
    const apply = () => {
      raf = 0;
      const list = specs.current;
      const keys = new Set(list.map(p => p.key));
      document.querySelectorAll('[' + ATTR + ']').forEach(n => { if (!keys.has(n.getAttribute(ATTR) || '')) n.remove(); });
      for (const d of list) {
        let hosts: Element[] = [];
        try { hosts = Array.from(document.querySelectorAll(d.selector)); } catch { hosts = []; }
        const css = styleFor(d);
        for (const h of hosts) {
          if (NO_HOST.has(h.tagName.toUpperCase())) continue;
          let s = Array.from(h.children).find(c => c.getAttribute(ATTR) === d.key) as HTMLElement | undefined;
          if (!s) { s = document.createElement('span'); s.setAttribute(ATTR, d.key); s.setAttribute('aria-hidden', 'true'); }
          if (s.getAttribute('style') !== css) s.setAttribute('style', css);
          if (d.side === 'right') { if (h.lastChild !== s) h.appendChild(s); }
          else if (h.firstChild !== s) h.insertBefore(s, h.firstChild);
        }
      }
    };
    const schedule = () => { if (!raf) raf = window.requestAnimationFrame(apply); };
    apply();
    if (!specs.current.length) return;            // nothing to keep in place → no observer needed
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { mo.disconnect(); if (raf) window.cancelAnimationFrame(raf); };
  }, [sig]);

  // when the theme is switched off (or the editor closes) take every icon away again
  useEffect(() => () => { document.querySelectorAll('[' + ATTR + ']').forEach(n => n.remove()); }, []);
  return null;
}
