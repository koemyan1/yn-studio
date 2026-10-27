/* YN Studio – Grab-style map checkout + live driver tracking.
 *  - MapDeliveryPanel : customer drags the map under a fixed pin (like Grab Food / Express), searches, or uses GPS.
 *  - LiveTrackMap     : customer sees the driver (the admin's phone) move on the map with route + ETA.
 * Free services used: OpenStreetMap/CARTO tiles, Nominatim (search), OSRM demo server (route). */
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, Search, MapPin, Pencil, CheckCircle2 } from 'lucide-react';
import { supabase } from './supabase';
import { tr } from './lang';

import type { Pt } from './deliveryFee';
export type { Pt } from './deliveryFee';
export type Pin = Pt & { label: string };

const TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const ATTR = '© OpenStreetMap · © CARTO';
const DEFAULT_CENTER: Pt = { lat: 11.5564, lng: 104.9282 }; // Phnom Penh

export { distanceKm, calcFee } from './deliveryFee';
import { distanceKm } from './deliveryFee';

const shortLabel = (name: string) => name.split(',').slice(0, 3).join(',').trim();
async function reverseGeocode(p: Pt): Promise<string> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${p.lat}&lon=${p.lng}`, { headers: { Accept: 'application/json' } });
    const j = await r.json();
    if (j?.display_name) return shortLabel(j.display_name);
  } catch { /* offline or rate-limited */ }
  return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
}
async function searchPlaces(q: string): Promise<{ name: string; lat: number; lng: number }[]> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=0&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
    const j = await r.json();
    return (Array.isArray(j) ? j : []).map((x: any) => ({ name: shortLabel(x.display_name || ''), lat: Number(x.lat), lng: Number(x.lon) }));
  } catch { return []; }
}

const storeIcon = L.divIcon({ className: 'yn-map-pin-wrap', html: '<div class="ynStoreDot">🏪</div>', iconSize: [34, 34], iconAnchor: [17, 17] });

/* ───────────────────────── Checkout: pick the delivery spot ───────────────────────── */

type PanelProps = {
  store: Pt | null;
  cfg: any;
  initial: Pt | null;
  form: { name: string; phone: string; city: string; notes: string };
  setForm: (f: { name: string; phone: string; city: string; notes: string }) => void;
  makeDefault: boolean;
  setMakeDefault: (v: boolean) => void;
  pin: Pin | null;
  onConfirm: (pin: Pin, delivery: any) => void;
  onEdit: () => void;
  setMsg: (m: string) => void;
  /** Applies the per-category delivery rules (free / fixed amount) to the distance-based fee. */
  adjustFee?: (distanceFee: number) => number;
};

export function MapDeliveryPanel({ store, cfg, initial, form, setForm, makeDefault, setMakeDefault, pin, onConfirm, onEdit, setMsg, adjustFee }: PanelProps) {
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const timer = useRef<number>(0);
  const [center, setCenter] = useState<Pt>(initial || store || DEFAULT_CENTER);
  const [label, setLabel] = useState('');
  const [moving, setMoving] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ name: string; lat: number; lng: number }[]>([]);
  const [searching, setSearching] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  // Build the map only while the picker is showing (not after the spot is confirmed).
  useEffect(() => {
    if (pin || !el.current) return;
    const start = initial || store || DEFAULT_CENTER;
    const m = L.map(el.current, { zoomControl: false }).setView([start.lat, start.lng], initial ? 17 : 15);
    L.tileLayer(TILES, { attribution: ATTR, subdomains: 'abcd', maxZoom: 20 }).addTo(m);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    if (store) L.marker([store.lat, store.lng], { icon: storeIcon, interactive: false }).addTo(m);
    m.on('movestart', () => setMoving(true));
    m.on('moveend', () => {
      setMoving(false);
      const c = m.getCenter();
      setCenter({ lat: c.lat, lng: c.lng });
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(async () => setLabel(await reverseGeocode({ lat: c.lat, lng: c.lng })), 450);
    });
    map.current = m;
    const t = window.setTimeout(() => m.invalidateSize(), 120);
    return () => { window.clearTimeout(t); window.clearTimeout(timer.current); m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!pin]);

  async function runSearch() {
    if (!q.trim()) return;
    setSearching(true); setResults(await searchPlaces(q.trim())); setSearching(false);
  }
  function goTo(p: Pt, zoom = 17) { map.current?.setView([p.lat, p.lng], zoom, { animate: true }); }
  function useMyLocation() {
    if (!('geolocation' in navigator)) { setMsg(tr('This device cannot share its location.', 'ឧបករណ៍នេះមិនអាចចែករំលែកទីតាំងបានទេ។')); return; }
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      pos => { setLocBusy(false); goTo({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 18); },
      () => { setLocBusy(false); setMsg(tr('Location permission was denied. Search for your address or move the map instead.', 'មិនបានអនុញ្ញាតទីតាំង។ សូមស្វែងរកអាសយដ្ឋាន ឬរំកិលផែនទី។')); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  const quote = store ? calcFee(cfg, store, center) : null;
  const feeOf = (f: number) => (adjustFee ? adjustFee(f) : f);

  async function confirm() {
    if (!form.phone.trim()) { setMsg(tr('Please enter your phone number so the driver can call you.', 'សូមបញ្ចូលលេខទូរស័ព្ទ ដើម្បីឱ្យអ្នកដឹកទាក់ទងអ្នក។')); return; }
    setBusy(true); setMsg('');
    const address = (label || `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`);
    const notes = [form.notes.trim(), note.trim()].filter(Boolean).join(' · ');
    const delivery = { name: form.name.trim(), phone: form.phone.trim(), delivery_address: address, delivery_notes: notes, delivery_lat: center.lat, delivery_lng: center.lng };
    const { data } = await supabase.auth.getUser();
    if (data.user && makeDefault) {
      const r = await supabase.from('profiles').update({ ...delivery, delivery_is_default: true }).eq('user_id', data.user.id);
      if (r.error) { setMsg(r.error.message); setBusy(false); return; }
    }
    setBusy(false);
    onConfirm({ lat: center.lat, lng: center.lng, label: address }, delivery);
  }

  if (pin) {
    return (
      <div className="panel checkoutDelivery ynMapConfirmed">
        <div className="line">
          <div><span className="eyebrow">{tr('DELIVER TO', 'ដឹកជញ្ជូនទៅ')}</span><h2>{pin.label}</h2><p className="muted">{form.name || tr('Customer', 'អតិថិជន')} · {form.phone}</p></div>
          <MapPin />
        </div>
        {store && <p className="ynMapMeta">{calcFee(cfg, store, pin).km.toFixed(1)} km · ${feeOf(calcFee(cfg, store, pin).fee).toFixed(2)} {tr('delivery', 'ដឹកជញ្ជូន')}</p>}
        <p className="muted ynMapNote">{tr('After you order, you can watch the driver arrive live on the map in Orders.', 'បន្ទាប់ពីបញ្ជាទិញ អ្នកអាចតាមដានអ្នកដឹកផ្ទាល់នៅលើផែនទីក្នុងការបញ្ជាទិញ។')}</p>
        <button type="button" className="secondary" onClick={onEdit}><Pencil />{tr('Change location', 'ផ្លាស់ប្តូរទីតាំង')}</button>
      </div>
    );
  }

  return (
    <div className="panel checkoutDelivery ynMapPanel">
      <div className="line">
        <div><span className="eyebrow">{tr('DELIVERY LOCATION', 'ទីតាំងដឹកជញ្ជូន')}</span><h2>{tr('Where should the driver go?', 'តើអ្នកដឹកត្រូវទៅទីណា?')}</h2></div>
        <MapPin />
      </div>
      <div className="locationPicker">
        <div className="locationSearch">
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } }} placeholder={tr('Search address or place', 'ស្វែងរកអាសយដ្ឋាន ឬទីកន្លែង')} />
          <button type="button" className="secondary" onClick={runSearch} disabled={searching} aria-label="Search"><Search /></button>
          <button type="button" className="secondary" onClick={useMyLocation} disabled={locBusy} aria-label={tr('Use my current location', 'ប្រើទីតាំងបច្ចុប្បន្នរបស់ខ្ញុំ')} title={tr('Use my current location', 'ប្រើទីតាំងបច្ចុប្បន្នរបស់ខ្ញុំ')}><LocateFixed /></button>
        </div>
        {results.length > 0 && (
          <div className="ynSearchResults">
            {results.map((r, i) => <button type="button" key={i} onClick={() => { goTo(r); setResults([]); setQ(r.name); }}>{r.name}</button>)}
          </div>
        )}
        <div className="ynPickWrap">
          <div ref={el} className="locationMap" />
          <div className={'ynPickPin' + (moving ? ' moving' : '')}><span>📍</span><i /></div>
        </div>
        <p className="mapHint">{tr('Move the map so the pin sits on your door.', 'រំកិលផែនទីដើម្បីឱ្យម្ជុលនៅត្រង់ទីតាំងរបស់អ្នក។')}</p>
      </div>
      <div className="ynPickInfo">
        <b>{moving ? tr('Moving…', 'កំពុងរំកិល…') : (label || tr('Finding address…', 'កំពុងរកអាសយដ្ឋាន…'))}</b>
        {quote && <small>{quote.km.toFixed(1)} km · ${feeOf(quote.fee).toFixed(2)} {tr('delivery', 'ដឹកជញ្ជូន')}</small>}
      </div>
      <div className="manualDeliveryForm">
        <label>{tr('Full name', 'ឈ្មោះពេញ')}<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={tr('Your name', 'ឈ្មោះរបស់អ្នក')} /></label>
        <label>{tr('Phone number', 'លេខទូរស័ព្ទ')}<input type="tel" inputMode="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+855 …" /></label>
        <label>{tr('Note for the driver', 'កំណត់ចំណាំសម្រាប់អ្នកដឹក')} <span className="muted">({tr('optional', 'ស្រេចចិត្ត')})</span><textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder={tr('Gate colour, floor, landmark…', 'ពណ៌ទ្វារ ជាន់ ឬកន្លែងសម្គាល់…')} /></label>
        <label className="defaultDeliveryChoice"><input type="checkbox" checked={makeDefault} onChange={e => setMakeDefault(e.target.checked)} /> {tr('Save this as my default delivery location', 'រក្សាទុកជាទីតាំងដឹកជញ្ជូនលំនាំដើម')}</label>
        <button type="button" className="primary full" onClick={confirm} disabled={busy || moving}><CheckCircle2 />{busy ? tr('Saving…', 'កំពុងរក្សាទុក…') : tr('Confirm delivery location', 'បញ្ជាក់ទីតាំងដឹកជញ្ជូន')}</button>
      </div>
    </div>
  );
}

/* ───────────────────────── Orders: watch the driver live ───────────────────────── */

function glide(m: L.Marker, to: Pt, ms = 1400) {
  const from = m.getLatLng(), t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    m.setLatLng([from.lat + (to.lat - from.lat) * k, from.lng + (to.lng - from.lng) * k]);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const DONE = ['completed', 'delivered', 'cancelled', 'rejected'];

export function LiveTrackMap({ order }: { order: any }) {
  const el = useRef<HTMLDivElement | null>(null);
  const M = useRef<{ map?: L.Map; dest?: L.Marker; store?: L.Marker; rider?: L.Marker; line?: L.Polyline; fitted?: string }>({});
  const lastRoute = useRef({ t: 0, lat: 0, lng: 0 });
  const [live, setLive] = useState<any>(order);
  const [cfg, setCfg] = useState<any>(null);
  const [route, setRoute] = useState<{ pts: [number, number][]; min: number } | null>(null);

  const dest: Pt = { lat: Number(order.delivery_lat), lng: Number(order.delivery_lng) };
  const valid = Number.isFinite(dest.lat) && Number.isFinite(dest.lng);
  const status = String(live?.status ?? order.status ?? '');
  const done = DONE.includes(status);
  const hasRider = !!live?.tracking_active && live?.rider_lat != null && live?.rider_lng != null && !done;
  const rider: Pt | null = hasRider ? { lat: Number(live.rider_lat), lng: Number(live.rider_lng) } : null;
  const storePt: Pt | null = cfg?.store_lat != null && cfg?.store_lng != null ? { lat: Number(cfg.store_lat), lng: Number(cfg.store_lng) } : null;
  const origin: Pt | null = rider || storePt; // driver while live, otherwise the store from Admin → Settings

  // settings (store pin + rider picture)
  useEffect(() => { supabase.from('delivery_settings').select('store_lat,store_lng,rider_avatar_url').eq('id', 1).maybeSingle().then(({ data }: any) => setCfg(data || {})); }, []);

  // live updates: realtime push + a 6 s poll as a safety net
  useEffect(() => {
    if (!order?.id) return;
    const pull = async () => {
      const { data } = await supabase.from('orders').select('status,tracking_active,rider_lat,rider_lng,tracking_updated_at').eq('id', order.id).maybeSingle();
      if (data) setLive((x: any) => ({ ...x, ...data }));
    };
    pull();
    const poll = window.setInterval(pull, 6000);
    const ch = supabase.channel('track-' + order.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${order.id}` }, (p: any) => setLive((x: any) => ({ ...x, ...p.new })))
      .subscribe();
    return () => { window.clearInterval(poll); supabase.removeChannel(ch); };
  }, [order?.id]);

  // create the map once
  useEffect(() => {
    if (!el.current || !valid) return;
    const m = L.map(el.current, { zoomControl: false }).setView([dest.lat, dest.lng], 15);
    L.tileLayer(TILES, { attribution: ATTR, subdomains: 'abcd', maxZoom: 20 }).addTo(m);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    M.current.dest = L.marker([dest.lat, dest.lng], { icon: L.divIcon({ className: 'yn-map-pin-wrap', html: '<div class="yn-map-pin"><span>🏠</span></div>', iconSize: [46, 46], iconAnchor: [23, 40] }) }).addTo(m);
    M.current.map = m;
    const t = window.setTimeout(() => m.invalidateSize(), 120);
    return () => { window.clearTimeout(t); m.remove(); M.current = {}; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid, dest.lat, dest.lng]);

  // store pin
  useEffect(() => {
    const m = M.current.map;
    if (!m || !cfg || cfg.store_lat == null) return;
    M.current.store?.remove();
    M.current.store = L.marker([Number(cfg.store_lat), Number(cfg.store_lng)], { icon: storeIcon, interactive: false }).addTo(m);
    if (!rider && M.current.fitted !== 'store') { m.fitBounds([[dest.lat, dest.lng], [Number(cfg.store_lat), Number(cfg.store_lng)]], { padding: [45, 45], maxZoom: 16 }); M.current.fitted = 'store'; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, valid]);

  // driver marker (glides smoothly between GPS updates)
  useEffect(() => {
    const m = M.current.map;
    if (!m) return;
    if (!rider) { M.current.rider?.remove(); M.current.rider = undefined; M.current.fitted = undefined; if (storePt) { m.fitBounds([[dest.lat, dest.lng], [storePt.lat, storePt.lng]], { padding: [45, 45], maxZoom: 16 }); M.current.fitted = 'store'; } return; }
    if (!M.current.rider) {
      const av = cfg?.rider_avatar_url;
      const icon = av
        ? L.divIcon({ className: 'yn-rider-avatar-wrap', html: `<img class="yn-rider-avatar" src="${String(av).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" alt="Driver"/>`, iconSize: [42, 42], iconAnchor: [21, 21] })
        : L.divIcon({ className: 'yn-rider-avatar-wrap', html: '<div class="yn-rider-emoji">🏍️</div>', iconSize: [42, 42], iconAnchor: [21, 21] });
      M.current.rider = L.marker([rider.lat, rider.lng], { icon, zIndexOffset: 1000 }).addTo(m);
    } else glide(M.current.rider, rider);
    if (M.current.fitted !== 'rider') { m.fitBounds([[dest.lat, dest.lng], [rider.lat, rider.lng]], { padding: [45, 45], maxZoom: 16 }); M.current.fitted = 'rider'; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rider?.lat, rider?.lng, cfg?.rider_avatar_url, valid]);

  // road route (store → customer, or driver → customer once live) + ETA. OSRM demo server; falls back to a straight line.
  useEffect(() => {
    if (!origin) { setRoute(null); return; }
    const now = Date.now(), moved = distanceKm({ lat: lastRoute.current.lat, lng: lastRoute.current.lng }, origin);
    if (now - lastRoute.current.t < 20000 && moved < 0.15) return;
    lastRoute.current = { t: now, lat: origin.lat, lng: origin.lng };
    let alive = true;
    fetch(`https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`)
      .then(r => r.json())
      .then(j => { const rt = j?.routes?.[0]; if (alive && rt) setRoute({ pts: rt.geometry.coordinates.map((c: number[]) => [c[1], c[0]] as [number, number]), min: Math.max(1, Math.round(rt.duration / 60)) }); })
      .catch(() => { if (alive) setRoute(null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.lat, origin?.lng]);

  useEffect(() => {
    const m = M.current.map;
    if (!m) return;
    M.current.line?.remove(); M.current.line = undefined;
    if (origin && !done) M.current.line = L.polyline(route?.pts?.length ? route.pts : [[origin.lat, origin.lng], [dest.lat, dest.lng]], { color: '#7c3aed', weight: 5, opacity: route ? 0.85 : 0.45, dashArray: route ? undefined : '8 10' }).addTo(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, origin?.lat, origin?.lng, done, valid]);

  if (!valid) return null;
  const km = rider ? distanceKm(rider, dest) : null;
  const eta = rider ? (route?.min ?? Math.max(1, Math.round(((km as number) / 25) * 60))) : null;
  const fromStore = !rider && storePt ? distanceKm(storePt, dest) : null;
  const headline = done
    ? (status === 'cancelled' || status === 'rejected' ? tr('Order cancelled', 'ការបញ្ជាទិញត្រូវបានបោះបង់') : tr('Delivered', 'បានដឹកជញ្ជូនរួច'))
    : rider ? tr('Driver is on the way', 'អ្នកដឹកកំពុងធ្វើដំណើរមកកាន់អ្នក')
    : tr('Waiting for the driver to start sharing location', 'កំពុងរង់ចាំអ្នកដឹកចាប់ផ្តើមចែករំលែកទីតាំង');

  return (
    <section className="ynMapShell ynLiveTrack">
      <div className="ynMapTitle">
        <span className="ynMapLogo">⌖</span>
        <div><b>{headline}</b><small>{rider ? `${eta} ${tr('min', 'នាទី')} · ${(km as number).toFixed(1)} km ${tr('away', 'ទៀត')}` : fromStore != null ? `${fromStore.toFixed(1)} km ${tr('from the store', 'ពីហាង')}` : tr('YN Studio delivery', 'ការដឹកជញ្ជូន YN Studio')}</small></div>
        <span className={'ynMapLive' + (rider ? ' on' : '')}>{rider ? 'LIVE' : done ? 'DONE' : 'WAITING'}</span>
      </div>
      <div ref={el} className="ynDeliveryMap ynTrackMap" />
      <div className="mapLegend">
        <span><i className="mapPinDot" /> {tr('Your location', 'ទីតាំងរបស់អ្នក')}</span>
        <span>🏪 {tr('Store', 'ហាង')}</span>
        {rider && <span>{cfg?.rider_avatar_url ? <img className="legendAvatar" src={cfg.rider_avatar_url} alt="" /> : '🏍️'} {tr('Driver', 'អ្នកដឹក')}</span>}
      </div>
    </section>
  );
}
