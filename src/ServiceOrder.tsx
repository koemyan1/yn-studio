import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Download, ExternalLink, ImagePlus, Minus, Plus, Store, Trash2, Truck, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from './supabase';
import { isKm, tr, useLang } from './lang';
import { MAX_FILES, MAX_MB, FILE_ACCEPT, fileProblem, uploadPrivate } from './serviceFiles';
import { cleanPhone, computeQuote } from '../shared/serviceMath.js';
import type { SvcGroup, SvcOption, SvcPrice } from '../shared/serviceMath.js';
import './serviceShop.css';

/* ---------------------------------------------------------------------------------------------
   Pay-first services (customer side). Setup: docs/setup/SERVICE-SHOP-SETUP.md, SQL: supabase-service-shop.sql
   The form is built from the admin's catalog. The total you see is a PREVIEW computed with the same shared maths
   the server uses; the server recomputes everything from the catalog and ignores any price sent from here.
   --------------------------------------------------------------------------------------------- */

const MapPanel = lazy(() => import('./mapCheckout').then(m => ({ default: m.MapDeliveryPanel })));
const PinMapL = lazy(() => import('./mapCheckout').then(m => ({ default: m.PinMap })));

export const loc = (en: string, km?: string | null) => (isKm() && km ? km : en);
const money = (n: number) => '$' + Number(n || 0).toFixed(2);
export const svcNo = (id: string) => 'SV-' + String(id).replace(/-/g, '').slice(0, 8).toUpperCase();
export const mapsLink = (cfg: any, at?: { lat: number; lng: number } | null) =>
  (cfg?.store_map_url && /^https?:\/\//i.test(cfg.store_map_url) ? cfg.store_map_url : at ? `https://www.google.com/maps/search/?api=1&query=${at.lat},${at.lng}` : '');

export type Cat = { service: { key: string; kind: 'physical' | 'digital'; name_en: string; name_km: string; desc_en: string; desc_km: string }; prices: SvcPrice[]; groups: SvcGroup[] };
export type PayProps = { svc: { orderId: string; first?: any }; onClose: () => void; onPaid: () => void };
export type Api = (path: string, body?: any) => Promise<any>;

const num = (v: any) => Number(v);

/* ============================================ catalog ============================================ */

/** undefined = loading, null = the shop tables are not set up (or unreachable): the page keeps the old request form. */
export function useServiceCatalog(): Record<string, Cat> | null | undefined {
  const [cat, setCat] = useState<Record<string, Cat> | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [s, p, g] = await Promise.all([
          supabase.from('service_catalog').select('*').eq('enabled', true).order('sort_order'),
          supabase.from('service_prices').select('*').eq('enabled', true).order('sort_order'),
          supabase.from('service_option_groups').select('*, service_options(*)').eq('enabled', true).order('sort_order'),
        ]);
        if (s.error || p.error || g.error) throw s.error || p.error || g.error;
        const out: Record<string, Cat> = {};
        for (const row of (s.data as any[]) || []) out[row.key] = { service: row, prices: [], groups: [] };
        for (const r of (p.data as any[]) || []) out[r.service_key]?.prices.push({ ...r, amount: num(r.amount) });
        for (const r of (g.data as any[]) || []) {
          const opts: SvcOption[] = ((r.service_options as any[]) || []).filter(o => o.enabled).sort((a, b) => a.sort_order - b.sort_order).map(o => ({ ...o, price: num(o.price) }));
          out[r.service_key]?.groups.push({ ...r, options: opts });
        }
        if (live) setCat(out);
      } catch {
        if (live) setCat(null);
      }
    })();
    return () => { live = false; };
  }, []);
  return cat;
}

/* ============================================ small bits ============================================ */

const unitText = (u: string) => (u === 'page' ? tr('per page', 'ក្នុងមួយទំព័រ') : u === 'copy' ? tr('per copy', 'ក្នុងមួយច្បាប់') : u === 'item' ? tr('each', 'ក្នុងមួយ') : '');

function optionHint(o: SvcOption) {
  const p = num(o.price);
  if (!(p > 0)) return '';
  if (o.price_type === 'percent') return `+${p}%`;
  if (o.price_type === 'per_unit') return `+${money(p)} ${tr('each', 'ក្នុងមួយ')}`;
  return `+${money(p)}`;
}

function initAnswers(groups: SvcGroup[]) {
  const a: Record<string, any> = {};
  for (const g of groups) {
    if (g.type === 'number') a[g.id] = g.required ? Number(g.min_value ?? 1) : '';
    else if (g.type === 'single') a[g.id] = g.required && g.options?.[0] ? g.options[0].id : '';
    else if (g.type === 'multi') a[g.id] = g.required && g.options?.[0] ? [g.options[0].id] : [];
    else a[g.id] = '';
  }
  return a;
}

/** Drops empty answers so "left blank" means "not answered". */
function cleanAnswers(ans: Record<string, any>) {
  const out: Record<string, string | string[] | number> = {};
  for (const [k, v] of Object.entries(ans)) {
    if (v === '' || v === null || v === undefined) continue;
    if (Array.isArray(v) && !v.length) continue;
    out[k] = v;
  }
  return out;
}

/* ============================================ the order sheet ============================================ */

export type ServiceMeta = { k: string; ink: string; fg?: string; Icon: LucideIcon; en: string; km: string };

export function ServiceOrderSheet({ svc, cat, api, PayModal, onClose, onChanged }: {
  svc: ServiceMeta; cat: Cat; api: Api; PayModal: React.ComponentType<PayProps>; onClose: () => void; onChanged: () => void;
}) {
  useLang();
  const physical = cat.service.kind === 'physical';
  const { prices, groups } = cat;
  const [priceId, setPriceId] = useState(prices[0]?.id || '');
  const [ans, setAns] = useState<Record<string, any>>(() => initAnswers(groups));
  const [files, setFiles] = useState<{ path: string; name: string }[]>([]);
  const [upBusy, setUpBusy] = useState(false);
  const [note, setNote] = useState('');
  const [ful, setFul] = useState<'pickup' | 'delivery'>('pickup');
  const [cfg, setCfg] = useState<any>(null);
  const [pin, setPin] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [deliv, setDeliv] = useState<{ phone: string; address: string } | null>(null);
  const [initialPt, setInitialPt] = useState<{ lat: number; lng: number } | null>(null);
  const [dForm, setDForm] = useState({ name: '', phone: '', city: '', notes: '' });
  const [makeDefault, setMakeDefault] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<{ id: string; sig: string } | null>(null);
  const [paying, setPaying] = useState<{ orderId: string; first?: any } | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !paying) onClose(); };
    window.addEventListener('keydown', esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = prev; };
  }, [onClose, paying]);

  // store + delivery prices (admin Settings) and the customer's saved details
  useEffect(() => {
    if (!physical) return;
    supabase.from('delivery_settings').select('*').eq('id', 1).maybeSingle().then(({ data }: any) => setCfg(data || {}));
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user?.id;
      if (!u) return;
      const r = await supabase.from('profiles').select('name,phone,delivery_address,delivery_lat,delivery_lng').eq('user_id', u).maybeSingle();
      const p: any = r.data;
      if (!p) return;
      setDForm(f => ({ ...f, name: p.name || '', phone: p.phone || '' }));
      if (p.delivery_lat != null && p.delivery_lng != null) setInitialPt({ lat: Number(p.delivery_lat), lng: Number(p.delivery_lng) });
    })();
  }, [physical]);

  const store = cfg && Number.isFinite(num(cfg.store_lat)) && Number.isFinite(num(cfg.store_lng)) ? { lat: num(cfg.store_lat), lng: num(cfg.store_lng) } : null;
  const clean = useMemo(() => cleanAnswers(ans), [ans]);

  const run = (fulfilment?: string, point?: { lat: number; lng: number } | null) => computeQuote({
    service: { key: svc.k, kind: cat.service.kind }, prices, groups, selection: { price_id: priceId, quantity: 1, groups: clean },
    fulfilment, deliveryCfg: cfg, deliveryPoint: point || null,
  });
  const sub = useMemo(() => run(physical ? 'pickup' : undefined), [priceId, clean, cfg]); // eslint-disable-line react-hooks/exhaustive-deps
  const full = useMemo(() => (ful === 'delivery' && physical && pin ? run('delivery', pin) : sub), [sub, ful, pin, cfg]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = sub.ok && (!physical || ful === 'pickup' || (!!pin && !!deliv && full.ok));

  const setAnswer = (id: string, v: any) => { setAns(a => ({ ...a, [id]: v })); setErr(''); };

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setErr('');
    const room = MAX_FILES - files.length;
    if (room <= 0) { setErr(tr(`You can attach up to ${MAX_FILES} files.`, `អ្នកអាចភ្ជាប់ឯកសារបានរហូតដល់ ${MAX_FILES}។`)); return; }
    setUpBusy(true);
    try {
      const { data } = await supabase.auth.getUser();
      const u = data.user?.id;
      if (!u) throw new Error('auth');
      const added: { path: string; name: string }[] = [];
      for (const f of Array.from(list).slice(0, room)) {
        const bad = fileProblem(f);
        if (bad === 'size') { setErr(tr(`"${f.name}" is bigger than ${MAX_MB} MB.`, `"${f.name}" ធំជាង ${MAX_MB} MB។`)); continue; }
        if (bad === 'type') { setErr(tr('Only pictures and PDF files are allowed.', 'អនុញ្ញាតតែរូបភាព និងឯកសារ PDF ប៉ុណ្ណោះ។')); continue; }
        added.push({ path: await uploadPrivate(u, f), name: f.name });
      }
      if (added.length) setFiles(x => [...x, ...added]);
    } catch {
      setErr(tr('Could not upload the file. Please try again.', 'មិនអាចផ្ទុកឡើងឯកសារបានទេ។ សូមព្យាយាមម្ដងទៀត។'));
    } finally { setUpBusy(false); }
  }
  async function dropFile(path: string) {
    setFiles(x => x.filter(f => f.path !== path));
    supabase.storage.from('service-private').remove([path]).catch(() => {});
  }

  async function submit() {
    if (busy) return;
    setErr('');
    if (!sub.ok) { setErr(sub.error); return; }
    if (physical && ful === 'delivery' && (!pin || !deliv)) { setErr(tr('Choose your delivery location on the map first.', 'សូមជ្រើសរើសទីតាំងដឹកជញ្ជូនលើផែនទីជាមុនសិន។')); return; }
    if (!full.ok) { setErr(full.error); return; }
    const body = {
      service: svc.k, price_id: priceId, quantity: 1, groups: clean,
      fulfilment: physical ? ful : undefined,
      delivery: physical && ful === 'delivery' && pin && deliv ? { lat: pin.lat, lng: pin.lng, phone: deliv.phone, address: deliv.address } : undefined,
      note: note.trim(), files: files.map(f => f.path),
    };
    const sig = JSON.stringify(body);
    if (order && order.sig === sig) { setPaying({ orderId: order.id }); return; }   // same form: pay the order we already made
    setBusy(true);
    try {
      const j = await api('/api/service/order', body);
      if (j?.paid) { onChanged(); onClose(); return; }
      setOrder({ id: j.order_id, sig });
      setPaying({ orderId: j.order_id, first: j });
    } catch (e: any) {
      setErr(e?.message || tr('Could not start the payment. Please try again.', 'មិនអាចចាប់ផ្តើមការទូទាត់បានទេ។ សូមព្យាយាមម្ដងទៀត។'));
    } finally { setBusy(false); }
  }

  /* ---------- pieces ---------- */
  const q = sub.ok ? sub.quote : null;
  const fq = full.ok ? full.quote : null;
  const priceNow = prices.find(p => p.id === priceId);

  const renderGroup = (g: SvcGroup) => {
    const label = loc(g.label_en, g.label_km);
    const v = ans[g.id];
    const head = <span className="ssLabel">{label}{!g.required && <em>{tr('optional', 'ស្រេចចិត្ត')}</em>}</span>;
    if (g.type === 'single') return (
      <div className="ssGroup" key={g.id} role="radiogroup" aria-label={label}>
        {head}
        <div className="ssChips">
          {(g.options || []).map(o => (
            <button type="button" key={o.id} role="radio" aria-checked={v === o.id} className={'ssChip' + (v === o.id ? ' on' : '')}
              onClick={() => setAnswer(g.id, v === o.id && !g.required ? '' : o.id)}>
              <span>{loc(o.label_en, o.label_km)}</span>{optionHint(o) && <small>{optionHint(o)}</small>}
            </button>
          ))}
        </div>
      </div>
    );
    if (g.type === 'multi') return (
      <div className="ssGroup" key={g.id} role="group" aria-label={label}>
        {head}
        <div className="ssChips">
          {(g.options || []).map(o => {
            const on = Array.isArray(v) && v.includes(o.id);
            return (
              <button type="button" key={o.id} role="checkbox" aria-checked={on} className={'ssChip' + (on ? ' on' : '')}
                onClick={() => setAnswer(g.id, on ? (v as string[]).filter(x => x !== o.id) : [...(Array.isArray(v) ? v : []), o.id])}>
                <span>{on && <Check />}{loc(o.label_en, o.label_km)}</span>{optionHint(o) && <small>{optionHint(o)}</small>}
              </button>
            );
          })}
        </div>
      </div>
    );
    if (g.type === 'number') {
      const min = Number(g.min_value ?? 1), max = Number(g.max_value ?? 1000);
      const o = g.options?.[0];
      const set = (n: number) => setAnswer(g.id, Math.min(max, Math.max(min, Math.trunc(n))));
      return (
        <div className="ssGroup" key={g.id}>
          {head}
          <div className="ssStep">
            <button type="button" aria-label={tr('Less', 'តិចជាង')} onClick={() => set((Number(v) || min) - 1)} disabled={(Number(v) || 0) <= min && v !== ''}><Minus /></button>
            <input inputMode="numeric" aria-label={label} value={v} placeholder={String(min)}
              onChange={e => { const t = e.target.value.replace(/\D/g, ''); setAnswer(g.id, t === '' ? '' : Number(t)); }}
              onBlur={() => { if (v !== '') set(Number(v)); else if (g.required) set(min); }} />
            <button type="button" aria-label={tr('More', 'ច្រើនជាង')} onClick={() => set((Number(v) || 0) + 1)} disabled={Number(v) >= max}><Plus /></button>
            <small>{min}–{max}{o && optionHint(o) ? ` · ${loc(o.label_en, o.label_km)} ${optionHint(o)}` : ''}</small>
          </div>
        </div>
      );
    }
    return (
      <label className="ssGroup" key={g.id}>
        {head}
        <textarea rows={2} maxLength={1000} value={v} onChange={e => setAnswer(g.id, e.target.value)} />
      </label>
    );
  };

  return (
    <div className="svcScrim" role="presentation" onClick={() => { if (!paying) onClose(); }}>
      <div className="svcSheet ssSheet" role="dialog" aria-modal="true" aria-label={tr(svc.en, svc.km)} style={{ ['--svc' as any]: svc.ink, ['--svc-fg' as any]: svc.fg || '#fff' }} onClick={e => e.stopPropagation()}>
        <button type="button" className="svcClose" onClick={onClose} aria-label={tr('Close', 'បិទ')}><X /></button>
        <header className="svcSheetHead">
          <span className="svcInk sm"><svc.Icon /></span>
          <h3>{loc(cat.service.name_en || svc.en, cat.service.name_km || svc.km)}</h3>
        </header>

        {/* 1. base price */}
        <div className="ssGroup" role="radiogroup" aria-label={tr('Price', 'តម្លៃ')}>
          <span className="ssLabel">{prices.length > 1 ? tr('What do you need?', 'តើអ្នកត្រូវការអ្វី?') : tr('Price', 'តម្លៃ')}</span>
          <div className="ssChips">
            {prices.map(p => (
              <button type="button" key={p.id} role="radio" aria-checked={priceId === p.id} className={'ssChip' + (priceId === p.id ? ' on' : '')} onClick={() => { setPriceId(p.id); setErr(''); }}>
                <span>{loc(p.label_en, p.label_km)}</span><small>{money(p.amount)} {unitText(p.unit)}</small>
              </button>
            ))}
          </div>
        </div>

        {/* 2. the questions the admin set up */}
        {groups.map(renderGroup)}

        {/* 3. files */}
        <div className="ssGroup">
          <span className="ssLabel">{physical ? tr('Your file', 'ឯកសាររបស់អ្នក') : tr('Reference files', 'ឯកសារយោង')}<em>{tr('optional', 'ស្រេចចិត្ត')}</em></span>
          {files.length > 0 && (
            <ul className="ssFiles">
              {files.map(f => <li key={f.path}><span>{f.name}</span><button type="button" onClick={() => dropFile(f.path)} aria-label={tr('Remove file', 'លុបឯកសារ')}><Trash2 /></button></li>)}
            </ul>
          )}
          {files.length < MAX_FILES && (
            <label className="svcFile">
              <ImagePlus />
              <span><b>{upBusy ? tr('Uploading…', 'កំពុងផ្ទុកឡើង…') : tr('Add a file or picture', 'បន្ថែមឯកសារ ឬរូបភាព')}</b><small>{tr(`Photo or PDF, up to ${MAX_MB} MB, ${MAX_FILES} files`, `រូបថត ឬ PDF រហូតដល់ ${MAX_MB} MB ${MAX_FILES} ឯកសារ`)}</small></span>
              <input hidden type="file" multiple accept={FILE_ACCEPT} disabled={upBusy} onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
            </label>
          )}
          {physical && files.length === 0 && <small className="ssHint">{tr('No file? Choose pick up and bring your original.', 'គ្មានឯកសារ? ជ្រើសរើសមកយក ហើយនាំឯកសារដើមមក។')}</small>}
        </div>

        <label className="ssGroup">
          <span className="ssLabel">{tr('Anything else we should know?', 'មានអ្វីផ្សេងទៀតដែលយើងគួរដឹង?')}<em>{tr('optional', 'ស្រេចចិត្ត')}</em></span>
          <textarea rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
        </label>

        {/* 4. pick up or delivery (print + copy only) */}
        {physical && (
          <div className="ssGroup">
            <span className="ssLabel">{tr('How do you want it?', 'តើអ្នកចង់បានដោយរបៀបណា?')}</span>
            <div className="ssTwo" role="radiogroup" aria-label={tr('Pick up or delivery', 'មកយក ឬដឹកជញ្ជូន')}>
              <button type="button" role="radio" aria-checked={ful === 'pickup'} className={'ssBig' + (ful === 'pickup' ? ' on' : '')} onClick={() => { setFul('pickup'); setErr(''); }}><Store /><b>{tr('Pick up', 'មកយក')}</b><small>{tr('Free', 'ឥតគិតថ្លៃ')}</small></button>
              <button type="button" role="radio" aria-checked={ful === 'delivery'} className={'ssBig' + (ful === 'delivery' ? ' on' : '')} onClick={() => { setFul('delivery'); setErr(''); }}><Truck /><b>{tr('Delivery', 'ដឹកជញ្ជូន')}</b><small>{tr('Fee by distance', 'ថ្លៃតាមចម្ងាយ')}</small></button>
            </div>

            {ful === 'pickup' && (
              <div className="ssStore">
                <b>{cfg?.store_name || tr('Our store', 'ហាងរបស់យើង')}</b>
                {cfg?.store_address && <p>{cfg.store_address}</p>}
                {store && <Suspense fallback={<div className="ssMap" style={{ height: 180 }} />}><PinMapL at={store} emoji="🏪" /></Suspense>}
                {mapsLink(cfg, store) && <a className="ssLinkBtn" href={mapsLink(cfg, store)} target="_blank" rel="noreferrer"><ExternalLink />{tr('Open in Maps', 'បើកក្នុងផែនទី')}</a>}
                <small className="ssHint">{tr('We will tell you when it is ready.', 'យើងនឹងប្រាប់អ្នកនៅពេលវារួចរាល់។')}</small>
              </div>
            )}

            {ful === 'delivery' && (
              <Suspense fallback={<div className="mapLazyHold" />}>
                <MapPanel
                  store={store} cfg={cfg} initial={initialPt} form={dForm} setForm={setDForm} makeDefault={makeDefault} setMakeDefault={setMakeDefault}
                  pin={pin} hideTrackNote setMsg={setErr}
                  onConfirm={(p: any, d: any) => {
                    const phone = cleanPhone(d.phone);
                    if (!phone) { setErr(tr('Please enter a valid phone number so we can reach you.', 'សូមបញ្ចូលលេខទូរស័ព្ទត្រឹមត្រូវ ដើម្បីឱ្យយើងទាក់ទងអ្នកបាន។')); return; }
                    setErr(''); setPin(p);
                    setDeliv({ phone, address: [p.label, d.delivery_notes].filter(Boolean).join(' · ').slice(0, 300) });
                  }}
                  onEdit={() => { setPin(null); setDeliv(null); }}
                />
              </Suspense>
            )}
          </div>
        )}

        {/* 5. live price summary */}
        <section className="ssSummary" aria-live="polite" aria-label={tr('Price summary', 'សង្ខេបតម្លៃ')}>
          {q && priceNow ? (
            <dl>
              <div><dt>{loc(priceNow.label_en, priceNow.label_km)}{priceNow.unit !== 'job' && <small> {money(priceNow.amount)} × {q.quantity}</small>}</dt><dd>{money(q.base)}</dd></div>
              {q.choices.flatMap((c: any) => (c.options || []).filter((o: any) => o.amount > 0).map((o: any) => (
                <div key={c.group_id + o.option_id}><dt>{loc(o.label_en, o.label_km)}</dt><dd>+{money(o.amount)}</dd></div>
              )))}
              {physical && ful === 'delivery' && (
                <div><dt>{tr('Delivery', 'ដឹកជញ្ជូន')}{fq && fq.distance_km != null && <small> {fq.distance_km.toFixed(1)} km</small>}</dt><dd>{fq ? money(fq.delivery_fee) : tr('choose location', 'ជ្រើសទីតាំង')}</dd></div>
              )}
              <div className="ssTotal"><dt>{tr('Total', 'សរុប')}</dt><dd>{money(fq ? fq.total : q.total)}</dd></div>
            </dl>
          ) : <p className="ssHint">{sub.ok ? '' : sub.error}</p>}
          <small className="ssHint">{tr('You pay first with Bakong KHQR. Your order starts once the payment arrives.', 'អ្នកបង់ប្រាក់មុនដោយ Bakong KHQR។ ការបញ្ជាទិញចាប់ផ្តើមនៅពេលទទួលបានការទូទាត់។')}</small>
        </section>

        {err && <p className="svcErr" role="alert">{err}</p>}
        <button type="button" className="svcPrimary" disabled={busy || upBusy || !ready} onClick={submit}>
          {busy ? tr('Preparing…', 'កំពុងរៀបចំ…') : `${tr('Pay now', 'បង់ឥឡូវនេះ')}${ready ? ' · ' + money(fq ? fq.total : q ? q.total : 0) : ''}`}
        </button>
      </div>
      {paying && <PayModal svc={paying} onClose={() => { setPaying(null); onChanged(); }} onPaid={() => { setPaying(null); onChanged(); onClose(); }} />}
    </div>
  );
}

/* ============================================ my orders ============================================ */

export type MyOrder = {
  id: string; service_key: string; status: string; payment_status: string; fulfilment: 'pickup' | 'delivery' | 'digital';
  total: number; created_at: string; result_paths: string[]; price_label: string; cancel_reason: string | null; refund_status: string;
};
const ORDER_COLS = 'id,service_key,status,payment_status,fulfilment,total,created_at,result_paths,price_label,cancel_reason,refund_status';
const STALE_MS = 48 * 3600 * 1000;

/** The customer's own paid / waiting / cancelled shop orders (RLS: only their own rows). Empty when the shop SQL is not installed. */
export async function fetchMyOrders(): Promise<MyOrder[]> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return [];
  const r = await supabase.from('service_orders').select(ORDER_COLS).eq('user_id', u.user.id).order('created_at', { ascending: false }).limit(10);
  if (r.error) return [];
  return ((r.data as any[]) || []).map(o => ({ ...o, total: num(o.total), result_paths: o.result_paths || [] }));
}

export const waiting = (o: MyOrder) => o.status === 'awaiting_payment' && Date.now() - new Date(o.created_at).getTime() < STALE_MS;

const STEPS = ['paid', 'in_progress', 'ready', 'done'] as const;
function stepLabel(s: (typeof STEPS)[number], f: MyOrder['fulfilment']) {
  if (s === 'paid') return tr('Paid', 'បានបង់');
  if (s === 'in_progress') return tr('In progress', 'កំពុងធ្វើ');
  if (s === 'done') return tr('Done', 'រួចរាល់');
  return f === 'pickup' ? tr('Ready to pick up', 'រួចរាល់សម្រាប់មកយក') : f === 'delivery' ? tr('Ready for delivery', 'រួចរាល់សម្រាប់ដឹក') : tr('Ready', 'រួចរាល់');
}

export async function openResult(path: string) {
  const r = await supabase.storage.from('service-results').createSignedUrl(path, 120, { download: true });
  if (r.data?.signedUrl) window.open(r.data.signedUrl, '_blank', 'noopener');
}
const fileLabel = (p: string) => (p.split('/').pop() || p).replace(/^[0-9a-f-]{36}-/i, '');

export function ServiceOrderCard({ o, title, onPay }: { o: MyOrder; title: string; onPay: (id: string) => void }) {
  const at = STEPS.indexOf(o.status as any);
  const cancelled = o.status === 'cancelled';
  const files = o.result_paths || [];
  return (
    <li className="ssOrder">
      <div className="ssOrderHead">
        <span className="svcMineText"><b>{title}</b><small>{svcNo(o.id)} · {new Date(o.created_at).toLocaleDateString()} · {money(o.total)}</small></span>
        {o.status === 'awaiting_payment' && <span className={'svcStatus s-new'}>{waiting(o) ? tr('Waiting for payment', 'រង់ចាំការទូទាត់') : tr('Expired', 'ផុតកំណត់')}</span>}
        {cancelled && <span className="svcStatus s-declined">{tr('Cancelled', 'បានលុបចោល')}</span>}
      </div>
      {!cancelled && o.status !== 'awaiting_payment' && (
        <ol className="ssTrack" aria-label={tr('Order progress', 'វឌ្ឍនភាពការបញ្ជាទិញ')}>
          {STEPS.map((s, i) => <li key={s} className={i < at ? 'past' : i === at ? 'now' : ''} aria-current={i === at ? 'step' : undefined}><i>{i <= at && <Check />}</i><span>{stepLabel(s, o.fulfilment)}</span></li>)}
        </ol>
      )}
      {waiting(o) && <button type="button" className="ssPayAgain" onClick={() => onPay(o.id)}>{tr('Pay now', 'បង់ឥឡូវនេះ')}</button>}
      {cancelled && o.cancel_reason && <p className="ssHint">{o.cancel_reason}{o.refund_status === 'refunded' ? ' · ' + tr('Refunded', 'បានសងប្រាក់វិញ') : ''}</p>}
      {!cancelled && o.fulfilment === 'digital' && ['ready', 'done'].includes(o.status) && files.length > 0 && (
        <div className="ssDownloads">
          {files.map(p => <button type="button" key={p} onClick={() => openResult(p)}><Download />{tr('Download', 'ទាញយក')} · {fileLabel(p)}</button>)}
        </div>
      )}
    </li>
  );
}

/** Reloads the list when a status changes (live) and when the app comes back to the foreground. */
export function useOrderLive(reload: () => void) {
  const stable = useCallback(reload, [reload]);
  useEffect(() => {
    let ch: any = null, live = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!live || !data.user) return;
      ch = supabase.channel('my-service-orders').on('postgres_changes', { event: '*', schema: 'public', table: 'service_orders', filter: `user_id=eq.${data.user.id}` }, () => stable()).subscribe();
    })();
    const vis = () => { if (document.visibilityState === 'visible') stable(); };
    document.addEventListener('visibilitychange', vis);
    return () => { live = false; document.removeEventListener('visibilitychange', vis); if (ch) supabase.removeChannel(ch); };
  }, [stable]);
}
