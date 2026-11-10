import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, coreApi, stepUp } from './api';
import TokenReveal from './TokenReveal';
import { nfcErrorText, nfcSupported, nfcTimer, readTag, writeUrl } from './nfcWrite';
import { Check, Copy, Nfc, QrCode, ShieldAlert } from './icons';
import { maskCoinText, normalizeCoinUrl, parseCoinUrl } from '../../shared/coinUrl.js';
import './core.css';

// /admin/core/write: put a coin's address onto an NFC sticker.
//
// The address is a secret (anyone holding it can open the coin) and the server only keeps a keyed hash of it, so this page cannot
// fetch it. You bring it from the one-time screen (activation or "Regenerate URL"), paste it here, and write it. The address lives in
// this component's memory only: no browser storage, no network request, cleared on leaving, after 5 minutes, or once the sticker
// has been written and read back correctly. Writing uses Web NFC, which exists only in Android Chrome; elsewhere the page explains the
// alternative. A sticker is never locked here: test it first, locking cannot be undone.
type Step = 'idle' | 'writing' | 'wrote' | 'reading' | 'ok' | 'mismatch' | 'error';
const LIFETIME = 300;

export default function WriteCoin() {
  const [text, setText] = useState('');
  const [reveal, setReveal] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [note, setNote] = useState('');
  const [left, setLeft] = useState(LIFETIME);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const abort = useRef<{ abort: () => void } | null>(null);
  const supported = nfcSupported();
  const secure = typeof window === 'undefined' || window.isSecureContext;
  const parsed = text.trim() ? parseCoinUrl(text, typeof window !== 'undefined' ? window.location.origin : '') : null;
  const good = parsed && parsed.ok ? parsed : null;
  const busy = step === 'writing' || step === 'reading';

  const stopNfc = useCallback(() => { abort.current?.abort(); abort.current = null; }, []);
  const wipe = useCallback(() => { stopNfc(); setText(''); setQr(''); setReveal(false); setCopied(false); setLeft(LIFETIME); }, [stopNfc]);

  // The address is forgotten after 5 minutes of having it here, and when the page goes away.
  useEffect(() => {
    if (!text) { setLeft(LIFETIME); return; }
    const t = window.setInterval(() => setLeft(x => { if (x <= 1) { window.clearInterval(t); wipe(); setStep('idle'); setNote('The address was cleared after 5 minutes. Paste it again if you still need it.'); return LIFETIME; } return x - 1; }), 1000);
    return () => window.clearInterval(t);
  }, [text, wipe]);
  useEffect(() => { window.addEventListener('pagehide', wipe); return () => { window.removeEventListener('pagehide', wipe); wipe(); }; }, [wipe]);

  async function paste() {
    try { setText((await navigator.clipboard.readText()).trim()); setStep('idle'); setNote(''); }
    catch { setNote('The browser did not allow reading the clipboard. Paste into the box with a long press instead.'); }
  }
  async function copy() { if (!good) return; try { await navigator.clipboard.writeText(good.url); setCopied(true); } catch { setCopied(false); } }
  async function showQr() {
    if (!good) return;
    try { const m: any = await import('qrcode'); setQr(await (m.default || m).toDataURL(good.url, { margin: 1, width: 300 })); } catch { setQr(''); }
  }

    async function write() {
    if (!good) return;
    stopNfc(); const tm = nfcTimer(); abort.current = tm;
    setStep('writing'); setNote('Hold a blank sticker against the back of your phone and keep it still…');
    try { await writeUrl(good.url, tm.signal); setStep('wrote'); setNote('Written. Now check it: press “Check sticker” and hold the same sticker to the phone again.'); }
    catch (e: any) { setStep('error'); setNote(tm.timedOut() ? 'No sticker was found within 30 seconds. Try again.' : nfcErrorText(e)); }
    finally { tm.done(); }
  }

  // Reads the sticker back and compares it with the pasted address. Works for any sticker, so it can also be used to look at an old one.
  async function check() {
    stopNfc(); const tm = nfcTimer(); abort.current = tm;
    setStep('reading'); setNote('Hold the sticker against the back of your phone…');
    try {
      const found = await readTag(tm.signal, () => setNote('That sticker could not be read. Try again or use another one.'));
      if (!found) { setStep('mismatch'); setNote('The sticker is empty or holds something that is not an address.'); }
      else if (good && normalizeCoinUrl(found) === good.url) { setStep('ok'); setNote('The sticker holds exactly this coin address. Now tap it once with a phone to test it: the coin card will show “✓ sticker tested”.'); window.setTimeout(wipe, 0); }
      else { setStep('mismatch'); setNote('The sticker holds a different address: ' + maskCoinText(found) + '. Write it again.'); }
    } catch (e: any) { if (tm.timedOut() || e?.name !== 'AbortError') { setStep('error'); setNote(tm.timedOut() ? 'No sticker was found within 30 seconds. Try again.' : nfcErrorText(e)); } }
    finally { tm.done(); }
  }

  /* ---- automatic: a new address from the server goes straight to the sticker, you never handle it ---- */
  const [ov, setOv] = useState<any>(null);
  const [auto, setAuto] = useState<{ slot: number; url: string } | null>(null);
  const [grace, setGrace] = useState(60);
  const [aMsg, setAMsg] = useState('');
  const [aBusy, setABusy] = useState(false);
  useEffect(() => { coreApi('/api/admin/core/overview').then(setOv).catch((e: any) => setAMsg(e.message)); }, [auto]);
  async function newAndWrite(slot: number) {
    if (!confirm(`Make a new address for coin 0${slot} and write it to a sticker now? ${grace ? 'The old address keeps working for ' + grace + ' minutes.' : 'The old address stops working immediately.'}`)) return;
    setABusy(true); setAMsg('');
    try {
      const st = await stepUp('coin_security', slot);
      const r = await coreApi(`/api/emergency/coins/${slot}/regenerate`, { session: st.sessionToken, body: { grace_minutes: grace } });
      setAuto({ slot, url: r.url });
    } catch (e: any) { setAMsg(e instanceof ApiError && e.code === 'stale_login' ? 'For safety, sign out, sign in again with your password, then retry within 10 minutes.' : e.message || 'Failed.'); }
    finally { setABusy(false); }
  }

  return <>
    <div className="secBar"><div><Link to="/admin/core">← YN CORE</Link><br /><span className="eyebrow">WRITE A COIN</span><br /><small>Put a coin’s address onto its NFC sticker.</small></div></div>

    {auto && <TokenReveal url={auto.url} slot={auto.slot} onDone={() => setAuto(null)} />}
    <div className="panel">
      <h2><Nfc size={16} /> Write a coin automatically</h2>
      <p className="secMuted">Pick a coin. After your Face ID / passkey check the server makes a fresh address and this page writes it straight onto a sticker and checks it. You never see, copy or type the address. First-time activation of a coin does the same thing in <Link to="/admin/emergency">YN EMERGENCY</Link>.</p>
      {!supported && <p className="emgWarn">Automatic writing needs Chrome on an Android phone with NFC on. Open this page there.</p>}
      {aMsg && <p className="emgWarn" role="status">{aMsg}</p>}
      <label className="coreInline">Old address keeps working for <select value={grace} onChange={e => setGrace(Number(e.target.value))}><option value={0}>0 min (cut off now)</option><option value={60}>1 hour</option><option value={1440}>1 day</option><option value={10080}>7 days</option></select></label>
      <ul className="emgCoins writeCoins">
        {(ov?.coins || []).map((c: any) => {
          const live = c.status === 'active' || c.status === 'paused';
          return <li key={c.slot} className={'emgCoin ' + c.status}>
            <span className="emgNum">0{c.slot}</span>
            <span className="emgInfo"><b>{c.label || 'Coin 0' + c.slot}</b><small>{live ? (c.writtenVerifiedAt ? '✓ sticker tested' : 'not tapped yet') : c.status === 'revoked' ? 'Revoked' : 'Not set up'}</small></span>
            {live ? <button type="button" className="primary small" disabled={aBusy || !supported || !!auto} onClick={() => newAndWrite(c.slot)}><Nfc size={14} /> New address &amp; write</button>
              : c.status === 'uninitialized' ? <Link className="secondary small" to="/admin/emergency">Activate</Link> : <span className="secMuted">—</span>}
          </li>;
        })}
      </ul>
    </div>

    <div className="panel">
      <h2><Nfc size={16} /> Advanced: write an address you already have</h2>
      <p className="secMuted">Only needed if you already hold an address (for example from a writer app). Normally use the automatic option above. This page keeps the address in memory only and forgets it after 5 minutes.</p>
      <div className="writeField">
        <input type={reveal ? 'text' : 'password'} value={text} onChange={e => { setText(e.target.value); setStep('idle'); setNote(''); setQr(''); }}
          placeholder="https://ynstudio.site/nfc/…" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} aria-label="Coin address" />
        <button type="button" className="secondary small" onClick={paste}>Paste</button>
        <button type="button" className="secondary small" onClick={() => setReveal(v => !v)}>{reveal ? 'Hide' : 'Show'}</button>
      </div>
      {parsed && !parsed.ok && <p className="emgWarn" role="status">{parsed.error}</p>}
      {good && <p className="emgMsg" role="status"><Check size={14} /> Looks right: <code>{good.masked}</code> <small>(clears in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')})</small></p>}
      {good && !good.sameOrigin && <p className="emgWarn">This address is for <b>{good.host}</b>, not the site you are on now. Write it only if that is intended.</p>}
    </div>

    <div className="panel">
      <h2><Nfc size={16} /> Write and check</h2>
      {!secure && <p className="emgWarn">NFC works only on an https address.</p>}
      {!supported && <div className="emgWarn">
        <b>This browser cannot write NFC.</b> Web NFC exists only in Chrome on Android. On iPhone or desktop, use an NFC writer app (for example “NFC Tools”): choose Write → Add a record → URL, paste the address, then hold the sticker to the phone.
        <div className="revealBtns"><button type="button" className="secondary small" disabled={!good} onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy address'}</button>
          <button type="button" className="secondary small" disabled={!good} onClick={showQr}><QrCode size={14} /> QR code</button></div>
        {qr && <img className="revealQr" src={qr} alt="QR code of the coin address" width={180} height={180} />}
      </div>}
      <div className="coreBtns">
        <button type="button" className="primary" disabled={!good || !supported || !secure || busy} onClick={write}><Nfc size={14} /> {step === 'writing' ? 'Waiting for sticker…' : 'Write to sticker'}</button>
        <button type="button" className="secondary" disabled={!good || !supported || !secure || busy} onClick={check}><Check size={14} /> {step === 'reading' ? 'Waiting for sticker…' : 'Check sticker'}</button>
        {busy && <button type="button" className="secondary" onClick={() => { stopNfc(); setStep('idle'); setNote('Cancelled.'); }}>Cancel</button>}
      </div>
      {note && <p className={step === 'ok' ? 'emgMsg' : step === 'mismatch' || step === 'error' ? 'emgWarn' : 'secMuted'} role="status">{note}</p>}
    </div>

    <div className="panel coreDanger">
      <h2><ShieldAlert size={16} /> Before you finish</h2>
      <ul className="revealNotes">
        <li>Use one blank sticker per coin and write each coin’s own address; two stickers with the same address are the same coin.</li>
        <li>Check it, then tap it once with a phone. Until that first real tap the coin card shows “not tapped yet”.</li>
        <li>This page never locks a sticker. Locking is permanent, so do it (if ever) in a writer app, after testing, and only on a sticker you will not need to rewrite.</li>
        <li>Anyone who can read a sticker can copy its address. If a sticker is lost or copied, regenerate or revoke that coin.</li>
      </ul>
      <button type="button" className="secondary small" disabled={!text} onClick={() => { wipe(); setStep('idle'); setNote('Address cleared from this page.'); }}>Clear address now</button>
    </div>
  </>;
}
