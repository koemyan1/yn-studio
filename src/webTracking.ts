/* Browser fallback for the delivery phone when the native YN Studio app is not installed.
 * Browsers pause GPS when the screen locks, so this keeps the screen awake while tracking.
 * True background tracking (screen off / app minimised) needs the Capacitor mobile app. */
let watchId: number | null = null;
let lock: any = null;
let onVisible: (() => void) | null = null;
let lastSent = 0;

async function keepAwake() { try { lock = await (navigator as any).wakeLock?.request('screen'); } catch { /* not supported */ } }

export async function startWebTracking(onLocation?: (lat: number, lng: number) => void) {
  if (!('geolocation' in navigator)) throw new Error('This browser cannot read GPS.');
  stopWebTracking();
  await new Promise<void>((res, rej) => navigator.geolocation.getCurrentPosition(() => res(), e => rej(new Error(e.message || 'Location permission was denied.')), { enableHighAccuracy: true, timeout: 20000 }));
  await keepAwake();
  onVisible = () => { if (document.visibilityState === 'visible') keepAwake(); };
  document.addEventListener('visibilitychange', onVisible);
  watchId = navigator.geolocation.watchPosition(
    pos => { const now = Date.now(); if (now - lastSent < 4000) return; lastSent = now; onLocation?.(pos.coords.latitude, pos.coords.longitude); },
    err => console.warn('GPS', err.message),
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
  );
}

export function stopWebTracking() {
  if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  try { lock?.release?.(); } catch { /* ignore */ }
  lock = null;
  if (onVisible) { document.removeEventListener('visibilitychange', onVisible); onVisible = null; }
  lastSent = 0;
}
