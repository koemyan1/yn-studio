import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Nfc, QrCode } from './icons';
import { maskCoinText } from '../../shared/coinUrl.js';
import { nfcErrorText, nfcSupported, nfcTimer, writeAndVerify } from './nfcWrite';

// A coin's secret URL, shown exactly once. The URL lives only in this component's memory: it is never stored by the server, never put
// in browser storage, and disappears when this closes or after 3 minutes. If it is lost, use "Regenerate URL" (needs a fresh passkey).
//
// Automatic mode (Android Chrome): the moment this opens it asks you to hold a blank sticker to the phone, writes the address, reads the
// sticker back and compares. You never have to see, copy or type the URL. Elsewhere (iPhone, desktop) the manual tools stay available.
type Phase = 'idle' | 'writing' | 'verifying' | 'ok' | 'error';

export default function TokenReveal({ url, slot, onDone, extra }: { url: string; slot: number; onDone: () => void; extra?: React.ReactNode }) {
  const nfc = nfcSupported();
  const [phase, setPhase] = useState<Phase>('idle');
  const [note, setNote] = useState('');
  const [manual, setManual] = useState(!nfc);
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState('');
  const [wrote, setWrote] = useState(false);
  const [left, setLeft] = useState(180);
  const done = useRef(onDone); done.current = onDone;
  const ac = useRef<{ abort: () => void } | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setLeft(x => { if (x <= 1) { window.clearInterval(t); done.current(); return 0; } return x - 1; }), 1000);
    return () => window.clearInterval(t);
  }, []);

  async function run() {
    ac.current?.abort();
    const tm = nfcTimer(45000); ac.current = tm;
    setPhase('writing'); setNote('');
    try {
      await writeAndVerify(url, (p, m) => { setPhase(p); setNote(m); }, tm.signal);
      setPhase('ok'); setWrote(true); setNote('Sticker written and checked. Now tap it once with a phone to test it.');
    } catch (e: any) {
      setPhase('error');
      setNote(tm.timedOut() ? 'No sticker was found in time. Press “Try again”.' : e?.name === 'VerifyError' ? e.message + '. Press “Try again”.' : nfcErrorText(e));
    } finally { tm.done(); }
  }
  // Starts by itself as soon as the URL appears. (The timeout keeps React's double-mount in development from starting it twice.)
  useEffect(() => {
    if (!nfc) return;
    const id = window.setTimeout(run, 0);
    return () => { window.clearTimeout(id); ac.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copy() { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setCopied(false); } }
  async function showQr() { try { const m: any = await import('qrcode'); setQr(await (m.default || m).toDataURL(url, { margin: 1, width: 300 })); } catch { setQr(''); } }
  const busy = phase === 'writing' || phase === 'verifying';

  return <div className="reveal" role="alert">
    <div className="revealHead"><b>Coin 0{slot} is active. {nfc ? 'Writing it to a sticker now.' : 'This is the only time you will see its URL.'}</b><small>Closes in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</small></div>

    {nfc && <div className={'revealAuto ' + phase}>
      <p className="revealStep"><Nfc size={18} /> {phase === 'ok' ? 'Done' : busy ? (phase === 'writing' ? 'Hold a blank sticker to the back of your phone' : 'Keep it there, checking…') : 'Ready'}</p>
      {note && <p className={phase === 'error' ? 'emgWarn' : 'secMuted'} role="status">{note}</p>}
      <div className="revealBtns">
        {!busy && phase !== 'ok' && <button type="button" className="primary small" onClick={run}><Nfc size={14} /> {phase === 'error' ? 'Try again' : 'Write to sticker'}</button>}
        {busy && <button type="button" className="secondary small" onClick={() => { ac.current?.abort(); setPhase('idle'); setNote('Cancelled.'); }}>Cancel</button>}
        {phase === 'ok' && <button type="button" className="secondary small" onClick={run}>Write another sticker with this coin</button>}
      </div>
    </div>}

    {!nfc && <p className="emgWarn">This browser cannot write NFC (Web NFC is Android Chrome only). Use the tools below with an NFC writer app, or open this page in Chrome on an Android phone and use “Regenerate URL”.</p>}

    <details className="revealManual" open={manual} onToggle={e => setManual((e.target as HTMLDetailsElement).open)}>
      <summary>{nfc ? 'Other ways: show, copy or QR' : 'Show, copy or QR'}</summary>
      <code className="revealUrl">{shown ? url : maskCoinText(url)}</code>
      <div className="revealBtns">
        <button type="button" className="secondary small" onClick={() => setShown(s => !s)}>{shown ? 'Hide' : 'Show full address'}</button>
        <button type="button" className="secondary small" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}</button>
        <button type="button" className="secondary small" onClick={showQr}><QrCode size={14} /> QR code</button>
      </div>
      {qr && <img className="revealQr" src={qr} alt="QR code of the coin URL" width={180} height={180} />}
    </details>

    <ul className="revealNotes">
      <li>A sticker cannot rewrite itself. From now on only the <b>server</b> changes where it leads, so you never need to touch the sticker again unless you regenerate the URL.</li>
      <li>Anyone who can read the sticker can read this address. It opens only what you set up for this coin, never an admin page.</li>
    </ul>
    {extra}
    <label className="revealCheck"><input type="checkbox" checked={wrote} onChange={e => setWrote(e.target.checked)} disabled={phase === 'ok'} /> {nfc ? 'The sticker is written and checked' : 'I wrote it to the sticker'} (or I will regenerate it if I did not)</label>
    <button type="button" className="primary" disabled={!wrote || busy} onClick={onDone}>Done: hide this URL</button>
  </div>;
}
