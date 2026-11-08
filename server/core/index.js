// Note: the security shield only allows GET/HEAD/POST/OPTIONS, so every change here is a POST.
// YN CORE: five NFC coins (01-05), the YN EMERGENCY initialization / recovery center, passkey step-up, rotation, analytics.
// Setup + security model: docs/setup/YN-CORE-SETUP.md. Database: supabase/sql/supabase-yn-core.sql.
//
// Design rules
//   * Off by default (YN_CORE=on enables it). With it off, every YN CORE route answers 404 and nothing else in the site changes.
//   * Fail closed: missing pepper / missing PUBLIC_URL / unreachable database => the feature refuses, it never falls back to weaker checks.
//   * A coin's URL is permanent; the server decides where it leads (destination rotation) and whether it works at all.
//   * Anything irreversible needs a FRESH passkey assertion (Face ID / Touch ID / device PIN through WebAuthn), consumed in the
//     same database transaction as the change. The browser holds the resulting opaque session token in memory only.
//   * Handlers are plain (req, res) functions listed in `routes`, so they can be tested without Express.
import crypto from 'node:crypto';
import { b64u, createKeyring, isToken, newRecoveryCode, newToken, normalizeRecoveryCode, sha256hex, fromB64u } from './crypto.js';
import { verifyAssertion, verifyRegistration, WebAuthnError } from './webauthn.js';
import { pickDestination } from './rotation.js';
import { parseHostList, validateDestinationUrl } from './urls.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLOT_RE = /^[1-5]$/;
const SESSION_PURPOSES = ['init', 'coin_security', 'security'];
const ALL_PURPOSES = [...SESSION_PURPOSES, 'recover', 'recover_open'];
const BOT_RE = /(bot|crawl|spider|preview|facebookexternalhit|slackbot|telegram|whatsapp|discord|curl\/|wget|python-requests|headless|monitor|uptime)/i;
const MIN = 60000;
const enc = encodeURIComponent;

class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createCore({ sb, shield = null, store = null, requireAdmin = null, notify = () => {}, env = process.env, now = Date.now, log = console } = {}) {
  const enabled = String(env.YN_CORE || '').toLowerCase() === 'on';
  const keyring = createKeyring(env);
  const publicUrl = String(env.PUBLIC_URL || '').replace(/\/$/, '');
  let rpId = '', origins = [];
  try {
    if (publicUrl) {
      const u = new URL(publicUrl);
      if (u.protocol === 'https:' || u.hostname === 'localhost') {
        rpId = String(env.YN_CORE_RP_ID || u.hostname).toLowerCase();
        origins = [u.origin, ...String(env.YN_CORE_EXTRA_ORIGINS || '').split(/[\s,]+/).filter(Boolean)];
      }
    }
  } catch { /* stays empty: fail closed */ }
  const canonicalHost = publicUrl ? new URL(publicUrl).host.toLowerCase() : '';
  const ready = { keyring: keyring.ready, webauthn: !!(rpId && origins.length), publicUrl: !!publicUrl };
  const allowedHosts = parseHostList(env.YN_CORE_ALLOWED_HOSTS);
  const recoveryDelayMin = Math.min(Math.max(Number(env.YN_CORE_RECOVERY_DELAY_MIN ?? 30) || 30, 1), 1440);
  const recoveryWindowMin = Math.min(Math.max(Number(env.YN_CORE_RECOVERY_WINDOW_MIN ?? 15) || 15, 1), 60);
  const SESSION_MS = 5 * MIN, CHALLENGE_MS = 90000;
  const iso = ms => new Date(ms).toISOString();

  /* ------------------------------------------------------------------ helpers */
  function send(res, status, body) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(status).json(body);
  }
  const wrap = (name, fn) => async (req, res) => {
    try { await fn(req, res); }
    catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message, ...e.extra });
      log.error('[yn-core]', name, String(e?.message || e).slice(0, 200));
      return send(res, 500, { error: 'Something went wrong.' });
    }
  };
  const hdr = (req, k) => String(req.headers?.[k] || '');
  const ipHash = req => (keyring.ready ? keyring.ipHash(req.sec?.ip || req.ip || '', now()) : null);
  const body = req => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});
  const slotOf = v => { const s = String(v ?? ''); if (!SLOT_RE.test(s)) throw new HttpError(400, 'Coin must be 01 to 05.'); return Number(s); };
  const uidOf = req => { const id = req.admin?.id; if (!UUID_RE.test(String(id || ''))) throw new HttpError(401, 'Sign in required.'); return String(id).toLowerCase(); };

  function needReady({ webauthn = false } = {}) {
    if (!enabled) throw new HttpError(404, 'Not found');
    if (!ready.keyring) throw new HttpError(503, 'YN CORE is not configured on the server (YN_CORE_PEPPER_*).');
    if (webauthn && !(ready.webauthn && ready.publicUrl)) throw new HttpError(503, 'YN CORE needs PUBLIC_URL set to your https address.');
  }
  function needCanonicalHost(req) {
    const host = hdr(req, 'host').toLowerCase();
    if (canonicalHost && host && host !== canonicalHost && !/^localhost(:\d+)?$/.test(host)) {
      throw new HttpError(400, `Open YN CORE at ${publicUrl} (passkeys only work on that address).`);
    }
  }

  async function audit(actor, action, slot, result, details, req) {
    try {
      await sb('rpc/yn_core_audit', { method: 'POST', body: JSON.stringify({ p_actor: actor || null, p_action: action, p_slot: slot ?? null, p_result: result, p_details: details || {}, p_ip_hash: req ? ipHash(req) : null }) });
    } catch (e) { log.warn('[yn-core] audit write failed:', String(e?.message || e).slice(0, 120)); }
  }
  const alertAdmin = (title, message, link = '/admin/core') => { try { notify(title, message, link); } catch { /* alerts never block */ } };

  async function getState() { try { return (await sb('yn_core_state?id=eq.1&select=*&limit=1'))?.[0] || null; } catch { return null; } }
  const isLocked = s => !s || (!!s.init_locked && !(s.recovery_window_until && new Date(s.recovery_window_until).getTime() > now()));

  /* Consume a single-use emergency session in ONE conditional UPDATE (so two parallel requests cannot both succeed). */
  async function takeSession(req, scope, slot) {
    const token = hdr(req, 'x-yn-emergency');
    if (!isToken(token)) return null;
    const uid = uidOf(req);
    const q = `yn_core_emergency_sessions?session_hmac=eq.${keyring.current('session', token)}&scope=eq.${scope}&user_id=eq.${uid}` +
      `&slot=${slot == null ? 'is.null' : 'eq.' + slot}&consumed_at=is.null&revoked_at=is.null&expires_at=gt.${enc(iso(now()))}`;
    const rows = await sb(q, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ consumed_at: iso(now()), revoked_at: iso(now()), revoke_reason: 'used' }) });
    return rows?.[0] || null;
  }

  const listCreds = async uid => (await sb(`yn_core_admin_credentials?user_id=eq.${uid}&revoked_at=is.null&select=id,credential_id,transports,nickname,created_at,last_used_at,backed_up,device_type&order=created_at`)) || [];

  async function newChallenge(uid, purpose, slot) {
    const challenge = b64u(crypto.randomBytes(32));
    const id = crypto.randomUUID();
    await sb('yn_core_webauthn_challenges', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ id, purpose, user_id: uid, slot: slot ?? null, challenge_hash: sha256hex(challenge), expires_at: iso(now() + CHALLENGE_MS) }) });
    return { id, challenge };
  }
  const clientChallenge = credential => {
    try { const c = JSON.parse(fromB64u(credential.response.clientDataJSON).toString('utf8')).challenge; return typeof c === 'string' ? c : null; } catch { return null; }
  };
  /* A challenge is burned the moment someone tries it (success or not): one attempt per authentication. */
  async function takeChallenge(id, uid, purpose, credential) {
    if (!UUID_RE.test(String(id || ''))) throw new HttpError(400, 'Invalid request.');
    const ch = clientChallenge(credential);
    if (!ch) throw new HttpError(400, 'Invalid passkey response.');
    const rows = await sb(`yn_core_webauthn_challenges?id=eq.${id}&user_id=eq.${uid}&consumed_at=is.null&expires_at=gt.${enc(iso(now()))}${purpose ? '&purpose=eq.' + purpose : ''}`,
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ consumed_at: iso(now()) }) });
    const row = rows?.[0];
    if (!row || row.challenge_hash !== sha256hex(ch)) throw new HttpError(401, 'The passkey check expired or was already used. Try again.');
    return { row, challenge: ch };
  }
  async function verifyUser(req, { challengeId, credential, purpose }) {
    const uid = uidOf(req);
    const { row, challenge } = await takeChallenge(challengeId, uid, purpose, credential);
    const rawId = typeof credential?.rawId === 'string' ? credential.rawId : '';
    const cred = (await sb(`yn_core_admin_credentials?credential_id=eq.${enc(rawId)}&user_id=eq.${uid}&revoked_at=is.null&select=*&limit=1`))?.[0];
    const denied = why => {
      shield?.strike?.(req.sec?.ip || 'unknown', 'core_auth_fail', 3, { method: req.method, path: '/api/emergency', ua: hdr(req, 'user-agent'), userId: uid, details: { why } });
      audit(uid, 'passkey.assert', row.slot, 'denied', { purpose: row.purpose, why }, req);
      throw new HttpError(401, 'Passkey verification failed.');
    };
    if (!cred) return denied('unknown credential');
    let out;
    try { out = verifyAssertion({ credential, expectedChallenge: challenge, rpId, origins, stored: { publicKey: cred.public_key, signCount: cred.sign_count } }); }
    catch (e) { if (e instanceof WebAuthnError) return denied(e.message); throw e; }
    await sb(`yn_core_admin_credentials?id=eq.${cred.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ sign_count: out.signCount, last_used_at: iso(now()), backed_up: out.backedUp }) });
    return { uid, row, cred };
  }

  /* Supabase puts the sign-in method + time into the JWT (`amr`). Adding the FIRST passkey needs a login from the last 10 minutes. */
  function freshLogin(req, maxAgeSec = 600) {
    try {
      const tok = hdr(req, 'authorization').replace(/^Bearer\s+/i, '');
      const p = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString('utf8'));
      const times = (Array.isArray(p.amr) ? p.amr : []).map(a => Number(a?.timestamp)).filter(Number.isFinite);
      const last = times.length ? Math.max(...times) : Number(p.iat);
      return Number.isFinite(last) && now() / 1000 - last <= maxAgeSec;
    } catch { return false; }
  }

  const newCodes = async uid => {
    const codes = Array.from({ length: 10 }, newRecoveryCode);
    await sb('yn_core_recovery_codes', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(codes.map(c => ({ user_id: uid, code_hmac: keyring.current('recovery', normalizeRecoveryCode(c)) }))) });
    return codes;
  };

  const tokenUrl = token => `${publicUrl}/nfc/${token}`;

  /* ------------------------------------------------------------------ public: the NFC tap */
  const neutral404 = res => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Robots-Tag', 'noindex');
    res.status(404).type('text/plain').send('Not found');
  };
  const uaClass = ua => (/iphone|ipad|ios/i.test(ua) ? 'ios' : /android/i.test(ua) ? 'android' : /windows|macintosh|linux|cros/i.test(ua) ? 'desktop' : 'other');

  async function resolveTap(req, res) {
    const redacted = '/nfc/:token';   // the token is a bearer secret: it must never reach logs
    try {
      if (!enabled || !keyring.ready) return neutral404(res);
      const token = String(req.params?.token || '');
      if (!isToken(token)) { shield?.strike?.(req.sec?.ip || 'unknown', 'nfc_bad_token', 1, { method: req.method, path: redacted, ua: hdr(req, 'user-agent') }); return neutral404(res); }
      const head = req.method === 'HEAD';
      const ua = hdr(req, 'user-agent');
      const bot = BOT_RE.test(ua);
      const all = keyring.all('token', token);
      const tok = (await sb(`yn_core_coin_tokens?token_hmac=in.(${all.map(x => x.hmac).join(',')})&select=id,slot,status,grace_until,key_id&limit=1`))?.[0];
      const logTap = (slot, token_id, outcome, destination_id = null) => {
        if (head) return;
        sb('yn_core_tap_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ slot, token_id, outcome: bot && outcome === 'redirected' ? 'bot' : outcome, destination_id, ip_hash: ipHash(req), country: (hdr(req, 'cf-ipcountry').slice(0, 2).toUpperCase() || null), ua_class: uaClass(ua), is_bot: bot }) }).catch(() => {});
      };
      if (!tok) {
        store?.log?.({ ip: req.sec?.ip, type: 'nfc_unknown_token', severity: 'low', action: 'blocked', method: req.method, path: redacted, ua });
        shield?.strike?.(req.sec?.ip || 'unknown', 'nfc_unknown_token', 1, { method: req.method, path: redacted, ua });
        return neutral404(res);
      }
      if (tok.status === 'revoked') { logTap(tok.slot, tok.id, 'revoked'); return neutral404(res); }
      if (tok.status === 'grace' && !(tok.grace_until && new Date(tok.grace_until).getTime() > now())) { logTap(tok.slot, tok.id, 'expired'); return neutral404(res); }
      const [coin, dests] = await Promise.all([
        sb(`yn_core_coins?slot=eq.${tok.slot}&select=*&limit=1`).then(r => r?.[0]),
        sb(`yn_core_destinations?slot=eq.${tok.slot}&active=eq.true&select=*`),
      ]);
      if (!coin || coin.status !== 'active') { logTap(tok.slot, tok.id, coin?.status === 'paused' ? 'paused' : 'revoked'); return neutral404(res); }
      const dest = pickDestination(coin, dests || [], new Date(now()));
      if (!dest) { logTap(tok.slot, tok.id, 'no_destination'); return neutral404(res); }
      logTap(tok.slot, tok.id, coin.policy === 'interstitial' ? 'interstitial' : 'redirected', dest.id);
      if (!head && !bot) {
        sb(`yn_core_coin_tokens?id=eq.${tok.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ last_used_at: iso(now()), ...(tok.key_id !== keyring.currentId ? { token_hmac: keyring.current('token', token), key_id: keyring.currentId } : {}) }) }).catch(() => {});
        if (!coin.written_verified_at) sb(`yn_core_coins?slot=eq.${coin.slot}&written_verified_at=is.null`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ written_verified_at: iso(now()) }) }).catch(() => {});
      }
      res.setHeader('Cache-Control', 'no-store, private'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      if (coin.policy === 'interstitial') {
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
        const host = new URL(dest.url).host;
        return res.status(200).type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Open link?</title><style>body{font:16px system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f5fb;color:#1c1b29}main{max-width:420px;margin:24px;padding:28px;border-radius:18px;background:#fff;box-shadow:0 8px 30px rgba(0,0,0,.08);text-align:center}a.b{display:block;margin-top:18px;padding:14px;border-radius:12px;background:#6d28d9;color:#fff;text-decoration:none;font-weight:700}small{color:#6b6a7c}</style></head><body><main><h1 style="font-size:20px;margin:0 0 8px">YN Studio</h1><p>This tag opens <b>${esc(host)}</b></p><a class="b" rel="noreferrer noopener" href="${esc(dest.url)}">Continue</a><p><small>Only continue if you tapped a YN Studio tag yourself.</small></p></main></body></html>`);
      }
      return res.redirect(302, dest.url);
    } catch (e) {
      log.error('[yn-core] tap', String(e?.message || e).slice(0, 160));
      return neutral404(res);
    }
  }

  /* ------------------------------------------------------------------ admin: overview, coins, destinations, analytics */
  const getCoinRow = async slot => (await sb(`yn_core_coins?slot=eq.${slot}&select=*&limit=1`))?.[0] || null;
  const manageable = c => c && (c.status === 'active' || c.status === 'paused');

  async function overview(req, res) {
    needReady();
    const uid = uidOf(req);
    const since = iso(now() - 7 * 86400000);
    const [state, coins, tokens, taps, creds, codes, pending] = await Promise.all([
      getState(),
      sb('yn_core_coins?select=slot,label,status,policy,activated_at,written_verified_at&order=slot'),
      sb('yn_core_coin_tokens?status=in.(current,grace)&select=slot,generation,status,grace_until,created_at,last_used_at'),
      sb(`yn_core_tap_events?ts=gte.${enc(since)}&is_bot=eq.false&outcome=in.(redirected,interstitial)&select=slot,ts&order=ts.desc&limit=5000`),
      listCreds(uid),
      sb(`yn_core_recovery_codes?user_id=eq.${uid}&used_at=is.null&select=id`),
      sb(`yn_core_recovery_requests?status=eq.pending&expires_at=gt.${enc(iso(now()))}&select=id,ready_at,expires_at&order=requested_at.desc&limit=1`),
    ]);
    const out = (coins || []).map(c => {
      const mine = (tokens || []).filter(t => t.slot === c.slot);
      const cur = mine.find(t => t.status === 'current'), grace = mine.find(t => t.status === 'grace');
      const t = (taps || []).filter(x => x.slot === c.slot);
      return { slot: c.slot, label: c.label, status: c.status, policy: c.policy, activatedAt: c.activated_at, writtenVerifiedAt: c.written_verified_at,
        generation: cur?.generation ?? null, graceUntil: grace?.grace_until ?? null, lastUsedAt: cur?.last_used_at ?? null, taps7d: t.length, lastTapAt: t[0]?.ts ?? null };
    });
    send(res, 200, {
      ready, initLocked: isLocked(state), finalLock: !!state?.init_locked, recoveryWindowUntil: state?.recovery_window_until || null,
      coins: out, passkeys: creds.length, recoveryCodesLeft: (codes || []).length, pendingRecovery: pending?.[0] || null,
    });
  }

  async function getCoin(req, res) {
    needReady();
    const slot = slotOf(req.params?.slot);
    const [coin, dests, toks] = await Promise.all([
      getCoinRow(slot),
      sb(`yn_core_destinations?slot=eq.${slot}&select=*&order=priority,created_at`),
      sb(`yn_core_coin_tokens?slot=eq.${slot}&select=id,generation,status,key_id,created_at,last_used_at,grace_until,revoked_at,revoke_reason&order=generation.desc&limit=6`),
    ]);
    if (!coin) throw new HttpError(404, 'Coin not found.');
    const preview = coin.status === 'active' ? pickDestination(coin, (dests || []).filter(d => d.active), new Date(now())) : null;
    send(res, 200, { coin, destinations: dests || [], tokens: toks || [], liveDestinationId: preview?.id ?? null, liveUrl: preview?.url ?? null });
  }

  const tzOk = tz => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };
  async function patchCoin(req, res) {
    needReady();
    const slot = slotOf(req.params?.slot), b = body(req), uid = uidOf(req), patch = {};
    if (b.label !== undefined) { const l = String(b.label).trim(); if (l.length > 60) throw new HttpError(400, 'Name is too long.'); patch.label = l; }
    if (b.policy !== undefined) { if (!['redirect', 'interstitial'].includes(b.policy)) throw new HttpError(400, 'Unknown policy.'); patch.policy = b.policy; }
    if (b.fallback_url !== undefined) { try { patch.fallback_url = b.fallback_url ? validateDestinationUrl(b.fallback_url, { allowedHosts }) : null; } catch (e) { throw new HttpError(400, e.message); } }
    if (b.rotation_mode !== undefined) { if (!['fixed', 'interval'].includes(b.rotation_mode)) throw new HttpError(400, 'Unknown rotation mode.'); patch.rotation_mode = b.rotation_mode; }
    if (b.rotation_interval_seconds !== undefined) { const n = Math.round(Number(b.rotation_interval_seconds)); if (!(n >= 60 && n <= 31536000)) throw new HttpError(400, 'Interval must be 60 seconds to 1 year.'); patch.rotation_interval_seconds = n; }
    if (b.rotation_tz !== undefined) { if (!tzOk(String(b.rotation_tz))) throw new HttpError(400, 'Unknown time zone.'); patch.rotation_tz = String(b.rotation_tz); }
    if (!Object.keys(patch).length) throw new HttpError(400, 'Nothing to change.');
    if (patch.rotation_mode || patch.rotation_interval_seconds) patch.rotation_anchor = iso(now());
    patch.updated_at = iso(now());
    const rows = await sb(`yn_core_coins?slot=eq.${slot}&status=in.(active,paused)`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
    if (!rows?.length) throw new HttpError(409, 'This coin is not active.');
    audit(uid, 'coin.settings', slot, 'ok', { fields: Object.keys(patch).filter(k => k !== 'updated_at') }, req);
    send(res, 200, { ok: true, coin: rows[0] });
  }

  const setStatus = (from, to, label) => async (req, res) => {
    needReady();
    const slot = slotOf(req.params?.slot), uid = uidOf(req);
    const rows = await sb(`yn_core_coins?slot=eq.${slot}&status=eq.${from}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: to, updated_at: iso(now()) }) });
    if (!rows?.length) throw new HttpError(409, `Coin ${String(slot).padStart(2, '0')} is not ${from}.`);
    audit(uid, `coin.${label}`, slot, 'ok', {}, req);
    alertAdmin(`YN CORE: coin 0${slot} ${label}d`, `Coin 0${slot} was ${label}d from the admin panel.`);
    send(res, 200, { ok: true, status: to });
  };

  function parseDest(b, { partial = false } = {}) {
    const out = {};
    const has = k => b[k] !== undefined;
    if (!partial || has('url')) { try { out.url = validateDestinationUrl(b.url, { allowedHosts }); } catch (e) { throw new HttpError(400, e.message); } }
    if (has('label')) { const l = String(b.label || '').trim(); if (l.length > 60) throw new HttpError(400, 'Label is too long.'); out.label = l; }
    if (has('priority')) { const n = Math.round(Number(b.priority)); if (!Number.isFinite(n) || n < 0 || n > 100000) throw new HttpError(400, 'Priority must be 0 to 100000.'); out.priority = n; }
    if (has('active')) out.active = !!b.active;
    for (const k of ['starts_at', 'ends_at']) if (has(k)) {
      if (b[k] === null || b[k] === '') out[k] = null;
      else { const t = new Date(b[k]); if (Number.isNaN(t.getTime())) throw new HttpError(400, 'Invalid date.'); out[k] = t.toISOString(); }
    }
    if (has('weekdays')) {
      if (b.weekdays === null || (Array.isArray(b.weekdays) && !b.weekdays.length)) out.weekdays = null;
      else if (Array.isArray(b.weekdays) && b.weekdays.length <= 7 && b.weekdays.every(n => Number.isInteger(n) && n >= 0 && n <= 6)) out.weekdays = [...new Set(b.weekdays)];
      else throw new HttpError(400, 'Weekdays must be numbers 0 (Sun) to 6 (Sat).');
    }
    for (const k of ['window_start', 'window_end']) if (has(k)) {
      if (b[k] === null || b[k] === '') out[k] = null;
      else if (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b[k]))) out[k] = String(b[k]);
      else throw new HttpError(400, 'Times look like 09:30.');
    }
    if (('window_start' in out) !== ('window_end' in out) && !partial) throw new HttpError(400, 'Set both daily times or neither.');
    return out;
  }
  async function addDestination(req, res) {
    needReady();
    const slot = slotOf(req.params?.slot), uid = uidOf(req);
    const coin = await getCoinRow(slot);
    if (!manageable(coin)) throw new HttpError(409, 'This coin is not active.');
    const count = (await sb(`yn_core_destinations?slot=eq.${slot}&select=id`))?.length || 0;
    if (count >= 20) throw new HttpError(400, 'A coin can have at most 20 destinations.');
    const d = parseDest(body(req));
    const rows = await sb('yn_core_destinations', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ priority: 100, ...d, slot, created_by: uid }) });
    audit(uid, 'destination.add', slot, 'ok', { host: new URL(d.url).host }, req);
    send(res, 201, { ok: true, destination: rows?.[0] });
  }
  async function updateDestination(req, res) {
    needReady();
    const slot = slotOf(req.params?.slot), uid = uidOf(req), id = String(req.params?.id || '');
    if (!UUID_RE.test(id)) throw new HttpError(400, 'Invalid destination.');
    const d = parseDest(body(req), { partial: true });
    if (!Object.keys(d).length) throw new HttpError(400, 'Nothing to change.');
    const rows = await sb(`yn_core_destinations?id=eq.${id}&slot=eq.${slot}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(d) });
    if (!rows?.length) throw new HttpError(404, 'Destination not found.');
    audit(uid, 'destination.update', slot, 'ok', { fields: Object.keys(d) }, req);
    send(res, 200, { ok: true, destination: rows[0] });
  }
  async function deleteDestination(req, res) {
    needReady();
    const slot = slotOf(req.params?.slot), uid = uidOf(req), id = String(req.params?.id || '');
    if (!UUID_RE.test(id)) throw new HttpError(400, 'Invalid destination.');
    const rows = await sb(`yn_core_destinations?id=eq.${id}&slot=eq.${slot}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
    if (!rows?.length) throw new HttpError(404, 'Destination not found.');
    audit(uid, 'destination.delete', slot, 'ok', {}, req);
    send(res, 200, { ok: true });
  }

  async function analytics(req, res) {
    needReady();
    const slot = slotOf(req.params?.slot);
    const days = Math.min(Math.max(Math.round(Number(req.query?.days) || 7), 1), 90);
    const since = iso(now() - days * 86400000);
    const [events, dests, coin] = await Promise.all([
      sb(`yn_core_tap_events?slot=eq.${slot}&ts=gte.${enc(since)}&select=ts,outcome,destination_id,country,ua_class,is_bot,ip_hash&order=ts.desc&limit=5000`),
      sb(`yn_core_destinations?slot=eq.${slot}&select=id,label,url`),
      getCoinRow(slot),
    ]);
    const label = Object.fromEntries((dests || []).map(d => [d.id, d.label || new URL(d.url).host]));
    const perDay = new Map(), byDest = new Map(), byCountry = new Map(), byUa = new Map(), visitors = new Set();
    let taps = 0, bots = 0, blocked = 0;
    for (let i = days - 1; i >= 0; i--) perDay.set(iso(now() - i * 86400000).slice(0, 10), { taps: 0, bots: 0, blocked: 0 });
    for (const e of events || []) {
      const day = String(e.ts).slice(0, 10), d = perDay.get(day) || (perDay.set(day, { taps: 0, bots: 0, blocked: 0 }), perDay.get(day));
      if (e.is_bot) { bots++; d.bots++; continue; }
      if (e.outcome === 'redirected' || e.outcome === 'interstitial') {
        taps++; d.taps++;
        if (e.ip_hash) visitors.add(e.ip_hash);
        const k = e.destination_id ? (label[e.destination_id] || 'removed destination') : 'fallback';
        byDest.set(k, (byDest.get(k) || 0) + 1);
        if (e.country) byCountry.set(e.country, (byCountry.get(e.country) || 0) + 1);
        byUa.set(e.ua_class || 'other', (byUa.get(e.ua_class || 'other') || 0) + 1);
      } else { blocked++; d.blocked++; }
    }
    const top = m => [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);
    send(res, 200, { days, totals: { taps, bots, blocked, approxVisitors: visitors.size }, perDay: [...perDay].map(([day, v]) => ({ day, ...v })), byDestination: top(byDest), byCountry: top(byCountry), byDevice: top(byUa), lastTapAt: (events || []).find(e => !e.is_bot)?.ts ?? null, writtenVerifiedAt: coin?.written_verified_at ?? null, truncated: (events || []).length >= 5000 });
  }
  async function tapLogs(req, res) {
    needReady();
    const slot = slotOf(req.params?.slot);
    const limit = Math.min(Math.max(Math.round(Number(req.query?.limit) || 100), 1), 300);
    const rows = (await sb(`yn_core_tap_events?slot=eq.${slot}&select=ts,outcome,destination_id,country,ua_class,is_bot,ip_hash&order=ts.desc&limit=${limit}`)) || [];
    send(res, 200, { events: rows.map(r => ({ ts: r.ts, outcome: r.outcome, destinationId: r.destination_id, country: r.country, device: r.ua_class, bot: r.is_bot, visitor: (r.ip_hash || '').slice(0, 8) })) });
  }
  async function auditLog(req, res) {
    needReady();
    const limit = Math.min(Math.max(Math.round(Number(req.query?.limit) || 100), 1), 300);
    send(res, 200, { entries: (await sb(`yn_core_audit_log?select=id,ts,actor,action,slot,result,details&order=id.desc&limit=${limit}`)) || [] });
  }

  /* ------------------------------------------------------------------ admin: passkeys */
  async function listPasskeys(req, res) {
    needReady();
    const uid = uidOf(req);
    const [creds, codes] = await Promise.all([listCreds(uid), sb(`yn_core_recovery_codes?user_id=eq.${uid}&used_at=is.null&select=id`)]);
    send(res, 200, { passkeys: creds.map(c => ({ id: c.id, nickname: c.nickname, createdAt: c.created_at, lastUsedAt: c.last_used_at, backedUp: c.backed_up, deviceType: c.device_type, transports: c.transports })), recoveryCodesLeft: (codes || []).length });
  }
  async function registerOptions(req, res) {
    needReady({ webauthn: true }); needCanonicalHost(req);
    const uid = uidOf(req), b = body(req);
    const creds = await listCreds(uid);
    if (creds.length) {
      if (!(await takeSession(req, 'security', null))) throw new HttpError(401, 'Confirm with a registered passkey first.', { code: 'step_up' });
    } else if (!freshLogin(req)) {
      throw new HttpError(401, 'For safety, sign in again with your password, then add the passkey within 10 minutes.', { code: 'stale_login' });
    }
    const { id, challenge } = await newChallenge(uid, 'register', null);
    const attachment = ['platform', 'cross-platform'].includes(b.attachment) ? b.attachment : undefined;
    send(res, 200, { challengeId: id, publicKey: {
      rp: { id: rpId, name: 'YN Studio' },
      user: { id: b64u(Buffer.from(uid.replace(/-/g, ''), 'hex')), name: req.admin?.email || uid, displayName: req.admin?.email || 'YN Studio admin' },
      challenge, timeout: 60000, attestation: 'none',
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      excludeCredentials: creds.map(c => ({ type: 'public-key', id: c.credential_id, transports: c.transports || undefined })),
      authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required', ...(attachment ? { authenticatorAttachment: attachment } : {}) },
    } });
  }
  async function registerVerify(req, res) {
    needReady({ webauthn: true }); needCanonicalHost(req);
    const uid = uidOf(req), b = body(req);
    const { challenge } = await takeChallenge(b.challengeId, uid, 'register', b.credential);
    let reg;
    try { reg = verifyRegistration({ credential: b.credential, expectedChallenge: challenge, rpId, origins }); }
    catch (e) { if (e instanceof WebAuthnError) { audit(uid, 'passkey.register', null, 'denied', { why: e.message }, req); throw new HttpError(400, 'This passkey cannot be used: ' + e.message + '.'); } throw e; }
    const nickname = String(b.nickname || '').trim().slice(0, 40) || (reg.deviceType === 'multiDevice' ? 'Synced passkey' : 'This device');
    try {
      await sb('yn_core_admin_credentials', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: uid, credential_id: reg.credentialId, public_key: reg.publicKey, sign_count: reg.signCount, transports: reg.transports, backed_up: reg.backedUp, device_type: reg.deviceType, aaguid: reg.aaguid, nickname }) });
    } catch { throw new HttpError(409, 'This passkey is already registered.'); }
    const hadCodes = ((await sb(`yn_core_recovery_codes?user_id=eq.${uid}&select=id&limit=1`)) || []).length > 0;
    const recoveryCodes = hadCodes ? undefined : await newCodes(uid);
    audit(uid, 'passkey.register', null, 'ok', { nickname, deviceType: reg.deviceType }, req);
    alertAdmin('YN CORE: passkey added', `A passkey ("${nickname}") was added to an admin account.`, '/admin/core/security');
    send(res, 201, { ok: true, recoveryCodes });
  }
  async function deletePasskey(req, res) {
    needReady({ webauthn: true });
    const uid = uidOf(req), id = String(req.params?.id || '');
    if (!UUID_RE.test(id)) throw new HttpError(400, 'Invalid passkey.');
    const creds = await listCreds(uid);
    if (!creds.some(c => c.id === id)) throw new HttpError(404, 'Passkey not found.');
    if (creds.length < 2) throw new HttpError(409, 'You cannot remove your only passkey. Add another device first.');
    if (!(await takeSession(req, 'security', null))) throw new HttpError(401, 'Confirm with your passkey first.', { code: 'step_up' });
    await sb(`yn_core_admin_credentials?id=eq.${id}&user_id=eq.${uid}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ revoked_at: iso(now()) }) });
    audit(uid, 'passkey.remove', null, 'ok', {}, req);
    alertAdmin('YN CORE: passkey removed', 'A passkey was removed from an admin account.', '/admin/core/security');
    send(res, 200, { ok: true });
  }
  async function regenerateCodes(req, res) {
    needReady({ webauthn: true });
    const uid = uidOf(req);
    if (!(await takeSession(req, 'security', null))) throw new HttpError(401, 'Confirm with your passkey first.', { code: 'step_up' });
    await sb(`yn_core_recovery_codes?user_id=eq.${uid}&used_at=is.null`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ used_at: iso(now()) }) });
    const codes = await newCodes(uid);
    audit(uid, 'recovery.codes', null, 'ok', {}, req);
    send(res, 200, { ok: true, recoveryCodes: codes });
  }
  async function cancelRecovery(req, res) {
    needReady();
    const uid = uidOf(req);
    const rows = await sb('yn_core_recovery_requests?status=eq.pending', { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: 'cancelled', cancelled_at: iso(now()), cancelled_by: uid }) });
    audit(uid, 'recovery.cancel', null, 'ok', { count: rows?.length || 0 }, req);
    if (rows?.length) alertAdmin('YN CORE: recovery cancelled', 'A pending recovery request was cancelled.', '/admin/core/security');
    send(res, 200, { ok: true, cancelled: rows?.length || 0 });
  }

  /* ------------------------------------------------------------------ emergency: sessions, activation, security actions */
  async function emergencyState(req, res) {
    if (!enabled) throw new HttpError(404, 'Not found');
    const uid = uidOf(req);
    const state = await getState();
    const creds = ready.keyring ? await listCreds(uid) : [];
    const pending = ready.keyring ? (await sb(`yn_core_recovery_requests?status=eq.pending&expires_at=gt.${enc(iso(now()))}&select=ready_at,expires_at&limit=1`))?.[0] || null : null;
    send(res, 200, { ready, locked: isLocked(state), finalLock: !!state?.init_locked, recoveryWindowUntil: state?.recovery_window_until || null, hasPasskey: creds.length > 0, pendingRecovery: pending, recoveryDelayMinutes: recoveryDelayMin });
  }
  async function authOptions(req, res) {
    needReady({ webauthn: true }); needCanonicalHost(req);
    const uid = uidOf(req), b = body(req);
    const purpose = String(b.purpose || '');
    if (!ALL_PURPOSES.includes(purpose)) throw new HttpError(400, 'Unknown action.');
    const slot = purpose === 'init' || purpose === 'coin_security' ? slotOf(b.slot) : null;
    if (purpose === 'init' && isLocked(await getState())) throw new HttpError(404, 'Not found');
    const creds = await listCreds(uid);
    if (!creds.length) throw new HttpError(409, 'Add a passkey first (YN CORE > Security).', { code: 'no_passkey' });
    const { id, challenge } = await newChallenge(uid, purpose, slot);
    send(res, 200, { challengeId: id, purpose, slot, publicKey: { challenge, rpId, timeout: 60000, userVerification: 'required', allowCredentials: creds.map(c => ({ type: 'public-key', id: c.credential_id, transports: c.transports || undefined })) } });
  }
  async function authVerify(req, res) {
    needReady({ webauthn: true }); needCanonicalHost(req);
    const b = body(req);
    const { uid, row, cred } = await verifyUser(req, { challengeId: b.challengeId, credential: b.credential, purpose: null });
    if (!SESSION_PURPOSES.includes(row.purpose)) throw new HttpError(400, 'Use the recovery screen for this action.');
    if (row.purpose === 'init' && isLocked(await getState())) throw new HttpError(404, 'Not found');
    await sb(`yn_core_emergency_sessions?user_id=eq.${uid}&consumed_at=is.null&revoked_at=is.null`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ revoked_at: iso(now()), revoke_reason: 'superseded' }) });
    const token = newToken();
    const expiresAt = iso(now() + SESSION_MS);
    await sb('yn_core_emergency_sessions', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ session_hmac: keyring.current('session', token), user_id: uid, credential_id: cred.credential_id, scope: row.purpose, slot: row.slot, expires_at: expiresAt }) });
    audit(uid, 'session.open', row.slot, 'ok', { scope: row.purpose }, req);
    send(res, 200, { sessionToken: token, scope: row.purpose, slot: row.slot, expiresAt });
  }
  async function endSession(req, res) {
    needReady();
    const token = hdr(req, 'x-yn-emergency');
    if (isToken(token)) await sb(`yn_core_emergency_sessions?session_hmac=eq.${keyring.current('session', token)}&user_id=eq.${uidOf(req)}&revoked_at=is.null`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ revoked_at: iso(now()), revoke_reason: 'ended' }) });
    send(res, 200, { ok: true });
  }

  const sessionError = () => new HttpError(401, 'Fresh passkey authentication required. Authenticate again.', { code: 'step_up' });
  async function activateCoin(req, res) {
    needReady({ webauthn: true }); needCanonicalHost(req);
    const slot = slotOf(req.params?.slot), uid = uidOf(req), b = body(req);
    const sessionToken = hdr(req, 'x-yn-emergency');
    if (!isToken(sessionToken)) throw sessionError();
    if (isLocked(await getState())) throw new HttpError(404, 'Not found');
    const label = String(b.label || '').trim().slice(0, 60);
    const policy = b.policy === 'interstitial' ? 'interstitial' : 'redirect';
    let destUrl = null;
    if (b.destination_url) { try { destUrl = validateDestinationUrl(b.destination_url, { allowedHosts }); } catch (e) { throw new HttpError(400, e.message); } }
    const token = newToken();
    const r = await sb('rpc/yn_core_activate_coin', { method: 'POST', body: JSON.stringify({
      p_session_hmac: keyring.current('session', sessionToken), p_slot: slot, p_user: uid, p_token_hmac: keyring.current('token', token), p_key_id: keyring.currentId,
      p_label: label, p_policy: policy, p_dest_url: destUrl, p_dest_label: String(b.destination_label || '').slice(0, 60) || null }) });
    if (!r?.ok) {
      if (r?.error === 'locked') throw new HttpError(404, 'Not found');
      if (r?.error === 'already_active') throw new HttpError(409, 'This coin is already active. Use regenerate in YN CORE > coin > Security.');
      throw sessionError();
    }
    alertAdmin(`YN CORE: coin 0${slot} activated`, r.final_lock ? `Coin 0${slot} activated. All five coins are active: YN EMERGENCY is now locked.` : `Coin 0${slot} was activated.`);
    // The URL below exists only in this response. Nothing stores it; the browser shows it once.
    send(res, 200, { ok: true, slot, url: tokenUrl(token), generation: r.generation, finalLock: !!r.final_lock, sessionEnded: true });
  }
  async function regenerateToken(req, res) {
    needReady({ webauthn: true }); needCanonicalHost(req);
    const slot = slotOf(req.params?.slot), uid = uidOf(req), b = body(req);
    const sessionToken = hdr(req, 'x-yn-emergency');
    if (!isToken(sessionToken)) throw sessionError();
    const token = newToken();
    const grace = Math.min(Math.max(Math.round(Number(b.grace_minutes) || 0), 0), 60 * 24 * 30);
    const r = await sb('rpc/yn_core_regenerate_token', { method: 'POST', body: JSON.stringify({ p_session_hmac: keyring.current('session', sessionToken), p_slot: slot, p_user: uid, p_token_hmac: keyring.current('token', token), p_key_id: keyring.currentId, p_grace_minutes: grace }) });
    if (!r?.ok) { if (r?.error === 'not_active') throw new HttpError(409, 'This coin is not active.'); throw sessionError(); }
    alertAdmin(`YN CORE: coin 0${slot} URL regenerated`, grace ? `The old URL keeps working for ${grace} minutes.` : 'The old URL stopped working immediately.');
    send(res, 200, { ok: true, slot, url: tokenUrl(token), generation: r.generation, graceMinutes: r.grace_minutes, sessionEnded: true });
  }
  async function revokeCoin(req, res) {
    needReady({ webauthn: true }); needCanonicalHost(req);
    const slot = slotOf(req.params?.slot), uid = uidOf(req), b = body(req);
    const sessionToken = hdr(req, 'x-yn-emergency');
    if (!isToken(sessionToken)) throw sessionError();
    const r = await sb('rpc/yn_core_revoke_coin', { method: 'POST', body: JSON.stringify({ p_session_hmac: keyring.current('session', sessionToken), p_slot: slot, p_user: uid, p_reason: String(b.reason || '').slice(0, 120) || null }) });
    if (!r?.ok) { if (r?.error === 'not_active') throw new HttpError(409, 'This coin is not active.'); throw sessionError(); }
    alertAdmin(`YN CORE: coin 0${slot} revoked`, 'Every URL of this coin stopped working.');
    send(res, 200, { ok: true, slot, sessionEnded: true });
  }
  async function manualLock(req, res) {
    needReady();
    const uid = uidOf(req);
    await sb('yn_core_state?id=eq.1', { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ init_locked: true, init_locked_at: iso(now()), recovery_window_until: null, recovery_window_by: null, updated_at: iso(now()) }) });
    audit(uid, 'init.lock', null, 'ok', { manual: true }, req);
    send(res, 200, { ok: true, locked: true });
  }

  /* ------------------------------------------------------------------ recovery (passkey + offline code + cooling-off delay) */
  async function recoveryStart(req, res) {
    needReady({ webauthn: true }); needCanonicalHost(req);
    const b = body(req);
    const { uid } = await verifyUser(req, { challengeId: b.challengeId, credential: b.credential, purpose: 'recover' });
    const pend = await sb(`yn_core_recovery_requests?status=eq.pending&expires_at=gt.${enc(iso(now()))}&select=id,ready_at&limit=1`);
    if (pend?.length) throw new HttpError(409, 'A recovery request is already waiting.', { readyAt: pend[0].ready_at });
    const code = normalizeRecoveryCode(b.code);
    const hashes = code.length === 20 ? keyring.all('recovery', code).map(x => x.hmac) : [];
    const used = hashes.length ? await sb(`yn_core_recovery_codes?user_id=eq.${uid}&used_at=is.null&code_hmac=in.(${hashes.join(',')})`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ used_at: iso(now()) }) }) : [];
    if (!used?.length) {
      shield?.strike?.(req.sec?.ip || 'unknown', 'core_recovery_code_fail', 4, { method: req.method, path: '/api/emergency/recovery/start', userId: uid });
      audit(uid, 'recovery.start', null, 'denied', { why: 'bad code' }, req);
      throw new HttpError(401, 'That recovery code is not valid.');
    }
    const readyAt = iso(now() + recoveryDelayMin * MIN), expiresAt = iso(now() + recoveryDelayMin * MIN + 24 * 3600000);
    await sb('yn_core_recovery_requests', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: uid, ready_at: readyAt, expires_at: expiresAt }) });
    audit(uid, 'recovery.start', null, 'ok', { readyAt }, req);
    alertAdmin('YN CORE: recovery requested', `Someone started recovery with a passkey and a recovery code. It can be opened after ${readyAt}. If this was not you, open YN CORE > Security and cancel it.`, '/admin/core/security');
    send(res, 200, { ok: true, readyAt, expiresAt });
  }
  async function recoveryOpen(req, res) {
    needReady({ webauthn: true }); needCanonicalHost(req);
    const b = body(req);
    const { uid } = await verifyUser(req, { challengeId: b.challengeId, credential: b.credential, purpose: 'recover_open' });
    const r = await sb('rpc/yn_core_recovery_open', { method: 'POST', body: JSON.stringify({ p_user: uid, p_window_minutes: recoveryWindowMin }) });
    if (!r?.ok) {
      const pend = (await sb(`yn_core_recovery_requests?user_id=eq.${uid}&status=eq.pending&select=ready_at&limit=1`))?.[0];
      throw new HttpError(403, pend ? 'Recovery is not ready yet. Wait for the cooling-off delay to finish.' : 'Start recovery first.', { readyAt: pend?.ready_at || null });
    }
    alertAdmin('YN CORE: YN EMERGENCY reopened', `Recovery completed. Initialization is open until ${r.until}.`, '/admin/core/security');
    send(res, 200, { ok: true, until: r.until });
  }

  /* ------------------------------------------------------------------ page gate + wiring */
  /** /admin/emergency[/...] : once locked the page does not exist (404), even for a direct visit. The source stays in the build. */
  async function pageGate(req, res, next) {
    if (!enabled || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
    if (/^\/recover(\/|$)/.test(req.path)) return next();          // the recovery screen stays reachable; it needs passkey + code
    const locked = isLocked(await getState());                      // unreachable database => locked (fail closed)
    if (locked) { res.setHeader('Cache-Control', 'no-store'); return res.status(404).type('text/plain').send('Not found'); }
    res.setHeader('Cache-Control', 'no-store');
    return next();
  }
  function originGate(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', publicUrl || 'null');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-YN-Emergency');
    const o = hdr(req, 'origin');
    if (o && !origins.includes(o)) return send(res, 403, { error: 'Origin not allowed.' });
    next();
  }
  const offGate = (req, res, next) => (enabled ? next() : send(res, 404, { error: 'Not found' }));

  const A = '/api/admin/core', E = '/api/emergency';
  const routes = [
    { method: 'get', path: '/nfc/:token', handler: resolveTap, limit: ['nfc', 60] },
    { method: 'get', path: `${A}/overview`, handler: wrap('overview', overview) },
    { method: 'get', path: `${A}/coins/:slot`, handler: wrap('coin', getCoin) },
    { method: 'post', path: `${A}/coins/:slot/update`, handler: wrap('coin.patch', patchCoin), body: true },
    { method: 'post', path: `${A}/coins/:slot/pause`, handler: wrap('pause', setStatus('active', 'paused', 'pause')) },
    { method: 'post', path: `${A}/coins/:slot/resume`, handler: wrap('resume', setStatus('paused', 'active', 'resume')) },
    { method: 'post', path: `${A}/coins/:slot/destinations`, handler: wrap('dest.add', addDestination), body: true },
    { method: 'post', path: `${A}/coins/:slot/destinations/:id/update`, handler: wrap('dest.update', updateDestination), body: true },
    { method: 'post', path: `${A}/coins/:slot/destinations/:id/delete`, handler: wrap('dest.delete', deleteDestination) },
    { method: 'get', path: `${A}/coins/:slot/analytics`, handler: wrap('analytics', analytics) },
    { method: 'get', path: `${A}/coins/:slot/logs`, handler: wrap('logs', tapLogs) },
    { method: 'get', path: `${A}/audit`, handler: wrap('audit', auditLog) },
    { method: 'get', path: `${A}/passkeys`, handler: wrap('passkeys', listPasskeys) },
    { method: 'post', path: `${A}/passkeys/register/options`, handler: wrap('reg.options', registerOptions), body: true },
    { method: 'post', path: `${A}/passkeys/register/verify`, handler: wrap('reg.verify', registerVerify), body: true },
    { method: 'post', path: `${A}/passkeys/:id/delete`, handler: wrap('passkey.delete', deletePasskey) },
    { method: 'post', path: `${A}/recovery-codes/regenerate`, handler: wrap('codes', regenerateCodes) },
    { method: 'post', path: `${A}/recovery/cancel`, handler: wrap('recovery.cancel', cancelRecovery) },
    { method: 'get', path: `${E}/state`, handler: wrap('state', emergencyState) },
    { method: 'post', path: `${E}/auth/options`, handler: wrap('auth.options', authOptions), body: true },
    { method: 'post', path: `${E}/auth/verify`, handler: wrap('auth.verify', authVerify), body: true },
    { method: 'post', path: `${E}/session/end`, handler: wrap('session.end', endSession) },
    { method: 'post', path: `${E}/coins/:slot/activate`, handler: wrap('activate', activateCoin), body: true },
    { method: 'post', path: `${E}/coins/:slot/regenerate`, handler: wrap('regenerate', regenerateToken), body: true },
    { method: 'post', path: `${E}/coins/:slot/revoke`, handler: wrap('revoke', revokeCoin), body: true },
    { method: 'post', path: `${E}/lock`, handler: wrap('lock', manualLock) },
    { method: 'post', path: `${E}/recovery/start`, handler: wrap('recovery.start', recoveryStart), body: true },
    { method: 'post', path: `${E}/recovery/open`, handler: wrap('recovery.open', recoveryOpen), body: true },
  ];

  /** Registers everything on an Express app. Call it AFTER the `/api/admin` default-deny middleware and BEFORE static files / the SPA catch-all. */
  function mount(app, { json, express }) {
    app.use('/admin/emergency', (req, res, next) => pageGate(req, res, next).catch(() => { res.status(404).type('text/plain').send('Not found'); }));
    app.use(A, offGate, originGate);
    app.use(E, offGate, originGate, async (req, res, next) => {
      if (req.method === 'OPTIONS') return next();
      if (!requireAdmin) return send(res, 503, { error: 'Admin check unavailable.' });
      const admin = await requireAdmin(req, res);
      if (admin) { req.admin = admin; next(); }
    });
    for (const r of routes) {
      const mw = [];
      if (r.limit && shield?.limiter) mw.push(shield.limiter(r.limit[0], r.limit[1]));
      if (r.body) mw.push(json);
      app[r.method](r.path, ...mw, r.handler);
    }
  }

  let timers = [];
  function start() {
    if (!enabled || !keyring.ready) return;
    const tick = () => sb('rpc/yn_core_housekeeping', { method: 'POST', body: '{}' }).catch(() => {});
    timers = [setInterval(tick, 24 * 3600 * 1000), setTimeout(tick, 90000)];
    timers.forEach(t => t.unref?.());
  }
  const stop = () => { timers.forEach(t => { clearInterval(t); clearTimeout(t); }); timers = []; };

  return { enabled, ready, keyring, routes, mount, start, stop, getState, isLocked, pageGate, originGate, config: { rpId, origins, publicUrl, recoveryDelayMin, recoveryWindowMin } };
}
