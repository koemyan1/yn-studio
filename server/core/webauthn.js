// WebAuthn (passkey) verification, written against the W3C spec with node:crypto only (no npm package needed).
//
//   * Algorithm: ES256 (ECDSA P-256 / SHA-256), COSE alg -7. Face ID / Touch ID, Android, Windows Hello and security
//     keys all support it. Anything else is refused (fail closed).
//   * User verification is REQUIRED: the authenticator data must carry the UV flag, i.e. the device itself checked the
//     person (Face ID, Touch ID, fingerprint, PIN). The server only ever sees a signature, never biometric data.
//   * Attestation is "none": we do not try to prove which device model made the key (privacy), we only keep its public key.
//   * Origin and RP ID are exact matches against the server's configured canonical address.
//   * Signature counters must increase when an authenticator uses them (clone detection). Synced passkeys that always
//     report 0 are allowed.
import crypto from 'node:crypto';
import { decodeCbor } from './cbor.js';
import { b64u, fromB64u, sha256 } from './crypto.js';

export class WebAuthnError extends Error {
  constructor(message) { super(message); this.name = 'WebAuthnError'; }
}
const fail = m => { throw new WebAuthnError(m); };

function parseClientData(raw, expectedType, expectedChallenge, origins) {
  let cd;
  try { cd = JSON.parse(raw.toString('utf8')); } catch { fail('clientDataJSON is not valid JSON'); }
  if (cd.type !== expectedType) fail('wrong ceremony type');
  if (typeof cd.challenge !== 'string' || cd.challenge !== expectedChallenge) fail('challenge mismatch');
  if (!origins.includes(cd.origin)) fail('origin not allowed');
  if (cd.crossOrigin === true) fail('cross-origin ceremony refused');
  return cd;
}

function parseAuthData(authData, rpId, { needAttested }) {
  if (!Buffer.isBuffer(authData) || authData.length < 37) fail('authenticator data too short');
  if (!authData.subarray(0, 32).equals(sha256(rpId))) fail('RP ID hash mismatch');
  const flags = authData[32];
  const out = {
    up: !!(flags & 0x01), uv: !!(flags & 0x04), be: !!(flags & 0x08), bs: !!(flags & 0x10), at: !!(flags & 0x40),
    signCount: authData.readUInt32BE(33),
  };
  if (!out.up) fail('user presence flag missing');
  if (!out.uv) fail('user verification flag missing (Face ID / fingerprint / PIN is required)');
  if (needAttested && !out.at) fail('no attested credential data');
  return out;
}

/** Verify navigator.credentials.create() output. Returns what must be stored. */
export function verifyRegistration({ credential, expectedChallenge, rpId, origins }) {
  const r = credential?.response || {};
  if (credential?.type !== 'public-key') fail('not a public-key credential');
  const clientDataJSON = fromB64u(r.clientDataJSON);
  parseClientData(clientDataJSON, 'webauthn.create', expectedChallenge, origins);

  let att;
  try { [att] = decodeCbor(fromB64u(r.attestationObject)); } catch (e) { fail('bad attestation object: ' + e.message); }
  const authData = att instanceof Map ? att.get('authData') : null;
  const parsed = parseAuthData(authData, rpId, { needAttested: true });

  let pos = 37 + 16;                                   // rpIdHash+flags+counter, then AAGUID
  if (authData.length < pos + 2) fail('truncated credential data');
  const aaguid = authData.subarray(37, 53).toString('hex');
  const idLen = authData.readUInt16BE(pos); pos += 2;
  if (idLen < 16 || idLen > 1023 || authData.length < pos + idLen) fail('bad credential id');
  const credentialId = authData.subarray(pos, pos + idLen); pos += idLen;
  if (!credentialId.equals(fromB64u(credential.rawId))) fail('credential id mismatch');

  let cose;
  try { [cose] = decodeCbor(authData, pos); } catch (e) { fail('bad COSE key: ' + e.message); }
  if (!(cose instanceof Map)) fail('bad COSE key');
  if (cose.get(1) !== 2 || cose.get(3) !== -7 || cose.get(-1) !== 1) fail('only ES256 (P-256) passkeys are supported');
  const x = cose.get(-2), y = cose.get(-3);
  if (!Buffer.isBuffer(x) || !Buffer.isBuffer(y) || x.length !== 32 || y.length !== 32) fail('bad public key');
  let spki;
  try {
    spki = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(x), y: b64u(y) }, format: 'jwk' })
      .export({ type: 'spki', format: 'der' });
  } catch { fail('public key is not a valid P-256 point'); }

  return {
    credentialId: b64u(credentialId),
    publicKey: b64u(spki),
    signCount: parsed.signCount,
    aaguid,
    backedUp: parsed.be,
    deviceType: parsed.be || parsed.bs ? 'multiDevice' : 'singleDevice',
    transports: Array.isArray(credential.transports) ? credential.transports.filter(t => typeof t === 'string').slice(0, 6) : [],
  };
}

/** Verify navigator.credentials.get() output against a stored credential. Returns the new counter. */
export function verifyAssertion({ credential, expectedChallenge, rpId, origins, stored }) {
  const r = credential?.response || {};
  if (credential?.type !== 'public-key') fail('not a public-key credential');
  const clientDataJSON = fromB64u(r.clientDataJSON);
  parseClientData(clientDataJSON, 'webauthn.get', expectedChallenge, origins);
  const authData = fromB64u(r.authenticatorData);
  const parsed = parseAuthData(authData, rpId, { needAttested: false });

  let key;
  try { key = crypto.createPublicKey({ key: fromB64u(stored.publicKey), format: 'der', type: 'spki' }); } catch { fail('stored key is unreadable'); }
  const signed = Buffer.concat([authData, sha256(clientDataJSON)]);
  let ok = false;
  try { ok = crypto.verify('sha256', signed, key, fromB64u(r.signature)); } catch { ok = false; }
  if (!ok) fail('signature check failed');

  const old = Number(stored.signCount || 0);
  if ((old > 0 || parsed.signCount > 0) && parsed.signCount <= old) fail('signature counter did not increase (possible cloned authenticator)');
  return { signCount: parsed.signCount, backedUp: parsed.be };
}
