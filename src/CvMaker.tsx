import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, Download, FileText, ImagePlus, Languages, Pencil, Plus, Sparkles, Trash2, Wallet, X } from 'lucide-react';
import { supabase } from './supabase';
import { isKm, tr, useLang } from './lang';
import PaymentScene from './PaymentScenes';
import { CvSheet, LEVEL_LANG, LEVEL_SKILL, TEMPLATES, emptyCv, tplOf } from './cvTemplates';
import type { CvData, Level, TplKey } from './cvTemplates';
import './cvTemplates.css';
import './cv.css';

/* ---------------------------------------------------------------------------------------------
   CV maker  ($3 per CV, see supabase-cv-maker.sql and server/index.js "CV maker")
   1. pick a template (blank designs)   2. pick the CV language (English / Khmer)   3. fill in the info
   4. pay with KHQR or wallet           5. "generating" animation                    6. preview, edit, Save as PDF
   The price and the paid status live in the database row (cv_orders); the browser can never change them.
   --------------------------------------------------------------------------------------------- */

type Chrome = {
  Top: React.ComponentType<{ title?: string; back?: boolean }>;
  Nav: React.ComponentType;
  PayModal: React.ComponentType<{ cvId?: string; onClose: () => void; onPaid: (cleared?: boolean) => void }>;
  useWalletBalance: () => readonly [number | null, () => Promise<void> | void];
  useBakongEnabled: () => boolean | null;
};
type Step = 'home' | 'language' | 'info' | 'pay' | 'generating' | 'editor';
type CvLang = 'en' | 'km';
type Mine = { id: string; template: string; lang: string; status: string; created_at: string; name: string | null };

const PRICE = 3;
const DRAFT = 'yn-cv-draft';
const money = (n: number) => '$' + n.toFixed(2);
const CAPS = { skills: 8, softSkills: 5, languages: 4, education: 3, experience: 3, references: 2, achievements: 2, certs: 3 };

const normalize = (d: any): CvData => {
  const e = emptyCv();
  const o: any = { ...e, ...(d || {}) };
  for (const k of ['skills', 'softSkills', 'languages', 'education', 'experience', 'references', 'achievements', 'certs']) if (!Array.isArray(o[k])) o[k] = [];
  return o as CvData;
};

async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
}

/** Shrinks a phone photo to a small JPEG (longest side 900 px, aspect kept). Each template then crops it to its own frame. */
async function readPhoto(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const g = c.getContext('2d');
  if (!g) throw new Error('canvas');
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

const API_BASE: string = ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/$/, '');
async function api(path: string, body: any): Promise<any> {
  const { data } = await supabase.auth.getSession();
  const r = await fetch(API_BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (data.session?.access_token || '') }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || 'Request failed (' + r.status + ')');
  return j;
}

function ensureCvFonts() {
  if (document.getElementById('cv-fonts')) return;
  const l = document.createElement('link');
  l.id = 'cv-fonts'; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=Montserrat:wght@300;400;500;600;700;800;900&family=Lato:wght@300;400;700;900&family=Noto+Sans+Khmer:wght@300;400;500;600;700&display=swap';
  document.head.appendChild(l);
}

/** Scales a 794 x 1123 sheet to the width of its box. */
function Scaled({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [s, setS] = useState(0.3);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const f = () => setS(Math.max(0.05, el.clientWidth / 794));
    f();
    const ro = new ResizeObserver(f); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className={'cvmScaled ' + className} style={{ ['--s' as any]: s }}>
      <div className="cvmScaledIn" style={{ transform: `scale(${s})` }}>{children}</div>
    </div>
  );
}

/* ================================================ FORM ================================================ */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="cvmF"><span>{label}</span>{children}</label>;
}

function RowList<T>({ title, hint, items, cap, blank, onChange, render }: {
  title: string; hint?: string; items: T[]; cap: number; blank: () => T; onChange: (v: T[]) => void;
  render: (it: T, set: (p: Partial<T>) => void, i: number) => React.ReactNode;
}) {
  return (
    <fieldset className="cvmSet">
      <legend>{title}</legend>
      {hint && <p className="cvmHint">{hint}</p>}
      {items.map((it, i) => (
        <div className="cvmRow" key={i}>
          <div className="cvmRowBody">{render(it, p => onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x))), i)}</div>
          <button type="button" className="cvmRm" aria-label={tr('Remove', 'លុប')} onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 /></button>
        </div>
      ))}
      {items.length < cap && <button type="button" className="cvmAdd" onClick={() => onChange([...items, blank()])}><Plus />{tr('Add', 'បន្ថែម')}</button>}
    </fieldset>
  );
}

function LevelSelect({ value, onChange, labels }: { value: number; onChange: (l: Level) => void; labels: [string, string][] }) {
  return (
    <select value={value} onChange={e => onChange(Number(e.target.value) as Level)}>
      {labels.map((l, i) => <option key={i} value={i + 1}>{tr(l[0], l[1])}</option>)}
    </select>
  );
}

function CvForm({ tpl, data, set }: { tpl: TplKey; data: CvData; set: (p: Partial<CvData>) => void }) {
  const T = tplOf(tpl);
  const has = (s: string) => (T.sections as string[]).includes(s);
  const [photoErr, setPhotoErr] = useState('');
  const pickPhoto = async (f: File | null) => {
    setPhotoErr('');
    if (!f) return;
    if (!f.type.startsWith('image/')) { setPhotoErr(tr('Choose a picture file.', 'សូមជ្រើសរើសឯកសាររូបភាព។')); return; }
    try { set({ photo: await readPhoto(f) }); } catch { setPhotoErr(tr('That picture could not be read.', 'មិនអាចអានរូបភាពនេះបានទេ។')); }
  };
  return (
    <div className="cvmForm">
      <fieldset className="cvmSet">
        <legend>{tr('About you', 'អំពីអ្នក')}</legend>
        {has('photo') && (
          <div className="cvmPhoto">
            <span className="cvmPhotoBox">{data.photo ? <img src={data.photo} alt="" /> : <ImagePlus />}</span>
            <div>
              <label className="cvmBtn"><ImagePlus />{data.photo ? tr('Change photo', 'ប្តូររូបថត') : tr('Add photo', 'បន្ថែមរូបថត')}
                <input hidden type="file" accept="image/*" onChange={e => { pickPhoto(e.target.files?.[0] || null); e.target.value = ''; }} /></label>
              {data.photo && <button type="button" className="cvmLink" onClick={() => set({ photo: '' })}>{tr('Remove', 'លុប')}</button>}
              {photoErr && <small className="cvmErr">{photoErr}</small>}
            </div>
          </div>
        )}
        <Field label={tr('Full name', 'ឈ្មោះពេញ')}><input value={data.name} onChange={e => set({ name: e.target.value })} maxLength={40} autoComplete="name" /></Field>
        <Field label={tr('Job title', 'មុខតំណែង')}><input value={data.title} onChange={e => set({ title: e.target.value })} maxLength={40} /></Field>
        {has('about') && <Field label={tr('Short intro (About me)', 'ការណែនាំខ្លី (អំពីខ្ញុំ)')}><textarea rows={3} maxLength={160} value={data.about} onChange={e => set({ about: e.target.value })} /></Field>}
        {has('summary') && <Field label={has('about') ? tr('Summary', 'សេចក្តីសង្ខេប') : tr('Profile / About me', 'ប្រវត្តិរូប / អំពីខ្ញុំ')}><textarea rows={4} maxLength={420} value={data.summary} onChange={e => set({ summary: e.target.value })} /></Field>}
      </fieldset>

      {has('contact') && (
        <fieldset className="cvmSet">
          <legend>{tr('Contact', 'ទំនាក់ទំនង')}</legend>
          <Field label={tr('Phone', 'លេខទូរស័ព្ទ')}><input type="tel" inputMode="tel" value={data.phone} onChange={e => set({ phone: e.target.value })} maxLength={30} /></Field>
          <Field label={tr('Email', 'អ៊ីមែល')}><input type="email" inputMode="email" value={data.email} onChange={e => set({ email: e.target.value })} maxLength={60} /></Field>
          <Field label={tr('Address', 'អាសយដ្ឋាន')}><input value={data.address} onChange={e => set({ address: e.target.value })} maxLength={70} /></Field>
          {has('website') && <Field label={tr('Website (optional)', 'គេហទំព័រ (ស្រេចចិត្ត)')}><input value={data.website} onChange={e => set({ website: e.target.value })} maxLength={60} /></Field>}
        </fieldset>
      )}

      {has('experience') && (
        <RowList title={tr('Work experience', 'បទពិសោធន៍ការងារ')} hint={tr('Newest first. Put each duty on its own line.', 'ថ្មីបំផុតមុន។ សរសេរកិច្ចការនីមួយៗលើមួយបន្ទាត់។')}
          items={data.experience} cap={CAPS.experience} blank={() => ({ period: '', company: '', role: '', desc: '' })} onChange={v => set({ experience: v })}
          render={(x, p) => <>
            <div className="cvmTwo"><Field label={tr('Company', 'ក្រុមហ៊ុន')}><input value={x.company} onChange={e => p({ company: e.target.value })} maxLength={40} /></Field>
              <Field label={tr('Years', 'ឆ្នាំ')}><input value={x.period} placeholder="2022 - 2024" onChange={e => p({ period: e.target.value })} maxLength={24} /></Field></div>
            <Field label={tr('Job title', 'មុខតំណែង')}><input value={x.role} onChange={e => p({ role: e.target.value })} maxLength={40} /></Field>
            <Field label={tr('What you did', 'អ្វីដែលអ្នកបានធ្វើ')}><textarea rows={3} value={x.desc} onChange={e => p({ desc: e.target.value })} maxLength={240} /></Field>
          </>} />
      )}

      {has('education') && (
        <RowList title={tr('Education', 'ការអប់រំ')} items={data.education} cap={CAPS.education} blank={() => ({ period: '', school: '', degree: '', note: '' })} onChange={v => set({ education: v })}
          render={(x, p) => <>
            <Field label={tr('School / University', 'សាលា / សាកលវិទ្យាល័យ')}><input value={x.school} onChange={e => p({ school: e.target.value })} maxLength={50} /></Field>
            <div className="cvmTwo"><Field label={tr('Degree / Course', 'សញ្ញាបត្រ / វគ្គសិក្សា')}><input value={x.degree} onChange={e => p({ degree: e.target.value })} maxLength={50} /></Field>
              <Field label={tr('Years', 'ឆ្នាំ')}><input value={x.period} placeholder="2016 - 2020" onChange={e => p({ period: e.target.value })} maxLength={24} /></Field></div>
            {(tpl === 'richard' || tpl === 'director') && <Field label={tr('Note (optional)', 'កំណត់ចំណាំ (ស្រេចចិត្ត)')}><input value={x.note} onChange={e => p({ note: e.target.value })} maxLength={50} /></Field>}
          </>} />
      )}

      {has('skills') && (
        <RowList title={tr('Skills', 'ជំនាញ')} items={data.skills} cap={CAPS.skills} blank={() => ({ name: '', level: 3 as Level })} onChange={v => set({ skills: v })}
          render={(x, p) => <div className={T.skillBars ? 'cvmTwo' : ''}>
            <Field label={tr('Skill', 'ជំនាញ')}><input value={x.name} onChange={e => p({ name: e.target.value })} maxLength={32} /></Field>
            {T.skillBars && <Field label={tr('Level', 'កម្រិត')}><LevelSelect value={x.level} onChange={l => p({ level: l })} labels={LEVEL_SKILL} /></Field>}
          </div>} />
      )}

      {has('softSkills') && (
        <RowList title={tr('Soft skills', 'ជំនាញទន់')} items={data.softSkills} cap={CAPS.softSkills} blank={() => ''} onChange={v => set({ softSkills: v })}
          render={(x, _p, i) => <Field label={tr('Skill', 'ជំនាញ')}><input value={x} onChange={e => set({ softSkills: data.softSkills.map((y, j) => (j === i ? e.target.value : y)) })} maxLength={32} /></Field>} />
      )}

      {has('languages') && (
        <RowList title={tr('Languages', 'ភាសា')} items={data.languages} cap={CAPS.languages} blank={() => ({ name: '', level: 3 as Level })} onChange={v => set({ languages: v })}
          render={(x, p) => <div className="cvmTwo">
            <Field label={tr('Language', 'ភាសា')}><input value={x.name} onChange={e => p({ name: e.target.value })} maxLength={24} /></Field>
            <Field label={tr('Level', 'កម្រិត')}><LevelSelect value={x.level} onChange={l => p({ level: l })} labels={LEVEL_LANG} /></Field>
          </div>} />
      )}

      {has('certs') && (
        <RowList title={tr('Certifications', 'វិញ្ញាបនបត្រ')} items={data.certs} cap={CAPS.certs} blank={() => ({ name: '', year: '' })} onChange={v => set({ certs: v })}
          render={(x, p) => <div className="cvmTwo">
            <Field label={tr('Certificate', 'វិញ្ញាបនបត្រ')}><input value={x.name} onChange={e => p({ name: e.target.value })} maxLength={40} /></Field>
            <Field label={tr('Year', 'ឆ្នាំ')}><input value={x.year} onChange={e => p({ year: e.target.value })} maxLength={8} /></Field>
          </div>} />
      )}

      {has('achievements') && (
        <RowList title={tr('Achievements', 'សមិទ្ធផល')} items={data.achievements} cap={CAPS.achievements} blank={() => ({ period: '', text: '' })} onChange={v => set({ achievements: v })}
          render={(x, p) => <>
            <Field label={tr('Years', 'ឆ្នាំ')}><input value={x.period} placeholder="2021" onChange={e => p({ period: e.target.value })} maxLength={20} /></Field>
            <Field label={tr('What you achieved', 'អ្វីដែលអ្នកសម្រេចបាន')}><textarea rows={2} value={x.text} onChange={e => p({ text: e.target.value })} maxLength={100} /></Field>
          </>} />
      )}

      {has('references') && (
        <RowList title={tr('References', 'អ្នកផ្តល់ការយោង')} items={data.references} cap={CAPS.references} blank={() => ({ name: '', role: '', phone: '', email: '' })} onChange={v => set({ references: v })}
          render={(x, p) => <>
            <div className="cvmTwo"><Field label={tr('Name', 'ឈ្មោះ')}><input value={x.name} onChange={e => p({ name: e.target.value })} maxLength={30} /></Field>
              <Field label={tr('Job / Company', 'មុខតំណែង / ក្រុមហ៊ុន')}><input value={x.role} onChange={e => p({ role: e.target.value })} maxLength={40} /></Field></div>
            <div className="cvmTwo"><Field label={tr('Phone', 'ទូរស័ព្ទ')}><input value={x.phone} onChange={e => p({ phone: e.target.value })} maxLength={24} /></Field>
              <Field label={tr('Email', 'អ៊ីមែល')}><input value={x.email} onChange={e => p({ email: e.target.value })} maxLength={50} /></Field></div>
          </>} />
      )}
    </div>
  );
}

/* ================================================ GENERATING ANIMATION ================================================ */
function CvGenerating({ tpl, data, km, onDone }: { tpl: TplKey; data: CvData; km: boolean; onDone: () => void }) {
  const steps = [
    tr('Reading your info…', 'កំពុងអានព័ត៌មានរបស់អ្នក…'),
    tr('Placing your photo…', 'កំពុងដាក់រូបថតរបស់អ្នក…'),
    tr('Laying out the page…', 'កំពុងរៀបចំទំព័រ…'),
    tr('Polishing the details…', 'កំពុងសម្អាតព័ត៌មានលម្អិត…'),
    tr('Your CV is ready!', 'CV របស់អ្នករួចរាល់ហើយ!'),
  ];
  const reduce = useMemo(() => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, []);
  const total = reduce ? 1200 : 4600;
  const [i, setI] = useState(0);
  useEffect(() => {
    const each = total / steps.length;
    const t = window.setInterval(() => setI(n => Math.min(steps.length - 1, n + 1)), each);
    const end = window.setTimeout(onDone, total + 500);
    return () => { window.clearInterval(t); window.clearTimeout(end); };
  }, []);
  return (
    <div className="cvmGen" role="status" aria-live="polite" style={{ ['--gt' as any]: total + 'ms' }}>
      <div className="cvmGenStage">
        <i className="cvmGenGlow" aria-hidden="true" />
        <div className="cvmGenFrame">
          <Scaled className="cvmGenLayer"><CvSheet tpl={tpl} data={emptyCv()} blank km={km} /></Scaled>
          <Scaled className="cvmGenLayer cvmGenFill"><CvSheet tpl={tpl} data={data} km={km} /></Scaled>
          <span className="cvmGenScan" aria-hidden="true" />
        </div>
        {Array.from({ length: 8 }, (_, k) => <b key={k} className="cvmGenSpark" style={{ ['--k' as any]: k }} aria-hidden="true" />)}
      </div>
      <h2>{tr('Building your CV', 'កំពុងបង្កើត CV របស់អ្នក')}</h2>
      <p key={i} className="cvmGenStep">{steps[i]}</p>
      <div className="cvmGenBar" aria-hidden="true"><i /></div>
    </div>
  );
}

/* ================================================ MAIN ================================================ */
export default function CvMaker({ Top, Nav, PayModal, useWalletBalance, useBakongEnabled }: Chrome) {
  useLang();
  const siteKm = isKm();
  const [step, setStep] = useState<Step>('home');
  const [tpl, setTpl] = useState<TplKey | null>(null);
  const [lang, setLang] = useState<CvLang>(siteKm ? 'km' : 'en');
  const [data, setData] = useState<CvData>(() => {
    try { return normalize(JSON.parse(localStorage.getItem(DRAFT) || 'null')?.data); } catch { return emptyCv(); }
  });
  const [cvId, setCvId] = useState<string | null>(null);
  const [mine, setMine] = useState<Mine[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [walletDone, setWalletDone] = useState(false);
  const [method, setMethod] = useState<'khqr' | 'wallet'>('khqr');
  const [bal, refreshBal] = useWalletBalance();
  const bkOn = useBakongEnabled();
  const [price, setPrice] = useState(PRICE);
  const [overflow, setOverflow] = useState(false);
  const [tab, setTab] = useState<'preview' | 'edit'>('preview');
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const km = lang === 'km';

  useEffect(() => { ensureCvFonts(); }, []);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [step]);
  // keep what the customer typed if they refresh
  useEffect(() => {
    if (step === 'editor') return;
    const t = window.setTimeout(() => { try { localStorage.setItem(DRAFT, JSON.stringify({ data })); } catch { /* full */ } }, 400);
    return () => window.clearTimeout(t);
  }, [data, step]);

  const loadMine = useCallback(async () => {
    const r = await supabase.from('cv_orders').select('id,template,lang,status,created_at,name:data->>name').order('created_at', { ascending: false }).limit(8);
    if (!r.error) setMine((r.data as any[]) || []);
  }, []);
  useEffect(() => { loadMine(); }, [loadMine]);

  const set = useCallback((p: Partial<CvData>) => setData(d => ({ ...d, ...p })), []);

  /* ---------- database ---------- */
  async function saveRow(): Promise<string> {
    const j = await api('/api/cv/save', { cv_id: cvId, template: tpl, lang, data });
    if (!cvId) { setCvId(j.id); setPrice(Number(j.price) || PRICE); }
    return j.id as string;
  }
  async function isPaid(id: string): Promise<boolean> {
    for (let k = 0; k < 4; k++) {
      const r = await supabase.from('cv_orders').select('status').eq('id', id).maybeSingle();
      if (r.data?.status === 'paid') return true;
      await new Promise(res => setTimeout(res, 900));
    }
    return false;
  }
  async function openRow(m: Mine) {
    setBusy(true); setErr('');
    try {
      const r = await supabase.from('cv_orders').select('id,template,lang,status,data,price').eq('id', m.id).single();
      if (r.error) throw r.error;
      setTpl(tplOf(r.data.template).key); setLang(r.data.lang === 'km' ? 'km' : 'en'); setData(normalize(r.data.data)); setCvId(r.data.id); setPrice(Number(r.data.price) || PRICE);
      setStep(r.data.status === 'paid' ? 'editor' : 'pay');
    } catch (e: any) { setErr(e?.message || tr('Could not open this CV.', 'មិនអាចបើក CV នេះបានទេ។')); }
    setBusy(false);
  }

  /* ---------- paying ---------- */
  async function startPay() {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      const id = await saveRow();
      if (method === 'wallet') {
        const r = await supabase.rpc('pay_cv_with_wallet', { p_cv_id: id });
        if (r.error) throw new Error(/pay_cv_with_wallet|schema cache/i.test(r.error.message) ? tr('Wallet payment is not available right now.', 'ការទូទាត់ពីកាបូបមិនអាចប្រើបានទេឥឡូវនេះ។') : r.error.message);
        if (!(await isPaid(id))) throw new Error(tr('Payment is still being confirmed. Please wait a moment.', 'ការទូទាត់កំពុងត្រូវបានបញ្ជាក់។ សូមរង់ចាំបន្តិច។'));
        refreshBal(); setWalletDone(true);
      } else {
        setPayOpen(true);
      }
    } catch (e: any) { setErr(e?.message || tr('Payment could not start.', 'មិនអាចចាប់ផ្តើមការទូទាត់បានទេ។')); }
    setBusy(false);
  }
  async function afterPaid() {
    setPayOpen(false); setWalletDone(false);
    if (!cvId) return;
    setBusy(true);
    if (await isPaid(cvId)) { setStep('generating'); loadMine(); } else setErr(tr('We have not received the payment yet. If you paid, wait a few seconds and press Pay again.', 'យើងមិនទាន់ទទួលបានការទូទាត់ទេ។ បើអ្នកបានបង់ហើយ សូមរង់ចាំបន្តិច រួចចុចបង់ម្ដងទៀត។'));
    setBusy(false);
  }
  useEffect(() => {
    if (!walletDone) return;
    const t = window.setTimeout(afterPaid, 6200);
    return () => window.clearTimeout(t);
  }, [walletDone]);

  /* ---------- autosave in the editor ---------- */
  const first = useRef(true);
  useEffect(() => {
    if (step !== 'editor' || !cvId) { first.current = true; return; }
    if (first.current) { first.current = false; return; }
    setSaved('saving');
    const t = window.setTimeout(async () => {
      try { await api('/api/cv/save', { cv_id: cvId, template: tpl, lang, data }); setSaved('saved'); } catch { setSaved('error'); }
    }, 900);
    return () => window.clearTimeout(t);
  }, [data, step, cvId]);

  /* ---------- PDF (browser print -> Save as PDF) ---------- */
  const [printHost, setPrintHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = document.createElement('div'); el.id = 'cvPrintHost';
    document.body.appendChild(el); setPrintHost(el);
    return () => { el.remove(); };
  }, []);
  function savePdf() {
    const old = document.title;
    document.title = ('CV - ' + (data.name || 'YN Studio')).slice(0, 60);
    const back = () => { document.title = old; window.removeEventListener('afterprint', back); };
    window.addEventListener('afterprint', back);
    window.setTimeout(() => { window.print(); window.setTimeout(back, 4000); }, 80);
  }

  const T = tpl ? tplOf(tpl) : null;
  const canNext = data.name.trim().length > 1 && data.title.trim().length > 0;
  const walletLow = bal === null || bal + 1e-6 < price;
  const stepNo = ({ home: 1, language: 2, info: 3, pay: 4, generating: 5, editor: 6 } as Record<Step, number>)[step];

  const Steps = () => (
    <ol className="cvmSteps" aria-label={tr('Progress', 'ដំណើរការ')}>
      {[tr('Template', 'គំរូ'), tr('Language', 'ភាសា'), tr('Your info', 'ព័ត៌មាន'), tr('Pay', 'ទូទាត់'), tr('Your CV', 'CV')].map((x, i) => (
        <li key={i} className={Math.min(stepNo, 5) > i + 1 || stepNo === 6 ? 'done' : Math.min(stepNo, 5) === i + 1 ? 'on' : ''}><i>{(Math.min(stepNo, 5) > i + 1 || stepNo === 6) ? <Check /> : i + 1}</i><span>{x}</span></li>
      ))}
    </ol>
  );

  return (
    <>
      <main className="shop cvmPage">
        <Top title={tr('CV maker', 'បង្កើត CV')} back />

        {step !== 'generating' && <Steps />}

        {/* ---------------- 1. template ---------------- */}
        {step === 'home' && (
          <>
            <section className="cvmHero">
              <span className="cvmPrice">{money(PRICE)}</span>
              <h1>{tr('Pick a CV design', 'ជ្រើសរើសគំរូ CV')}</h1>
              <p>{tr('Choose the template you like. Next you add your info, pay once, and download your CV as a PDF.', 'ជ្រើសរើសគំរូដែលអ្នកចូលចិត្ត។ បន្ទាប់មកបញ្ចូលព័ត៌មាន ទូទាត់ម្តង រួចទាញយក CV ជា PDF។')}</p>
            </section>
            <div className="cvmGrid">
              {TEMPLATES.map((t, i) => (
                <button type="button" key={t.key} className={'cvmCard' + (tpl === t.key ? ' on' : '')} style={{ ['--i' as any]: i }} onClick={() => setTpl(t.key)} aria-pressed={tpl === t.key}>
                  <Scaled className="cvmCardSheet"><CvSheet tpl={t.key} data={emptyCv()} blank km={siteKm} /></Scaled>
                  <span className="cvmCardName">{tr(t.en, t.km)}</span>
                  {tpl === t.key && <span className="cvmTick"><Check /></span>}
                </button>
              ))}
            </div>

            {mine.length > 0 && (
              <section className="cvmMine">
                <h2>{tr('Your CVs', 'CV របស់អ្នក')}</h2>
                <ul>
                  {mine.map(m => (
                    <li key={m.id}>
                      <span className="cvmMineIcon"><FileText /></span>
                      <span className="cvmMineText"><b>{m.name || tr('Untitled CV', 'CV គ្មានឈ្មោះ')}</b><small>{tr(tplOf(m.template).en, tplOf(m.template).km)} · {new Date(m.created_at).toLocaleDateString()}</small></span>
                      <button type="button" className="cvmSmall" disabled={busy} onClick={() => openRow(m)}>{m.status === 'paid' ? tr('Open', 'បើក') : tr('Continue', 'បន្ត')}</button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {err && <p className="cvmErr" role="alert">{err}</p>}
            <div className="cvmBar"><button type="button" className="cvmGo" disabled={!tpl} onClick={() => { setCvId(null); setStep('language'); }}>{tr('Continue', 'បន្ត')} <ArrowRight /></button></div>
          </>
        )}

        {/* ---------------- 2. language ---------------- */}
        {step === 'language' && tpl && (
          <>
            <section className="cvmHero"><h1>{tr('Which language is your CV in?', 'CV របស់អ្នកជាភាសាអ្វី?')}</h1>
              <p>{tr('The headings and fonts change to match. You can type your info in any language.', 'ចំណងជើង និងពុម្ពអក្សរនឹងប្តូរតាម។ អ្នកអាចសរសេរព័ត៌មានជាភាសាណាក៏បាន។')}</p></section>
            <div className="cvmLangs">
              {([['en', 'English', 'Education · Skills', 'Aa'], ['km', 'ខ្មែរ', 'ការអប់រំ · ជំនាញ', 'ក']] as const).map(([k, name, sample, glyph]) => (
                <button type="button" key={k} className={'cvmLang' + (lang === k ? ' on' : '')} onClick={() => setLang(k)} aria-pressed={lang === k}>
                  <span className="cvmLangGlyph" data-notranslate="1">{glyph}</span><b data-notranslate="1">{name}</b><small data-notranslate="1">{sample}</small>
                  {lang === k && <span className="cvmTick"><Check /></span>}
                </button>
              ))}
            </div>
            <div className="cvmPrevOne"><Scaled><CvSheet tpl={tpl} data={emptyCv()} blank km={km} /></Scaled></div>
            <div className="cvmBar two">
              <button type="button" className="cvmBack" onClick={() => setStep('home')}><ArrowLeft />{tr('Back', 'ត្រឡប់')}</button>
              <button type="button" className="cvmGo" onClick={() => setStep('info')}>{tr('Continue', 'បន្ត')} <ArrowRight /></button>
            </div>
          </>
        )}

        {/* ---------------- 3. info ---------------- */}
        {step === 'info' && tpl && (
          <>
            <section className="cvmHero"><h1>{tr('Add your info', 'បញ្ចូលព័ត៌មានរបស់អ្នក')}</h1>
              <p>{tr('Fill in what you want on your CV. After payment we place it into the design for you.', 'បំពេញអ្វីដែលអ្នកចង់បានលើ CV។ បន្ទាប់ពីទូទាត់ យើងនឹងដាក់វាចូលក្នុងគំរូឱ្យអ្នក។')}</p></section>
            <CvForm tpl={tpl} data={data} set={set} />
            {err && <p className="cvmErr" role="alert">{err}</p>}
            {!canNext && <p className="cvmHint center">{tr('Add your name and job title to continue.', 'សូមបញ្ចូលឈ្មោះ និងមុខតំណែងដើម្បីបន្ត។')}</p>}
            <div className="cvmBar two">
              <button type="button" className="cvmBack" onClick={() => setStep('language')}><ArrowLeft />{tr('Back', 'ត្រឡប់')}</button>
              <button type="button" className="cvmGo" disabled={!canNext} onClick={() => { setErr(''); setStep('pay'); }}>{tr('Continue to payment', 'បន្តទៅការទូទាត់')} <ArrowRight /></button>
            </div>
          </>
        )}

        {/* ---------------- 4. pay ---------------- */}
        {step === 'pay' && tpl && T && (
          <>
            <section className="cvmHero"><h1>{tr('Pay to build your CV', 'ទូទាត់ដើម្បីបង្កើត CV')}</h1></section>
            <div className="cvmSummary">
              <div className="cvmSumPrev"><Scaled><CvSheet tpl={tpl} data={emptyCv()} blank km={km} /></Scaled></div>
              <dl>
                <div><dt>{tr('Design', 'គំរូ')}</dt><dd>{tr(T.en, T.km)}</dd></div>
                <div><dt>{tr('CV language', 'ភាសា CV')}</dt><dd data-notranslate="1">{km ? 'ខ្មែរ' : 'English'}</dd></div>
                <div><dt>{tr('Name', 'ឈ្មោះ')}</dt><dd>{data.name || '—'}</dd></div>
                <div className="tot"><dt>{tr('Total', 'សរុប')}</dt><dd>{money(price)}</dd></div>
              </dl>
            </div>
            <div className="cvmPayOpts" role="radiogroup" aria-label={tr('Payment method', 'វិធីទូទាត់')}>
              <button type="button" role="radio" aria-checked={method === 'khqr'} className={'cvmPayOpt' + (method === 'khqr' ? ' on' : '')} disabled={bkOn !== true} onClick={() => setMethod('khqr')}>
                <span className="cvmPayBadge">KHQR</span><span><b>KHQR</b><small>{tr('Any Bakong banking app', 'កម្មវិធីធនាគារ Bakong ណាមួយ')}</small></span><i className="cvmRadio" />
              </button>
              <button type="button" role="radio" aria-checked={method === 'wallet'} className={'cvmPayOpt' + (method === 'wallet' ? ' on' : '')} disabled={bal === null || walletLow} onClick={() => setMethod('wallet')}>
                <span className="cvmPayBadge w"><Wallet /></span>
                <span><b>{tr('Wallet', 'កាបូប')}</b><small>{bal === null ? tr('Balance unavailable', 'មិនអាចមើលសមតុល្យបាន') : <>{tr('Balance', 'សមតុល្យ')} {money(bal)}{walletLow && <> · {tr('not enough', 'មិនគ្រប់គ្រាន់')}</>}</>}</small></span><i className="cvmRadio" />
              </button>
              {bkOn === false && <p className="cvmHint">{tr('KHQR is not available right now. You can still pay from your wallet.', 'KHQR មិនអាចប្រើបានទេឥឡូវនេះ។ អ្នកនៅតែអាចទូទាត់ពីកាបូបបាន។')}</p>}
            </div>
            {err && <p className="cvmErr" role="alert">{err}</p>}
            <div className="cvmBar two">
              <button type="button" className="cvmBack" onClick={() => setStep('info')}><ArrowLeft />{tr('Back', 'ត្រឡប់')}</button>
              <button type="button" className="cvmGo pay" disabled={busy || (method === 'khqr' ? bkOn !== true : walletLow)} onClick={startPay}>
                {busy ? tr('Please wait…', 'សូមរង់ចាំ…') : method === 'wallet' ? <>{tr('Pay with Wallet', 'ទូទាត់ពីកាបូប')} · {money(price)}</> : <>{tr('Pay with KHQR', 'ទូទាត់តាម KHQR')} · {money(price)}</>}
              </button>
            </div>
          </>
        )}

        {/* ---------------- 5. generating ---------------- */}
        {step === 'generating' && tpl && <CvGenerating tpl={tpl} data={data} km={km} onDone={() => setStep('editor')} />}

        {/* ---------------- 6. preview + edit ---------------- */}
        {step === 'editor' && tpl && (
          <>
            <div className="cvmEdHead">
              <div><span className="cvmBadgeOk"><Sparkles />{tr('Paid', 'បានទូទាត់')}</span><h1>{tr('Your CV is ready', 'CV របស់អ្នករួចរាល់ហើយ')}</h1>
                <p className="cvmSave" data-s={saved}>{saved === 'saving' ? tr('Saving…', 'កំពុងរក្សាទុក…') : saved === 'saved' ? tr('All changes saved', 'បានរក្សាទុកការកែប្រែទាំងអស់') : saved === 'error' ? tr('Could not save. Check your connection.', 'មិនអាចរក្សាទុកបានទេ។ សូមពិនិត្យអ៊ីនធឺណិត។') : tr('Edit anything, then save as PDF.', 'កែអ្វីក៏បាន រួចរក្សាទុកជា PDF។')}</p></div>
              <button type="button" className="cvmGo" onClick={savePdf}><Download />{tr('Save as PDF', 'រក្សាទុកជា PDF')}</button>
            </div>
            {overflow && <p className="cvmWarn" role="alert">{tr('Some text goes past the bottom of the page. Shorten it or remove an item so everything fits.', 'អក្សរខ្លះហួសពីបាតទំព័រ។ សូមកាត់បន្ថយអក្សរ ឬលុបធាតុមួយ ដើម្បីឱ្យចុះក្នុងទំព័រ។')}</p>}
            <div className="cvmTabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'preview'} className={tab === 'preview' ? 'on' : ''} onClick={() => setTab('preview')}><FileText />{tr('Preview', 'មើលជាមុន')}</button>
              <button type="button" role="tab" aria-selected={tab === 'edit'} className={tab === 'edit' ? 'on' : ''} onClick={() => setTab('edit')}><Pencil />{tr('Edit', 'កែ')}</button>
            </div>
            <div className={'cvmEd t-' + tab}>
              <div className="cvmEdPrev"><div className="cvmPaper"><Scaled><CvSheet tpl={tpl} data={data} km={km} onFit={setOverflow} /></Scaled></div></div>
              <div className="cvmEdForm"><CvForm tpl={tpl} data={data} set={set} /></div>
            </div>
            <p className="cvmHint center">{tr('Tip: in the print window choose “Save as PDF” and set margins to “None”.', 'គន្លឹះ៖ នៅក្នុងផ្ទាំងបោះពុម្ព សូមជ្រើស «Save as PDF» ហើយកំណត់គែមទៅ «None»។')}</p>
            <div className="cvmBar two">
              <button type="button" className="cvmBack" onClick={() => { setStep('home'); setTpl(null); setCvId(null); setData(emptyCv()); try { localStorage.removeItem(DRAFT); } catch { /* ignore */ } loadMine(); }}><ArrowLeft />{tr('My CVs', 'CV របស់ខ្ញុំ')}</button>
              <button type="button" className="cvmGo" onClick={savePdf}><Download />{tr('Save as PDF', 'រក្សាទុកជា PDF')}</button>
            </div>
          </>
        )}
      </main>

      {payOpen && cvId && <PayModal cvId={cvId} onClose={() => { setPayOpen(false); loadMine(); }} onPaid={afterPaid} />}

      {walletDone && (
        <div className="payModal" onClick={afterPaid}>
          <div className="payModalCard" onClick={e => e.stopPropagation()}>
            <button className="icon payClose" onClick={afterPaid} aria-label="Close"><X /></button>
            <div className="payDone k-cv" style={{ ['--tx' as any]: '2300ms' }} role="status" aria-live="polite">
              <PaymentScene kind="cv" amountText={money(price)} />
              <h3>{tr('Payment received', 'បានទទួលការទូទាត់')}</h3>
              <p className="payDoneSub">{tr('Your CV is paid. Let us build it now!', 'CV របស់អ្នកបានទូទាត់ហើយ។ តោះបង្កើតវាឥឡូវនេះ!')}</p>
              <div className="payDoneAmt">{money(price)}</div>
              <dl className="payDoneRows">
                <div><dt>{tr('Paid with', 'ទូទាត់ដោយ')}</dt><dd>{tr('Wallet', 'កាបូប')}</dd></div>
                <div><dt>{tr('For', 'សម្រាប់')}</dt><dd>{tr('CV maker', 'បង្កើត CV')}</dd></div>
              </dl>
              <button className="wide" onClick={afterPaid}>{tr('Build my CV', 'បង្កើត CV របស់ខ្ញុំ')}</button>
              <i className="payDoneBar" aria-hidden="true" />
            </div>
          </div>
        </div>
      )}

      {/* full-size copy used only for printing / saving as PDF */}
      {printHost && tpl && step === 'editor' && createPortal(<CvSheet tpl={tpl} data={data} km={km} />, printHost)}
      <Nav />
    </>
  );
}
