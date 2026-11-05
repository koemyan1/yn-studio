// Live visitors: who is on the website right now, and roughly where from.
//
// How it works ($0, no database, no migration):
//   * Every customer page sends a tiny heartbeat (POST /api/presence) every ~20 s while its tab is visible
//     (src/livePresence.ts). A visitor counts as "online" while their last heartbeat is under 45 s old.
//   * The location comes from the same free source the security page uses: Cloudflare visitor-location headers first,
//     the free IP lookup only for what is missing (see security/geo.js). IP location is APPROXIMATE: usually the right
//     city, but mobile carriers / VPNs can show another city. No GPS and no permission prompt is ever used here.
//   * Everything lives in memory: nothing is written to disk or to Supabase, and IP addresses are never sent to the admin
//     page. A server restart (deploy, Render free-tier sleep) simply starts the live view from zero again.
import crypto from 'node:crypto';
import { parseDevice } from './security/device.js';

const ONLINE_MS = 45000;          // heartbeat every ~20 s, so two missed beats = gone
const FORGET_MS = 3 * 60000;      // dropped from memory
const MAX_SESSIONS = 4000;        // hard cap: forged ids can never grow memory without limit
const MAX_PER_IP = 12;            // one household / office / phone network can have several tabs, not thousands
const SAMPLE_MS = 60000, SAMPLES = 60;   // one sample per minute, one hour kept (sparkline)
const SID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** Only the pathname, no query / hash (they can carry tokens or personal data), plain URL characters only. */
export function cleanPath(p) {
  let s = String(p ?? '').split(/[?#]/)[0].slice(0, 120);
  if (!s.startsWith('/') || s.startsWith('//')) return null;
  s = s.replace(/[^A-Za-z0-9/_\-.~%]/g, '');
  return s.length > 1 ? s.replace(/\/+$/, '') : '/';
}
const isAdminPath = p => p === '/admin' || p.startsWith('/admin/');

export function createPresence({ intel = null, now = Date.now } = {}) {
  const sessions = new Map();    // sid -> session
  const byIp = new Map();        // ipKey -> Set(sid)
  const geoByIp = new Map();     // ipKey -> geo | null (so ten tabs from one IP resolve the location once)
  const samples = [];            // [{ t, n }]
  const day = { key: '', ips: new Set(), peak: 0, peakAt: null };
  let timers = [];

  const dayKey = t => new Date(t).toISOString().slice(0, 10);
  function rollDay(t) {
    const k = dayKey(t);
    if (day.key !== k) { day.key = k; day.ips.clear(); day.peak = 0; day.peakAt = null; }
  }
  const isOnline = (s, t) => t - s.last <= ONLINE_MS;

  function drop(sid) {
    const s = sessions.get(sid); if (!s) return;
    sessions.delete(sid);
    const set = byIp.get(s.ipKey);
    if (set) { set.delete(sid); if (!set.size) byIp.delete(s.ipKey); }
  }

  function sweep() {
    const t = now();
    for (const [sid, s] of sessions) if (t - s.last > FORGET_MS) drop(sid);
    if (geoByIp.size > 6000) geoByIp.clear();
  }

  function onlineCount(t = now()) {
    let n = 0;
    for (const s of sessions.values()) if (isOnline(s, t) && !s.bot) n++;
    return n;
  }

  /**
   * Record one heartbeat. `req.sec` is set by the security shield (real client IP, even behind Cloudflare).
   * Returns false when the beat was ignored (bad id, admin page, capacity), true otherwise.
   */
  function beat(req, body = {}) {
    try {
      const t = now(); rollDay(t);
      const sid = String(body.sid ?? '');
      if (!SID_RE.test(sid)) return false;
      if (body.bye === true) { drop(sid); return true; }
      const path = cleanPath(body.path);
      if (!path) return false;
      if (isAdminPath(path)) { drop(sid); return false; }   // the admin's own tabs never count as visitors
      const ip = req.sec?.ip, key = req.sec?.key;
      if (!ip || !key) return false;

      let s = sessions.get(sid);
      if (s && s.ipKey !== key) { drop(sid); s = undefined; }   // same id from another network: treat as a new visitor
      if (!s) {
        if (sessions.size >= MAX_SESSIONS) { sweep(); if (sessions.size >= MAX_SESSIONS) return false; }
        const set = byIp.get(key) || new Set();
        if (set.size >= MAX_PER_IP) {                            // drop this IP's oldest session to make room
          let oldest = null; for (const id of set) { const x = sessions.get(id); if (x && (!oldest || x.last < oldest.last)) oldest = x; }
          if (oldest) drop(oldest.sid);
        }
        const ua = String(req.headers?.['user-agent'] || '').slice(0, 400);
        const device = parseDevice(ua);
        s = { sid, ipKey: key, first: t, last: t, path, pages: 1, device, bot: !!device.bot, geo: geoByIp.get(key) ?? null, geoTried: geoByIp.has(key) };
        sessions.set(sid, s);
        (byIp.get(key) || byIp.set(key, new Set()).get(key)).add(sid);
        if (!s.geoTried && intel) resolveGeo(s, ip, ua);
      } else {
        s.last = t;
        if (s.path !== path) { s.path = path; s.pages++; }
      }
      if (!s.bot) {
        day.ips.add(key); if (day.ips.size > 100000) day.ips.clear();
        const n = onlineCount(t);
        if (n > day.peak) { day.peak = n; day.peakAt = new Date(t).toISOString(); }
      }
      return true;
    } catch { return false; }   // presence must never break a request
  }

  function resolveGeo(s, ip, ua) {
    s.geoTried = true;
    try {
      const info = intel.describe({ ip, ua });
      if (info.geo) { s.geo = info.geo; geoByIp.set(s.ipKey, info.geo); }
      if (info.pending) info.pending.then(g => { if (g) { s.geo = g; geoByIp.set(s.ipKey, g); } else if (!geoByIp.has(s.ipKey)) geoByIp.set(s.ipKey, s.geo || null); }).catch(() => {});
      else if (!geoByIp.has(s.ipKey)) geoByIp.set(s.ipKey, s.geo || null);
    } catch { /* no location: the visitor is still counted */ }
  }

  /** Everything the admin page needs. Never contains an IP address. */
  function snapshot() {
    const t = now(); rollDay(t);
    const live = [...sessions.values()].filter(s => isOnline(s, t) && !s.bot).sort((a, b) => b.last - a.last);
    const countries = new Map(), pages = new Map(), spots = new Map(), devices = { mobile: 0, tablet: 0, desktop: 0, other: 0 };
    let located = 0;
    for (const s of live) {
      const g = s.geo;
      const cc = g?.countryCode || null;
      const ckey = cc || (g?.country ? 'name:' + g.country : '??');
      const c = countries.get(ckey) || { code: cc, name: g?.country || 'Unknown', count: 0 }; c.count++; countries.set(ckey, c);
      pages.set(s.path, (pages.get(s.path) || 0) + 1);
      const dt = s.device?.type; devices[dt === 'mobile' || dt === 'tablet' || dt === 'desktop' ? dt : 'other']++;
      if (g?.lat != null && g?.lng != null) {
        located++;
        const lat = Math.round(g.lat * 100) / 100, lng = Math.round(g.lng * 100) / 100, k = lat + ',' + lng;
        const sp = spots.get(k) || { lat, lng, label: g.label || g.country || 'Unknown', countryCode: cc, count: 0 }; sp.count++; spots.set(k, sp);
      }
    }
    return {
      generatedAt: new Date(t).toISOString(),
      online: live.length,
      uniqueToday: day.ips.size,
      peakToday: { count: day.peak, at: day.peakAt },
      located,
      history: samples.slice(-30).map(x => ({ t: x.t, n: x.n })),
      countries: [...countries.values()].sort((a, b) => b.count - a.count).slice(0, 30),
      pages: [...pages].map(([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count).slice(0, 15),
      devices,
      spots: [...spots.values()].sort((a, b) => b.count - a.count).slice(0, 300),
      visitors: live.slice(0, 200).map(s => ({
        id: crypto.createHash('sha1').update(s.sid).digest('hex').slice(0, 8),
        label: s.geo?.tor ? 'Tor network' : s.geo?.label || null,
        countryCode: s.geo?.countryCode || null,
        lat: s.geo?.lat ?? null, lng: s.geo?.lng ?? null,
        path: s.path, pages: s.pages,
        device: s.device?.summary || null, deviceType: s.device?.type || null,
        since: new Date(s.first).toISOString(), last: new Date(s.last).toISOString(),
      })),
    };
  }

  function start() {
    stop();
    timers = [
      setInterval(() => { sweep(); samples.push({ t: new Date(now()).toISOString(), n: onlineCount() }); if (samples.length > SAMPLES) samples.shift(); }, SAMPLE_MS),
    ];
    timers.forEach(x => x.unref?.());
  }
  function stop() { timers.forEach(clearInterval); timers = []; }

  return { beat, snapshot, sweep, start, stop, _sessions: sessions };
}
