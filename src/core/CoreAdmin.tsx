import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { KeyRound, Lock, Nfc, Pause, Play, Plus, RefreshCw, ShieldAlert, ShieldCheck, Trash2 } from './icons';
import { ApiError, coreApi, stepUp, when } from './api';
import { createPasskey, isNativeApp, passkeysSupported } from './webauthn';
import { resetCoreInit } from './useCoreInit';
import TokenReveal from './TokenReveal';
import '../admin-security.css';
import './core.css';

type Shell = React.ComponentType<{ title: string; children: React.ReactNode }>;
const A = '/api/admin/core';
const STATUS: Record<string, string> = { uninitialized: 'Not set up', active: 'Active', paused: 'Paused', revoked: 'Revoked' };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ago = (iso?: string | null) => { if (!iso) return 'never'; const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000); return s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 129600 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };

/** YN CORE admin: /admin/core (overview), /admin/core/coins/:slot, /admin/core/security. Rendered inside the normal admin shell. */
export default function CoreAdmin({ Shell }: { Shell: Shell }) {
  const loc = useLocation();
  const p = loc.pathname.replace(/\/$/, '');
  if (p.endsWith('/security')) return <Shell title="YN CORE · Security"><div className="secPage corePage"><SecurityView /></div></Shell>;
  if (/\/coins\/\d/.test(p)) return <Shell title="YN CORE · Coin"><div className="secPage corePage"><CoinView /></div></Shell>;
  return <Shell title="YN CORE"><div className="secPage corePage"><Overview /></div></Shell>;
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const run = useCallback(async (fn: () => Promise<any>, ok = '') => {
    setBusy(true); setMsg('');
    try { const r = await fn(); if (ok) setMsg(ok); return r; }
    catch (e: any) { setMsg(e instanceof ApiError && e.code === 'stale_login' ? 'For safety, sign out, sign in again with your password, then retry within 10 minutes.' : (e?.message || 'Failed.')); return undefined; }
    finally { setBusy(false); }
  }, []);
  return { busy, msg, setMsg, run };
}

/* ------------------------------------------------------------------ overview */
function Overview() {
  const [ov, setOv] = useState<any>(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    try { setOv(await coreApi(A + '/overview')); setErr(''); }
    catch (e: any) { setErr(e instanceof ApiError && e.status === 404 ? 'YN CORE is switched off. It was turned off with YN_CORE=off on the server (see docs/setup/YN-CORE-SETUP.md).' : e.message); }
  }, []);
  useEffect(() => { load(); const t = window.setInterval(load, 20000); return () => window.clearInterval(t); }, [load]);
  const r = ov?.ready;

  return <>
    <div className="secBar"><div><span className="eyebrow">NFC COINS 01–05</span><br /><small>The sticker address never changes. The server decides where each tap goes.</small></div>
      <button className="secondary small" onClick={load}><RefreshCw size={14} /> Refresh</button></div>
    {err && <div className="panel"><b>Could not load.</b> <span className="secMuted">{err}</span></div>}
    {ov && <>
      <div className="secBadges">
        <span className={'secBadge ' + (r.keyring ? 'ok' : 'bad')}><ShieldCheck size={14} /> Server secrets {r.keyring ? 'set' : 'missing'}</span>
        <span className={'secBadge ' + (r.webauthn ? 'ok' : 'bad')}><KeyRound size={14} /> Passkey address {r.webauthn ? 'set' : 'missing (PUBLIC_URL)'}</span>
        <span className={'secBadge ' + (ov.passkeys ? 'ok' : 'warn')}><KeyRound size={14} /> {ov.passkeys} passkey{ov.passkeys === 1 ? '' : 's'}{ov.passkeys === 1 ? ' (add a second device)' : ''}</span>
        <span className={'secBadge ' + (ov.recoveryCodesLeft ? 'ok' : 'warn')}><ShieldAlert size={14} /> {ov.recoveryCodesLeft} recovery codes left</span>
        <span className={'secBadge ' + (ov.finalLock ? 'ok' : 'warn')}><Lock size={14} /> {ov.finalLock ? (ov.initLocked ? 'Initialization locked' : 'Recovery window open') : 'Initialization open'}</span>
      </div>
      {ov.pendingRecovery && <div className="panel coreAlert"><b>A recovery request is pending.</b> It can be opened after {when(ov.pendingRecovery.ready_at)}. If this was not you, <Link to="/admin/core/security">cancel it now</Link>.</div>}
      {!ov.passkeys && <div className="panel"><b>Start here:</b> <Link to="/admin/core/security">add your first passkey</Link>. Face ID / Touch ID is used through your device’s own passkey sheet.</div>}
      <div className="coinGrid">
        {ov.coins.map((c: any) => <Link key={c.slot} to={'/admin/core/coins/' + c.slot} className={'coinCard ' + c.status}>
          <span className="coinNum">0{c.slot}</span>
          <b>{c.label || 'Coin 0' + c.slot}</b>
          <span className={'coinStatus ' + c.status}>{STATUS[c.status] || c.status}</span>
          {c.status === 'active' || c.status === 'paused' ? <>
            <small>{c.taps7d} tap{c.taps7d === 1 ? '' : 's'} in 7 days · last {ago(c.lastTapAt)}</small>
            <small>{c.writtenVerifiedAt ? '✓ sticker tested' : '⚠ not tapped yet: write the sticker and test it'}</small>
            {c.graceUntil && <small>Old URL still works until {when(c.graceUntil)}</small>}
          </> : <small>{c.status === 'revoked' ? 'Revoked: re-activating needs recovery' : 'Set it up in YN EMERGENCY'}</small>}
        </Link>)}
      </div>
      <div className="panel">
        <h2><Nfc size={16} /> YN EMERGENCY</h2>
        {!ov.initLocked
          ? <p>Initialization is open. <Link to="/admin/emergency">Open YN EMERGENCY</Link> to activate the remaining coins (each one needs its own passkey check).</p>
          : <p className="secMuted">Initialization is locked. Only <Link to="/admin/emergency/recover">recovery</Link> (passkey + recovery code + waiting period) can reopen it.</p>}
      </div>
      <p className="secMuted"><Link to="/admin/core/security">Security, passkeys and audit log →</Link></p>
    </>}
  </>;
}

/* ------------------------------------------------------------------ one coin */
function CoinView() {
  const { slot: s } = useParams();
  const slot = Number(s);
  const nav = useNavigate();
  const [d, setD] = useState<any>(null);
  const [an, setAn] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [days, setDays] = useState(7);
  const [err, setErr] = useState('');
  const [reveal, setReveal] = useState('');
  const [grace, setGrace] = useState(60);
  const [wd, setWd] = useState<number[]>([]);
  const { busy, msg, run } = useAction();

  const load = useCallback(async () => {
    try {
      const [coin, a, l] = await Promise.all([coreApi(`${A}/coins/${slot}`), coreApi(`${A}/coins/${slot}/analytics?days=${days}`), coreApi(`${A}/coins/${slot}/logs?limit=50`)]);
      setD(coin); setAn(a); setLogs(l.events); setErr('');
    } catch (e: any) { setErr(e.message); }
  }, [slot, days]);
  useEffect(() => { load(); }, [load]);

  if (err) return <div className="panel"><b>Could not load.</b> <span className="secMuted">{err}</span> <Link to="/admin/core">Back</Link></div>;
  if (!d) return <p className="secMuted">Loading…</p>;
  const c = d.coin;
  const live = c.status === 'active' || c.status === 'paused';
  const max = Math.max(1, ...(an?.perDay || []).map((x: any) => x.taps));
  const post = (path: string, body: any = {}, ok = 'Saved.') => run(async () => { await coreApi(`${A}/coins/${slot}${path}`, { body }); await load(); }, ok);

  async function saveSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    await post('/update', { label: f.get('label'), policy: f.get('policy'), fallback_url: String(f.get('fallback') || '') || null, rotation_mode: f.get('mode'), rotation_interval_seconds: Number(f.get('every')) * 60, rotation_tz: f.get('tz') });
  }
  async function addDest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = e.currentTarget; const g = new FormData(f);
    const body: any = { url: g.get('url'), label: g.get('label'), priority: Number(g.get('priority') || 100) };
    if (wd.length) body.weekdays = wd;
    if (g.get('ws') && g.get('we')) { body.window_start = g.get('ws'); body.window_end = g.get('we'); }
    const ok = await post('/destinations', body, 'Destination added. Taps use it right away.');
    if (ok !== undefined) { f.reset(); setWd([]); }
  }
  async function regenerate() {
    if (!confirm(`Make a new URL for coin 0${slot}? You must write it to the sticker again. ${grace ? 'The old URL keeps working for ' + grace + ' minutes.' : 'The old URL stops working immediately.'}`)) return;
    const r = await run(async () => { const st = await stepUp('coin_security', slot); return coreApi(`/api/emergency/coins/${slot}/regenerate`, { session: st.sessionToken, body: { grace_minutes: grace } }); });
    if (r) { setReveal(r.url); load(); }
  }
  async function revoke() {
    if (prompt(`Revoke coin 0${slot}? Every URL of this coin stops working for good and re-activating it needs recovery. Type REVOKE to confirm.`) !== 'REVOKE') return;
    await run(async () => { const st = await stepUp('coin_security', slot); await coreApi(`/api/emergency/coins/${slot}/revoke`, { session: st.sessionToken, body: { reason: 'revoked from admin' } }); resetCoreInit(); await load(); }, 'Coin revoked.');
  }

  return <>
    <div className="secBar"><div><Link to="/admin/core">← YN CORE</Link><br /><span className="eyebrow">COIN 0{slot} · {String(STATUS[c.status] || c.status).toUpperCase()}</span></div>
      <div className="coreBtns">
        {c.status === 'active' && <button className="secondary small" disabled={busy} onClick={() => post('/pause', {}, 'Paused: taps now show “Not found”.')}><Pause size={14} /> Pause</button>}
        {c.status === 'paused' && <button className="secondary small" disabled={busy} onClick={() => post('/resume', {}, 'Resumed.')}><Play size={14} /> Resume</button>}
        <button className="secondary small" onClick={load}><RefreshCw size={14} /> Refresh</button></div></div>
    {msg && <p className="emgMsg" role="status">{msg}</p>}
    {reveal && <TokenReveal url={reveal} slot={slot} onDone={() => setReveal('')} />}
    {!live && <div className="panel"><p>This coin is <b>{STATUS[c.status] || c.status}</b>. {c.status === 'revoked' ? 'Its URLs are dead. Re-activate it through recovery.' : <>Set it up in <Link to="/admin/emergency">YN EMERGENCY</Link>.</>}</p></div>}

    {live && <>
      <div className="stats">
        <div className="stat"><span className="statIcon"><Nfc /></span><div><small>Taps ({days} d)</small><strong>{an?.totals.taps ?? 0}</strong></div></div>
        <div className="stat"><span className="statIcon"><ShieldCheck /></span><div><small>≈ Visitors</small><strong>{an?.totals.approxVisitors ?? 0}</strong></div></div>
        <div className="stat"><span className="statIcon"><ShieldAlert /></span><div><small>Blocked taps</small><strong>{an?.totals.blocked ?? 0}</strong></div></div>
        <div className="stat"><span className="statIcon"><Nfc /></span><div><small>Crawlers ignored</small><strong>{an?.totals.bots ?? 0}</strong></div></div>
      </div>
      <div className="panel">
        <div className="secBar"><h2>Taps per day</h2><select value={days} onChange={e => setDays(Number(e.target.value))}><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select></div>
        <div className="secBars" title="taps per day, oldest to newest">{(an?.perDay || []).map((x: any) => <i key={x.day} style={{ height: Math.max(2, Math.round((x.taps / max) * 100)) + '%' }} title={x.day + ': ' + x.taps} />)}</div>
        <p className="secMuted">Last tap {ago(an?.lastTapAt)} · {an?.writtenVerifiedAt ? 'sticker tested ✓' : 'not tested yet: tap the sticker once'}{an?.truncated ? ' · showing the latest 5000 events' : ''}</p>
        <div className="secGrid">
          <div><h2>Destinations</h2>{an?.byDestination.length ? <table><tbody>{an.byDestination.map((x: any) => <tr key={x.name}><td>{x.name}</td><td>{x.count}</td></tr>)}</tbody></table> : <p className="secMuted">No taps yet.</p>}</div>
          <div><h2>Countries &amp; devices</h2><table><tbody>{[...(an?.byCountry || []), ...(an?.byDevice || [])].map((x: any) => <tr key={x.name}><td>{x.name}</td><td>{x.count}</td></tr>)}</tbody></table></div>
        </div>
      </div>

      <div className="panel">
        <h2>Where a tap goes now</h2>
        <p>{d.liveUrl ? <code>{d.liveUrl}</code> : <span className="secMuted">Nowhere: add a destination or a fallback address.</span>}</p>
        <div className="secScroll"><table><thead><tr><th>Destination</th><th>Priority</th><th>When</th><th>On</th><th /></tr></thead><tbody>
          {d.destinations.map((x: any) => <tr key={x.id} className={x.id === d.liveDestinationId ? 'coreLive' : ''}>
            <td><b>{x.label || new URL(x.url).host}</b><br /><code>{x.url}</code></td><td>{x.priority}</td>
            <td><small>{x.weekdays ? x.weekdays.map((n: number) => DAYS[n]).join(' ') : 'every day'}{x.window_start ? ` · ${String(x.window_start).slice(0, 5)}–${String(x.window_end).slice(0, 5)}` : ''}</small></td>
            <td><input type="checkbox" checked={x.active} onChange={e => run(async () => { await coreApi(`${A}/coins/${slot}/destinations/${x.id}/update`, { body: { active: e.target.checked } }); await load(); })} /></td>
            <td><button className="secondary small" aria-label="Delete destination" onClick={() => confirm('Delete this destination?') && run(async () => { await coreApi(`${A}/coins/${slot}/destinations/${x.id}/delete`, { body: {} }); await load(); })}><Trash2 size={14} /></button></td></tr>)}
        </tbody></table></div>
        <form className="secForm" onSubmit={addDest}>
          <input name="url" type="url" required placeholder="https://…" />
          <input name="label" placeholder="Label" maxLength={60} />
          <input name="priority" type="number" min={0} placeholder="Priority (1 = first)" />
          <input name="ws" type="time" title="Daily start" /><input name="we" type="time" title="Daily end" />
          <div className="coreDays">{DAYS.map((n, i) => <label key={n}><input type="checkbox" checked={wd.includes(i)} onChange={e => setWd(e.target.checked ? [...wd, i] : wd.filter(x => x !== i))} />{n}</label>)}</div>
          <button className="primary small" disabled={busy}><Plus size={14} /> Add destination</button>
        </form>
        <p className="secMuted">Only https addresses to public sites are accepted. Daily times use the time zone below.</p>
      </div>

      <div className="panel">
        <h2>Settings &amp; rotation</h2>
        <form className="coreSettings" onSubmit={saveSettings}>
          <label>Name<input name="label" defaultValue={c.label} maxLength={60} /></label>
          <label>When tapped<select name="policy" defaultValue={c.policy}><option value="redirect">Go straight to the destination</option><option value="interstitial">Show a “Continue” page first</option></select></label>
          <label>Fallback address<input name="fallback" type="url" defaultValue={c.fallback_url || ''} placeholder="https://… (used when nothing else is available)" /></label>
          <label>Rotation<select name="mode" defaultValue={c.rotation_mode}><option value="fixed">Fixed: first available destination</option><option value="interval">Rotate through the available destinations</option></select></label>
          <label>Rotate every (minutes)<input name="every" type="number" min={1} defaultValue={Math.round(c.rotation_interval_seconds / 60)} /></label>
          <label>Time zone<input name="tz" defaultValue={c.rotation_tz} placeholder="Asia/Phnom_Penh" /></label>
          <button className="primary small" disabled={busy}>Save settings</button>
        </form>
        <p className="secMuted">Rotation happens on the server when someone taps. The sticker is never rewritten.</p>
      </div>

      <div className="panel">
        <h2>Recent taps</h2>
        <div className="secScroll"><table><thead><tr><th>Time</th><th>Result</th><th>Country</th><th>Device</th><th>Visitor</th></tr></thead><tbody>
          {logs.map((x, i) => <tr key={i}><td>{when(x.ts)}</td><td>{x.bot ? 'crawler' : x.outcome}</td><td>{x.country || '—'}</td><td>{x.device || '—'}</td><td><code>{x.visitor || '—'}</code></td></tr>)}
          {!logs.length && <tr><td colSpan={5} className="secMuted">No taps yet.</td></tr>}
        </tbody></table></div>
        <p className="secMuted">“Visitor” is a daily anonymous code, not an IP address.</p>
      </div>

      <div className="panel coreDanger">
        <h2><ShieldAlert size={16} /> URL security</h2>
        <p>Current URL generation: <b>{d.tokens.find((t: any) => t.status === 'current')?.generation ?? '—'}</b>. The address itself cannot be shown again; it was displayed once when it was created.</p>
        <div className="coreBtns">
          <label className="coreInline">Old URL keeps working for <select value={grace} onChange={e => setGrace(Number(e.target.value))}><option value={0}>0 min (cut off now)</option><option value={60}>1 hour</option><option value={1440}>1 day</option><option value={10080}>7 days</option></select></label>
          <button className="secondary" disabled={busy} onClick={regenerate}><KeyRound size={14} /> Regenerate URL (passkey)</button>
          <button className="secondary dangerBtn" disabled={busy} onClick={revoke}><Lock size={14} /> Revoke coin (passkey)</button>
        </div>
        <p className="secMuted">Both actions ask for Face ID / passkey first. Regenerating means you must write the new address to the sticker.</p>
      </div>
    </>}
  </>;
}

/* ------------------------------------------------------------------ security: passkeys, recovery codes, audit */
function SecurityView() {
  const [pk, setPk] = useState<any>(null);
  const [ov, setOv] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [nick, setNick] = useState('');
  const { busy, msg, run } = useAction();
  const nav = useNavigate();
  const unsupported = isNativeApp() ? 'Passkeys do not work inside the mobile app. Open this page in Safari or Chrome.' : !passkeysSupported() ? 'This browser does not support passkeys.' : '';

  const load = useCallback(async () => {
    try { const [a, b, c] = await Promise.all([coreApi(A + '/passkeys'), coreApi(A + '/overview'), coreApi(A + '/audit?limit=60')]); setPk(a); setOv(b); setAudit(c.entries); } catch { /* shown through msg on actions */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add(attachment: 'platform' | 'cross-platform') {
    const r = await run(async () => {
      const session = pk?.passkeys.length ? (await stepUp('security')).sessionToken : undefined;
      const o = await coreApi(A + '/passkeys/register/options', { body: { attachment }, session });
      const credential = await createPasskey(o.publicKey);
      return coreApi(A + '/passkeys/register/verify', { body: { challengeId: o.challengeId, credential, nickname: nick } });
    }, 'Passkey added.');
    if (r) { setNick(''); if (r.recoveryCodes) setCodes(r.recoveryCodes); load(); }
  }
  async function remove(id: string) {
    if (!confirm('Remove this passkey?')) return;
    await run(async () => { const st = await stepUp('security'); await coreApi(`${A}/passkeys/${id}/delete`, { session: st.sessionToken, body: {} }); await load(); }, 'Passkey removed.');
  }
  async function newCodes() {
    if (!confirm('Make 10 new recovery codes? The old unused ones stop working.')) return;
    const r = await run(async () => { const st = await stepUp('security'); return coreApi(A + '/recovery-codes/regenerate', { session: st.sessionToken, body: {} }); });
    if (r) { setCodes(r.recoveryCodes); load(); }
  }
  async function lockNow() {
    if (!confirm('Lock YN EMERGENCY now? It will stay locked until recovery.')) return;
    await run(async () => { await coreApi('/api/emergency/lock', { body: {} }); resetCoreInit(); await load(); }, 'Initialization locked.');
  }
  async function cancelRecovery() { await run(async () => { await coreApi(A + '/recovery/cancel', { body: {} }); await load(); }, 'Recovery cancelled.'); }

  return <>
    <div className="secBar"><div><Link to="/admin/core">← YN CORE</Link><br /><span className="eyebrow">PASSKEYS &amp; RECOVERY</span></div><button className="secondary small" onClick={load}><RefreshCw size={14} /> Refresh</button></div>
    {msg && <p className="emgMsg" role="status">{msg}</p>}
    {unsupported && <p className="emgWarn">{unsupported}</p>}
    {ov?.pendingRecovery && <div className="panel coreAlert"><b>Recovery request pending</b> (can open after {when(ov.pendingRecovery.ready_at)}). If it was not you, cancel it. <button className="secondary small" onClick={cancelRecovery}>Cancel recovery</button></div>}

    {codes && <div className="reveal"><div className="revealHead"><b>Your recovery codes. Shown once.</b></div>
      <pre className="revealUrl">{codes.join('\n')}</pre>
      <p className="secMuted">Write them down or print them and keep them somewhere safe and offline (not in the same place as your phone). Each works once. You need one, plus a passkey, to reopen YN EMERGENCY after the final lock.</p>
      <div className="revealBtns"><button className="secondary small" onClick={() => navigator.clipboard?.writeText(codes.join('\n'))}>Copy</button><button className="primary small" onClick={() => setCodes(null)}>I saved them</button></div></div>}

    <div className="panel">
      <h2><KeyRound size={16} /> Passkeys</h2>
      <p className="secMuted">A passkey is a key held by your device. On iPhone / Mac it is unlocked with Face ID or Touch ID, on Android with fingerprint or screen lock. This site never receives your face or fingerprint. Register at least two devices.</p>
      <div className="secScroll"><table><thead><tr><th>Name</th><th>Added</th><th>Last used</th><th>Type</th><th /></tr></thead><tbody>
        {(pk?.passkeys || []).map((x: any) => <tr key={x.id}><td><b>{x.nickname}</b></td><td>{when(x.createdAt)}</td><td>{when(x.lastUsedAt)}</td><td>{x.deviceType === 'multiDevice' ? 'synced' : 'this device'}</td>
          <td><button className="secondary small" disabled={busy || pk.passkeys.length < 2} onClick={() => remove(x.id)} title={pk.passkeys.length < 2 ? 'Add another passkey first' : 'Remove'}><Trash2 size={14} /></button></td></tr>)}
        {pk && !pk.passkeys.length && <tr><td colSpan={5} className="secMuted">None yet.</td></tr>}
      </tbody></table></div>
      <div className="secForm"><input value={nick} onChange={e => setNick(e.target.value)} placeholder="Name, e.g. iPhone" maxLength={40} />
        <button className="primary small" disabled={busy || !!unsupported} onClick={() => add('platform')}><KeyRound size={14} /> Add this device (Face ID / fingerprint)</button>
        <button className="secondary small" disabled={busy || !!unsupported} onClick={() => add('cross-platform')}>Add a security key</button></div>
      <p className="secMuted">{pk?.passkeys.length ? 'Adding or removing a passkey asks for an existing passkey first.' : 'The first passkey needs a password login from the last 10 minutes.'}</p>
    </div>

    <div className="panel">
      <h2><ShieldAlert size={16} /> Recovery codes</h2>
      <p>{pk ? pk.recoveryCodesLeft : '…'} unused code{pk?.recoveryCodesLeft === 1 ? '' : 's'}. <button className="secondary small" disabled={busy || !pk?.passkeys.length} onClick={newCodes}>Make 10 new codes (passkey)</button></p>
      <p className="secMuted">If every passkey is lost, see “Lost every passkey” in docs/setup/YN-CORE-SETUP.md.</p>
    </div>

    <div className="panel">
      <h2><Lock size={16} /> YN EMERGENCY</h2>
      <p>{ov?.initLocked ? 'Locked.' : 'Open.'} {ov?.initLocked ? <button className="secondary small" onClick={() => nav('/admin/emergency/recover')}>Go to recovery</button> : <button className="secondary small" disabled={busy} onClick={lockNow}>Lock now</button>}</p>
    </div>

    <div className="panel">
      <h2>Audit log</h2>
      <div className="secScroll"><table><thead><tr><th>Time</th><th>Action</th><th>Coin</th><th>Result</th></tr></thead><tbody>
        {audit.map(x => <tr key={x.id}><td>{when(x.ts)}</td><td>{x.action}</td><td>{x.slot ? '0' + x.slot : '—'}</td><td><span className={'sev ' + (x.result === 'ok' ? '' : 'high')}>{x.result}</span></td></tr>)}
        {!audit.length && <tr><td colSpan={4} className="secMuted">Nothing yet.</td></tr>}
      </tbody></table></div>
      <p className="secMuted">Append-only and hash-chained: rows cannot be edited or deleted.</p>
    </div>
  </>;
}
