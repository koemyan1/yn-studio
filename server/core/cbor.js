// Minimal CBOR decoder: only what WebAuthn needs (attestation objects and COSE keys).
// Definite lengths only, bounded depth and size. Returns [value, bytesConsumed].
const MAX_DEPTH = 8;
const MAX_ITEMS = 256;

function readArg(buf, pos, ai) {
  if (ai < 24) return [ai, pos];
  if (ai === 24) return [buf.readUInt8(pos), pos + 1];
  if (ai === 25) return [buf.readUInt16BE(pos), pos + 2];
  if (ai === 26) return [buf.readUInt32BE(pos), pos + 4];
  if (ai === 27) {
    const n = buf.readBigUInt64BE(pos);
    if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('cbor: integer too large');
    return [Number(n), pos + 8];
  }
  throw new Error('cbor: indefinite or reserved length not supported');
}

function item(buf, pos, depth) {
  if (depth > MAX_DEPTH) throw new Error('cbor: too deep');
  if (pos >= buf.length) throw new Error('cbor: truncated');
  const head = buf[pos++];
  const major = head >> 5, ai = head & 31;
  let n;
  [n, pos] = readArg(buf, pos, ai);
  switch (major) {
    case 0: return [n, pos];
    case 1: return [-1 - n, pos];
    case 2: case 3: {
      if (pos + n > buf.length) throw new Error('cbor: truncated');
      const s = buf.subarray(pos, pos + n);
      return [major === 2 ? Buffer.from(s) : s.toString('utf8'), pos + n];
    }
    case 4: {
      if (n > MAX_ITEMS) throw new Error('cbor: array too long');
      const out = [];
      for (let i = 0; i < n; i++) { let v; [v, pos] = item(buf, pos, depth + 1); out.push(v); }
      return [out, pos];
    }
    case 5: {
      if (n > MAX_ITEMS) throw new Error('cbor: map too large');
      const out = new Map();
      for (let i = 0; i < n; i++) {
        let k, v; [k, pos] = item(buf, pos, depth + 1); [v, pos] = item(buf, pos, depth + 1);
        out.set(k, v);
      }
      return [out, pos];
    }
    case 7:
      if (ai === 20) return [false, pos];
      if (ai === 21) return [true, pos];
      if (ai === 22 || ai === 23) return [null, pos];
      throw new Error('cbor: unsupported simple value');
    default: throw new Error('cbor: unsupported type');
  }
}

export function decodeCbor(buf, start = 0) { return item(buf, start, 0); }
