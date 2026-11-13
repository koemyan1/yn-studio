import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, BookOpen, Download, Eye, EyeOff, FileDown, ImagePlus, MapPin, Pencil, Phone, Plus, Printer, Save, Trash2, X } from 'lucide-react';
import { supabase } from './supabase';
import { BookCoverSheet, Scaled, downloadOrderPdf, downloadOrderPngs, ensureBcFonts, labelOf, printOrder } from './bookCoverSheet';
import { DEFAULT_PRICE_PER_PAGE, FONTS, KHMER_FONTS, MAX_FIELDS, ORDER_STATUSES, bcNo, cleanFields, cleanPricePerPage, defaultSpot, itemsPages, orderItems } from '../shared/bookCoverMath.js';
import type { BcCover, BcField, BcItem } from '../shared/bookCoverMath.js';
import './bookCover.css';

/* ---------------------------------------------------------------------------------------------
   Admin -> Book covers
     Designs: upload the blank cover, say what the customer must fill in, drag each text to where it should start.
     Orders:  every paid order with the customer's phone + location; download the finished covers as a PDF / pictures or print them.
              One order can hold several designs: every design is shown with its own pages and all of them are printed in one go.
   SQL: supabase-book-covers.sql
   --------------------------------------------------------------------------------------------- */

type Shell = React.ComponentType<{ title: string; children: React.ReactNode }>;
type DesignRow = { id: string; name_en: string; name_km: string; image_url: string; price_per_page: number; enabled: boolean; sort_order: number; fields: BcField[]; created_at: string };
type Draft = { id?: string; name_en: string; name_km: string; image_url: string; price_per_page: string; enabled: boolean; fields: BcField[]; file: File | null; previewUrl: string };
type OrderRow = {
  id: string; user_id: string; design_name: string; items: BcItem[]; pages: number; price_per_page: number; total: number;
  status: string; contact_name: string; phone: string; address: string; notes: string; lat: number | null; lng: number | null; paid_at: string | null; submitted_at: string | null; created_at: string;
};

const BUCKET = 'book-covers';
const riel = (n: number) => Math.round(Number(n) || 0).toLocaleString('en-US') + ' ៛';
const when = (s?: string | null) => (s ? new Date(s).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const errText = (e: any) => String(e?.message || e || 'Something went wrong.');

const PRESETS: { id: string; en: string; km: string; per?: boolean; size: number; bold?: boolean; required?: boolean }[] = [
  { id: 'subject', en: 'Subject', km: 'មុខវិជ្ជា', per: true, size: 58, bold: true },
  { id: 'name', en: 'Student name', km: 'ឈ្មោះសិស្ស', size: 40 },
  { id: 'class', en: 'Class', km: 'ថ្នាក់', size: 34 },
  { id: 'school', en: 'School', km: 'សាលា', size: 34 },
  { id: 'teacher', en: 'Teacher', km: 'គ្រូបង្រៀន', size: 30, required: false },
  { id: 'year', en: 'School year', km: 'ឆ្នាំសិក្សា', size: 30, required: false },
  { id: 'text', en: 'Other text', km: '', size: 34, required: false },
];

/** A phone photo / big scan becomes a print-sized JPEG (at most A4 at 300 dpi). */
async function prepareCoverImage(file: File): Promise<File> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 2480 / bmp.width, 3508 / bmp.height);
  if (k === 1 && file.type === 'image/jpeg' && file.size < 6_000_000) return file;
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const g = c.getContext('2d'); if (!g) return file;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.92));
  return blob ? new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
}

const newKey = (taken: Set<string>, base: string) => {
  let k = '';
  do { k = (base.replace(/[^a-z0-9]/g, '').slice(0, 10) || 'text') + Math.random().toString(36).slice(2, 6); } while (taken.has(k));
  return k;
};
const blankDraft = (): Draft => ({ name_en: '', name_km: '', image_url: '', price_per_page: String(DEFAULT_PRICE_PER_PAGE), enabled: true, fields: [], file: null, previewUrl: '' });

export function AdminBookCovers({ Shell }: { Shell: Shell }) {
  const [tab, setTab] = useState<'designs' | 'orders'>('orders');
  const [designs, setDesigns] = useState<DesignRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [edit, setEdit] = useState<Draft | null>(null);
  const [showUnpaid, setShowUnpaid] = useState(false);

  useEffect(() => { ensureBcFonts(); }, []);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('book_cover_designs').select('*').order('sort_order').order('created_at'),
      supabase.from('book_cover_orders').select('*').order('created_at', { ascending: false }).limit(150),
    ]);
    if (a.error || b.error) setMsg(errText((a.error || b.error)) + ' — did you run supabase-book-covers.sql?');
    else setMsg('');
    setDesigns(((a.data as any[]) || []).map(d => ({ ...d, fields: cleanFields(d.fields) })));
    setOrders(((b.data as any[]) || []).map(o => ({ ...o, items: orderItems(o) })));   // reads the new `items` and orders made with a single design
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {   // new paid orders appear by themselves
    const ch = supabase.channel('admin-book-covers').on('postgres_changes', { event: '*', schema: 'public', table: 'book_cover_orders' }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const waiting = orders.filter(o => o.status === 'submitted').length;

  /* ---------- designs ---------- */
  async function toggle(d: DesignRow) {
    const r = await supabase.from('book_cover_designs').update({ enabled: !d.enabled }).eq('id', d.id);
    if (r.error) { setMsg(errText(r.error)); return; }
    load();
  }
  async function move(d: DesignRow, dir: -1 | 1) {
    const i = designs.findIndex(x => x.id === d.id), o = designs[i + dir]; if (!o) return;
    const r = await Promise.all([
      supabase.from('book_cover_designs').update({ sort_order: i + dir }).eq('id', d.id),
      supabase.from('book_cover_designs').update({ sort_order: i }).eq('id', o.id),
    ]);
    if (r[0].error || r[1].error) { setMsg(errText(r[0].error || r[1].error)); return; }
    // keep every row's order number tidy
    await Promise.all(designs.map((x, j) => (x.id === d.id || x.id === o.id ? null : supabase.from('book_cover_designs').update({ sort_order: j }).eq('id', x.id))));
    load();
  }
  async function remove(d: DesignRow) {
    if (!confirm(`Delete the design “${d.name_en}”? Orders already placed keep their own copy and can still be printed.`)) return;
    const r = await supabase.from('book_cover_designs').delete().eq('id', d.id);
    if (r.error) { setMsg(errText(r.error)); return; }
    load();
  }
  function openEdit(d?: DesignRow) {
    setMsg('');
    setEdit(d ? { id: d.id, name_en: d.name_en, name_km: d.name_km, image_url: d.image_url, price_per_page: String(d.price_per_page), enabled: d.enabled, fields: d.fields, file: null, previewUrl: '' } : blankDraft());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- orders ---------- */
  async function setStatus(o: OrderRow, status: string) {
    const r = await supabase.from('book_cover_orders').update({ status }).eq('id', o.id);
    if (r.error) { setMsg(errText(r.error)); return; }
    load();
  }

  const shown = orders.filter(o => (showUnpaid ? true : o.status !== 'pending' && o.status !== 'cancelled'));

  return (
    <Shell title="Book covers">
      <div className="bcaTabs" role="tablist">
        <button role="tab" aria-selected={tab === 'orders'} className={tab === 'orders' ? 'on' : ''} onClick={() => setTab('orders')}><Printer size={16} />Orders{waiting > 0 && <em>{waiting} to print</em>}</button>
        <button role="tab" aria-selected={tab === 'designs'} className={tab === 'designs' ? 'on' : ''} onClick={() => setTab('designs')}><BookOpen size={16} />Designs</button>
      </div>
      {msg && <p className="notice">{msg}</p>}
      {loading && <p className="muted">Loading…</p>}

      {/* ===================== DESIGNS ===================== */}
      {tab === 'designs' && !loading && (edit
        ? <DesignEditor draft={edit} onChange={setEdit} count={designs.length} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} onError={setMsg} />
        : (
          <>
            <div className="bcaHead">
              <p className="muted" style={{ margin: 0 }}>Upload a blank cover, choose what customers must fill in, and place where each text starts. Customers can still move their text.</p>
              <button onClick={() => openEdit()}><Plus />Add design</button>
            </div>
            <div className="bcaGrid">
              {designs.map((d, i) => (
                <article key={d.id} className={'bcaDesign' + (d.enabled ? '' : ' off')}>
                  <Scaled><BookCoverSheet design={{ image: d.image_url, fields: d.fields }} sample /></Scaled>
                  <div><b>{d.name_en}</b><small>{riel(d.price_per_page)} / page · {d.fields.length} question{d.fields.length === 1 ? '' : 's'} · {d.enabled ? 'On the Services page' : 'Hidden'}</small></div>
                  <div className="bcaRow">
                    <button className="secondary" onClick={() => openEdit(d)}><Pencil size={14} />Edit</button>
                    <button className="secondary" onClick={() => toggle(d)}>{d.enabled ? <><EyeOff size={14} />Hide</> : <><Eye size={14} />Show</>}</button>
                    <button className="secondary" disabled={i === 0} onClick={() => move(d, -1)} aria-label="Move up"><ArrowUp size={14} /></button>
                    <button className="secondary" disabled={i === designs.length - 1} onClick={() => move(d, 1)} aria-label="Move down"><ArrowDown size={14} /></button>
                    <button className="icon danger" onClick={() => remove(d)} aria-label="Delete"><Trash2 size={15} /></button>
                  </div>
                </article>
              ))}
            </div>
            {!designs.length && <p className="muted">No designs yet. Press “Add design”.</p>}
          </>
        ))}

      {/* ===================== ORDERS ===================== */}
      {tab === 'orders' && !loading && (
        <>
          <div className="bcaHead">
            <p className="muted" style={{ margin: 0 }}>Paid orders appear here by themselves. “Sent to print” means the customer finished placing their text.</p>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: 0 }}><input type="checkbox" style={{ width: 'auto' }} checked={showUnpaid} onChange={e => setShowUnpaid(e.target.checked)} />Show unpaid / cancelled</label>
          </div>
          <div className="bcaOrders">
            {shown.map(o => <OrderCard key={o.id} o={o} onStatus={setStatus} onError={setMsg} />)}
            {!shown.length && <p className="muted">No book cover orders yet.</p>}
          </div>
        </>
      )}
    </Shell>
  );
}

/* ================================================== ONE ORDER ================================================== */
function OrderCard({ o, onStatus, onError }: { o: OrderRow; onStatus: (o: OrderRow, s: string) => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState('');
  const who = o.contact_name || 'Customer';
  const file = `${bcNo(o.id)} - ${who}`;
  const exp = useMemo(() => ({ id: o.id, items: o.items.map(it => ({ design_id: it.design_id, design_image: it.design_image, design_fields: it.design_fields, covers: it.covers })) }), [o]);
  const run = (label: string, fn: (p: (n: number, t: number) => void) => Promise<void>) => async () => {
    if (busy) return;
    setBusy(label + '…'); onError('');
    try { await fn((n, t) => setBusy(`${label} ${Math.min(n + 1, t)}/${t}…`)); }
    catch (e) { onError('Could not prepare the covers: ' + errText(e)); }
    setBusy('');
  };
  const subjectOf = (it: BcItem, c: BcCover) => it.design_fields.filter(f => f.per_subject).map(f => c.values[f.key]).find(Boolean) || '';
  const pageCount = itemsPages(o.items) || o.pages;
  const printable = o.status !== 'pending' && o.status !== 'cancelled';

  return (
    <article className="bcaOrder">
      <header>
        <div className="bcaWho">
          <b>{bcNo(o.id)} · {o.design_name || 'Book cover'} <span className={'bcaBadge ' + o.status}>{o.status}</span>{o.items.length > 1 && <span className="bcaBadge multi">{o.items.length} designs</span>}</b>
          <span>{who}{o.phone && <> · <a href={'tel:' + o.phone.replace(/\s+/g, '')}><Phone size={13} style={{ verticalAlign: '-2px' }} /> {o.phone}</a></>}</span>
          {o.address && <span><MapPin size={13} style={{ verticalAlign: '-2px' }} /> {o.address}{o.lat != null && o.lng != null && <> · <a href={`https://www.google.com/maps?q=${o.lat},${o.lng}`} target="_blank" rel="noreferrer">open map</a></>}</span>}
          {o.notes && <small>Note: {o.notes}</small>}
          <small>Ordered {when(o.created_at)}{o.paid_at ? ` · paid ${when(o.paid_at)}` : ''}{o.submitted_at ? ` · sent to print ${when(o.submitted_at)}` : ''}</small>
          {o.status === 'paid' && <small>The customer has paid and is still placing their text. You can already download it.</small>}
        </div>
        <div style={{ textAlign: 'right' }}><b>{riel(o.total)}</b>
          <small style={{ display: 'block' }}>{pageCount} page{pageCount === 1 ? '' : 's'}</small>
          {o.items.map((it, k) => <small key={k} style={{ display: 'block' }}>{it.design_name || 'Design ' + (k + 1)} · {it.covers.length} × {riel(it.price_per_page)}</small>)}</div>
      </header>

      {o.items.map((it, k) => (
        <div key={k} className="bcaGroup">
          {o.items.length > 1 && <small className="bcaGroupName">{k + 1}. {it.design_name || 'Design ' + (k + 1)} · {it.covers.length} page{it.covers.length === 1 ? '' : 's'}</small>}
          <div className="bcaThumbs">
            {it.covers.map((c, i) => (<figure key={i}><Scaled><BookCoverSheet design={{ id: it.design_id, image: it.design_image, fields: it.design_fields }} cover={c} /></Scaled><figcaption>{i + 1}{subjectOf(it, c) ? ' · ' + subjectOf(it, c) : ''}</figcaption></figure>))}
          </div>
        </div>
      ))}

      <div className="bcaFoot">
        <button disabled={!printable || !!busy} onClick={run('PDF', p => downloadOrderPdf(exp, file, p))}><FileDown size={16} />Download PDF</button>
        <button className="secondary" disabled={!printable || !!busy} onClick={run('Print', p => printOrder(exp, p))}><Printer size={16} />Print</button>
        <button className="secondary" disabled={!printable || !!busy} onClick={run('Pictures', p => downloadOrderPngs(exp, file, p))}><Download size={16} />Pictures</button>
        {busy && <small>{busy}</small>}
        <span className="grow" />
        {(o.status === 'paid' || o.status === 'submitted') && <button className="secondary" onClick={() => onStatus(o, 'printed')}>Mark printed</button>}
        {o.status === 'printed' && <button className="secondary" onClick={() => onStatus(o, 'delivered')}>Mark delivered</button>}
        <select value={o.status} onChange={e => onStatus(o, e.target.value)} aria-label="Status">
          {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
    </article>
  );
}

/* ================================================== DESIGN EDITOR ================================================== */
function DesignEditor({ draft, onChange, count, onClose, onSaved, onError }: { draft: Draft; onChange: (d: Draft | null) => void; count: number; onClose: () => void; onSaved: () => void; onError: (m: string) => void }) {
  const [sel, setSel] = useState<string | null>(draft.fields[0]?.key || null);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Draft>) => onChange({ ...draft, ...p });
  const img = draft.previewUrl || draft.image_url;
  useEffect(() => () => { if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl); }, [draft.previewUrl]);

  const setField = (key: string, p: Partial<BcField>) => set({ fields: draft.fields.map(f => (f.key === key ? { ...f, ...p } : f)) });
  function addField(pr: typeof PRESETS[number]) {
    if (draft.fields.length >= MAX_FIELDS) { onError(`A design can have up to ${MAX_FIELDS} questions.`); return; }
    const key = newKey(new Set(draft.fields.map(f => f.key)), pr.id);
    const spot = defaultSpot(draft.fields.length);
    const f: BcField = { key, label_en: pr.en, label_km: pr.km, hint_en: '', hint_km: '', required: pr.required !== false, per_subject: !!pr.per, x: spot.x, y: spot.y, size: pr.size, color: '#1b1b1b', font: 'Poppins', font_km: 'Noto Sans Khmer', bold: !!pr.bold, max: pr.id === 'school' ? 70 : 50 };
    set({ fields: [...draft.fields, f] }); setSel(key);
  }
  const removeField = (key: string) => { set({ fields: draft.fields.filter(f => f.key !== key) }); if (sel === key) setSel(null); };
  const moveField = (key: string, dir: -1 | 1) => {
    const i = draft.fields.findIndex(f => f.key === key), j = i + dir; if (j < 0 || j >= draft.fields.length) return;
    const a = [...draft.fields]; [a[i], a[j]] = [a[j], a[i]]; set({ fields: a });
  };
  const num = (v: string, d: number) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

  async function pickImage(f: File | null) {
    if (!f) return;
    if (!f.type.startsWith('image/')) { onError('Choose a picture file (JPG, PNG or WebP).'); return; }
    try { const p = await prepareCoverImage(f); set({ file: p, previewUrl: URL.createObjectURL(p) }); onError(''); }
    catch { onError('That picture could not be read.'); }
  }

  async function save() {
    if (busy) return;
    const name = draft.name_en.trim();
    if (!name) { onError('Give the design a name.'); return; }
    if (!draft.file && !draft.image_url) { onError('Upload the blank cover picture first.'); return; }
    const fields = cleanFields(draft.fields);
    if (!fields.length) { onError('Add at least one question for the customer to fill in.'); return; }
    setBusy(true); onError('');
    let uploaded = '';
    try {
      let image_url = draft.image_url;
      if (draft.file) {
        const path = `${crypto.randomUUID()}.jpg`;
        const up = await supabase.storage.from(BUCKET).upload(path, draft.file, { upsert: false, cacheControl: '31536000', contentType: 'image/jpeg' });
        if (up.error) throw up.error;
        uploaded = path;
        image_url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      }
      const row = { name_en: name.slice(0, 60), name_km: draft.name_km.trim().slice(0, 60), image_url, price_per_page: cleanPricePerPage(draft.price_per_page), fields, enabled: draft.enabled };
      const r = draft.id
        ? await supabase.from('book_cover_designs').update(row).eq('id', draft.id)
        : await supabase.from('book_cover_designs').insert({ ...row, sort_order: count });
      if (r.error) throw r.error;
      // the old picture is kept on purpose: orders already placed still print from it
      onSaved();
    } catch (e) {
      if (uploaded) supabase.storage.from(BUCKET).remove([uploaded]).catch(() => {});
      onError(errText(e) + (/book_cover_designs|bucket/i.test(errText(e)) ? ' — did you run supabase-book-covers.sql?' : ''));
    }
    setBusy(false);
  }

  return (
    <section className="bcaEdit">
      <div className="bcaPreview">
        {img
          ? <div className="bcPaper"><Scaled className="live"><BookCoverSheet design={{ image: img, fields: draft.fields }} sample selected={sel} onSelect={setSel} frame
              onMove={(key, x, y) => setField(key, { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 })} /></Scaled></div>
          : <label className="bcaDrop"><ImagePlus /><b>Upload the blank cover</b><small>A4 portrait picture, JPG / PNG / WebP (about 2480 × 3508 px is perfect)</small>
              <input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { pickImage(e.target.files?.[0] || null); e.target.value = ''; }} /></label>}
        <small className="muted">Drag a text on the cover to choose where it starts. The customer can still move it. Texts shown here are just examples (the question names).</small>
      </div>

      <div className="bcaForm">
        <div className="bcaHead" style={{ margin: 0 }}>
          <h2 style={{ margin: 0 }}>{draft.id ? 'Edit design' : 'New design'}</h2>
          <button className="secondary" onClick={onClose}><X size={16} />Cancel</button>
        </div>
        <div className="panel" style={{ display: 'grid', gap: 12, margin: 0 }}>
          <div className="two">
            <label>Name (English)<input value={draft.name_en} maxLength={60} onChange={e => set({ name_en: e.target.value })} placeholder="e.g. Blue notebook" /></label>
            <label>Name (Khmer, optional)<input value={draft.name_km} maxLength={60} onChange={e => set({ name_km: e.target.value })} /></label>
          </div>
          <div className="two">
            <label>Price per page (riel)<input type="number" min={100} step={50} value={draft.price_per_page} onChange={e => set({ price_per_page: e.target.value })} /></label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', alignSelf: 'end', paddingBottom: 14 }}><input type="checkbox" style={{ width: 'auto' }} checked={draft.enabled} onChange={e => set({ enabled: e.target.checked })} />Show on the Services page</label>
          </div>
          {img && <label className="bcaDrop" style={{ padding: 10 }}><span>Replace the cover picture</span>
            <input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { pickImage(e.target.files?.[0] || null); e.target.value = ''; }} /></label>}
        </div>

        <div className="panel" style={{ display: 'grid', gap: 12, margin: 0 }}>
          <div>
            <b>What should the customer fill in?</b>
            <p className="muted" style={{ margin: '4px 0 0' }}>Tick “Changes for each subject” on the question that is different on every page (usually the subject). Customers who have more subjects only type those again; everything else is copied.</p>
          </div>
          <div className="bcaPresets">{PRESETS.map(p => <button key={p.id} type="button" onClick={() => addField(p)}><Plus size={14} />{p.en}</button>)}</div>
          {draft.fields.map((f, i) => (
            <div key={f.key} className={'bcaField' + (sel === f.key ? ' sel' : '')} onClick={() => setSel(f.key)}>
              <header>
                <b>{i + 1}. {labelOf(f, false)}</b>
                <span className="bcaRow">
                  <button type="button" className="secondary" disabled={i === 0} onClick={e => { e.stopPropagation(); moveField(f.key, -1); }} aria-label="Move up"><ArrowUp size={14} /></button>
                  <button type="button" className="secondary" disabled={i === draft.fields.length - 1} onClick={e => { e.stopPropagation(); moveField(f.key, 1); }} aria-label="Move down"><ArrowDown size={14} /></button>
                  <button type="button" className="icon danger" onClick={e => { e.stopPropagation(); removeField(f.key); }} aria-label="Remove"><Trash2 size={15} /></button>
                </span>
              </header>
              <div className="two">
                <label>Question (English)<input value={f.label_en} maxLength={40} onChange={e => setField(f.key, { label_en: e.target.value })} /></label>
                <label>Question (Khmer)<input value={f.label_km} maxLength={40} onChange={e => setField(f.key, { label_km: e.target.value })} /></label>
              </div>
              <div className="two">
                <label>Hint (English, optional)<input value={f.hint_en} maxLength={60} onChange={e => setField(f.key, { hint_en: e.target.value })} placeholder="e.g. Sok Dara" /></label>
                <label>Hint (Khmer, optional)<input value={f.hint_km} maxLength={60} onChange={e => setField(f.key, { hint_km: e.target.value })} /></label>
              </div>
              <div className="bcaChecks">
                <label><input type="checkbox" checked={f.required} onChange={e => setField(f.key, { required: e.target.checked })} />Required</label>
                <label><input type="checkbox" checked={f.per_subject} onChange={e => setField(f.key, { per_subject: e.target.checked })} />Changes for each subject</label>
                <label><input type="checkbox" checked={f.bold} onChange={e => setField(f.key, { bold: e.target.checked })} />Bold</label>
              </div>
              <div className="bcaFieldGrid">
                <label>Font<select value={f.font} onChange={e => setField(f.key, { font: e.target.value })}>{FONTS.map(x => <option key={x}>{x}</option>)}</select></label>
                <label>Khmer font<select value={f.font_km} onChange={e => setField(f.key, { font_km: e.target.value })} style={{ fontFamily: `'${f.font_km}', 'Noto Sans Khmer', sans-serif` }}>{KHMER_FONTS.map(x => <option key={x} style={{ fontFamily: `'${x}', 'Noto Sans Khmer', sans-serif` }}>{x}</option>)}</select></label>
                <label>Size<input type="number" min={10} max={160} value={f.size} onChange={e => setField(f.key, { size: num(e.target.value, f.size) })} /></label>
                <label>Colour<input type="color" value={f.color} onChange={e => setField(f.key, { color: e.target.value })} style={{ padding: 4, height: 46 }} /></label>
                <label>Max letters<input type="number" min={1} max={120} value={f.max} onChange={e => setField(f.key, { max: num(e.target.value, f.max) })} /></label>
                <label>Left → right (%)<input type="number" min={0} max={100} step={0.5} value={f.x} onChange={e => setField(f.key, { x: num(e.target.value, f.x) })} /></label>
                <label>Top → bottom (%)<input type="number" min={0} max={100} step={0.5} value={f.y} onChange={e => setField(f.key, { y: num(e.target.value, f.y) })} /></label>
              </div>
            </div>
          ))}
          {!draft.fields.length && <p className="muted">Add the questions above (for example Subject, Student name, Class, School).</p>}
        </div>

        <div className="actions">
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button disabled={busy} onClick={save}><Save size={16} />{busy ? 'Saving…' : draft.id ? 'Save design' : 'Add design'}</button>
        </div>
      </div>
    </section>
  );
}

export default AdminBookCovers;
