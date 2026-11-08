import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Nfc, QrCode } from './icons';

// Shows a coin's secret URL exactly once. The URL lives only in this component's memory: it is never stored by the server, never put
// in browser storage, and disappears when this closes or after 3 minutes. If it is lost, use "Regenerate URL" (needs a fresh passkey).
export default function TokenReveal({ url, slot, onDone, extra }: { url: string; slot: number; onDone: () => void; extra?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState('');
  const [wrote, setWrote] = useState(false);
  const [written, setWritten] = useState('');
  const [left, setLeft] = useState(180);
  const done = useRef(onDone); done.current = onDone;
  const nfc = typeof window !== 'undefined' && 'NDEFReader' in window;

  useEffect(() => {
    const t = window.setInterval(() => setLeft(x => { if (x <= 1) { window.clearInterval(t); done.current(); return 0; } return x - 1; }), 1000);
    return () => window.clearInterval(t);
  }, []);

  async function copy() { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setCopied(false); } }
  async function showQr() {
    try { const m: any = await import('qrcode'); setQr(await (m.default || m).toDataURL(url, { margin: 1, width: 300 })); } catch { setQr(''); }
  }
  async function writeTag() {
    try {
      const reader = new (window as any).NDEFReader();
      setWritten('Hold the blank sticker against the back of your phone…');
      await reader.write({ records: [{ recordType: 'url', data: url }] });
      setWritten('Written. Tap the sticker once with your phone to test it.'); setWrote(true);
    } catch (e: any) { setWritten('Could not write: ' + (e?.message || 'cancelled')); }
  }

  return <div className="reveal" role="alert">
    <div className="revealHead"><b>Coin 0{slot} is active. This is the only time you will see its URL.</b><small>Closes in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</small></div>
    <code className="revealUrl">{url}</code>
    <div className="revealBtns">
      <button type="button" className="secondary small" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}</button>
      <button type="button" className="secondary small" onClick={showQr}><QrCode size={14} /> QR code</button>
      {nfc && <button type="button" className="secondary small" onClick={writeTag}><Nfc size={14} /> Write to sticker</button>}
    </div>
    {written && <p className="secMuted">{written}</p>}
    {qr && <img className="revealQr" src={qr} alt="QR code of the coin URL" width={180} height={180} />}
    <ul className="revealNotes">
      <li>Write this exact address to the sticker with an NFC writer app (or the button above on Android Chrome), then tap it once to test.</li>
      <li>A sticker cannot rewrite itself. From now on only the <b>server</b> changes where it leads, so you never need to touch the sticker again unless you regenerate the URL.</li>
      <li>Anyone who can read the sticker can read this address. It opens only what you set up for this coin, never an admin page.</li>
    </ul>
    {extra}
    <label className="revealCheck"><input type="checkbox" checked={wrote} onChange={e => setWrote(e.target.checked)} /> I wrote it to the sticker (or I will regenerate it if I did not)</label>
    <button type="button" className="primary" disabled={!wrote} onClick={onDone}>Done: hide this URL</button>
  </div>;
}
