// Coin URL checks shared by the "Write coin" page and its tests. A coin URL is https://<site>/nfc/<43 base64url characters>.
// The token is a secret capability, so nothing here logs it, and `masked` is the only form meant for the screen.

export const COIN_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** Checks text pasted or read from a sticker. `origin` (optional) is this site's origin, used to flag a URL for another website. */
export function parseCoinUrl(input, origin = '') {
  const raw = String(input ?? '').trim();
  if (!raw) return { ok: false, error: 'Paste the coin address first.' };
  if (raw.length > 300 || /[\u0000-\u001f\u007f\s]/.test(raw)) return { ok: false, error: 'That does not look like a coin address (spaces or extra text).' };
  let u;
  try { u = new URL(raw); } catch { return { ok: false, error: 'That is not a valid web address.' }; }
  if (u.protocol !== 'https:') return { ok: false, error: 'A coin address must start with https://' };
  if (u.username || u.password || (u.port && u.port !== '443')) return { ok: false, error: 'A coin address has no user name, password or port.' };
  if (u.search || u.hash) return { ok: false, error: 'A coin address has nothing after the token (no ? or #).' };
  const m = /^\/nfc\/([^/]+)$/.exec(u.pathname);
  if (!m || !COIN_TOKEN_RE.test(m[1])) return { ok: false, error: 'Expected https://your-site/nfc/ followed by the 43-character token. Copy it again from the one-time screen.' };
  const token = m[1];
  let sameOrigin = true;
  if (origin) { try { sameOrigin = new URL(origin).host === u.host; } catch { sameOrigin = true; } }
  return { ok: true, url: `https://${u.host}/nfc/${token}`, host: u.host, token, masked: `https://${u.host}/nfc/${token.slice(0, 4)}…${token.slice(-4)}`, sameOrigin };
}

/** The same address as `parseCoinUrl(...).url`, or '' when the text is not a coin address. Used to compare a pasted URL with a tag read back. */
export const normalizeCoinUrl = (input) => { const r = parseCoinUrl(input); return r.ok ? r.url : ''; };

/** A masked form of any text that contains a coin address; used for showing what is on a sticker that is not the one we expect. */
export function maskCoinText(text) {
  const r = parseCoinUrl(text);
  if (r.ok) return r.masked;
  const s = String(text ?? '');
  return s.length > 60 ? s.slice(0, 40) + '…' : s;
}
