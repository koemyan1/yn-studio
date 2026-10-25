// Admin alerts. They reuse the app's existing `notifications` table, which already fans out to phone push
// (send-push) and Telegram (telegram-alert) through your Supabase Database Webhooks => $0 and no new moving parts.
// Alerts are throttled so an attack cannot flood your phone (or your database) with notifications.
const MIN = 60000;

// "where / what" suffix for alerts, e.g.  Phnom Penh, Phnom Penh, Cambodia | Mobile · Android 14 · Chrome 126 · Samsung SM-S918B | map: https://...
const who = (geo, device) => {
  const parts = [geo?.label ? geo.label + (geo.approximate ? ' (approx.)' : '') : null, device?.summary || null, geo?.mapsUrl ? 'map: ' + geo.mapsUrl : null].filter(Boolean);
  return parts.length ? ' ' + parts.join(' | ') : '';
};

export function createAlerts({ notify, now = Date.now, log = console } = {}) {
  const last = new Map();
  const suppressed = new Map();
  function allow(key, ms) {
    const t = now();
    const prev = last.get(key);
    if (prev !== undefined && prev + ms > t) { suppressed.set(key, (suppressed.get(key) || 0) + 1); return false; }
    last.set(key, t);
    if (last.size > 300) for (const [k, v] of last) if (t - v > 3600000) last.delete(k);
    return true;
  }
  const take = key => { const n = suppressed.get(key) || 0; suppressed.delete(key); return n ? ` (+${n} similar events since the last alert)` : ''; };
  const send = (title, message, link = '/admin/security') => { try { Promise.resolve(notify(title, message, link)).catch(() => {}); } catch (e) { log.warn('[security] alert failed', e?.message); } };

  return {
    ipBlocked({ ip, reason, minutes, permanent, geo, device }) {
      if (!allow('ip_blocked', 5 * MIN)) return;
      send('Security: IP auto-blocked', `${ip} was blocked ${permanent ? 'permanently' : `for ${minutes} min`} (${reason}).${who(geo, device)}${take('ip_blocked')}`);
    },
    spike(deniedLastMinute) {
      if (!allow('spike', 15 * MIN)) return;
      send('Security: possible DDoS / scan wave', `${deniedLastMinute} requests were refused in the last minute. If the site feels slow, turn on Cloudflare "Under Attack Mode" (see docs/setup/SECURITY-SETUP.md).${take('spike')}`);
    },
    integrity(order, detail, mode) {
      if (!allow('integrity:' + order.id, 30 * MIN) || !allow('integrity', 2 * MIN)) return;
      send('Security: order price check failed', `Order ${order.order_number || order.id}: ${detail?.reason || 'mismatch'}. Mode: ${mode}. A customer may have tampered with prices.${take('integrity')}`, '/admin/orders');
    },
    adminForbidden({ ip, userId }) {
      if (!allow('admin_forbidden', 10 * MIN)) return;
      send('Security: non-admin tried the admin API', `${ip}${userId ? ` (user ${String(userId).slice(0, 8)}…)` : ''} was refused.${take('admin_forbidden')}`);
    },
  };
}
