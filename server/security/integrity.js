// Order price integrity. The browser computes unit prices, totals and fees and writes them straight into `orders` /
// `order_items`, and the payment code later trusts `orders.total`. This check asks the DATABASE (function
// yn_check_order_integrity, see supabase-security-hardening.sql) whether the order is consistent with real product prices.
//   mode "report"  (default): log + alert, never block   -> safe to switch on first, shows false positives
//   mode "enforce"          : refuse to create a payment QR / mark the order paid when the check fails
// If the SQL function is not installed yet, this fails OPEN (payments keep working exactly as before).
export function createIntegrity({ sb, store, alerts, log = console }) {
  let warned = false;
  /** @returns {Promise<{ok:boolean, mode?:string, skipped?:boolean, detail?:any}>} ok=false only in enforce mode on a failed check. */
  async function check(order, req, where = '') {
    try {
      const r = await sb('rpc/yn_check_order_integrity', { method: 'POST', body: JSON.stringify({ p_order_id: order.id }) });
      if (!r || r.ok !== false) return { ok: true };
      const mode = await store.getSetting('integrity_mode', 'report');
      store.log({ ip: req?.sec?.ip, type: 'order_integrity', severity: 'high', action: mode === 'enforce' ? 'blocked' : 'logged', method: req?.method, path: where, details: { order_id: order.id, ...r } });
      alerts?.integrity(order, r, mode);
      return { ok: mode !== 'enforce', mode, detail: r };
    } catch (e) {
      if (!warned) { warned = true; log.warn('[security] order integrity check unavailable (run supabase-security-hardening.sql):', String(e?.message || e).slice(0, 120)); }
      return { ok: true, skipped: true };
    }
  }
  return { check };
}
