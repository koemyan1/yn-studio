/* Wallet-to-wallet transfers by QR code.
   - <WalletQrPanel/>  : the customer's own QR + "Scan to send" button (shown on the Wallet page)
   - <TransferModal/>  : scan -> choose currency + amount -> confirm -> done
   Database side: supabase/sql/supabase-wallet-transfer.sql (my_wallet_pay_code, lookup_wallet_recipient, transfer_wallet_funds).
   The QR only contains  YNPAY:<random code>  -  never the user id, email or balance. */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, ChevronRight, Copy, Download, Image as ImageIcon, QrCode, ScanLine, Send, X } from 'lucide-react';
import { supabase } from './supabase';
import { tr } from './lang';

const PREFIX = 'YNPAY:';
const fmt = (n: any, c: 'USD' | 'KHR') =>
  c === 'KHR' ? Math.round(Number(n || 0)).toLocaleString('en-US') + ' ៛' : '$' + Number(n || 0).toFixed(2);

/** Returns the pay code inside a scanned/typed value, or '' if it is not a YN Studio wallet QR. */
function parseCode(raw: string): string {
  const v = String(raw || '').trim();
  if (v.toUpperCase().startsWith(PREFIX)) return v.slice(PREFIX.length).trim().toUpperCase();
  return /^[A-Za-z0-9]{16}$/.test(v) ? v.toUpperCase() : ''; // allow typing the bare code
}

/* ------------------------------------------------------------------ scanner */
function QrScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingRef = useRef<any>(null);
  const doneRef = useRef(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [manual, setManual] = useState('');
  const [starting, setStarting] = useState(false);
  const [ready, setReady] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    try { zxingRef.current?.reset(); } catch { /* ignore */ }
    zxingRef.current = null;
  }, []);

  /** true when the value was a valid wallet QR (scanning ends), false to keep scanning */
  const accept = useCallback((raw: string) => {
    if (doneRef.current) return true;
    const code = parseCode(raw);
    if (!code) { setHint(tr('This is not a YN Studio wallet QR.', 'នេះមិនមែនជា QR កាបូប YN Studio ទេ។')); return false; }
    doneRef.current = true;
    stop();
    onCode(code);
    return true;
  }, [onCode, stop]);

  const start = useCallback(async () => {
    if (starting || ready) return;
    setStarting(true); setError(''); setHint('');
    try {
      if (!window.isSecureContext) throw new Error(tr('Camera access needs the secure (https) site.', 'ការប្រើកាមេរ៉ាត្រូវការគេហទំព័រសុវត្ថិភាព (https)។'));
      if (!navigator.mediaDevices?.getUserMedia) throw new Error(tr('This device or browser cannot open the camera. You can choose a photo or type the code instead.', 'ឧបករណ៍ ឬកម្មវិធីរុករកនេះមិនអាចបើកកាមេរ៉ាបានទេ។ អ្នកអាចជ្រើសរើសរូបថត ឬបញ្ចូលកូដជំនួស។'));
      const constraints = { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } };
      const Detector = (window as any).BarcodeDetector;
      if (Detector) {
        const detector = new Detector({ formats: ['qr_code'] });
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        setReady(true);
        let last = 0;
        const loop = async () => {
          if (!videoRef.current || !streamRef.current || doneRef.current) return;
          const now = Date.now();
          if (now - last > 150) {
            last = now;
            try {
              const hits = await detector.detect(videoRef.current);
              const value = hits?.[0]?.rawValue;
              if (value && accept(value)) return;
            } catch { /* keep trying */ }
          }
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
        return;
      }
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      zxingRef.current = reader;
      if (!videoRef.current) throw new Error(tr('Camera preview is not ready.', 'ការមើលជាមុនរបស់កាមេរ៉ាមិនទាន់រួចរាល់ទេ។'));
      setReady(true);
      await reader.decodeFromConstraints(constraints, videoRef.current, (result: any) => {
        const text = result?.getText?.();
        if (text) accept(text);
      });
    } catch (e: any) {
      setReady(false);
      setError(e?.name === 'NotAllowedError'
        ? tr('Camera permission was denied. Allow camera access for YN Studio in your phone settings, then try again.', 'ការអនុញ្ញាតកាមេរ៉ាត្រូវបានបដិសេធ។ សូមអនុញ្ញាតកាមេរ៉ាសម្រាប់ YN Studio នៅក្នុងការកំណត់ទូរស័ព្ទ រួចព្យាយាមម្តងទៀត។')
        : e?.message || tr('Unable to open the camera.', 'មិនអាចបើកកាមេរ៉ាបានទេ។'));
      stop();
    } finally { setStarting(false); }
  }, [accept, ready, starting, stop]);

  useEffect(() => () => stop(), [stop]);

  async function fromPhoto(file?: File | null) {
    if (!file) return;
    setHint(''); setError('');
    try {
      const url = URL.createObjectURL(file);
      let value = '';
      const Detector = (window as any).BarcodeDetector;
      if (Detector) {
        const bmp = await createImageBitmap(file);
        value = (await new Detector({ formats: ['qr_code'] }).detect(bmp))?.[0]?.rawValue || '';
      } else {
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        value = (await new BrowserQRCodeReader().decodeFromImageUrl(url))?.getText?.() || '';
      }
      URL.revokeObjectURL(url);
      if (!value) { setHint(tr('No QR code found in that photo.', 'រកមិនឃើញ QR កូដក្នុងរូបថតនោះទេ។')); return; }
      accept(value);
    } catch {
      setHint(tr('No QR code found in that photo.', 'រកមិនឃើញ QR កូដក្នុងរូបថតនោះទេ។'));
    }
  }

  function submitManual() {
    const code = parseCode(manual);
    if (!code) { setHint(tr('That code does not look right. It has 16 letters and numbers.', 'កូដនេះមិនត្រឹមត្រូវទេ។ វាមាន ១៦ តួអក្សរ និងលេខ។')); return; }
    accept(PREFIX + code);
  }

  return (
    <>
      <div className="wqScanHead">
        <span className="wqEyebrow">{tr('SCAN TO SEND', 'ស្កេនដើម្បីផ្ញើ')}</span>
        <h2>{tr('Scan a YN Studio wallet QR', 'ស្កេន QR កាបូប YN Studio')}</h2>
        <p>{tr('Ask the person to open their Wallet page and show their QR.', 'សូមឱ្យអ្នកទទួលបើកទំព័រកាបូប ហើយបង្ហាញ QR របស់គេ។')}</p>
      </div>
      <div className="scannerViewport wqViewport">
        {error ? (
          <div className="scannerFallback">
            <Camera /><b>{tr('Camera unavailable', 'កាមេរ៉ាមិនអាចប្រើបាន')}</b><small>{error}</small>
            <button type="button" onClick={start} disabled={starting}><Camera />{starting ? tr('Opening camera…', 'កំពុងបើកកាមេរ៉ា…') : tr('Try again', 'ព្យាយាមម្តងទៀត')}</button>
          </div>
        ) : (
          <>
            <video ref={videoRef} playsInline muted autoPlay />
            <span className="wqFrame" />
            {!ready && (
              <div className="scannerStart">
                <Camera /><b>{tr('Ready to scan', 'រួចរាល់ដើម្បីស្កេន')}</b>
                <button type="button" onClick={start} disabled={starting}>{starting ? tr('Opening camera…', 'កំពុងបើកកាមេរ៉ា…') : tr('Open camera', 'បើកកាមេរ៉ា')}</button>
              </div>
            )}
          </>
        )}
      </div>
      {hint && <p className="wqHint wqWarn" role="alert">{hint}</p>}
      <div className="wqRow">
        <button type="button" className="wqBtn ghost" onClick={() => fileRef.current?.click()}><ImageIcon />{tr('Choose from photos', 'ជ្រើសរើសពីរូបថត')}</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { fromPhoto(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      <div className="wqManual">
        <label>{tr('Or type the code', 'ឬបញ្ចូលកូដ')}
          <input value={manual} onChange={e => setManual(e.target.value)} placeholder="ABCD1234EFGH5678" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={22}
            onKeyDown={e => { if (e.key === 'Enter') submitManual(); }} />
        </label>
        <button type="button" className="wqBtn" onClick={submitManual} disabled={!manual.trim()}>{tr('Continue', 'បន្ត')}<ChevronRight /></button>
      </div>
      <button type="button" className="wqLink" onClick={() => { stop(); onClose(); }}>{tr('Cancel', 'បោះបង់')}</button>
    </>
  );
}

/* --------------------------------------------------------------- transfer flow */
export function TransferModal({ balances, onClose, onDone }: {
  balances: { usd: number; khr: number };
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<'scan' | 'amount' | 'confirm' | 'done'>('scan');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [looking, setLooking] = useState(false);
  const [cur, setCur] = useState<'USD' | 'KHR'>('USD');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<any>(null);

  const bal = cur === 'KHR' ? balances.khr : balances.usd;
  const n = cur === 'KHR' ? Math.round(Number(amount)) : Math.round(Number(amount) * 100) / 100;
  const min = cur === 'KHR' ? 100 : 0.01;
  const low = n > 0 && n > bal + 1e-9;
  const valid = Number.isFinite(n) && n >= min && !low;
  const presets = cur === 'KHR' ? [10000, 20000, 40000, 100000] : [1, 5, 10, 20];

  const onCode = useCallback(async (c: string) => {
    setLooking(true); setErr('');
    const r = await supabase.rpc('lookup_wallet_recipient', { p_code: c });
    setLooking(false);
    if (r.error) {
      setErr(/lookup_wallet_recipient|schema cache|PGRST202/i.test(r.error.message)
        ? tr('Transfers are not set up yet. Ask the store owner to finish the setup.', 'ការផ្ទេរប្រាក់មិនទាន់ត្រូវបានរៀបចំនៅឡើយទេ។ សូមប្រាប់ម្ចាស់ហាងឱ្យបញ្ចប់ការរៀបចំ។')
        : r.error.message);
      setStep('scan');
      return;
    }
    setCode(c); setName(String((r.data as any)?.name || 'YN Studio customer')); setStep('amount');
  }, []);

  async function send() {
    if (busy || !valid) return;
    setBusy(true); setErr('');
    const r = await supabase.rpc('transfer_wallet_funds', { p_code: code, p_currency: cur, p_amount: n, p_note: note.trim() || null });
    setBusy(false);
    if (r.error) {
      setErr(/transfer_wallet_funds|schema cache|PGRST202/i.test(r.error.message)
        ? tr('Transfers are not set up yet. Ask the store owner to finish the setup.', 'ការផ្ទេរប្រាក់មិនទាន់ត្រូវបានរៀបចំនៅឡើយទេ។ សូមប្រាប់ម្ចាស់ហាងឱ្យបញ្ចប់ការរៀបចំ។')
        : r.error.message);
      setStep('amount');
      return;
    }
    setResult(r.data); setStep('done'); onDone();
  }

  const close = () => { onClose(); };
  const walletName = cur === 'KHR' ? tr('Riel wallet', 'កាបូបរៀល') : tr('Dollar wallet', 'កាបូបដុល្លារ');

  return (
    <div className="scannerOverlay wqOverlay" role="dialog" aria-modal="true">
      <div className="wqCard">
        <button type="button" className="wqClose" aria-label={tr('Close', 'បិទ')} onClick={close}><X /></button>

        {step === 'scan' && (
          <>
            {err && <p className="wqHint wqWarn" role="alert">{err}</p>}
            {looking ? <p className="wqHint">{tr('Looking up…', 'កំពុងស្វែងរក…')}</p> : <QrScanner onCode={onCode} onClose={close} />}
          </>
        )}

        {step === 'amount' && (
          <div className="wqStep">
            <span className="wqEyebrow">{tr('SEND MONEY', 'ផ្ញើប្រាក់')}</span>
            <div className="wqWho"><i>{(name[0] || 'Y').toUpperCase()}</i><div><small>{tr('Sending to', 'ផ្ញើទៅ')}</small><b>{name}</b></div></div>

            <div className="wqTabs" role="tablist">
              <button type="button" className={cur === 'USD' ? 'on' : ''} onClick={() => { setCur('USD'); setAmount(''); setErr(''); }}>
                <span>{tr('Dollar wallet', 'កាបូបដុល្លារ')}</span><small>{fmt(balances.usd, 'USD')}</small>
              </button>
              <button type="button" className={cur === 'KHR' ? 'on' : ''} onClick={() => { setCur('KHR'); setAmount(''); setErr(''); }}>
                <span>{tr('Riel wallet', 'កាបូបរៀល')}</span><small>{fmt(balances.khr, 'KHR')}</small>
              </button>
            </div>

            <div className="wqAmount">
              <span>{cur === 'KHR' ? '៛' : '$'}</span>
              <input type="number" inputMode={cur === 'KHR' ? 'numeric' : 'decimal'} min={min} step={cur === 'KHR' ? 100 : 0.01} value={amount}
                onChange={e => setAmount(e.target.value)} placeholder={cur === 'KHR' ? '0' : '0.00'} aria-label={tr('Amount', 'ចំនួនទឹកប្រាក់')} autoFocus />
            </div>
            <div className="wqChips">
              {presets.map(p => <button type="button" key={p} className={Number(amount) === p ? 'on' : ''} onClick={() => setAmount(String(p))}>{cur === 'KHR' ? p.toLocaleString('en-US') + ' ៛' : '$' + p}</button>)}
            </div>
            {low
              ? <p className="wqHint wqWarn">{tr('Not enough balance', 'សមតុល្យមិនគ្រប់គ្រាន់')} · {tr('Available', 'មាន')} {fmt(bal, cur)}</p>
              : <p className="wqHint">{tr('Available', 'មាន')} {fmt(bal, cur)}</p>}

            <label className="wqNote">{tr('Note (optional)', 'កំណត់ចំណាំ (ស្រេចចិត្ត)')}
              <input value={note} maxLength={60} onChange={e => setNote(e.target.value)} placeholder={tr('e.g. lunch', 'ឧ. អាហារថ្ងៃត្រង់')} />
            </label>
            {err && <p className="wqHint wqWarn" role="alert">{err}</p>}
            <div className="wqRow two">
              <button type="button" className="wqBtn ghost" onClick={() => { setStep('scan'); setErr(''); }}>{tr('Back', 'ថយក្រោយ')}</button>
              <button type="button" className="wqBtn" disabled={!valid} onClick={() => { setErr(''); setStep('confirm'); }}>{tr('Review', 'ពិនិត្យ')}<ChevronRight /></button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="wqStep">
            <span className="wqEyebrow">{tr('CONFIRM', 'បញ្ជាក់')}</span>
            <div className="wqBig">{fmt(n, cur)}</div>
            <dl className="wqSummary">
              <div><dt>{tr('To', 'ទៅ')}</dt><dd>{name}</dd></div>
              <div><dt>{tr('From wallet', 'ពីកាបូប')}</dt><dd>{walletName}</dd></div>
              {note.trim() && <div><dt>{tr('Note', 'កំណត់ចំណាំ')}</dt><dd>{note.trim()}</dd></div>}
            </dl>
            <p className="wqHint">{tr('Only send money to people you know. A transfer cannot be undone.', 'ផ្ញើប្រាក់ទៅកាន់តែអ្នកដែលអ្នកស្គាល់ប៉ុណ្ណោះ។ ការផ្ទេរមិនអាចត្រឡប់វិញបានទេ។')}</p>
            {err && <p className="wqHint wqWarn" role="alert">{err}</p>}
            <div className="wqRow two">
              <button type="button" className="wqBtn ghost" disabled={busy} onClick={() => setStep('amount')}>{tr('Back', 'ថយក្រោយ')}</button>
              <button type="button" className="wqBtn" disabled={busy} onClick={send}>{busy ? tr('Sending…', 'កំពុងផ្ញើ…') : tr('Confirm and send', 'បញ្ជាក់ និងផ្ញើ')}<Send /></button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="wqStep wqDone">
            <div className="wqCheck"><CheckCircle2 /></div>
            <h2>{tr('Sent!', 'បានផ្ញើហើយ!')}</h2>
            <div className="wqBig">{fmt(result?.amount ?? n, cur)}</div>
            <p className="wqHint">{tr('to', 'ទៅ')} <b>{result?.to_name || name}</b></p>
            {result?.balance != null && <p className="wqHint">{walletName}: {fmt(result.balance, cur)}</p>}
            <button type="button" className="wqBtn" onClick={close}>{tr('Done', 'រួចរាល់')}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- my QR panel */
export function WalletQrPanel({ balances, onTransferred }: { balances: { usd: number; khr: number }; onTransferred: () => void }) {
  const [code, setCode] = useState('');
  const [img, setImg] = useState('');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const r = await supabase.rpc('my_wallet_pay_code');
      if (!live) return;
      if (r.error || !r.data) {
        setErr(/my_wallet_pay_code|schema cache|PGRST202/i.test(r.error?.message || '')
          ? tr('QR transfers are not set up yet.', 'ការផ្ទេរតាម QR មិនទាន់ត្រូវបានរៀបចំនៅឡើយទេ។')
          : tr('The QR could not be created.', 'មិនអាចបង្កើត QR បានទេ។'));
        return;
      }
      const c = String(r.data);
      setCode(c);
      try {
        const m: any = await import('qrcode');
        const url: string = await m.toDataURL(PREFIX + c, { margin: 2, width: 560, errorCorrectionLevel: 'M', color: { dark: '#1b1230', light: '#ffffff' } });
        if (live) setImg(url);
      } catch { if (live) setErr(tr('The QR could not be created.', 'មិនអាចបង្កើត QR បានទេ។')); }
    })();
    return () => { live = false; };
  }, []);

  function save() {
    if (!img) return;
    const a = document.createElement('a');
    a.href = img; a.download = 'yn-wallet-qr.png';
    document.body.appendChild(a); a.click(); a.remove();
  }
  async function copy() {
    try { await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { /* ignore */ }
  }

  return (
    <>
      <section className="wqPanel wqAba" aria-label={tr('My QR', 'QR របស់ខ្ញុំ')}>
        <div className="wqAbaHead">
          <span className="wqAbaBrand"><QrCode />{tr('YN Wallet', 'កាបូប YN')}</span>
          <span className="wqEyebrow">{tr('SCAN TO PAY ME', 'ស្កេនដើម្បីផ្ញើមកខ្ញុំ')}</span>
        </div>
        <div className="wqQrBox">
          {img ? <img src={img} alt={tr('Your wallet QR code', 'QR កូដកាបូបរបស់អ្នក')} /> : <div className="wqQrLoading"><QrCode /></div>}
        </div>
        <p className="wqAbaName">{tr('Show this QR to another YN Studio customer to receive money', 'បង្ហាញ QR នេះទៅអតិថិជន YN Studio ម្នាក់ទៀត ដើម្បីទទួលប្រាក់')}</p>
        {code && <p className="wqAbaCode">{code}</p>}
        {err && <p className="wqHint wqWarn" role="alert">{err}</p>}
        <div className="wqAbaActions">
          <button type="button" className="wqAbaBtn primary" onClick={() => setOpen(true)}><ScanLine /><span>{tr('Scan to send', 'ស្កេនដើម្បីផ្ញើ')}</span></button>
          <button type="button" className="wqAbaBtn" onClick={save} disabled={!img}><Download /><span>{tr('Save QR', 'រក្សាទុក QR')}</span></button>
          <button type="button" className="wqAbaBtn" onClick={copy} disabled={!code}><Copy /><span>{copied ? tr('Copied', 'បានចម្លង') : tr('Copy code', 'ចម្លងកូដ')}</span></button>
        </div>
      </section>
      {open && <TransferModal balances={balances} onClose={() => setOpen(false)} onDone={onTransferred} />}
    </>
  );
}
