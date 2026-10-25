import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Ban, Bug, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { supabase } from './supabase';
import './admin-security.css';

type Shell = React.ComponentType<{ title: string; children: React.ReactNode }>;
const API_BASE: string = (((import.meta as any).env?.VITE_API_BASE_URL as string | undefined) || '').replace(/\/$/, '');

async function api(path: string, body?: any): Promise<any> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token || '';
  const r = await fetch(API_BASE + '/api/admin/security' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: 'Bearer ' + token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || 'Request failed (' + r.status + ')');
  return j;
}
const when = (iso: string) => { try { return new Date(iso).toLocaleString(); } catch { return iso; } };
const LABEL: Record<string, string> = {
  honeypot: 'Trap page probed', scanner_ua: 'Hacking tool detected', waf_sqli: 'SQL injection attempt', waf_xss: 'XSS attempt', waf_traversal: 'Path traversal attempt',
  waf_injection: 'Command/log injection attempt', waf_ssrf: 'SSRF attempt', waf_malformed: 'Malformed URL', rate_limit: 'Rate limit hit', ip_blocked: 'IP blocked', blocked_request: 'Request from blocked IP',
  bad_method: 'Odd HTTP method', uri_too_long: 'Oversized URL', unauth_admin_api: 'Admin API without login', forbidden_admin_api: 'Non-admin tried admin API', order_integrity: 'Order price check failed',
  tamper_attempt: 'Database tamper attempt', csp_violation: 'Browser script/CSP report', admin_action: 'Admin action', bad_payload: 'Malformed request body',
};
const nice = (t: string) => LABEL[t] || t;
// Approximate location (from the visitor's IP) + device, recorded by the server with every detection / block.
const safeMap = (u: any) => (typeof u === 'string' && u.startsWith('https://www.google.com/maps/') ? u : '');
function Who({ geo, device }: { geo?: any; device?: any }) {
  if (!geo && !device) return <span className="secMuted">—</span>;
  const map = safeMap(geo?.mapsUrl);
  return <div className="secWho">
    {geo && <div>{geo.tor ? 'Tor network' : geo.label || 'Unknown location'}{geo.lat != null && geo.lng != null ? <small> ({geo.lat}, {geo.lng})</small> : null}{map ? <> · <a href={map} target="_blank" rel="noopener noreferrer">Map</a></> : null}</div>}
    {device && <div className="secMuted">{device.summary || device.type}</div>}
  </div>;
}

export default function AdminSecurity({ Shell }: { Shell: Shell }) {
  const [sum, setSum] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [ip, setIp] = useState('');
  const [mins, setMins] = useState('60');
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, e, b] = await Promise.all([api('/summary'), api('/events?limit=100' + (filter ? '&type=' + encodeURIComponent(filter) : '')), api('/blocks')]);
      setSum(s); setEvents(e.events || []); setBlocks(b.blocks || []); setErr('');
    } catch (x: any) { setErr(x?.message || 'Could not load security data.'); }
  }, [filter]);
  useEffect(() => { load(); const t = window.setInterval(load, 15000); return () => window.clearInterval(t); }, [load]);

  async function act(path: string, body: any, ok: string) {
    setBusy(true); setMsg('');
    try { await api(path, body); setMsg(ok); await load(); } catch (x: any) { setMsg(x?.message || 'Failed.'); }
    setBusy(false);
  }
  const t = sum?.totals || {};
  const rt = sum?.runtime || {};
  const max = Math.max(1, ...((sum?.timeline || []).map((x: any) => x.count)));
  const mode = sum?.settings?.integrity_mode || 'report';

  return <Shell title="Security">
    <div className="secPage">
      <div className="secBar">
        <div><span className="eyebrow">PROTECTION STATUS</span><br /><small>Last 24 hours · refreshes every 15 seconds{sum ? ' · updated ' + when(sum.generatedAt) : ''}</small></div>
        <button className="secondary small" onClick={load}><RefreshCw /> Refresh</button>
      </div>
      {err && <div className="panel"><b>Could not load.</b> <span className="secMuted">{err} — the Security API lives on your Node server (not Supabase). Make sure the server is deployed with the security update.</span></div>}
      {sum && <>
        <div className="secBadges">
          <span className={'secBadge ' + (rt.shieldEnabled ? 'ok' : 'bad')}><ShieldCheck size={14} /> Shield {rt.shieldEnabled ? 'active' : 'OFF'}</span>
          <span className={'secBadge ' + (rt.cloudflareSeenRecently ? 'ok' : 'warn')}><ShieldCheck size={14} /> Cloudflare {rt.cloudflareSeenRecently ? 'detected' : 'not detected (traffic is reaching Render directly)'}</span>
          <span className={'secBadge ' + (rt.eventDatabase === 'ok' ? 'ok' : 'warn')}><Activity size={14} /> Event log: {rt.eventDatabase}</span>
          <span className={'secBadge ' + (rt.cspMode === 'enforce' ? 'ok' : 'warn')}><Bug size={14} /> Script policy (CSP): {rt.cspMode}</span>
          <span className={'secBadge ' + (mode === 'enforce' ? 'ok' : 'warn')}><ShieldAlert size={14} /> Order price check: {mode}</span>
        </div>
        <div className="stats">
          <div className="stat"><span className="statIcon"><Ban /></span><div><small>Requests refused</small><strong>{t.blockedRequests ?? 0}</strong></div></div>
          <div className="stat"><span className="statIcon"><ShieldAlert /></span><div><small>IPs auto-blocked</small><strong>{t.autoBlocks ?? 0}</strong></div></div>
          <div className="stat"><span className="statIcon"><Bug /></span><div><small>Injection attempts</small><strong>{t.injectionAttempts ?? 0}</strong></div></div>
          <div className="stat"><span className="statIcon"><Activity /></span><div><small>Probes &amp; scans</small><strong>{t.probes ?? 0}</strong></div></div>
          <div className="stat"><span className="statIcon"><Activity /></span><div><small>Rate-limit hits</small><strong>{t.rateLimited ?? 0}</strong></div></div>
          <div className="stat"><span className="statIcon"><ShieldAlert /></span><div><small>Price tampering</small><strong>{t.priceTampering ?? 0}</strong></div></div>
          <div className="stat"><span className="statIcon"><Ban /></span><div><small>Admin API abuse</small><strong>{t.adminApiAbuse ?? 0}</strong></div></div>
          <div className="stat"><span className="statIcon"><ShieldCheck /></span><div><small>Currently blocked</small><strong>{sum.activeBlocks}</strong></div></div>
        </div>

        <div className="panel">
          <h2>Activity (per hour)</h2>
          <div className="secBars" title="events per hour, oldest to newest">{sum.timeline.map((x: any) => <i key={x.hour} style={{ height: Math.max(2, Math.round((x.count / max) * 100)) + '%' }} title={when(x.hour) + ': ' + x.count} />)}</div>
        </div>

        <div className="secGrid">
          <div className="panel">
            <h2>Blocked IP addresses</h2>
            <p className="secMuted">Blocks expire automatically (15 min → 1 h → 6 h → 24 h → 7 days for repeat offenders). Real customers on shared mobile networks can be unblocked here.</p>
            <div className="secScroll"><table><thead><tr><th>IP</th><th>Reason</th><th>Until</th><th /></tr></thead><tbody>
              {blocks.map(b => <tr key={b.ip}><td><code>{b.ip}</code></td><td>{nice(b.reason)}{b.by && b.by !== 'auto' ? ' (manual)' : ''}</td><td>{b.permanent ? 'permanent' : when(b.until)}</td><td><button className="secondary small" disabled={busy} onClick={() => act('/unblock', { ip: b.ip }, 'Unblocked ' + b.ip)}>Unblock</button></td></tr>)}
              {!blocks.length && <tr><td colSpan={4} className="secMuted">No IP is blocked right now.</td></tr>}
            </tbody></table></div>
            <div className="secForm">
              <input placeholder="IP address, e.g. 203.0.113.9" value={ip} onChange={(e: any) => setIp(e.target.value)} />
              <input style={{ maxWidth: 110 }} type="number" min="1" placeholder="minutes" value={mins} onChange={(e: any) => setMins(e.target.value)} />
              <button className="small" disabled={busy || !ip.trim()} onClick={() => act('/block', { ip: ip.trim(), minutes: Number(mins) || 60, reason: 'manual block' }, 'Blocked ' + ip.trim())}>Block</button>
              <button className="secondary small" disabled={busy || !ip.trim()} onClick={() => act('/allow', { ip: ip.trim(), note: 'allow-listed from dashboard' }, 'Allow-listed ' + ip.trim() + ' (never blocked)')}>Never block</button>
            </div>
            {msg && <p className="secMuted" role="status">{msg}</p>}
          </div>

          <div className="panel">
            <h2>Top sources (24 h)</h2>
            <div className="secScroll"><table><thead><tr><th>IP</th><th>Events</th><th>What</th><th>Location &amp; device</th><th /></tr></thead><tbody>
              {sum.topIps.map((x: any) => <tr key={x.ip}><td><code>{x.ip}</code></td><td>{x.count}</td><td>{x.types.map(nice).join(', ')}</td><td><Who geo={x.geo} device={x.device} /></td><td><button className="secondary small" disabled={busy} onClick={() => act('/block', { ip: x.ip, minutes: 1440, reason: 'manual block from top sources' }, 'Blocked ' + x.ip + ' for 24 h')}>Block 24 h</button></td></tr>)}
              {!sum.topIps.length && <tr><td colSpan={5} className="secMuted">Nothing suspicious in the last 24 hours.</td></tr>}
            </tbody></table></div>
            <h2 style={{ marginTop: 18 }}>Order price check</h2>
            <p className="secMuted">Customers&apos; browsers send the prices and totals of an order themselves. This check compares every order with your real product prices before a payment QR is made or an order is marked paid.
              <b> Report</b> only logs and alerts you. <b>Enforce</b> refuses the payment. Use Report for a few days, confirm no false alarms below, then switch to Enforce.</p>
            <div className="secForm">
              <button className={mode === 'report' ? 'small' : 'secondary small'} disabled={busy || mode === 'report'} onClick={() => act('/settings', { key: 'integrity_mode', value: 'report' }, 'Order price check set to report-only')}>Report only</button>
              <button className={mode === 'enforce' ? 'small' : 'secondary small'} disabled={busy || mode === 'enforce'} onClick={() => { if (window.confirm('Enforce means a customer whose order fails the price check cannot pay for it. Continue?')) act('/settings', { key: 'integrity_mode', value: 'enforce' }, 'Order price check is now enforced'); }}>Enforce</button>
            </div>
          </div>
        </div>

        <div className="panel">
          <h2>Recent events</h2>
          <div className="secForm" style={{ marginTop: 0, marginBottom: 8 }}>
            <select value={filter} onChange={(e: any) => setFilter(e.target.value)} aria-label="Filter events">
              <option value="">All event types</option>
              {sum.byType.map((x: any) => <option key={x.type} value={x.type}>{nice(x.type)} ({x.count})</option>)}
            </select>
          </div>
          <div className="secScroll"><table><thead><tr><th>Time</th><th>Type</th><th>Level</th><th>IP</th><th>Location &amp; device</th><th>Path</th><th>×</th></tr></thead><tbody>
            {events.map((e, i) => <tr key={(e.id || i) + '-' + e.created_at}><td>{when(e.created_at)}</td><td>{nice(e.type)}</td><td><span className={'sev ' + (e.severity || 'low')}>{e.severity || 'low'}</span></td><td><code>{e.ip || '—'}</code></td><td><Who geo={e.details?.geo} device={e.details?.device} /></td><td><code>{(e.path || '').slice(0, 60)}</code></td><td>{e.count || 1}</td></tr>)}
            {!events.length && <tr><td colSpan={7} className="secMuted">No events yet.</td></tr>}
          </tbody></table></div>
        </div>
      </>}
    </div>
  </Shell>;
}
