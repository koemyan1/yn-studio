import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, ExternalLink, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from './supabase';
import './serviceShop.css';

/* ---------------------------------------------------------------------------------------------
   Admin -> Service prices + Service orders (pay-first services). SQL: supabase-service-shop.sql
   The admin area is English only (like the rest of the admin pages); the customer text fields have English + Khmer boxes.
   Every write here goes through RLS (profiles.role = 'admin'); totals and payment fields cannot be written from a browser at all.
   --------------------------------------------------------------------------------------------- */

type Shell = React.ComponentType<{ title: string; children: React.ReactNode }>;
const PinMapL = lazy(() => import('./mapCheckout').then(m => ({ default: m.PinMap })));
const money = (n: any) => '$' + Number(n || 0).toFixed(2);
const svcNo = (id: string) => 'SV-' + String(id).replace(/-/g, '').slice(0, 8).toUpperCase();
const KEYS = ['print', 'copy', 'social', 'poster', 'logo'];
const UNITS = ['page', 'copy', 'item', 'job'];
const GTYPES: [string, string][] = [['single', 'Single choice'], ['multi', 'Multiple choice'], ['number', 'Number / quantity'], ['text', 'Text']];
const PTYPES: [string, string][] = [['fixed', 'Fixed amount ($, once)'], ['per_unit', 'Per unit ($ x quantity)'], ['percent', 'Percent of base price (%)']];
const errText = (e: any) => String(e?.message || e || 'Something went wrong.');

function useFlash() {
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  useEffect(() => { if (!msg?.ok) return; const t = window.setTimeout(() => setMsg(null), 3500); return () => window.clearTimeout(t); }, [msg]);
  const node = msg ? <p className={msg.ok ? 'saOk' : 'saErr'} role={msg.ok ? 'status' : 'alert'}>{msg.t}</p> : null;
  return { flash: (ok: boolean, t: string) => setMsg({ ok, t }), node };
}

/** Moves one row up or down and rewrites sort_order for the whole list (10, 20, 30...). */
async function reorder(table: string, list: any[], i: number, dir: -1 | 1) {
  const j = i + dir;
  if (j < 0 || j >= list.length) return null;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  const jobs = next.map((r, k) => ((k + 1) * 10 !== r.sort_order ? supabase.from(table).update({ sort_order: (k + 1) * 10 }).eq(table === 'service_catalog' ? 'key' : 'id', table === 'service_catalog' ? r.key : r.id) : null)).filter(Boolean) as any[];
  const res = await Promise.all(jobs);
  return res.find(r => r.error)?.error || null;
}

/* ============================================ SERVICE PRICES ============================================ */

type Svc = any;

export function AdminServicePrices({ Shell }: { Shell: Shell }) {
  const [svcs, setSvcs] = useState<Svc[]>([]);
  const [prices, setPrices] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [opts, setOpts] = useState<any[]>([]);
  const [key, setKey] = useState('print');
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState('');
  const { flash, node } = useFlash();

  const load = useCallback(async () => {
    const [a, b, c, d] = await Promise.all([
      supabase.from('service_catalog').select('*').order('sort_order'),
      supabase.from('service_prices').select('*').order('sort_order'),
      supabase.from('service_option_groups').select('*').order('sort_order'),
      supabase.from('service_options').select('*').order('sort_order'),
    ]);
    const bad = a.error || b.error || c.error || d.error;
    if (bad) { setFatal('Could not load the catalog. Did you run supabase-service-shop.sql in Supabase? (' + errText(bad) + ')'); setLoading(false); return; }
    setSvcs((a.data as any[]) || []); setPrices((b.data as any[]) || []); setGroups((c.data as any[]) || []); setOpts((d.data as any[]) || []);
    setFatal(''); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const svc = svcs.find(s => s.key === key);
  const myPrices = prices.filter(p => p.service_key === key);
  const myGroups = groups.filter(g => g.service_key === key);
  const optsOf = (gid: string) => opts.filter(o => o.group_id === gid);

  async function run(p: PromiseLike<any>, okText: string) {
    const r = await p;
    if (r?.error) { flash(false, errText(r.error)); return false; }
    flash(true, okText); await load(); return true;
  }
  const confirmDel = (what: string) => window.confirm(`Delete ${what}? This cannot be undone. Orders already placed keep their saved prices.`);

  async function addPrice() {
    await run(supabase.from('service_prices').insert({ service_key: key, label_en: 'New price', label_km: '', amount: 1, unit: svc?.kind === 'physical' ? 'page' : 'job', enabled: false, sort_order: (myPrices.length + 1) * 10 }), 'Price added (switched off). Edit it, then switch it on.');
  }
  async function addGroup() {
    await run(supabase.from('service_option_groups').insert({ service_key: key, label_en: 'New question', label_km: '', type: 'single', required: false, enabled: false, sort_order: (myGroups.length + 1) * 10 }), 'Question added (switched off). Add its options, then switch it on.');
  }
  async function addOption(gid: string) {
    await run(supabase.from('service_options').insert({ group_id: gid, label_en: 'New option', label_km: '', price_type: 'fixed', price: 0, enabled: true, sort_order: (optsOf(gid).length + 1) * 10 }), 'Option added.');
  }

  const customerPreview = useMemo(() => svc ? (
    <div className="saPreview" aria-label="Customer form preview">
      <b>Preview: what the customer sees</b>
      <div className="ssGroup"><span className="ssLabel">{myPrices.filter(p => p.enabled).length > 1 ? 'What do you need?' : 'Price'}</span>
        <div className="ssChips">{myPrices.filter(p => p.enabled).map((p, i) => <span key={p.id} className={'ssChip' + (i === 0 ? ' on' : '')}><span>{p.label_en}</span><small>{money(p.amount)} {p.unit === 'job' ? '' : 'per ' + p.unit}</small></span>)}</div></div>
      {myGroups.filter(g => g.enabled).map(g => (
        <div className="ssGroup" key={g.id}>
          <span className="ssLabel">{g.label_en}{!g.required && <em> optional</em>}</span>
          {g.type === 'text' && <textarea rows={2} disabled placeholder="Customer types here" />}
          {g.type === 'number' && <div className="ssStep"><input disabled value={g.min_value} readOnly /><small>{g.min_value}–{g.max_value}{g.is_quantity ? ' · multiplies the price' : ''}{optsOf(g.id).filter(o => o.enabled)[0] ? ` · ${optsOf(g.id).filter(o => o.enabled)[0].label_en} ${money(optsOf(g.id).filter(o => o.enabled)[0].price)}` : ''}</small></div>}
          {(g.type === 'single' || g.type === 'multi') && <div className="ssChips">{optsOf(g.id).filter(o => o.enabled).map(o => <span key={o.id} className="ssChip"><span>{o.label_en}</span>{Number(o.price) > 0 && <small>{o.price_type === 'percent' ? `+${o.price}%` : o.price_type === 'per_unit' ? `+${money(o.price)} each` : `+${money(o.price)}`}</small>}</span>)}</div>}
        </div>
      ))}
      {svc.kind === 'physical' ? <p className="ssHint">Customers also choose pick up or delivery (store details and delivery fee come from Settings).</p> : <p className="ssHint">Digital service: no pick-up or delivery. Customers download the finished files in the app.</p>}
    </div>
  ) : null, [svc, myPrices, myGroups, opts]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Shell title="Service prices">
      <div className="saPage">
        {node}
        {fatal && <p className="saErr">{fatal}</p>}
        {loading && <p className="muted">Loading…</p>}
        {!loading && !fatal && (
          <>
            <p className="saNote">Services start switched OFF with example prices. Set your real prices, then switch each service on. While a service is off (or has no price, or Bakong is not set up), customers still see the old "Request this" form. The pick-up store location is set in <Link to="/admin/settings">Settings → delivery</Link>.</p>
            <div className="saTabs" role="tablist" aria-label="Service">
              {KEYS.filter(k => svcs.some(s => s.key === k)).map(k => { const s = svcs.find(x => x.key === k); return <button key={k} role="tab" aria-selected={k === key} className={k === key ? 'on' : ''} onClick={() => setKey(k)}>{s?.name_en}{s?.enabled ? '' : ' (off)'}</button>; })}
            </div>
            {svc && (
              <div className="saTwoCol">
                <div className="saPage">
                  <ServiceCard svc={svc} order={svcs} onSave={(patch: any) => run(supabase.from('service_catalog').update(patch).eq('key', svc.key), 'Saved.')} onMove={async (d: -1 | 1) => { const e = await reorder('service_catalog', svcs, svcs.findIndex(s => s.key === svc.key), d); if (e) flash(false, errText(e)); else load(); }} />

                  <section className="saCard">
                    <h3>Prices</h3>
                    <p className="ssHint">A service can have several base prices (for example "Colour, per page"). The customer picks one. A "page / copy / item" price is multiplied by the quantity; a "job" price is charged once.</p>
                    {myPrices.map((p, i) => <PriceRow key={p.id + p.label_en + p.amount + p.enabled} p={p} i={i} n={myPrices.length}
                      onSave={(patch: any) => run(supabase.from('service_prices').update(patch).eq('id', p.id), 'Price saved.')}
                      onMove={async (d: -1 | 1) => { const e = await reorder('service_prices', myPrices, i, d); if (e) flash(false, errText(e)); else load(); }}
                      onDelete={() => confirmDel(`the price "${p.label_en}"`) && run(supabase.from('service_prices').delete().eq('id', p.id), 'Price deleted.')} />)}
                    <div className="saBtns"><button className="pri" onClick={addPrice}><Plus size={16} /> Add a price</button></div>
                  </section>

                  <section className="saCard">
                    <h3>Questions and extras</h3>
                    <p className="ssHint">Each question becomes a field in the customer form. Options can add a fixed amount, an amount per unit, or a percent of the base price. A "Number / quantity" question marked "multiplies the price" (pages, copies) multiplies everything.</p>
                    {myGroups.map((g, i) => (
                      <div className="saItem" key={g.id + g.label_en + g.type + g.enabled + g.required}>
                        <GroupRow g={g} i={i} n={myGroups.length}
                          onSave={(patch: any) => run(supabase.from('service_option_groups').update(patch).eq('id', g.id), 'Question saved.')}
                          onMove={async (d: -1 | 1) => { const e = await reorder('service_option_groups', myGroups, i, d); if (e) flash(false, errText(e)); else load(); }}
                          onDelete={() => confirmDel(`the question "${g.label_en}" and all its options`) && run(supabase.from('service_option_groups').delete().eq('id', g.id), 'Question deleted.')} />
                        {g.type !== 'text' && (
                          <div className="saPage">
                            {optsOf(g.id).map((o, j) => <OptionRow key={o.id + o.label_en + o.price + o.price_type + o.enabled} o={o} j={j} n={optsOf(g.id).length}
                              onSave={(patch: any) => run(supabase.from('service_options').update(patch).eq('id', o.id), 'Option saved.')}
                              onMove={async (d: -1 | 1) => { const e = await reorder('service_options', optsOf(g.id), j, d); if (e) flash(false, errText(e)); else load(); }}
                              onDelete={() => confirmDel(`the option "${o.label_en}"`) && run(supabase.from('service_options').delete().eq('id', o.id), 'Option deleted.')} />)}
                            {!(g.type === 'number' && optsOf(g.id).length >= 1) && <div className="saBtns"><button onClick={() => addOption(g.id)}><Plus size={16} /> Add an option</button></div>}
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="saBtns"><button className="pri" onClick={addGroup}><Plus size={16} /> Add a question</button></div>
                  </section>
                </div>
                <div className="saPage">{customerPreview}</div>
              </div>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label>{label}{children}</label>; }
const numberOr = (v: string, d: number) => (v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
function MoveBtns({ i, n, onMove }: { i: number; n: number; onMove: (d: -1 | 1) => void }) {
  return <><button type="button" onClick={() => onMove(-1)} disabled={i === 0} aria-label="Move up"><ChevronUp size={16} /></button><button type="button" onClick={() => onMove(1)} disabled={i >= n - 1} aria-label="Move down"><ChevronDown size={16} /></button></>;
}

function ServiceCard({ svc, order, onSave, onMove }: any) {
  const [d, setD] = useState({ name_en: svc.name_en, name_km: svc.name_km, desc_en: svc.desc_en, desc_km: svc.desc_km, enabled: svc.enabled });
  const i = order.findIndex((s: any) => s.key === svc.key);
  return (
    <section className="saCard">
      <h3>{svc.name_en} <small className="muted">({svc.kind === 'physical' ? 'pick up or delivery' : 'digital, files in the app'})</small></h3>
      <label className="saBtns"><input type="checkbox" checked={d.enabled} onChange={e => setD({ ...d, enabled: e.target.checked })} /> <b>Switched on</b> <span className="ssHint">customers can order and pay for this service</span></label>
      <div className="saRow">
        <Field label="Name (English)"><input value={d.name_en} maxLength={80} onChange={e => setD({ ...d, name_en: e.target.value })} /></Field>
        <Field label="Name (Khmer)"><input value={d.name_km} maxLength={80} onChange={e => setD({ ...d, name_km: e.target.value })} /></Field>
      </div>
      <div className="saRow">
        <Field label="Description (English)"><textarea rows={2} value={d.desc_en} maxLength={300} onChange={e => setD({ ...d, desc_en: e.target.value })} /></Field>
        <Field label="Description (Khmer)"><textarea rows={2} value={d.desc_km} maxLength={300} onChange={e => setD({ ...d, desc_km: e.target.value })} /></Field>
      </div>
      <div className="saBtns"><button className="pri" onClick={() => onSave({ ...d, name_en: d.name_en.trim() || svc.name_en, updated_at: new Date().toISOString() })}>Save service</button><MoveBtns i={i} n={order.length} onMove={onMove} /><span className="ssHint">order in the list</span></div>
    </section>
  );
}

function PriceRow({ p, i, n, onSave, onMove, onDelete }: any) {
  const [d, setD] = useState({ label_en: p.label_en, label_km: p.label_km, amount: String(p.amount), unit: p.unit, enabled: p.enabled });
  const bad = !d.label_en.trim() || !(Number(d.amount) >= 0 && Number(d.amount) <= 10000);
  return (
    <div className={'saItem' + (d.enabled ? '' : ' off')}>
      <div className="saRow">
        <Field label="Label (English)"><input value={d.label_en} maxLength={120} onChange={e => setD({ ...d, label_en: e.target.value })} /></Field>
        <Field label="Label (Khmer)"><input value={d.label_km} maxLength={120} onChange={e => setD({ ...d, label_km: e.target.value })} /></Field>
        <Field label="Amount ($)"><input type="number" min={0} max={10000} step="0.01" inputMode="decimal" value={d.amount} onChange={e => setD({ ...d, amount: e.target.value })} /></Field>
        <Field label="Unit"><select value={d.unit} onChange={e => setD({ ...d, unit: e.target.value })}>{UNITS.map(u => <option key={u}>{u}</option>)}</select></Field>
      </div>
      <div className="saBtns">
        <label><input type="checkbox" checked={d.enabled} onChange={e => setD({ ...d, enabled: e.target.checked })} /> On</label>
        <button className="pri" disabled={bad} onClick={() => onSave({ ...d, amount: numberOr(d.amount, 0) })}>Save</button>
        <MoveBtns i={i} n={n} onMove={onMove} />
        <button className="danger" onClick={onDelete} aria-label="Delete price"><Trash2 size={16} /></button>
      </div>
    </div>
  );
}

function GroupRow({ g, i, n, onSave, onMove, onDelete }: any) {
  const [d, setD] = useState({ label_en: g.label_en, label_km: g.label_km, type: g.type, required: g.required, is_quantity: g.is_quantity, min_value: String(g.min_value), max_value: String(g.max_value), enabled: g.enabled });
  const isNum = d.type === 'number';
  const bad = !d.label_en.trim() || (isNum && (!(numberOr(d.min_value, 1) <= numberOr(d.max_value, 1000)) || numberOr(d.max_value, 1000) > 1000)) || (d.is_quantity && (!isNum || !d.required || numberOr(d.min_value, 1) < 1));
  return (
    <div className="saPage">
      <div className="saRow">
        <Field label="Question (English)"><input value={d.label_en} maxLength={120} onChange={e => setD({ ...d, label_en: e.target.value })} /></Field>
        <Field label="Question (Khmer)"><input value={d.label_km} maxLength={120} onChange={e => setD({ ...d, label_km: e.target.value })} /></Field>
        <Field label="Type"><select value={d.type} onChange={e => setD({ ...d, type: e.target.value, is_quantity: e.target.value === 'number' ? d.is_quantity : false })}>{GTYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        {isNum && <Field label="Min"><input type="number" min={0} max={1000} value={d.min_value} onChange={e => setD({ ...d, min_value: e.target.value })} /></Field>}
        {isNum && <Field label="Max (up to 1000)"><input type="number" min={1} max={1000} value={d.max_value} onChange={e => setD({ ...d, max_value: e.target.value })} /></Field>}
      </div>
      <div className="saBtns">
        <label><input type="checkbox" checked={d.enabled} onChange={e => setD({ ...d, enabled: e.target.checked })} /> On</label>
        <label><input type="checkbox" checked={d.required} onChange={e => setD({ ...d, required: e.target.checked })} /> Required</label>
        {isNum && <label><input type="checkbox" checked={d.is_quantity} onChange={e => setD({ ...d, is_quantity: e.target.checked, required: e.target.checked ? true : d.required, min_value: e.target.checked && numberOr(d.min_value, 1) < 1 ? '1' : d.min_value })} /> Multiplies the price (pages, copies)</label>}
        <button className="pri" disabled={bad} onClick={() => onSave({ label_en: d.label_en.trim(), label_km: d.label_km, type: d.type, required: d.required, is_quantity: isNum && d.is_quantity, min_value: numberOr(d.min_value, 1), max_value: numberOr(d.max_value, 1000), enabled: d.enabled })}>Save question</button>
        <MoveBtns i={i} n={n} onMove={onMove} />
        <button className="danger" onClick={onDelete} aria-label="Delete question"><Trash2 size={16} /></button>
      </div>
    </div>
  );
}

function OptionRow({ o, j, n, onSave, onMove, onDelete }: any) {
  const [d, setD] = useState({ label_en: o.label_en, label_km: o.label_km, price_type: o.price_type, price: String(o.price), enabled: o.enabled });
  const bad = !d.label_en.trim() || !(Number(d.price) >= 0 && Number(d.price) <= 10000);
  return (
    <div className={'saItem' + (d.enabled ? '' : ' off')}>
      <div className="saRow">
        <Field label="Option (English)"><input value={d.label_en} maxLength={120} onChange={e => setD({ ...d, label_en: e.target.value })} /></Field>
        <Field label="Option (Khmer)"><input value={d.label_km} maxLength={120} onChange={e => setD({ ...d, label_km: e.target.value })} /></Field>
        <Field label="Price type"><select value={d.price_type} onChange={e => setD({ ...d, price_type: e.target.value })}>{PTYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label={d.price_type === 'percent' ? 'Percent (%)' : 'Amount ($)'}><input type="number" min={0} max={10000} step="0.01" inputMode="decimal" value={d.price} onChange={e => setD({ ...d, price: e.target.value })} /></Field>
      </div>
      <div className="saBtns">
        <label><input type="checkbox" checked={d.enabled} onChange={e => setD({ ...d, enabled: e.target.checked })} /> On</label>
        <button className="pri" disabled={bad} onClick={() => onSave({ ...d, price: numberOr(d.price, 0) })}>Save option</button>
        <MoveBtns i={j} n={n} onMove={onMove} />
        <button className="danger" onClick={onDelete} aria-label="Delete option"><Trash2 size={16} /></button>
      </div>
    </div>
  );
}

/* ============================================ SERVICE ORDERS ============================================ */

const STATUSES = ['awaiting_payment', 'paid', 'in_progress', 'ready', 'done', 'cancelled'];
const NEXT: Record<string, string[]> = { paid: ['in_progress'], in_progress: ['ready', 'paid'], ready: ['done', 'in_progress'], done: ['ready'] };
const nice = (s: string) => s.replace('_', ' ');
const RESULT_TYPES = '.png,.jpg,.jpeg,.webp,.gif,.svg,.pdf,.zip,.eps,.ai';
const fileLabel = (p: string) => (p.split('/').pop() || p).replace(/^[0-9a-f-]{36}-/i, '');
const mapsHref = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
const COLS = 'id,user_id,service_key,price_label,choices,unit_price,quantity,subtotal,delivery_fee,total,currency,status,fulfilment,delivery_lat,delivery_lng,delivery_km,delivery_address,delivery_phone,customer_note,file_paths,result_paths,payment_status,payment_method,paid_at,admin_note,cancel_reason,refund_status,refund_note,created_at,updated_at';

export function AdminServiceOrders({ Shell }: { Shell: Shell }) {
  const [rows, setRows] = useState<any[]>([]);
  const [people, setPeople] = useState<Record<string, any>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [fService, setFService] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState('');

  const load = useCallback(async () => {
    const [a, c] = await Promise.all([
      supabase.from('service_orders').select(COLS).order('created_at', { ascending: false }).limit(300),
      supabase.from('service_catalog').select('key,name_en'),
    ]);
    if (a.error) { setFatal('Could not load orders. Did you run supabase-service-shop.sql? (' + errText(a.error) + ')'); setLoading(false); return; }
    const list = (a.data as any[]) || [];
    setRows(list); setFatal('');
    setNames(Object.fromEntries(((c.data as any[]) || []).map(s => [s.key, s.name_en])));
    const ids = Array.from(new Set(list.map(x => x.user_id)));
    if (ids.length) {
      const p = await supabase.from('profiles').select('user_id,name,email,phone').in('user_id', ids);
      setPeople(Object.fromEntries(((p.data as any[]) || []).map(x => [x.user_id, x])));
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); const t = window.setInterval(load, 30000); return () => window.clearInterval(t); }, [load]);

  const shown = rows.filter(r => (!fService || r.service_key === fService) && (!fStatus || r.status === fStatus));
  const open = rows.find(r => r.id === openId);

  return (
    <Shell title="Service orders">
      <div className="saPage">
        {fatal && <p className="saErr">{fatal}</p>}
        <div className="saFilters">
          <select value={fService} onChange={e => setFService(e.target.value)} aria-label="Filter by service"><option value="">All services</option>{KEYS.map(k => <option key={k} value={k}>{names[k] || k}</option>)}</select>
          <select value={fStatus} onChange={e => setFStatus(e.target.value)} aria-label="Filter by status"><option value="">All statuses</option>{STATUSES.map(s => <option key={s} value={s}>{nice(s)}</option>)}</select>
          <button className="saBtns" onClick={load} style={{ minHeight: 44, padding: '0 14px', borderRadius: 12, border: '1.5px solid var(--line,#e9e2f4)', background: 'var(--card,#fff)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}><RefreshCw size={15} /> Refresh</button>
          <Link to="/admin/service-prices" className="muted" style={{ alignSelf: 'center' }}>Edit prices</Link>
        </div>
        {loading && <p className="muted">Loading…</p>}
        {!loading && !shown.length && !fatal && <p className="muted">No orders match.</p>}
        <div className="saTwoCol">
          <ul className="saList">
            {shown.map(r => (
              <li key={r.id}>
                <button className="saOrderBtn" onClick={() => setOpenId(r.id)} aria-current={r.id === openId}>
                  <span><b>{svcNo(r.id)}</b> · {names[r.service_key] || r.service_key}<br /><small className="muted">{people[r.user_id]?.name || people[r.user_id]?.email || 'Customer'} · {new Date(r.created_at).toLocaleString()} · {r.fulfilment}</small></span>
                  <span style={{ textAlign: 'right' }}><b>{money(r.total)}</b><br /><small className="muted">{nice(r.status)}</small></span>
                </button>
              </li>
            ))}
          </ul>
          {open && <OrderDetail key={open.id} o={open} person={people[open.user_id]} name={names[open.service_key] || open.service_key} onChanged={load} onClose={() => setOpenId(null)} />}
        </div>
      </div>
    </Shell>
  );
}

function OrderDetail({ o, person, name, onChanged, onClose }: { o: any; person: any; name: string; onChanged: () => void; onClose: () => void }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [refundNote, setRefundNote] = useState('');
  const [adminNote, setAdminNote] = useState(o.admin_note || '');
  const { flash, node } = useFlash();
  const paid = o.payment_status === 'paid';

  useEffect(() => {
    let live = true;
    (async () => {
      const out: Record<string, string> = {};
      for (const p of o.file_paths || []) { const r = await supabase.storage.from('service-private').createSignedUrl(p, 600); if (r.data?.signedUrl) out[p] = r.data.signedUrl; }
      for (const p of o.result_paths || []) { const r = await supabase.storage.from('service-results').createSignedUrl(p, 600); if (r.data?.signedUrl) out[p] = r.data.signedUrl; }
      if (live) setUrls(out);
    })();
    return () => { live = false; };
  }, [o.id, (o.file_paths || []).join(), (o.result_paths || []).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  async function update(patch: any, okText: string) {
    setBusy(true);
    const r = await supabase.from('service_orders').update(patch).eq('id', o.id);
    setBusy(false);
    if (r.error) { flash(false, errText(r.error)); return false; }
    flash(true, okText); onChanged(); return true;
  }
  async function uploadResults(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    try {
      const added: string[] = [];
      for (const f of Array.from(list)) {
        if (f.size > 50 * 1024 * 1024) { flash(false, `"${f.name}" is bigger than 50 MB.`); continue; }
        const path = `${o.id}/${crypto.randomUUID()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100)}`;
        const up = await supabase.storage.from('service-results').upload(path, f, { upsert: false, contentType: f.type || undefined });
        if (up.error) { flash(false, errText(up.error)); continue; }
        added.push(path);
      }
      if (added.length) await update({ result_paths: [...(o.result_paths || []), ...added] }, 'Files uploaded. Move the order to "ready" to tell the customer.');
    } finally { setBusy(false); }
  }
  async function removeResult(p: string) {
    if (!window.confirm(`Remove "${fileLabel(p)}" from this order? The customer will no longer be able to download it.`)) return;
    if (await update({ result_paths: (o.result_paths || []).filter((x: string) => x !== p) }, 'File removed.')) supabase.storage.from('service-results').remove([p]).catch(() => {});
  }
  async function cancel() {
    if (!reason.trim()) { flash(false, 'Write a reason first. The customer will see it.'); return; }
    if (!window.confirm(`Cancel ${svcNo(o.id)}? The customer is notified.${paid ? ' They have already paid: you must refund them yourself (see below).' : ''}`)) return;
    await update({ status: 'cancelled', cancel_reason: reason.trim() }, 'Order cancelled.');
  }
  async function markRefunded() {
    if (!refundNote.trim()) { flash(false, 'Write how you sent the money back (for example "ABA transfer 12 Jan").'); return; }
    if (!window.confirm(`Mark ${svcNo(o.id)} as refunded?\n\nThis does NOT send any money. Only confirm if you already sent ${money(o.total)} back to the customer yourself.`)) return;
    await update({ refund_status: 'refunded', refund_note: refundNote.trim() }, 'Marked as refunded.');
  }

  const hasPin = o.delivery_lat != null && o.delivery_lng != null;
  const choices: any[] = Array.isArray(o.choices) ? o.choices : [];
  return (
    <section className="saCard" aria-label={'Order ' + svcNo(o.id)}>
      <div className="saBtns" style={{ justifyContent: 'space-between' }}><h3>{svcNo(o.id)} · {name}</h3><button onClick={onClose}>Close</button></div>
      {node}
      <p><b>{person?.name || 'Customer'}</b> · {person?.email || ''} {person?.phone ? '· ' + person.phone : ''}<br /><small className="muted">Ordered {new Date(o.created_at).toLocaleString()}</small></p>
      <p><b>Status: {nice(o.status)}</b> · {paid ? <>Paid <b>{money(o.total)}</b> with {o.payment_method || 'Bakong KHQR'}{o.paid_at ? ' on ' + new Date(o.paid_at).toLocaleString() : ''}</> : <>Not paid. Amount due {money(o.total)}</>}{o.refund_status === 'refunded' && <> · <b>Refunded</b>{o.refund_note ? ` (${o.refund_note})` : ''}</>}</p>
      {o.status === 'cancelled' && o.cancel_reason && <p className="saNote">Cancelled: {o.cancel_reason}</p>}

      <div className="saItem">
        <b>{o.price_label}</b> <span className="muted">{money(o.unit_price)} × {o.quantity} = {money(o.subtotal)}{Number(o.delivery_fee) > 0 ? ` + delivery ${money(o.delivery_fee)}` : ''}</span>
        {choices.map((c, i) => (
          <div key={i}>{c.group_en}: {c.type === 'text' ? <i>“{c.text}”</i> : c.type === 'number' ? <b>{c.number}</b> : (c.options || []).map((x: any) => x.label_en).join(', ')}{Number(c.amount) > 0 ? <span className="muted"> (+{money(c.amount)})</span> : null}</div>
        ))}
        {o.customer_note && <div><b>Note:</b> {o.customer_note}</div>}
      </div>

      <div className="saItem">
        <b>{o.fulfilment === 'pickup' ? 'Customer will pick up' : o.fulfilment === 'delivery' ? 'Deliver to customer' : 'Digital: files delivered in the app'}</b>
        {o.fulfilment === 'delivery' && <>
          <div>{o.delivery_address}</div>
          <div>Phone: <a href={'tel:' + o.delivery_phone}>{o.delivery_phone}</a>{o.delivery_km != null ? ` · ${Number(o.delivery_km).toFixed(1)} km` : ''}</div>
          {hasPin && <Suspense fallback={<div className="ssMap" style={{ height: 180 }} />}><PinMapL at={{ lat: Number(o.delivery_lat), lng: Number(o.delivery_lng) }} /></Suspense>}
          {hasPin && <a className="ssLinkBtn" href={mapsHref(Number(o.delivery_lat), Number(o.delivery_lng))} target="_blank" rel="noreferrer"><ExternalLink /> Open in Maps</a>}
        </>}
        {o.fulfilment === 'pickup' && <small className="muted">Store location: <Link to="/admin/settings">Settings → delivery</Link></small>}
      </div>

      <div className="saItem">
        <b>Customer files</b>
        {(o.file_paths || []).length === 0 && <small className="muted">No files attached.{o.fulfilment === 'pickup' ? ' They may bring the original.' : ''}</small>}
        {(o.file_paths || []).map((p: string) => <div key={p}>{urls[p] ? <a href={urls[p]} target="_blank" rel="noreferrer">{fileLabel(p)}</a> : fileLabel(p)}</div>)}
      </div>

      {paid && o.status !== 'cancelled' && (
        <div className="saItem">
          <b>Finished files{o.fulfilment === 'digital' ? ' (required before "ready")' : ' (optional)'}</b>
          {(o.result_paths || []).map((p: string) => <div key={p} className="saBtns">{urls[p] ? <a href={urls[p]} target="_blank" rel="noreferrer">{fileLabel(p)}</a> : fileLabel(p)}<button className="danger" onClick={() => removeResult(p)} aria-label="Remove file"><Trash2 size={14} /></button></div>)}
          <label className="saBtns"><input type="file" multiple accept={RESULT_TYPES} disabled={busy} onChange={e => { uploadResults(e.target.files); e.target.value = ''; }} /></label>
          <small className="muted">Up to 50 MB each. Only this paying customer can download them.</small>
        </div>
      )}

      {paid && o.status !== 'cancelled' && (NEXT[o.status] || []).length > 0 && (
        <div className="saBtns">
          {(NEXT[o.status] || []).map(s => <button key={s} className={s === 'in_progress' || s === 'ready' || s === 'done' ? 'pri' : ''} disabled={busy} onClick={() => update({ status: s }, `Moved to ${nice(s)}. The customer is notified.`)}>Mark {nice(s)}</button>)}
        </div>
      )}

      <label className="saItem">Private note (customers never see this)
        <textarea rows={2} value={adminNote} maxLength={1000} onChange={e => setAdminNote(e.target.value)} />
        <span className="saBtns"><button disabled={busy || adminNote === (o.admin_note || '')} onClick={() => update({ admin_note: adminNote.trim() || null }, 'Note saved.')}>Save note</button></span>
      </label>

      {o.status !== 'cancelled' && (
        <div className="saItem">
          <b>Cancel this order</b>
          <input value={reason} maxLength={300} onChange={e => setReason(e.target.value)} placeholder="Reason (the customer will see it)" />
          <div className="saBtns"><button className="danger" disabled={busy} onClick={cancel}>Cancel order</button></div>
        </div>
      )}
      {o.status === 'cancelled' && paid && o.refund_status !== 'refunded' && (
        <div className="saItem">
          <b>Refund</b>
          <p className="saNote">This app does not move money. Send the refund yourself (ABA, Wing, Bakong...), then record it here.</p>
          <input value={refundNote} maxLength={300} onChange={e => setRefundNote(e.target.value)} placeholder="How and when you refunded" />
          <div className="saBtns"><button disabled={busy} onClick={markRefunded}>I refunded {money(o.total)}: record it</button></div>
        </div>
      )}
    </section>
  );
}
