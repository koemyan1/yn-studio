import { supabase } from './supabase';

/* Phone push (web push). Works on Android (Chrome etc.) and on iPhone/iPad once the site is added to the Home Screen.
   Needs VITE_VAPID_PUBLIC_KEY at build time. See PUSH-SETUP.md. */

export type PushState =
  | 'unsupported'   // this browser cannot do push
  | 'ios-install'   // iPhone/iPad: must be added to the Home Screen first
  | 'no-key'        // VITE_VAPID_PUBLIC_KEY missing in this build
  | 'blocked'       // the person tapped Block
  | 'off'           // can be turned on
  | 'on';           // subscribed on this device

const VAPID = String((import.meta as any).env?.VITE_VAPID_PUBLIC_KEY || '').trim();

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);
const isStandalone = () => (navigator as any).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;

function keyBytes(b64: string): BufferSource {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out as unknown as BufferSource;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

export async function getPushState(): Promise<PushState> {
  if (isIos() && !isStandalone()) return 'ios-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (!VAPID) return 'no-key';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission === 'granted') {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) return 'on';
    } catch { /* fall through */ }
  }
  return 'off';
}

/** Must be called from a tap (iOS requires a user gesture to ask for permission). */
export async function enablePush(): Promise<PushState> {
  const state = await getPushState();
  if (state !== 'off') return state;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'blocked' : 'off';

  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) });

  const j = sub.toJSON();
  const p256dh = j.keys?.p256dh, auth = j.keys?.auth;
  if (!p256dh || !auth) throw new Error('This phone did not return push keys.');
  const r = await supabase.rpc('register_push_subscription', { p_endpoint: sub.endpoint, p_p256dh: p256dh, p_auth: auth, p_ua: navigator.userAgent.slice(0, 250) });
  if (r.error) { await sub.unsubscribe().catch(() => {}); throw new Error(r.error.message + ' (did you run supabase-push.sql?)'); }

  // Local confirmation so the person sees right away that it works.
  reg.showNotification('YN Studio', { body: 'Notifications are on.', icon: '/icon-192.png', badge: '/favicon-32.png', tag: 'yn-welcome' }).catch(() => {});
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await supabase.rpc('unregister_push_subscription', { p_endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
  } catch { /* ignore */ }
  return getPushState();
}
