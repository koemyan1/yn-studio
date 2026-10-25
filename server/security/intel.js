// "Who is this?" for security events: approximate location + device, attached to every detection / block record.
//
// Cost model: on each request from a non-allow-listed IP the shield only STORES a few header references here
// (a Map write). Parsing and geolocating happen when an event is actually logged, once per de-duplicated event, so
// normal traffic pays almost nothing and an attack cannot make this expensive.
import { geoFromCloudflare, mergeGeo, geoIsComplete } from './geo.js';
import { parseDevice, hintsFromHeaders } from './device.js';
import { ipKey, isTrustedInfra } from './ip.js';

const CF_HEADERS = ['cf-ipcountry', 'cf-ipcity', 'cf-region', 'cf-region-code', 'cf-iplatitude', 'cf-iplongitude', 'cf-timezone'];
// Event types that are not "someone attacking us" (normal browser reports, our own admin audit trail): no tracking.
export const NO_INTEL = new Set(['csp_violation', 'admin_action']);

export function createIntel({ now = Date.now, lookup = null, ttlMs = 60 * 60000, max = 20000 } = {}) {
  const seen = new Map(); // ipKey -> { t, ua, hints, cf }

  /** Called by the shield for every request. `viaCloudflare` must come from ip.js (never from a header). */
  function remember(req, key, viaCloudflare) {
    try {
      const h = req.headers || {};
      let cf = null;
      if (viaCloudflare) { cf = {}; for (const k of CF_HEADERS) if (h[k] !== undefined) cf[k] = h[k]; }
      if (seen.size >= max && !seen.has(key)) sweep(true);
      seen.set(key, { t: now(), ua: h['user-agent'] || '', hints: hintsFromHeaders(h), cf });
    } catch { /* never throw from tracking */ }
  }
  function sweep(force = false) {
    const t = now();
    for (const [k, v] of seen) if (t - v.t > ttlMs) seen.delete(k);
    if (force && seen.size >= max) seen.clear();   // fail open rather than grow forever
  }

  /**
   * @param {{ip?:string, ua?:string}} e
   * @returns {{geo:object|null, device:object|null, pending:Promise<object|null>|null}}
   *   `pending` resolves to the final geo when a free lookup is still filling in city / coordinates.
   */
  function describe(e) {
    try {
      const ip = e.ip;
      if (!ip) return { geo: null, device: null, pending: null };
      const c = seen.get(ipKey(ip));
      const fresh = c && now() - c.t <= ttlMs ? c : null;
      const ua = e.ua !== undefined && e.ua !== null && e.ua !== '' ? e.ua : fresh?.ua;
      const hints = fresh && (ua === fresh.ua || ua === undefined) ? fresh.hints : null;
      const device = ua !== undefined || fresh ? parseDevice(ua, hints) : null;
      const geo = fresh?.cf ? geoFromCloudflare(fresh.cf) : null;
      let pending = null;
      if (lookup && !isTrustedInfra(ip) && !geo?.tor && !geoIsComplete(geo)) pending = lookup(ip).then(x => mergeGeo(geo, x)).catch(() => geo);
      return { geo, device, pending };
    } catch { return { geo: null, device: null, pending: null }; }
  }

  return { remember, describe, sweep, _seen: seen };
}
