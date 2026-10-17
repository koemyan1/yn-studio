import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, Eye, EyeOff, Layers, MapPin, Moon, Palette, Pencil, Plus, Search, Sun, Tags, Trash2, Wand2 } from 'lucide-react';
import { supabase } from './supabase';
import { DEFAULT_TOKENS, blankTheme, darkTokens, normalizeTheme } from './secretTheme';
const DEFAULT_CODE = '__default_look__';

type Shell = React.ComponentType<{ title: string; children: React.ReactNode }>;
type Filter = 'all' | 'active' | 'inactive';
type Sort = 'new' | 'old' | 'name';

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const ok = (v: any, fb: string) => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim() : fb);
const safeUrl = (u: any) => (typeof u === 'string' && /^(https?:|data:image\/|\/)/i.test(u) ? u.replace(/["')\\]/g, '') : '');

function palette(cfg: any, dark: boolean) {
  const d = dark ? darkTokens(cfg) : null;
  return {
    bg: ok(d ? d.background : cfg.background, dark ? '#0d0a14' : DEFAULT_TOKENS.background),
    surface: ok(d ? d.surface : cfg.surface, dark ? '#1d1729' : DEFAULT_TOKENS.surface),
    text: ok(d ? d.text : cfg.text, dark ? '#f5f0ff' : DEFAULT_TOKENS.text),
    muted: ok(d ? d.muted : cfg.muted, dark ? '#b9b0cc' : DEFAULT_TOKENS.muted),
    border: ok(d ? d.border : cfg.border, dark ? '#30253d' : DEFAULT_TOKENS.border),
    accent: ok(cfg.accent, DEFAULT_TOKENS.accent),
    accent2: ok(cfg.accent2, ok(cfg.accent, DEFAULT_TOKENS.accent2)),
  };
}

function Preview({ cfg, dark }: { cfg: any; dark: boolean }) {
  const p = palette(cfg, dark);
  const radius = Math.max(4, Math.min(22, typeof cfg.radius === 'number' ? cfg.radius : 14));
  let bg: string = p.bg;
  if (cfg.bg?.type === 'gradient') bg = `linear-gradient(${Number(cfg.bg.angle) || 160}deg, ${ok(cfg.bg.from, '#ffd1e8')}, ${ok(cfg.bg.to, '#c7b8ff')})`;
  const img = safeUrl(cfg.backgroundImage);
  const style: any = {
    '--p-bg': p.bg, '--p-surface': p.surface, '--p-text': p.text, '--p-muted': p.muted, '--p-border': p.border,
    '--p-accent': p.accent, '--p-accent2': p.accent2, '--p-radius': radius + 'px',
    background: img ? `url("${img}") center/cover, ${p.bg}` : bg,
  };
  const glass = !!cfg.bg?.glass;
  const banner = safeUrl(cfg.bannerImage);
  const chii = cfg.preset === 'chiikawa';
  return (
    <div className={'thPrev' + (glass ? ' glass' : '') + (chii ? ' chii' : '')} style={style} aria-hidden="true">
      <div className="thPrevTop"><i className="thPrevTitle" /><span className="thPrevDot" /></div>
      <div className="thPrevSearch" />
      {banner && <div className="thPrevBanner" style={{ backgroundImage: `url("${banner}")` }} />}
      <div className="thPrevChips"><b className="on" /><b /><b /></div>
      <div className="thPrevGrid">
        <div><span /><i /><em /></div>
        <div><span /><i /><em /></div>
      </div>
      <div className="thPrevNav"><b className="on" /><b /><b /><b /></div>
    </div>
  );
}

export default function AdminThemes({ Shell }: { Shell: Shell }) {
  const [themes, setThemes] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [legacy, setLegacy] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('new');
  const [dark, setDark] = useState<Record<string, boolean>>({});
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState('');
  const [busyId, setBusyId] = useState('');
  const [defRow, setDefRow] = useState<any | null>(null);

  async function load() {
    setLoading(true);
    const [t, c, m] = await Promise.all([
      supabase.from('site_themes').select('*').order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('name'),
      supabase.from('category_theme_visibility').select('*'),
    ]);
    if (t.error) setMsg('Could not load themes: ' + t.error.message + ' — run supabase-secret-themes-and-store-location.sql first.');
    else setMsg('');
    setDefRow((t.data || []).find((x: any) => x.secret_code === DEFAULT_CODE) || null);
    setThemes((t.data || []).filter((x: any) => x.secret_code !== DEFAULT_CODE));
    setCats(c.data || []);
    const map: Record<string, string[]> = {};
    (m.data || []).forEach((x: any) => { (map[x.theme_id] ??= []).push(x.category_id); });
    setLegacy(map);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const rows = useMemo(() => themes.map(t => {
    const cfg = normalizeTheme(t.config);
    const catIds: string[] = cfg.allowedCategories.length ? cfg.allowedCategories : (legacy[t.id] || []);
    const names = catIds.map(id => cats.find(c => c.id === id)?.name).filter(Boolean) as string[];
    const own = cats.filter(c => c.theme_only_id === t.id).map(c => c.name as string);   // categories that exist only inside this theme
    return { t, cfg, names, catCount: catIds.length, own };
  }), [themes, cats, legacy]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = rows.filter(r => (filter === 'all' || (filter === 'active') === !!r.t.active) && (!s || (r.t.name || '').toLowerCase().includes(s) || (r.t.secret_code || '').toLowerCase().includes(s)));
    list = [...list].sort((a, b) => sort === 'name' ? (a.t.name || '').localeCompare(b.t.name || '') : sort === 'old' ? +new Date(a.t.created_at) - +new Date(b.t.created_at) : +new Date(b.t.created_at) - +new Date(a.t.created_at));
    return list;
  }, [rows, q, filter, sort]);

  const activeCount = themes.filter(t => t.active).length;
  const mapCount = rows.filter(r => r.cfg.delivery?.locationMode === 'map').length;

  async function toggleActive(t: any) {
    setBusyId(t.id); setMsg('');
    const r = await supabase.from('site_themes').update({ active: !t.active }).eq('id', t.id);
    setBusyId('');
    if (r.error) setMsg(r.error.message); else setThemes(list => list.map(x => x.id === t.id ? { ...x, active: !t.active } : x));
  }
  async function duplicate(t: any) {
    setBusyId(t.id); setMsg('');
    const suffix = Math.random().toString(36).slice(2, 6);
    const r = await supabase.from('site_themes').insert({ name: (t.name || 'Theme') + ' (copy)', secret_code: (t.secret_code || 'theme') + '-copy-' + suffix, active: false, config: t.config }).select().single();
    setBusyId('');
    if (r.error) { setMsg(r.error.message); return; }
    setThemes(list => [r.data, ...list]);
    setMsg('Duplicated as an inactive copy. Open it to change its secret code and name.');
  }
  async function remove(t: any) {
    if (!confirm('Delete "' + t.name + '"? Customers using it will return to the normal look.')) return;
    setBusyId(t.id); setMsg('');
    const r = await supabase.from('site_themes').delete().eq('id', t.id);
    setBusyId('');
    if (r.error) setMsg(r.error.message); else setThemes(list => list.filter(x => x.id !== t.id));
  }
  async function copyCode(t: any) {
    try { await navigator.clipboard.writeText(t.secret_code || ''); setCopied(t.id); window.setTimeout(() => setCopied(c => c === t.id ? '' : c), 1600); } catch { setMsg('Copy is not available in this browser.'); }
  }

  async function openDefault() {
    if (defRow) { window.location.href = '/admin/secret-code?theme=' + defRow.id; return; }
    setBusyId('default'); setMsg('');
    const r = await supabase.from('site_themes').insert({ name: 'Default look', secret_code: DEFAULT_CODE, active: false, config: blankTheme() }).select().single();
    setBusyId('');
    if (r.error) setMsg('Could not create the default look: ' + r.error.message + ' (run supabase-default-look.sql first).'); else window.location.href = '/admin/secret-code?theme=' + r.data.id;
  }
  async function toggleDefault() {
    if (!defRow) return;
    setBusyId('default'); setMsg('');
    const r = await supabase.from('site_themes').update({ active: !defRow.active }).eq('id', defRow.id);
    setBusyId('');
    if (r.error) setMsg(r.error.message); else setDefRow({ ...defRow, active: !defRow.active });
  }
  const fmt = (d: string) => { try { return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } };

  return (
    <Shell title="Themes">
      <div className="thPage">
        <section className="panel" style={{ marginBottom: 14 }}>
          <span className="eyebrow">EVERYONE · NO SECRET CODE NEEDED</span>
          <h2>Default look</h2>
          <p className="muted">Design the normal store the same way as a theme (pictures for the bottom bar, search bar, product cards, parts that stay on screen…). Customers without a secret theme see it. A customer's own secret theme still wins.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={openDefault} disabled={busyId === 'default'}><Pencil /> {defRow ? 'Edit default look' : 'Create default look'}</button>
            {defRow && <button type="button" className="secondary" onClick={toggleDefault} disabled={busyId === 'default'}>{defRow.active ? 'Turn off for everyone' : 'Turn on for everyone'}</button>}
          </div>
          {defRow && <p className="muted" style={{ marginTop: 8 }}>Status: <b>{defRow.active ? 'ON for everyone' : 'OFF (only saved, nobody sees it yet)'}</b></p>}
        </section>
        <div className="thStats">
          <div><b>{themes.length}</b><span>Total themes</span></div>
          <div><b>{activeCount}</b><span>Active</span></div>
          <div><b>{themes.length - activeCount}</b><span>Inactive</span></div>
          <div><b>{mapCount}</b><span>Map checkout</span></div>
        </div>

        <div className="thBar">
          <label className="thSearch"><Search /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by theme name or code" /></label>
          <div className="thSeg" role="tablist">
            {(['all', 'active', 'inactive'] as Filter[]).map(f => <button key={f} type="button" className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f === 'active' ? 'Active' : 'Inactive'}</button>)}
          </div>
          <select className="thSort" value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Sort themes">
            <option value="new">Newest first</option><option value="old">Oldest first</option><option value="name">Name A–Z</option>
          </select>
          <Link className="button" to="/admin/secret-code"><Plus /> New theme</Link>
        </div>

        {msg && <p className="notice">{msg}</p>}

        {loading ? (
          <div className="thGrid">{[0, 1, 2].map(i => <div key={i} className="thCard thSkel" />)}</div>
        ) : visible.length === 0 ? (
          <div className="thEmpty">
            <Palette />
            <b>{themes.length === 0 ? 'No themes yet' : 'No themes match your search'}</b>
            <span>{themes.length === 0 ? 'Create your first secret theme and it will show up here.' : 'Try a different word or switch the filter.'}</span>
            {themes.length === 0 && <Link className="button" to="/admin/secret-code"><Plus /> Create a theme</Link>}
          </div>
        ) : (
          <div className="thGrid">
            {visible.map(({ t, cfg, names, catCount, own }) => {
              const hasDark = cfg.dark?.mode && cfg.dark.mode !== 'off';
              const isDark = !!dark[t.id];
              const revealed = !!shown[t.id];
              const p = palette(cfg, false);
              const busy = busyId === t.id;
              return (
                <article className={'thCard' + (t.active ? '' : ' off')} key={t.id}>
                  <div className="thPrevWrap">
                    <Preview cfg={cfg} dark={isDark} />
                    <span className={'thBadge ' + (t.active ? 'on' : '')}>{t.active ? 'Active' : 'Inactive'}</span>
                    {hasDark && <button type="button" className="thDarkBtn" title={isDark ? 'Show light version' : 'Show dark version'} onClick={() => setDark(d => ({ ...d, [t.id]: !d[t.id] }))}>{isDark ? <Sun /> : <Moon />}</button>}
                  </div>

                  <div className="thBody">
                    <div className="thHead">
                      <div className="thName"><b>{t.name || 'Untitled theme'}</b><small>Created {fmt(t.created_at)}</small></div>
                      <button type="button" role="switch" aria-checked={!!t.active} disabled={busy} className={'catSwitch' + (t.active ? ' on' : '')} title={t.active ? 'Turn off' : 'Turn on'} onClick={() => toggleActive(t)}><i /></button>
                    </div>

                    <div className="thSwatches" title="Theme colours">
                      {[p.bg, p.surface, p.accent, p.accent2, p.text].map((c, i) => <i key={i} style={{ background: c }} />)}
                    </div>

                    <div className="thCode">
                      <span>Secret code</span>
                      <code>{revealed ? (t.secret_code || '—') : '••••••••'}</code>
                      <button type="button" className="thMini" title={revealed ? 'Hide code' : 'Show code'} onClick={() => setShown(s => ({ ...s, [t.id]: !s[t.id] }))}>{revealed ? <EyeOff /> : <Eye />}</button>
                      <button type="button" className="thMini" title="Copy code" onClick={() => copyCode(t)}>{copied === t.id ? <Check /> : <Copy />}</button>
                    </div>

                    <div className="thTags">
                      <span title={names.join(', ')}><Layers />{catCount === 0 ? 'All categories' : catCount + (catCount === 1 ? ' category' : ' categories')}</span>
                      {own.length > 0 && <span title={own.join(', ')}><Tags />{own.length} theme-only categor{own.length === 1 ? 'y' : 'ies'}</span>}
                      {cfg.elements.length > 0 && <span><Wand2 />{cfg.elements.length} element{cfg.elements.length === 1 ? '' : 's'}</span>}
                      {hasDark && <span><Moon />Dark {cfg.dark.mode}</span>}
                      {cfg.delivery?.locationMode === 'map' && <span><MapPin />Map checkout</span>}
                    </div>

                    {own.length > 0 && <p className="thCats">Only here: {own.join(' · ')}</p>}
                    {names.length > 0 && <p className="thCats">{names.slice(0, 4).join(' · ')}{names.length > 4 ? ' +' + (names.length - 4) : ''}</p>}

                    <div className="thActions">
                      <Link className="button" to={'/admin/secret-code?theme=' + t.id}><Pencil /> Edit</Link>
                      <button type="button" className="secondary" disabled={busy} onClick={() => duplicate(t)}><Copy /> Duplicate</button>
                      <button type="button" className="icon danger" disabled={busy} title="Delete theme" onClick={() => remove(t)}><Trash2 /></button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
