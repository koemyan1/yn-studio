import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUp, Copy, Dices, Eye, Hand, ImagePlus, Monitor, Move, MousePointerClick, Plus, Save, Shuffle,
  Smartphone, Sparkles, Tablet, Trash2, Undo2, Wand2,
} from 'lucide-react';
import { supabase } from './supabase';
import {
  COMPONENTS, DEFAULT_TOKENS, PAGES, TEXT_KEYS, THEME_PRESETS,
  blankTheme, normalizeTheme, type PropName, type StyleProps,
} from './secretTheme';
import { ACTION_TYPES, ANIM_TYPES, ELEMENT_PAGES, STORE_PAGES, blankElement, type ThemeEl } from './themeElements';
import { hslToHex, shrinkImage } from './imageTools';
import { DEFAULT_CLOUD_SECONDS, MASCOT_GROUPS, MASCOT_SLOTS } from './chiikawaMascots';

type Shell = React.ComponentType<{ title: string; children: React.ReactNode }>;
const TABS = ['Theme & code', 'Look', 'Mascots', 'Categories', 'Delivery', 'Products', 'Elements', 'Parts', 'Text', 'Layout & pages', 'Advanced'] as const;
type Tab = typeof TABS[number];
type Mode = 'parts' | 'elements' | 'try' | 'mascots';

const FONTS: [string, string][] = [
  ['', 'Default (Inter)'],
  ['Georgia, "Times New Roman", serif', 'Georgia (serif)'],
  ['"Trebuchet MS", system-ui, sans-serif', 'Trebuchet MS'],
  ['Verdana, Geneva, sans-serif', 'Verdana'],
  ['"Courier New", ui-monospace, monospace', 'Courier (mono)'],
  ['"Comic Sans MS", "Comic Neue", cursive', 'Comic Sans (playful)'],
  ['Poppins, system-ui, sans-serif', 'Poppins (needs font URL)'],
  ['"Playfair Display", Georgia, serif', 'Playfair Display (needs font URL)'],
  ['"Baloo 2", system-ui, sans-serif', 'Baloo 2 (needs font URL)'],
  ['"Kantumruy Pro", "Noto Sans Khmer", system-ui, sans-serif', 'Kantumruy Pro (Khmer-friendly, needs font URL)'],
];

/** Uploads to the public theme-assets bucket; falls back to a small embedded picture if the bucket is not set up yet. */
async function uploadThemeImage(file: File, maxSide = 1100): Promise<string> {
  const data = await shrinkImage(file, maxSide);
  try {
    const blob = await (await fetch(data)).blob();
    const path = `themes/${crypto.randomUUID()}.${blob.type.includes('png') ? 'png' : 'jpg'}`;
    const up = await supabase.storage.from('theme-assets').upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
    if (!up.error) return supabase.storage.from('theme-assets').getPublicUrl(path).data.publicUrl;
  } catch { /* fall back */ }
  return data;
}

function ColorField({ label, value, fallback, onChange, onClear }: { label: string; value?: string; fallback: string; onChange: (v: string) => void; onClear?: () => void }) {
  const hex = /^#[0-9a-f]{6}$/i.test(value || '') ? (value as string) : /^#[0-9a-f]{6}$/i.test(fallback) ? fallback : '#ffffff';
  return (
    <label className="ynField ynColor">
      <span>{label}</span>
      <div><input type="color" value={hex} onChange={e => onChange(e.target.value)} /><code>{value || 'default'}</code>{value && onClear ? <button type="button" className="ynLink" onClick={onClear}>reset</button> : null}</div>
    </label>
  );
}
function RangeField({ label, value, min, max, unit = 'px', onChange, onClear, step = 1 }: { label: string; value?: number | null; min: number; max: number; unit?: string; step?: number; onChange: (v: number) => void; onClear?: () => void }) {
  const set = value != null;
  return (
    <label className="ynField">
      <span>{label}: <b>{set ? value + unit : 'default'}</b>{set && onClear ? <button type="button" className="ynLink" onClick={onClear}>reset</button> : null}</span>
      <input type="range" min={min} max={max} step={step} value={set ? value! : min} onChange={e => onChange(Number(e.target.value))} />
    </label>
  );
}
const Select = ({ label, value, onChange, children }: { label: string; value: string | number; onChange: (v: string) => void; children: React.ReactNode }) => (
  <label className="ynField"><span>{label}</span><select value={value} onChange={e => onChange(e.target.value)}>{children}</select></label>
);
const Check = ({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) => (
  <label className="ynCheck"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /> {children}</label>
);
const READY_BANNERS = [
  { src: '/chiikawa/banner-delivery.png', label: 'Delivery 9-10 days' },
  { src: '/chiikawa/banner-food.png', label: 'Yummy food' },
  { src: '/chiikawa/banner-drink.png', label: 'Sip sip drinks' },
  { src: '/chiikawa/banner-welcome.png', label: 'Welcome' },
];

function PicButton({ label, has, onPick, onClear }: { label: string; has: boolean; onPick: (f: File) => void; onClear?: () => void }) {
  return (
    <div className="ynRow">
      <label className="ynDrop"><ImagePlus size={16} /> {has ? 'Replace ' + label : 'Upload ' + label}<input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (f) onPick(f); }} /></label>
      {has && onClear ? <button type="button" className="ynLink" onClick={onClear}>remove</button> : null}
    </div>
  );
}

const rnd = (a: number, b: number) => Math.round(a + Math.random() * (b - a));

export default function AdminSecretCode({ Shell }: { Shell: Shell }) {
  const [themes, setThemes] = useState<any[]>([]);
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('New secret theme');
  const [code, setCode] = useState('');
  const [active, setActive] = useState(true);
  const [cfg, setCfg] = useState<any>(blankTheme());
  const [snapshot, setSnapshot] = useState(JSON.stringify({ n: 'New secret theme', c: '', a: true, cfg: blankTheme() }));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('Theme & code');
  const [compKey, setCompKey] = useState('productCard');
  const [elementId, setElementId] = useState('');
  const [cats, setCats] = useState<any[]>([]);
  const [mapFlags, setMapFlags] = useState<Record<string, boolean>>({});
  const [mapMsg, setMapMsg] = useState('');
  useEffect(() => { setMapFlags(Object.fromEntries(cats.map((c: any) => [c.id, !!c.delivery_tracking_enabled]))); }, [cats]);
  async function toggleMapCat(id: string, on: boolean) {
    setMapFlags(f => ({ ...f, [id]: on })); setMapMsg('');
    const r = await supabase.from('categories').update({ delivery_tracking_enabled: on }).eq('id', id);
    if (r.error) { setMapFlags(f => ({ ...f, [id]: !on })); setMapMsg(r.error.message + ' — run supabase-map-checkout.sql in Supabase first.'); }
  }
  const [banners, setBanners] = useState<any[]>([]);
  const [prods, setProds] = useState<any[]>([]);
  const [catQuery, setCatQuery] = useState('');
  const [frameSrc, setFrameSrc] = useState('/');
  const [curPath, setCurPath] = useState('/');
  const [device, setDevice] = useState<'phone' | 'tablet' | 'desktop'>('phone');
  const [mode, setMode] = useState<Mode>('parts');
  const [mascotGroup, setMascotGroup] = useState<string>('headLeft');
  const [previewDark, setPreviewDark] = useState<'' | '0' | '1'>('');
  const [ready, setReady] = useState(false);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const controls = useRef<HTMLDivElement | null>(null);

  const dirty = useMemo(() => JSON.stringify({ n: name, c: code, a: active, cfg }) !== snapshot, [name, code, active, cfg, snapshot]);
  const productId = prods[0]?.id || '';

  async function loadThemes() {
    const r = await supabase.from('site_themes').select('*').order('created_at', { ascending: false });
    if (r.error) { setMsg('Could not load themes: ' + r.error.message + ' — run supabase-secret-themes-and-store-location.sql first.'); return; }
    setThemes(r.data || []);
  }
  useEffect(() => {
    void loadThemes();
    (async () => {
      const [c0, b, p] = await Promise.all([
        supabase.from('categories').select('id,name,theme_only_id').eq('status', 'active').order('name'),
        supabase.from('banners').select('id,title,image_url').eq('active', true).order('sort_order'),
        supabase.from('products').select('id,name,category_id').eq('status', 'published').order('created_at', { ascending: false }).limit(300),
      ]);
      // If supabase-chiikawa-complete.sql has not been run yet the column does not exist: fall back to the plain list.
      const c = c0.error ? await supabase.from('categories').select('id,name').eq('status', 'active').order('name') : c0;
      setCats(c.data || []); setBanners(b.data || []); setProds(p.data || []);
    })();
  }, []);

  // Open a specific theme when arriving from the Themes page (?theme=<id>).
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current || !themes.length) return;
    deepLinked.current = true;
    const id = new URLSearchParams(window.location.search).get('theme');
    if (id && themes.some(t => t.id === id)) choose(id);
  }, [themes]);

  // Tabs decide what a tap in the preview does.
  useEffect(() => { if (tab === 'Elements') setMode('elements'); else if (tab === 'Parts') setMode('parts'); else if (tab === 'Mascots') setMode('mascots'); else if (mode === 'mascots') setMode('parts'); }, [tab]);

  // Push the unsaved draft into the live storefront preview.
  useEffect(() => {
    if (!ready) return;
    frame.current?.contentWindow?.postMessage({
      type: 'yn-theme-draft', config: { ...cfg, _themeId: selected }, mode,
      selectedKey: tab === 'Parts' ? compKey : '', selectedElementId: tab === 'Elements' ? elementId : '', selectedMascot: tab === 'Mascots' ? mascotGroup : '', previewDark,
    }, window.location.origin);
  }, [cfg, ready, mode, compKey, tab, elementId, mascotGroup, previewDark, selected]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      const d = e.data || {};
      if (d.type === 'yn-theme-ready') setReady(true);
      if (d.type === 'yn-theme-path') setCurPath(d.path);
      if (d.type === 'yn-theme-select') {
        setCompKey(d.key); setTab('Parts');
        window.setTimeout(() => controls.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
      }
      if (d.type === 'yn-theme-element-select') { setElementId(d.id); setTab('Elements'); }
      if (d.type === 'yn-theme-mascot-select') { setMascotGroup(d.group); setTab('Mascots'); }
      if (d.type === 'yn-theme-mascot-patch') setCfg((c: any) => ({ ...c, mascotPos: { ...(c.mascotPos || {}), [d.group]: { ...((c.mascotPos || {})[d.group] || {}), ...d.patch } } }));
      if (d.type === 'yn-theme-element-patch') setCfg((c: any) => ({ ...c, elements: (c.elements || []).map((x: ThemeEl) => (x.id === d.id ? { ...x, ...d.patch } : x)) }));
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const patch = (k: string, v: any) => setCfg((c: any) => ({ ...c, [k]: v }));
  const patchIn = (group: string, k: string, v: any) => setCfg((c: any) => ({ ...c, [group]: { ...(c[group] || {}), [k]: v } }));
  const setProp = (key: string, prop: PropName, v: any) => setCfg((c: any) => {
    const cur = { ...(c.components?.[key] || {}) };
    if (v === undefined || v === '' || v === false) delete (cur as any)[prop]; else (cur as any)[prop] = v;
    const components = { ...(c.components || {}) };
    if (Object.keys(cur).length) components[key] = cur; else delete components[key];
    return { ...c, components };
  });
  const token = (k: string) => (
    <ColorField key={k} label={({ background: 'Page background', surface: 'Cards & surfaces', text: 'Main text', muted: 'Soft text', border: 'Borders', accent: 'Accent (buttons, highlights)', accent2: 'Accent 2 (button gradient end)' } as any)[k]}
      value={cfg[k]} fallback={(DEFAULT_TOKENS as any)[k]} onChange={v => patch(k, v)} onClear={() => patch(k, '')} />
  );

  /** Upload helper that shows progress and errors in the message line. */
  async function pick(file: File, done: (url: string) => void, maxSide = 1100) {
    if (file.size > 15 * 1024 * 1024) { setMsg('Please use a picture under 15 MB.'); return; }
    setMsg('Uploading picture…');
    try { done(await uploadThemeImage(file, maxSide)); setMsg(''); } catch (e: any) { setMsg('Could not use that picture: ' + (e?.message || e)); }
  }

  function choose(id: string) {
    setSelected(id); setElementId(''); setMsg('');
    const t = themes.find(x => x.id === id);
    const n = t ? t.name : 'New secret theme', c = t ? t.secret_code || '' : '', a = t ? !!t.active : true, conf = normalizeTheme(t?.config);
    setName(n); setCode(c); setActive(a); setCfg(conf);
    setSnapshot(JSON.stringify({ n, c, a, cfg: conf }));
  }
  function newTheme() { if (dirty && !confirm('Discard unsaved changes?')) return; choose(''); }
  function duplicate() { setSelected(''); setName(name + ' copy'); setCode(''); setMsg('Duplicated. Give the copy its own secret code, then save.'); }
  function applyPreset(id: string) {
    const p = THEME_PRESETS.find(x => x.id === id); if (!p) return;
    if (!confirm('Replace the colors, fonts and part styles with "' + p.label + '"? Your elements, banners, categories and product picture settings are kept.')) return;
    setCfg((c: any) => ({ ...blankTheme(), ...p.cfg, elements: c.elements, allowedCategories: c.allowedCategories, hideUncategorized: c.hideUncategorized, bannerIds: c.bannerIds, texts: { ...(p.cfg as any).texts, ...c.texts }, productImage: c.productImage, dark: c.dark, delivery: c.delivery, bannerImage: c.bannerImage || (p.cfg as any).bannerImage || '' }));
  }
  function surprise() {
    const h = rnd(0, 359);
    setCfg((c: any) => ({
      ...c, background: hslToHex(h, 70, 96), surface: '#ffffff', text: hslToHex(h, 40, 18), muted: hslToHex(h, 18, 45), border: hslToHex(h, 45, 89),
      accent: hslToHex(h, 78, 56), accent2: hslToHex((h + rnd(25, 70)) % 360, 82, 62),
      bg: { ...c.bg, type: 'gradient', from: hslToHex(h, 85, 93), to: hslToHex((h + rnd(30, 80)) % 360, 85, 90), angle: rnd(100, 220) },
    }));
    setMsg('Random look applied — press it again for another one, or Undo with the preset list.');
  }
  const [newOnly, setNewOnly] = useState('');
  async function addOnlyCat(raw: string) {
    const nm = raw.trim();
    if (!nm) return;
    if (!selected) { setMsg('Save the theme first, then add its own categories.'); return; }
    if (cats.some(c => c.theme_only_id === selected && String(c.name).toLowerCase() === nm.toLowerCase())) { setMsg('This theme already has a "' + nm + '" category.'); return; }
    const r = await supabase.from('categories').insert({ name: nm, status: 'active', delivery_tracking_enabled: false, theme_only_id: selected }).select('id,name,theme_only_id').single();
    if (r.error) { setMsg('Could not add the category: ' + r.error.message + (/theme_only_id/.test(r.error.message) ? ' — run supabase-chiikawa-complete.sql in Supabase first.' : '')); return; }
    setCats(list => [...list, r.data].sort((a, b) => String(a.name).localeCompare(String(b.name))));
    setNewOnly(''); setMsg('Added "' + nm + '". It only shows in this theme. Add products to it in Admin → Products.');
  }
  async function releaseOnlyCat(c: any) {
    if (!confirm('Show "' + c.name + '" for everyone (normal mode and all themes)?')) return;
    const r = await supabase.from('categories').update({ theme_only_id: null }).eq('id', c.id);
    if (r.error) { setMsg(r.error.message); return; }
    setCats(list => list.map(x => (x.id === c.id ? { ...x, theme_only_id: null } : x)));
  }
  function genCode() {
    const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    setCode(Array.from({ length: 8 }, () => abc[Math.floor(Math.random() * abc.length)]).join(''));
  }
  async function save() {
    const c = code.trim();
    if (!name.trim()) { setMsg('Enter a theme name.'); return; }
    if (c.length < 3 || /\s/.test(c)) { setMsg('The secret code needs at least 3 characters and no spaces.'); return; }
    setBusy(true); setMsg('');
    const payload = { name: name.trim(), secret_code: c, active, config: cfg, updated_at: new Date().toISOString() };
    const r = selected
      ? await supabase.from('site_themes').update(payload).eq('id', selected).select().single()
      : await supabase.from('site_themes').insert(payload).select().single();
    if (r.error) setMsg(r.error.code === '23505' ? 'That secret code is already used by another theme. Choose a different code.' : 'Could not save: ' + r.error.message);
    else { setSelected(r.data.id); setSnapshot(JSON.stringify({ n: name, c, a: active, cfg })); setMsg('Saved. Customers can now unlock it with the code "' + c + '" (Messages → Secret theme).'); await loadThemes(); }
    setBusy(false);
  }
  async function removeTheme() {
    if (!selected || !confirm('Delete this theme? Customers using it will return to the normal look.')) return;
    const r = await supabase.from('site_themes').delete().eq('id', selected);
    if (r.error) { setMsg(r.error.message); return; }
    setMsg('Theme deleted.'); await loadThemes(); choose('');
  }

  /* ---------------- elements ---------------- */
  const elements: ThemeEl[] = cfg.elements || [];
  const el = elements.find(x => x.id === elementId);
  const patchEl = (id: string, p: Partial<ThemeEl>) => setCfg((c: any) => ({ ...c, elements: (c.elements || []).map((x: ThemeEl) => (x.id === id ? { ...x, ...p } : x)) }));
  const addElement = (type: 'button' | 'text' | 'image', o: Partial<ThemeEl> = {}) => {
    const e = blankElement(type, o, elements.length + 1);
    if (type === 'text') e.color = cfg.text || DEFAULT_TOKENS.text;
    setCfg((c: any) => ({ ...c, elements: [...(c.elements || []), e] }));
    setElementId(e.id); setMode('elements');
  };
  const dupEl = (x: ThemeEl) => { const c = { ...x, id: crypto.randomUUID(), x: Math.min(90, x.x + 4), y: Math.min(90, x.y + 4), z: elements.length + 1, name: x.name ? x.name + ' copy' : '' }; setCfg((s: any) => ({ ...s, elements: [...s.elements, c] })); setElementId(c.id); };
  const delEl = (id: string) => { setCfg((c: any) => ({ ...c, elements: c.elements.filter((x: ThemeEl) => x.id !== id) })); setElementId(''); };
  const moveEl = (id: string, dir: -1 | 1) => setCfg((c: any) => {
    const a = [...c.elements], i = a.findIndex((x: ThemeEl) => x.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= a.length) return c;
    [a[i], a[j]] = [a[j], a[i]];
    return { ...c, elements: a.map((x: ThemeEl, k: number) => ({ ...x, z: k + 1 })) };
  });
  const elLabel = (x: ThemeEl, i: number) => `${x.type === 'button' ? '🔘' : x.type === 'image' ? '🖼️' : '🔤'} ${x.name || x.text.slice(0, 22) || (x.type === 'image' ? 'Picture' : 'Element')} (${i + 1})`;

  const actionNeeds = el ? (ACTION_TYPES.find(a => a.type === el.action.type)?.needs || 'none') : 'none';
  const actionGroups = Array.from(new Set(ACTION_TYPES.map(a => a.group)));

  /* ---------------- parts ---------------- */
  const def = COMPONENTS.find(x => x.key === compKey) || COMPONENTS[0];
  const cp: StyleProps = cfg.components?.[def.key] || {};
  const groups = Array.from(new Set(COMPONENTS.map(x => x.group)));
  const field = (prop: PropName) => {
    const k = def.key;
    const clr = () => setProp(k, prop, '');
    switch (prop) {
      case 'background': return <ColorField key={prop} label="Background" value={cp.background} fallback="#ffffff" onChange={v => setProp(k, prop, v)} onClear={clr} />;
      case 'color': return <ColorField key={prop} label="Text / icon color" value={cp.color} fallback="#241b35" onChange={v => setProp(k, prop, v)} onClear={clr} />;
      case 'borderColor': return <ColorField key={prop} label="Border color" value={cp.borderColor} fallback="#e9e2f4" onChange={v => setProp(k, prop, v)} onClear={clr} />;
      case 'borderWidth': return <RangeField key={prop} label="Border width" value={cp.borderWidth} min={0} max={8} onChange={v => setProp(k, prop, v)} onClear={clr} />;
      case 'radius': return <RangeField key={prop} label="Corner roundness" value={cp.radius} min={0} max={60} onChange={v => setProp(k, prop, v)} onClear={clr} />;
      case 'fontSize': return <RangeField key={prop} label="Text size" value={cp.fontSize} min={10} max={48} onChange={v => setProp(k, prop, v)} onClear={clr} />;
      case 'padding': return <RangeField key={prop} label="Inner spacing" value={cp.padding} min={0} max={48} onChange={v => setProp(k, prop, v)} onClear={clr} />;
      case 'opacity': return <RangeField key={prop} label="Opacity" value={cp.opacity} min={10} max={100} unit="%" onChange={v => setProp(k, prop, v)} onClear={clr} />;
      case 'fontWeight': return <label key={prop} className="ynField"><span>Text weight</span><select value={cp.fontWeight || ''} onChange={e => setProp(k, prop, e.target.value ? Number(e.target.value) : '')}><option value="">Default</option>{[400, 500, 600, 700, 800, 900].map(w => <option key={w} value={w}>{w}</option>)}</select></label>;
      case 'shadow': return <label key={prop} className="ynField"><span>Shadow</span><select value={cp.shadow || ''} onChange={e => setProp(k, prop, e.target.value)}><option value="">Default</option><option value="none">None</option><option value="soft">Soft</option><option value="medium">Medium</option><option value="strong">Strong</option></select></label>;
      case 'fit': return <label key={prop} className="ynField"><span>Image fit</span><select value={cp.fit || ''} onChange={e => setProp(k, prop, e.target.value)}><option value="">Default</option><option value="cover">Fill (crop)</option><option value="contain">Show whole image</option></select></label>;
      case 'backgroundImage': return (
        <div key={prop} className="ynField"><span>Background picture</span>
          <PicButton label="picture" has={!!cp.backgroundImage} onPick={f => pick(f, u => setProp(k, prop, u))} onClear={() => setProp(k, prop, '')} />
        </div>);
      case 'hidden': return <Check key={prop} checked={!!cp.hidden} onChange={v => setProp(k, prop, v)}>Hide this part completely</Check>;
      default: return null;
    }
  };

  const pageOptions = [...PAGES.filter(p => p.key !== 'products').map(p => ({ label: p.label, path: p.path })), ...(productId ? [{ label: 'Product page', path: '/product/' + productId }] : []), { label: 'Customer service', path: '/support' }];
  const widths = { phone: 390, tablet: 768, desktop: 0 };
  const allowed: string[] = cfg.allowedCategories || [];
  const countIn = (cid: string) => prods.filter(p => p.category_id === cid).length;
  const ownCats = cats.filter(c => !c.theme_only_id || c.theme_only_id === selected);
  const shownCats = ownCats.filter(c => c.name.toLowerCase().includes(catQuery.toLowerCase()));
  const pi = cfg.productImage;
  const di = cfg.dark;

  /* ---------------- mascots (Chiikawa) ---------------- */
  const mImgs: Record<string, string> = cfg.mascotImages || {};
  const mPos: Record<string, any> = cfg.mascotPos || {};
  const mg = MASCOT_GROUPS.find(g => g.key === mascotGroup) || MASCOT_GROUPS[0];
  const mp = mPos[mg.key] || {};
  const setMPos = (patchPos: Record<string, any>) => setCfg((c: any) => {
    const cur: Record<string, any> = { ...((c.mascotPos || {})[mg.key] || {}), ...patchPos };
    for (const k of Object.keys(cur)) if (cur[k] === undefined || cur[k] === 0 || cur[k] === false || (k === 's' && cur[k] === 100)) delete cur[k];
    const all = { ...(c.mascotPos || {}) };
    if (Object.keys(cur).length) all[mg.key] = cur; else delete all[mg.key];
    return { ...c, mascotPos: all };
  });
  const setMImg = (slot: string, url: string) => setCfg((c: any) => {
    const m = { ...(c.mascotImages || {}) };
    if (url) m[slot] = url; else delete m[slot];
    return { ...c, mascotImages: m };
  });

  return (
    <Shell title="Secret Code">
      <div className="ynStudio">
        <section className="ynPreviewCol">
          <div className="ynBar">
            <select value={frameSrc} onChange={e => { setReady(false); setFrameSrc(e.target.value); setCurPath(e.target.value); }} aria-label="Preview page">
              {pageOptions.map(p => <option key={p.path} value={p.path}>{p.label}</option>)}
            </select>
            <div className="ynSeg">
              {([['phone', Smartphone], ['tablet', Tablet], ['desktop', Monitor]] as const).map(([k, Icon]) => <button key={k} type="button" className={device === k ? 'on' : ''} onClick={() => setDevice(k)} title={k}><Icon size={16} /></button>)}
            </div>
            <select className="ynMini" value={previewDark} onChange={e => setPreviewDark(e.target.value as any)} aria-label="Preview light or dark" title="Preview this theme in light or dark mode">
              <option value="">Theme default</option><option value="0">☀️ Light</option><option value="1">🌙 Dark</option>
            </select>
            <div className="ynSeg">
              <button type="button" className={mode === 'parts' ? 'on' : ''} onClick={() => setMode('parts')}><MousePointerClick size={15} /> Select parts</button>
              <button type="button" className={mode === 'elements' ? 'on' : ''} onClick={() => setMode('elements')}><Move size={15} /> Move elements</button>
              <button type="button" className={mode === 'try' ? 'on' : ''} onClick={() => setMode('try')}><Hand size={15} /> Try it</button>
            </div>
          </div>
          <p className="ynHint">
            {mode === 'parts' ? 'Tap anything in the store to restyle it. Links are paused while selecting.'
              : mode === 'elements' ? 'Drag your buttons, texts and pictures to move them. Use the pink corner to resize. Animations are paused while editing.'
                : mode === 'mascots' ? 'Grab any pink-dashed mascot box and drag it anywhere. Use the Mascots tab to change its picture or size.'
                : 'Try it: browse the real store, tap your buttons and watch the animations.'} <code>{curPath}</code>
          </p>
          <div className="ynFrameWrap">
            <iframe ref={frame} key={frameSrc} name="yn-theme-preview" src={frameSrc} title="Live storefront preview" style={{ width: widths[device] ? widths[device] : '100%' }} />
          </div>
        </section>

        <section className="ynControls" ref={controls}>
          <div className="ynTabs" role="tablist">{TABS.map(t => <button key={t} type="button" role="tab" className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>

          {tab === 'Theme & code' && <div className="ynPane">
            <label className="ynField"><span>Saved themes</span>
              <select value={selected} onChange={e => { if (dirty && !confirm('Discard unsaved changes?')) return; choose(e.target.value); }}>
                <option value="">New theme…</option>{themes.map(t => <option key={t.id} value={t.id}>{t.name} · {t.active ? 'on' : 'off'} · {t.secret_code}</option>)}
              </select></label>
            <label className="ynField"><span>Theme name</span><input value={name} onChange={e => setName(e.target.value)} /></label>
            <label className="ynField"><span>Secret code (customers type this in Messages)</span>
              <div className="ynRow"><input value={code} onChange={e => setCode(e.target.value.replace(/\s/g, ''))} placeholder="e.g. SUNSET26" autoComplete="off" />
                <button type="button" className="secondary" onClick={genCode} title="Generate a random code"><Dices size={16} /></button>
                <button type="button" className="secondary" onClick={() => { void navigator.clipboard?.writeText(code); setMsg('Code copied.'); }} title="Copy"><Copy size={16} /></button></div></label>
            <Check checked={active} onChange={setActive}>Code is active (customers can unlock this theme)</Check>
            <h4><Wand2 size={15} /> Start from a look</h4>
            <div className="ynPresets">{THEME_PRESETS.map(p => <button key={p.id} type="button" className="secondary" onClick={() => applyPreset(p.id)}><span className="ynSwatch">{p.swatch.map(s => <i key={s} style={{ background: s }} />)}</span>{p.label}</button>)}</div>
            <div className="ynRow"><button type="button" className="secondary" onClick={newTheme}><Plus size={15} /> New</button>{selected && <button type="button" className="secondary" onClick={duplicate}><Copy size={15} /> Duplicate</button>}{selected && <button type="button" className="secondary" onClick={removeTheme}><Trash2 size={15} /> Delete</button>}</div>
          </div>}

          {tab === 'Look' && <div className="ynPane">
            <button type="button" className="ynSurprise" onClick={surprise}><Sparkles size={16} /> Surprise me — random colours &amp; background</button>
            <p className="ynHint">Empty colour = the normal YN Studio look. Change only what you want.</p>
            <div className="ynGrid">{['background', 'surface', 'text', 'muted', 'border', 'accent', 'accent2'].map(token)}</div>

            <h4>Background of everything</h4>
            <Select label="Page background style" value={cfg.bg.type} onChange={v => patchIn('bg', 'type', v)}><option value="none">Plain colour (above)</option><option value="gradient">Gradient</option></Select>
            {cfg.bg.type === 'gradient' && <>
              <div className="ynGrid">
                <ColorField label="From" value={cfg.bg.from} fallback="#ffd1e8" onChange={v => patchIn('bg', 'from', v)} />
                <ColorField label="To" value={cfg.bg.to} fallback="#c7b8ff" onChange={v => patchIn('bg', 'to', v)} />
              </div>
              <RangeField label="Direction" value={cfg.bg.angle} min={0} max={360} unit="°" onChange={v => patchIn('bg', 'angle', v)} />
              <Check checked={!!cfg.bg.animated} onChange={v => patchIn('bg', 'animated', v)}>Slowly moving colours</Check>
            </>}
            <Check checked={!!cfg.bg.glass} onChange={v => patchIn('bg', 'glass', v)}>Frosted-glass cards (see the background through them)</Check>
            <div className="ynField"><span>Wallpaper picture (covers the gradient)</span>
              <PicButton label="wallpaper" has={!!cfg.backgroundImage} onPick={f => pick(f, u => patch('backgroundImage', u))} onClear={() => patch('backgroundImage', '')} /></div>
            <div className="ynField"><span>Home banner picture (replaces the normal banners in this theme)</span>
              <PicButton label="banner (≈1600×500)" has={!!cfg.bannerImage} onPick={f => pick(f, u => patch('bannerImage', u))} onClear={() => patch('bannerImage', '')} />
              {cfg.bannerImage && <img className="ynBannerSample" src={cfg.bannerImage} alt="" />}
              <span className="ynHint">Or pick a ready-made Chiikawa-style banner (you can still upload your own any time):</span>
              <div className="ynBannerGrid">{READY_BANNERS.map(b => <button type="button" key={b.src} className={'ynBannerPick' + (cfg.bannerImage === b.src ? ' on' : '')} onClick={() => patch('bannerImage', b.src)} title={b.label}><img src={b.src} alt={b.label} /><small>{b.label}</small></button>)}</div></div>

            <h4>Dark mode</h4>
            <Select label="This theme in dark mode" value={di.mode} onChange={v => patchIn('dark', 'mode', v)}>
              <option value="off">Light only (customer can still switch with a Dark-mode button)</option>
              <option value="auto">Follow the customer’s phone</option>
              <option value="on">Always dark</option>
            </Select>
            <p className="ynHint">Dark colours are made automatically from your accent colour. Pick your own below if you like. Use the “Preview” menu above the phone to check it.</p>
            <div className="ynGrid">
              {(['background', 'surface', 'text', 'muted', 'border'] as const).map(k => (
                <ColorField key={k} label={'Dark ' + ({ background: 'page', surface: 'cards', text: 'text', muted: 'soft text', border: 'borders' })[k]} value={di[k]} fallback={({ background: '#120b22', surface: '#1e1433', text: '#f5f0ff', muted: '#b9b0cc', border: '#3a2a5c' })[k]} onChange={v => patchIn('dark', k, v)} onClear={() => patchIn('dark', k, '')} />
              ))}
            </div>

            <h4>Shape &amp; fonts</h4>
            <RangeField label="Corner roundness (everything)" value={cfg.radius} min={0} max={40} onChange={v => patch('radius', v)} onClear={() => patch('radius', null)} />
            <label className="ynField"><span>Body font</span><select value={FONTS.some(f => f[0] === cfg.font) ? cfg.font : '__custom'} onChange={e => patch('font', e.target.value === '__custom' ? 'Inter' : e.target.value)}>{FONTS.map(([v, l]) => <option key={l} value={v}>{l}</option>)}<option value="__custom">Custom…</option></select></label>
            {!FONTS.some(f => f[0] === cfg.font) && <label className="ynField"><span>Custom font-family</span><input value={cfg.font} onChange={e => patch('font', e.target.value)} placeholder='"Quicksand", sans-serif' /></label>}
            <label className="ynField"><span>Heading font (optional)</span><select value={cfg.headingFont} onChange={e => patch('headingFont', e.target.value)}>{FONTS.map(([v, l]) => <option key={l} value={v}>{l}</option>)}</select></label>
            <label className="ynField"><span>Google Fonts link (for fonts marked “needs font URL”)</span><input value={cfg.fontUrl} onChange={e => patch('fontUrl', e.target.value.trim())} placeholder="https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap" /></label>
          </div>}

          {tab === 'Mascots' && <div className="ynPane">
            {cfg.preset !== 'chiikawa' ? <p className="ynHint">The mascots and moving clouds belong to the Chiikawa look. Open <b>Theme &amp; code</b> and choose <b>Chiikawa storybook</b> first.</p> : <>
              <p className="ynHint"><b>Drag any mascot in the preview</b> (the pink dashed boxes) to put it anywhere you like. Pick a place below to change its picture, make it bigger or smaller, or hide it.</p>
              <div className="ynMascotPicker">
                {MASCOT_GROUPS.map(g => <button type="button" key={g.key} className={'ynMascotChip' + (g.key === mg.key ? ' on' : '')} onClick={() => setMascotGroup(g.key)}>{g.label.replace(/\s*\(.*\)$/, '')}</button>)}
              </div>
              <div className="ynMascotPanel">
                <h4>{mg.label}</h4>
                <p className="ynHint">{mg.hint}</p>
                {MASCOT_SLOTS.filter(sl => sl.group === mg.key).map(sl => (
                  <div className="ynMascotSlot" key={sl.key}>
                    <img src={mImgs[sl.key] || sl.fallback} alt="" className={sl.key === 'clouds' ? 'wide' : ''} />
                    <div>
                      <b>{sl.label}</b>
                      <PicButton label="picture" has={!!mImgs[sl.key]} onPick={f => pick(f, u => setMImg(sl.key, u), sl.key === 'clouds' ? 2400 : 900)} onClear={() => setMImg(sl.key, '')} />
                    </div>
                  </div>
                ))}
                {mg.key === 'clouds' && <RangeField label="Seconds for the clouds to cross (smaller = faster)" value={cfg.cloudSeconds ?? DEFAULT_CLOUD_SECONDS} min={15} max={240} unit="s" onChange={v => patch('cloudSeconds', v)} onClear={() => patch('cloudSeconds', null)} />}
                {mg.placeable && <>
                  <RangeField label={mg.key === 'clouds' ? 'Clouds higher ↔ lower' : 'Move left ↔ right'} value={mg.key === 'clouds' ? (mp.dy ?? 0) : (mp.dx ?? 0)} min={mg.key === 'clouds' ? -80 : -240} max={mg.key === 'clouds' ? 220 : 240} onChange={v => setMPos(mg.key === 'clouds' ? { dy: v } : { dx: v })} onClear={() => setMPos(mg.key === 'clouds' ? { dy: 0 } : { dx: 0 })} />
                  {mg.key !== 'clouds' && <RangeField label="Move up ↕ down" value={mp.dy ?? 0} min={-240} max={240} onChange={v => setMPos({ dy: v })} onClear={() => setMPos({ dy: 0 })} />}
                  <RangeField label="Size" value={mp.s ?? 100} min={30} max={250} unit="%" onChange={v => setMPos({ s: v })} onClear={() => setMPos({ s: 100 })} />
                  <Check checked={!!mp.hide} onChange={v => setMPos({ hide: v })}>Hide {mg.key === 'clouds' ? 'the clouds' : 'this mascot'}</Check>
                  {(mp.dx || mp.dy || mp.s) ? <button type="button" className="secondary" onClick={() => setMPos({ dx: 0, dy: 0, s: 100 })}><Undo2 size={14} /> Put it back where it was</button> : null}
                </>}
              </div>

              <h4>Put a mascot anywhere</h4>
              <p className="ynHint">Want an extra mascot picture on a page — or one that flies around, or opens a page when tapped? Add a free picture, then drag it wherever you like (it shows up in the <b>Elements</b> tab, where you can also give it an action or animation).</p>
              <label className="button secondary ynDropBtn"><ImagePlus size={15} /> Add a free mascot picture<input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (f) void pick(f, u => { addElement('image', { image: u, w: 120, x: 40, y: 30 }); setTab('Elements'); }); }} /></label>
              <button type="button" className="secondary ynDanger" onClick={() => { if (window.confirm('Put every mascot and the clouds back to the original pictures, places and sizes?')) setCfg((c: any) => ({ ...c, mascotImages: {}, mascotPos: {}, cloudSeconds: null })); }}><Undo2 size={14} /> Reset all mascots &amp; clouds</button>
            </>}
          </div>}

          {tab === 'Categories' && <div className="ynPane">
            <p className="ynHint"><b>Choose which categories this theme shows.</b> Customers with this theme only see the ticked categories and the products inside them. Tick nothing to show every category. The preview updates instantly (go to the Home page).</p>
            <div className="ynRow">
              <button type="button" className="secondary" onClick={() => patch('allowedCategories', ownCats.map(c => c.id))}>Select all</button>
              <button type="button" className="secondary" onClick={() => patch('allowedCategories', [])}>Show everything</button>
              <button type="button" className="secondary" onClick={() => patch('allowedCategories', ownCats.filter(c => !allowed.includes(c.id)).map(c => c.id))}>Invert</button>
            </div>
            <input value={catQuery} onChange={e => setCatQuery(e.target.value)} placeholder="Search categories…" />
            <div className="ynCatList">
              {shownCats.map(c => {
                const on = allowed.includes(c.id);
                return (
                  <label key={c.id} className={'ynCat' + (on ? ' on' : '')}>
                    <input type="checkbox" checked={on} onChange={e => patch('allowedCategories', e.target.checked ? [...allowed, c.id] : allowed.filter((x: string) => x !== c.id))} />
                    <span>{c.name}</span><small>{countIn(c.id)} product{countIn(c.id) === 1 ? '' : 's'}</small>
                  </label>
                );
              })}
              {!cats.length && <p className="ynHint">No active categories yet (Admin → Categories).</p>}
            </div>
            <p className="ynHint">{allowed.length ? `Showing ${allowed.length} of ${ownCats.length} categories.` : 'Showing all categories.'} Categories made only for this theme always show here.</p>
            <Check checked={!!cfg.hideUncategorized} onChange={v => patch('hideUncategorized', v)}>Also hide products that have no category</Check>
            <h4>Categories only for this theme</h4>
            <p className="ynHint">Normal customers never see these. They appear only while this theme is unlocked, next to all your normal categories and products. Products you put in them (Admin → Products) show up only here.</p>
            {!selected ? <p className="ynHint">Save the theme first, then add its own categories here.</p> : <>
              <div className="ynChecks">{cats.filter(c => c.theme_only_id === selected).map(c => <span className="ynOnlyChip" key={c.id}>{c.name}<small>{countIn(c.id)} product{countIn(c.id) === 1 ? '' : 's'}</small><button type="button" className="ynLink" onClick={() => releaseOnlyCat(c)}>show for everyone</button></span>)}{!cats.some(c => c.theme_only_id === selected) && <p className="ynHint">None yet.</p>}</div>
              <div className="ynRow"><input value={newOnly} onChange={e => setNewOnly(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addOnlyCat(newOnly); } }} placeholder="New category, e.g. Food" /><button type="button" className="secondary" onClick={() => addOnlyCat(newOnly)}><Plus size={15} /> Add</button></div>
              <div className="ynRow"><button type="button" className="secondary" onClick={() => addOnlyCat('Food')}>+ Food</button><button type="button" className="secondary" onClick={() => addOnlyCat('Drink')}>+ Drink</button></div>
            </>}
            <h4>Banners shown in this theme</h4>
            <p className="ynHint">Tick none to show all active banners (a theme banner picture overrides these).</p>
            <div className="ynChecks">{banners.map(b => <Check key={b.id} checked={cfg.bannerIds.includes(b.id)} onChange={v => patch('bannerIds', v ? [...cfg.bannerIds, b.id] : cfg.bannerIds.filter((x: string) => x !== b.id))}>{b.title || 'Untitled banner'}</Check>)}{!banners.length && <p className="ynHint">No active banners yet (Admin → Banners).</p>}</div>
          </div>}

          {tab === 'Delivery' && <div className="ynPane">
            <p className="ynHint"><b>How customers give their delivery location.</b> Choose the style for customers who use this theme's secret code.</p>
            <div className="ynCatList">
              <label className={'ynCat' + ((cfg.delivery?.locationMode || 'manual') === 'manual' ? ' on' : '')}>
                <input type="radio" name="locMode" checked={(cfg.delivery?.locationMode || 'manual') === 'manual'} onChange={() => patchIn('delivery', 'locationMode', 'manual')} />
                <span>City / province form</span><small>Type phone + city or province (works for orders from other countries)</small>
              </label>
              <label className={'ynCat' + (cfg.delivery?.locationMode === 'map' ? ' on' : '')}>
                <input type="radio" name="locMode" checked={cfg.delivery?.locationMode === 'map'} onChange={() => patchIn('delivery', 'locationMode', 'map')} />
                <span>Map checkout (like Grab Food / Express)</span><small>Pin on a map, delivery price by distance, and the customer watches the driver live</small>
              </label>
            </div>
            {cfg.delivery?.locationMode === 'map' && <>
              <h4>Categories that use the map</h4>
              <p className="ynHint">Map checkout only appears when <b>every item</b> in the cart is from a ticked category. Anything else (for example items ordered from another country) keeps the city / province form. These switches save instantly and are shared with Admin → Categories.</p>
              <div className="ynCatList">
                {cats.map((c: any) => (
                  <label key={c.id} className={'ynCat' + (mapFlags[c.id] ? ' on' : '')}>
                    <input type="checkbox" checked={!!mapFlags[c.id]} onChange={e => toggleMapCat(c.id, e.target.checked)} />
                    <span>{c.name}</span><small>{mapFlags[c.id] ? 'Map + live tracking' : 'City / province'}</small>
                  </label>
                ))}
                {!cats.length && <p className="ynHint">No active categories yet (Admin → Categories).</p>}
              </div>
              {mapMsg && <p className="ynHint" style={{ color: '#b91c1c' }}>{mapMsg}</p>}
              <p className="ynHint">Set delivery prices, your store location and the driver picture in <b>Admin → Settings</b>. Start live tracking from <b>Admin → Orders</b> on the delivery phone.</p>
            </>}
            <p className="ynHint">Remember to press <b>Save</b> so the style is stored with the theme.</p>
          </div>}

          {tab === 'Products' && <div className="ynPane">
            <p className="ynHint"><b>Product picture backgrounds.</b> Cuts the background out of product photos shot on a plain background (white, grey, any single colour) and, if you want, puts a colour behind them. This happens in the customer’s browser; your original photos are never changed.</p>
            <Select label="Product pictures" value={pi.mode} onChange={v => patchIn('productImage', 'mode', v)}>
              <option value="original">Keep photos as they are</option>
              <option value="remove">Remove the background</option>
              <option value="color">Remove it + one colour behind</option>
              <option value="random">Remove it + a random colour for each product</option>
              <option value="gradient">Remove it + a random gradient for each product</option>
            </Select>
            {pi.mode === 'color' && <ColorField label="Colour behind the product" value={pi.color} fallback="#ffe0ec" onChange={v => patchIn('productImage', 'color', v)} />}
            {(pi.mode === 'random' || pi.mode === 'gradient') && <>
              <Select label="Colour set" value={pi.palette} onChange={v => patchIn('productImage', 'palette', v)}><option value="pastel">Soft pastels</option><option value="vivid">Bright &amp; bold</option><option value="dark">Deep &amp; moody</option><option value="custom">My own colours</option></Select>
              {pi.palette === 'custom' && <div className="ynField"><span>Your colours</span>
                <div className="ynRow">{(pi.customColors as string[]).map((c, i) => <input key={i} type="color" className="ynSw" value={c} onChange={e => patchIn('productImage', 'customColors', pi.customColors.map((x: string, k: number) => (k === i ? e.target.value : x)))} />)}
                  <button type="button" className="secondary" onClick={() => patchIn('productImage', 'customColors', [...pi.customColors, '#ffd6e0'])}><Plus size={14} /></button>
                  {pi.customColors.length > 0 && <button type="button" className="ynLink" onClick={() => patchIn('productImage', 'customColors', pi.customColors.slice(0, -1))}>remove last</button>}</div></div>}
              <button type="button" className="ynSurprise" onClick={() => patchIn('productImage', 'seed', (pi.seed || 0) + 1)}><Shuffle size={16} /> Shuffle all the colours</button>
              <p className="ynHint">Each product keeps its colour until you shuffle. Add a “Shuffle product colours” button in Elements so customers can reshuffle too.</p>
            </>}
            {pi.mode !== 'original' && <>
              <RangeField label="Background removal strength" value={pi.tolerance} min={5} max={90} unit="" onChange={v => patchIn('productImage', 'tolerance', v)} />
              <p className="ynHint">Higher removes more, but can start eating light-coloured products. Lower if parts of the product disappear.</p>
              <Check checked={!!pi.fillHoles} onChange={v => patchIn('productImage', 'fillHoles', v)}>Also clear holes inside the product (rings, handles)</Check>
              <Select label="Picture fit" value={pi.fit} onChange={v => patchIn('productImage', 'fit', v)}><option value="contain">Show the whole product (sticker look)</option><option value="cover">Fill the card (crop)</option></Select>
              {pi.fit === 'contain' && <RangeField label="Space around the product" value={pi.padding} min={0} max={40} onChange={v => patchIn('productImage', 'padding', v)} />}
              <p className="ynHint">Photos with busy or multi-colour backgrounds can’t be cut out automatically — those are shown unchanged. Tip: in <b>Admin → Products</b> you can also save a cut-out permanently with the ✂️ button.</p>
            </>}
          </div>}

          {tab === 'Elements' && <div className="ynPane">
            <p className="ynHint">Add buttons, text and pictures on top of the store. <b>Drag them in the preview</b> to place them, tap the pink corner to resize. Give a button an action, a look, and even make it fly around the screen.</p>
            <div className="ynRow">
              <button type="button" onClick={() => addElement('button')}><Plus size={15} /> Button</button>
              <button type="button" className="secondary" onClick={() => addElement('text')}><Plus size={15} /> Text</button>
              <label className="button secondary ynDropBtn"><ImagePlus size={15} /> Picture<input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (f) void pick(f, u => addElement('image', { image: u })); }} /></label>
            </div>
            {elements.length > 0 && <div className="ynElList">
              {elements.map((x, i) => (
                <div key={x.id} className={'ynElRow' + (x.id === elementId ? ' on' : '')}>
                  <button type="button" className="ynElPick" onClick={() => setElementId(x.id === elementId ? '' : x.id)}>{elLabel(x, i)}</button>
                  <button type="button" className="icon" title="Move forward" onClick={() => moveEl(x.id, 1)}><ArrowUp size={14} /></button>
                  <button type="button" className="icon" title="Move backward" onClick={() => moveEl(x.id, -1)}><ArrowDown size={14} /></button>
                  <button type="button" className="icon" title="Duplicate" onClick={() => dupEl(x)}><Copy size={14} /></button>
                  <button type="button" className="icon danger" title="Delete" onClick={() => delEl(x.id)}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>}
            {!elements.length && <p className="ynHint">Nothing here yet — add a button to start.</p>}

            {el && <div className="ynElement">
              <h4>Content</h4>
              <label className="ynField"><span>Name (only you see this)</span><input value={el.name} onChange={e => patchEl(el.id, { name: e.target.value })} placeholder="e.g. Khmer button" /></label>
              {el.type !== 'image' && <label className="ynField"><span>{el.type === 'button' ? 'Button label' : 'Text'}</span><textarea rows={el.type === 'button' ? 1 : 3} value={el.text} onChange={e => patchEl(el.id, { text: e.target.value })} /></label>}
              {el.type !== 'image' && <label className="ynField"><span>Emoji / icon (optional)</span><input value={el.icon} maxLength={4} onChange={e => patchEl(el.id, { icon: e.target.value })} placeholder="🎁" /></label>}
              <div className="ynField"><span>{el.type === 'image' ? 'Picture' : el.type === 'button' ? 'Button picture' : 'Picture'}</span>
                <PicButton label="picture" has={!!el.image} onPick={f => pick(f, u => patchEl(el.id, { image: u, variant: el.type === 'button' && el.variant !== 'image' ? 'image' : el.variant }))} onClear={() => patchEl(el.id, { image: '', variant: el.variant === 'image' ? 'gradient' : el.variant })} /></div>
              {el.type !== 'image' && el.image && <>
                <Select label="Use the picture as" value={el.variant === 'image' ? 'background' : 'icon'} onChange={v => v === 'background' ? patchEl(el.id, { variant: 'image', imageMode: 'background' }) : patchEl(el.id, { variant: el.variant === 'image' ? 'gradient' : el.variant, imageMode: 'icon' })}>
                  <option value="background">The whole button face</option><option value="icon">A small icon next to the text</option></Select>
                {el.variant === 'image' && <Select label="Picture fit" value={el.fit} onChange={v => patchEl(el.id, { fit: v as any })}><option value="cover">Fill (crop)</option><option value="contain">Show whole picture</option></Select>}
                {el.variant !== 'image' && <RangeField label="Icon size" value={el.imageSize} min={12} max={80} onChange={v => patchEl(el.id, { imageSize: v })} />}
              </>}
              {el.type === 'image' && <Select label="Picture fit" value={el.fit} onChange={v => patchEl(el.id, { fit: v as any })}><option value="contain">Show whole picture</option><option value="cover">Fill (crop)</option></Select>}

              <h4>When someone taps it</h4>
              <label className="ynField"><span>Action</span>
                <select value={el.action.type} onChange={e => patchEl(el.id, { action: { ...el.action, type: e.target.value as any, value: '' } })}>
                  {actionGroups.map(g => <optgroup key={g} label={g}>{ACTION_TYPES.filter(a => a.group === g).map(a => <option key={a.type} value={a.type}>{a.label}</option>)}</optgroup>)}
                </select></label>
              {actionNeeds === 'page' && <Select label="Which page" value={el.action.value || '/'} onChange={v => patchEl(el.id, { action: { ...el.action, value: v } })}>{STORE_PAGES.map(p => <option key={p.path} value={p.path}>{p.label}</option>)}</Select>}
              {actionNeeds === 'category' && <Select label="Which category" value={el.action.value} onChange={v => patchEl(el.id, { action: { ...el.action, value: v } })}><option value="">All categories</option>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
              {actionNeeds === 'product' && <Select label="Which product" value={el.action.value} onChange={v => patchEl(el.id, { action: { ...el.action, value: v } })}><option value="">Choose a product…</option>{prods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}
              {actionNeeds === 'url' && <><label className="ynField"><span>Web link</span><input value={el.action.value} onChange={e => patchEl(el.id, { action: { ...el.action, value: e.target.value } })} placeholder="https://…" /></label><Check checked={el.action.newTab !== false} onChange={v => patchEl(el.id, { action: { ...el.action, newTab: v } })}>Open in a new tab</Check></>}
              {actionNeeds === 'phone' && <label className="ynField"><span>Phone number</span><input value={el.action.value} onChange={e => patchEl(el.id, { action: { ...el.action, value: e.target.value } })} placeholder="+855 12 345 678" /></label>}
              {actionNeeds === 'handle' && <label className="ynField"><span>Telegram username</span><input value={el.action.value} onChange={e => patchEl(el.id, { action: { ...el.action, value: e.target.value } })} placeholder="@yn_studio" /></label>}
              {actionNeeds === 'text' && <label className="ynField"><span>{el.action.type === 'search' ? 'Word to search for' : 'Message'}</span><input value={el.action.value} onChange={e => patchEl(el.id, { action: { ...el.action, value: e.target.value } })} /></label>}
              {actionNeeds === 'lang' && <Select label="Switch to" value={el.action.value || 'toggle'} onChange={v => patchEl(el.id, { action: { ...el.action, value: v === 'toggle' ? '' : v } })}><option value="toggle">Swap Khmer ⇄ English</option><option value="km">Khmer (ខ្មែរ)</option><option value="en">English</option></Select>}
              {actionNeeds === 'dark' && <Select label="Mode" value={el.action.value || 'toggle'} onChange={v => patchEl(el.id, { action: { ...el.action, value: v === 'toggle' ? '' : v } })}><option value="toggle">Swap dark ⇄ light</option><option value="on">Dark</option><option value="off">Light</option></Select>}

              <h4>Look</h4>
              {el.type !== 'image' && <>
                <Select label="Style" value={el.variant === 'image' ? 'image' : el.variant} onChange={v => patchEl(el.id, { variant: v as any })}>
                  <option value="gradient">Gradient</option><option value="solid">Solid colour</option><option value="outline">Outline</option><option value="glass">Frosted glass</option><option value="plain">No background (text only)</option>{el.image && <option value="image">Picture</option>}
                </Select>
                <div className="ynGrid">
                  {(el.variant === 'solid' || el.variant === 'gradient') && <ColorField label={el.variant === 'gradient' ? 'Colour 1' : 'Fill'} value={el.background} fallback="#7c3aed" onChange={v => patchEl(el.id, { background: v })} />}
                  {el.variant === 'gradient' && <ColorField label="Colour 2" value={el.gradientTo} fallback="#ec4899" onChange={v => patchEl(el.id, { gradientTo: v })} />}
                  <ColorField label="Text colour" value={el.color} fallback="#ffffff" onChange={v => patchEl(el.id, { color: v })} />
                  {(el.variant === 'outline' || el.borderWidth > 0) && <ColorField label="Border colour" value={el.borderColor} fallback="#ffffff" onChange={v => patchEl(el.id, { borderColor: v })} />}
                </div>
                {el.variant === 'gradient' && <RangeField label="Gradient direction" value={el.angle} min={0} max={360} unit="°" onChange={v => patchEl(el.id, { angle: v })} />}
                <div className="ynGrid">
                  <RangeField label="Text size" value={el.fontSize} min={10} max={72} onChange={v => patchEl(el.id, { fontSize: v })} />
                  <Select label="Text weight" value={el.fontWeight} onChange={v => patchEl(el.id, { fontWeight: Number(v) })}>{[400, 500, 600, 700, 800, 900].map(w => <option key={w} value={w}>{w}</option>)}</Select>
                </div>
              </>}
              <div className="ynField"><span>Shape</span>
                <div className="ynSeg">{([['Square', 4], ['Rounded', 16], ['Pill', 999]] as const).map(([l, r]) => <button key={l} type="button" className={el.radius === r ? 'on' : ''} onClick={() => patchEl(el.id, { radius: r })}>{l}</button>)}</div></div>
              <RangeField label="Corner roundness" value={Math.min(el.radius, 120)} min={0} max={120} onChange={v => patchEl(el.id, { radius: v })} />
              <div className="ynGrid">
                <RangeField label="Border width" value={el.borderWidth} min={0} max={10} onChange={v => patchEl(el.id, { borderWidth: v })} />
                <Select label="Shadow" value={el.shadow} onChange={v => patchEl(el.id, { shadow: v as any })}><option value="none">None</option><option value="soft">Soft</option><option value="medium">Medium</option><option value="strong">Strong</option><option value="glow">Glow</option></Select>
              </div>
              <Select label="When touched" value={el.hover} onChange={v => patchEl(el.id, { hover: v as any })}><option value="none">Nothing</option><option value="lift">Lift up</option><option value="grow">Grow</option><option value="glow">Glow</option></Select>

              <h4>Size &amp; position</h4>
              <p className="ynHint">Easiest: drag it in the preview. Fine-tune here.</p>
              <div className="ynGrid">
                <RangeField label="Left" value={el.x} min={-10} max={100} unit="%" step={0.5} onChange={v => patchEl(el.id, { x: v })} />
                <RangeField label="Top" value={el.y} min={-10} max={100} unit="%" step={0.5} onChange={v => patchEl(el.id, { y: v })} />
                <RangeField label="Width" value={el.w} min={24} max={700} onChange={v => patchEl(el.id, { w: v })} />
                <RangeField label={el.h ? 'Height' : 'Height (auto)'} value={el.h} min={0} max={700} onChange={v => patchEl(el.id, { h: v })} />
                <RangeField label="Turn" value={el.rotate} min={-180} max={180} unit="°" onChange={v => patchEl(el.id, { rotate: v })} />
                <RangeField label="See-through" value={el.opacity} min={10} max={100} unit="%" onChange={v => patchEl(el.id, { opacity: v })} />
              </div>

              <h4>Movement</h4>
              <Select label="Animation" value={el.anim.type} onChange={v => patchEl(el.id, { anim: { ...el.anim, type: v as any } })}>{ANIM_TYPES.map(a => <option key={a.type} value={a.type}>{a.label}</option>)}</Select>
              <p className="ynHint">{ANIM_TYPES.find(a => a.type === el.anim.type)?.hint} Switch to <b>Try it</b> above the preview to watch it.</p>
              {el.anim.type !== 'none' && <RangeField label="Speed" value={el.anim.speed} min={1} max={10} unit="" onChange={v => patchEl(el.id, { anim: { ...el.anim, speed: v } })} />}

              <h4>Where it shows</h4>
              <p className="ynHint">Tick pages to limit it. Tick none to show it on every page.</p>
              <div className="ynChecks">{ELEMENT_PAGES.map(p => <Check key={p.key} checked={el.pages.includes(p.key)} onChange={v => patchEl(el.id, { pages: v ? [...el.pages, p.key] : el.pages.filter(k => k !== p.key) })}>{p.label}</Check>)}</div>
            </div>}
          </div>}

          {tab === 'Parts' && <div className="ynPane">
            <label className="ynField"><span>Part to restyle (or tap it in the preview)</span>
              <select value={compKey} onChange={e => setCompKey(e.target.value)}>{groups.map(g => <optgroup key={g} label={g}>{COMPONENTS.filter(x => x.group === g).map(x => <option key={x.key} value={x.key}>{x.label}</option>)}</optgroup>)}</select></label>
            <div className="ynGrid">{def.props.filter(p => p !== 'hidden').map(field)}</div>
            {def.props.includes('hidden') && field('hidden')}
            <button type="button" className="secondary" onClick={() => setCfg((c: any) => { const components = { ...(c.components || {}) }; delete components[def.key]; return { ...c, components }; })}><Undo2 size={15} /> Reset “{def.label}”</button>
          </div>}

          {tab === 'Text' && <div className="ynPane">
            <p className="ynHint">Leave blank to keep the normal wording. (Customers who choose Khmer see the normal Khmer wording unless you type your own here.)</p>
            {TEXT_KEYS.map(t => <label key={t.key} className="ynField"><span>{t.label}</span>
              {t.multiline ? <textarea rows={2} value={cfg.texts[t.key] || ''} placeholder={t.fallback} onChange={e => patchIn('texts', t.key, e.target.value)} /> : <input value={cfg.texts[t.key] || ''} placeholder={t.fallback} onChange={e => patchIn('texts', t.key, e.target.value)} />}</label>)}
          </div>}

          {tab === 'Layout & pages' && <div className="ynPane">
            <label className="ynField"><span>Product columns</span><select value={cfg.layout.columns} onChange={e => patchIn('layout', 'columns', Number(e.target.value))}><option value={0}>Default (responsive)</option>{[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
            <label className="ynField"><span>Page width</span><select value={cfg.layout.maxWidth} onChange={e => patchIn('layout', 'maxWidth', Number(e.target.value))}><option value={0}>Default</option><option value={760}>Narrow</option><option value={960}>Medium</option><option value={1400}>Wide</option></select></label>
            <label className="ynField"><span>Bottom navigation</span><select value={cfg.layout.navStyle} onChange={e => patchIn('layout', 'navStyle', e.target.value)}><option value="floating">Floating (default)</option><option value="flat">Full-width bar</option><option value="hidden">Hidden</option></select></label>
            <p className="ynHint">To hide the hero, banners, categories or any other block, open <b>Parts</b>, pick it and tick “Hide”.</p>
            <h4>Page backgrounds</h4>
            {PAGES.map(p => { const ps = cfg.pageStyles[p.key] || {}; return (
              <div key={p.key} className="ynPageRow"><b>{p.label}</b>
                <ColorField label="Background" value={ps.background} fallback={cfg.background || DEFAULT_TOKENS.background} onChange={v => patchIn('pageStyles', p.key, { ...ps, background: v })} onClear={() => patchIn('pageStyles', p.key, { ...ps, background: '' })} />
                <PicButton label="picture" has={!!ps.backgroundImage} onPick={f => pick(f, u => patchIn('pageStyles', p.key, { ...ps, backgroundImage: u }))} onClear={() => patchIn('pageStyles', p.key, { ...ps, backgroundImage: '' })} />
              </div>); })}
          </div>}

          {tab === 'Advanced' && <div className="ynPane">
            <h4>Custom CSS (expert)</h4>
            <p className="ynHint">Applies only to the customer store while this theme is on. Example: <code>.product {'{'} transform: rotate(-1deg); {'}'}</code></p>
            <textarea className="ynCss" rows={8} spellCheck={false} value={cfg.customCss} onChange={e => patch('customCss', e.target.value)} placeholder=".hero { background: linear-gradient(135deg,#ffd1dc,#c3b1ff); }" />
            <button type="button" className="secondary" onClick={() => { if (confirm('Reset every color, font, layout, part style and text override in this theme? Elements, categories and product picture settings are kept.')) setCfg((c: any) => ({ ...blankTheme(), elements: c.elements, allowedCategories: c.allowedCategories, hideUncategorized: c.hideUncategorized, bannerIds: c.bannerIds, productImage: c.productImage, delivery: c.delivery })); }}><Undo2 size={15} /> Reset whole design to default</button>
          </div>}

          <div className="ynSave">
            <button type="button" disabled={busy} onClick={save}><Save size={16} /> {busy ? 'Saving…' : 'Save theme'}</button>
            <span className={'ynDirty ' + (dirty ? 'on' : '')}>{dirty ? 'Unsaved changes' : selected ? 'All changes saved' : 'Not saved yet'}</span>
            <a className="ynLink" href="/support" target="_blank" rel="noreferrer"><Eye size={14} /> Test with the code as a customer</a>
          </div>
          {msg && <p className="notice">{msg}</p>}
        </section>
      </div>
    </Shell>
  );
}
