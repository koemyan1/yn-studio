import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, Crosshair, Layers, MapPin, Pencil, Plus, RotateCcw, Send, Sparkles, Trash2, Wallet, X } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from './supabase';
import { isKm, tr, useLang } from './lang';
import { BookCoverSheet, Scaled, ensureBcFonts, labelOf, spotOf } from './bookCoverSheet';
import { DEFAULT_PRICE_PER_PAGE, MAX_COVERS, MAX_ITEMS, bcNo, cleanFields, hasSubjectFields, orderItems, orderTotal, validateContact } from '../shared/bookCoverMath.js';
import type { BcCover, BcField } from '../shared/bookCoverMath.js';
import './cv.css';
import './bookCover.css';

/* ---------------------------------------------------------------------------------------------
   Book cover service (works like the CV maker, but the design is a picture the admin uploaded).
     /services/book-cover               pick a design
     /services/book-cover/:designId     1 your info  2 other subjects  3 your order (add more designs)  4 pay (phone + location + KHQR)  5 place the text, send to print
     /services/book-cover/order/:id     the same page, reopened from "Your covers"
   One order can hold several DIFFERENT designs (up to MAX_ITEMS, MAX_COVERS pages in all); each design has its own subjects / pages.
   250 riel per page by default (the admin can change it per design). The price on the order is set by the server, never by this page.
   SQL: supabase-book-covers.sql   Server: server/bookCover.js
   --------------------------------------------------------------------------------------------- */

type Chrome = {
  Top: React.ComponentType<{ title?: string; back?: boolean }>;
  Nav: React.ComponentType;
  PayModal?: React.ComponentType<any>;
  /** Is Bakong KHQR switched on? (null = still checking) */
  bkOn?: boolean | null;
};
type Design = { id: string; name_en: string; name_km: string; image: string; price_per_page: number; fields: BcField[] };
type Mine = { id: string; design_name: string; pages: number; total: number; status: string; created_at: string };
type Draft = { values: Record<string, string> }[];
type Step = 'info' | 'subjects' | 'basket' | 'pay' | 'layout';
/** One design in the order, with the pages the customer is filling in for it. */
type Item = { design: Design; draft: Draft };
type SavedBasket = { design_id: string; draft: Draft }[];
/** Quick colours for the text; the round picker beside them allows any colour. */
const TEXT_COLORS = ['#1b1b1b', '#ffffff', '#c1121f', '#e5007d', '#7c3aed', '#1d4ed8', '#0f8a5f', '#f59e0b'];
const DESIGN_COLS = 'id,name_en,name_km,image_url,price_per_page,fields';

export const riel = (n: number) => Math.round(Number(n) || 0).toLocaleString('en-US') + ' ៛';
const API_BASE: string = ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/$/, '');
async function api(path: string, body: any): Promise<any> {
  const { data } = await supabase.auth.getSession();
  const r = await fetch(API_BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (data.session?.access_token || '') }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error || 'Request failed (' + r.status + ')'), { code: j?.code });
  return j;
}
async function uid(): Promise<string | null> { const { data } = await supabase.auth.getUser(); return data.user?.id || null; }

const STATUS_TXT: Record<string, [string, string]> = {
  pending: ['Not paid yet', 'មិនទាន់បានទូទាត់'],
  paid: ['Paid · place your text', 'បានទូទាត់ · រៀបចំអក្សរ'],
  submitted: ['Sent to print', 'បានផ្ញើទៅបោះពុម្ព'],
  printed: ['Printed', 'បានបោះពុម្ព'],
  delivered: ['Delivered', 'បានដឹកជូន'],
  cancelled: ['Cancelled', 'បានលុបចោល'],
};
export const statusTxt = (s: string) => { const x = STATUS_TXT[s] || STATUS_TXT.pending; return tr(x[0], x[1]); };

const toDesign = (d: any): Design => ({ id: d.id, name_en: d.name_en, name_km: d.name_km || '', image: d.image_url, price_per_page: Number(d.price_per_page) || DEFAULT_PRICE_PER_PAGE, fields: cleanFields(d.fields) });
const designName = (d: { name_en: string; name_km: string }) => tr(d.name_en, d.name_km || d.name_en);

/* The unfinished order lives in this browser until it is saved (one basket per signed-in customer). */
const basketKey = (u: string | null) => `yn-bc-basket:${u}`;
function readBasket(u: string | null): SavedBasket {
  try {
    const j = JSON.parse(localStorage.getItem(basketKey(u)) || 'null');
    return Array.isArray(j) ? j.filter(x => x && typeof x.design_id === 'string' && Array.isArray(x.draft)).slice(0, MAX_ITEMS) : [];
  } catch { return []; }
}
const clearBasket = (u: string | null) => { try { localStorage.removeItem(basketKey(u)); } catch { /* ignore */ } };

const blankCover = (fields: BcField[]) => ({ values: Object.fromEntries(fields.map(f => [f.key, ''])) as Record<string, string> });
/** The pages of one design as the page shows them: shared answers always follow page 1. */
const mergeCovers = (draft: Draft, fields: BcField[]): BcCover[] => draft.map((c, i) => ({
  pos: {},
  values: Object.fromEntries(fields.map(f => [f.key, i > 0 && !f.per_subject ? (draft[0]?.values[f.key] || '') : (c.values[f.key] || '')])),
}));
const firstOkOf = (it: Item) => it.design.fields.every(f => !f.required || (it.draft[0]?.values[f.key] || '').trim());
const extrasOkOf = (it: Item) => mergeCovers(it.draft, it.design.fields).every((c, i) => i === 0 || it.design.fields.every(f => !f.required || !f.per_subject || (c.values[f.key] || '').trim()));
const itemOk = (it: Item) => firstOkOf(it) && extrasOkOf(it);
const isBlank = (it: Item) => it.draft.every(c => Object.values(c.values).every(v => !String(v || '').trim()));
const hasText = (it: Item) => !isBlank(it);

/* ---------- animation helpers (the moving parts live in bookCover.css; "reduce motion" switches them off there) ---------- */
/** Book-like 3D tilt that follows the finger / mouse over a card. */
function tilt(e: React.PointerEvent<HTMLElement>) {
  const el = e.currentTarget, r = el.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
  el.style.setProperty('--ry', ((px - 0.5) * 18).toFixed(2) + 'deg');
  el.style.setProperty('--rx', ((0.5 - py) * 18).toFixed(2) + 'deg');
  el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
  el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
}
function untilt(e: React.PointerEvent<HTMLElement>) { for (const k of ['--rx', '--ry', '--mx', '--my']) e.currentTarget.style.removeProperty(k); }

function DesignCard({ d, i, onPick, taken }: { d: Design; i: number; onPick: () => void; taken?: boolean }) {
  return (
    <button type="button" className="cvmCard bcCard" style={{ ['--i' as any]: i }} onClick={onPick} onPointerMove={tilt} onPointerLeave={untilt} onPointerCancel={untilt}>
      <span className="bcTilt"><Scaled className="cvmCardSheet"><BookCoverSheet design={d} sample km={isKm()} /></Scaled><i className="bcShine" /></span>
      <span className="cvmCardName">{designName(d)}</span>
      <small className="bcCardPrice">{riel(d.price_per_page)} / {tr('page', 'ទំព័រ')}</small>
      {taken && <span className="bcTaken"><Check size={13} /> {tr('In your order', 'ក្នុងការបញ្ជាទិញ')}</span>}
    </button>
  );
}

/** The designs of the order fanned out like a hand of cards. A new one is dealt in from above. */
function Deck({ items, covers, fresh }: { items: Item[]; covers: BcCover[][]; fresh?: number | null }) {
  const shown = items.slice(0, 5);
  return (
    <div className="bcDeckWrap" aria-hidden>
      <div className="bcDeck" style={{ ['--n' as any]: shown.length }}>
        {shown.map((it, k) => (
          <div key={(it.design.id || 'x') + k} className={'bcDeckCard' + (fresh === k ? ' fresh' : '')} style={{ ['--k' as any]: k }}>
            <Scaled><BookCoverSheet design={it.design} cover={covers[k]?.[0]} /></Scaled>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A short burst of confetti (paid, sent to print). It sits on top of the page and never blocks a tap. */
function Burst() {
  const bits = useMemo(() => Array.from({ length: 30 }, (_, i) => {
    const a = (i / 30) * Math.PI * 2 + Math.random() * 0.4, dist = 90 + Math.random() * 170;
    return { dx: Math.cos(a) * dist, dy: Math.sin(a) * dist - 70, r: Math.round(Math.random() * 720 - 360), c: ['#7c3aed', '#e5007d', '#f5b301', '#16a34a', '#0ea5e9'][i % 5], w: 6 + Math.random() * 6, d: Math.random() * 0.14 };
  }), []);
  return <div className="bcBurst" aria-hidden>{bits.map((b, i) => <i key={i} style={{ ['--dx' as any]: b.dx + 'px', ['--dy' as any]: b.dy + 'px', ['--r' as any]: b.r + 'deg', ['--c' as any]: b.c, ['--w' as any]: b.w + 'px', ['--d' as any]: b.d + 's' }} />)}</div>;
}

/** "Add another design": the same cards as the gallery, in a sheet that slides up. Designs already in the order are hidden. */
function Picker({ taken, onPick, onClose }: { taken: Set<string>; onPick: (d: Design) => void; onClose: () => void }) {
  const [list, setList] = useState<Design[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    (async () => {
      const r = await supabase.from('book_cover_designs').select(DESIGN_COLS).eq('enabled', true).order('sort_order').order('created_at');
      if (!live) return;
      if (r.error) { setErr(r.error.message); setList([]); return; }
      setList(((r.data as any[]) || []).map(toDesign).filter(d => d.fields.length > 0));
    })();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => { live = false; window.removeEventListener('keydown', key); };
  }, [onClose]);
  const rest = (list || []).filter(d => !taken.has(d.id));
  return (
    <div className="bcPick" role="dialog" aria-modal="true" aria-label={tr('Add another design', 'បន្ថែមគំរូមួយទៀត')} onClick={onClose}>
      <div className="bcPickBox" onClick={e => e.stopPropagation()}>
        <header><b>{tr('Pick another design', 'ជ្រើសរើសគំរូមួយទៀត')}</b><button type="button" className="cvmLink" aria-label={tr('Close', 'បិទ')} onClick={onClose}><X /></button></header>
        {list === null && <p className="cvmHint center">{tr('Loading…', 'កំពុងផ្ទុក…')}</p>}
        {err && <p className="cvmWarn" role="alert">{err}</p>}
        {list && rest.length === 0 && !err && <p className="cvmHint center">{tr('You have already added every design.', 'អ្នកបានបន្ថែមគំរូទាំងអស់ហើយ។')}</p>}
        <div className="cvmGrid bcPickGrid">{rest.map((d, i) => <DesignCard key={d.id} d={d} i={i} onPick={() => onPick(d)} />)}</div>
      </div>
    </div>
  );
}

/* ============================================ 1. GALLERY ============================================ */
export function BookCoverHome({ Top, Nav }: Chrome) {
  useLang();
  const nav = useNavigate();
  const [designs, setDesigns] = useState<Design[] | null>(null);
  const [mine, setMine] = useState<Mine[]>([]);
  const [err, setErr] = useState('');
  const [basket, setBasket] = useState<SavedBasket>([]);
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => { ensureBcFonts(); }, []);
  useEffect(() => { (async () => { const u = await uid(); setMe(u); setBasket(readBasket(u)); })(); }, []);

  const loadMine = useCallback(async () => {
    const u = await uid(); if (!u) return;
    const r = await supabase.from('book_cover_orders').select('id,design_name,pages,total,status,created_at').eq('user_id', u).order('created_at', { ascending: false }).limit(12);
    if (!r.error) setMine((r.data as any[]) || []);
  }, []);
  useEffect(() => {
    (async () => {
      const r = await supabase.from('book_cover_designs').select(DESIGN_COLS).eq('enabled', true).order('sort_order').order('created_at');
      if (r.error) { setErr(/book_cover_designs|schema cache|does not exist/i.test(r.error.message) ? tr('This service is not switched on yet.', 'សេវានេះមិនទាន់បើកទេ។') : r.error.message); setDesigns([]); return; }
      setDesigns(((r.data as any[]) || []).map(toDesign).filter(d => d.fields.length > 0));
    })();
    loadMine();
  }, [loadMine]);

  async function remove(m: Mine) {
    if (!confirm(tr('Delete this unpaid cover?', 'លុបគម្របដែលមិនទាន់បានទូទាត់នេះ?'))) return;
    const r = await supabase.from('book_cover_orders').delete().eq('id', m.id);
    if (!r.error) loadMine();
  }

  const price = designs && designs.length ? Math.min(...designs.map(d => d.price_per_page)) : DEFAULT_PRICE_PER_PAGE;
  return (
    <>
      <main className="shop cvmPage bcPage bcHome">
        <Top title={tr('Book cover', 'គម្របសៀវភៅ')} back />
        <section className="cvmHero bcHero">
          <span className="cvmPrice">{riel(price)}<small> / {tr('page', 'ទំព័រ')}</small></span>
          <h1>{tr('Book covers', 'គម្របសៀវភៅ')}</h1>
          <ol className="bcHow">
            <li><i>1</i>{tr('Pick', 'ជ្រើស')}</li>
            <li><i>2</i>{tr('Add your name', 'ដាក់ឈ្មោះ')}</li>
            <li><i>3</i>{tr('Pay · place text', 'បង់ · រៀបអក្សរ')}</li>
          </ol>
        </section>

        {designs === null && <p className="cvmHint center">{tr('Loading…', 'កំពុងផ្ទុក…')}</p>}
        {err && <p className="cvmWarn" role="alert">{err}</p>}
        {designs && designs.length === 0 && !err && <p className="cvmHint center">{tr('No designs yet. Please check back soon.', 'មិនទាន់មានគំរូទេ។ សូមត្រឡប់មកវិញក្រោយ។')}</p>}
        {basket.length > 0 && (
          <div className="bcBasketBar" role="status">
            <span className="bcBasketIcon"><Layers /></span>
            <span><b>{basket.length} {tr('in your order', 'ក្នុងការបញ្ជាទិញ')}</b></span>
            <button type="button" className="cvmSmall" onClick={() => nav('/services/book-cover/' + basket[0].design_id, { state: { step: 'basket' } })}>{tr('Review order', 'មើលការបញ្ជាទិញ')}</button>
            <button type="button" className="cvmLink" aria-label={tr('Start over', 'ចាប់ផ្តើមឡើងវិញ')} onClick={() => { clearBasket(me); setBasket([]); }}><X size={16} /></button>
          </div>
        )}
        <div className="cvmGrid bcShelf">
          {(designs || []).map((d, i) => <DesignCard key={d.id} d={d} i={i} taken={basket.some(b => b.design_id === d.id)} onPick={() => nav('/services/book-cover/' + d.id)} />)}
        </div>

        {mine.length > 0 && (
          <section className="cvmMine">
            <h2>{tr('Your covers', 'គម្របរបស់អ្នក')}</h2>
            <ul>
              {mine.map(m => (
                <li key={m.id}>
                  <span className="cvmMineIcon"><BookOpen /></span>
                  <span className="cvmMineText"><b>{m.design_name || tr('Book cover', 'គម្របសៀវភៅ')}</b><small>{m.pages} {tr('page(s)', 'ទំព័រ')} · {riel(m.total)} · {statusTxt(m.status)}</small></span>
                  {m.status === 'pending' && <button type="button" className="cvmRm bcRm" aria-label={tr('Delete', 'លុប')} onClick={() => remove(m)}><Trash2 /></button>}
                  {m.status !== 'cancelled' && <button type="button" className="cvmSmall" onClick={() => nav('/services/book-cover/order/' + m.id)}>{m.status === 'pending' ? tr('Continue', 'បន្ត') : tr('Open', 'បើក')}</button>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <Nav />
    </>
  );
}

/* ============================================ 2-5. MAKER ============================================ */
function Field({ label, req, children }: { label: string; req?: boolean; children: React.ReactNode }) {
  return <label className="cvmF"><span>{label}{req && <b className="bcReq"> *</b>}</span>{children}</label>;
}

export function BookCoverMaker({ Top, Nav, PayModal, bkOn = null }: Chrome) {
  useLang();
  const nav = useNavigate();
  const loc = useLocation();
  const { designId, orderId: routeOrder } = useParams();

  const [items, setItems] = useState<Item[]>([]);          // the designs in the order, each with the pages typed for it
  const [active, setActive] = useState(0);                 // the design being filled in (steps 1 and 2)
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const [me, setMe] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('info');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [status, setStatus] = useState('pending');
  const [totals, setTotals] = useState<{ pages: number; total: number } | null>(null);
  const [layout, setLayout] = useState<BcCover[][]>([]);   // one list of pages per design (same order as `items`)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [picker, setPicker] = useState(false);
  const [fresh, setFresh] = useState<number | null>(null);
  const [burst, setBurst] = useState(0);
  const [contact, setContact] = useState({ name: '', phone: '', address: '', notes: '', lat: null as number | null, lng: null as number | null });
  const [gpsBusy, setGpsBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [sent, setSent] = useState(false);
  const [method, setMethod] = useState<'khqr' | 'wallet'>('khqr');
  const [bal, setBal] = useState<number | null>(null);      // riel wallet balance (null = unknown)

  useEffect(() => { ensureBcFonts(); }, []);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [step]);
  useEffect(() => { if (!burst) return; const t = window.setTimeout(() => setBurst(0), 2200); return () => window.clearTimeout(t); }, [burst]);

  const cur = items[active] || items[0];
  const fields = cur?.design.fields || [];
  const subj = hasSubjectFields(fields);
  const anySubj = items.some(it => hasSubjectFields(it.design.fields));
  const merged = useMemo(() => items.map(it => mergeCovers(it.draft, it.design.fields)), [items]);
  const lines = items.map((it, i) => ({ it, i, n: it.draft.length, price: it.design.price_per_page, sub: orderTotal(it.draft.length, it.design.price_per_page) }));
  const pages = lines.reduce((n, l) => n + l.n, 0);
  const total = lines.length && lines.every(l => l.sub > 0) ? lines.reduce((n, l) => n + l.sub, 0) : 0;
  const full = items.length >= MAX_ITEMS || pages >= MAX_COVERS;
  const allOk = items.length > 0 && items.every(itemOk);
  const locked = status === 'printed' || status === 'delivered' || status === 'cancelled';

  /* ---------- load the design (new) or the order (reopened) ---------- */
  useEffect(() => {
    let live = true;
    (async () => {
      const u = await uid(); if (!live) return; setMe(u);
      try {
        if (routeOrder) {
          const r = await supabase.from('book_cover_orders').select('id,status,design_id,design_name,design_image,design_fields,covers,items,pages,price_per_page,total,contact_name,phone,address,notes,lat,lng').eq('id', routeOrder).eq('user_id', u || '').single();
          if (r.error) throw r.error;
          const o: any = r.data;
          if (!live) return;
          const its = orderItems(o);                           // reads both the new `items` and orders made with one design
          setItems(its.map(it => ({
            design: { id: it.design_id || '', name_en: it.design_name || 'Book cover', name_km: '', image: it.design_image, price_per_page: it.price_per_page, fields: it.design_fields },
            draft: it.covers.length ? it.covers.map(c => ({ values: c.values })) : [blankCover(it.design_fields)],
          })));
          setLayout(its.map(it => it.covers));
          setOrderId(o.id); setStatus(o.status); setTotals({ pages: o.pages, total: o.total });
          setContact(c => ({ ...c, name: o.contact_name || '', phone: o.phone || '', address: o.address || '', notes: o.notes || '', lat: o.lat, lng: o.lng }));
          setStep(o.status === 'pending' ? 'pay' : 'layout');
        } else {
          const r = await supabase.from('book_cover_designs').select(DESIGN_COLS).eq('id', designId || '').eq('enabled', true).single();
          if (r.error) throw r.error;
          const d = toDesign(r.data);
          if (!live) return;
          // an unfinished order saved in this browser: the designs picked earlier come back, and this design joins them
          const savedB = readBasket(u);
          const byId = new Map<string, Design>([[d.id, d]]);
          const need = savedB.map(x => x.design_id).filter(id => id !== d.id);
          if (need.length) {
            const rr = await supabase.from('book_cover_designs').select(DESIGN_COLS).in('id', need).eq('enabled', true);
            for (const x of ((rr.data as any[]) || [])) { const dd = toDesign(x); if (dd.fields.length) byId.set(dd.id, dd); }
          }
          if (!live) return;
          const list: Item[] = [];
          for (const sv of savedB) {
            const dd = byId.get(sv.design_id);
            if (!dd || list.some(i => i.design.id === dd.id)) continue;
            const draft = sv.draft.slice(0, MAX_COVERS).map((c: any) => ({ values: { ...blankCover(dd.fields).values, ...(c?.values || {}) } }));
            list.push({ design: dd, draft: draft.length ? draft : [blankCover(dd.fields)] });
          }
          let idx = list.findIndex(i => i.design.id === d.id);
          if (idx < 0) { list.push({ design: d, draft: [blankCover(d.fields)] }); idx = list.length - 1; }
          setItems(list); setActive(idx);
          setStep((loc.state as any)?.step === 'basket' && list.every(itemOk) ? 'basket' : 'info');
        }
        setLoaded(true);
      } catch { if (live) setLoadErr(tr('We could not open this design. It may have been removed.', 'មិនអាចបើកគំរូនេះបានទេ។ វាប្រហែលជាត្រូវបានលុប។')); }
    })();
    return () => { live = false; };
  }, [designId, routeOrder]);   // eslint-disable-line react-hooks/exhaustive-deps

  // keep what the customer typed if they refresh: ONE basket per customer, holding every design that has some text in it
  useEffect(() => {
    if (!loaded || !me || orderId || routeOrder) return;
    const t = window.setTimeout(() => {
      try {
        const keep = items.filter(it => it.design.id && hasText(it));
        if (keep.length) localStorage.setItem(basketKey(me), JSON.stringify(keep.map(it => ({ design_id: it.design.id, draft: it.draft }))));
        else localStorage.removeItem(basketKey(me));
      } catch { /* full */ }
    }, 400);
    return () => window.clearTimeout(t);
  }, [items, loaded, me, orderId, routeOrder]);

  // phone + location: start from what the customer already saved in their profile ("if they haven't" -> they fill it here)
  useEffect(() => {
    if (!me) return;
    (async () => {
      const r = await supabase.from('profiles').select('name,phone,delivery_address,delivery_notes,delivery_lat,delivery_lng').eq('user_id', me).maybeSingle();
      const p: any = r.data; if (!p) return;
      setContact(c => ({
        name: c.name || p.name || '', phone: c.phone || p.phone || '', address: c.address || p.delivery_address || '', notes: c.notes || p.delivery_notes || '',
        lat: c.lat ?? (p.delivery_lat != null ? Number(p.delivery_lat) : null), lng: c.lng ?? (p.delivery_lng != null ? Number(p.delivery_lng) : null),
      }));
    })().catch(() => {});
  }, [me]);

  const loadBal = useCallback(async () => {
    if (!me) return;
    const r = await supabase.from('wallets').select('balance_khr').eq('user_id', me).maybeSingle();
    setBal(r.error ? null : Number((r.data as any)?.balance_khr || 0));
  }, [me]);
  useEffect(() => { loadBal(); }, [loadBal]);
  useEffect(() => { if (bkOn === false) setMethod('wallet'); }, [bkOn]);

  const editActive = (fn: (d: Draft) => Draft) => setItems(L => L.map((it, k) => (k === active ? { ...it, draft: fn(it.draft) } : it)));
  const setVal = (i: number, key: string, v: string) => editActive(d => d.map((c, j) => (j === i ? { values: { ...c.values, [key]: v } } : c)));

  /* ---------- the order: add, edit and remove designs ---------- */
  function addDesign(d: Design) {
    setPicker(false);
    setItems(L => [...L, { design: d, draft: [blankCover(d.fields)] }]);
    setActive(items.length); setFresh(items.length); setStep('info'); setErr('');
  }
  const editItem = (i: number) => { setActive(i); setFresh(null); setErr(''); setStep('info'); };
  function removeItem(i: number) {
    if (items.length < 2) return;
    setItems(L => L.filter((_, k) => k !== i));
    setActive(a => Math.max(0, Math.min(a, items.length - 2)));
    setFresh(null);
  }
  function backFromInfo() {
    if (items.length > 1 || orderId) {
      if (items.length > 1 && cur && isBlank(cur)) { const i = active; setItems(L => L.filter((_, k) => k !== i)); setActive(0); }   // a design added by mistake just disappears
      setFresh(null); setStep('basket'); return;
    }
    nav('/services/book-cover');
  }

  /* ---------- save the order (the server prices it) ---------- */
  async function saveOrder(): Promise<boolean> {
    setBusy(true); setErr('');
    try {
      const j = await api('/api/bookcover/save', { order_id: orderId, items: items.map((it, i) => ({ design_id: it.design.id, covers: merged[i].map(c => ({ values: c.values })) })) });
      if (!orderId) clearBasket(me);                       // from now on the saved order is the source, not the browser's basket
      setOrderId(j.id); setStatus(j.status); setTotals({ pages: j.pages, total: j.total });
      setLayout(merged);
      setBusy(false); return true;
    } catch (e: any) { setErr(e?.message || tr('Could not save. Please try again.', 'មិនអាចរក្សាទុកបានទេ។ សូមព្យាយាមម្ដងទៀត។')); setBusy(false); return false; }
  }

  function fromInfo() { if (cur && firstOkOf(cur)) setStep(subj ? 'subjects' : 'basket'); }
  function fromSubjects() { if (cur && extrasOkOf(cur)) setStep('basket'); }
  async function toPay() { if (!allOk || busy) return; if (await saveOrder()) setStep('pay'); }

  /* ---------- phone + location, then KHQR ---------- */
  function useGps() {
    if (!navigator.geolocation) { setErr(tr('This phone cannot share its location.', 'ទូរស័ព្ទនេះមិនអាចចែករំលែកទីតាំងបានទេ។')); return; }
    setGpsBusy(true); setErr('');
    navigator.geolocation.getCurrentPosition(
      p => { setContact(c => ({ ...c, lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) })); setGpsBusy(false); },
      () => { setErr(tr('We could not get your location. You can type it instead.', 'យើងមិនអាចទទួលបានទីតាំងរបស់អ្នកទេ។ អ្នកអាចវាយវាជំនួស។')); setGpsBusy(false); },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }
  const contactCheck = validateContact(contact);
  async function startPay() {
    if (busy || !orderId) return;
    if (!contactCheck.ok) { setErr(contactCheck.error); return; }
    setBusy(true); setErr('');
    try {
      await api('/api/bookcover/contact', { order_id: orderId, ...contact });
      if (method === 'wallet') {
        const r = await supabase.rpc('pay_book_cover_with_wallet', { p_order_id: orderId });
        if (r.error) throw new Error(/pay_book_cover_with_wallet|schema cache/i.test(r.error.message) ? tr('Wallet payment is not available right now.', 'ការទូទាត់ពីកាបូបមិនអាចប្រើបានទេឥឡូវនេះ។') : r.error.message);
        loadBal();
        await afterPaid();
      } else {
        setPayOpen(true);
      }
    } catch (e: any) { setErr(e?.message || tr('Could not start the payment.', 'មិនអាចចាប់ផ្តើមការទូទាត់បានទេ។')); }
    setBusy(false);
  }
  async function afterPaid() {
    setPayOpen(false);
    if (!orderId) return;
    const u = await uid();
    for (let k = 0; k < 4; k++) {
      const r = await supabase.from('book_cover_orders').select('status').eq('id', orderId).eq('user_id', u || '').maybeSingle();
      const s = (r.data as any)?.status;
      if (s && s !== 'pending') {
        setStatus(s); setStep('layout'); setBurst(Date.now());
        clearBasket(me);
        return;
      }
      await new Promise(res => setTimeout(res, 900));
    }
    setErr(tr('We have not received the payment yet. If you paid, wait a few seconds and press Pay again.', 'យើងមិនទាន់ទទួលបានការទូទាត់ទេ។ បើអ្នកបានបង់ហើយ សូមរង់ចាំបន្តិច រួចចុចបង់ម្ដងទៀត។'));
  }

  /* ---------- layout: drag the text, autosave, send to print (pages of every design, one after the other) ---------- */
  const flat = useMemo(() => layout.flatMap((cs, it) => cs.map((_, ci) => ({ it, ci }))), [layout]);
  const here = flat[Math.min(page, Math.max(0, flat.length - 1))] || { it: 0, ci: 0 };
  const curCover = layout[here.it]?.[here.ci];
  const lDesign = items[here.it]?.design;
  const lFields = lDesign?.fields || [];
  const patchCover = (fn: (c: BcCover) => BcCover) => setLayout(L => L.map((cs, a) => (a !== here.it ? cs : cs.map((c, b) => (b === here.ci ? fn(c) : c)))));
  const move = (key: string, x: number, y: number) => {
    if (locked) return;
    patchCover(c => { const f = lFields.find(z => z.key === key); if (!f) return c; const s = spotOf(f, c.pos); return { ...c, pos: { ...c.pos, [key]: { ...c.pos[key], x, y, size: s.size } } }; });
  };
  const setSize = (key: string, size: number) => patchCover(c => { const f = lFields.find(z => z.key === key); if (!f) return c; const s = spotOf(f, c.pos); return { ...c, pos: { ...c.pos, [key]: { ...c.pos[key], x: s.x, y: s.y, size } } }; });
  const setColor = (key: string, color: string) => patchCover(c => { const f = lFields.find(z => z.key === key); if (!f) return c; const s = spotOf(f, c.pos); return { ...c, pos: { ...c.pos, [key]: { x: s.x, y: s.y, size: s.size, color } } }; });
  const resetOne = (key: string) => patchCover(c => { const p = { ...c.pos }; delete p[key]; return { ...c, pos: p }; });
  const resetPage = () => patchCover(c => ({ ...c, pos: {} }));
  // "all pages" means all pages of THIS design: another design has other questions
  const applyAll = () => setLayout(L => L.map((cs, a) => (a !== here.it ? cs : cs.map((c, b) => (b === here.ci ? c : { ...c, pos: JSON.parse(JSON.stringify(cs[here.ci].pos)) })))));
  const layoutBody = () => layout.map(cs => ({ covers: cs.map(c => ({ pos: c.pos })) }));

  const first = useRef(true);
  useEffect(() => {
    if (step !== 'layout' || !orderId || locked) { first.current = true; return; }
    if (first.current) { first.current = false; return; }
    setSaved('saving');
    const t = window.setTimeout(async () => {
      try { await api('/api/bookcover/layout', { order_id: orderId, items: layoutBody() }); setSaved('saved'); } catch { setSaved('error'); }
    }, 900);
    return () => window.clearTimeout(t);
  }, [layout, step, orderId, locked]);   // eslint-disable-line react-hooks/exhaustive-deps

  async function sendToPrint() {
    if (!orderId || busy) return;
    setBusy(true); setErr('');
    try {
      await api('/api/bookcover/layout', { order_id: orderId, items: layoutBody(), submit: true });
      setStatus('submitted'); setSent(true); setSaved('saved'); setBurst(Date.now());
    } catch (e: any) { setErr(e?.message || tr('Could not send. Please try again.', 'មិនអាចផ្ញើបានទេ។ សូមព្យាយាមម្ដងទៀត។')); }
    setBusy(false);
  }

  /* ---------- steps bar ---------- */
  const stepList: { k: Step; en: string; km: string }[] = [
    { k: 'info', en: 'Info', km: 'ព័ត៌មាន' },
    ...(anySubj ? [{ k: 'subjects' as Step, en: 'Subjects', km: 'មុខវិជ្ជា' }] : []),
    { k: 'basket', en: 'Order', km: 'ការបញ្ជាទិញ' },
    { k: 'pay', en: 'Pay', km: 'ទូទាត់' },
    { k: 'layout', en: 'Place text', km: 'រៀបអក្សរ' },
  ];
  const at = stepList.findIndex(s => s.k === step);

  if (loadErr) return (<><main className="shop cvmPage bcPage"><Top title={tr('Book cover', 'គម្របសៀវភៅ')} back /><p className="cvmWarn" role="alert">{loadErr}</p><button type="button" className="cvmGo" onClick={() => nav('/services/book-cover')}>{tr('Back to designs', 'ត្រឡប់ទៅគំរូ')}</button></main><Nav /></>);
  if (!loaded || !cur) return (<><main className="shop cvmPage bcPage"><Top title={tr('Book cover', 'គម្របសៀវភៅ')} back /><p className="cvmHint center">{tr('Loading…', 'កំពុងផ្ទុក…')}</p></main><Nav /></>);

  const perSubjectFields = fields.filter(f => f.per_subject);
  const selField = lFields.find(f => f.key === sel) || null;
  const selSpot = selField && curCover ? spotOf(selField, curCover.pos) : null;
  const walletLow = bal === null || bal + 1e-6 < (totals?.total ?? total);
  const km = isKm();
  const topTitle = tr('Book cover', 'គម្របសៀវភៅ');
  const runningTotal = items.length > 1 && (
    <span className="bcCount" key={items.length}><Layers size={14} /> {items.length} {tr('designs', 'គំរូ')} · {pages} {tr('page(s)', 'ទំព័រ')} · <b>{riel(total)}</b></span>
  );

  return (
    <>
      <main className="shop cvmPage bcPage">
        <Top title={topTitle} back />
        <ol className="cvmSteps" aria-label={tr('Progress', 'ដំណើរការ')}>
          {stepList.map((s, i) => (
            <li key={s.k} className={i < at ? 'done' : i === at ? 'on' : ''}><i>{i < at ? <Check /> : i + 1}</i><span>{tr(s.en, s.km)}</span></li>
          ))}
        </ol>

        <div className="bcStep" key={step}>
        {/* ---------------- 1. info ---------------- */}
        {step === 'info' && (
          <>
            <section className="cvmHero"><h1>{tr('Add your info', 'បញ្ចូលព័ត៌មានរបស់អ្នក')}</h1>
              <p>{tr('Fill in what should be printed on your cover. You can move it later.', 'បំពេញអ្វីដែលត្រូវបោះពុម្ពលើគម្រប។ អ្នកអាចផ្លាស់ទីវាក្រោយ។')}</p>
              {items.length > 1 && <p className="bcWhich">{tr(`Design ${active + 1} of ${items.length}`, `គំរូទី ${active + 1} ក្នុងចំណោម ${items.length}`)}</p>}
              {runningTotal}</section>
            <div className="bcLive"><Scaled><BookCoverSheet design={cur.design} cover={merged[active]?.[0]} /></Scaled></div>
            <div className="cvmForm">
              <fieldset className="cvmSet">
                <legend>{designName(cur.design)}</legend>
                {fields.map(f => (
                  <Field key={f.key} label={labelOf(f, km)} req={f.required}>
                    <input value={cur.draft[0]?.values[f.key] || ''} maxLength={f.max} placeholder={(km && f.hint_km) || f.hint_en} onChange={e => setVal(0, f.key, e.target.value)} />
                  </Field>
                ))}
              </fieldset>
            </div>
            {err && <p className="cvmErr" role="alert">{err}</p>}
            {!firstOkOf(cur) && <p className="cvmHint center">{tr('Fill in the fields marked * to continue.', 'សូមបំពេញចន្លោះដែលមាន * ដើម្បីបន្ត។')}</p>}
            <div className="cvmBar two">
              <button type="button" className="cvmBack" onClick={backFromInfo}><ArrowLeft />{items.length > 1 || orderId ? tr('Order', 'ការបញ្ជាទិញ') : tr('Designs', 'គំរូ')}</button>
              <button type="button" className="cvmGo" disabled={!firstOkOf(cur) || busy} onClick={fromInfo}>{tr('Continue', 'បន្ត')} <ArrowRight /></button>
            </div>
          </>
        )}

        {/* ---------------- 2. other subjects (of this design) ---------------- */}
        {step === 'subjects' && (() => {
          const more = cur.draft.length > 1;
          return (
            <>
              <section className="cvmHero"><h1>{tr('Do you have other subjects?', 'តើអ្នកមានមុខវិជ្ជាផ្សេងទៀតទេ?')}</h1>
                <p>{tr('Each subject gets its own cover page. Your other info is copied, you only type what changes.', 'មុខវិជ្ជានីមួយៗមានទំព័រគម្របផ្ទាល់ខ្លួន។ ព័ត៌មានផ្សេងទៀតនឹងត្រូវចម្លង អ្នកគ្រាន់តែវាយអ្វីដែលប្តូរ។')}</p>
                {items.length > 1 && <p className="bcWhich">{designName(cur.design)}</p>}
                {runningTotal}</section>
              <div className="cvmLangs bcYesNo">
                <button type="button" className={'cvmLang' + (more ? ' on' : '')} aria-pressed={more} onClick={() => editActive(d => (d.length > 1 || pages >= MAX_COVERS ? d : [...d, blankCover(fields)]))}>
                  <b>{tr('Yes', 'មាន')}</b><small>{tr('Add more subjects', 'បន្ថែមមុខវិជ្ជា')}</small>{more && <span className="cvmTick"><Check /></span>}
                </button>
                <button type="button" className={'cvmLang' + (!more ? ' on' : '')} aria-pressed={!more} onClick={() => editActive(d => d.slice(0, 1))}>
                  <b>{tr('No', 'គ្មាន')}</b><small>{tr('Just this one', 'តែមួយនេះប៉ុណ្ណោះ')}</small>{!more && <span className="cvmTick"><Check /></span>}
                </button>
              </div>

              <div className="bcThumbs" aria-label={tr('Your pages', 'ទំព័ររបស់អ្នក')}>
                {(merged[active] || []).map((c, i) => (<figure key={i}><Scaled><BookCoverSheet design={cur.design} cover={c} /></Scaled><figcaption>{i + 1}</figcaption></figure>))}
              </div>

              {more && (
                <div className="cvmForm">
                  {cur.draft.slice(1).map((_, k) => {
                    const i = k + 1;
                    return (
                      <fieldset className="cvmSet" key={i}>
                        <legend>{tr('Subject', 'មុខវិជ្ជា')} {i + 1}</legend>
                        {perSubjectFields.map(f => (
                          <Field key={f.key} label={labelOf(f, km)} req={f.required}>
                            <input value={cur.draft[i]?.values[f.key] || ''} maxLength={f.max} placeholder={(km && f.hint_km) || f.hint_en} onChange={e => setVal(i, f.key, e.target.value)} />
                          </Field>
                        ))}
                        <button type="button" className="cvmLink" onClick={() => editActive(d => d.filter((_, j) => j !== i))}><Trash2 size={14} /> {tr('Remove this subject', 'លុបមុខវិជ្ជានេះ')}</button>
                      </fieldset>
                    );
                  })}
                  {pages < MAX_COVERS && <button type="button" className="cvmAdd" onClick={() => editActive(d => [...d, blankCover(fields)])}><Plus />{tr('Add another subject', 'បន្ថែមមុខវិជ្ជាមួយទៀត')}</button>}
                </div>
              )}

              <button type="button" className="cvmAdd bcAddDesign" disabled={full || busy || !firstOkOf(cur) || !extrasOkOf(cur)} onClick={() => setPicker(true)}><Plus />{tr('Add another design', 'បន្ថែមគំរូមួយទៀត')}</button>
              <p className="bcTotal">{cur.draft.length} {tr('page(s)', 'ទំព័រ')} × {riel(cur.design.price_per_page)} = <b>{riel(orderTotal(cur.draft.length, cur.design.price_per_page))}</b></p>
              {err && <p className="cvmErr" role="alert">{err}</p>}
              {!extrasOkOf(cur) && <p className="cvmHint center">{tr('Fill in the fields marked * for every subject.', 'សូមបំពេញចន្លោះដែលមាន * សម្រាប់មុខវិជ្ជានីមួយៗ។')}</p>}
              <div className="cvmBar two">
                <button type="button" className="cvmBack" onClick={() => setStep('info')}><ArrowLeft />{tr('Back', 'ត្រឡប់')}</button>
                <button type="button" className="cvmGo" disabled={!extrasOkOf(cur) || busy} onClick={fromSubjects}>{tr('Continue', 'បន្ត')} <ArrowRight /></button>
              </div>
            </>
          );
        })()}

        {/* ---------------- 3. your order: one or more designs ---------------- */}
        {step === 'basket' && (
          <>
            <section className="cvmHero"><h1>{tr('Your order', 'ការបញ្ជាទិញរបស់អ្នក')}</h1>
              <p>{tr('Add as many designs as you like. Each design has its own pages, and you pay once for everything.', 'បន្ថែមគំរូប៉ុន្មានក៏បាន។ គំរូនីមួយៗមានទំព័រផ្ទាល់ខ្លួន ហើយអ្នកទូទាត់តែម្តងសម្រាប់ទាំងអស់។')}</p></section>
            <Deck items={items} covers={merged} fresh={fresh} />
            <ul className="bcItems">
              {lines.map(l => {
                const ok = itemOk(l.it);
                return (
                  <li key={(l.it.design.id || 'x') + l.i} className={'bcItem' + (ok ? '' : ' bad')} style={{ ['--i' as any]: l.i }}>
                    <span className="bcItemThumb"><Scaled><BookCoverSheet design={l.it.design} cover={merged[l.i]?.[0]} /></Scaled></span>
                    <span className="bcItemText"><b>{designName(l.it.design)}</b>
                      <small>{ok ? `${l.n} ${tr('page(s)', 'ទំព័រ')} × ${riel(l.price)} = ${riel(l.sub)}` : tr('Needs your info', 'ត្រូវការព័ត៌មានរបស់អ្នក')}</small></span>
                    <button type="button" className="cvmSmall bcEdit" onClick={() => editItem(l.i)}><Pencil size={14} /> {tr('Edit', 'កែប្រែ')}</button>
                    {items.length > 1 && <button type="button" className="cvmRm bcRm" aria-label={tr('Remove', 'ដកចេញ')} onClick={() => removeItem(l.i)}><Trash2 /></button>}
                  </li>
                );
              })}
            </ul>
            <button type="button" className="cvmAdd bcAddDesign" disabled={full || busy} onClick={() => setPicker(true)}><Plus />{tr('Add another design', 'បន្ថែមគំរូមួយទៀត')}</button>
            {full && <p className="cvmHint center">{tr(`You can add up to ${MAX_ITEMS} designs and ${MAX_COVERS} pages in one order.`, `អ្នកអាចបន្ថែមគំរូបានរហូតដល់ ${MAX_ITEMS} និង ${MAX_COVERS} ទំព័រក្នុងការបញ្ជាទិញមួយ។`)}</p>}
            <p className="bcTotal">{items.length} {tr('design(s)', 'គំរូ')} · {pages} {tr('page(s)', 'ទំព័រ')} = <b>{riel(total)}</b></p>
            {err && <p className="cvmErr" role="alert">{err}</p>}
            {!allOk && <p className="cvmHint center">{tr('Finish every design to continue.', 'សូមបំពេញគំរូទាំងអស់ដើម្បីបន្ត។')}</p>}
            <div className="cvmBar two">
              <button type="button" className="cvmBack" onClick={() => setStep(subj ? 'subjects' : 'info')}><ArrowLeft />{tr('Back', 'ត្រឡប់')}</button>
              <button type="button" className="cvmGo" disabled={!allOk || busy || !total} onClick={toPay}>{busy ? tr('Please wait…', 'សូមរង់ចាំ…') : tr('Continue to payment', 'បន្តទៅការទូទាត់')} <ArrowRight /></button>
            </div>
          </>
        )}

        {/* ---------------- 4. pay ---------------- */}
        {step === 'pay' && (
          <>
            <section className="cvmHero"><h1>{tr('Pay for your covers', 'ទូទាត់សម្រាប់គម្ររបស់អ្នក')}</h1></section>
            <div className="cvmSummary">
              <div className="bcSumDeck"><Deck items={items} covers={merged} /></div>
              <dl>
                {lines.map(l => (
                  <div key={(l.it.design.id || 'x') + l.i}><dt>{designName(l.it.design)} · {l.n} × {riel(l.price)}</dt><dd>{riel(l.sub)}</dd></div>
                ))}
                <div><dt>{tr('Pages', 'ទំព័រ')}</dt><dd>{totals?.pages ?? pages}</dd></div>
                <div className="tot"><dt>{tr('Total', 'សរុប')}</dt><dd>{riel(totals?.total ?? total)}</dd></div>
              </dl>
            </div>

            <fieldset className="cvmSet bcContact">
              <legend>{tr('Phone and location', 'លេខទូរស័ព្ទ និងទីតាំង')}</legend>
              <p className="cvmHint">{tr('We use these to reach you and to bring your printed covers. If your account does not have them yet, they are saved to it now.', 'យើងប្រើវាដើម្បីទាក់ទងអ្នក និងនាំយកគម្របដែលបានបោះពុម្ព។ បើគណនីរបស់អ្នកមិនទាន់មាន វានឹងត្រូវរក្សាទុកឥឡូវនេះ។')}</p>
              <Field label={tr('Your name', 'ឈ្មោះរបស់អ្នក')}><input value={contact.name} maxLength={60} autoComplete="name" onChange={e => setContact({ ...contact, name: e.target.value })} /></Field>
              <Field label={tr('Phone number', 'លេខទូរស័ព្ទ')} req><input type="tel" inputMode="tel" value={contact.phone} maxLength={24} autoComplete="tel" placeholder="012 345 678" onChange={e => setContact({ ...contact, phone: e.target.value })} /></Field>
              <Field label={tr('Location (city / province, village, landmark)', 'ទីតាំង (ក្រុង / ខេត្ត ភូមិ ទីសម្គាល់)')} req><textarea rows={2} value={contact.address} maxLength={200} autoComplete="street-address" placeholder={tr('e.g. Phnom Penh, Sen Sok, near the school', 'ឧ. ភ្នំពេញ សែនសុខ ជិតសាលា')} onChange={e => setContact({ ...contact, address: e.target.value })} /></Field>
              <div className="bcGps">
                <button type="button" className="cvmBtn" disabled={gpsBusy} onClick={useGps}><Crosshair />{gpsBusy ? tr('Finding you…', 'កំពុងស្វែងរក…') : tr('Use my current location', 'ប្រើទីតាំងបច្ចុប្បន្នរបស់ខ្ញុំ')}</button>
                {contact.lat != null && contact.lng != null && (
                  <span className="bcPinned"><MapPin size={15} /> {tr('Pinned', 'បានបង្ហោះ')} · <a href={`https://www.google.com/maps?q=${contact.lat},${contact.lng}`} target="_blank" rel="noreferrer">{tr('check on map', 'មើលលើផែនទី')}</a>
                    <button type="button" className="cvmLink" onClick={() => setContact({ ...contact, lat: null, lng: null })} aria-label={tr('Remove', 'លុប')}><X size={14} /></button></span>
                )}
              </div>
              <Field label={tr('Note for us (optional)', 'កំណត់ចំណាំ (ស្រេចចិត្ត)')}><input value={contact.notes} maxLength={200} onChange={e => setContact({ ...contact, notes: e.target.value })} /></Field>
            </fieldset>

            <div className="cvmPayOpts" role="radiogroup" aria-label={tr('Payment method', 'វិធីទូទាត់')}>
              <button type="button" role="radio" aria-checked={method === 'khqr'} className={'cvmPayOpt' + (method === 'khqr' ? ' on' : '')} disabled={bkOn === false} onClick={() => setMethod('khqr')}>
                <span className="cvmPayBadge">KHQR</span><span><b>KHQR</b><small>{tr('Any Bakong banking app · paid in riel', 'កម្មវិធីធនាគារ Bakong ណាមួយ · បង់ជារៀល')}</small></span><i className="cvmRadio" />
              </button>
              <button type="button" role="radio" aria-checked={method === 'wallet'} className={'cvmPayOpt' + (method === 'wallet' ? ' on' : '')} disabled={bal === null || walletLow} onClick={() => setMethod('wallet')}>
                <span className="cvmPayBadge w"><Wallet /></span>
                <span><b>{tr('Wallet', 'កាបូប')}</b><small>{bal === null ? tr('Balance unavailable', 'មិនអាចមើលសមតុល្យបាន') : <>{tr('Riel balance', 'សមតុល្យរៀល')} {riel(bal)}{walletLow && <> · {tr('not enough', 'មិនគ្រប់គ្រាន់')}</>}</>}</small></span><i className="cvmRadio" />
              </button>
              {bkOn === false && <p className="cvmHint">{tr('KHQR is not available right now. You can still pay from your wallet.', 'KHQR មិនអាចប្រើបានទេឥឡូវនេះ។ អ្នកនៅតែអាចទូទាត់ពីកាបូបបាន។')}</p>}
            </div>
            {err && <p className="cvmErr" role="alert">{err}</p>}
            {!contactCheck.ok && (contact.phone || contact.address) && <p className="cvmHint center">{contactCheck.error}</p>}
            <div className="cvmBar two">
              <button type="button" className="cvmBack" onClick={() => { setErr(''); setStep('basket'); }}><ArrowLeft />{tr('Back', 'ត្រឡប់')}</button>
              <button type="button" className="cvmGo pay" disabled={busy || !orderId || !contactCheck.ok || (method === 'khqr' ? bkOn === false || !PayModal : walletLow)} onClick={startPay}>
                {busy ? tr('Please wait…', 'សូមរង់ចាំ…') : <>{method === 'wallet' ? tr('Pay with Wallet', 'ទូទាត់ពីកាបូប') : tr('Pay with KHQR', 'ទូទាត់តាម KHQR')} · {riel(totals?.total ?? total)}</>}
              </button>
            </div>
          </>
        )}

        {/* ---------------- 5. place the text ---------------- */}
        {step === 'layout' && curCover && lDesign && (
          <>
            <div className="cvmEdHead">
              <div>
                <span className="cvmBadgeOk"><Sparkles />{statusTxt(status)}</span>
                <h1>{locked ? tr('Your covers', 'គម្របរបស់អ្នក') : tr('Move the text where you want it', 'ផ្លាស់ទីអក្សរទៅកន្លែងដែលអ្នកចង់បាន')}</h1>
                <p className="cvmSave" data-s={saved}>{locked ? tr('This order is already printed.', 'ការបញ្ជាទិញនេះត្រូវបានបោះពុម្ពរួចហើយ។') : saved === 'saving' ? tr('Saving…', 'កំពុងរក្សាទុក…') : saved === 'saved' ? tr('All changes saved', 'បានរក្សាទុកការកែប្រែទាំងអស់') : saved === 'error' ? tr('Could not save. Check your connection.', 'មិនអាចរក្សាទុកបានទេ។ សូមពិនិត្យអ៊ីនធឺណិត។') : tr('Touch a text and drag it. Then press Send to print.', 'ប៉ះអក្សរ ហើយអូសវា។ បន្ទាប់មកចុច «ផ្ញើទៅបោះពុម្ព»។')}</p>
              </div>
            </div>

            {flat.length > 1 && (
              <div className="bcPills" role="tablist" aria-label={tr('Pages', 'ទំព័រ')}>
                {flat.map((h, i) => {
                  const it = items[h.it], c = layout[h.it]?.[h.ci];
                  const subjectText = (it?.design.fields || []).filter(f => f.per_subject).map(f => c?.values[f.key]).find(Boolean) || '';
                  const label = [String(i + 1), items.length > 1 ? designName(it.design) : '', subjectText].filter(Boolean).join(' · ');
                  return <button type="button" role="tab" aria-selected={h.it === here.it && h.ci === here.ci} key={i} className={h.it === here.it && h.ci === here.ci ? 'on' : ''} onClick={() => { setPage(i); setSel(null); }}>{label}</button>;
                })}
              </div>
            )}

            <div className="bcStage">
              <div className="bcPaper">
                <Scaled className="live">
                  <BookCoverSheet design={lDesign} cover={curCover} selected={sel} onSelect={setSel} onMove={locked ? undefined : move} frame={!locked} />
                </Scaled>
              </div>

              <div className="bcTools">
                {items.length > 1 && <p className="bcWhich">{designName(lDesign)}</p>}
                <div className="bcChips" aria-label={tr('Texts', 'អក្សរ')}>
                  {lFields.filter(f => curCover.values[f.key]).map(f => (
                    <button type="button" key={f.key} className={sel === f.key ? 'on' : ''} onClick={() => setSel(sel === f.key ? null : f.key)}>{curCover.values[f.key]}</button>
                  ))}
                </div>
                {selField && selSpot ? (
                  <div className="bcSel">
                    <b>{labelOf(selField, km)}</b>
                    <label className="bcRange"><span>{tr('Text size', 'ទំហំអក្សរ')} · {Math.round(selSpot.size)}</span>
                      <input type="range" min={10} max={160} value={selSpot.size} disabled={locked} onChange={e => setSize(selField.key, Number(e.target.value))} /></label>
                    <div className="bcColors" role="group" aria-label={tr('Text color', 'ពណ៌អក្សរ')}>
                      <span>{tr('Text color', 'ពណ៌អក្សរ')}</span>
                      <div className="bcSwatches">
                        {TEXT_COLORS.map(c => (
                          <button type="button" key={c} className={'bcSwatch' + (selSpot.color.toLowerCase() === c ? ' on' : '')} style={{ background: c }} aria-label={c} aria-pressed={selSpot.color.toLowerCase() === c} disabled={locked} onClick={() => setColor(selField.key, c)} />
                        ))}
                        <label className="bcSwatch custom" title={tr('Any color', 'ពណ៌ផ្សេងទៀត')}><input type="color" value={/^#[0-9a-f]{6}$/i.test(selSpot.color) ? selSpot.color : '#1b1b1b'} disabled={locked} onChange={e => setColor(selField.key, e.target.value)} /></label>
                      </div>
                    </div>
                    <div className="bcNudge" role="group" aria-label={tr('Fine move', 'ផ្លាស់ទីតិចៗ')}>
                      {([['←', -0.5, 0], ['↑', 0, -0.5], ['↓', 0, 0.5], ['→', 0.5, 0]] as const).map(([t, dx, dy]) => (
                        <button type="button" key={t} disabled={locked} onClick={() => move(selField.key, Math.min(100, Math.max(0, selSpot.x + dx)), Math.min(100, Math.max(0, selSpot.y + dy)))}>{t}</button>
                      ))}
                    </div>
                    <button type="button" className="cvmLink bcReset" disabled={locked} onClick={() => resetOne(selField.key)}><RotateCcw size={14} /> {tr('Put this text back', 'ដាក់អក្សរនេះត្រឡប់វិញ')}</button>
                  </div>
                ) : <p className="cvmHint">{tr('Tap a text to change its size or nudge it.', 'ចុចលើអក្សរដើម្បីប្តូរទំហំ ឬរំកិលវា។')}</p>}
                {!locked && (
                  <div className="bcToolRow">
                    <button type="button" className="cvmBtn" onClick={resetPage}><RotateCcw size={15} />{tr('Reset page', 'កំណត់ទំព័រឡើងវិញ')}</button>
                    {(layout[here.it]?.length || 0) > 1 && <button type="button" className="cvmBtn" onClick={applyAll}>{items.length > 1 ? tr('Use this layout on all pages of this design', 'ប្រើប្លង់នេះលើគ្រប់ទំព័រនៃគំរូនេះ') : tr('Use this layout on all pages', 'ប្រើប្លង់នេះលើគ្រប់ទំព័រ')}</button>}
                  </div>
                )}
              </div>
            </div>

            {sent && <p className="cvmOk bcOk" role="status"><Check /> {tr('Sent! We will print your covers. You can still move the text and press the button again.', 'បានផ្ញើហើយ! យើងនឹងបោះពុម្ពគម្របរបស់អ្នក។ អ្នកនៅតែអាចផ្លាស់ទីអក្សរ ហើយចុចប៊ូតុងម្ដងទៀតបាន។')}</p>}
            {err && <p className="cvmErr" role="alert">{err}</p>}
            <div className="cvmBar two">
              <button type="button" className="cvmBack" onClick={() => nav('/services/book-cover')}><ArrowLeft />{tr('My covers', 'គម្របរបស់ខ្ញុំ')}</button>
              {!locked && <button type="button" className="cvmGo" disabled={busy} onClick={sendToPrint}><Send />{busy ? tr('Sending…', 'កំពុងផ្ញើ…') : status === 'submitted' ? tr('Update and resend', 'ធ្វើបច្ចុប្បន្នភាព និងផ្ញើម្ដងទៀត') : tr('Send to print', 'ផ្ញើទៅបោះពុម្ព')}</button>}
            </div>
            <p className="cvmHint center">{bcNo(orderId || '')}</p>
          </>
        )}
        </div>
        {burst > 0 && <Burst key={burst} />}
        {picker && <Picker taken={new Set(items.map(i => i.design.id))} onPick={addDesign} onClose={() => setPicker(false)} />}
      </main>
      {payOpen && orderId && PayModal && <PayModal bc={{ orderId }} onClose={() => setPayOpen(false)} onPaid={afterPaid} />}
      <Nav />
    </>
  );
}
