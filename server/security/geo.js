// Approximate location of an IP address for security events: country, region, city, latitude, longitude + a
// clickable Google Maps link.
//
// Source 1 (primary, instant, $0): Cloudflare visitor-location headers. Cloudflare Free always sends `CF-IPCountry`.
//   City / region / latitude / longitude come from the free "Add visitor location headers" Managed Transform
//   (Cloudflare dashboard -> Rules -> Settings -> Managed Transforms). These headers are only believed when the request
//   really came through Cloudflare (see ip.js `viaCloudflare`); a direct hit on the Render address could forge them.
// Source 2 (fallback, free, optional): a public IP-geolocation web service, used only for what Cloudflare did not
//   supply. Cached 24 h, hard-capped per minute, 2.5 s timeout, never in the request path (see store.js). Turn it off
//   with GEO_LOOKUP=off, or point GEO_LOOKUP_URL at another provider ({ip} is replaced).
//
// IP geolocation is APPROXIMATE: usually the right city, but mobile carriers, VPNs, proxies and Tor can place a visitor
// in another city or country. The coordinates are the centre of the guessed area, never a street address.
import net from 'node:net';
import { isTrustedInfra } from './ip.js';

export const mapsUrl = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

let regionNames = null;
try { regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { /* old ICU: country code only */ }
const countryName = code => { try { return (code && regionNames?.of(code)) || null; } catch { return null; } };

const clean = (v, max = 80) => {
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f<>"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return s || null;
};
/** Header values can arrive percent-encoded or as raw UTF-8 read as latin1 (Node does that). Undo both. */
function fixText(v) {
  if (v === undefined || v === null) return null;
  let s = String(v);
  if (/[\u0080-\u00ff]/.test(s)) { const u = Buffer.from(s, 'latin1').toString('utf8'); if (!u.includes('\ufffd')) s = u; }
  if (s.includes('%')) { try { s = decodeURIComponent(s); } catch { /* keep */ } }
  return clean(s);
}
const coord = (v, lim) => { if (v === undefined || v === null || v === '') return null; const n = Number(v); return Number.isFinite(n) && Math.abs(n) <= lim ? Math.round(n * 1e5) / 1e5 : null; };

export function finishGeo(g) {
  if (!g) return null;
  const out = { country: g.country || null, countryCode: g.countryCode || null, region: g.region || null, regionCode: g.regionCode || null, city: g.city || null, lat: g.lat ?? null, lng: g.lng ?? null, timezone: g.timezone || null, source: g.source, approximate: true };
  if (g.tor) out.tor = true;
  out.mapsUrl = out.lat !== null && out.lng !== null ? mapsUrl(out.lat, out.lng) : null;
  out.label = [out.city, out.region, out.country || out.countryCode].filter((x, i, a) => x && a.indexOf(x) === i).join(', ') || null;
  return out.label || out.mapsUrl || out.tor ? out : null;
}

/** From Cloudflare headers (lower-cased bag). Call only for requests that really passed through Cloudflare. */
export function geoFromCloudflare(h = {}) {
  const cc = clean(h['cf-ipcountry'], 2)?.toUpperCase() || null;
  const tor = cc === 'T1';
  const code = cc && /^[A-Z]{2}$/.test(cc) && cc !== 'XX' && !tor ? cc : null;
  const g = {
    countryCode: code, country: tor ? 'Tor network' : countryName(code),
    region: fixText(h['cf-region']), regionCode: clean(h['cf-region-code'], 10), city: fixText(h['cf-ipcity']),
    lat: coord(h['cf-iplatitude'], 90), lng: coord(h['cf-iplongitude'], 180), timezone: clean(h['cf-timezone'], 40),
    tor, source: 'cloudflare',
  };
  if (g.lat === null || g.lng === null) g.lat = g.lng = null;
  return finishGeo(g);
}

/** Fill in what `base` (Cloudflare) lacks using `extra` (lookup). Cloudflare's own values always win. */
export function mergeGeo(base, extra) {
  if (!extra) return base;
  if (!base) return extra;
  const lat = base.lat ?? extra.lat, lng = base.lng ?? extra.lng;
  const usedExtra = (base.city == null && extra.city != null) || (base.lat == null && extra.lat != null);
  return finishGeo({
    country: base.country || extra.country, countryCode: base.countryCode || extra.countryCode,
    region: base.region || extra.region, regionCode: base.regionCode || extra.regionCode, city: base.city || extra.city,
    lat: lat !== null && lng !== null ? lat : null, lng: lat !== null && lng !== null ? lng : null,
    timezone: base.timezone || extra.timezone, tor: base.tor, source: usedExtra ? 'cloudflare+lookup' : base.source,
  });
}
export const geoIsComplete = g => !!g && g.lat !== null && g.lng !== null && !!g.city;

/** Parse the JSON of common free providers (ipwho.is, ipapi.co, ip-api.com, ipinfo-style). */
export function parseLookup(j) {
  if (!j || typeof j !== 'object') return null;
  if (j.success === false || j.status === 'fail' || j.error === true) return null;
  let lat = j.latitude ?? j.lat, lng = j.longitude ?? j.lon ?? j.lng;
  if ((lat === undefined || lng === undefined) && typeof j.loc === 'string') [lat, lng] = j.loc.split(',');
  const la = coord(lat, 90), ln = coord(lng, 180);
  const code = clean(j.country_code ?? j.countryCode ?? j.country_code2 ?? (String(j.country || '').length === 2 ? j.country : null), 2)?.toUpperCase() || null;
  const name = clean(j.country_name ?? (String(j.country || '').length > 2 ? j.country : null)) || countryName(code);
  return finishGeo({
    country: name, countryCode: code, region: clean(j.regionName ?? j.region_name ?? j.region), regionCode: clean(j.region_code ?? (j.regionName ? j.region : null), 10),
    city: clean(j.city), lat: la !== null && ln !== null ? la : null, lng: la !== null && ln !== null ? ln : null,
    timezone: clean(typeof j.timezone === 'object' ? j.timezone?.id : j.timezone, 40), source: 'lookup',
  });
}

/**
 * Free fallback lookup with cache, in-flight de-duplication and a hard per-minute cap (an attacker rotating IPs must
 * not be able to use us to hammer the provider, or run up latency). Resolves to a geo object or null; never throws.
 */
export function createGeoLookup({ url = 'https://ipwho.is/{ip}', fetchFn = globalThis.fetch, now = Date.now, timeoutMs = 2500, perMinute = 30, ttlMs = 24 * 3600000, negativeMs = 10 * 60000, max = 5000, log = console } = {}) {
  if (!fetchFn || !url || /^off$/i.test(url)) return null;
  const cache = new Map();      // ip -> { t, geo }
  const inflight = new Map();   // ip -> Promise
  let windowStart = now(), used = 0, warned = false;

  async function run(ip) {
    const t = now();
    if (t - windowStart >= 60000) { windowStart = t; used = 0; }
    if (used >= perMinute) return null;
    used++;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetchFn(url.replace('{ip}', encodeURIComponent(ip)), { signal: ctl.signal, headers: { Accept: 'application/json', 'User-Agent': 'yn-studio-security/1.0' } });
      if (!r.ok) return null;
      return parseLookup(await r.json());
    } catch (e) {
      if (!warned) { warned = true; log.warn('[security] geo lookup unavailable (location falls back to Cloudflare headers only):', String(e?.message || e).slice(0, 100)); }
      return null;
    } finally { clearTimeout(timer); }
  }

  return function lookup(ip) {
    if (!ip || !net.isIP(ip) || isTrustedInfra(ip)) return Promise.resolve(null);
    const hit = cache.get(ip);
    if (hit && now() - hit.t < (hit.geo ? ttlMs : negativeMs)) return Promise.resolve(hit.geo);
    let p = inflight.get(ip);
    if (!p) {
      p = run(ip).then(geo => {
        if (cache.size >= max) cache.clear();
        cache.set(ip, { t: now(), geo });
        return geo;
      }).finally(() => inflight.delete(ip));
      inflight.set(ip, p);
    }
    return p;
  };
}
