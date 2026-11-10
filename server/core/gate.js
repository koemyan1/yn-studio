// YN CORE GATE: the five-coin ritual in front of the admin area.
//
//   1. Tapping ANY active coin does not open a customer page. It records that coin in a short-lived, signed "tap" cookie
//      and sends the phone to /yn-core (the animated page).
//   2. When all five coins have been tapped inside the time window, the page asks for Face ID / Touch ID (a passkey).
//   3. A passkey that passes sets a signed "unlock" cookie. While that cookie is valid the admin pages and /api/admin work.
//
// Both cookies are HMAC-signed with the YN CORE pepper (same key ring as the coin tokens, so rotation works the same way),
// HttpOnly, SameSite=Lax. They carry no secret: a tap cookie only says "coins 1, 3 and 4 were tapped until 14:05".
// Enforcement is OFF until YN_CORE_GATE=on, so turning this feature on can never lock you out before the coins exist.
//
// Honest limit: this protects the admin PAGES and the server's /api/admin routes. The browser also talks to Supabase
// directly (row level security), which this cookie does not cover. See docs/setup/YN-CORE-GATE.md.
import crypto from 'node:crypto';
import { b64u, fromB64u } from './crypto.js';

export const ALL_COINS = 0b11111;
const MIN = 60000;
const TAP_COOKIE = 'yn_tap', UNLOCK_COOKIE = 'yn_unlock';
const num = (v, d, lo, hi) => Math.min(Math.max(Number(v ?? d) || d, lo), hi);

export function createGate({ keyring, env = process.env, now = Date.now, publicUrl = '' } = {}) {
  const enforce = /^(on|1|true|yes)$/i.test(String(env.YN_CORE_GATE || '').trim());
  // 'owner' (default): the ritual guards the boss-only areas (YN CORE and the Admins page). Admins the boss appoints have no coins, so they
  // keep using the normal admin. 'all': the whole admin sits behind the ritual (right when you run the shop alone).
  const scopeAll = /^all$/i.test(String(env.YN_CORE_GATE_SCOPE || '').trim());
  const tapWindowMs = num(env.YN_CORE_GATE_TAP_MIN, 5, 1, 30) * MIN;       // time from the FIRST tap to finish all five
  const unlockMs = num(env.YN_CORE_UNLOCK_MIN, 20, 1, 240) * MIN;          // how long the admin stays open (slides while in use)
  const unlockMaxMs = num(env.YN_CORE_UNLOCK_MAX_MIN, 120, 5, 1440) * MIN; // hard stop, however busy you are
  const secure = /^https:/i.test(publicUrl);

  /* ---- signed cookie values: base64url(json) . keyId . hmac ---- */
  function sign(kind, obj) {
    const body = b64u(Buffer.from(JSON.stringify(obj)));
    return `${body}.${keyring.currentId}.${keyring.current('gate-' + kind, body)}`;
  }
  function open(kind, raw) {
    if (!keyring.ready || typeof raw !== 'string') return null;
    const [body, id, mac] = raw.split('.');
    if (!body || !id || !mac || raw.length > 400) return null;
    if (!keyring.ids().includes(id.toLowerCase())) return null;
    const want = keyring.hmac(id.toLowerCase(), 'gate-' + kind, body);
    const a = Buffer.from(mac), b = Buffer.from(want);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try { const o = JSON.parse(fromB64u(body).toString('utf8')); return o && typeof o === 'object' ? o : null; } catch { return null; }
  }

  const readCookie = (req, name) => {
    const h = String(req.headers?.cookie || '');
    for (const part of h.split(';')) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim(); }
    return '';
  };
  function setCookie(res, name, value, maxAgeSec) {
    const c = `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
    const prev = res.getHeader?.('Set-Cookie');
    res.setHeader('Set-Cookie', prev ? [].concat(prev, c) : c);
  }
  const clearCookie = (res, name) => setCookie(res, name, '', 0);

  /* ---- the five taps ---- */
  /** @returns {{ mask: number, start: number, exp: number } | null} null = no valid ritual in progress */
  function readTaps(req) {
    const o = open('tap', readCookie(req, TAP_COOKIE));
    if (!o || !Number.isInteger(o.m) || o.m < 0 || o.m > ALL_COINS) return null;
    const t = now();
    if (!(o.e > t) || !(o.s <= t + MIN) || t - o.s > tapWindowMs) return null;
    return { mask: o.m, start: o.s, exp: Math.min(o.e, o.s + tapWindowMs) };
  }
  /** Adds coin `slot` (1..5) to the ritual. The clock starts at the first tap and never restarts, so taps cannot be stretched out. */
  function addTap(req, res, slot) {
    const cur = readTaps(req), t = now();
    const start = cur ? cur.start : t;
    const mask = (cur ? cur.mask : 0) | (1 << (slot - 1));
    const exp = start + tapWindowMs;
    setCookie(res, TAP_COOKIE, sign('tap', { m: mask, s: start, e: exp }), Math.ceil(tapWindowMs / 1000));
    return { mask, start, exp, complete: mask === ALL_COINS };
  }
  const clearTaps = res => clearCookie(res, TAP_COOKIE);
  const tapsArray = mask => [1, 2, 3, 4, 5].map(n => !!(mask & (1 << (n - 1))));

  /* ---- the unlock ---- */
  function readUnlock(req) {
    const o = open('unlock', readCookie(req, UNLOCK_COOKIE));
    if (!o || !Number.isFinite(o.u) || !Number.isFinite(o.e)) return null;
    const t = now();
    if (!(o.e > t) || t - o.u > unlockMaxMs) return null;
    return { since: o.u, until: o.e };
  }
  function setUnlock(res, since = now()) {
    const until = Math.min(now() + unlockMs, since + unlockMaxMs);
    setCookie(res, UNLOCK_COOKIE, sign('unlock', { u: since, e: until }), Math.max(1, Math.ceil((until - now()) / 1000)));
    return until;
  }
  const clearUnlock = res => clearCookie(res, UNLOCK_COOKIE);

  /* ---- enforcement ---- */
  const neutral404 = res => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex');
    res.status(404).type('text/plain').send('Not found');
  };
  // YN EMERGENCY and its recovery screen keep their own protection (login + passkey, recovery code, waiting time), because they
  // are how you get back in when a coin is lost. They must stay reachable while the gate is closed.
  const isEmergency = p => /^\/admin\/emergency(\/|$)/.test(p);

  /** Express middleware. Mount BEFORE the /api/admin default-deny and before static files / the SPA catch-all. */
  function guard(req, res, next) {
    if (!enforce || !keyring.ready) return next();      // not enforcing: the site behaves exactly as before
    if (req.method === 'OPTIONS') return next();
    const p = String(req.path || '');
    const isApi = (scopeAll ? /^\/api\/admin(\/|$)/ : /^\/api\/admin\/(core|owner)(\/|$)/).test(p);
    const isPage = (scopeAll ? /^\/admin(\/|$)/ : /^\/admin\/(core|owner)(\/|$)/).test(p) && !isEmergency(p);
    if (!isApi && !isPage) return next();
    const u = readUnlock(req);
    if (u) {
      if (u.until - now() < unlockMs * 0.8) setUnlock(res, u.since);   // slide the window while you are working
      return next();
    }
    if (isApi) { res.setHeader('Cache-Control', 'no-store'); return res.status(403).json({ error: 'Admin is locked. Scan your five YN CORE coins first.', code: 'gate_locked' }); }
    if (req.method === 'GET' || req.method === 'HEAD') return neutral404(res);
    return next();
  }

  return { enforce, scopeAll, tapWindowMs, unlockMs, unlockMaxMs, readTaps, addTap, clearTaps, tapsArray, readUnlock, setUnlock, clearUnlock, guard, neutral404 };
}
