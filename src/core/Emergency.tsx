import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { KeyRound, Lock, ShieldCheck } from './icons';
import { ApiError, coreApi, stepUp, when } from './api';
import { getPasskey, isNativeApp, passkeysSupported } from './webauthn';
import { resetCoreInit } from './useCoreInit';
import TokenReveal from './TokenReveal';
import './core.css';

// YN EMERGENCY: the private initialization + recovery center. It deliberately does NOT use the normal admin shell (no assistant,
// no animations, no themes): it is a small page that does one dangerous thing at a time.
//
//   * Each coin is activated in its own session: Face ID / Touch ID / PIN (WebAuthn, user verification required) -> a one-time
//     session for that coin only (5 minutes, kept in memory) -> activation. The server ends the session in the same database
//     transaction as the activation, and this page then shows only the one-time URL, never a form.
//   * When the fifth coin is active the server locks initialization for good: this route answers 404 on a fresh load, and the
//     menu item disappears. Only /admin/emergency/recover (passkey + offline code + waiting period) can reopen it.
type Phase =
  | { k: 'idle' }
  | { k: 'busy'; text: string }
  | { k: 'form'; slot: number; session: string; until: number }
  | { k: 'reveal'; slot: number; url: string; finalLock: boolean };

const STATUS: Record<string, string> = { uninitialized: 'Not set up', active: 'Active', paused: 'Paused', revoked: 'Revoked' };

export default function Emergency() {
  const loc = useLocation();
  return loc.pathname.replace(/\/$/, '').endsWith('/recover') ? <Recover /> : <Init />;
}

function Frame({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return <div className="emg"><main className="emgMain">
    <header className="emgHead"><span className="emgTag"><ShieldCheck size={14} /> YN EMERGENCY</span><h1>{title}</h1><p>{sub}</p></header>
    {children}
    <footer className="emgFoot"><Link to="/admin/core">← Back to YN CORE</Link></footer>
  </main></div>;
}

function useGuard() {
  if (isNativeApp()) return 'Open YN EMERGENCY in Safari or Chrome at your website address. Passkeys do not work inside the mobile app.';
  if (!passkeysSupported()) return 'This browser does not support passkeys. Use a current Safari, Chrome or Edge.';
  return '';
}

/* ------------------------------------------------------------------ initialization */
function Init() {
  const guard = useGuard();
  const [st, setSt] = useState<any>(null);
  const [ov, setOv] = useState<any>(null);
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  const [msg, setMsg] = useState('');
  const [now, setNow] = useState(Date.now());
  const sessionRef = useRef('');

  const load = useCallback(async () => {
    try {
      const s = await coreApi('/api/emergency/state'); setSt(s);
      setOv(await coreApi('/api/admin/core/overview'));
    } catch (e: any) { setMsg(e instanceof ApiError && e.status === 404 ? 'YN CORE is switched off on the server.' : e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const endSession = useCallback(() => {
    const s = sessionRef.current; sessionRef.current = '';
    if (s) coreApi('/api/emergency/session/end', { method: 'POST', body: {}, session: s }).catch(() => {});
  }, []);
  // The session is never kept: leaving the page, hiding the tab or running out the clock ends it.
  useEffect(() => {
    const hide = () => { endSession(); setPhase(p => (p.k === 'form' ? { k: 'idle' } : p)); };
    window.addEventListener('pagehide', hide);
    return () => { window.removeEventListener('pagehide', hide); endSession(); };
  }, [endSession]);
  useEffect(() => {
    if (phase.k !== 'form') return;
    const t = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= phase.until) { endSession(); setPhase({ k: 'idle' }); setMsg('The 5-minute session ran out. Nothing was changed. Start again when you are ready.'); }
    }, 1000);
    return () => window.clearInterval(t);
  }, [phase, endSession]);

  async function begin(slot: number) {
    setMsg(''); setPhase({ k: 'busy', text: 'Waiting for Face ID / passkey…' });
    try {
      const s = await stepUp('init', slot);
      sessionRef.current = s.sessionToken;
      setPhase({ k: 'form', slot, session: s.sessionToken, until: new Date(s.expiresAt).getTime() });
    } catch (e: any) { setPhase({ k: 'idle' }); setMsg(e.message); if (e instanceof ApiError && e.status === 404) load(); }
  }

  async function activate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (phase.k !== 'form') return;
    const f = new FormData(e.currentTarget);
    const { slot, session } = phase;
    setPhase({ k: 'busy', text: 'Activating coin 0' + slot + '…' });
    try {
      const r = await coreApi(`/api/emergency/coins/${slot}/activate`, { session, body: {
        label: String(f.get('label') || ''), policy: String(f.get('policy') || 'redirect'),
        destination_url: String(f.get('url') || '') || undefined, destination_label: String(f.get('dlabel') || '') || undefined } });
      sessionRef.current = '';                       // the server already ended it; forget it here too
      resetCoreInit();
      setPhase({ k: 'reveal', slot, url: r.url, finalLock: !!r.finalLock });
    } catch (x: any) {
      sessionRef.current = '';
      setPhase({ k: 'idle' });
      setMsg(x instanceof ApiError && x.status === 404 ? 'Initialization is locked.' : x.message + ' (The session has ended.)');
      load();
    }
  }

  const left = phase.k === 'form' ? Math.max(0, Math.ceil((phase.until - now) / 1000)) : 0;
  const coins: any[] = ov?.coins || [];
  const ready = st?.ready;

  return <Frame title="Initialize NFC coins" sub="Activate coins 01 to 05 one at a time. Every coin needs its own Face ID / passkey check.">
    {guard && <p className="emgWarn">{guard}</p>}
    {msg && <p className="emgMsg" role="status">{msg}</p>}
    {st && ready && (!ready.keyring || !ready.webauthn) && <p className="emgWarn">The server is not configured yet: {!ready.keyring ? 'set YN_CORE_PEPPER_CURRENT and YN_CORE_PEPPER_V1' : ''} {!ready.webauthn ? 'set PUBLIC_URL to your https address' : ''}. See docs/setup/YN-CORE-SETUP.md.</p>}
    {st && st.locked && <div className="emgLock"><Lock /> <div><b>Initialization is locked.</b><br /><small>All coins are active. To reopen it, use <Link to="/admin/emergency/recover">recovery</Link> (passkey + recovery code + waiting period).</small></div></div>}
    {st && !st.locked && !st.hasPasskey && <p className="emgWarn">Add a passkey first: <Link to="/admin/core/security">YN CORE → Security</Link>. Use two devices if you can.</p>}
    {st?.recoveryWindowUntil && !st.locked && <p className="emgMsg">Recovery window open until {when(st.recoveryWindowUntil)}. It closes by itself.</p>}

    {phase.k === 'busy' && <p className="emgBusy">{phase.text}</p>}

    {phase.k === 'reveal' && <TokenReveal url={phase.url} slot={phase.slot}
      onDone={() => { const fin = phase.k === 'reveal' && phase.finalLock; setPhase({ k: 'idle' }); setMsg(fin ? 'All five coins are active. YN EMERGENCY is now locked.' : 'Session ended. Coin 0' + phase.slot + ' is done. The next coin needs a fresh Face ID / passkey check.'); load(); }}
      extra={phase.finalLock ? <p className="emgMsg"><b>That was the fifth coin.</b> Initialization is now locked and this page will no longer open.</p> : <p className="secMuted">The initialization session has already ended. Starting another coin asks for Face ID / passkey again.</p>} />}

    {phase.k === 'form' && <form className="emgForm" onSubmit={activate}>
      <h2>Coin 0{phase.slot}</h2>
      <p className="secMuted">Session ends in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} and works for this coin only.</p>
      <label>Name<input name="label" maxLength={60} placeholder={'Coin 0' + phase.slot} /></label>
      <label>First destination (https only)<input name="url" type="url" placeholder="https://ynstudio.site/…" /></label>
      <label>Destination label<input name="dlabel" maxLength={60} placeholder="e.g. Menu" /></label>
      <label>When tapped<select name="policy" defaultValue="redirect"><option value="redirect">Go straight to the destination</option><option value="interstitial">Show a “Continue” page first</option></select></label>
      <div className="emgRow">
        <button type="submit" className="primary"><KeyRound size={16} /> Activate coin 0{phase.slot}</button>
        <button type="button" className="secondary" onClick={() => { endSession(); setPhase({ k: 'idle' }); }}>Cancel and end session</button>
      </div>
    </form>}

    {phase.k === 'idle' && st && !st.locked && <ul className="emgCoins">
      {coins.map(c => {
        const free = c.status === 'uninitialized' || c.status === 'revoked';
        return <li key={c.slot} className={'emgCoin ' + c.status}>
          <span className="emgNum">0{c.slot}</span>
          <span className="emgInfo"><b>{c.label || 'Coin 0' + c.slot}</b><small>{STATUS[c.status] || c.status}{c.activatedAt ? ' · ' + when(c.activatedAt) : ''}</small></span>
          {free ? <button className="primary small" disabled={!st.hasPasskey || !!guard || !(ready?.keyring && ready?.webauthn)} onClick={() => begin(c.slot)}><KeyRound size={14} /> Activate</button> : <span className="emgDone">✓</span>}
        </li>;
      })}
    </ul>}
  </Frame>;
}

/* ------------------------------------------------------------------ recovery */
function Recover() {
  const guard = useGuard();
  const nav = useNavigate();
  const [st, setSt] = useState<any>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => { try { setSt(await coreApi('/api/emergency/state')); } catch (e: any) { setMsg(e.message); } }, []);
  useEffect(() => { load(); const a = window.setInterval(load, 15000), b = window.setInterval(() => setNow(Date.now()), 1000); return () => { window.clearInterval(a); window.clearInterval(b); }; }, [load]);

  async function ceremony(purpose: 'recover' | 'recover_open', path: string, extra: any = {}) {
    setBusy(true); setMsg('');
    try {
      const o = await coreApi('/api/emergency/auth/options', { body: { purpose } });
      const credential = await getPasskey(o.publicKey);
      return await coreApi(path, { body: { challengeId: o.challengeId, credential, ...extra } });
    } catch (e: any) { setMsg(e.message); return null; } finally { setBusy(false); }
  }
  async function start() {
    const r = await ceremony('recover', '/api/emergency/recovery/start', { code });
    if (r) { setCode(''); setMsg('Recovery started. You can open it after the waiting period. Everyone with admin alerts was notified.'); load(); }
  }
  async function open() {
    const r = await ceremony('recover_open', '/api/emergency/recovery/open');
    if (r) { resetCoreInit(); nav('/admin/emergency'); }
  }
  async function cancel() { try { await coreApi('/api/admin/core/recovery/cancel', { body: {} }); setMsg('Recovery cancelled.'); load(); } catch (e: any) { setMsg(e.message); } }

  const p = st?.pendingRecovery;
  const readyAt = p ? new Date(p.ready_at).getTime() : 0;
  const wait = Math.max(0, Math.ceil((readyAt - now) / 1000));
  return <Frame title="Recovery" sub="Reopen initialization after the final lock. It needs your passkey, one offline recovery code and a waiting period.">
    {guard && <p className="emgWarn">{guard}</p>}
    {msg && <p className="emgMsg" role="status">{msg}</p>}
    {st && !st.hasPasskey && <p className="emgWarn">No passkey is registered for this account, so recovery is not available here. See docs/setup/YN-CORE-SETUP.md → “Lost every passkey”.</p>}
    {st && !p && <section className="emgForm">
      <h2>1. Start recovery</h2>
      <label>Recovery code<input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="XXXXX-XXXXX-XXXXX-XXXXX" autoComplete="off" spellCheck={false} /></label>
      <button className="primary" disabled={busy || !!guard || code.replace(/[^A-Z0-9]/gi, '').length < 20 || !st.hasPasskey} onClick={start}><KeyRound size={16} /> Verify with passkey</button>
      <p className="secMuted">After this you must wait about {st.recoveryDelayMinutes} minutes. You get an alert, and any admin can cancel it.</p>
    </section>}
    {p && <section className="emgForm">
      <h2>2. {wait > 0 ? 'Waiting period' : 'Ready'}</h2>
      {wait > 0 ? <p>You can open recovery in <b>{Math.floor(wait / 60)}:{String(wait % 60).padStart(2, '0')}</b> ({when(p.ready_at)}).</p> : <p>The waiting period is over.</p>}
      <div className="emgRow">
        <button className="primary" disabled={busy || wait > 0 || !!guard} onClick={open}><KeyRound size={16} /> Open YN EMERGENCY</button>
        <button className="secondary" onClick={cancel}>Cancel recovery</button>
      </div>
      <p className="secMuted">Once open, it closes by itself after a few minutes and locks again as soon as all five coins are active.</p>
    </section>}
  </Frame>;
}
