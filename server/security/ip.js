// Client-IP resolution that is safe behind Render + Cloudflare.
// Rule: walk the X-Forwarded-For chain from the RIGHT, skipping hops we trust (private ranges, Cloudflare edge,
// anything in TRUSTED_PROXY_CIDRS). The first untrusted address is the client. Anything an attacker prepends to
// X-Forwarded-For sits to the LEFT of the real client and is therefore ignored.
import net from 'node:net';

// Cloudflare edge ranges (https://www.cloudflare.com/ips/). They rarely change; re-check twice a year.
export const CLOUDFLARE_RANGES = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
  '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
];
const PRIVATE_RANGES = [
  '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8', '169.254.0.0/16', '100.64.0.0/10', '0.0.0.0/8',
  '::1/128', 'fc00::/7', 'fe80::/10', '::/128',
];

function parseV4(ip) {
  const p = ip.split('.');
  if (p.length !== 4) return null;
  let n = 0n;
  for (const s of p) {
    if (!/^\d{1,3}$/.test(s) || Number(s) > 255) return null;
    n = (n << 8n) | BigInt(Number(s));
  }
  return n;
}
function parseV6(input) {
  let s = input.split('%')[0].toLowerCase();
  if (s.includes('.')) {
    const i = s.lastIndexOf(':');
    const v4 = parseV4(s.slice(i + 1));
    if (v4 === null) return null;
    s = s.slice(0, i + 1) + ((v4 >> 16n) & 0xffffn).toString(16) + ':' + (v4 & 0xffffn).toString(16);
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  let groups;
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    groups = [...head, ...Array(missing).fill('0'), ...tail];
  } else groups = head;
  if (groups.length !== 8) return null;
  let n = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    n = (n << 16n) | BigInt(parseInt(g, 16));
  }
  return n;
}
/** Clean up an address taken from a header: strip port / brackets / ::ffff: prefix. Returns '' when it is not an IP. */
export function normalizeIp(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  const br = /^\[([^\]]+)\](?::\d+)?$/.exec(s);
  if (br) s = br[1];
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(s)) s = s.slice(0, s.lastIndexOf(':'));
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(s);
  if (mapped) s = mapped[1];
  s = s.split('%')[0];
  return net.isIP(s) ? s.toLowerCase() : '';
}
function toNum(ip) {
  if (net.isIPv4(ip)) return { bits: 32, n: parseV4(ip) };
  if (net.isIPv6(ip)) { const n = parseV6(ip); return n === null ? null : { bits: 128, n }; }
  return null;
}
export function compileCidrs(list) {
  const out = [];
  for (const c of list) {
    const [addr, p] = String(c).trim().split('/');
    const base = toNum(normalizeIp(addr));
    if (!base) continue;
    const prefix = p === undefined ? base.bits : Number(p);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > base.bits) continue;
    out.push({ bits: base.bits, shift: BigInt(base.bits - prefix), net: base.n >> BigInt(base.bits - prefix) });
  }
  return out;
}
const inRanges = (ranges, ip) => {
  const v = toNum(ip);
  return !!v && ranges.some(r => r.bits === v.bits && (v.n >> r.shift) === r.net);
};
const CF = compileCidrs(CLOUDFLARE_RANGES);
const PRIV = compileCidrs(PRIVATE_RANGES);
let EXTRA = compileCidrs(String(process.env.TRUSTED_PROXY_CIDRS || '').split(',').filter(Boolean));

export const isCloudflareIp = ip => inRanges(CF, ip);
export const isPrivateIp = ip => inRanges(PRIV, ip);
/** Infrastructure addresses we must never block (would lock out everyone behind the proxy). */
export const isTrustedInfra = ip => isCloudflareIp(ip) || isPrivateIp(ip) || inRanges(EXTRA, ip);
export const setExtraTrusted = list => { EXTRA = compileCidrs(list); };

/** Rate-limit / block key. IPv6 is grouped by /64 so an attacker cannot dodge limits by rotating inside their own prefix. */
export function ipKey(ip) {
  if (net.isIPv6(ip)) {
    const n = parseV6(ip);
    if (n !== null) return 'v6:' + (n >> 64n).toString(16);
  }
  return ip;
}

export function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map(normalizeIp).filter(Boolean);
  const peer = normalizeIp(req.socket?.remoteAddress || '');
  const chain = peer ? [...xff, peer] : xff;
  let viaCloudflare = false;
  for (let i = chain.length - 1; i >= 0; i--) {
    const ip = chain[i];
    if (isCloudflareIp(ip)) { viaCloudflare = true; continue; }
    if (isTrustedInfra(ip)) continue;
    return { ip, viaCloudflare };
  }
  // Every hop was trusted infrastructure. Only believe CF-Connecting-IP if a Cloudflare hop really is in the chain.
  const cfHeader = normalizeIp(req.headers['cf-connecting-ip']);
  if (viaCloudflare && cfHeader && !isTrustedInfra(cfHeader)) return { ip: cfHeader, viaCloudflare };
  return { ip: chain[0] || '0.0.0.0', viaCloudflare };
}
