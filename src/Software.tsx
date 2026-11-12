import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUp, Check, Download, Laptop, Link2, Lock, Monitor, MousePointerClick, Package, Pencil, Play,
  Plus, QrCode, Smartphone, Sparkles, Terminal, Trash2, Upload, Video, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from './supabase';
import { isKm, tr, useLang } from './lang';
import './software.css';
import './serviceShop.css';

/* ---------------------------------------------------------------------------------------------
   Software downloads: /services/software (customer) and Admin -> Software downloads.
   Setup: docs/setup/SOFTWARE-DOWNLOADS-SETUP.md, SQL: supabase-software-downloads.sql
   The customer sees the catalog only. The file location never reaches the browser until the server has seen the payment.
   --------------------------------------------------------------------------------------------- */

type Shell = React.ComponentType<{ title: string; children: React.ReactNode }>;
type Api = (path: string, body?: any) => Promise<any>;
type Chrome = {
  Top: React.ComponentType<{ title?: string; back?: boolean }>; Nav: React.ComponentType;
  api?: Api; bakongOn?: boolean | null; PayModal?: React.ComponentType<any>;
};

const PLATFORMS: Record<string, { Icon: LucideIcon; ink: string; fg: string; en: string; km: string }> = {
  windows: { Icon: Monitor, ink: '#0a84e8', fg: '#fff', en: 'Windows', km: 'វីនដូ' },
  mac: { Icon: Laptop, ink: '#2b2b33', fg: '#fff', en: 'Mac', km: 'ម៉ាក' },
  android: { Icon: Smartphone, ink: '#2fa84f', fg: '#fff', en: 'Android', km: 'អ៊ែនឌ្រយដ៍' },
  ios: { Icon: Smartphone, ink: '#e5007d', fg: '#fff', en: 'iPhone / iPad', km: 'អាយហ្វូន / អាយប៉ាត' },
  linux: { Icon: Terminal, ink: '#f2b705', fg: '#241b35', en: 'Linux', km: 'លីនុច' },
  other: { Icon: Package, ink: '#7c3aed', fg: '#fff', en: 'Other', km: 'ផ្សេងៗ' },
};
const plat = (k: string) => PLATFORMS[k] || PLATFORMS.other;
const money = (n: any) => '$' + Number(n || 0).toFixed(2);
const errText = (e: any) => String(e?.message || e || 'Something went wrong.');
const pick = (en: string, km?: string | null) => (isKm() && km ? km : en);

export function fmtSize(b?: number | null) {
  const n = Number(b || 0);
  if (!n) return '';
  if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
  return (n / 1024 / 1024 / 1024).toFixed(1) + ' GB';
}

/** Turns any YouTube link into its id, or '' when it is not a YouTube link. */
export function youtubeId(url: string): string {
  const m = String(url || '').trim().match(/^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})(?:[?&#/].*)?$/i);
  return m ? m[1] : '';
}

/* ============================================ CUSTOMER ============================================ */

function useReveal(dep: unknown) {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.swPage [data-rv]:not(.in)'));
    if (!els.length) return;
    if (typeof IntersectionObserver === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { els.forEach(e => e.classList.add('in')); return; }
    const io = new IntersectionObserver(list => list.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.12 });
    els.forEach(e => io.observe(e));
    return () => io.disconnect();
  }, [dep]);
}

function Hero({ count }: { count: number }) {
  const fly = [Monitor, Laptop, Smartphone, Terminal, Package];
  return (
    <section className="swHero" aria-labelledby="swTitle">
      <i className="swBlob a" /><i className="swBlob b" />
      <div className="swFly" aria-hidden="true">{fly.map((I, i) => <span key={i} style={{ ['--k' as any]: i }}><I /></span>)}</div>
      <div className="swOrbWrap" aria-hidden="true">
        <div className="swRing" />
        <div className="swOrb"><Download className="swArrow" /><i className="swTray" /></div>
        <span className="swTag">$1</span>
      </div>
      <h1 id="swTitle">{tr('Software. $1 a file.', 'កម្មវិធី។ $1 ក្នុងមួយឯកសារ។')}</h1>
      <p>{count ? tr('Pick it, pay, download. Yours to keep.', 'ជ្រើសរើស ទូទាត់ ទាញយក។ ជារបស់អ្នកជារៀងរហូត។') : tr('New files are coming soon.', 'ឯកសារថ្មីៗនឹងមកដល់ឆាប់ៗនេះ។')}</p>
    </section>
  );
}

function Steps() {
  const s: [LucideIcon, string, string][] = [
    [MousePointerClick, tr('Pick', 'ជ្រើសរើស'), '1'], [QrCode, tr('Pay $1', 'បង់ $1'), '2'], [Download, tr('Download', 'ទាញយក'), '3'],
  ];
  return (
    <ol className="swSteps" data-rv aria-label={tr('How it works', 'របៀបដំណើរការ')}>
      {s.map(([I, t, n], i) => <li key={n} style={{ ['--i' as any]: i }}><span className="swStepIc"><I /><b>{n}</b></span><em>{t}</em></li>)}
    </ol>
  );
}

function VideoModal({ f, owned, busy, onClose, onBuy, onGet }: { f: any; owned: boolean; busy: boolean; onClose: () => void; onBuy: () => void; onGet: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [onClose]);
  const yt = f.video_kind === 'youtube' ? youtubeId(f.video_url) : '';
  return (
    <div className="swScrim" onClick={onClose} role="dialog" aria-modal="true" aria-label={tr('How to download', 'របៀបទាញយក')}>
      <div className="swVideoCard" onClick={e => e.stopPropagation()} style={{ ['--sw' as any]: plat(f.platform).ink }}>
        <button type="button" className="swClose" onClick={onClose} aria-label={tr('Close', 'បិទ')}><X /></button>
        <div className="swVideoBox">
          {yt
            ? <iframe src={`https://www.youtube-nocookie.com/embed/${yt}?rel=0&modestbranding=1`} title={pick(f.title_en, f.title_km)} allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
            : <video src={f.video_url} controls playsInline preload="metadata" autoPlay />}
        </div>
        <div className="swVideoFoot">
          <div><small>{tr('How to download', 'របៀបទាញយក')}</small><b>{pick(f.title_en, f.title_km)}</b></div>
          {owned
            ? <button type="button" className="swBtn dl" onClick={onGet}><Download />{tr('Download', 'ទាញយក')}</button>
            : <button type="button" className="swBtn buy" disabled={busy} onClick={onBuy}>{tr('Get for', 'ទិញក្នុងតម្លៃ')} {money(f.price)}</button>}
        </div>
      </div>
    </div>
  );
}

export default function SoftwarePage({ Top, Nav, api, bakongOn, PayModal }: Chrome) {
  useLang();
  const [files, setFiles] = useState<any[] | null>(null);
  const [broken, setBroken] = useState(false);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('all');
  const [pay, setPay] = useState<string | null>(null);
  const [video, setVideo] = useState<any | null>(null);
  const [dl, setDl] = useState<{ id: string; state: 'busy' | 'done' } | null>(null);
  const [msg, setMsg] = useState('');
  const uid = useRef('');

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    uid.current = data.user?.id || '';
    const f = await supabase.from('software_files').select('*').eq('enabled', true).order('sort_order').order('created_at');
    if (f.error) { setBroken(true); setFiles([]); return; }
    setBroken(false); setFiles((f.data as any[]) || []);
    if (uid.current) {
      const p = await supabase.from('software_purchases').select('file_id').eq('user_id', uid.current).eq('status', 'paid');
      if (!p.error) setOwned(new Set(((p.data as any[]) || []).map(r => r.file_id)));
    }
  }, []);
  useEffect(() => { load().catch(() => { setBroken(true); setFiles([]); }); }, [load]);
  useEffect(() => {   // the card flips to "Download" the moment the server confirms the payment
    const ch = supabase.channel('sw-purchases').on('postgres_changes', { event: '*', schema: 'public', table: 'software_purchases' }, () => { load().catch(() => {}); }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);
  useEffect(() => { if (!msg) return; const t = window.setTimeout(() => setMsg(''), 4500); return () => window.clearTimeout(t); }, [msg]);

  const platforms = useMemo(() => Array.from(new Set((files || []).map(f => f.platform))), [files]);
  const shown = useMemo(() => (files || []).filter(f => filter === 'all' || f.platform === filter), [files, filter]);
  useReveal(filter + ':' + shown.length + ':' + (files ? 1 : 0));

  const canPay = !!(api && PayModal && bakongOn !== false);
  const buy = (f: any) => { if (!canPay) { setMsg(tr('Payments are not available right now. Please try again later.', 'ការទូទាត់មិនទាន់អាចប្រើបានទេ។ សូមព្យាយាមម្តងទៀតពេលក្រោយ។')); return; } setVideo(null); setPay(f.id); };
  async function download(f: any) {
    if (!api) return;
    setVideo(null); setDl({ id: f.id, state: 'busy' });
    try {
      const j = await api('/api/software/download', { file_id: f.id });
      if (!/^https:\/\//i.test(String(j.url || ''))) throw new Error('bad link');
      if (j.kind === 'link') window.open(j.url, '_blank', 'noopener');
      else { const a = document.createElement('a'); a.href = j.url; a.rel = 'noopener'; a.download = j.name || ''; document.body.appendChild(a); a.click(); a.remove(); }
      setDl({ id: f.id, state: 'done' });
      window.setTimeout(() => setDl(d => (d?.id === f.id ? null : d)), 2800);
    } catch (e) { setDl(null); setMsg(errText(e)); }
  }

  return (
    <>
      <main className="shop swPage">
        <Top title={tr('Software', 'កម្មវិធី')} back />
        <Hero count={(files || []).length} />
        <Steps />
        {msg && <p className="swToast" role="alert">{msg}</p>}

        {platforms.length > 1 && (
          <div className="swFilters" role="tablist" aria-label={tr('Platform', 'ប្រព័ន្ធ')}>
            <button type="button" role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>{tr('All', 'ទាំងអស់')}</button>
            {platforms.map(p => { const P = plat(p); return <button key={p} type="button" role="tab" aria-selected={filter === p} className={filter === p ? 'on' : ''} onClick={() => setFilter(p)}><P.Icon />{tr(P.en, P.km)}</button>; })}
          </div>
        )}

        {files === null && <div className="swSkel" aria-hidden="true"><i /><i /></div>}
        {broken && <p className="swEmpty">{tr('Software downloads are not set up yet.', 'ការទាញយកកម្មវិធីមិនទាន់រៀបចំនៅឡើយទេ។')}</p>}
        {files && !broken && files.length === 0 && (
          <div className="swEmpty" data-rv><Sparkles /><b>{tr('Nothing here yet', 'មិនទាន់មានអ្វីនៅទីនេះទេ')}</b><small>{tr('Check back soon.', 'សូមត្រឡប់មកវិញឆាប់ៗ។')}</small></div>
        )}

        <div className="swList">
          {shown.map((f, i) => {
            const P = plat(f.platform), mine = owned.has(f.id), st = dl && dl.id === f.id ? dl.state : null;
            return (
              <article key={f.id} className="swCard" data-owned={mine ? '1' : undefined} data-rv style={{ ['--sw' as any]: P.ink, ['--sw-fg' as any]: P.fg, ['--i' as any]: i % 6 }}>
                <div className="swIcon"><P.Icon />{mine && <span className="swOwn"><Check /></span>}</div>
                <div className="swBody">
                  <h3>{pick(f.title_en, f.title_km)}</h3>
                  {(f.desc_en || f.desc_km) && <p>{pick(f.desc_en, f.desc_km)}</p>}
                  <ul className="swMeta">
                    <li>{tr(P.en, P.km)}</li>
                    {f.version && <li>v{f.version}</li>}
                    {fmtSize(f.file_size) && <li>{fmtSize(f.file_size)}</li>}
                  </ul>
                  <div className="swActions">
                    {mine
                      ? <button type="button" className={'swBtn dl' + (st ? ' ' + st : '')} disabled={st === 'busy'} onClick={() => download(f)}>
                          <span className="swBtnFill" aria-hidden="true" />
                          <span className="swBtnTxt">{st === 'done' ? <><Check />{tr('Started!', 'បានចាប់ផ្តើម!')}</> : st === 'busy' ? tr('Preparing…', 'កំពុងរៀបចំ…') : <><Download />{tr('Download', 'ទាញយក')}</>}</span>
                          {st === 'done' && <span className="swPop" aria-hidden="true">{Array.from({ length: 8 }, (_, k) => <i key={k} style={{ ['--a' as any]: k * 45 + 'deg' }} />)}</span>}
                        </button>
                      : <button type="button" className="swBtn buy" onClick={() => buy(f)}><Lock />{tr('Get for', 'ទិញក្នុងតម្លៃ')} <b>{money(f.price)}</b></button>}
                    {f.video_url && <button type="button" className="swBtn how" onClick={() => setVideo(f)}><Play />{tr('How to', 'របៀប')}</button>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </main>
      {video && <VideoModal f={video} owned={owned.has(video.id)} busy={false} onClose={() => setVideo(null)} onBuy={() => buy(video)} onGet={() => download(video)} />}
      {pay && PayModal && <PayModal sw={{ fileId: pay }} onClose={() => { setPay(null); load().catch(() => {}); }} onPaid={() => { setPay(null); load().catch(() => {}); }} />}
      <Nav />
    </>
  );
}

/* ============================================ ADMIN ============================================ */

const BUCKET_FILES = 'software-files', BUCKET_VIDEOS = 'software-guides';
const MAX_UPLOAD_MB = 50;
const cleanName = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'file';
const encPath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

/** Uploads straight to Supabase Storage with XMLHttpRequest so the admin sees a real progress bar. */
async function uploadWithProgress(bucket: string, path: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!token || !url || !anon) throw new Error('Please sign in again.');
  await new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', `${url}/storage/v1/object/${bucket}/${encPath(path)}`);
    x.setRequestHeader('Authorization', 'Bearer ' + token);
    x.setRequestHeader('apikey', anon);
    x.setRequestHeader('x-upsert', 'false');
    x.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    x.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    x.onload = () => { if (x.status >= 200 && x.status < 300) { onProgress(100); resolve(); } else { let m = 'Upload failed (' + x.status + ').'; try { m = JSON.parse(x.responseText).message || m; } catch { /* keep default */ } reject(new Error(m)); } };
    x.onerror = () => reject(new Error('Upload failed. Check your connection.'));
    x.send(file);
  });
}

type Draft = {
  id: string; isNew: boolean;
  title_en: string; title_km: string; desc_en: string; desc_km: string; platform: string; version: string; price: string; enabled: boolean;
  srcKind: 'upload' | 'link'; link: string; file: File | null; hasFile: boolean; fileName: string; fileSize: number | null;
  vidKind: 'none' | 'upload' | 'youtube'; vidLink: string; vidFile: File | null; vidUrl: string;
};
const blank = (): Draft => ({
  id: crypto.randomUUID(), isNew: true, title_en: '', title_km: '', desc_en: '', desc_km: '', platform: 'windows', version: '', price: '1.00', enabled: true,
  srcKind: 'upload', link: '', file: null, hasFile: false, fileName: '', fileSize: null, vidKind: 'none', vidLink: '', vidFile: null, vidUrl: '',
});

function Editor({ d0, src0, onClose, onSaved }: { d0: Draft; src0: any; onClose: () => void; onSaved: (t: string) => void }) {
  const [d, setD] = useState<Draft>(d0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pct, setPct] = useState<{ file: number; vid: number }>({ file: 0, vid: 0 });
  const set = (p: Partial<Draft>) => setD(x => ({ ...x, ...p }));
  const fileRef = useRef<HTMLInputElement>(null), vidRef = useRef<HTMLInputElement>(null);

  function chooseFile(f: File | null) {
    if (!f) return;
    if (f.size > MAX_UPLOAD_MB * 1024 * 1024) { setErr(`"${f.name}" is bigger than ${MAX_UPLOAD_MB} MB. Put it on Google Drive or Mega and use "Paste a link" instead.`); return; }
    setErr(''); set({ file: f, fileName: f.name, fileSize: f.size });
  }
  function chooseVideo(f: File | null) {
    if (!f) return;
    if (f.size > MAX_UPLOAD_MB * 1024 * 1024) { setErr(`The video is bigger than ${MAX_UPLOAD_MB} MB. Upload it to YouTube (Unlisted is fine) and paste the link.`); return; }
    if (!/^video\/(mp4|webm|quicktime)$/.test(f.type)) { setErr('Use an MP4 or WebM video.'); return; }
    setErr(''); set({ vidFile: f });
  }

  async function save() {
    setErr('');
    const price = Number(d.price);
    if (!d.title_en.trim()) return setErr('Write a title (English).');
    if (!(price >= 0.01 && price <= 100)) return setErr('The price must be between $0.01 and $100.');
    if (d.srcKind === 'link' && !/^https:\/\/\S+$/i.test(d.link.trim())) return setErr('The download link must start with https://');
    if (d.srcKind === 'upload' && !d.file && !(src0?.kind === 'upload' && src0.file_path)) {
      if (d.enabled) return setErr('Choose the file to upload first (or switch the file off for now).');
    }
    if (d.vidKind === 'youtube' && !youtubeId(d.vidLink)) return setErr('That is not a YouTube link. Example: https://youtu.be/abc12345678');
    if (d.vidKind === 'upload' && !d.vidFile && !d.vidUrl) return setErr('Choose the video file, or pick "No video".');
    setBusy(true);
    const uploaded: { bucket: string; path: string }[] = [];
    try {
      let file_path: string | null = src0?.kind === 'upload' ? src0.file_path : null;
      let file_name = d.fileName, file_size = d.fileSize;
      let video_url: string | null = null;
      if (d.srcKind === 'upload' && d.file) {
        const path = `${d.id}/${crypto.randomUUID()}-${cleanName(d.file.name)}`;
        await uploadWithProgress(BUCKET_FILES, path, d.file, v => setPct(p => ({ ...p, file: v })));
        uploaded.push({ bucket: BUCKET_FILES, path }); file_path = path; file_name = d.file.name; file_size = d.file.size;
      }
      if (d.srcKind === 'link') { file_name = file_name || 'download'; }
      if (d.vidKind === 'upload') {
        if (d.vidFile) {
          const path = `${d.id}/${crypto.randomUUID()}-${cleanName(d.vidFile.name)}`;
          await uploadWithProgress(BUCKET_VIDEOS, path, d.vidFile, v => setPct(p => ({ ...p, vid: v })));
          uploaded.push({ bucket: BUCKET_VIDEOS, path });
          video_url = supabase.storage.from(BUCKET_VIDEOS).getPublicUrl(path).data.publicUrl;
        } else video_url = d.vidUrl;
      } else if (d.vidKind === 'youtube') video_url = `https://www.youtube.com/watch?v=${youtubeId(d.vidLink)}`;

      const row = {
        title_en: d.title_en.trim(), title_km: d.title_km.trim(), desc_en: d.desc_en.trim(), desc_km: d.desc_km.trim(), platform: d.platform,
        version: d.version.trim(), price, file_name, file_size, video_url, video_kind: video_url ? d.vidKind : 'none', enabled: d.enabled,
      };
      const r = d.isNew
        ? await supabase.from('software_files').insert({ id: d.id, ...row, sort_order: 0 })
        : await supabase.from('software_files').update(row).eq('id', d.id);
      if (r.error) throw r.error;
      const srcRow: any = d.srcKind === 'link'
        ? { file_id: d.id, kind: 'link', file_path: null, external_url: d.link.trim() }
        : file_path ? { file_id: d.id, kind: 'upload', file_path, external_url: null } : null;
      if (srcRow) { const s = await supabase.from('software_sources').upsert(srcRow); if (s.error) throw s.error; }
      // tidy up files that are no longer used
      const olds: { bucket: string; path: string }[] = [];
      if (src0?.kind === 'upload' && src0.file_path && src0.file_path !== file_path) olds.push({ bucket: BUCKET_FILES, path: src0.file_path });
      if (src0?.kind === 'upload' && d.srcKind === 'link' && src0.file_path) olds.push({ bucket: BUCKET_FILES, path: src0.file_path });
      for (const o of olds) supabase.storage.from(o.bucket).remove([o.path]).catch(() => {});
      onSaved(d.isNew ? 'Software added.' : 'Saved.');
    } catch (e) {
      for (const u of uploaded) supabase.storage.from(u.bucket).remove([u.path]).catch(() => {});
      setErr(errText(e));
    } finally { setBusy(false); }
  }

  return (
    <section className="saCard swEditor">
      <h3>{d.isNew ? 'Add software' : 'Edit software'}</h3>
      <div className="saRow">
        <label>Title (English)<input value={d.title_en} maxLength={80} onChange={e => set({ title_en: e.target.value })} placeholder="Photo Editor Pro" /></label>
        <label>Title (Khmer)<input value={d.title_km} maxLength={80} onChange={e => set({ title_km: e.target.value })} /></label>
      </div>
      <div className="saRow">
        <label>Short text (English)<textarea rows={2} value={d.desc_en} maxLength={300} onChange={e => set({ desc_en: e.target.value })} placeholder="One short line is enough." /></label>
        <label>Short text (Khmer)<textarea rows={2} value={d.desc_km} maxLength={300} onChange={e => set({ desc_km: e.target.value })} /></label>
      </div>
      <div className="saRow">
        <label>Platform<select value={d.platform} onChange={e => set({ platform: e.target.value })}>{Object.entries(PLATFORMS).map(([k, v]) => <option key={k} value={k}>{v.en}</option>)}</select></label>
        <label>Version (optional)<input value={d.version} maxLength={24} onChange={e => set({ version: e.target.value })} placeholder="2.1" /></label>
        <label>Price (USD)<input inputMode="decimal" value={d.price} onChange={e => set({ price: e.target.value })} /></label>
      </div>

      <div className="swBlock">
        <b>The file</b>
        <div className="swSeg" role="tablist">
          <button type="button" role="tab" aria-selected={d.srcKind === 'upload'} className={d.srcKind === 'upload' ? 'on' : ''} onClick={() => set({ srcKind: 'upload' })}><Upload size={15} /> Upload (up to {MAX_UPLOAD_MB} MB)</button>
          <button type="button" role="tab" aria-selected={d.srcKind === 'link'} className={d.srcKind === 'link' ? 'on' : ''} onClick={() => set({ srcKind: 'link' })}><Link2 size={15} /> Paste a link (any size)</button>
        </div>
        {d.srcKind === 'upload' ? (
          <>
            <input ref={fileRef} type="file" hidden onChange={e => { chooseFile(e.target.files?.[0] || null); e.target.value = ''; }} />
            <button type="button" className="swPickBtn" onClick={() => fileRef.current?.click()}><Upload size={16} />{d.file ? d.file.name : d.hasFile ? 'Replace the file' : 'Choose the file'}</button>
            {(d.file || d.hasFile) && <p className="ssHint">{d.fileName} {d.fileSize ? '· ' + fmtSize(d.fileSize) : ''}{!d.file && d.hasFile ? ' · already uploaded' : ''}</p>}
            {busy && d.file && <div className="swBar" aria-label="Upload progress"><i style={{ width: pct.file + '%' }} /><span>{pct.file}%</span></div>}
          </>
        ) : (
          <>
            <input value={d.link} onChange={e => set({ link: e.target.value })} placeholder="https://drive.google.com/…" />
            <label className="swInline">Name shown to the customer<input value={d.fileName} maxLength={120} onChange={e => set({ fileName: e.target.value })} placeholder="photo-editor-setup.exe" /></label>
            <p className="ssHint">Customers only see this link after they have paid. Make sure anyone with the link can open it.</p>
          </>
        )}
      </div>

      <div className="swBlock">
        <b>How-to-download video <span className="ssHint">(optional, free for everyone to watch)</span></b>
        <div className="swSeg" role="tablist">
          {([['none', 'No video'], ['upload', 'Upload'], ['youtube', 'YouTube link']] as const).map(([k, t]) => <button key={k} type="button" role="tab" aria-selected={d.vidKind === k} className={d.vidKind === k ? 'on' : ''} onClick={() => set({ vidKind: k })}>{k === 'none' ? null : <Video size={15} />} {t}</button>)}
        </div>
        {d.vidKind === 'upload' && (
          <>
            <input ref={vidRef} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={e => { chooseVideo(e.target.files?.[0] || null); e.target.value = ''; }} />
            <button type="button" className="swPickBtn" onClick={() => vidRef.current?.click()}><Video size={16} />{d.vidFile ? d.vidFile.name : d.vidUrl ? 'Replace the video' : 'Choose the video (MP4 / WebM)'}</button>
            {busy && d.vidFile && <div className="swBar"><i style={{ width: pct.vid + '%' }} /><span>{pct.vid}%</span></div>}
            {!d.vidFile && d.vidUrl && <video className="swAdminVid" src={d.vidUrl} controls preload="metadata" />}
          </>
        )}
        {d.vidKind === 'youtube' && <input value={d.vidLink} onChange={e => set({ vidLink: e.target.value })} placeholder="https://youtu.be/…" />}
      </div>

      <label className="saBtns"><input type="checkbox" checked={d.enabled} onChange={e => set({ enabled: e.target.checked })} /> <b>Switched on</b> <span className="ssHint">customers can see and buy it</span></label>
      {err && <p className="saErr" role="alert">{err}</p>}
      <div className="saBtns">
        <button className="pri" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        <button disabled={busy} onClick={onClose}>Cancel</button>
      </div>
    </section>
  );
}

export function AdminSoftware({ Shell }: { Shell: Shell }) {
  const [files, setFiles] = useState<any[]>([]);
  const [sources, setSources] = useState<Record<string, any>>({});
  const [sales, setSales] = useState<any[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState('');
  const [edit, setEdit] = useState<{ d: Draft; src: any } | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; t: string } | null>(null);
  const say = (ok: boolean, t: string) => setFlash({ ok, t });
  useEffect(() => { if (!flash?.ok) return; const t = window.setTimeout(() => setFlash(null), 3500); return () => window.clearTimeout(t); }, [flash]);

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from('software_files').select('*').order('sort_order').order('created_at'),
      supabase.from('software_sources').select('*'),
      supabase.from('software_purchases').select('id,user_id,file_id,title,price,paid_at,download_count').eq('status', 'paid').order('paid_at', { ascending: false }).limit(300),
    ]);
    const bad = a.error || b.error || c.error;
    if (bad) { setFatal('Could not load. Did you run supabase-software-downloads.sql in Supabase? (' + errText(bad) + ')'); setLoading(false); return; }
    setFiles((a.data as any[]) || []);
    setSources(Object.fromEntries(((b.data as any[]) || []).map(s => [s.file_id, s])));
    const rows = (c.data as any[]) || [];
    setSales(rows);
    const ids = Array.from(new Set(rows.slice(0, 20).map(r => r.user_id)));
    if (ids.length) {
      const p = await supabase.from('profiles').select('user_id,name,email').in('user_id', ids);
      setNames(Object.fromEntries(((p.data as any[]) || []).map(x => [x.user_id, x.name || x.email || 'Customer'])));
    }
    setFatal(''); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const by: Record<string, { n: number; sum: number }> = {};
    let sum = 0;
    for (const s of sales) { (by[s.file_id] ||= { n: 0, sum: 0 }); by[s.file_id].n++; by[s.file_id].sum += Number(s.price); sum += Number(s.price); }
    return { by, sum, n: sales.length };
  }, [sales]);

  const openEdit = (f: any) => {
    const s = sources[f.id];
    setEdit({
      src: s || null,
      d: {
        ...blank(), id: f.id, isNew: false, title_en: f.title_en, title_km: f.title_km, desc_en: f.desc_en, desc_km: f.desc_km, platform: f.platform, version: f.version,
        price: Number(f.price).toFixed(2), enabled: f.enabled, srcKind: s?.kind === 'link' ? 'link' : 'upload', link: s?.external_url || '', hasFile: s?.kind === 'upload',
        fileName: f.file_name, fileSize: f.file_size, vidKind: f.video_kind === 'none' ? 'none' : f.video_kind, vidLink: f.video_kind === 'youtube' ? f.video_url : '', vidUrl: f.video_kind === 'upload' ? f.video_url : '',
      },
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  async function toggle(f: any) {
    if (!f.enabled && !sources[f.id]) { say(false, 'Add the file first (edit it), then switch it on.'); return; }
    const r = await supabase.from('software_files').update({ enabled: !f.enabled }).eq('id', f.id);
    if (r.error) say(false, errText(r.error)); else load();
  }
  async function move(i: number, dir: -1 | 1) {
    const j = i + dir; if (j < 0 || j >= files.length) return;
    const next = [...files]; [next[i], next[j]] = [next[j], next[i]];
    const res = await Promise.all(next.map((f, k) => ((k + 1) * 10 !== f.sort_order ? supabase.from('software_files').update({ sort_order: (k + 1) * 10 }).eq('id', f.id) : null)).filter(Boolean) as any[]);
    const bad = res.find(r => r.error); if (bad) say(false, errText(bad.error)); else load();
  }
  async function remove(f: any) {
    if ((stats.by[f.id]?.n || 0) > 0) { say(false, 'This file has buyers, so it cannot be deleted. Switch it off instead.'); return; }
    if (!window.confirm(`Delete "${f.title_en}"? The uploaded file and video are removed too.`)) return;
    const s = sources[f.id];
    const r = await supabase.from('software_files').delete().eq('id', f.id);
    if (r.error) { say(false, /foreign key|restrict|violates/i.test(errText(r.error)) ? 'This file has purchase history, so it cannot be deleted. Switch it off instead.' : errText(r.error)); return; }
    if (s?.kind === 'upload' && s.file_path) supabase.storage.from(BUCKET_FILES).remove([s.file_path]).catch(() => {});
    const m = String(f.video_url || '').match(/software-guides\/(.+)$/); if (f.video_kind === 'upload' && m) supabase.storage.from(BUCKET_VIDEOS).remove([decodeURIComponent(m[1])]).catch(() => {});
    say(true, 'Deleted.'); load();
  }

  return (
    <Shell title="Software downloads">
      <div className="saPage swAdmin">
        {flash && <p className={flash.ok ? 'saOk' : 'saErr'} role={flash.ok ? 'status' : 'alert'}>{flash.t}</p>}
        {fatal && <p className="saErr">{fatal}</p>}
        {loading && <p className="muted">Loading…</p>}
        {!loading && !fatal && (
          <>
            <div className="swStats">
              <div><b>{files.length}</b><small>files</small></div>
              <div><b>{stats.n}</b><small>sold</small></div>
              <div><b>{money(stats.sum)}</b><small>earned</small></div>
            </div>
            <p className="saNote">Customers pay with Bakong KHQR (the price is on each file, $1.00 by default), then download as often as they like. They only see the file after they have paid. Add a short how-to video to help people download.</p>

            {edit
              ? <Editor key={edit.d.id} d0={edit.d} src0={edit.src} onClose={() => setEdit(null)} onSaved={t => { setEdit(null); say(true, t); load(); }} />
              : <div className="saBtns"><button className="pri" onClick={() => setEdit({ d: blank(), src: null })}><Plus size={16} /> Add software</button></div>}

            {files.length === 0 && !edit && <p className="muted">No software yet. Add your first file.</p>}
            {files.map((f, i) => {
              const P = plat(f.platform), st = stats.by[f.id];
              return (
                <div className={'saItem swAdminRow' + (f.enabled ? '' : ' off')} key={f.id}>
                  <span className="swAdminIc" style={{ background: P.ink, color: P.fg }}><P.Icon size={20} /></span>
                  <div className="swAdminMain">
                    <b>{f.title_en}</b>
                    <small>{P.en}{f.version ? ' · v' + f.version : ''} · {money(f.price)} · {sources[f.id] ? (sources[f.id].kind === 'link' ? 'link' : fmtSize(f.file_size) || 'uploaded') : 'no file yet'}{f.video_url ? ' · video' : ''} · sold {st?.n || 0}</small>
                  </div>
                  <div className="saBtns">
                    <label className="swSwitch" title={f.enabled ? 'Switch off' : 'Switch on'}><input type="checkbox" checked={f.enabled} onChange={() => toggle(f)} /><i /></label>
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp size={16} /></button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i >= files.length - 1} aria-label="Move down"><ArrowDown size={16} /></button>
                    <button type="button" onClick={() => openEdit(f)}><Pencil size={15} /> Edit</button>
                    <button type="button" onClick={() => remove(f)} aria-label="Delete"><Trash2 size={16} /></button>
                  </div>
                </div>
              );
            })}

            {sales.length > 0 && (
              <section className="saCard">
                <h3>Recent sales</h3>
                <ul className="swSales">
                  {sales.slice(0, 20).map(s => (
                    <li key={s.id}><span><b>{s.title || 'Software'}</b><small>{names[s.user_id] || 'Customer'} · {s.paid_at ? new Date(s.paid_at).toLocaleString() : ''}</small></span><span>{money(s.price)}<small>{s.download_count || 0} downloads</small></span></li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}
