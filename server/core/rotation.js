// Server-side destination rotation. Pure functions, no I/O.
//
// An ordinary NFC sticker cannot rewrite itself, so the physical URL never changes. What changes is where the server
// sends the visitor when that URL is tapped. The choice is computed at tap time from the schedule (no cron job and no
// drift): the right destination is a pure function of the current time.
//
//   fixed     the first eligible destination (lowest priority number). Windows (dates, weekdays, daily hours) decide
//             which destinations are eligible right now, so "weekday menu / weekend menu" is just two windows.
//   interval  round-robin over the eligible destinations, one step every `rotation_interval_seconds`, counted from
//             `rotation_anchor`. Everyone tapping during the same interval lands on the same destination.
// If nothing is eligible the coin's fallback_url is used, else the tap gets a neutral "not available" page.

const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function localParts(date, tz) {
  let fmt;
  try { fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
  catch { fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
  const p = Object.fromEntries(fmt.formatToParts(date).map(x => [x.type, x.value]));
  return { weekday: WD[p.weekday] ?? 0, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}
const toMinutes = t => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

export function isEligible(d, tz, now = new Date()) {
  if (!d || d.active === false) return false;
  const t = now.getTime();
  if (d.starts_at && new Date(d.starts_at).getTime() > t) return false;
  if (d.ends_at && new Date(d.ends_at).getTime() <= t) return false;
  const local = localParts(now, tz);
  if (Array.isArray(d.weekdays) && d.weekdays.length && !d.weekdays.includes(local.weekday)) return false;
  const a = toMinutes(d.window_start), b = toMinutes(d.window_end);
  if (a !== null && b !== null && a !== b) {
    const inside = a < b ? local.minutes >= a && local.minutes < b : local.minutes >= a || local.minutes < b; // overnight windows wrap
    if (!inside) return false;
  }
  return true;
}

/** @returns {{ id: string|null, url: string, fallback?: boolean } | null} */
export function pickDestination(coin, destinations, now = new Date()) {
  const tz = coin?.rotation_tz || 'UTC';
  const eligible = (destinations || [])
    .filter(d => isEligible(d, tz, now))
    .sort((x, y) => (x.priority - y.priority) || String(x.id).localeCompare(String(y.id)));
  if (eligible.length) {
    if (coin.rotation_mode === 'interval' && eligible.length > 1) {
      const step = Math.max(60, Number(coin.rotation_interval_seconds) || 3600) * 1000;
      const anchor = new Date(coin.rotation_anchor || 0).getTime() || 0;
      const n = Math.max(0, Math.floor((now.getTime() - anchor) / step));
      const d = eligible[n % eligible.length];
      return { id: d.id, url: d.url };
    }
    return { id: eligible[0].id, url: eligible[0].url };
  }
  if (coin?.fallback_url) return { id: null, url: coin.fallback_url, fallback: true };
  return null;
}
