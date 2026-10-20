import React, { useEffect, useRef } from 'react';

// Cloudflare Turnstile (free CAPTCHA alternative). Completely inactive until VITE_TURNSTILE_SITE_KEY is set, so the
// login page looks and behaves exactly as before until you turn it on. Mode "interaction-only": visitors normally see nothing.
const SITE_KEY = (((import.meta as any).env?.VITE_TURNSTILE_SITE_KEY as string | undefined) || '').trim();
export const turnstileEnabled = !!SITE_KEY;

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    if ((window as any).turnstile) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => { scriptPromise = null; reject(new Error('turnstile script blocked')); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function Turnstile({ onToken, resetKey }: { onToken: (token: string) => void; resetKey: number }) {
  const box = useRef<HTMLDivElement | null>(null);
  const widget = useRef<any>(null);
  useEffect(() => {
    if (!turnstileEnabled) return;
    let dead = false;
    loadScript().then(() => {
      const ts = (window as any).turnstile;
      if (dead || !box.current || !ts) return;
      widget.current = ts.render(box.current, {
        sitekey: SITE_KEY, appearance: 'interaction-only',
        callback: (t: string) => onToken(t), 'expired-callback': () => onToken(''), 'error-callback': () => onToken(''),
      });
    }).catch(() => onToken(''));
    return () => { dead = true; try { if (widget.current != null) (window as any).turnstile?.remove(widget.current); } catch { /* ignore */ } widget.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (resetKey && widget.current != null) { try { (window as any).turnstile?.reset(widget.current); } catch { /* ignore */ } onToken(''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);
  if (!turnstileEnabled) return null;
  return <div ref={box} className="ynTurnstile" style={{ display: 'flex', justifyContent: 'center' }} />;
}
