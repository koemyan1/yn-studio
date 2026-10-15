/**
 * "Same look on every device" – build-time PostCSS step (used by vite.config.ts).
 *
 * The storefront is designed on a phone. On a tablet / computer the page is shown as that same phone page,
 * centred and scaled up (see src/fit.css + applyFit() in src/themeElements.tsx, which put  data-yn-fit  on <html>).
 * Browsers still pick CSS by the REAL screen width, so for the phone page to be laid out like a phone on a big screen we
 *   1. copy every  @media (max-width: N)  phone/tablet block so it ALSO applies when  html[data-yn-fit]  is set, and
 *   2. switch off the  @media (min-width: N)  "wide screen" blocks while  data-yn-fit  is set.
 * The copies use :where() so they have exactly the same specificity as the originals and sit right after them,
 * so the cascade behaves like it does on a phone. Future phone rules you add are mirrored automatically.
 */
const FIT = ':where(html[data-yn-fit])';
const NOT_FIT = ':where(html:not([data-yn-fit]))';
const SKIP_FILES = /admin\.css$/;

function withPrefix(sel, prefix, htmlForm) {
  const s = sel.trim();
  const m = /^(html|:root)(?![\w-])/.exec(s);
  if (m) return m[1] + htmlForm + s.slice(m[1].length);
  return prefix + ' ' + s;
}
function mirrorSelector(sel) { return withPrefix(sel, FIT, ':where([data-yn-fit])'); }
function offSelector(sel) { return withPrefix(sel, NOT_FIT, ':where(:not([data-yn-fit]))'); }

function mapRules(container, fn) {
  container.walkRules(rule => {
    // do not touch keyframe steps (from / to / 50%)
    if (rule.parent && rule.parent.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
    rule.selectors = rule.selectors.map(fn);
  });
}

export default function ynFit(opts = {}) {
  const lo = opts.minMax ?? 380, hi = opts.maxMax ?? 1000;
  return {
    postcssPlugin: 'yn-fit',
    Once(root) {
      const file = (root.source && root.source.input && root.source.input.file) || '';
      if (SKIP_FILES.test(file)) return;
      root.each(node => {
        if (node.type !== 'atrule' || node.name !== 'media' || node.__ynMirror) return;
        const p = node.params.replace(/\s+/g, '').toLowerCase();
        let m = /^\(max-width:(\d+)px\)$/.exec(p);
        if (m) {
          const n = +m[1];
          if (n < lo || n > hi) return;
          const copy = node.clone({ params: `(min-width: ${n + 1}px)` });
          copy.__ynMirror = true;
          mapRules(copy, mirrorSelector);
          node.after(copy);
          return;
        }
        m = /^\(min-width:(\d+)px\)$/.exec(p);
        if (m) { const n = +m[1]; if (n >= 560 && n <= 1500) mapRules(node, offSelector); }
      });
    },
  };
}
ynFit.postcss = true;
