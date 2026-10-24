// YN Studio "shield": security headers, honeypots, scanner / injection filter, rate limiting, strike scoring and
// automatic temporary IP blocking. Zero dependencies. Every code path FAILS OPEN: if the shield itself throws,
// the request continues, so a bug here can never take your shop offline.
//
// What this layer is (and is not): it stops scanners, bots, brute force against YOUR server and abusive API use.
// Large volumetric DDoS must be absorbed by Cloudflare before it reaches Render (see docs/setup/SECURITY-SETUP.md).
import { clientIp, ipKey, isTrustedInfra, normalizeIp } from './ip.js';

const MIN = 60000;
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };

/* ---------------------------- detection rules ---------------------------- */
const HONEYPOT_ANYWHERE = /\/\.(?:env|git|svn|hg|aws|ssh|ds_store|htaccess|htpasswd|npmrc|dockerenv)(?:\b|\/|$|\.)/i;
const HONEYPOT_ROOT = /^\/(?:wp-(?:login|admin|content|includes|config|json)|xmlrpc\.php|phpmyadmin|pma\/|myadmin|adminer|admin\.php|administrator\/|config\.(?:php|json|ya?ml|bak|old)|backup(?:s)?\.(?:sql|zip|tar|gz|rar)|dump\.sql|database\.sql|db\.sql|server-(?:status|info)|cgi-bin|vendor\/phpunit|actuator|jenkins|solr\/|boaform|hnap1|id_rsa|shell\.php|eval-stdin\.php|manager\/html|owa\/auth|ecp\/|remote\/login|telescope|\.well-known\/.*\.php)/i;
const SCANNER_UA = /(sqlmap|nikto|nmap|masscan|acunetix|nessus|openvas|wpscan|dirbuster|gobuster|feroxbuster|ffuf|wfuzz|hydra|havij|zgrab|nuclei|arachni|w3af|metasploit|jaeles|skipfish|whatweb|commix|xsser|netsparker|appscan)/i;
// High-confidence signatures only (we scan URL path + query, never request bodies: bodies carry CVs / chat text that would false-positive).
const WAF_RULES = [
  ['sqli', /\bunion\b[\s/*+]+(?:all[\s/*+]+)?select\b/i],
  ['sqli', /['"]?\s*\b(?:or|and)\b[\s/*+]+['"]?\d+['"]?\s*=\s*['"]?\d+/i],
  ['sqli', /['"]\s*(?:or|and)\s+['"]?\w+['"]?\s*=\s*['"]?\w+/i],
  ['sqli', /;\s*(?:drop|alter|truncate)\s+(?:table|database|schema)\b/i],
  ['sqli', /\b(?:pg_sleep|sleep|benchmark)\s*\(|\bwaitfor\s+delay\b|\bxp_cmdshell\b|\bload_file\s*\(|\binformation_schema\b|\bpg_catalog\b|\bsqlite_master\b|\binto\s+(?:out|dump)file\b/i],
  ['xss', /<\s*\/?\s*script\b|<\s*(?:iframe|object|embed|svg|img|body|details|math|video|audio)\b[^>]*\bon\w+\s*=|javascript\s*:|\bon(?:error|load|click|mouseover|focus|toggle)\s*=|document\s*\.\s*(?:cookie|location|domain)|<\s*img[^>]+src\s*=\s*['"]?\s*javascript/i],
  ['traversal', /(?:\.\.[/\\]|%2e%2e|\.\.%2f|\.\.%5c)/i],
  ['traversal', /(?:\/etc\/(?:passwd|shadow)|\/proc\/self|c:\\windows|boot\.ini|win\.ini)/i],
  ['injection', /\$\{\s*(?:jndi|env|sys|java|lower|upper)\s*:/i],
  ['injection', /(?:;|\||`|\$\()\s*(?:cat|ls|wget|curl|bash|sh|nc|netcat|powershell|cmd)\b/i],
  ['injection', /%00|\u0000/],
  ['ssrf', /(?:169\.254\.169\.254|metadata\.google\.internal|file:\/\/|gopher:\/\/|dict:\/\/)/i],
];
export function wafScan(rawUrl) {
  let decoded = rawUrl;
  try { decoded = decodeURIComponent(rawUrl.replace(/\+/g, ' ')); } catch { return 'malformed'; }
  if (decoded.length > 2048) decoded = decoded.slice(0, 2048);
  const rawSlice = rawUrl.slice(0, 2048);
  for (const [name, re] of WAF_RULES) if (re.test(decoded) || re.test(rawSlice)) return name;
  return null;
}
export const isHoneypot = path => HONEYPOT_ANYWHERE.test(path) || HONEYPOT_ROOT.test(path);
export const isScannerUa = ua => SCANNER_UA.test(ua || '');

/* ------------------------------ headers ------------------------------ */
export function securityHeaders(env = process.env) {
  const payway = 'https://checkout.payway.com.kh https://checkout-sandbox.payway.com.kh';
  const extraConnect = String(env.CSP_CONNECT_EXTRA || '').split(/[\s,]+/).filter(Boolean).join(' ');
  const csp = [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com https://cdn.jsdelivr.net 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    `connect-src 'self' blob: data: https://*.supabase.co wss://*.supabase.co https://nominatim.openstreetmap.org https://router.project-osrm.org https://api.open-meteo.com https://geocoding-api.open-meteo.com https://cdn.jsdelivr.net ${extraConnect}`.trim(),
    `frame-src 'self' https://challenges.cloudflare.com https://maps.google.com https://www.google.com ${payway}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self' ${payway}`,
    "frame-ancestors 'self'",
    'report-uri /api/security/csp-report',
  ].join('; ');
  const mode = String(env.CSP_MODE || 'report').toLowerCase(); // report (default, never breaks anything) | enforce | off
  return { csp, cspHeader: mode === 'enforce' ? 'Content-Security-Policy' : mode === 'off' ? null : 'Content-Security-Policy-Report-Only', mode };
}
function applyHeaders(req, res, hdr) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self)');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  const https = req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  if (https) res.setHeader('Strict-Transport-Security', `max-age=15552000${process.env.HSTS_SUBDOMAINS === '1' ? '; includeSubDomains' : ''}`);
  if (hdr.cspHeader) res.setHeader(hdr.cspHeader, hdr.csp);
}

/* ------------------------------- shield ------------------------------- */
export function createShield({ store, alerts, env = process.env, now = Date.now, log = console } = {}) {
  const cfg = {
    enabled: env.SECURITY_SHIELD !== 'off',
    globalPerMin: num(env.RL_GLOBAL_PER_MIN, 900),   // every request type, per IP
    apiPerMin: num(env.RL_API_PER_MIN, 180),         // /api/* per IP
    blockScore: num(env.BLOCK_SCORE, 12),
    scoreWindow: 10 * MIN,
    durations: [15, 60, 360, 1440, 10080],           // minutes: 15m -> 1h -> 6h -> 24h -> 7d
    levelMemory: 7 * 86400000,
    maxKeys: 100000,
  };
  const blocks = new Map();     // key -> { ip, until, level, reason, permanent, by }
  const levels = new Map();     // key -> { level, at }
  const scores = new Map();     // key -> { score, first }
  const allow = new Set();      // keys that are never blocked or limited
  const counters = new Map();   // `${name}|${key}` -> { n, reset }
  const strikeGate = new Map(); // limits how often a repeated rate-limit breach is counted
  const hdr = securityHeaders(env);
  const runtime = { denied: 0, deniedWindow: [], lastCloudflareAt: 0, started: now() };
  for (const ip of String(env.ALLOW_IPS || '').split(/[\s,]+/).map(normalizeIp).filter(Boolean)) allow.add(ipKey(ip));

  const isAllowed = (ip, key) => allow.has(key) || isTrustedInfra(ip);

  function sweep() {
    const t = now();
    for (const [k, c] of counters) if (c.reset <= t) counters.delete(k);
    for (const [k, b] of blocks) if (!b.permanent && b.until <= t) blocks.delete(k);
    for (const [k, s] of scores) if (t - s.first > cfg.scoreWindow) scores.delete(k);
    for (const [k, l] of levels) if (t - l.at > cfg.levelMemory) levels.delete(k);
    for (const [k, g] of strikeGate) if (g <= t) strikeGate.delete(k);
    for (const m of [counters, scores, blocks, levels]) if (m.size > cfg.maxKeys) m.clear(); // hard cap: fail open rather than grow forever
    runtime.deniedWindow = runtime.deniedWindow.filter(x => t - x < MIN);
  }
  let sweeper = null;
  const startSweeper = () => { if (!sweeper) { sweeper = setInterval(sweep, 30000); sweeper.unref?.(); } };

  function countDenied() {
    runtime.denied++;
    runtime.deniedWindow.push(now());
    if (runtime.deniedWindow.length > 300 && runtime.deniedWindow.length % 100 === 0) alerts?.spike(runtime.deniedWindow.length);
  }

  function activeBlock(key) {
    const b = blocks.get(key);
    if (!b) return null;
    if (!b.permanent && b.until <= now()) { blocks.delete(key); return null; }
    return b;
  }

  function block(ip, { reason = 'abuse', minutes, by = 'auto', permanent = false } = {}) {
    const key = ipKey(ip);
    if (isAllowed(ip, key)) return null;
    const prev = levels.get(key);
    const level = by === 'auto' ? Math.min((prev && now() - prev.at < cfg.levelMemory ? prev.level : 0) + 1, cfg.durations.length) : (prev?.level || 1);
    const mins = minutes || cfg.durations[level - 1];
    const b = { ip, until: now() + mins * MIN, level, reason, permanent, by };
    blocks.set(key, b);
    levels.set(key, { level, at: now() });
    scores.delete(key);
    store?.saveBlock(b);
    store?.log({ ip, type: 'ip_blocked', severity: 'high', action: 'blocked', details: { reason, minutes: mins, level, by, permanent } });
    if (by === 'auto') alerts?.ipBlocked({ ip, reason, minutes: mins, permanent });
    return b;
  }
  function unblock(ip) {
    const key = ipKey(ip);
    const had = blocks.delete(key);
    scores.delete(key);
    levels.delete(key);
    store?.removeBlock(ip);
    return had;
  }

  /** Add suspicion points. Returns the block record when this strike tipped the IP over the threshold. */
  function strike(ip, type, weight, meta = {}) {
    const key = ipKey(ip);
    store?.log({ ip, type, severity: weight >= 8 ? 'high' : weight >= 4 ? 'medium' : 'low', action: meta.action || 'logged', method: meta.method, path: meta.path, ua: meta.ua, userId: meta.userId, details: meta.details });
    if (isAllowed(ip, key) || activeBlock(key)) return null;
    const t = now();
    let s = scores.get(key);
    if (!s || t - s.first > cfg.scoreWindow) { s = { score: 0, first: t }; scores.set(key, s); }
    s.score += weight;
    return s.score >= cfg.blockScore ? block(ip, { reason: type }) : null;
  }

  /** Fixed-window counter. Returns { limited, retryAfter }. */
  function hit(name, key, max, windowMs = MIN) {
    const t = now();
    const id = `${name}|${key}`;
    let c = counters.get(id);
    if (!c || c.reset <= t) { c = { n: 0, reset: t + windowMs }; counters.set(id, c); }
    c.n++;
    return { limited: c.n > max, retryAfter: Math.max(1, Math.ceil((c.reset - t) / 1000)), n: c.n };
  }
  const rateStrike = (req, name, weight = 2) => {
    const id = `${name}|${req.sec.key}`;
    if ((strikeGate.get(id) || 0) > now()) return;
    strikeGate.set(id, now() + 10000);
    strike(req.sec.ip, 'rate_limit', weight, { method: req.method, path: req.path, ua: req.headers['user-agent'], details: { bucket: name }, action: 'rate_limited' });
  };

  function deny(res, status, text, retryAfter) {
    countDenied();
    if (res.headersSent) return;
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (retryAfter) res.setHeader('Retry-After', String(retryAfter));
    res.end(text);
  }

  const META = req => ({ method: req.method, path: (req.originalUrl || req.url || '').split('?')[0], ua: req.headers['user-agent'], action: 'blocked' });

  function middleware(req, res, next) {
    try {
      if (!cfg.enabled) return next();
      const { ip, viaCloudflare } = clientIp(req);
      const key = ipKey(ip);
      req.sec = { ip, key, viaCloudflare };
      if (viaCloudflare) runtime.lastCloudflareAt = now();
      applyHeaders(req, res, hdr);
      const rawUrl = req.originalUrl || req.url || '/';
      const path = rawUrl.split('?')[0];
      if (path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
      if (path === '/api/health') return next();            // keeps Render / uptime monitors working

      const allowed = isAllowed(ip, key);
      if (!allowed) {
        const b = activeBlock(key);
        if (b) { store?.log({ ip, type: 'blocked_request', severity: 'low', action: 'blocked', method: req.method, path, details: { reason: b.reason } }); return deny(res, 403, 'Access temporarily blocked.', Math.ceil((b.until - now()) / 1000)); }
        if (isHoneypot(path)) { strike(ip, 'honeypot', 12, META(req)); return deny(res, 404, 'Not found'); }
        const ua = req.headers['user-agent'] || '';
        if (isScannerUa(ua)) { strike(ip, 'scanner_ua', 8, { ...META(req), details: { ua: ua.slice(0, 80) } }); return deny(res, 403, 'Forbidden'); }
        if (!['GET', 'HEAD', 'POST', 'OPTIONS'].includes(req.method)) { strike(ip, 'bad_method', 2, { ...META(req), details: { method: req.method } }); return deny(res, 405, 'Method not allowed'); }
        if (rawUrl.length > 4096) { strike(ip, 'uri_too_long', 3, META(req)); return deny(res, 414, 'URI too long'); }
        const waf = wafScan(rawUrl);
        if (waf) { strike(ip, `waf_${waf}`, waf === 'traversal' || waf === 'injection' ? 6 : 4, { ...META(req), details: { rule: waf } }); return deny(res, 403, 'Request refused.'); }

        const g = hit('global', key, cfg.globalPerMin);
        if (g.limited) { rateStrike(req, 'global'); return deny(res, 429, 'Too many requests. Please slow down.', g.retryAfter); }
        if (path.startsWith('/api/')) {
          const a = hit('api', key, cfg.apiPerMin);
          if (a.limited) { rateStrike(req, 'api'); return deny(res, 429, 'Too many requests. Please slow down.', a.retryAfter); }
        }
      }
      return next();
    } catch (e) {
      log.warn('[security] shield error (failing open):', e?.message || e);
      return next();
    }
  }

  /** Route-specific limiter, e.g. app.post('/x', shield.limiter('callback', 60), handler). */
  function limiter(name, max, windowMs = MIN) {
    return (req, res, next) => {
      try {
        if (!cfg.enabled || !req.sec || isAllowed(req.sec.ip, req.sec.key)) return next();
        const r = hit(name, req.sec.key, max, windowMs);
        if (r.limited) { rateStrike(req, name); return deny(res, 429, 'Too many requests. Please slow down.', r.retryAfter); }
      } catch (e) { log.warn('[security] limiter error (failing open):', e?.message || e); }
      return next();
    };
  }
  /** Drop-in for the old `limited(req, max)` helper: shared per-IP counter, true when over the limit. */
  function limited(req, max = 30) {
    try {
      if (!cfg.enabled || !req.sec || isAllowed(req.sec.ip, req.sec.key)) return false;
      const r = hit('auth-api', req.sec.key, max);
      if (r.limited) { rateStrike(req, 'auth-api'); countDenied(); }
      return r.limited;
    } catch { return false; }
  }
  /** Per signed-in user limit (money endpoints, uploads). true when over the limit. */
  function userLimited(userId, name, max, windowMs = MIN, req) {
    try {
      if (!cfg.enabled || !userId) return false;
      const r = hit('user:' + name, String(userId), max, windowMs);
      if (r.limited) { countDenied(); if (req?.sec) rateStrike(req, 'user:' + name, 1); }
      return r.limited;
    } catch { return false; }
  }

  async function init() {
    startSweeper();
    store?.start();
    for (const b of await (store?.loadBlocks() ?? [])) {
      const ip = normalizeIp(b.ip); if (!ip) continue;
      blocks.set(ipKey(ip), { ip, until: new Date(b.blocked_until).getTime(), level: b.level || 1, reason: b.reason || 'restored', permanent: !!b.permanent, by: b.created_by || 'auto' });
      levels.set(ipKey(ip), { level: b.level || 1, at: now() });
    }
    for (const a of await (store?.loadAllow() ?? [])) { const ip = normalizeIp(a.ip); if (ip) allow.add(ipKey(ip)); }
  }
  const allowIp = ip => { allow.add(ipKey(ip)); blocks.delete(ipKey(ip)); };
  const disallowIp = ip => allow.delete(ipKey(ip));
  const listBlocks = () => { sweep(); return [...blocks.values()].map(b => ({ ip: b.ip, reason: b.reason, level: b.level, until: new Date(b.until).toISOString(), permanent: b.permanent, by: b.by })); };

  return { middleware, limiter, limited, userLimited, strike, block, unblock, init, allowIp, disallowIp, listBlocks, isBlocked: ip => !!activeBlock(ipKey(ip)), isAllowed: ip => isAllowed(ip, ipKey(ip)), cfg, runtime, hdr, _sweep: sweep, _state: { blocks, scores, counters, allow } };
}
