import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dices, ImagePlus, Palette, Save, Search, Shuffle, Sparkles, Trash2, Undo2, X } from 'lucide-react';
import { supabase } from './supabase';
import { uploadThemeImage } from './AdminSecretCode';
import {
  MOTIONS, allMascots, mascotsForProduct, motionFor, normalizeProductMascots, randomPool,
  type PMMotion, type ProductMascotCfg,
} from './productMascotsCore';

type Shell = React.ComponentType<{ title: string; children: React.ReactNode }>;
type Prod = { id: string; name: string; main_image_url: string | null; status?: string };

/**
 * Admin → Product Mascots
 * Choose how many mascots you want, press the dice, and every product gets one picked at random.
 * New products are included automatically (the pick only depends on the product id and the "shuffle" number).
 * Saved into the chosen theme's JSON (site_themes.config.productMascots) – no SQL needed.
 */
export default function AdminProductMascots({ Shell }: { Shell: Shell }) {
  const [themes, setThemes] = useState<any[]>([]);
  const [themeId, setThemeId] = useState('');
  const [pm, setPm] = useState<ProductMascotCfg>(() => normalizeProductMascots(null));
  const [snap, setSnap] = useState(JSON.stringify(normalizeProductMascots(null)));
  const [prods, setProds] = useState<Prod[]>([]);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState('');
  const [newCount, setNewCount] = useState(0);
  const knownIds = useRef<Set<string>>(new Set());

  const dirty = useMemo(() => JSON.stringify(pm) !== snap, [pm, snap]);
  const all = useMemo(() => allMascots(pm), [pm]);
  const byId = useMemo(() => new Map(all.map(m => [m.id, m])), [all]);

  /* ---------------- load ---------------- */
  function open(t: any) {
    const n = normalizeProductMascots(t?.config?.productMascots);
    setThemeId(t?.id || ''); setPm(n); setSnap(JSON.stringify(n)); setEditing(''); setMsg('');
  }
  async function loadThemes() {
    const r = await supabase.from('site_themes').select('id,name,active,config,created_at').order('created_at', { ascending: false });
    if (r.error) { setMsg('Could not load themes: ' + r.error.message); setLoaded(true); return; }
    const list = r.data || [];
    setThemes(list);
    const want = new URLSearchParams(window.location.search).get('theme');
    const pick = list.find((t: any) => t.id === want) || list.find((t: any) => t.config?.productMascots?.enabled) || list.find((t: any) => t.config?.preset === 'chiikawa') || list[0];
    if (pick) open(pick);
    setLoaded(true);
  }
  async function loadProducts(announce = false) {
    const r = await supabase.from('products').select('id,name,main_image_url,status,created_at').eq('status', 'published').order('created_at', { ascending: false }).range(0, 999);
    if (r.error) { setMsg('Could not load products: ' + r.error.message); return; }
    const list = (r.data || []) as Prod[];
    if (announce && knownIds.current.size) { const fresh = list.filter(p => !knownIds.current.has(p.id)).length; if (fresh) setNewCount(n => n + fresh); }
    knownIds.current = new Set(list.map(p => p.id));
    setProds(list);
  }
  useEffect(() => {
    void loadThemes(); void loadProducts();
    // a product added (or removed) while this page is open shows up straight away – and already has its mascot
    let ch: any = null;
    try { ch = supabase.channel('pm-products').on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => { void loadProducts(true); }).subscribe(); } catch { /* realtime not available */ }
    return () => { if (ch) { try { supabase.removeChannel(ch); } catch { /* ignore */ } } };
  }, []);

  function chooseTheme(id: string) {
    if (dirty && !window.confirm('Discard the changes you have not saved?')) return;
    open(themes.find(t => t.id === id));
  }

  /* ---------------- edit ---------------- */
  const upd = (patch: Partial<ProductMascotCfg>) => setPm(p => ({ ...p, ...patch }));
  const togglePool = (id: string) => setPm(p => {
    const pool = p.pool.includes(id) ? p.pool.filter(x => x !== id) : [...p.pool, id];
    return { ...p, pool, count: Math.max(1, pool.length) };
  });
  const pickRandom = () => setPm(p => ({ ...p, enabled: true, pool: randomPool(p, p.count), seed: 1 + Math.floor(Math.random() * 1e9) }));
  const shuffle = () => upd({ seed: 1 + Math.floor(Math.random() * 1e9), enabled: true });
  async function addCustom(file: File) {
    setMsg('Uploading…');
    try {
      const url = await uploadThemeImage(file, 600);
      const id = 'c-' + (globalThis.crypto && 'randomUUID' in globalThis.crypto ? globalThis.crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));
      setPm(p => ({ ...p, custom: [...p.custom, { id, url, name: file.name.replace(/\.[^.]+$/, '').slice(0, 30) || 'My mascot' }], pool: [...p.pool, id], count: p.pool.length + 1 }));
      setMsg('Added to your mascots. Press Save to keep it.');
    } catch (e: any) { setMsg('Upload failed: ' + (e?.message || e)); }
  }
  const removeCustom = (id: string) => setPm(p => {
    const overrides: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(p.overrides) as [string, string[]][]) overrides[k] = v.filter(x => x !== id);
    const pool = p.pool.filter(x => x !== id);
    return { ...p, custom: p.custom.filter(c => c.id !== id), pool, overrides, count: Math.max(1, pool.length) };
  });
  const setOverride = (pid: string, ids: string[] | null) => setPm(p => {
    const o = { ...p.overrides };
    if (ids === null) delete o[pid]; else o[pid] = ids.slice(0, 3);
    return { ...p, overrides: o };
  });

  async function save() {
    if (!themeId) { setMsg('Choose a theme first.'); return; }
    setBusy(true); setMsg('');
    // merge into the freshest copy of the theme, so nothing else the theme editor saved is lost
    const fresh = await supabase.from('site_themes').select('config').eq('id', themeId).single();
    if (fresh.error) { setMsg('Could not save: ' + fresh.error.message); setBusy(false); return; }
    const config = { ...(fresh.data?.config || {}), productMascots: pm };
    const r = await supabase.from('site_themes').update({ config, updated_at: new Date().toISOString() }).eq('id', themeId).select('id,name,active,config,created_at').single();
    if (r.error) setMsg('Could not save: ' + r.error.message);
    else {
      setSnap(JSON.stringify(pm));
      setThemes(list => list.map(t => (t.id === themeId ? r.data : t)));
      setMsg(pm.enabled ? 'Saved. Customers using this theme now see the mascots on every product.' : 'Saved. Product mascots are switched off for this theme.');
    }
    setBusy(false);
  }

  /* ---------------- view ---------------- */
  const shown = prods.filter(p => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const manualCount = Object.keys(pm.overrides).filter(id => prods.some(p => p.id === id)).length;
  const editingProd = prods.find(p => p.id === editing);
  const editingIds = editingProd ? mascotsForProduct(pm, editingProd.id).items.map(m => m.id) : [];
  const theme = themes.find(t => t.id === themeId);

  // a plain function (not a component) so the tiles are not re-created on every keystroke / slider move
  const tile = ({ id, on, onClick, small }: { id: string; on: boolean; onClick: () => void; small?: boolean }) => {
    const m = byId.get(id);
    if (!m) return null;
    return (
      <button type="button" className={'pmxTile' + (on ? ' on' : '') + (small ? ' small' : '')} onClick={onClick} aria-pressed={on} title={m.label}>
        <img src={m.url} alt="" draggable={false} /><span>{m.label}</span>
      </button>
    );
  };

  return (
    <Shell title="Product Mascots">
      <div className="pmx">
        <section className="panel pmxIntro">
          <div>
            <span className="eyebrow">ONE MASCOT FOR EVERY PRODUCT</span>
            <h2>Pick how many mascots, we do the rest</h2>
            <p className="muted">Choose how many different mascots you want, press the dice, and every product card gets one picked at random. When you add a new product it gets a mascot by itself – nothing to do. You can still change any single product below.</p>
          </div>
          {!loaded ? <p className="muted">Loading…</p> : !themes.length ? (
            <p className="pmxWarn">There is no theme yet. Create one in <Link to="/admin/secret-code">Secret Code</Link> first, then come back.</p>
          ) : (
            <div className="pmxThemeRow">
              <label><span>Theme</span>
                <select value={themeId} onChange={e => chooseTheme(e.target.value)}>
                  {themes.map(t => <option key={t.id} value={t.id}>{t.name}{t.config?.preset === 'chiikawa' ? ' · Chiikawa' : ''}</option>)}
                </select>
              </label>
              <label className="pmxSwitch"><input type="checkbox" checked={pm.enabled} onChange={e => upd({ enabled: e.target.checked })} /><span>Show a mascot on every product</span></label>
              {theme ? <Link className="button secondary" to={'/admin/secret-code?theme=' + theme.id}><Palette size={15} /> Open this theme in the editor</Link> : null}
            </div>
          )}
        </section>

        {themes.length > 0 && <>
          <section className="panel pmxBlock">
            <h3>1 · How many mascots?</h3>
            <div className="pmxCountRow">
              <input type="range" min={1} max={Math.max(1, all.length)} value={Math.min(pm.count, Math.max(1, all.length))} onChange={e => upd({ count: Number(e.target.value) })} aria-label="How many mascots" />
              <b className="pmxCount">{Math.min(pm.count, all.length)}</b><span className="muted">of {all.length}</span>
            </div>
            <div className="pmxActions">
              <button type="button" onClick={pickRandom}><Dices size={16} /> Pick {Math.min(pm.count, all.length)} random mascots for me</button>
              <button type="button" className="secondary" onClick={shuffle} disabled={!pm.pool.length && !pm.enabled}><Shuffle size={16} /> Shuffle who gets which</button>
            </div>
            <div className="pmxGrid2">
              <label><span>Mascots on each product</span>
                <select value={pm.perProduct} onChange={e => upd({ perProduct: Number(e.target.value) })}>
                  <option value={1}>1 mascot</option><option value={2}>2 mascots</option><option value={3}>3 mascots</option>
                </select></label>
              <label><span>Movement</span>
                <select value={pm.motion} onChange={e => upd({ motion: e.target.value as PMMotion })}>{MOTIONS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</select></label>
              <label><span>Size: {pm.size}%</span>
                <input type="range" min={40} max={220} step={5} value={pm.size} onChange={e => upd({ size: Number(e.target.value) })} /></label>
            </div>
          </section>

          <section className="panel pmxBlock">
            <h3>2 · Your mascots <small>{pm.pool.length ? `${pm.pool.length} in use` : 'none chosen yet – the three classic friends are used'}</small></h3>
            <p className="muted">Tap a mascot to add or remove it. Products only get mascots from this group.</p>
            <div className="pmxTiles">
              {all.map(m => (
                <div className="pmxTileWrap" key={m.id}>
                  {tile({ id: m.id, on: pm.pool.includes(m.id), onClick: () => togglePool(m.id) })}
                  {m.id.startsWith('c-') ? <button type="button" className="pmxDel" title="Delete this mascot" onClick={() => removeCustom(m.id)}><Trash2 size={13} /></button> : null}
                </div>
              ))}
            </div>
            <div className="pmxActions">
              <label className="button secondary pmxUpload"><ImagePlus size={15} /> Add my own mascot picture<input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (f) void addCustom(f); }} /></label>
              <button type="button" className="secondary" onClick={() => upd({ pool: all.map(m => m.id), count: all.length })}>Use all</button>
              <button type="button" className="secondary" onClick={() => upd({ pool: [], count: 1 })}>Clear</button>
            </div>
          </section>

          <section className="panel pmxBlock">
            <div className="pmxHead">
              <h3>3 · Every product <small>{prods.length} products{manualCount ? ` · ${manualCount} changed by hand` : ''}</small></h3>
              <label className="pmxSearch"><Search size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search products…" /></label>
            </div>
            {newCount > 0 && <p className="pmxNew"><Sparkles size={14} /> {newCount} new product{newCount > 1 ? 's' : ''} appeared – already given a mascot automatically.</p>}
            {!prods.length ? <p className="muted">No published products yet. When you add one it appears here with its mascot.</p> : (
              <div className="pmxProducts">
                {shown.map(p => {
                  const { items, auto } = mascotsForProduct(pm, p.id);
                  return (
                    <div className={'pmxProd' + (pm.enabled ? '' : ' off')} key={p.id}>
                      <div className="pmxPic">
                        {p.main_image_url ? <img src={p.main_image_url} alt="" loading="lazy" /> : <span className="pmxNoPic">No photo</span>}
                        {pm.enabled && items.map((m, i) => {
                          const mo = motionFor(pm, p.id, i);
                          return <span key={m.id + i} className={'ynPM ynPM' + i} style={{ ['--pm-s' as any]: pm.size / 100 }}>
                            <img src={m.url} alt="" draggable={false} className={mo.type !== 'none' ? 'ynPMa ynPMa-' + mo.type : undefined} style={mo.type !== 'none' ? { animationDelay: mo.delay + 's' } : undefined} /></span>;
                        })}
                      </div>
                      <b title={p.name}>{p.name}</b>
                      <small>{!items.length ? 'No mascot' : auto ? 'Picked automatically' : 'Chosen by you'}</small>
                      <button type="button" className="secondary" onClick={() => setEditing(p.id)}>Change</button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>}

        <div className={'pmxSave' + (dirty ? ' dirty' : '')}>
          <span>{busy ? 'Saving…' : msg || (dirty ? 'You have changes that are not saved yet.' : 'Everything is saved.')}</span>
          <button type="button" disabled={!dirty || busy || !themeId} onClick={() => void save()}><Save size={16} /> Save</button>
        </div>

        {editingProd && (
          <div className="pmxSheetBack" onClick={() => setEditing('')}>
            <div className="pmxSheet" onClick={e => e.stopPropagation()} role="dialog" aria-label={'Mascot for ' + editingProd.name}>
              <div className="pmxHead"><h3>{editingProd.name}</h3><button type="button" className="icon" aria-label="Close" onClick={() => setEditing('')}><X size={18} /></button></div>
              <p className="muted">Pick up to 3 mascots for this product only. It keeps them even when you shuffle.</p>
              <div className="pmxTiles">
                {all.map(m => <React.Fragment key={m.id}>{tile({ id: m.id, small: true, on: editingIds.includes(m.id),
                  onClick: () => setOverride(editingProd.id, editingIds.includes(m.id) ? editingIds.filter(x => x !== m.id) : [...editingIds, m.id].slice(0, 3)) })}</React.Fragment>)}
              </div>
              <div className="pmxActions">
                <button type="button" className="secondary" onClick={() => setOverride(editingProd.id, [])}>No mascot on this product</button>
                <button type="button" className="secondary" onClick={() => setOverride(editingProd.id, null)}><Undo2 size={14} /> Back to automatic</button>
                <button type="button" onClick={() => setEditing('')}>Done</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
