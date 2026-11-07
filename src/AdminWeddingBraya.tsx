import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Copy, Download, ExternalLink, Eye, Heart, ImagePlus, Plus, RotateCcw, Save, Send, Trash2, Users } from 'lucide-react';
import { supabase } from './supabase';
import { CustomerPicker, customerLabel, sendInviteTo } from './WeddingSend';
import type { Customer } from './WeddingSend';
import './admin-wedding-braya.css';

/* Admin → Wedding editor (/admin/wedding-editor): edit EVERY part of the "Braya" invitation theme with a live phone preview.
   The invitation itself is the static page /wedding/braya/ (shown here in an iframe with ?embed=1). Saved invitations live in
   wedding_invites (config = { theme: 'braya', braya: <content> }), the same table, draft/sent flow and guest links as the Envelope theme. */

type Shell = React.ComponentType<{ title: string; children: React.ReactNode }>;
type Doc = Record<string, any>;
type Row = { id: string; title: string; status: 'draft' | 'sent'; owner_id: string };

const TABS = ['Cover', 'Couple', 'Date', 'Schedule', 'Venue', 'Gallery', 'Gift', 'Thanks', 'Style', 'Save'] as const;
type Tab = typeof TABS[number];
const BASE = '/wedding/';

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
const getAt = (o: Doc, path: string): any => path.split('.').reduce((a: any, k) => a?.[k], o);
function setAt(o: Doc, path: string, v: any) {
  const keys = path.split('.'); const last = keys.pop() as string; let cur: any = o;
  for (const k of keys) cur = cur[k] ??= {};
  cur[last] = v;
}
/** Invitations saved before the gold update hold the old brown / grey text colours: swap them for the new gold defaults. */
const OLD_COLORS: Record<string, string> = { text: '#3d3a2e', muted: '#6f6a58', card: 'rgba(255,255,255,0.55)' };
const fixOld = (d: Doc, def: Doc): Doc => { const c = d.colors || (d.colors = {}); for (const k in OLD_COLORS) if (c[k] === OLD_COLORS[k]) c[k] = def.colors?.[k]; return d; };
const merge = (a: Doc, b: Doc): Doc => {
  for (const k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') merge(a[k], b[k]); else a[k] = b[k]; }
  return a;
};

/** The starting content lives in /wedding/braya/content.js (window.BRAYA_DEFAULT). A plain script tag is allowed by the site's CSP. */
function loadDefaults(): Promise<Doc | null> {
  return new Promise(resolve => {
    const w = window as any;
    const prev = w.BRAYA_DEFAULT;
    const s = document.createElement('script');
    s.src = BASE + 'braya/content.js?t=' + Date.now();
    s.onload = () => { const d = w.BRAYA_DEFAULT as Doc | undefined; w.BRAYA_DEFAULT = prev; s.remove(); resolve(d ? clone(d) : null); };
    s.onerror = () => { s.remove(); resolve(null); };
    document.head.appendChild(s);
  });
}

/** Shrink a picture in the browser, then upload it to the public `invitation-assets` bucket (falls back to embedding it if upload is not possible). */
async function prepareImage(file: File, max = 1400): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const im = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not open that picture')); i.src = url; });
    const k = Math.min(1, max / Math.max(im.width, im.height));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
    c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height);
    const png = /png/.test(file.type);
    return await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Could not process that picture'))), png ? 'image/png' : 'image/jpeg', 0.82));
  } finally { URL.revokeObjectURL(url); }
}
const blobToDataUrl = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = () => rej(new Error('Could not read picture')); r.readAsDataURL(b); });
async function uploadPicture(file: File): Promise<string> {
  const blob = await prepareImage(file);
  const ext = blob.type === 'image/png' ? 'png' : 'jpg';
  const path = `braya/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const up = await supabase.storage.from('invitation-assets').upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
  if (!up.error) return supabase.storage.from('invitation-assets').getPublicUrl(path).data.publicUrl;
  return blobToDataUrl(blob); // bucket missing / not allowed: keep the picture inside the invitation instead
}

export default function AdminWeddingBraya({ Shell }: { Shell: Shell }) {
  const [sp, setSp] = useSearchParams();
  const invParam = sp.get('i');
  const [base, setBase] = useState<Doc | null>(null);
  const [D, setD] = useState<Doc | null>(null);
  const [row, setRow] = useState<Row | null>(null);
  const [title, setTitle] = useState('');
  const [tab, setTab] = useState<Tab>('Cover');
  const [coverOpen, setCoverOpen] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [dirty, setDirty] = useState(false);
  const [list, setList] = useState<{ id: string; title: string; status: string }[]>([]);
  const frame = useRef<HTMLIFrameElement>(null);
  const justSaved = useRef<string | null>(null);
  const draftKey = 'wb-draft-' + (invParam || 'new');

  const say = useCallback((m: string) => { setMsg(m); window.setTimeout(() => setMsg(x => (x === m ? '' : x)), 2800); }, []);

  // ---- load defaults + (optionally) a saved invitation ----
  useEffect(() => {
    let live = true;
    if (invParam && justSaved.current === invParam) { justSaved.current = null; return; } // we just saved this one: nothing to reload
    (async () => {
      setErr(''); setD(null); setRow(null); setDirty(false);
      const def = await loadDefaults();
      if (!live) return;
      if (!def) { setErr('Could not load /wedding/braya/content.js.'); return; }
      for (const p of ['bgImage', 'cover.bgImage']) { const v = getAt(def, p); if (typeof v === 'string' && !/^(https?:|data:|\/)/.test(v)) setAt(def, p, BASE + 'braya/' + v); }
      setBase(def);
      let start = clone(def), t = '';
      if (invParam) {
        const r = await supabase.from('wedding_invites').select('id,title,status,owner_id,config').eq('id', invParam).maybeSingle();
        if (!live) return;
        if (r.error || !r.data) { setErr(r.error ? r.error.message : 'Invitation not found.'); return; }
        if ((r.data.config as any)?.theme !== 'braya') { setErr('This invitation uses the Envelope theme. Open it from Admin → Wedding → Edit.'); return; }
        merge(start, (r.data.config as any).braya || {});
        setRow({ id: r.data.id, title: r.data.title, status: r.data.status, owner_id: r.data.owner_id }); t = r.data.title || '';
      }
      try { const s = localStorage.getItem(draftKey); if (s) { start = merge(clone(def), JSON.parse(s)); setDirty(true); say('Restored your unsaved edits'); } } catch { /* ignore */ }
      fixOld(start, def); setD(start); setTitle(t || `${start.groom?.en || ''} & ${start.bride?.en || ''}`.trim());
    })();
    return () => { live = false; };
  }, [invParam, draftKey, say]);

  useEffect(() => {
    supabase.from('wedding_invites').select('id,title,status,theme:config->>theme').order('created_at', { ascending: false }).limit(100)
      .then(r => setList(((r.data as any[]) || []).filter(x => x.theme === 'braya')));
  }, [row?.id]);

  // ---- live preview ----
  const push = useCallback(() => {
    if (D && frame.current?.contentWindow) frame.current.contentWindow.postMessage({ type: 'braya-content', content: D, opened: coverOpen }, window.location.origin);
  }, [D, coverOpen]);
  useEffect(() => {
    const on = (e: MessageEvent) => { if (e.origin === window.location.origin && e.data?.type === 'braya-ready') setReady(true); };
    window.addEventListener('message', on); return () => window.removeEventListener('message', on);
  }, []);
  useEffect(() => { if (ready) push(); }, [ready, push]);

  // ---- autosave an unsaved draft in this browser ----
  useEffect(() => {
    if (!D || !dirty) return;
    const t = window.setTimeout(() => { try { localStorage.setItem(draftKey, JSON.stringify(D)); } catch { say('Browser storage is full. Save the draft to the database.'); } }, 400);
    return () => window.clearTimeout(t);
  }, [D, dirty, draftKey, say]);

  const update = useCallback((path: string, v: any) => { setD(p => { const n = clone(p as Doc); setAt(n, path, v); return n; }); setDirty(true); }, []);
  const mutate = useCallback((fn: (d: Doc) => void) => { setD(p => { const n = clone(p as Doc); fn(n); return n; }); setDirty(true); }, []);

  // ---- field builders (plain functions, not components, so typing never loses focus) ----
  const Text = (label: string, path: string, area?: boolean) => <label className="wbF" key={path + label}>{label}
    {area ? <textarea rows={3} value={getAt(D!, path) ?? ''} onChange={e => update(path, e.target.value)} />
      : <input value={getAt(D!, path) ?? ''} onChange={e => update(path, e.target.value)} />}</label>;
  const Color = (label: string, path: string) => { const v = getAt(D!, path); return <label className="wbF" key={path}>{label}
    <input type="color" value={/^#[0-9a-f]{6}$/i.test(v) ? v : '#000000'} onChange={e => update(path, e.target.value)} /></label>; };
  const Check = (label: string, path: string) => <label className="wbCk" key={path}><input type="checkbox" checked={getAt(D!, path) !== false} onChange={e => update(path, e.target.checked)} />{label}</label>;
  const Img = (label: string, path: string) => {
    const v = getAt(D!, path) as string | undefined;
    return <div className="wbF" key={path}>{label}
      <div className="wbRow">
        {v ? <img className="wbThumb" src={v} alt="" /> : null}
        <label className="button secondary wbUp"><ImagePlus />Upload<input type="file" accept="image/*" hidden onChange={async e => {
          const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
          try { update(path, await uploadPicture(f)); say('Picture added'); } catch (x: any) { say(x.message || 'Upload failed'); }
        }} /></label>
        {v ? <button type="button" className="secondary" onClick={() => update(path, '')}>Remove</button> : null}
      </div>
      <input placeholder="…or paste an image link" value={v && v.startsWith('data:') ? '' : v ?? ''} onChange={e => update(path, e.target.value)} />
    </div>;
  };
  const Move = (arr: string, i: number) => <div className="wbRow" key={arr + i + 'm'}>
    <button type="button" className="secondary" disabled={i === 0} onClick={() => mutate(d => { const a = d[arr]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; })}>Up</button>
    <button type="button" className="secondary" onClick={() => mutate(d => { const a = d[arr]; if (i < a.length - 1) [a[i + 1], a[i]] = [a[i], a[i + 1]]; })}>Down</button>
    <button type="button" className="icon danger" aria-label="Delete" onClick={() => mutate(d => { d[arr].splice(i, 1); })}><Trash2 /></button>
  </div>;

  const cambodia = useMemo(() => { if (!D) return ''; const t = new Date(D.date); return isNaN(t.getTime()) ? '' : new Date(t.getTime() + 7 * 36e5).toISOString().slice(0, 16); }, [D]);

  // ---- saving / sending ----
  async function save(asNew = false): Promise<Row | null> {
    const { data: au } = await supabase.auth.getUser();
    if (!au?.user) { setErr('You are signed out. Sign in as admin again.'); return null; }
    const payload = { title: title.trim() || 'Wedding', design: {}, config: { theme: 'braya', braya: D } };
    const r = row && !asNew
      ? await supabase.from('wedding_invites').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', row.id).select('id,title,status,owner_id').single()
      : await supabase.from('wedding_invites').insert({ ...payload, owner_id: au.user.id, status: 'draft' }).select('id,title,status,owner_id').single();
    if (r.error) { setErr(/relation .* does not exist/i.test(r.error.message) ? 'Run supabase/sql/supabase-wedding-invites.sql in Supabase → SQL Editor first.' : r.error.message); return null; }
    const saved = r.data as Row;
    setErr(''); setRow(saved); setDirty(false); try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
    if (saved.id !== invParam) { justSaved.current = saved.id; setSp({ i: saved.id }, { replace: true }); }
    return saved;
  }
  async function onSave(asNew = false) { setBusy(true); const s = await save(asNew); setBusy(false); if (s) say(asNew ? 'Saved as a new draft ✓' : 'Saved ✓'); }
  /** Rename a saved invitation straight away (only the name is written, not your other unsaved edits). */
  async function rename() {
    const t = title.trim() || 'Wedding';
    setTitle(t);
    if (!row || t === row.title) return;
    const r = await supabase.from('wedding_invites').update({ title: t, updated_at: new Date().toISOString() }).eq('id', row.id);
    if (r.error) { setErr(r.error.message); return; }
    setRow({ ...row, title: t }); setList(l => l.map(x => (x.id === row.id ? { ...x, title: t } : x))); say('Name changed ✓');
  }
  async function onSend(c: Customer): Promise<string | void> {
    if (!window.confirm(`Send this invitation to ${customerLabel(c)}? It will appear on their Services page.`)) return;
    setBusy(true);
    try {
      const saved = await save(false); if (!saved) return 'Could not save the invitation first. See the message at the top.';
      const m = await sendInviteTo(saved.id, c.user_id);
      if (m) return m;
      setRow({ ...saved, status: 'sent', owner_id: c.user_id }); say('Sent to ' + (c.name?.trim() || c.email || 'customer') + ' ✓');
    } finally { setBusy(false); }
  }
  function download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['window.BRAYA_DEFAULT = ' + JSON.stringify(D, null, 2) + ';\n'], { type: 'text/javascript' }));
    a.download = 'content.js'; document.body.appendChild(a); a.click(); a.remove();
  }
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => say('Link copied'), () => say('Could not copy'));
  const origin = window.location.origin;
  const shareUrl = row ? `${origin}${BASE}?i=${row.id}` : '';

  if (err && !D) return <Shell title="Wedding editor"><div className="wbPage"><div className="notice"><b>Heads up.</b> {err}</div><Link className="button secondary" to="/admin/wedding">Back to Wedding</Link></div></Shell>;
  if (!D || !base) return <Shell title="Wedding editor"><div className="wbPage"><p className="muted">Loading editor…</p></div></Shell>;

  const pane: Record<Tab, React.ReactNode> = {
    Cover: <>
      {Text('Names (new line = new line)', 'cover.names', true)}
      {Text('Cover background video link (.mp4)', 'cover.video')}
      {Img('Cover background picture', 'cover.bgImage')}
      {Text('Label above guest name', 'cover.guestLabel')}
      {Text('Guest name when the link has no name', 'cover.guestDefault')}
      {Text('Open button (Khmer)', 'cover.btnKm')}
      {Text('Open button (English)', 'cover.btnEn')}
      {Text('Background music link (.mp3)', 'music')}
      <p className="muted">Videos and music must be links: upload them to your storage, then paste the link.</p></>,
    Couple: <>
      {Text('Title', 'intro.title')}{Text('Invitation line', 'intro.line')}{Text('Invitation text', 'intro.text', true)}
      {Check('Show couple portraits', 'show.couple')}
      <h3>Groom</h3>{Text('Name (Khmer)', 'groom.km')}{Text('Name (English)', 'groom.en')}{Text('Role', 'groom.role')}{Img('Photo', 'groom.photo')}
      <h3>Bride</h3>{Text('Name (Khmer)', 'bride.km')}{Text('Name (English)', 'bride.en')}{Text('Role', 'bride.role')}{Img('Photo', 'bride.photo')}
      {Text('Word between the names', 'andText')}</>,
    Date: <>
      <label className="wbF">Wedding date and time (Cambodia time)
        <input type="datetime-local" value={cambodia} onChange={e => e.target.value && update('date', e.target.value + ':00+07:00')} /></label>
      {Text('Date text (Khmer)', 'dateKm', true)}{Text('Lunar date text', 'lunarKm', true)}
      <h3>Calendar and countdown</h3>
      {Check('Show calendar', 'show.calendar')}{Text('Calendar heading (Khmer)', 'calendar.km')}{Text('Calendar heading (English)', 'calendar.en')}
      {Check('Show countdown', 'show.countdown')}{Text('Countdown heading (Khmer)', 'countdown.km')}{Text('Countdown heading (English)', 'countdown.en')}</>,
    Schedule: <>
      {Check('Show schedule', 'show.schedule')}{Text('Heading (Khmer)', 'scheduleTitle.km')}{Text('Heading (English)', 'scheduleTitle.en')}
      {D.schedule.map((_: any, i: number) => <div className="wbItem" key={i}>
        {Text('Time', `schedule.${i}.time`)}{Text('Description', `schedule.${i}.text`, true)}{Img('Icon', `schedule.${i}.icon`)}{Move('schedule', i)}</div>)}
      <button type="button" onClick={() => mutate(d => { d.schedule.push({ time: '', text: '', icon: '' }); })}><Plus /> Add row</button></>,
    Venue: <>
      {Check('Show venue', 'show.venue')}{Text('Heading (Khmer)', 'venue.km')}{Text('Heading (English)', 'venue.en')}
      {Text('Venue name (Khmer)', 'venue.nameKm', true)}{Text('Venue name (English)', 'venue.nameEn')}
      {Text('Google Maps link', 'venue.mapUrl')}{Text('Map button text', 'venue.mapBtn')}{Text('YouTube embed link (empty = hide)', 'venue.youtube')}</>,
    Gallery: <>
      {Check('Show gallery', 'show.gallery')}{Text('Heading (Khmer)', 'galleryTitle.km')}{Text('Heading (English)', 'galleryTitle.en')}
      <div className="wbRow">
        <label className="button wbUp"><Plus />Upload photos<input type="file" accept="image/*" multiple hidden onChange={async e => {
          const files = Array.from(e.target.files || []); e.target.value = '';
          for (const f of files) { try { const u = await uploadPicture(f); mutate(d => { d.gallery.push(u); }); } catch (x: any) { say(x.message || 'Upload failed'); } }
        }} /></label>
        <button type="button" className="secondary" onClick={() => { const u = window.prompt('Image link'); if (u) mutate(d => { d.gallery.push(u.trim()); }); }}>Add by link</button>
      </div>
      {D.gallery.map((src: string, i: number) => <div className="wbItem wbRow" key={i}><img className="wbThumb" src={src} alt="" /><span className="grow">#{i + 1}</span>{Move('gallery', i)}</div>)}</>,
    Gift: <>
      {Check('Show gift section', 'show.gift')}{Text('Heading (Khmer)', 'gift.km')}{Text('Heading (English)', 'gift.en')}
      {Text('Intro (Khmer)', 'gift.introKm')}{Text('Intro (English)', 'gift.introEn')}{Img('QR code picture', 'gift.qr')}
      {Text('Holder label', 'gift.holderLabel')}{Text('Account holder', 'gift.holder')}{Text('Account number (optional)', 'gift.account')}</>,
    Thanks: <>
      {Check('Show thank-you note', 'show.thanks')}{Text('Heading (Khmer)', 'thanks.km')}{Text('Heading (English)', 'thanks.en')}
      {Text('Text (Khmer)', 'thanks.textKm', true)}{Text('Text (English)', 'thanks.textEn', true)}
      <h3>Ending</h3>{Check('Show ending', 'show.ending')}{Text('Ending video link', 'ending.video')}{Text('Ending text', 'ending.text')}</>,
    Style: <>
      {Color('Accent (calendar day, buttons)', 'colors.accent')}{Color('Text colour', 'colors.text')}{Color('Soft text colour', 'colors.muted')}{Color('Gold details', 'colors.gold')}{Color('Light gold (names on the photo)', 'colors.goldLight')}
      <label className="wbF">Heading font (Khmer)
        <select value={D.fonts?.heading || 'pali'} onChange={e => update('fonts.heading', e.target.value)}>
          <option value="pali">Khmer OS Muol Pali</option><option value="light">Khmer OS Muol Light</option><option value="body">Easy-to-read (Kantumruy Pro)</option></select></label>
      {Img('Page background picture', 'bgImage')}</>,
    Save: <>
      <p className="muted">{row ? (row.status === 'sent' ? 'Status: SENT to the customer. Saving updates what they see.' : 'Status: DRAFT. Only you can see it.') : 'Not saved yet. Save a draft, preview it, then send it.'}{dirty ? ' You have unsaved changes.' : ''}</p>
      <label className="wbF">Invitation name<input value={title} maxLength={80} onChange={e => setTitle(e.target.value)} onBlur={rename} /></label>
      <div className="wbRow">
        <button type="button" disabled={busy} onClick={() => onSave(false)}><Save /> {row ? (row.status === 'sent' ? 'Save changes' : 'Save draft') : 'Save draft'}</button>
        {row && <button type="button" className="secondary" disabled={busy} onClick={() => onSave(true)}><Copy /> Save as new copy</button>}
      </div>
      {row && <div className="wbBox">
        <span className="muted">Invitation link (what guests open)</span>
        <div className="wbRow"><input readOnly className="grow" value={shareUrl} onFocus={e => e.currentTarget.select()} /><button type="button" className="secondary" onClick={() => copy(shareUrl)}><Copy /> Copy</button>
          <a className="button secondary" href={shareUrl} target="_blank" rel="noreferrer"><Eye /> Preview</a></div>
        <a className="wbLink" href={BASE + 'guests.html'} target="_blank" rel="noreferrer"><Users /> Guests and personal links (customer page)</a>
      </div>}
      <div className="wbBox">
        <span className="muted">{row?.status === 'sent' ? 'Already sent. To send it to a different customer, pick them here:' : 'When the preview looks right, pick the customer and send it. It appears on their Services page, where they add guest names and copy a personal link for each guest.'}</span>
        <CustomerPicker onSend={onSend} busy={busy} />
      </div>
      <div className="wbRow">
        <button type="button" className="secondary" onClick={download}><Download /> Download content.js</button>
        <button type="button" className="secondary" onClick={() => { if (!window.confirm('Throw away all unsaved edits?')) return; try { localStorage.removeItem(draftKey); } catch { /* ignore */ } window.location.reload(); }}><RotateCcw /> Discard unsaved edits</button>
      </div></>,
  };

  return <Shell title="Wedding editor"><div className="wbPage">
    {err && <div className="notice"><b>Heads up.</b> {err}</div>}
    <section className="panel wbBar">
      <div className="wbCouple"><span className="wbHeart"><Heart /></span>
        <div className="wbName"><input className="wbTitle" aria-label="Invitation name" placeholder="Invitation name" maxLength={80} value={title}
          onChange={e => setTitle(e.target.value)} onBlur={rename} onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }} /><small>{row ? (row.status === 'sent' ? 'Sent to customer' : 'Draft') : 'New invitation (not saved)'}{dirty ? ' · unsaved changes' : ''}</small></div></div>
      <div className="wbBarActions">
        <select aria-label="Open a saved invitation" value={invParam || ''} onChange={e => { if (dirty && !window.confirm('Leave without saving your edits?')) return; setSp(e.target.value ? { i: e.target.value } : {}); }}>
          <option value="">New invitation</option>{list.map(x => <option key={x.id} value={x.id}>{x.title || 'Untitled'} ({x.status})</option>)}</select>
        <button type="button" disabled={busy} onClick={() => onSave(false)}><Save /> {busy ? 'Saving…' : 'Save'}</button>
        <Link className="button secondary" to="/admin/wedding"><ExternalLink /> RSVPs and wishes</Link>
      </div>
    </section>

    <div className="wbGrid">
      <section className="panel wbEditor">
        <div className="wbTabs" role="tablist">{TABS.map(t => <button key={t} type="button" role="tab" aria-selected={t === tab} className={t === tab ? 'on' : 'secondary'} onClick={() => setTab(t)}>{t}</button>)}</div>
        <div className="wbPane">{pane[tab]}</div>
      </section>
      <aside className="wbPreview">
        <div className="wbSeg" role="group" aria-label="Preview">
          <button type="button" className={!coverOpen ? 'on' : ''} onClick={() => setCoverOpen(false)}>Cover</button>
          <button type="button" className={coverOpen ? 'on' : ''} onClick={() => setCoverOpen(true)}>Invitation</button>
        </div>
        <iframe ref={frame} title="Invitation preview" src={BASE + 'braya/index.html?embed=1'} />
      </aside>
    </div>
    {msg && <div className="wbToast" role="status">{msg}</div>}
  </div></Shell>;
}
