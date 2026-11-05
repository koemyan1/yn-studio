import React, { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Globe, LocateFixed, RefreshCw, Smartphone, TrendingUp, Users } from 'lucide-react';
import { supabase } from './supabase';
import { CountUp } from './adminMotion';
import './admin-live.css';

type Shell = React.ComponentType<{ title: string; children: React.ReactNode }>;
type Spot = { lat: number; lng: number; label: string; countryCode: string | null; count: number };
type Visitor = { id: string; label: string | null; countryCode: string | null; lat: number | null; lng: number | null; path: string; pages: number; device: string | null; deviceType: string | null; since: string; last: string };
type Live = {
  generatedAt: string; online: number; uniqueToday: number; peakToday: { count: number; at: string | null }; located: number;
  history: { t: string; n: number }[]; countries: { code: string | null; name: string; count: number }[]; pages: { path: string; count: number }[];
  devices: { mobile: number; tablet: number; desktop: number; other: number }; spots: Spot[]; visitors: Visitor[];
};

const API_BASE: string = (((import.meta as any).env?.VITE_API_BASE_URL as string | undefined) || '').replace(/\/$/, '');
const POLL_MS = 5000;
const TILES_LIGHT = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const TILES_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const ATTR = '© OpenStreetMap · © CARTO';

async function getLive(): Promise<Live> {
  const { data } = await supabase.auth.getSession();
  const r = await fetch(API_BASE + '/api/admin/live', { headers: { Authorization: 'Bearer ' + (data.session?.access_token || '') } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || 'Request failed (' + r.status + ')');
  return j;
}

const flag = (cc?: string | null) => (cc && /^[A-Za-z]{2}$/.test(cc) ? String.fromCodePoint(...cc.toUpperCase().split('').map(c => 127397 + c.charCodeAt(0))) : '🌐');
const PAGES: Record<string, string> = {
  cart: 'Cart', checkout: 'Checkout', debt: 'Debt', login: 'Login', notifications: 'Notifications', orders: 'Orders', product: 'Product page',
  profile: 'Profile', rewards: 'Rewards', services: 'Services', snacks: 'Snacks', support: 'Support chat', wallet: 'Wallet', wishlist: 'Wishlist',
};
const pageName = (p: string) => (p === '/' ? 'Home' : p === '/services/cv' ? 'CV maker' : PAGES[p.split('/')[1]] || p);
const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
function span(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function AdminLive({ Shell }: { Shell: Shell }) {
  const [d, setD] = useState<Live | null>(null);
  const [err, setErr] = useState('');
  const [fetchedAt, setFetchedAt] = useState(0);
  const [, setTick] = useState(0);
  const [dark, setDark] = useState(false);

  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tile = useRef<L.TileLayer | null>(null);
  const pins = useRef(new Map<string, { m: L.Marker; count: number }>());
  const fitted = useRef(false);

  const load = useCallback(async () => {
    try { const j = await getLive(); setD(j); setErr(''); setFetchedAt(Date.now()); }
    catch (e: any) { setErr(e?.message || 'Could not load.'); }
  }, []);

  // live polling (paused while this tab is hidden) + a 1 s clock so "on site for" keeps counting between polls
  useEffect(() => {
    load();
    const poll = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, POLL_MS);
    const clock = window.setInterval(() => setTick(x => x + 1), 1000);
    const vis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', vis);
    return () => { window.clearInterval(poll); window.clearInterval(clock); document.removeEventListener('visibilitychange', vis); };
  }, [load]);

  // follow the admin light / dark switch so the map matches
  useEffect(() => {
    const el = document.querySelector('.admin');
    if (!el) return;
    const f = () => setDark(el.classList.contains('admin-dark'));
    f();
    const mo = new MutationObserver(f);
    mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);

  // create the map once
  useEffect(() => {
    if (!mapEl.current) return;
    const m = L.map(mapEl.current, { minZoom: 2, worldCopyJump: true, scrollWheelZoom: false }).setView([15, 20], 2);
    map.current = m;
    const pinsMap = pins.current;
    return () => { m.remove(); map.current = null; tile.current = null; pinsMap.clear(); fitted.current = false; };
  }, []);

  // map tiles follow light / dark
  useEffect(() => {
    const m = map.current; if (!m) return;
    tile.current?.remove();
    tile.current = L.tileLayer(dark ? TILES_DARK : TILES_LIGHT, { attribution: ATTR, subdomains: 'abcd', maxZoom: 19 }).addTo(m);
  }, [dark]);

  // pins: add / move / resize only what changed, so the pulse animation does not restart on every poll
  useEffect(() => {
    const m = map.current; if (!m || !d) return;
    const seen = new Set<string>();
    for (const sp of d.spots) {
      const k = sp.lat + ',' + sp.lng; seen.add(k);
      const size = Math.round(Math.min(30 + Math.sqrt(sp.count) * 9, 66));
      const tip = document.createElement('div');
      tip.textContent = `${flag(sp.countryCode)} ${sp.label} · ${sp.count} online`;
      const cur = pins.current.get(k);
      if (cur) {
        cur.m.setTooltipContent(tip);
        if (cur.count !== sp.count) {
          cur.m.setIcon(L.divIcon({ className: 'lvPin', html: `<span class="lvPulse"></span><b>${sp.count}</b>`, iconSize: [size, size] }));
          cur.count = sp.count;
        }
      } else {
        const mk = L.marker([sp.lat, sp.lng], { icon: L.divIcon({ className: 'lvPin', html: `<span class="lvPulse"></span><b>${sp.count}</b>`, iconSize: [size, size] }) })
          .bindTooltip(tip, { direction: 'top', offset: [0, -size / 2] }).addTo(m);
        pins.current.set(k, { m: mk, count: sp.count });
      }
    }
    for (const [k, v] of pins.current) if (!seen.has(k)) { v.m.remove(); pins.current.delete(k); }
    if (!fitted.current && d.spots.length) { fitted.current = true; fitAll(); }
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps

  function fitAll() {
    const m = map.current; if (!m) return;
    const pts = [...pins.current.values()].map(p => p.m.getLatLng());
    if (!pts.length) { m.setView([15, 20], 2); return; }
    if (pts.length === 1) { m.setView(pts[0], 6); return; }
    m.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 6 });
  }

  const online = d?.online ?? 0;
  const gen = d ? Date.parse(d.generatedAt) : 0;
  const age = (iso: string) => (gen ? gen - Date.parse(iso) : 0) + (fetchedAt ? Date.now() - fetchedAt : 0);
  const updated = fetchedAt ? Math.max(0, Math.round((Date.now() - fetchedAt) / 1000)) : null;
  const hist = d?.history || [];
  const maxH = Math.max(1, ...hist.map(h => h.n), online);
  const phonePct = d && d.online ? Math.round(((d.devices.mobile + d.devices.tablet) / d.online) * 100) : 0;
  const maxC = Math.max(1, ...(d?.countries || []).map(c => c.count));
  const maxP = Math.max(1, ...(d?.pages || []).map(c => c.count));
  const missing = d ? d.online - d.located : 0;

  return <Shell title="Live visitors"><div className="lvPage">
    {err && <div className="notice"><b>Could not load.</b> {err}. The live API runs on your Node server (not Supabase), so redeploy the server with this update.</div>}

    <section className="panel lvHero">
      <div className="lvNow">
        <span className={'lvDot' + (online ? ' on' : '')} aria-hidden="true" />
        <div>
          <small>On the website right now</small>
          <strong aria-live="polite"><CountUp n={online} ms={600} /></strong>
        </div>
      </div>
      <div className="lvSpark" aria-label="Visitors in the last 30 minutes">
        <div className="lvBars">{hist.length ? hist.map((h, i) => <i key={i} style={{ height: Math.max(6, (h.n / maxH) * 100) + '%' }} title={`${h.n} online`} />) : <span className="muted">Chart fills in as time passes</span>}</div>
        <small>Last 30 minutes</small>
      </div>
      <div className="lvMeta">
        <span className="lvLive"><i /> LIVE</span>
        <small>{updated === null ? 'Loading…' : updated < 2 ? 'Updated just now' : `Updated ${updated}s ago`}</small>
        <button type="button" className="secondary" onClick={load}><RefreshCw /> Refresh</button>
      </div>
    </section>

    <div className="stats lvStats">
      <div className="stat"><span className="statIcon"><Globe /></span><div><small>Countries now</small><strong><CountUp n={d?.countries.filter(c => c.code).length ?? 0} /></strong></div></div>
      <div className="stat"><span className="statIcon"><Users /></span><div><small>Visitors today</small><strong><CountUp n={d?.uniqueToday ?? 0} /></strong></div></div>
      <div className="stat"><span className="statIcon"><TrendingUp /></span><div><small>Busiest moment today</small><strong><CountUp n={d?.peakToday.count ?? 0} /></strong></div></div>
      <div className="stat"><span className="statIcon"><Smartphone /></span><div><small>On phones</small><strong><CountUp n={phonePct + '%'} /></strong></div></div>
    </div>

    <section className="panel lvMapPanel">
      <div className="lvMapHead"><h2>Where they are</h2><button type="button" className="secondary" onClick={fitAll}><LocateFixed /> Show all</button></div>
      <div className="lvMapWrap">
        <div ref={mapEl} className="lvMap" />
        {d && !d.spots.length && <div className="lvEmpty"><b>{online ? 'Locations are loading…' : 'Nobody is on the website right now'}</b><span>{online ? 'The city appears in a few seconds.' : 'When someone opens your shop, a pin appears here.'}</span></div>}
      </div>
      {d && online > 0 && missing > Math.ceil(online * 0.3) && <p className="muted lvHint">{missing} of {online} visitors have no city yet. In Cloudflare turn on <b>Rules → Settings → Managed Transforms → Add visitor location headers</b> (free) for more accurate cities.</p>}
    </section>

    <div className="lvGrid">
      <section className="panel">
        <h2>Where from</h2>
        {d?.countries.length ? <ul className="lvList">{d.countries.map((c, i) => <li key={(c.code || c.name) + i}>
          <span className="lvFlag">{flag(c.code)}</span><span className="lvName">{c.name}</span>
          <span className="lvBar"><i style={{ width: (c.count / maxC) * 100 + '%' }} /></span><b>{c.count}</b></li>)}</ul> : <p className="muted">No visitors yet.</p>}
      </section>
      <section className="panel">
        <h2>What they are looking at</h2>
        {d?.pages.length ? <ul className="lvList lvPages">{d.pages.map(p => <li key={p.path}>
          <span className="lvName" title={p.path}>{pageName(p.path)}</span>
          <span className="lvBar"><i style={{ width: (p.count / maxP) * 100 + '%' }} /></span><b>{p.count}</b></li>)}</ul> : <p className="muted">No visitors yet.</p>}
      </section>
    </div>

    <section className="panel">
      <h2>Everyone online</h2>
      {d?.visitors.length ? <div className="lvScroll"><table className="lvTable">
        <thead><tr><th>Location</th><th>Page</th><th>Device</th><th>On site</th><th>Last seen</th></tr></thead>
        <tbody>{d.visitors.map(v => <tr key={v.id}>
          <td><span className="lvFlag">{flag(v.countryCode)}</span> {v.label || 'Unknown location'}{v.lat != null && v.lng != null && <> · <a href={mapsUrl(v.lat, v.lng)} target="_blank" rel="noopener noreferrer">Map</a></>}</td>
          <td>{pageName(v.path)}{v.pages > 1 && <small className="muted"> · {v.pages} pages</small>}</td>
          <td>{v.device || '—'}</td>
          <td>{span(age(v.since))}</td>
          <td>{age(v.last) < 4000 ? 'now' : span(age(v.last)) + ' ago'}</td>
        </tr>)}</tbody></table></div> : <p className="muted">Nobody is on the website right now.</p>}
      <p className="muted lvFoot">Locations come from each visitor&apos;s internet address, so they are approximate (usually the right city, but phone networks and VPNs can show another one). Counts are live and kept in memory only: a server restart starts them from zero.</p>
    </section>
  </div></Shell>;
}
