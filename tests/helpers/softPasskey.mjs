// A tiny software WebAuthn authenticator for tests (ES256, user verification on). It builds exactly what a browser would
// send back from navigator.credentials.create()/get(), so server/core/webauthn.js is exercised with real signatures.
import crypto from 'node:crypto';

const b64u = b => Buffer.from(b).toString('base64url');
const sha256 = v => crypto.createHash('sha256').update(v).digest();

function head(major, n) {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 256) return Buffer.from([(major << 5) | 24, n]);
  if (n < 65536) { const b = Buffer.alloc(3); b[0] = (major << 5) | 25; b.writeUInt16BE(n, 1); return b; }
  const b = Buffer.alloc(5); b[0] = (major << 5) | 26; b.writeUInt32BE(n, 1); return b;
}
export function cborEncode(v) {
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === 'string') { const s = Buffer.from(v); return Buffer.concat([head(3, s.length), s]); }
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [cborEncode(k), cborEncode(x)])]);
  if (Array.isArray(v)) return Buffer.concat([head(4, v.length), ...v.map(cborEncode)]);
  throw new Error('cbor encode: unsupported');
}

export function makeAuthenticator({ rpId, origin, counter = 0 } = {}) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const credId = crypto.randomBytes(32);
  const jwk = publicKey.export({ format: 'jwk' });
  const a = {
    rpId, origin, counter, credId, rawId: b64u(credId),
    create(options, o = {}) {
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin: o.origin ?? origin, crossOrigin: false }));
      const cose = new Map([[1, 2], [3, o.alg ?? -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]);
      const cnt = Buffer.alloc(4); cnt.writeUInt32BE(a.counter);
      const idLen = Buffer.alloc(2); idLen.writeUInt16BE(credId.length);
      const flags = o.flags ?? 0x45;                                   // UP + UV + AT
      const authData = Buffer.concat([sha256(o.rpId ?? rpId), Buffer.from([flags]), cnt, Buffer.alloc(16), idLen, credId, cborEncode(cose)]);
      const attestationObject = cborEncode(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));
      return { id: a.rawId, rawId: a.rawId, type: 'public-key', transports: ['internal'], response: { clientDataJSON: b64u(clientDataJSON), attestationObject: b64u(attestationObject) } };
    },
    get(options, o = {}) {
      a.counter = o.counter ?? a.counter + 1;
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: o.challenge ?? options.challenge, origin: o.origin ?? origin, crossOrigin: false }));
      const cnt = Buffer.alloc(4); cnt.writeUInt32BE(a.counter);
      const authData = Buffer.concat([sha256(o.rpId ?? rpId), Buffer.from([o.flags ?? 0x05]), cnt]);   // UP + UV
      let signature = crypto.sign('sha256', Buffer.concat([authData, sha256(clientDataJSON)]), privateKey);
      if (o.badSignature) signature = Buffer.from(signature.map(x => x ^ 0xff));
      return { id: a.rawId, rawId: a.rawId, type: 'public-key', response: { clientDataJSON: b64u(clientDataJSON), authenticatorData: b64u(authData), signature: b64u(signature), userHandle: null } };
    },
  };
  return a;
}
