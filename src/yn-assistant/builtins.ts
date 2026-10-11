// Built-in commands that control ANY page by working with the DOM.
import type { Assistant } from './assistant';

const visible = (el: Element) => {
  if (el.closest('[data-yn-ignore]')) return false; // never click the assistant itself
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
};

const labelOf = (el: Element) => {
  const h = el as HTMLElement & { value?: string; alt?: string };
  return (el.getAttribute('aria-label') || h.innerText || h.value || h.title || h.alt || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};

const CLICKABLE =
  'button, a, [role="button"], [role="tab"], [role="menuitem"], input[type="submit"], input[type="button"], summary, label';

export function findClickable(label: string, exactOnly = false): HTMLElement | undefined {
  const q = label.toLowerCase().trim();
  if (!q) return undefined;
  const els = [...document.querySelectorAll<HTMLElement>(CLICKABLE)].filter(visible);
  return els.find((e) => labelOf(e) === q) || (exactOnly ? undefined : els.find((e) => labelOf(e).includes(q)));
}

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export function findField(label: string): Field | undefined {
  const q = label.toLowerCase().replace(/\b(field|box|input)\b/g, '').trim();
  const fields = [...document.querySelectorAll<Field>('input, textarea, select')].filter(visible);
  return fields.find((f) =>
    [(f as HTMLInputElement).placeholder, f.name, f.id, f.getAttribute('aria-label'), f.labels?.[0]?.innerText]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q))
  );
}

// React-safe way to set an input's value
export function setValue(el: Field, value: string) {
  const proto =
    el.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype
      : el.tagName === 'SELECT'
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// Things that should never happen by accident from a misheard word.
const RISKY = /\b(delete|remove|trash|clear all|pay|place order|confirm order|withdraw|reject|cancel order|refund|sign out|log out|logout)\b/i;

export function clickLabel(a: Assistant, label: string, exactOnly = false): string | null {
  const el = findClickable(label, exactOnly);
  if (!el) return null;
  const name = labelOf(el) || label;
  const go = () => {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.click();
    return `Clicking ${name.slice(0, 40)}.`;
  };
  if (RISKY.test(name)) return a.askConfirm(`That will ${name.slice(0, 40)}.`, go);
  return go();
}

export function registerBuiltins(a: Assistant) {
  a.register(['hello', 'hi', 'hey'], () => 'Hello! How can I help?');
  a.register(['what time is it', "what's the time"], () =>
    `It's ${new Date().toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' })}.`
  );
  a.register(['stop', 'be quiet', 'shut up', 'quiet'], () => {
    a.shutUp();
  });

  a.register(['click {label}', 'press {label}', 'tap {label}', 'select {label}', 'choose {label}'], ({ groups }) => {
    const label = groups.label.replace(/ button$/, '').replace(/^the /, '');
    return clickLabel(a, label) ?? `I can't see a button called ${label}.`;
  });

  a.register(['type {text} into {field}', 'type {text} in {field}', 'enter {text} in {field}', 'enter {text} into {field}', 'write {text} in {field}'], ({ groups }) => {
    const el = findField(groups.field);
    if (!el) return `I can't find a field called ${groups.field}.`;
    el.focus();
    setValue(el, groups.text);
    return 'Done.';
  });

  a.register(['clear {field}'], ({ groups }) => {
    const el = findField(groups.field);
    if (!el) return `I can't find ${groups.field}.`;
    setValue(el, '');
    return 'Cleared.';
  });

  a.register(['scroll down'], () => void window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' }));
  a.register(['scroll up'], () => void window.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' }));
  a.register(['scroll to top', 'go to the top', 'scroll to the top'], () => void window.scrollTo({ top: 0, behavior: 'smooth' }));
  a.register(['scroll to bottom', 'go to the bottom', 'scroll to the bottom'], () =>
    void window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  );

  a.register(['go back', 'back'], () => void window.history.back());
  a.register(['go forward', 'forward'], () => void window.history.forward());
  a.register(['reload', 'refresh', 'reload the page', 'refresh the page'], () => void window.location.reload());

  a.register(['what buttons are there', 'list buttons', 'what can you see'], () => {
    const names = [...new Set([...document.querySelectorAll(CLICKABLE)].filter(visible).map(labelOf))]
      .filter((n) => n && n.length < 40)
      .slice(0, 10);
    return names.length ? `I can see: ${names.join(', ')}.` : "I can't see any buttons.";
  });

  a.register(['read the page', 'read the headings', 'read this page'], () => {
    const hs = [...document.querySelectorAll<HTMLElement>('h1, h2, h3')]
      .filter(visible)
      .map((h) => h.innerText.trim())
      .filter(Boolean)
      .slice(0, 8);
    return hs.length ? hs.join('. ') : 'There are no headings on this page.';
  });
}
