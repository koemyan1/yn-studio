import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Dices, Eye, ImagePlus, MousePointerClick, Plus, Save, Smartphone, Tablet, Monitor, Trash2, Undo2, Wand2, Hand } from 'lucide-react';
import { supabase } from './supabase';
import {
  COMPONENTS, DEFAULT_TOKENS, PAGES, TEXT_KEYS, THEME_PRESETS,
  blankTheme, normalizeTheme, type PropName, type StyleProps,
} from './secretTheme';

type Shell = React.ComponentType<{ title: string; children: React.ReactNode }>;
const TABS = ['Theme & code', 'Colors & fonts', 'Layout', 'Parts', 'Text', 'Pages & content', 'Advanced'] as const;
type Tab = typeof TABS[number];

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
];

const readImage = (file: File | undefined, maxMb: number, onDone: (data: string) => void, onError: (m: string) => void) => {
  if (!file) return;
  if (file.size > maxMb * 1024 * 1024) { onError(`Please use an image under ${maxMb} MB so the theme stays small.`); return; }
  const r = new FileReader();
  r.onload = () => onDone(String(r.result || ''));
  r.readAsDataURL(file);
};

function ColorField({ label, value, fallback, onChange, onClear }: { label: string; value?: string; fallback: string; onChange: (v: string) => void; onClear: () => void }) {
  return (
    <label className="ynField ynColor">
      <span>{label}</span>
      <div><input type="color" value={value || fallback} onChange={e => onChange(e.target.value)} /><code>{value || 'default'}</code>{value ? <button type="button" className="ynLink" onClick={onClear}>reset</button> : null}</div>
    </label>
  );
}
function RangeField({ label, value, min, max, unit = 'px', onChange, onClear }: { label: string; value?: number | null; min: number; max: number; unit?: string; onChange: (v: number) => void; onClear: () => void }) {
  const set = value != null;
  return (
    <label className="ynField">
      <span>{label}: <b>{set ? value + unit : 'default'}</b>{set ? <button type="button" className="ynLink" onClick={onClear}>reset</button> : null}</span>
      <input type="range" min={min} max={max} value={set ? value! : min} onChange={e => onChange(Number(e.target.value))} />
    </label>
  );
}

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
  const [banners, setBanners] = useState<any[]>([]);
  const [productId, setProductId] = useState('');
  const [frameSrc, setFrameSrc] = useState('/');
  const [curPath, setCurPath] = useState('/');
  const [device, setDevice] = useState<'phone' | 'tablet' | 'desktop'>('phone');
  const [selectMode, setSelectMode] = useState(true);
  const [ready, setReady] = useState(false);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const controls = useRef<HTMLDivElement | null>(null);

  const dirty = useMemo(() => JSON.stringify({ n: name, c: code, a: active, cfg }) !== snapshot, [name, code, active, cfg, snapshot]);

  async function loadThemes() {
    const r = await supabase.from('site_themes').select('*').order('created_at', { ascending: false });
    if (r.error) { setMsg('Could not load themes: ' + r.error.message + ' — run supabase-secret-themes-and-store-location.sql first.'); return; }
    setThemes(r.data || []);
  }
  useEffect(() => {
    void loadThemes();
    (async () => {
      const [c, b, p] = await Promise.all([
        supabase.from('categories').select('id,name').eq('status', 'active').order('name'),
        supabase.from('banners').select('id,title,image_url').eq('active', true).order('sort_order'),
        supabase.from('products').select('id').eq('status', 'published').order('created_at', { ascending: false }).limit(1),
      ]);
      setCats(c.data || []); setBanners(b.data || []); setProductId(p.data?.[0]?.id || '');
    })();
  }, []);

  // Push the unsaved draft into the live storefront preview.
  useEffect(() => {
    if (!ready) return;
    frame.current?.contentWindow?.postMessage({ type: 'yn-theme-draft', config: cfg, selectMode, selectedKey: tab === 'Parts' ? compKey : '' }, window.location.origin);
  }, [cfg, ready, selectMode, compKey, tab]);

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
    if (!confirm('Replace the colors, fonts and part styles with "' + p.label + '"? Your custom elements, banners and category choices are kept.')) return;
    setCfg((c: any) => ({ ...blankTheme(), ...p.cfg, elements: c.elements, allowedCategories: c.allowedCategories, bannerIds: c.bannerIds, texts: c.texts }));
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

  const def = COMPONENTS.find(x => x.key === compKey) || COMPONENTS[0];
  const cp: StyleProps = cfg.components?.[def.key] || {};
  const groups = Array.from(new Set(COMPONENTS.map(x => x.group)));
  const el = (cfg.elements || []).find((x: any) => x.id === elementId);
  const patchEl = (id: string, k: string, v: any) => patch('elements', cfg.elements.map((x: any) => x.id === id ? { ...x, [k]: v } : x));
  const addElement = (type: 'text' | 'image', image = '') => {
    const id = crypto.randomUUID();
    patch('elements', [...cfg.elements, { id, type, text: type === 'text' ? 'Your custom text' : '', image, x: 8, y: 12, w: 42, h: 64, color: cfg.text || DEFAULT_TOKENS.text, background: 'transparent', radius: 12, fontSize: 22, z: cfg.elements.length + 1 }]);
    setElementId(id);
  };
  const pageOptions = [...PAGES.filter(p => p.key !== 'products').map(p => ({ label: p.label, path: p.path })), ...(productId ? [{ label: 'Product page', path: '/product/' + productId }] : []), { label: 'Customer service', path: '/support' }];
  const widths = { phone: 390, tablet: 768, desktop: 0 };

  const field = (prop: PropName) => {
    const k = def.key;
    switch (prop) {
      case 'background': return <ColorField key={prop} label="Background" value={cp.background} fallback="#ffffff" onChange={v => setProp(k, prop, v)} onClear={() => setProp(k, prop, '')} />;
      case 'color': return <ColorField key={prop} label="Text / icon color" value={cp.color} fallback="#241b35" onChange={v => setProp(k, prop, v)} onClear={() => setProp(k, prop, '')} />;
      case 'borderColor': return <ColorField key={prop} label="Border color" value={cp.borderColor} fallback="#e9e2f4" onChange={v => setProp(k, prop, v)} onClear={() => setProp(k, prop, '')} />;
      case 'borderWidth': return <RangeField key={prop} label="Border width" value={cp.borderWidth} min={0} max={8} onChange={v => setProp(k, prop, v)} onClear={() => setProp(k, prop, '')} />;
      case 'radius': return <RangeField key={prop} label="Corner roundness" value={cp.radius} min={0} max={60} onChange={v => setProp(k, prop, v)} onClear={() => setProp(k, prop, '')} />;
      case 'fontSize': return <RangeField key={prop} label="Text size" value={cp.fontSize} min={10} max={48} onChange={v => setProp(k, prop, v)} onClear={() => setProp(k, prop, '')} />;
      case 'padding': return <RangeField key={prop} label="Inner spacing" value={cp.padding} min={0} max={48} onChange={v => setProp(k, prop, v)} onClear={() => setProp(k, prop, '')} />;
      case 'opacity': return <RangeField key={prop} label="Opacity" value={cp.opacity} min={10} max={100} unit="%" onChange={v => setProp(k, prop, v)} onClear={() => setProp(k, prop, '')} />;
      case 'fontWeight': return <label key={prop} className="ynField"><span>Text weight</span><select value={cp.fontWeight || ''} onChange={e => setProp(k, prop, e.target.value ? Number(e.target.value) : '')}><option value="">Default</option>{[400, 500, 600, 700, 800, 900].map(w => <option key={w} value={w}>{w}</option>)}</select></label>;
      case 'shadow': return <label key={prop} className="ynField"><span>Shadow</span><select value={cp.shadow || ''} onChange={e => setProp(k, prop, e.target.value)}><option value="">Default</option><option value="none">None</option><option value="soft">Soft</option><option value="medium">Medium</option><option value="strong">Strong</option></select></label>;
      case 'fit': return <label key={prop} className="ynField"><span>Image fit</span><select value={cp.fit || ''} onChange={e => setProp(k, prop, e.target.value)}><option value="">Default</option><option value="cover">Fill (crop)</option><option value="contain">Show whole image</option></select></label>;
      case 'backgroundImage': return (
        <div key={prop} className="ynField"><span>Background picture</span>
          <label className="ynDrop"><ImagePlus size={16} /> {cp.backgroundImage ? 'Replace picture' : 'Upload picture'}<input type="file" accept="image/*" onChange={e => { readImage(e.target.files?.[0], 1.5, d => setProp(k, prop, d), setMsg); e.currentTarget.value = ''; }} /></label>
          {cp.backgroundImage ? <button type="button" className="ynLink" onClick={() => setProp(k, prop, '')}>remove picture</button> : null}
        </div>);
      case 'hidden': return <label key={prop} className="ynCheck"><input type="checkbox" checked={!!cp.hidden} onChange={e => setProp(k, prop, e.target.checked)} /> Hide this part completely</label>;
      default: return null;
    }
  };

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
            <div className="ynSeg">
              <button type="button" className={selectMode ? 'on' : ''} onClick={() => setSelectMode(true)}><MousePointerClick size={15} /> Select parts</button>
              <button type="button" className={!selectMode ? 'on' : ''} onClick={() => setSelectMode(false)}><Hand size={15} /> Try it</button>
            </div>
          </div>
          <p className="ynHint">{selectMode ? 'Tap anything in the store to restyle it. Links are paused while selecting.' : 'Interact mode: browse the real store. Switch back to Select to edit what you see.'}  <code>{curPath}</code></p>
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
            <label className="ynCheck"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Code is active (customers can unlock this theme)</label>
            <h4><Wand2 size={15} /> Start from a look</h4>
            <div className="ynPresets">{THEME_PRESETS.map(p => <button key={p.id} type="button" className="secondary" onClick={() => applyPreset(p.id)}><span className="ynSwatch">{p.swatch.map(s => <i key={s} style={{ background: s }} />)}</span>{p.label}</button>)}</div>
            <div className="ynRow"><button type="button" className="secondary" onClick={newTheme}><Plus size={15} /> New</button>{selected && <button type="button" className="secondary" onClick={duplicate}><Copy size={15} /> Duplicate</button>}{selected && <button type="button" className="secondary" onClick={removeTheme}><Trash2 size={15} /> Delete</button>}</div>
          </div>}

          {tab === 'Colors & fonts' && <div className="ynPane">
            <p className="ynHint">Empty = the normal YN Studio look. Change only what you want.</p>
            <div className="ynGrid">{['background', 'surface', 'text', 'muted', 'border', 'accent', 'accent2'].map(token)}</div>
            <RangeField label="Corner roundness (everything)" value={cfg.radius} min={0} max={40} onChange={v => patch('radius', v)} onClear={() => patch('radius', null)} />
            <label className="ynField"><span>Body font</span><select value={FONTS.some(f => f[0] === cfg.font) ? cfg.font : '__custom'} onChange={e => patch('font', e.target.value === '__custom' ? 'Inter' : e.target.value)}>{FONTS.map(([v, l]) => <option key={l} value={v}>{l}</option>)}<option value="__custom">Custom…</option></select></label>
            {!FONTS.some(f => f[0] === cfg.font) && <label className="ynField"><span>Custom font-family</span><input value={cfg.font} onChange={e => patch('font', e.target.value)} placeholder='"Quicksand", sans-serif' /></label>}
            <label className="ynField"><span>Heading font (optional)</span><select value={cfg.headingFont} onChange={e => patch('headingFont', e.target.value)}>{FONTS.map(([v, l]) => <option key={l} value={v}>{l}</option>)}</select></label>
            <label className="ynField"><span>Google Fonts link (for fonts marked “needs font URL”)</span><input value={cfg.fontUrl} onChange={e => patch('fontUrl', e.target.value.trim())} placeholder="https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap" /></label>
            <div className="ynField"><span>Page wallpaper</span>
              <label className="ynDrop"><ImagePlus size={16} /> {cfg.backgroundImage ? 'Replace wallpaper' : 'Upload wallpaper'}<input type="file" accept="image/*" onChange={e => { readImage(e.target.files?.[0], 2, d => patch('backgroundImage', d), setMsg); e.currentTarget.value = ''; }} /></label>
              {cfg.backgroundImage && <button type="button" className="ynLink" onClick={() => patch('backgroundImage', '')}>remove wallpaper</button>}</div>
            <div className="ynField"><span>Home banner picture (replaces the normal banners in this theme)</span>
              <label className="ynDrop"><ImagePlus size={16} /> {cfg.bannerImage ? 'Replace banner' : 'Upload banner (≈1600×500)'}<input type="file" accept="image/*" onChange={e => { readImage(e.target.files?.[0], 2, d => patch('bannerImage', d), setMsg); e.currentTarget.value = ''; }} /></label>
              {cfg.bannerImage && <><img className="ynBannerSample" src={cfg.bannerImage} alt="" /><button type="button" className="ynLink" onClick={() => patch('bannerImage', '')}>remove banner</button></>}</div>
          </div>}

          {tab === 'Layout' && <div className="ynPane">
            <label className="ynField"><span>Product columns</span><select value={cfg.layout.columns} onChange={e => patchIn('layout', 'columns', Number(e.target.value))}><option value={0}>Default (responsive)</option>{[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
            <label className="ynField"><span>Page width</span><select value={cfg.layout.maxWidth} onChange={e => patchIn('layout', 'maxWidth', Number(e.target.value))}><option value={0}>Default</option><option value={760}>Narrow</option><option value={960}>Medium</option><option value={1400}>Wide</option></select></label>
            <label className="ynField"><span>Bottom navigation</span><select value={cfg.layout.navStyle} onChange={e => patchIn('layout', 'navStyle', e.target.value)}><option value="floating">Floating (default)</option><option value="flat">Full-width bar</option><option value="hidden">Hidden</option></select></label>
            <p className="ynHint">To hide the hero, banners, categories or any other block, open <b>Parts</b>, pick it and tick “Hide”.</p>
          </div>}

          {tab === 'Parts' && <div className="ynPane">
            <label className="ynField"><span>Part to restyle (or tap it in the preview)</span>
              <select value={compKey} onChange={e => setCompKey(e.target.value)}>{groups.map(g => <optgroup key={g} label={g}>{COMPONENTS.filter(x => x.group === g).map(x => <option key={x.key} value={x.key}>{x.label}</option>)}</optgroup>)}</select></label>
            <div className="ynGrid">{def.props.filter(p => p !== 'hidden').map(field)}</div>
            {def.props.includes('hidden') && field('hidden')}
            <button type="button" className="secondary" onClick={() => setCfg((c: any) => { const components = { ...(c.components || {}) }; delete components[def.key]; return { ...c, components }; })}><Undo2 size={15} /> Reset “{def.label}”</button>
          </div>}

          {tab === 'Text' && <div className="ynPane">
            <p className="ynHint">Leave blank to keep the normal wording.</p>
            {TEXT_KEYS.map(t => <label key={t.key} className="ynField"><span>{t.label}</span>
              {t.multiline ? <textarea rows={2} value={cfg.texts[t.key] || ''} placeholder={t.fallback} onChange={e => patchIn('texts', t.key, e.target.value)} /> : <input value={cfg.texts[t.key] || ''} placeholder={t.fallback} onChange={e => patchIn('texts', t.key, e.target.value)} />}</label>)}
          </div>}

          {tab === 'Pages & content' && <div className="ynPane">
            <h4>Page backgrounds</h4>
            {PAGES.map(p => { const ps = cfg.pageStyles[p.key] || {}; return (
              <div key={p.key} className="ynPageRow"><b>{p.label}</b>
                <ColorField label="Background" value={ps.background} fallback={cfg.background || DEFAULT_TOKENS.background} onChange={v => patchIn('pageStyles', p.key, { ...ps, background: v })} onClear={() => patchIn('pageStyles', p.key, { ...ps, background: '' })} />
                <label className="ynDrop"><ImagePlus size={15} /> {ps.backgroundImage ? 'Replace picture' : 'Picture'}<input type="file" accept="image/*" onChange={e => { readImage(e.target.files?.[0], 1.5, d => patchIn('pageStyles', p.key, { ...ps, backgroundImage: d }), setMsg); e.currentTarget.value = ''; }} /></label>
                {ps.backgroundImage && <button type="button" className="ynLink" onClick={() => patchIn('pageStyles', p.key, { ...ps, backgroundImage: '' })}>remove</button>}
              </div>); })}
            <h4>Categories shown in this theme</h4>
            <p className="ynHint">Tick none to show every category.</p>
            <div className="ynChecks">{cats.map(c => <label key={c.id} className="ynCheck"><input type="checkbox" checked={cfg.allowedCategories.includes(c.id)} onChange={e => patch('allowedCategories', e.target.checked ? [...cfg.allowedCategories, c.id] : cfg.allowedCategories.filter((x: string) => x !== c.id))} />{c.name}</label>)}</div>
            <h4>Banners shown in this theme</h4>
            <p className="ynHint">Tick none to show all active banners (a theme banner picture overrides these).</p>
            <div className="ynChecks">{banners.map(b => <label key={b.id} className="ynCheck"><input type="checkbox" checked={cfg.bannerIds.includes(b.id)} onChange={e => patch('bannerIds', e.target.checked ? [...cfg.bannerIds, b.id] : cfg.bannerIds.filter((x: string) => x !== b.id))} />{b.title || 'Untitled banner'}</label>)}{!banners.length && <p className="ynHint">No active banners yet (Admin → Banners).</p>}</div>
          </div>}

          {tab === 'Advanced' && <div className="ynPane">
            <h4>Floating text & pictures</h4>
            <div className="ynRow"><button type="button" className="secondary" onClick={() => addElement('text')}><Plus size={15} /> Text</button>
              <label className="button secondary ynDropBtn"><ImagePlus size={15} /> Picture<input type="file" accept="image/*" onChange={e => { readImage(e.target.files?.[0], 1.5, d => addElement('image', d), setMsg); e.currentTarget.value = ''; }} /></label></div>
            {(cfg.elements || []).length > 0 && <label className="ynField"><span>Edit element</span><select value={elementId} onChange={e => setElementId(e.target.value)}><option value="">Choose…</option>{cfg.elements.map((x: any, i: number) => <option key={x.id} value={x.id}>{x.type === 'image' ? 'Picture' : 'Text'} {i + 1}{x.text ? ' · ' + x.text.slice(0, 18) : ''}</option>)}</select></label>}
            {el && <div className="ynElement">
              {el.type === 'text' && <label className="ynField"><span>Text</span><textarea value={el.text} onChange={e => patchEl(el.id, 'text', e.target.value)} /></label>}
              <div className="ynGrid">
                <RangeField label="Left" value={el.x} min={0} max={95} unit="%" onChange={v => patchEl(el.id, 'x', v)} onClear={() => patchEl(el.id, 'x', 8)} />
                <RangeField label="Top" value={el.y} min={0} max={95} unit="%" onChange={v => patchEl(el.id, 'y', v)} onClear={() => patchEl(el.id, 'y', 12)} />
                <RangeField label="Width" value={el.w} min={5} max={100} unit="%" onChange={v => patchEl(el.id, 'w', v)} onClear={() => patchEl(el.id, 'w', 42)} />
                <RangeField label="Height" value={el.h} min={20} max={500} onChange={v => patchEl(el.id, 'h', v)} onClear={() => patchEl(el.id, 'h', 64)} />
                <RangeField label="Text size" value={el.fontSize} min={10} max={72} onChange={v => patchEl(el.id, 'fontSize', v)} onClear={() => patchEl(el.id, 'fontSize', 22)} />
                <RangeField label="Roundness" value={el.radius} min={0} max={60} onChange={v => patchEl(el.id, 'radius', v)} onClear={() => patchEl(el.id, 'radius', 12)} />
                <ColorField label="Text color" value={el.color} fallback="#241b35" onChange={v => patchEl(el.id, 'color', v)} onClear={() => patchEl(el.id, 'color', '#241b35')} />
                <ColorField label="Fill" value={/^#/.test(el.background) ? el.background : ''} fallback="#ffffff" onChange={v => patchEl(el.id, 'background', v)} onClear={() => patchEl(el.id, 'background', 'transparent')} />
              </div>
              <button type="button" className="secondary" onClick={() => { patch('elements', cfg.elements.filter((x: any) => x.id !== el.id)); setElementId(''); }}><Trash2 size={15} /> Remove element</button>
            </div>}
            <h4>Custom CSS (expert)</h4>
            <p className="ynHint">Applies only to the customer store while this theme is on. Example: <code>.product {'{'} transform: rotate(-1deg); {'}'}</code></p>
            <textarea className="ynCss" rows={8} spellCheck={false} value={cfg.customCss} onChange={e => patch('customCss', e.target.value)} placeholder=".hero { background: linear-gradient(135deg,#ffd1dc,#c3b1ff); }" />
            <button type="button" className="secondary" onClick={() => { if (confirm('Reset every color, font, layout, part style and text override in this theme?')) setCfg((c: any) => ({ ...blankTheme(), elements: c.elements, allowedCategories: c.allowedCategories, bannerIds: c.bannerIds })); }}><Undo2 size={15} /> Reset whole design to default</button>
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
