import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPasskey, passkeysSupported } from './webauthn';
import { nfcErrorText, nfcSupported, nfcTimer, readTag } from './nfcWrite';
import { maskCoinText, parseCoinUrl } from '../../shared/coinUrl.js';
import './gate.css';

// /yn-core: where every coin tap lands. Five coins turn slowly in a ring; each real tap lights one. When all five are lit the
// coins fuse into a core and the page asks for Face ID. Nothing here is a secret or a decision: the server keeps the tap list
// in a signed cookie and only the server (after a real passkey check) can open the admin. This page just shows what it says.
type GateState = {
  taps: boolean[]; expiresAt: string | null; windowSeconds: number; unlockedUntil: string | null;
  enforce: boolean; coinMode: string; passkeyReady: boolean;
};
type NfcSheet = { mode: 'scanning' | 'unsupported' | 'error'; msg: string } | null;
type Phase = 'loading' | 'off' | 'scan' | 'ready' | 'verifying' | 'granted' | 'denied' | 'open';

const API_BASE: string = (((import.meta as any).env?.VITE_API_BASE_URL as string | undefined) || '').replace(/\/$/, '');
async function gateFetch(path: string, body?: unknown): Promise<any> {
  // Cookies carry the ritual, so this must stay same-origin ('include' only matters if the API lives on another host).
  const r = await fetch(API_BASE + path, { method: body === undefined ? 'GET' : 'POST', credentials: API_BASE ? 'include' : 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  let j: any = null; try { j = await r.json(); } catch { j = null; }
  if (!r.ok) { const e: any = new Error(j?.error || 'Request failed (' + r.status + ').'); e.status = r.status; e.code = j?.code; throw e; }
  return j;
}

const COINS = [1, 2, 3, 4, 5];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function CoreGate() {
  const nav = useNavigate();
  const [st, setSt] = useState<GateState | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [msg, setMsg] = useState('');
  const [pop, setPop] = useState<number[]>([]);
  const [left, setLeft] = useState(0);
  const prev = useRef<boolean[]>([false, false, false, false, false]);
  const busy = useRef(false);
  const [nfc, setNfc] = useState<NfcSheet>(null);
  const nfcRef = useRef<ReturnType<typeof nfcTimer> | null>(null);
  const count = st ? st.taps.filter(Boolean).length : 0;

  const refresh = useCallback(async () => {
    if (busy.current) return;
    try {
      const s: GateState = await gateFetch('/api/core-gate/state');
      setSt(s);
      const fresh = COINS.filter(n => s.taps[n - 1] && !prev.current[n - 1]);
      if (fresh.length) {
        setPop(p => [...p, ...fresh]);
        try { navigator.vibrate?.(fresh.length > 1 ? [30, 40, 30] : 40); } catch { /* not supported: fine */ }
        window.setTimeout(() => setPop(p => p.filter(n => !fresh.includes(n))), 1500);
      }
      prev.current = s.taps;
      setPhase(cur => {
        if (cur === 'verifying' || cur === 'granted') return cur;
        if (s.unlockedUntil) return 'open';
        if (s.taps.every(Boolean)) return cur === 'denied' ? 'denied' : 'ready';
        return cur === 'denied' ? 'denied' : 'scan';
      });
    } catch (e: any) { setPhase(e?.status === 404 ? 'off' : 'scan'); }
  }, []);

  // Each tap on iPhone opens a fresh page load, so we read the state on mount, on a slow timer, and whenever the tab comes back.
  useEffect(() => {
    refresh();
    const t = window.setInterval(refresh, 1600);
    const v = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', v); window.addEventListener('focus', v);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', v); window.removeEventListener('focus', v); };
  }, [refresh]);

  // Countdown ring: time left until the five-tap window closes.
  useEffect(() => {
    const t = window.setInterval(() => setLeft(st?.expiresAt ? Math.max(0, Math.round((Date.parse(st.expiresAt) - Date.now()) / 1000)) : 0), 250);
    return () => window.clearInterval(t);
  }, [st?.expiresAt]);

  const verify = async () => {
    if (busy.current) return;
    busy.current = true; setMsg(''); setPhase('verifying');
    try {
      if (!passkeysSupported()) throw Object.assign(new Error('This browser cannot do Face ID passkeys. Open this page in Safari or Chrome.'), { soft: true });
      const o = await gateFetch('/api/core-gate/auth/options', {});
      const credential = await getPasskey(o.publicKey);                 // the phone shows Face ID / Touch ID here
      await gateFetch('/api/core-gate/auth/verify', { challengeId: o.challengeId, credential });
      setPhase('granted');
      window.setTimeout(() => nav('/admin', { replace: true }), 2300);
    } catch (e: any) {
      const hard = e?.code === 'gate_denied' || e?.code === 'need_coins';
      setMsg(e?.code === 'no_passkey' ? 'No passkey is registered yet. Sign in, then add one in YN CORE > Security.' : e?.message || 'Verification failed.');
      setPhase(hard ? 'denied' : e?.code === 'no_passkey' ? 'denied' : 'ready');
      if (hard) { prev.current = [false, false, false, false, false]; }
    } finally { busy.current = false; refresh(); }
  };


  // NFC reader button. Web NFC exists only in Chrome on Android; there the phone shows its own NFC sheet and we read the coin's address.
  // A coin of THIS site is opened like a normal tap, so the server (not this page) records it. Anything else is refused and never shown in full.
  const closeNfc = () => { const t = nfcRef.current; nfcRef.current = null; if (t) { t.abort(); t.done(); } setNfc(null); };
  const startNfc = async () => {
    if (!nfcSupported()) { setNfc({ mode: 'unsupported', msg: '' }); return; }
    nfcRef.current?.abort();
    const t = nfcTimer(30000); nfcRef.current = t;
    setNfc({ mode: 'scanning', msg: '' });
    try {
      const found = await readTag(t.signal, () => setNfc({ mode: 'scanning', msg: 'Could not read that tag. Hold it still and try again.' }));
      t.done();
      const r = parseCoinUrl(found, window.location.origin);
      if (!r.ok) { setNfc({ mode: 'error', msg: found ? 'That tag is not a YN coin (' + maskCoinText(found) + ').' : 'That tag is empty.' }); return; }
      if (!r.sameOrigin) { setNfc({ mode: 'error', msg: 'This coin belongs to another website (' + r.host + ').' }); return; }
      nfcRef.current = null;
      window.location.assign(r.url);
    } catch (e: any) {
      t.done();
      if (nfcRef.current !== t) return;   // closed by the person
      nfcRef.current = null;
      setNfc({ mode: 'error', msg: t.timedOut() ? 'No coin found. Hold a coin to the back of your phone and try again.' : nfcErrorText(e) });
    }
  };
  useEffect(() => () => { nfcRef.current?.abort(); nfcRef.current?.done(); }, []);

  const lockNow = async () => { try { await gateFetch('/api/core-gate/lock', {}); } catch { /* ignore */ } prev.current = [false, false, false, false, false]; setPhase('scan'); refresh(); };
  const again = () => { setMsg(''); setPhase('scan'); refresh(); };

  if (phase === 'off') {
    return <div className="yg yg-off"><p>Not found</p></div>;
  }

  const fused = phase === 'ready' || phase === 'verifying' || phase === 'granted';
  const title = phase === 'granted' ? 'ACCESS GRANTED'
    : phase === 'denied' ? 'ACCESS DENIED'
    : phase === 'open' ? 'ADMIN IS OPEN'
    : phase === 'verifying' ? 'VERIFYING…'
    : phase === 'ready' ? 'ALL FIVE COINS LINKED'
    : 'YN CORE';
  const sub = phase === 'granted' ? 'Opening the admin…'
    : phase === 'denied' ? (msg || 'The check failed. Scan the coins again.')
    : phase === 'open' ? (st?.unlockedUntil ? 'Open until ' + new Date(st.unlockedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')
    : phase === 'verifying' ? 'Confirm with Face ID'
    : phase === 'ready' ? (msg || 'Confirm it is you')
    : count === 0 ? 'Hold your phone to a coin'
    : `${count} of 5 linked — tap the next coin`;

  return (
    <div className={`yg ph-${phase}`} data-fused={fused ? '1' : '0'}>
      <div className="yg-aurora" aria-hidden="true" />
      <div className="yg-stars" aria-hidden="true" />
      <div className="yg-flash" aria-hidden="true" />
      <div className="yg-grid" aria-hidden="true" />
      <div className="yg-scan" aria-hidden="true" />
      <i className="yg-hud tl" aria-hidden="true" /><i className="yg-hud tr" aria-hidden="true" /><i className="yg-hud bl" aria-hidden="true" /><i className="yg-hud br" aria-hidden="true" />

      <header className="yg-top">
        <span className="yg-brand">YN&nbsp;CORE</span>
        <span className="yg-count" aria-live="polite">
          <span className="yg-pips" aria-hidden="true">{COINS.map(n => <i key={n} className={st?.taps[n - 1] ? 'on' : ''} />)}</span>{count}/5
        </span>
      </header>

      <main className="yg-main">
        <div className="yg-stage" role="img" aria-label={`${count} of 5 coins linked`}>
          <div className="yg-halo" aria-hidden="true" />
          <div className={'yg-ring' + (fused ? ' fused' : '')}>
            {COINS.map(n => {
              const on = !!st?.taps[n - 1];
              return (
                <div key={n} className={'yg-slot' + (on ? ' on' : '') + (pop.includes(n) ? ' pop' : '')} style={{ ['--a' as any]: `${(n - 1) * 72}deg`, ['--i' as any]: n - 1 }}>
                  <div className="yg-coin">
                    <span className="yg-face yg-front"><i className="yg-nfc" /><b>{String(n).padStart(2, '0')}</b></span>
                    <span className="yg-edge" />
                    <span className="yg-face yg-back"><i className="yg-nfc" /><b>{String(n).padStart(2, '0')}</b></span>
                  </div>
                  {on && <span className="yg-ripple" key={'r' + n} />}
                </div>
              );
            })}
          </div>
          <div className="yg-core" aria-hidden="true"><span /><span /><span /></div>
          <svg className="yg-timer" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="47" className="yg-track" />
            <circle cx="50" cy="50" r="47" className="yg-bar" pathLength={100} style={{ strokeDashoffset: st?.expiresAt && count > 0 && count < 5 ? 100 - (left / Math.max(1, st.windowSeconds)) * 100 : 100 }} />
          </svg>
        </div>

        <h1 className="yg-title">{title}</h1>
        <p className="yg-sub">{sub}</p>
        {count > 0 && count < 5 && st?.expiresAt && <p className="yg-clock">{fmt(left)} left to link all five</p>}

        <div className="yg-actions">
          {(phase === 'ready' || phase === 'verifying') && (
            <button className="yg-btn" onClick={verify} disabled={phase === 'verifying'}>
              <span className="yg-faceid" aria-hidden="true" />{phase === 'verifying' ? 'Waiting for Face ID…' : 'Verify with Face ID'}
            </button>
          )}
          {phase === 'scan' && (
            <button className="yg-btn yg-nfcbtn" onClick={startNfc}><span className="yg-nfcicon" aria-hidden="true" />Scan a coin</button>
          )}
          {phase === 'denied' && <button className="yg-btn ghost" onClick={again}>Start again</button>}
          {phase === 'open' && (<>
            <button className="yg-btn" onClick={() => nav('/admin')}>Open admin</button>
            <button className="yg-btn ghost" onClick={lockNow}>Lock now</button>
          </>)}
        </div>

        {st && !st.enforce && phase !== 'granted' && (
          <p className="yg-note">Test mode: the admin is not locked yet. Set YN_CORE_GATE=on on the server when the coins work.</p>
        )}
        {st && !st.passkeyReady && <p className="yg-note">Passkeys need PUBLIC_URL set to your https address on the server.</p>}
      </main>

      {nfc && (
        <div className="yg-sheet" role="dialog" aria-modal="true" aria-label="NFC reader" onClick={closeNfc}>
          <div className={'yg-card m-' + nfc.mode} onClick={e => e.stopPropagation()}>
            <div className="yg-radar" aria-hidden="true"><i /><i /><i /><span className="yg-nfcicon big" /></div>
            <h2>{nfc.mode === 'scanning' ? 'Ready to scan' : nfc.mode === 'unsupported' ? 'Just tap the coin' : 'Could not scan'}</h2>
            <p>{nfc.mode === 'scanning' ? (nfc.msg || 'Hold a YN coin to the back of your phone and keep it still.')
              : nfc.mode === 'unsupported' ? 'This browser cannot open an NFC reader. On iPhone, hold the top edge of the phone to the coin. On Android, open this page in Chrome.'
              : nfc.msg}</p>
            <div className="yg-sheet-actions">
              {nfc.mode === 'error' && <button className="yg-btn" onClick={startNfc}>Try again</button>}
              <button className="yg-btn ghost" onClick={closeNfc}>{nfc.mode === 'scanning' ? 'Cancel' : 'Close'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
