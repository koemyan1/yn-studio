import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, Plus, Share2, Trash2, Users } from 'lucide-react';
import { supabase } from './supabase';
import { tr } from './lang';

/* Customer → Services: the invitation the admin sent, with a guest manager.
   The customer types a guest name; it shows on the cover of the invitation in place of ភ្ញៀវកិត្តិយស (live preview),
   and that guest gets their own link (…?i=<invitation>&g=<guest>) to copy, share or open. */

export type SentInvite = { id: string; title: string; theme?: string | null };
type Guest = { id: string; name: string; opened_at: string | null };

const MAX_NAME = 60;
const cleanName = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);

/** Personal link of one guest. The Garden (braya) theme has its own page; the Envelope theme opens through /wedding/. */
export const guestLink = (inv: SentInvite, guestId?: string) => {
  const page = inv.theme === 'braya' ? '/wedding/braya/index.html' : '/wedding/';
  return `${window.location.origin}${page}?i=${inv.id}${guestId ? `&g=${guestId}` : ''}`;
};

export default function WeddingGuests({ invite }: { invite: SentInvite }) {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState('');
  const [sel, setSel] = useState<string | null>(null); // guest shown in the cover preview
  const [pv, setPv] = useState('');                    // name the preview is showing (debounced while typing)
  const timer = useRef(0);
  const braya = invite.theme === 'braya';

  const load = useCallback(async () => {
    const r = await supabase.from('wedding_guests').select('id,name,opened_at').eq('invite_id', invite.id).order('created_at');
    if (r.error) { setErr(r.error.message); return; }
    setGuests((r.data as Guest[]) || []);
  }, [invite.id]);
  useEffect(() => { load(); }, [load]);

  // the cover preview follows what is typed, otherwise the selected guest
  const shownName = name.trim() || guests.find(g => g.id === sel)?.name || '';
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPv(shownName.slice(0, MAX_NAME)), 450);
    return () => window.clearTimeout(timer.current);
  }, [shownName]);

  async function add() {
    // one name, or several pasted on separate lines
    const names = Array.from(new Set(name.split('\n').map(cleanName).filter(Boolean))).slice(0, 100);
    if (!names.length) return;
    setBusy(true); setErr('');
    const r = await supabase.from('wedding_guests').insert(names.map(n => ({ invite_id: invite.id, name: n }))).select('id,name,opened_at');
    setBusy(false);
    if (r.error) { setErr(r.error.message); return; }
    const added = (r.data as Guest[]) || [];
    setGuests(g => [...g, ...added]);
    setName(''); if (added.length) setSel(added[added.length - 1].id);
  }
  async function remove(g: Guest) {
    if (!window.confirm(tr(`Remove ${g.name}? Their link will stop showing their name.`, `លុប ${g.name}? តំណរបស់គាត់នឹងលែងបង្ហាញឈ្មោះ។`))) return;
    const r = await supabase.from('wedding_guests').delete().eq('id', g.id);
    if (r.error) { setErr(r.error.message); return; }
    setGuests(x => x.filter(v => v.id !== g.id)); if (sel === g.id) setSel(null);
  }
  async function copy(key: string, text: string) {
    try { await navigator.clipboard.writeText(text); }
    catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch { /* ignore */ } t.remove(); }
    setCopied(key); window.setTimeout(() => setCopied(c => (c === key ? '' : c)), 1600);
  }
  const share = (g: Guest) => navigator.share?.({ title: invite.title || 'Wedding invitation', text: `${g.name} 💌`, url: guestLink(invite, g.id) }).catch(() => { /* cancelled */ });

  const preview = `/wedding/braya/index.html?i=${invite.id}&to=${encodeURIComponent(pv)}`;

  return <div className="wgBox">
    <div className="wgAdd">
      <label className="wgLab" htmlFor={'wg-' + invite.id}>{tr('Guest name', 'ឈ្មោះភ្ញៀវ')}</label>
      <div className="wgRow">
        <input id={'wg-' + invite.id} value={name} maxLength={MAX_NAME} autoComplete="off" onChange={e => setName(e.target.value.replace(/\n/g, ' '))}
          onPaste={e => { const t = e.clipboardData.getData('text'); if (t.includes('\n')) { e.preventDefault(); setName(t.split('\n').map(cleanName).filter(Boolean).join('\n')); } }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={tr('e.g. Uncle Sok / ពូ សុខា', 'ឧ. ពូ សុខា / Uncle Sok')} />
        <button type="button" className="svcAsk wgBtn" disabled={busy || !name.trim()} onClick={add}><Plus /> {tr('Add', 'បន្ថែម')}</button>
      </div>
      {name.includes('\n') && <p className="wgNote">{tr(`${name.split('\n').length} names will be added.`, `នឹងបន្ថែមឈ្មោះចំនួន ${name.split('\n').length}។`)}</p>}
      {err && <p className="wgErr" role="alert">{err}</p>}
    </div>

    {braya && <div className="wgPv">
      <div className="wgPhone" aria-label={tr('Cover preview', 'មើលមុខសំបុត្រ')}>
        <iframe key={pv} title={tr('Cover preview', 'មើលមុខសំបុត្រ')} src={preview} loading="lazy" tabIndex={-1} />
      </div>
      <p className="wgNote">{pv
        ? tr(`The cover greets “${pv}”.`, `មុខសំបុត្របង្ហាញ “${pv}”។`)
        : tr('Type a name and it appears on the cover.', 'វាយឈ្មោះ ហើយវានឹងបង្ហាញលើមុខសំបុត្រ។')}</p>
    </div>}

    <h4 className="wgH"><Users /> {tr('Guests', 'ភ្ញៀវ')} <span>({guests.length})</span></h4>
    {guests.length === 0 ? <p className="wgNote">{tr('No guests yet. Add a name above to get that guest’s personal link.', 'មិនទាន់មានភ្ញៀវ។ បន្ថែមឈ្មោះខាងលើ ដើម្បីទទួលបានតំណផ្ទាល់ខ្លួន។')}</p> :
      <ul className="wgList">{guests.map(g => <li key={g.id} className={sel === g.id ? 'on' : ''}>
        <button type="button" className="wgName" onClick={() => setSel(g.id)} aria-pressed={sel === g.id}>
          <b>{g.name}</b>{g.opened_at && <small className="wgOpened"><Check /> {tr('Opened', 'បានបើក')}</small>}</button>
        <div className="wgAct">
          <button type="button" onClick={() => copy(g.id, guestLink(invite, g.id))}>{copied === g.id ? <><Check /> {tr('Copied', 'បានចម្លង')}</> : <><Copy /> {tr('Copy link', 'ចម្លងតំណ')}</>}</button>
          {typeof navigator !== 'undefined' && 'share' in navigator && <button type="button" onClick={() => share(g)} aria-label={tr('Share', 'ចែករំលែក')}><Share2 /></button>}
          <a href={guestLink(invite, g.id)} target="_blank" rel="noopener noreferrer" aria-label={tr('Open their invitation', 'បើកសំបុត្ររបស់គាត់')}><ExternalLink /></a>
          <button type="button" className="wgDel" onClick={() => remove(g)} aria-label={tr('Remove', 'លុប')}><Trash2 /></button>
        </div></li>)}</ul>}
    {guests.length > 1 && <button type="button" className="wgAll" onClick={() => copy('all', guests.map(g => `${g.name}: ${guestLink(invite, g.id)}`).join('\n'))}>
      {copied === 'all' ? <><Check /> {tr('All links copied', 'បានចម្លងតំណទាំងអស់')}</> : <><Copy /> {tr('Copy all links', 'ចម្លងតំណទាំងអស់')}</>}</button>}
  </div>;
}
