// Destination URL validation. Destinations are set by admins only, but a typo or a hijacked admin session must not be able
// to turn an NFC coin into a phishing link or an internal-network probe.
import net from 'node:net';

const BAD_HOST = /(^|\.)(localhost|local|internal|lan|home|corp|intranet)$/i;

/** Returns the normalized https URL, or throws Error(message) with a message that is safe to show the admin. */
export function validateDestinationUrl(input, { allowedHosts = [] } = {}) {
  const raw = String(input ?? '').trim();
  if (!raw || raw.length > 2000) throw new Error('Enter a destination address (max 2000 characters).');
  if (/[\u0000-\u001f\u007f\s]/.test(raw)) throw new Error('The address contains spaces or control characters.');
  let u;
  try { u = new URL(raw); } catch { throw new Error('That is not a valid web address.'); }
  if (u.protocol !== 'https:') throw new Error('Only https:// addresses are allowed.');
  if (u.username || u.password) throw new Error('Addresses with a user name or password are not allowed.');
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || BAD_HOST.test(host) || net.isIP(host.replace(/^\[|\]$/g, '')) || host.startsWith('[')) {
    throw new Error('Use a public website name (no IP addresses, localhost or internal names).');
  }
  if (u.port && u.port !== '443') throw new Error('Custom ports are not allowed.');
  if (allowedHosts.length && !allowedHosts.some(h => host === h || host.endsWith('.' + h))) {
    throw new Error('That website is not on the allowed list (YN_CORE_ALLOWED_HOSTS).');
  }
  return u.href;
}

export const parseHostList = s => String(s || '').split(/[\s,]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
