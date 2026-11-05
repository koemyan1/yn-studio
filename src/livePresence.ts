/* Tells the server "this visitor is still here" so the admin Live visitors page can count people in real time.
   Sends only: a random per-tab id (sessionStorage, never a cookie), the page path (no query / hash) and nothing else.
   No GPS and no permission prompt: the location is the approximate one the server works out from the IP address.
   Skipped for: admin pages, the theme-editor preview frame, and visitors who send Do-Not-Track / Global Privacy Control. */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { isPreviewFrame } from './themeLive';

const API_BASE: string = (((import.meta as any).env?.VITE_API_BASE_URL as string | undefined) || '').replace(/\/$/, '');
const KEY = 'yn-sid';
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
let memId = '';

function sid(): string {
  try {
    const v = sessionStorage.getItem(KEY);
    if (v && ID_RE.test(v)) return v;
  } catch { /* storage blocked: fall back to a per-load id */ }
  if (memId) return memId;
  const raw = (globalThis.crypto as any)?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36);
  memId = String(raw).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40).padEnd(10, 'x');
  try { sessionStorage.setItem(KEY, memId); } catch { /* ignore */ }
  return memId;
}

const optedOut = () => {
  const n: any = navigator;
  return n.doNotTrack === '1' || n.globalPrivacyControl === true;
};
const isAdminPath = (p: string) => p === '/admin' || p.startsWith('/admin/');

let lastAt = 0, lastPath = '', wasCounted = false;

function post(body: any) {
  try {
    fetch(API_BASE + '/api/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
  } catch { /* never bother the visitor */ }
}

function beat(path: string) {
  if (isPreviewFrame() || optedOut()) return;
  if (isAdminPath(path)) { if (wasCounted) { wasCounted = false; post({ sid: sid(), bye: true }); } return; }
  const now = Date.now();
  if (path === lastPath && now - lastAt < 3000) return;   // never more than one beat per few seconds for the same page
  lastAt = now; lastPath = path; wasCounted = true;
  post({ sid: sid(), path });
}

export function usePresence() {
  const { pathname } = useLocation();

  // page changes: report the new page straight away
  useEffect(() => { beat(pathname); }, [pathname]);

  // while the tab is visible: a heartbeat every 20 s; when it comes back to the front: one at once; when it closes: say bye
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') beat(location.pathname); };
    const id = window.setInterval(tick, 20000);
    const onVis = () => tick();
    const onHide = () => { if (wasCounted && !isPreviewFrame()) { wasCounted = false; post({ sid: sid(), bye: true }); } };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', onHide); };
  }, []);
}
