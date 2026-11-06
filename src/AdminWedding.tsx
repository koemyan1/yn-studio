import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, ExternalLink, Heart, MessageCircle, Palette, RefreshCw, Search, Trash2, UserCheck, UserX, Users } from 'lucide-react';
import { supabase } from './supabase';
import { CountUp } from './adminMotion';
import './admin-wedding.css';

type Shell = React.ComponentType<{ title: string; children: React.ReactNode }>;
type Rsvp = { id: number; name: string; attending: boolean; guests: number; created_at: string };
type Wish = { id: number; name: string; message: string; created_at: string };
type Invite = { id: string; title: string; status: 'draft' | 'sent'; created_at: string };
type Cfg = { groom?: { km?: string; en?: string }; bride?: { km?: string; en?: string }; dateTextEn?: string; venueEn?: string };

const INVITE_PATH = '/wedding/';
const inviteUrl = () => window.location.origin + INVITE_PATH;
const personalUrl = (name: string) => inviteUrl() + '?to=' + encodeURIComponent(name.trim().slice(0, 60));
const when = (iso: string) => { try { return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const csvCell = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"';

/** The invitation keeps its details in /wedding/config.js (window.CONFIG). Load it with a plain script tag (allowed by the site's CSP, unlike eval). */
function loadConfig(): Promise<Cfg | null> {
  return new Promise(resolve => {
    const w = window as any;
    const prev = w.CONFIG;
    const s = document.createElement('script');
    s.src = INVITE_PATH + 'config.js?t=' + Date.now();
    s.onload = () => { const c = w.CONFIG as Cfg | undefined; w.CONFIG = prev; s.remove(); resolve(c || null); };
    s.onerror = () => { s.remove(); resolve(null); };
    document.head.appendChild(s);
  });
}

function useCopy() {
  const [done, setDone] = useState('');
  const copy = useCallback(async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); }
    catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch { /* ignore */ } t.remove(); }
    setDone(key); window.setTimeout(() => setDone(d => (d === key ? '' : d)), 1600);
  }, []);
  return { done, copy };
}

export default function AdminWedding({ Shell }: { Shell: Shell }) {
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [q, setQ] = useState('');
  const [names, setNames] = useState('');
  const [qr, setQr] = useState('');
  const [invites, setInvites] = useState<Invite[]>([]);
  const { done, copy } = useCopy();

  const load = useCallback(async () => {
    setLoading(true);
    const [r, w] = await Promise.all([
      supabase.from('rsvps').select('id,name,attending,guests,created_at').order('created_at', { ascending: false }).limit(1000),
      supabase.from('wishes').select('id,name,message,created_at').order('created_at', { ascending: false }).limit(500),
    ]);
    const e = r.error || w.error;
    if (e) setErr(/relation .* does not exist|schema cache/i.test(e.message) ? 'The wedding tables are missing. Run supabase/sql/supabase-wedding.sql in Supabase → SQL Editor.' : e.message);
    else setErr('');
    setRsvps((r.data as Rsvp[]) || []);
    setWishes((w.data as Wish[]) || []);
    const iv = await supabase.from('wedding_invites').select('id,title,status,created_at').order('created_at', { ascending: false }).limit(100);
    setInvites(iv.error ? [] : ((iv.data as Invite[]) || []));
    setLoading(false);
  }, []);

  useEffect(() => { load(); loadConfig().then(setCfg); }, [load]);

  // QR code of the invitation link (the `qrcode` package is already a dependency; loaded only when this page opens)
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const QR: any = (await import('qrcode')).default;
        const url: string = await QR.toDataURL(inviteUrl(), { width: 480, margin: 2, color: { dark: '#0b2527', light: '#ffffff' } });
        if (live) setQr(url);
      } catch { /* the link still works without the picture */ }
    })();
    return () => { live = false; };
  }, []);

  const stats = useMemo(() => {
    const yes = rsvps.filter(r => r.attending);
    return { replies: rsvps.length, yes: yes.length, no: rsvps.length - yes.length, people: yes.reduce((n, r) => n + (r.guests || 0), 0) };
  }, [rsvps]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rsvps.filter(r => (filter === 'all' || (filter === 'yes') === r.attending) && (!s || r.name.toLowerCase().includes(s)));
  }, [rsvps, filter, q]);

  const nameList = useMemo(() => Array.from(new Set(names.split('\n').map(n => n.trim()).filter(Boolean))).slice(0, 500), [names]);

  async function removeInvite(i: Invite) {
    if (!window.confirm(`Delete the invitation “${i.title || 'Untitled'}”${i.status === 'sent' ? ' (already sent: the customer loses it and its guest list)' : ''}?`)) return;
    const { error } = await supabase.from('wedding_invites').delete().eq('id', i.id);
    if (error) { setErr(error.message); return; }
    setInvites(x => x.filter(v => v.id !== i.id));
  }
  async function removeRsvp(r: Rsvp) {
    if (!window.confirm(`Delete the reply from “${r.name}”?`)) return;
    const { error } = await supabase.from('rsvps').delete().eq('id', r.id);
    if (error) { setErr(error.message); return; }
    setRsvps(x => x.filter(i => i.id !== r.id));
  }
  async function removeWish(w: Wish) {
    if (!window.confirm(`Delete the wish from “${w.name}”? It disappears from the invitation page.`)) return;
    const { error } = await supabase.from('wishes').delete().eq('id', w.id);
    if (error) { setErr(error.message); return; }
    setWishes(x => x.filter(i => i.id !== w.id));
  }
  function exportCsv() {
    const rows = [['Name', 'Attending', 'Guests', 'Received'], ...rsvps.map(r => [r.name, r.attending ? 'Yes' : 'No', r.attending ? r.guests : 0, r.created_at])];
    const blob = new Blob(['\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'wedding-rsvps.csv'; document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const couple = cfg?.groom?.en && cfg?.bride?.en ? `${cfg.groom.en} & ${cfg.bride.en}` : 'Wedding invitation';
  const sub = [cfg?.dateTextEn, cfg?.venueEn].filter(Boolean).join(' · ');

  return <Shell title="Wedding"><div className="wdPage">
    {err && <div className="notice"><b>Heads up.</b> {err}</div>}

    <section className="panel wdHero">
      <div className="wdCouple"><span className="wdHeart"><Heart /></span><div><h2>{couple}</h2><small>{sub || 'Edit names, date, venue and photos in Edit design → Details'}</small></div></div>
      <div className="wdHeroActions">
        <a className="button" href={INVITE_PATH} target="_blank" rel="noreferrer"><ExternalLink /> Open invitation</a>
        <a className="secondary button" href={INVITE_PATH + '?edit=1'} target="_blank" rel="noreferrer"><Palette /> Edit design</a>
        <button type="button" className="secondary" onClick={load} disabled={loading}><RefreshCw /> {loading ? 'Loading…' : 'Refresh'}</button>
      </div>
    </section>

    <section className="panel">
      <div className="wdHead"><h2>Invitations for customers</h2>
        <a className="button" href={INVITE_PATH + '?edit=1'} target="_blank" rel="noreferrer"><Palette /> New invitation</a></div>
      <p className="muted">Design it, press Save draft, preview it, then Send to customer. A sent invitation shows on the customer’s Services page.</p>
      {invites.length === 0 ? <p className="wdEmpty">No saved invitations yet.</p> :
        <ul className="wdLinks">{invites.map(i => <li key={i.id}><b>{i.title || 'Untitled'}</b>
          <span className={'wdPill ' + (i.status === 'sent' ? 'yes' : 'no')}>{i.status === 'sent' ? 'Sent' : 'Draft'}</span>
          <a className="secondary button" href={INVITE_PATH + '?i=' + i.id} target="_blank" rel="noreferrer"><ExternalLink /> Preview</a>
          <a className="secondary button" href={INVITE_PATH + '?edit=1&i=' + i.id} target="_blank" rel="noreferrer"><Palette /> Edit</a>
          <button type="button" className="icon" aria-label={'Delete ' + (i.title || 'invitation')} onClick={() => removeInvite(i)}><Trash2 /></button></li>)}</ul>}
    </section>

    <div className="stats wdStats">
      <div className="stat"><span className="statIcon"><Users /></span><div><small>Replies</small><strong><CountUp n={stats.replies} /></strong></div></div>
      <div className="stat"><span className="statIcon"><UserCheck /></span><div><small>Coming</small><strong><CountUp n={stats.yes} /></strong></div></div>
      <div className="stat"><span className="statIcon"><UserX /></span><div><small>Can’t come</small><strong><CountUp n={stats.no} /></strong></div></div>
      <div className="stat"><span className="statIcon"><Heart /></span><div><small>People attending</small><strong><CountUp n={stats.people} /></strong></div></div>
    </div>

    <div className="wdGrid">
      <section className="panel">
        <h2>Share the invitation</h2>
        <div className="wdLink"><input readOnly value={inviteUrl()} onFocus={e => e.currentTarget.select()} aria-label="Invitation link" />
          <button type="button" className="secondary" onClick={() => copy('main', inviteUrl())}>{done === 'main' ? <><Check /> Copied</> : <><Copy /> Copy</>}</button></div>
        {qr && <div className="wdQr"><img src={qr} alt="QR code of the invitation link" width={160} height={160} />
          <div><p className="muted">Print it on the card or show it on a screen.</p><a className="secondary button" href={qr} download="wedding-invitation-qr.png"><Download /> Save QR</a></div></div>}
      </section>

      <section className="panel">
        <h2>Personal links</h2>
        <p className="muted">One name per line. Each link greets that guest by name and pre-fills their reply.</p>
        <textarea value={names} onChange={e => setNames(e.target.value)} rows={5} placeholder={'Sophea\nUncle Sok\nThe Chan family'} aria-label="Guest names" />
        {nameList.length > 0 && <>
          <div className="wdLinksHead"><span className="muted">{nameList.length} link{nameList.length === 1 ? '' : 's'}</span>
            <button type="button" className="secondary" onClick={() => copy('all', nameList.map(n => `${n}: ${personalUrl(n)}`).join('\n'))}>{done === 'all' ? <><Check /> Copied</> : <><Copy /> Copy all</>}</button></div>
          <ul className="wdLinks">{nameList.map(n => <li key={n}><b>{n}</b>
            <button type="button" className="icon" aria-label={'Copy link for ' + n} onClick={() => copy('n:' + n, personalUrl(n))}>{done === 'n:' + n ? <Check /> : <Copy />}</button></li>)}</ul></>}
      </section>
    </div>

    <section className="panel">
      <div className="wdHead"><h2>Replies</h2>
        <div className="wdTools">
          <div className="wdSearch"><Search /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name" aria-label="Search replies" /></div>
          <div className="wdSeg" role="group" aria-label="Filter replies">
            {([['all', 'All'], ['yes', 'Coming'], ['no', 'Can’t come']] as const).map(([k, l]) => <button type="button" key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}
          </div>
          <button type="button" className="secondary" onClick={exportCsv} disabled={!rsvps.length}><Download /> CSV</button>
        </div></div>
      {shown.length === 0 ? <p className="wdEmpty">{loading ? 'Loading…' : rsvps.length ? 'No replies match.' : 'No replies yet. They appear here as guests answer on the invitation.'}</p> :
        <div className="wdTableWrap"><table className="wdTable"><thead><tr><th>Name</th><th>Answer</th><th>Guests</th><th>Received</th><th /></tr></thead>
          <tbody>{shown.map(r => <tr key={r.id}><td data-l="Name"><b>{r.name}</b></td>
            <td data-l="Answer"><span className={'wdPill ' + (r.attending ? 'yes' : 'no')}>{r.attending ? 'Coming' : 'Can’t come'}</span></td>
            <td data-l="Guests">{r.attending ? r.guests : '–'}</td><td data-l="Received">{when(r.created_at)}</td>
            <td><button type="button" className="icon" aria-label={'Delete reply from ' + r.name} onClick={() => removeRsvp(r)}><Trash2 /></button></td></tr>)}</tbody></table></div>}
    </section>

    <section className="panel">
      <div className="wdHead"><h2><MessageCircle className="wdH2Icon" /> Wishes <span className="muted">({wishes.length})</span></h2></div>
      {wishes.length === 0 ? <p className="wdEmpty">{loading ? 'Loading…' : 'No wishes yet.'}</p> :
        <ul className="wdWishes">{wishes.map(w => <li key={w.id}><div><b>{w.name}</b><small>{when(w.created_at)}</small><p>{w.message}</p></div>
          <button type="button" className="icon" aria-label={'Delete wish from ' + w.name} onClick={() => removeWish(w)}><Trash2 /></button></li>)}</ul>}
    </section>
  </div></Shell>;
}
