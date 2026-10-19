import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, Copy, ExternalLink, FileText, ImagePlus, LayoutTemplate, Lightbulb, PenTool,
  Printer, Send, Smartphone, Trash2, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabase';
import { isKm, tr, useLang } from './lang';
import './services.css';

/* ---------------------------------------------------------------------------------------------
   Services page (customer) + Requests page (admin).
   - Customers pick a service, describe it, optionally attach a file -> table service_requests.
   - Customers can send a photo of a product they could not find -> table product_suggestions.
   - Files go to the public storage bucket "service-uploads". Run supabase-services.sql once.
   Each service has an "ink" colour (print-shop CMYK idea) so every card is easy to tell apart.
   --------------------------------------------------------------------------------------------- */

type Status = 'new' | 'in_progress' | 'done' | 'declined';
type Service = {
  k: string;
  ink: string;
  fg?: string;
  Icon: LucideIcon;
  en: string; km: string;
  dEn: string; dKm: string;
  tagsEn: string[]; tagsKm: string[];
  hintEn: string; hintKm: string;
};

const PRINT_COPY: Service[] = [
  {
    k: 'print', ink: '#00a3d9', Icon: Printer,
    en: 'Printing', km: 'ការបោះពុម្ព',
    dEn: 'Documents, photos, flyers and name cards printed sharp, in colour or black and white.',
    dKm: 'បោះពុម្ពឯកសារ រូបថត ខិត្តប័ណ្ណ និងកាតឈ្មោះ ច្បាស់ ជាពណ៌ ឬសខ្មៅ។',
    tagsEn: ['Documents', 'Photos', 'Flyers', 'Name cards'], tagsKm: ['ឯកសារ', 'រូបថត', 'ខិត្តប័ណ្ណ', 'កាតឈ្មោះ'],
    hintEn: 'What should we print? Add size, paper type, colour or black and white, and how many copies.',
    hintKm: 'តើចង់បោះពុម្ពអ្វី? សូមបញ្ជាក់ទំហំ ប្រភេទក្រដាស ពណ៌ ឬសខ្មៅ និងចំនួន។',
  },
  {
    k: 'copy', ink: '#f2b705', fg: '#241b35', Icon: Copy,
    en: 'Copy', km: 'ថតចម្លង',
    dEn: 'Quick photocopies and scans of IDs, forms and book pages. Send the file or bring the original.',
    dKm: 'ថតចម្លង និងស្កេនអត្តសញ្ញាណប័ណ្ណ ទម្រង់ បែបបទ និងទំព័រសៀវភៅ ឲ្យលឿន។',
    tagsEn: ['Photocopy', 'Scan', 'A4 and A3'], tagsKm: ['ថតចម្លង', 'ស្កេន', 'A4 និង A3'],
    hintEn: 'What needs copying? Add how many pages, how many copies, and A4 or A3.',
    hintKm: 'តើត្រូវថតចម្លងអ្វី? សូមបញ្ជាក់ចំនួនទំព័រ ចំនួនថត និង A4 ឬ A3។',
  },
];

const DESIGN: Service[] = [
  {
    k: 'social', ink: '#e5007d', Icon: Smartphone,
    en: 'Social media post design', km: 'ការរចនាប៉ុស្តិ៍បណ្តាញសង្គម',
    dEn: 'Posts, stories and covers for Facebook, Instagram and TikTok that match your brand.',
    dKm: 'រចនាប៉ុស្តិ៍ រឿងរ៉ាវ និងរូបគម្រប សម្រាប់ Facebook, Instagram និង TikTok តាមម៉ាកអ្នក។',
    tagsEn: ['Posts', 'Stories', 'Covers'], tagsKm: ['ប៉ុស្តិ៍', 'រឿងរ៉ាវ', 'រូបគម្រប'],
    hintEn: 'Which platform, what is the post about, and what text should it show?',
    hintKm: 'ប្រើលើវេទិកាណា ប៉ុស្តិ៍អំពីអ្វី ហើយត្រូវដាក់អក្សរអ្វីខ្លះ?',
  },
  {
    k: 'poster', ink: '#7c3aed', Icon: LayoutTemplate,
    en: 'Poster design', km: 'ការរចនាប៉ូស្ទ័រ',
    dEn: 'Eye-catching posters for events, promotions and shops, ready to print at any size.',
    dKm: 'រចនាប៉ូស្ទ័រទាក់ទាញ សម្រាប់ព្រឹត្តិការណ៍ ប្រូម៉ូសិន និងហាង រួចបោះពុម្ពបានគ្រប់ទំហំ។',
    tagsEn: ['Events', 'Promotions', 'Print-ready'], tagsKm: ['ព្រឹត្តិការណ៍', 'ប្រូម៉ូសិន', 'ត្រៀមបោះពុម្ព'],
    hintEn: 'What is the poster for? Add the size, the text, date and place, and any colours you like.',
    hintKm: 'ប៉ូស្ទ័រសម្រាប់អ្វី? សូមបញ្ជាក់ទំហំ អក្សរ កាលបរិច្ឆេទ ទីកន្លែង និងពណ៌ដែលចូលចិត្ត។',
  },
  {
    k: 'logo', ink: '#241b35', Icon: PenTool,
    en: 'Logo design', km: 'ការរចនាឡូហ្គោ',
    dEn: 'A simple, memorable logo for your business, delivered ready for print and for screens.',
    dKm: 'ឡូហ្គោសាមញ្ញ ងាយចងចាំ សម្រាប់អាជីវកម្មរបស់អ្នក សម្រាប់ទាំងបោះពុម្ព និងអេក្រង់។',
    tagsEn: ['New logo', 'Redraw', 'Print and web'], tagsKm: ['ឡូហ្គោថ្មី', 'គូរឡើងវិញ', 'បោះពុម្ព និងអនឡាញ'],
    hintEn: 'What is the business name and what do you sell? Add colours or styles you like.',
    hintKm: 'តើអាជីវកម្មឈ្មោះអ្វី លក់អ្វី? សូមបញ្ជាក់ពណ៌ ឬស្ទីលដែលចូលចិត្ត។',
  },
];

const ALL = [...PRINT_COPY, ...DESIGN];
const MAX_MB = 10;

const STATUS: Record<Status, { en: string; km: string }> = {
  new: { en: 'Received', km: 'បានទទួល' },
  in_progress: { en: 'In progress', km: 'កំពុងធ្វើ' },
  done: { en: 'Done', km: 'រួចរាល់' },
  declined: { en: 'Not available', km: 'មិនអាចធ្វើបាន' },
};
const statusLabel = (s: string) => {
  const x = STATUS[(s as Status)] || STATUS.new;
  return tr(x.en, x.km);
};

const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, '_');

/** Shrinks big phone photos before upload. Anything that is not an image (PDF, etc.) is sent unchanged. */
async function prepareFile(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < 1_500_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    const g = c.getContext('2d');
    if (!g) return file;
    g.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.86));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

async function uploadFile(userId: string, file: File): Promise<string> {
  const f = await prepareFile(file);
  const path = `${userId}/${crypto.randomUUID()}-${safeName(f.name)}`;
  const up = await supabase.storage.from('service-uploads').upload(path, f, { upsert: false });
  if (up.error) throw up.error;
  return supabase.storage.from('service-uploads').getPublicUrl(path).data.publicUrl;
}

type Shell = React.ComponentType<{ title: string; children: React.ReactNode }>;
type Chrome = { Top: React.ComponentType<{ title?: string; back?: boolean }>; Nav: React.ComponentType };

/* ============================================ CUSTOMER ============================================ */

type Mine = { id: string; kind: 'service' | 'product'; title: string; status: string; created_at: string };

/** Fades/slides elements in as they scroll into view. Elements opt in with data-rv. */
function useReveal(dep: unknown) {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.svcPage [data-rv]:not(.in)'));
    if (!els.length) return;
    if (typeof IntersectionObserver === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      els.forEach(e => e.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    els.forEach(e => io.observe(e));
    return () => io.disconnect();
  }, [dep]);
}

export default function ServicesPage({ Top, Nav }: Chrome) {
  useLang();
  const nav = useNavigate();
  const [open, setOpen] = useState<Service | null>(null);
  const [mine, setMine] = useState<Mine[]>([]);

  const loadMine = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const u = data.user?.id;
    if (!u) return;
    const [a, b] = await Promise.all([
      supabase.from('service_requests').select('id,service,service_label,status,created_at').eq('user_id', u).order('created_at', { ascending: false }).limit(6),
      supabase.from('product_suggestions').select('id,name,status,created_at').eq('user_id', u).order('created_at', { ascending: false }).limit(6),
    ]);
    const rows: Mine[] = [
      ...((a.data as any[]) || []).map(r => {
        const s = ALL.find(x => x.k === r.service);
        return { id: r.id, kind: 'service' as const, title: s ? tr(s.en, s.km) : r.service_label || r.service, status: r.status, created_at: r.created_at };
      }),
      ...((b.data as any[]) || []).map(r => ({ id: r.id, kind: 'product' as const, title: r.name || tr('Product suggestion', 'ផលិតផលដែលណែនាំ'), status: r.status, created_at: r.created_at })),
    ];
    rows.sort((x, y) => +new Date(y.created_at) - +new Date(x.created_at));
    setMine(rows.slice(0, 6));
  }, []);
  useEffect(() => { loadMine(); }, [loadMine]);
  useReveal(mine.length);

  const renderCard = (s: Service, i: number) => (
    <article className="svcCard" data-rv key={s.k} style={{ ['--svc' as any]: s.ink, ['--svc-fg' as any]: s.fg || '#fff', ['--i' as any]: i }}>
      <div className="svcInk"><s.Icon /></div>
      <div className="svcBody">
        <h3>{tr(s.en, s.km)}</h3>
        <p>{tr(s.dEn, s.dKm)}</p>
        <ul className="svcTags">{(isKm() ? s.tagsKm : s.tagsEn).map(t => <li key={t}>{t}</li>)}</ul>
        <button type="button" className="svcAsk" onClick={() => setOpen(s)}>
          {tr('Request this', 'ស្នើសុំសេវានេះ')}
        </button>
      </div>
    </article>
  );

  return (
    <>
      <main className="shop svcPage">
        <Top title={tr('Services', 'សេវាកម្ម')} back />

        <section className="svcHero" aria-labelledby="svcTitle">
          <span className="svcSweep" aria-hidden="true" />
          <i className="svcCrop tl" /><i className="svcCrop tr" /><i className="svcCrop bl" /><i className="svcCrop br" />
          <div className="svcDots" aria-hidden="true"><b style={{ background: '#00a3d9' }} /><b style={{ background: '#e5007d' }} /><b style={{ background: '#f2b705' }} /><b style={{ background: '#241b35' }} /></div>
          <h1 id="svcTitle">{tr('Print it. Copy it. Design it.', 'បោះពុម្ព ថតចម្លង រចនា។')}</h1>
          <p>{tr('Choose a service, tell us what you need, and we will reply with a price.', 'ជ្រើសរើសសេវា ប្រាប់យើងពីអ្វីដែលអ្នកត្រូវការ ហើយយើងនឹងឆ្លើយតបជាមួយតម្លៃ។')}</p>
        </section>

        <article className="svcCard" data-rv style={{ ['--svc' as any]: '#7c3aed', ['--svc-fg' as any]: '#fff', ['--i' as any]: 0 }}>
          <div className="svcInk"><FileText /></div>
          <div className="svcBody">
            <h3>{tr('CV maker', 'បង្កើត CV')}</h3>
            <p>{tr('Pick a design, add your info in English or Khmer, pay and download your CV as a PDF.', 'ជ្រើសរើសគំរូ បញ្ចូលព័ត៌មានជាអង់គ្លេស ឬខ្មែរ ទូទាត់ ហើយទាញយក CV ជា PDF។')}</p>
            <ul className="svcTags">{(isKm() ? ['១៣ គំរូ', 'អង់គ្លេស / ខ្មែរ', 'PDF', '$3'] : ['13 designs', 'English / Khmer', 'PDF', '$3']).map(t => <li key={t}>{t}</li>)}</ul>
            <button type="button" className="svcAsk" onClick={() => nav('/services/cv')}>{tr('Make my CV', 'បង្កើត CV របស់ខ្ញុំ')}</button>
          </div>
        </article>
        <div style={{ height: 22 }} />

        <h2 className="svcGroup" data-rv>{tr('Print and copy', 'បោះពុម្ព និងថតចម្លង')}</h2>
        <div className="svcList">{PRINT_COPY.map((s, i) => renderCard(s, i))}</div>

        <h2 className="svcGroup" data-rv>{tr('Design', 'រចនា')}</h2>
        <div className="svcList">{DESIGN.map((s, i) => renderCard(s, i))}</div>

        <ProductIdea onSent={loadMine} />

        {mine.length > 0 && (
          <section className="svcMine" data-rv aria-label={tr('Your requests', 'សំណើរបស់អ្នក')}>
            <h2 className="svcGroup">{tr('Your requests', 'សំណើរបស់អ្នក')}</h2>
            <ul>
              {mine.map(r => (
                <li key={r.kind + r.id}>
                  <span className="svcMineIcon">{r.kind === 'product' ? <Lightbulb /> : <Send />}</span>
                  <span className="svcMineText"><b>{r.title}</b><small>{new Date(r.created_at).toLocaleDateString()}</small></span>
                  <span className={'svcStatus s-' + r.status}>{statusLabel(r.status)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      {open && <RequestSheet service={open} onClose={() => setOpen(null)} onSent={loadMine} />}
      <Nav />
    </>
  );
}

function RequestSheet({ service, onClose, onSent }: { service: Service; onClose: () => void; onSent: () => void }) {
  const [details, setDetails] = useState('');
  const [contact, setContact] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const area = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    area.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = prev; };
  }, [onClose]);

  function pick(f: File | null) {
    setErr('');
    if (f && f.size > MAX_MB * 1024 * 1024) { setErr(tr(`That file is bigger than ${MAX_MB} MB. Choose a smaller one.`, `ឯកសារនេះធំជាង ${MAX_MB} MB។ សូមជ្រើសរើសឯកសារតូចជាងនេះ។`)); return; }
    setFile(f);
  }

  async function submit() {
    if (busy) return;
    if (details.trim().length < 5) { setErr(tr('Tell us a little more about what you need.', 'សូមប្រាប់បន្ថែមបន្តិចអំពីអ្វីដែលអ្នកត្រូវការ។')); return; }
    setBusy(true); setErr('');
    try {
      const { data } = await supabase.auth.getUser();
      const u = data.user?.id;
      if (!u) throw new Error(tr('Please sign in again.', 'សូមចូលគណនីម្ដងទៀត។'));
      const file_url = file ? await uploadFile(u, file) : null;
      const r = await supabase.from('service_requests').insert({
        user_id: u, service: service.k, service_label: service.en,
        details: details.trim(), contact: contact.trim() || null, file_url,
      });
      if (r.error) throw r.error;
      setSent(true); onSent();
    } catch (e: any) {
      setErr(e?.message || tr('Could not send. Please try again.', 'មិនអាចផ្ញើបានទេ។ សូមព្យាយាមម្ដងទៀត។'));
    } finally { setBusy(false); }
  }

  return (
    <div className="svcScrim" role="presentation" onClick={onClose}>
      <div className="svcSheet" role="dialog" aria-modal="true" aria-label={tr(service.en, service.km)} style={{ ['--svc' as any]: service.ink, ['--svc-fg' as any]: service.fg || '#fff' }} onClick={e => e.stopPropagation()}>
        <button type="button" className="svcClose" onClick={onClose} aria-label={tr('Close', 'បិទ')}><X /></button>
        {sent ? (
          <div className="svcDone">
            <div className="svcBurst" aria-hidden="true">{Array.from({ length: 22 }, (_, k) => <i key={k} className={'b' + (k % 3)} style={{ ['--a' as any]: (k * 360 / 22) + 'deg', ['--c' as any]: ['#00a3d9', '#e5007d', '#f2b705', '#241b35', '#7c3aed'][k % 5], ['--r' as any]: (80 + (k % 4) * 20) + 'px', ['--d' as any]: (k % 4) * 35 + 'ms' }} />)}</div>
            <span className="svcDoneIcon"><svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="25" /><path d="M15 27l7 7 15-16" /></svg></span>
            <h3>{tr('Request sent', 'បានផ្ញើសំណើ')}</h3>
            <p>{tr('We will review it and reply with a price. You can follow it under Your requests on this page.', 'យើងនឹងពិនិត្យ ហើយឆ្លើយតបជាមួយតម្លៃ។ អ្នកអាចតាមដានវានៅក្នុង «សំណើរបស់អ្នក» នៅលើទំព័រនេះ។')}</p>
            <button type="button" className="svcPrimary" onClick={onClose}>{tr('Done', 'រួចរាល់')}</button>
          </div>
        ) : (
          <>
            <header className="svcSheetHead">
              <span className="svcInk sm"><service.Icon /></span>
              <h3>{tr(service.en, service.km)}</h3>
            </header>
            <label className="svcField">
              <span>{tr('What do you need?', 'តើអ្នកត្រូវការអ្វី?')}</span>
              <textarea ref={area} rows={5} value={details} onChange={e => setDetails(e.target.value)} placeholder={tr(service.hintEn, service.hintKm)} />
            </label>
            <label className="svcField">
              <span>{tr('Phone or Telegram (optional)', 'លេខទូរស័ព្ទ ឬ Telegram (ស្រេចចិត្ត)')}</span>
              <input value={contact} onChange={e => setContact(e.target.value)} inputMode="text" autoComplete="tel" placeholder="012 345 678 / @username" />
            </label>
            <label className={'svcFile' + (file ? ' has' : '')}>
              <ImagePlus />
              <span><b>{file ? file.name : tr('Add a file or picture (optional)', 'បន្ថែមឯកសារ ឬរូបភាព (ស្រេចចិត្ត)')}</b><small>{tr(`Photo, PDF or sample, up to ${MAX_MB} MB`, `រូបថត PDF ឬគំរូ រហូតដល់ ${MAX_MB} MB`)}</small></span>
              <input hidden type="file" accept="image/*,application/pdf" onChange={e => pick(e.target.files?.[0] || null)} />
            </label>
            {err && <p className="svcErr" role="alert">{err}</p>}
            <button type="button" className="svcPrimary" disabled={busy} onClick={submit}>
              {busy ? tr('Sending…', 'កំពុងផ្ញើ…') : tr('Send request', 'ផ្ញើសំណើ')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ProductIdea({ onSent }: { onSent: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function pick(f: File | null) {
    setErr(''); setOk(false);
    if (f && f.size > MAX_MB * 1024 * 1024) { setErr(tr(`That picture is bigger than ${MAX_MB} MB. Choose a smaller one.`, `រូបភាពនេះធំជាង ${MAX_MB} MB។ សូមជ្រើសរើសរូបតូចជាងនេះ។`)); return; }
    setFile(f);
  }

  async function submit() {
    if (busy) return;
    if (!file) { setErr(tr('Add a picture of the product first.', 'សូមបន្ថែមរូបភាពផលិតផលជាមុនសិន។')); return; }
    setBusy(true); setErr('');
    try {
      const { data } = await supabase.auth.getUser();
      const u = data.user?.id;
      if (!u) throw new Error(tr('Please sign in again.', 'សូមចូលគណនីម្ដងទៀត។'));
      const image_url = await uploadFile(u, file);
      const r = await supabase.from('product_suggestions').insert({ user_id: u, name: name.trim() || null, note: note.trim() || null, image_url });
      if (r.error) throw r.error;
      setFile(null); setName(''); setNote(''); setOk(true); onSent();
    } catch (e: any) {
      setErr(e?.message || tr('Could not send. Please try again.', 'មិនអាចផ្ញើបានទេ។ សូមព្យាយាមម្ដងទៀត។'));
    } finally { setBusy(false); }
  }

  return (
    <section className="svcIdea" data-rv aria-labelledby="svcIdeaTitle">
      <h2 id="svcIdeaTitle">{tr('Cannot find a product?', 'រកមិនឃើញផលិតផលមែនទេ?')}</h2>
      <p>{tr('Send us a picture of what you want. If we can get it, we will add it to the shop.', 'ផ្ញើរូបភាពនៃអ្វីដែលអ្នកចង់បានមកយើង។ បើយើងរកបាន យើងនឹងដាក់វាចូលហាង។')}</p>

      <label className={'svcDrop' + (preview ? ' has' : '')}>
        {preview ? <img src={preview} alt={tr('Your product picture', 'រូបភាពផលិតផលរបស់អ្នក')} /> : <><ImagePlus /><b>{tr('Add a product picture', 'បន្ថែមរូបភាពផលិតផល')}</b><small>{tr('Take a photo or choose one from your phone', 'ថតរូប ឬជ្រើសរើសពីទូរស័ព្ទ')}</small></>}
        <input hidden type="file" accept="image/*" onChange={e => pick(e.target.files?.[0] || null)} />
      </label>
      {preview && <button type="button" className="svcLink" onClick={() => setFile(null)}>{tr('Remove picture', 'លុបរូបភាព')}</button>}

      <label className="svcField">
        <span>{tr('Product name (optional)', 'ឈ្មោះផលិតផល (ស្រេចចិត្ត)')}</span>
        <input value={name} onChange={e => setName(e.target.value)} maxLength={80} />
      </label>
      <label className="svcField">
        <span>{tr('Anything else we should know? (optional)', 'មានអ្វីផ្សេងទៀតដែលយើងគួរដឹង? (ស្រេចចិត្ត)')}</span>
        <textarea rows={3} value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder={tr('Size, colour, brand, where you saw it…', 'ទំហំ ពណ៌ ម៉ាក កន្លែងដែលអ្នកបានឃើញ…')} />
      </label>
      {err && <p className="svcErr" role="alert">{err}</p>}
      {ok && <p className="svcOk" role="status"><Check /> {tr('Sent. Thank you, we will take a look.', 'បានផ្ញើ។ អរគុណ យើងនឹងពិនិត្យមើល។')}</p>}
      <button type="button" className="svcPrimary" disabled={busy} onClick={submit}>
        {busy ? tr('Sending…', 'កំពុងផ្ញើ…') : tr('Send picture', 'ផ្ញើរូបភាព')}
      </button>
    </section>
  );
}

/* ============================================== ADMIN ============================================== */

type Tab = 'services' | 'products';

export function AdminServiceRequests({ Shell }: { Shell: Shell }) {
  const [tab, setTab] = useState<Tab>('services');
  const [reqs, setReqs] = useState<any[]>([]);
  const [ideas, setIdeas] = useState<any[]>([]);
  const [people, setPeople] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('service_requests').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('product_suggestions').select('*').order('created_at', { ascending: false }).limit(200),
    ]);
    if (a.error || b.error) setMsg((a.error || b.error)!.message + ' — did you run supabase-services.sql?');
    const ra = (a.data as any[]) || [], rb = (b.data as any[]) || [];
    setReqs(ra); setIdeas(rb);
    const ids = Array.from(new Set([...ra, ...rb].map(x => x.user_id).filter(Boolean)));
    if (ids.length) {
      const p = await supabase.from('profiles').select('user_id,name,email').in('user_id', ids);
      const m: Record<string, any> = {};
      ((p.data as any[]) || []).forEach(x => { m[x.user_id] = x; });
      setPeople(m);
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function setStatus(table: string, id: string, status: Status) {
    const r = await supabase.from(table).update({ status }).eq('id', id);
    if (r.error) { alert(r.error.message); return; }
    load();
  }
  async function remove(table: string, id: string) {
    if (!confirm('Delete this? This cannot be undone.')) return;
    const r = await supabase.from(table).delete().eq('id', id);
    if (r.error) { alert(r.error.message); return; }
    load();
  }

  const newCount = (rows: any[]) => rows.filter(x => x.status === 'new').length;
  const who = (id: string) => people[id]?.name || people[id]?.email || 'Customer';
  const isImg = (u: string) => /\.(png|jpe?g|gif|webp|avif|heic)(\?|$)/i.test(u || '');

  const StatusPick = ({ table, row }: { table: string; row: any }) => (
    <select value={row.status} onChange={e => setStatus(table, row.id, e.target.value as Status)} aria-label="Status">
      <option value="new">New</option>
      <option value="in_progress">In progress</option>
      <option value="done">Done</option>
      <option value="declined">Declined</option>
    </select>
  );

  return (
    <Shell title="Requests">
      <div className="svcAdminTabs" role="tablist">
        <button role="tab" aria-selected={tab === 'services'} className={tab === 'services' ? 'on' : ''} onClick={() => setTab('services')}>
          Service requests{newCount(reqs) > 0 && <em>{newCount(reqs)}</em>}
        </button>
        <button role="tab" aria-selected={tab === 'products'} className={tab === 'products' ? 'on' : ''} onClick={() => setTab('products')}>
          Product ideas{newCount(ideas) > 0 && <em>{newCount(ideas)}</em>}
        </button>
      </div>
      {msg && <p className="notice">{msg}</p>}
      {loading && <p className="muted">Loading…</p>}

      {tab === 'services' && !loading && (
        <div className="svcAdminList">
          {reqs.map(r => (
            <article className="panel svcAdminRow" key={r.id}>
              <header>
                <b>{r.service_label || r.service}</b>
                <small>{who(r.user_id)}{people[r.user_id]?.email && people[r.user_id]?.name ? ' · ' + people[r.user_id].email : ''} · {new Date(r.created_at).toLocaleString()}</small>
              </header>
              <p className="svcAdminText">{r.details}</p>
              {r.contact && <p className="svcAdminMeta">Contact: <b>{r.contact}</b></p>}
              {r.file_url && (
                <a className="svcAdminFile" href={r.file_url} target="_blank" rel="noreferrer">
                  {isImg(r.file_url) ? <img src={r.file_url} alt="" /> : null}
                  <span><ExternalLink /> Open attached file</span>
                </a>
              )}
              <footer>
                <StatusPick table="service_requests" row={r} />
                <button className="icon danger" onClick={() => remove('service_requests', r.id)} title="Delete" aria-label="Delete"><Trash2 /></button>
              </footer>
            </article>
          ))}
          {!reqs.length && <p className="muted">No service requests yet.</p>}
        </div>
      )}

      {tab === 'products' && !loading && (
        <div className="svcAdminList">
          {ideas.map(r => (
            <article className="panel svcAdminRow idea" key={r.id}>
              <a className="svcAdminThumb" href={r.image_url} target="_blank" rel="noreferrer"><img src={r.image_url} alt={r.name || 'Product suggestion'} /></a>
              <div className="svcAdminBody">
                <header>
                  <b>{r.name || 'Untitled product'}</b>
                  <small>{who(r.user_id)} · {new Date(r.created_at).toLocaleString()}</small>
                </header>
                {r.note && <p className="svcAdminText">{r.note}</p>}
                <footer>
                  <StatusPick table="product_suggestions" row={r} />
                  <button className="icon danger" onClick={() => remove('product_suggestions', r.id)} title="Delete" aria-label="Delete"><Trash2 /></button>
                </footer>
              </div>
            </article>
          ))}
          {!ideas.length && <p className="muted">No product ideas yet.</p>}
        </div>
      )}
    </Shell>
  );
}
