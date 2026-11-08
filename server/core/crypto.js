// YN CORE cryptography helpers. Zero dependencies (node:crypto only).
//
//  * Coin tokens are 256-bit random values (32 bytes from the OS CSPRNG), written as 43 base64url characters.
//  * The database stores only HMAC-SHA256(pepper, "yn-core|token|" + token). A database leak alone therefore cannot be
//    used to build working NFC URLs, and the plaintext token is shown exactly once (at activation / regeneration).
//  * The pepper lives in the server environment, never in the database or the browser, and has a key id so it can be
//    rotated: add YN_CORE_PEPPER_V2, point YN_CORE_PEPPER_CURRENT at it, keep V1 until old tokens have been re-keyed
//    (a token is re-keyed automatically the next time it is tapped).
import crypto from 'node:crypto';

export const b64u = buf => Buffer.from(buf).toString('base64url');
export const fromB64u = s => Buffer.from(String(s), 'base64url');
export const sha256hex = v => crypto.createHash('sha256').update(v).digest('hex');
export const sha256 = v => crypto.createHash('sha256').update(v).digest();

/** 256-bit unpredictable token, 43 base64url characters. */
export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const isToken = t => typeof t === 'string' && TOKEN_RE.test(t);

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols, no 0/O/1/I
/** Offline recovery code: 20 symbols from a 32-letter alphabet = 100 bits, shown as XXXXX-XXXXX-XXXXX-XXXXX. */
export function newRecoveryCode() {
  const bytes = crypto.randomBytes(20);
  let s = '';
  for (const b of bytes) s += ALPHABET[b & 31];
  return s.match(/.{5}/g).join('-');
}
export const normalizeRecoveryCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export const timingSafeEqualStr = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Reads YN_CORE_PEPPER_<ID> variables. `ready` is false (fail closed) unless a current key of >= 32 characters exists. */
export function createKeyring(env = process.env) {
  const keys = new Map();
  for (const [name, value] of Object.entries(env)) {
    const m = /^YN_CORE_PEPPER_([A-Za-z0-9]{1,8})$/.exec(name);
    if (!m || m[1].toUpperCase() === 'CURRENT') continue;
    if (typeof value === 'string' && value.length >= 32) keys.set(m[1].toLowerCase(), value);
  }
  const currentId = String(env.YN_CORE_PEPPER_CURRENT || '').toLowerCase();
  const ready = keys.has(currentId);
  const mac = (id, purpose, value) => crypto.createHmac('sha256', keys.get(id)).update(`yn-core|${purpose}|${value}`).digest('hex');
  return {
    ready,
    currentId,
    ids: () => [...keys.keys()],
    /** HMAC under one key id. */
    hmac: (id, purpose, value) => mac(id, purpose, value),
    /** HMAC under the current key. */
    current: (purpose, value) => mac(currentId, purpose, value),
    /** [{ id, hmac }] under every known key, for lookups that must survive a key rotation. */
    all: (purpose, value) => [...keys.keys()].map(id => ({ id, hmac: mac(id, purpose, value) })),
    /** Privacy-friendly visitor id: different every UTC day, so visitors cannot be tracked across days. */
    ipHash: (ip, now = Date.now()) => mac(currentId, 'ip', `${new Date(now).toISOString().slice(0, 10)}|${ip || ''}`).slice(0, 16),
  };
}
