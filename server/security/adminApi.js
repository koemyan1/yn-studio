// Admin-only security API used by /admin/security, plus the public CSP report sink.
// Plain (req,res,next) handlers so they mount on Express with app.use() and can also be unit-tested without Express.
import net from 'node:net';
import { normalizeIp } from './ip.js';

const MAX_BODY = 10 * 1024;

function readJson(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise(resolve => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { resolve(null); req.destroy?.(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}
function send(res, status, body) {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
const hourKey = d => new Date(Math.floor(new Date(d).getTime() / 3600000) * 3600000).toISOString();

export function createAdminApi({ shield, store, sb, userFromToken, now = Date.now, log = console }) {
  const adminCache = new Map(); // userId -> expiry (60s). Revoking admin takes effect within a minute.

  async function requireAdmin(req, res) {
    const ip = req.sec?.ip || 'unknown';
    const user = await userFromToken(req).catch(() => null);
    if (!user) { shield.strike(ip, 'unauth_admin_api', 3, { path: '/api/admin/security', method: req.method, ua: req.headers['user-agent'], action: 'blocked' }); send(res, 401, { error: 'Sign in required.' }); return null; }
    if ((adminCache.get(user.id) || 0) > now()) return user;
    let role = null;
    try { role = (await sb(`profiles?user_id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`))?.[0]?.role; } catch { /* treated as non-admin */ }
    if (role !== 'admin') {
      shield.strike(ip, 'forbidden_admin_api', 6, { path: '/api/admin/security', method: req.method, ua: req.headers['user-agent'], userId: user.id, action: 'blocked' });
      send(res, 403, { error: 'Admins only.' });
      return null;
    }
    adminCache.set(user.id, now() + 60000);
    if (adminCache.size > 200) for (const [k, v] of adminCache) if (v < now()) adminCache.delete(k);
    return user;
  }

  async function summary() {
    const since = new Date(now() - 24 * 3600000).toISOString();
    const rows = await store.queryEvents({ sinceIso: since, limit: 5000 });
    const byType = new Map(), byIp = new Map(), timeline = new Map();
    for (let i = 23; i >= 0; i--) timeline.set(hourKey(now() - i * 3600000), 0);
    let blockedRequests = 0;
    for (const r of rows) {
      const c = Number(r.count) || 1;
      byType.set(r.type, (byType.get(r.type) || 0) + c);
      if (r.action === 'blocked' || r.action === 'rate_limited') blockedRequests += c;
      if (r.ip) { const e = byIp.get(r.ip) || { ip: r.ip, count: 0, last: r.created_at, types: new Set() }; e.count += c; e.types.add(r.type); if (r.created_at > e.last) e.last = r.created_at; byIp.set(r.ip, e); }
      const hk = hourKey(r.created_at); if (timeline.has(hk)) timeline.set(hk, timeline.get(hk) + c);
    }
    const t = k => byType.get(k) || 0;
    const sum = (...ks) => ks.reduce((a, k) => a + t(k), 0);
    return {
      generatedAt: new Date(now()).toISOString(), windowHours: 24,
      totals: {
        events: rows.reduce((a, r) => a + (Number(r.count) || 1), 0),
        blockedRequests,
        autoBlocks: t('ip_blocked'),
        rateLimited: t('rate_limit'),
        injectionAttempts: sum('waf_sqli', 'waf_xss', 'waf_traversal', 'waf_injection', 'waf_ssrf', 'waf_malformed'),
        probes: sum('honeypot', 'scanner_ua', 'bad_method', 'uri_too_long'),
        adminApiAbuse: sum('unauth_admin_api', 'forbidden_admin_api'),
        priceTampering: t('order_integrity'),
        cspReports: t('csp_violation'),
      },
      byType: [...byType].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
      topIps: [...byIp.values()].map(e => ({ ip: e.ip, count: e.count, last: e.last, types: [...e.types].slice(0, 4) })).sort((a, b) => b.count - a.count).slice(0, 10),
      timeline: [...timeline].map(([hour, count]) => ({ hour, count })),
      activeBlocks: shield.listBlocks().length,
      settings: { integrity_mode: await store.getSetting('integrity_mode', 'report') },
      runtime: {
        cloudflareSeenRecently: now() - shield.runtime.lastCloudflareAt < 15 * 60000,
        deniedSinceBoot: shield.runtime.denied,
        eventDatabase: store.state.dbOk === null ? 'unknown' : store.state.dbOk ? 'ok' : 'unreachable (run supabase-security-hardening.sql)',
        cspMode: shield.hdr.mode,
        shieldEnabled: shield.cfg.enabled,
        uptimeMinutes: Math.round((now() - shield.runtime.started) / 60000),
      },
    };
  }

  async function handler(req, res, next) {
    const url = (req.originalUrl || req.url || '').split('?')[0].replace(/\/+$/, '');
    const q = new URL(req.originalUrl || req.url || '/', 'http://x').searchParams;
    const route = url.replace(/^\/api\/admin\/security/, '') || '/';
    if (!url.startsWith('/api/admin/security')) return next();
    if (req.method === 'OPTIONS') return send(res, 204, {});
    try {
      const admin = await requireAdmin(req, res); if (!admin) return;
      if (req.method === 'GET') {
        if (route === '/summary') return send(res, 200, await summary());
        if (route === '/events') {
          const type = q.get('type') || undefined, ip = q.get('ip') ? normalizeIp(q.get('ip')) : undefined;
          const rows = await store.queryEvents({ sinceIso: new Date(now() - 7 * 86400000).toISOString(), limit: Math.min(Number(q.get('limit')) || 100, 500), type, ip });
          return send(res, 200, { events: rows });
        }
        if (route === '/blocks') return send(res, 200, { blocks: shield.listBlocks() });
        return send(res, 404, { error: 'Not found' });
      }
      if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
      const body = await readJson(req);
      if (!body) return send(res, 400, { error: 'Invalid JSON.' });
      const ip = body.ip === undefined ? null : normalizeIp(body.ip);
      const audit = (type, details) => store.log({ ip: req.sec?.ip, type: 'admin_action', severity: 'low', action: type, userId: admin.id, details });

      if (route === '/block') {
        if (!ip || !net.isIP(ip)) return send(res, 400, { error: 'Enter a valid IP address.' });
        if (ip === req.sec?.ip) return send(res, 400, { error: 'That is your own current IP address. Refusing to lock you out.' });
        const minutes = Math.min(Math.max(Number(body.minutes) || 60, 1), 60 * 24 * 365);
        const b = shield.block(ip, { reason: String(body.reason || 'manual block').slice(0, 120), minutes, by: 'admin:' + admin.id.slice(0, 8), permanent: !!body.permanent });
        if (!b) return send(res, 400, { error: 'This address is allow-listed or is trusted infrastructure (Cloudflare/private) and cannot be blocked.' });
        audit('block', { ip, minutes });
        return send(res, 200, { ok: true });
      }
      if (route === '/unblock') {
        if (!ip) return send(res, 400, { error: 'Enter a valid IP address.' });
        const had = shield.unblock(ip); audit('unblock', { ip });
        return send(res, 200, { ok: true, wasBlocked: had });
      }
      if (route === '/allow') {
        if (!ip || !net.isIP(ip)) return send(res, 400, { error: 'Enter a valid IP address.' });
        shield.allowIp(ip); await store.saveAllow(ip, body.note); audit('allow', { ip });
        return send(res, 200, { ok: true });
      }
      if (route === '/disallow') {
        if (!ip) return send(res, 400, { error: 'Enter a valid IP address.' });
        shield.disallowIp(ip); await store.removeAllow(ip); audit('disallow', { ip });
        return send(res, 200, { ok: true });
      }
      if (route === '/settings') {
        if (body.key !== 'integrity_mode' || !['report', 'enforce'].includes(body.value)) return send(res, 400, { error: 'Unknown setting.' });
        await store.setSetting('integrity_mode', body.value); audit('setting', { key: body.key, value: body.value });
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: 'Not found' });
    } catch (e) {
      log.error('[security] admin api error', e?.message || e);
      return send(res, 500, { error: 'Something went wrong.' });
    }
  }

  /** POST /api/security/csp-report : browsers send Content-Security-Policy violation reports here. */
  async function cspReport(req, res) {
    try {
      const body = await readJson(req);
      const r = body?.['csp-report'] || (Array.isArray(body) ? body[0]?.body : body) || {};
      const directive = String(r['effective-directive'] || r.effectiveDirective || r['violated-directive'] || '').slice(0, 60);
      const blocked = String(r['blocked-uri'] || r.blockedURL || '').slice(0, 120);
      if (directive) store.log({ ip: req.sec?.ip, type: 'csp_violation', severity: 'low', action: 'logged', path: String(r['document-uri'] || r.documentURL || '').slice(0, 200), details: { directive, blocked } });
    } catch { /* ignore */ }
    res.statusCode = 204; res.end();
  }

  return { handler, cspReport, summary, requireAdmin };
}
