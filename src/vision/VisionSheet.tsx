import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Camera, ImagePlus, RefreshCcw, ScanSearch, ShieldCheck, SwitchCamera, X, Zap } from 'lucide-react';
import { tr } from '../lang';
import { matchPercent } from '../../shared/visionMath.js';
import { searchByImage, visionSupported, VISION_MODEL_MB } from './visionEngine';
import type { VisionHit, VisionProgress } from './visionEngine';
import type { VisionCatalogItem } from './YNVision';

type Stage = 'pick' | 'camera' | 'working' | 'results' | 'error';
const money = (n: any) => '$' + Number(n || 0).toFixed(2);

export default function VisionSheet({ products, onClose }: { products: VisionCatalogItem[]; onClose: () => void }) {
  const [stage, setStage] = useState<Stage>('pick');
  const [closing, setClosing] = useState(false);
  const [photo, setPhoto] = useState<string>('');           // object URL of the customer's photo (preview only)
  const [hits, setHits] = useState<VisionHit[]>([]);
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
    if (!navigator.mediaDevices?.getUserMedia) { setCamErr(tr('Camera is not available here. Use "Upload photo" instead.', 'កាមេរ៉ាមិនអាចប្រើបានទេ។ សូមប្រើ «ផ្ទុកឡើងរូបថត» ជំនួស។')); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: face }, width: { ideal: 1280 } }, audio: false });
      streamRef.current = s;
      setStage('camera'); setFacing(face);
      requestAnimationFrame(() => { const v = videoRef.current; if (v) { v.srcObject = s; v.play().catch(() => {}); } });
    } catch {
      setCamErr(tr('Camera permission was blocked. Allow the camera, or use "Upload photo".', 'ការអនុញ្ញាតកាមេរ៉ាត្រូវបានបិទ។ សូមអនុញ្ញាតកាមេរ៉ា ឬប្រើ «ផ្ទុកឡើងរូបថត»។'));
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
    if (!file.type.startsWith('image/')) { setCamErr(tr('Please choose a picture file.', 'សូមជ្រើសរើសឯកសាររូបភាព។')); setStage('pick'); return; }
    abortRef.current?.abort();
    const ac = new AbortController(); abortRef.current = ac;
    setPhoto(URL.createObjectURL(file)); setHits([]); setCamErr('');
    setProg({ phase: 'model', pct: 0 }); setStage('working');
    try {
      const res = await searchByImage(file, productsRef.current, p => { if (!ac.signal.aborted) setProg(p); }, ac.signal);
      if (ac.signal.aborted) return;
      setHits(res); setProg({ phase: 'done', pct: 100 }); setStage('results');
    } catch (e: any) {
      if (ac.signal.aborted || e?.name === 'AbortError') return;
      console.error('YN Vision', e);
      setStage('error');
    }
  }
  function again() { abortRef.current?.abort(); setStage('pick'); setHits([]); setPhoto(''); if (fileRef.current) fileRef.current.value = ''; }
  function onFile(f?: File | null) { if (f) run(f); }

  const supported = visionSupported();
  const phaseText = prog.phase === 'model'
    ? tr('Waking up YN Vision AI…', 'កំពុងបើក YN Vision AI…')
    : prog.phase === 'index'
      ? tr(`Learning the catalog ${prog.done}/${prog.total}`, `កំពុងរៀនកាតាឡុក ${prog.done}/${prog.total}`)
      : tr('Finding look-alikes…', 'កំពុងស្វែងរកទំនិញដូចគ្នា…');

  const sheet = <div className={'visionRoot' + (closing ? ' out' : '')} role="dialog" aria-modal="true" aria-label="YN Vision">
    <div className="visionScrim" onClick={close} />
    <section className="visionSheet">
      <i className="visionGrab" aria-hidden="true" />
      <header className="visionHead">
        <div className="visionTitle"><span className="visionLogo"><ScanSearch /></span><div><h2>YN Vision</h2><small>{tr('Search with a photo', 'ស្វែងរកដោយរូបថត')}</small></div></div>
        <button type="button" className="visionIconBtn" onClick={close} aria-label={tr('Close', 'បិទ')}><X /></button>
      </header>

      {stage === 'pick' && <div className="visionBody visionPick"
        onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files?.[0]); }}>
        <div className={'visionDrop' + (drag ? ' on' : '')}>
          <div className="visionOrb"><ScanSearch /></div>
          <h3>{tr('Show us what you love', 'បង្ហាញយើងនូវអ្វីដែលអ្នកចូលចិត្ត')}</h3>
          <p>{tr('Take or upload a photo and the AI finds similar products from YN Studio.', 'ថត ឬផ្ទុកឡើងរូបថត ហើយ AI នឹងរកទំនិញស្រដៀងគ្នាពី YN Studio។')}</p>
        </div>
        {!supported && <p className="visionNote warn">{tr('This browser cannot run YN Vision. Please update your browser.', 'កម្មវិធីរុករកនេះមិនអាចដំណើរការ YN Vision បានទេ។ សូមធ្វើបច្ចុប្បន្នភាព។')}</p>}
        {camErr && <p className="visionNote warn" role="alert">{camErr}</p>}
        <div className="visionActions">
          <button type="button" className="visionBtnMain" disabled={!supported} onClick={() => startCamera()}><Camera />{tr('Take photo', 'ថតរូប')}</button>
          <button type="button" className="visionBtnGlass" disabled={!supported} onClick={() => fileRef.current?.click()}><ImagePlus />{tr('Upload photo', 'ផ្ទុកឡើងរូបថត')}</button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => onFile(e.target.files?.[0])} />
        <ul className="visionTrust">
          <li><ShieldCheck />{tr('Your photo stays on your phone', 'រូបថតរបស់អ្នកស្ថិតនៅលើទូរសព្ទអ្នក')}</li>
          <li><Zap />{firstTime
            ? tr(`First use downloads a free ~${VISION_MODEL_MB} MB AI model (once). Wi-Fi recommended.`, `ការប្រើលើកដំបូងទាញយកម៉ូឌែល AI ឥតគិតថ្លៃ ~${VISION_MODEL_MB} MB (ម្តង)។ ណែនាំឱ្យប្រើ Wi-Fi។`)
            : tr('AI is ready on this device', 'AI រួចរាល់នៅលើឧបករណ៍នេះ')}</li>
        </ul>
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
        <h3>{phaseText}</h3>
        <div className="visionBar" role="progressbar" aria-valuenow={prog.pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: Math.max(4, prog.pct) + '%' }} /></div>
        {prog.phase === 'model' && firstTime && <small>{tr(`Downloading free AI model (~${VISION_MODEL_MB} MB, first time only) · ${prog.pct}%`, `កំពុងទាញយកម៉ូឌែល AI ឥតគិតថ្លៃ (~${VISION_MODEL_MB} MB, ម្តងប៉ុណ្ណោះ) · ${prog.pct}%`)}</small>}
        {prog.phase === 'index' && <small>{tr('One-time setup on this device, next searches are instant.', 'ការរៀបចំម្តងលើឧបករណ៍នេះ ការស្វែងរកបន្ទាប់នឹងលឿន។')}</small>}
      </div>}

      {stage === 'results' && <div className="visionBody visionRes">
        <div className="visionResHead">
          {photo && <img className="visionThumb" src={photo} alt="" />}
          <div><h3>{hits.length ? tr(`${hits.length} similar products`, `ទំនិញស្រដៀងគ្នា ${hits.length}`) : tr('No close match', 'រកមិនឃើញទំនិញដូចគ្នា')}</h3>
            <small>{hits.length ? tr('Best match first', 'ដូចបំផុតមុនគេ') : tr('Try a clearer photo with the item in the middle.', 'សូមសាកល្បងរូបថតច្បាស់ជាងនេះ ដោយដាក់ទំនិញនៅកណ្តាល។')}</small></div>
          <button type="button" className="visionIconBtn" onClick={again} aria-label={tr('New photo', 'រូបថតថ្មី')}><RefreshCcw /></button>
        </div>
        <div className="visionGrid">
          {hits.map((h, i) => { const p = byId.get(h.id); if (!p) return null; const cur = p.display_price ?? p.price;
            return <Link key={h.id} to={'/product/' + h.id} className="visionCard" style={{ '--i': i } as React.CSSProperties} onClick={close}>
              <div className="visionImg"><img src={p.main_image_url} alt={p.name} loading="lazy" decoding="async" /><b className="visionPct">{matchPercent(h.score)}%</b></div>
              <strong>{p.name}</strong><span>{money(cur)}{p.original_price && p.original_price > Number(cur) ? <del>{money(p.original_price)}</del> : null}</span>
            </Link>; })}
        </div>
      </div>}

      {stage === 'error' && <div className="visionBody visionPick">
        <div className="visionDrop"><div className="visionOrb err"><X /></div>
          <h3>{tr('Could not run AI search', 'មិនអាចស្វែងរកដោយ AI បានទេ')}</h3>
          <p>{tr('Check your internet for the one-time model download, then try again. Normal text search still works.', 'សូមពិនិត្យអ៊ីនធឺណិតសម្រាប់ការទាញយកម៉ូឌែលម្តង ហើយព្យាយាមម្តងទៀត។ ការស្វែងរកអក្សរនៅតែប្រើបាន។')}</p></div>
        <div className="visionActions"><button type="button" className="visionBtnMain" onClick={again}><RefreshCcw />{tr('Try again', 'ព្យាយាមម្តងទៀត')}</button></div>
      </div>}
    </section>
  </div>;

  return createPortal(sheet, document.body);
}

