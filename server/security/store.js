// Persistence for security events / blocks / allowlist / settings (Supabase tables, service-role key, $0).
// Design rules: (1) logging must never slow down or crash a request, (2) logging must not become its own DoS
// (events are de-duplicated and capped), (3) if the database is unreachable everything keeps working from memory.
import { NO_INTEL } from './intel.js';
const MIN = 60000;

export function createStore({ sb, enabled, now = Date.now, log = console, retentionDays = 30, intel = null } = {}) {
  const buffer = [];                 // waiting to be flushed to the database
  const ring = [];                   // last events, always available in memory (dashboard fallback)
  const dedupe = new Map();          // `${ip}|${type}` -> buffered event being aggregated
  const settings = new Map();        // key -> { v, t }
  const state = { dbOk: null, failing: 0, backoffUntil: 0, dropped: 0, perMinute: 0, minuteStart: now(), warned: false };
  const MAX_BUFFER = 1000, MAX_RING = 400, MAX_PER_MINUTE = 240, DEDUPE_MS = 30000;

  // Location + device travel inside the existing `details` jsonb column, so no database migration is needed:
  //   details.geo    = { country, countryCode, region, city, lat, lng, mapsUrl, label, source, approximate }
  //   details.device = { type, os, osVersion, browser, browserVersion, brand, model, bot, summary }
  const detailsOf = e => {
    const d = { ...(e.details || {}) };
    if (e.geo) d.geo = e.geo;
    if (e.device) d.device = e.device;
    return d;
  };
  const rowOf = e => ({
    ip: e.ip || null, type: e.type, severity: e.severity || 'low', action: e.action || 'logged',
    method: e.method || null, path: e.path ? String(e.path).slice(0, 300) : null,
    user_agent: e.ua ? String(e.ua).slice(0, 200) : null, user_id: e.userId || null,
    details: detailsOf(e), count: e.count || 1,
  });

  function logEvent(e) {
    try {
      const t = now();
      if (t - state.minuteStart > MIN) { state.minuteStart = t; state.perMinute = 0; }
      const k = `${e.ip || '-'}|${e.type}`;
      const hit = dedupe.get(k);
      if (hit && t - hit.t < DEDUPE_MS) { hit.ev.count = (hit.ev.count || 1) + (e.count || 1); return; }
      const ev = { ...e, count: e.count || 1, ts: new Date(t).toISOString() };
      if (intel && ev.ip && !NO_INTEL.has(ev.type)) {
        const info = intel.describe(ev);
        ev.geo = info.geo; ev.device = info.device;
        // A free lookup may still be filling in city / coordinates: flush() waits for it (max ~2.5 s), so it is saved too.
        if (info.pending) ev.pending = info.pending.then(g => { ev.geo = g; }).catch(() => {}).finally(() => { ev.pending = null; });
      }
      ring.push(ev); if (ring.length > MAX_RING) ring.shift();
      dedupe.set(k, { t, ev });
      if (dedupe.size > 5000) for (const [kk, v] of dedupe) if (t - v.t > DEDUPE_MS) dedupe.delete(kk);
      if (state.perMinute >= MAX_PER_MINUTE) { state.dropped++; return; }  // flood protection for our own database
      state.perMinute++;
      if (buffer.length < MAX_BUFFER) buffer.push(ev); else state.dropped++;
    } catch { /* never throw from logging */ }
  }

  async function flush() {
    if (!enabled || !buffer.length || now() < state.backoffUntil) return;
    const batch = buffer.splice(0, 100);
    try {
      await Promise.all(batch.map(e => e.pending).filter(Boolean));
      await sb('security_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(batch.map(rowOf)) });
      state.dbOk = true; state.failing = 0; state.warned = false;
    } catch (e) {
      state.dbOk = false; state.failing++; state.dropped += batch.length;
      state.backoffUntil = now() + Math.min(state.failing * 30000, 5 * MIN);
      if (!state.warned) { state.warned = true; log.warn('[security] could not save events (did you run supabase-security-hardening.sql?):', String(e?.message || e).slice(0, 160)); }
    }
  }

  async function saveBlock(b) {
    if (!enabled) return;
    try {
      await sb('security_blocks?on_conflict=ip', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ ip: b.ip, reason: String(b.reason || '').slice(0, 200), level: b.level || 1, blocked_until: new Date(b.until).toISOString(), permanent: !!b.permanent, created_by: b.by || 'auto' }),
      });
    } catch (e) { log.warn('[security] saveBlock failed:', String(e?.message || e).slice(0, 120)); }
  }
  async function removeBlock(ip) {
    if (!enabled) return;
    try { await sb(`security_blocks?ip=eq.${encodeURIComponent(ip)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); }
    catch (e) { log.warn('[security] removeBlock failed:', String(e?.message || e).slice(0, 120)); }
  }
  async function loadBlocks() {
    if (!enabled) return [];
    try { return (await sb(`security_blocks?blocked_until=gt.${encodeURIComponent(new Date().toISOString())}&select=ip,reason,level,blocked_until,permanent,created_by&limit=5000`)) || []; }
    catch { return []; }
  }
  async function loadAllow() {
    if (!enabled) return [];
    try { return (await sb('security_allowlist?select=ip,note&limit=500')) || []; } catch { return []; }
  }
  async function saveAllow(ip, note) {
    if (!enabled) return;
    await sb('security_allowlist?on_conflict=ip', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ ip, note: String(note || '').slice(0, 120) }) });
  }
  async function removeAllow(ip) {
    if (!enabled) return;
    await sb(`security_allowlist?ip=eq.${encodeURIComponent(ip)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  }
  async function queryEvents({ sinceIso, limit = 200, type, ip } = {}) {
    await flush();
    if (!enabled || state.dbOk === false) {
      return ring.filter(e => (!type || e.type === type) && (!ip || e.ip === ip)).slice(-limit).reverse()
        .map(e => ({ created_at: e.ts, ip: e.ip, type: e.type, severity: e.severity || 'low', action: e.action || 'logged', method: e.method, path: e.path, count: e.count || 1, details: detailsOf(e) }));
    }
    let q = `security_events?select=id,created_at,ip,type,severity,action,method,path,count,details&order=created_at.desc&limit=${Math.min(limit, 5000)}`;
    if (sinceIso) q += `&created_at=gte.${encodeURIComponent(sinceIso)}`;
    if (type) q += `&type=eq.${encodeURIComponent(type)}`;
    if (ip) q += `&ip=eq.${encodeURIComponent(ip)}`;
    return (await sb(q)) || [];
  }
  async function getSetting(key, def) {
    const c = settings.get(key);
    if (c && now() - c.t < 30000) return c.v;
    let v = def;
    if (enabled) {
      try { const r = await sb(`security_settings?key=eq.${encodeURIComponent(key)}&select=value&limit=1`); if (r?.[0]?.value != null) v = r[0].value; } catch { /* keep default */ }
    }
    settings.set(key, { v, t: now() });
    return v;
  }
  async function setSetting(key, value) {
    settings.set(key, { v: value, t: now() });
    if (!enabled) return;
    await sb('security_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key, value: String(value), updated_at: new Date().toISOString() }) });
  }
  async function purge() {
    if (!enabled) return;
    const cutoff = new Date(now() - retentionDays * 86400000).toISOString();
    try { await sb(`security_events?created_at=lt.${encodeURIComponent(cutoff)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); } catch { /* table may not exist yet */ }
  }

  let timers = [];
  function start() {
    stop();
    timers = [setInterval(flush, 10000), setInterval(purge, 24 * 3600 * 1000)];
    timers.forEach(t => t.unref?.());
    setTimeout(purge, 60000).unref?.();
  }
  function stop() { timers.forEach(clearInterval); timers = []; }

  return { log: logEvent, flush, saveBlock, removeBlock, loadBlocks, loadAllow, saveAllow, removeAllow, queryEvents, getSetting, setSetting, purge, start, stop, state, ring };
}
