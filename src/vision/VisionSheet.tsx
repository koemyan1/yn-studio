import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Camera, ImagePlus, RefreshCcw, ScanSearch, SwitchCamera, X } from 'lucide-react';
import { tr } from '../lang';
import { matchPercent } from '../../shared/visionMath.js';
import { searchByImage, visionSupported, VISION_MODEL_MB } from './visionEngine';
import type { VisionGroup, VisionProgress } from './visionEngine';
import type { VisionCatalogItem } from './YNVision';

type Stage = 'pick' | 'camera' | 'working' | 'results' | 'error';
const money = (n: any) => '$' + Number(n || 0).toFixed(2);

export default function VisionSheet({ products, onClose }: { products: VisionCatalogItem[]; onClose: () => void }) {
  const [stage, setStage] = useState<Stage>('pick');
  const [closing, setClosing] = useState(false);
  const [photo, setPhoto] = useState<string>('');           // object URL of the customer's photo (preview only)
  const [groups, setGroups] = useState<VisionGroup[]>([]);
  const [sel, setSel] = useState(0);
  const [prog, setProg] = useState<VisionProgress>({ phase: 'idle', pct: 0 });
  const [camErr, setCamErr] = useState('');
  const [drag, setDrag] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [firstTime, setFirstTime] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const productsRef = useRef(products);
  productsRef.current = products;
  const byId = React.useMemo(() => new Map(products.map(p => [p.id, p])), [products]);

  const close = useCallback(() => {
    abortRef.current?.abort();
    setClosing(true);
    window.setTimeout(onClose, 260);
  }, [onClose]);

  /* Esc closes, page behind does not scroll, everything is released on close. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [close]);
  useEffect(() => () => { stopCamera(); abortRef.current?.abort(); }, []);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);

  /* If the model was downloaded on an earlier visit this is instant; tell the customer the truth about the first time. */
  useEffect(() => {
    (async () => {
      try {
        const keys = await (window.caches?.keys?.() ?? Promise.resolve([] as string[]));
        for (const k of keys) { if (/transformers/i.test(k) && (await (await caches.open(k)).keys()).length) { setFirstTime(false); return; } }
      } catch { /* unknown = assume first time */ }
    })();
  }, []);

  function stopCamera() { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; }

  async function startCamera(face: 'environment' | 'user' = facing) {
    setCamErr(''); stopCamera();
    if (!navigator.mediaDevices?.getUserMedia) { setCamErr(tr('Camera not available', 'កាមេរ៉ាមិនអាចប្រើបាន')); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: face }, width: { ideal: 1280 } }, audio: false });
      streamRef.current = s;
      setStage('camera'); setFacing(face);
      requestAnimationFrame(() => { const v = videoRef.current; if (v) { v.srcObject = s; v.play().catch(() => {}); } });
    } catch {
      setCamErr(tr('Camera blocked. Allow it or upload.', 'កាមេរ៉ាត្រូវបានបិទ។ សូមអនុញ្ញាត ឬផ្ទុកឡើង។'));
      setStage('pick');
    }
  }
  function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    c.toBlob(b => { if (b) { stopCamera(); run(b); } }, 'image/jpeg', 0.92);
  }

  async function run(file: Blob) {
    if (!file.type.startsWith('image/')) { setCamErr(tr('Choose a picture', 'ជ្រើសរើសរូបភាព')); setStage('pick'); return; }
    abortRef.current?.abort();
    const ac = new AbortController(); abortRef.current = ac;
    setPhoto(URL.createObjectURL(file)); setGroups([]); setSel(0); setCamErr('');
    setProg({ phase: 'model', pct: 0 }); setStage('working');
    try {
      const res = await searchByImage(file, productsRef.current, p => { if (!ac.signal.aborted) setProg(p); }, ac.signal);
      if (ac.signal.aborted) return;
      setGroups(res); setProg({ phase: 'done', pct: 100 }); setStage('results');
    } catch (e: any) {
      if (ac.signal.aborted || e?.name === 'AbortError') return;
      console.error('YN Vision', e);
      setStage('error');
    }
  }
  function again() { abortRef.current?.abort(); setStage('pick'); setGroups([]); setPhoto(''); if (fileRef.current) fileRef.current.value = ''; }
  function onFile(f?: File | null) { if (f) run(f); }

  const supported = visionSupported();
  const g = groups[Math.min(sel, groups.length - 1)];
  /* a small square of the photo that shows one detected item */
  const chip = (b: VisionGroup['box']): React.CSSProperties => ({
    backgroundImage: `url(${photo})`, backgroundRepeat: 'no-repeat',
    backgroundSize: `${100 / b.w}% ${100 / b.h}%`,
    backgroundPosition: `${b.w >= 1 ? 0 : (b.x / (1 - b.w)) * 100}% ${b.h >= 1 ? 0 : (b.y / (1 - b.h)) * 100}%`,
  });

  const sheet = <div className={'visionRoot' + (closing ? ' out' : '')} role="dialog" aria-modal="true" aria-label="YN Vision">
    <div className="visionScrim" onClick={close} />
    <section className="visionSheet">
      <i className="visionGrab" aria-hidden="true" />
      <header className="visionHead">
        <div className="visionTitle"><span className="visionLogo"><ScanSearch /></span><h2>YN Vision</h2></div>
        <button type="button" className="visionIconBtn" onClick={close} aria-label={tr('Close', 'បិទ')}><X /></button>
      </header>

      {stage === 'pick' && <div className="visionBody visionPick"
        onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files?.[0]); }}>
        <div className={'visionDrop' + (drag ? ' on' : '')}><div className="visionOrb"><ScanSearch /></div></div>
        {(camErr || !supported) && <p className="visionNote warn" role="alert">{camErr || tr('Browser not supported', 'កម្មវិធីរុករកមិនគាំទ្រ')}</p>}
        <div className="visionActions">
          <button type="button" className="visionBtnMain" disabled={!supported} onClick={() => startCamera()}><Camera />{tr('Camera', 'កាមេរ៉ា')}</button>
          <button type="button" className="visionBtnGlass" disabled={!supported} onClick={() => fileRef.current?.click()}><ImagePlus />{tr('Photo', 'រូបថត')}</button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => onFile(e.target.files?.[0])} />
        {firstTime && <small className="visionTiny">{tr(`Free AI · ~${VISION_MODEL_MB} MB once`, `AI ឥតគិតថ្លៃ · ~${VISION_MODEL_MB} MB ម្តង`)}</small>}
      </div>}

      {stage === 'camera' && <div className="visionBody visionCam">
        <div className="visionViewport">
          <video ref={videoRef} playsInline muted autoPlay />
          <i className="visionCorner tl" /><i className="visionCorner tr" /><i className="visionCorner bl" /><i className="visionCorner br" />
        </div>
        <div className="visionCamBar">
          <button type="button" className="visionIconBtn" onClick={() => { stopCamera(); setStage('pick'); }} aria-label={tr('Back', 'ត្រឡប់')}><X /></button>
          <button type="button" className="visionShutter" onClick={snap} aria-label={tr('Take photo', 'ថតរូប')}><i /></button>
          <button type="button" className="visionIconBtn" onClick={() => startCamera(facing === 'environment' ? 'user' : 'environment')} aria-label={tr('Switch camera', 'ប្តូរកាមេរ៉ា')}><SwitchCamera /></button>
        </div>
      </div>}

      {stage === 'working' && <div className="visionBody visionWork" aria-live="polite">
        <div className="visionScan">{photo && <img src={photo} alt="" />}<i className="visionBeam" /></div>
        <div className="visionBar" role="progressbar" aria-valuenow={prog.pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: Math.max(4, prog.pct) + '%' }} /></div>
        <small className="visionTiny">{prog.phase === 'index' && prog.total ? `${prog.done}/${prog.total}` : prog.pct + '%'}</small>
      </div>}

      {stage === 'results' && <div className="visionBody visionRes">
        <div className="visionPhoto">
          <img src={photo} alt="" />
          {groups.map((x, i) => <button type="button" key={i} className={'visionMark' + (i === sel ? ' on' : '')} aria-label={String(i + 1)}
            style={{ left: x.box.x * 100 + '%', top: x.box.y * 100 + '%', width: x.box.w * 100 + '%', height: x.box.h * 100 + '%' }} onClick={() => setSel(i)}>{groups.length > 1 && <b>{i + 1}</b>}</button>)}
          <button type="button" className="visionIconBtn visionRetake" onClick={again} aria-label={tr('New photo', 'រូបថតថ្មី')}><RefreshCcw /></button>
        </div>
        {groups.length > 1 && <div className="visionTabs" role="tablist">
          {groups.map((x, i) => <button type="button" role="tab" aria-selected={i === sel} key={i} className={i === sel ? 'on' : ''} onClick={() => setSel(i)}><i style={chip(x.box)} /><b>{i + 1}</b></button>)}
        </div>}
        {!g && <p className="visionEmpty">{tr('No match', 'រកមិនឃើញ')}</p>}
        {g && <div className="visionGrid" key={sel}>
          {g.hits.map((h, i) => { const p = byId.get(h.id); if (!p) return null; const cur = p.display_price ?? p.price;
            return <Link key={h.id} to={'/product/' + h.id} className="visionCard" style={{ '--i': i } as React.CSSProperties} onClick={close}>
              <div className="visionImg"><img src={p.main_image_url} alt={p.name} loading="lazy" decoding="async" /><b className="visionPct">{matchPercent(h.score)}%</b></div>
              <strong>{p.name}</strong><span>{money(cur)}{p.original_price && p.original_price > Number(cur) ? <del>{money(p.original_price)}</del> : null}</span>
            </Link>; })}
        </div>}
      </div>}

      {stage === 'error' && <div className="visionBody visionPick">
        <div className="visionDrop"><div className="visionOrb err"><X /></div></div>
        <p className="visionNote warn" role="alert">{tr('Needs internet once. Try again.', 'ត្រូវការអ៊ីនធឺណិតម្តង។ សាកម្តងទៀត។')}</p>
        <div className="visionActions"><button type="button" className="visionBtnMain" onClick={again}><RefreshCcw />{tr('Retry', 'សាកម្តងទៀត')}</button></div>
      </div>}
    </section>
  </div>;

  return createPortal(sheet, document.body);
}

