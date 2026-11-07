import React, { useEffect, useMemo, useState } from 'react';
import { Search, Send, X } from 'lucide-react';
import { supabase } from './supabase';
import './wedding-send.css';

/* Admin helper: choose a customer (search by name, email or phone) and send a saved wedding invitation to them.
   Sending = wedding_invites.owner_id := that customer, status := 'sent'. It then shows on their Services page,
   where they add guests and get a personal link for each one. Used by Admin → Wedding and the Wedding editor. */

export type Customer = { user_id: string; name: string | null; email: string | null; phone: string | null };

let cache: Customer[] | null = null;

export function useCustomers(): Customer[] {
  const [list, setList] = useState<Customer[]>(cache || []);
  useEffect(() => {
    if (cache) return;
    let live = true;
    supabase.from('profiles').select('user_id,name,email,phone').order('name').limit(2000)
      .then((r: any) => { if (r?.data) { cache = r.data as Customer[]; if (live) setList(cache); } }, () => { /* the picker simply stays empty */ });
    return () => { live = false; };
  }, []);
  return list;
}

export const customerLabel = (c?: Customer | null) => (c ? (c.name?.trim() || c.email || 'Customer') + (c.name && c.email ? ` · ${c.email}` : '') : '');

/** Marks the invitation as sent to this customer. Returns an error message, or null when it worked. */
export async function sendInviteTo(inviteId: string, userId: string): Promise<string | null> {
  const r = await supabase.from('wedding_invites').update({ owner_id: userId, status: 'sent', sent_at: new Date().toISOString() }).eq('id', inviteId);
  return r.error ? r.error.message : null;
}

type Props = {
  /** Called with the chosen customer; return an error message to show, or nothing when it worked. */
  onSend: (c: Customer) => Promise<string | void>;
  onClose?: () => void;
  busy?: boolean;
  hint?: string;
  buttonLabel?: string;
};

export function CustomerPicker({ onSend, onClose, busy, hint, buttonLabel }: Props) {
  const customers = useCustomers();
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<Customer | null>(null);
  const [err, setErr] = useState('');
  const [working, setWorking] = useState(false);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const rows = s ? customers.filter(c => `${c.name || ''} ${c.email || ''} ${c.phone || ''}`.toLowerCase().includes(s)) : customers;
    return rows.slice(0, 8);
  }, [customers, q]);

  async function go() {
    if (!pick) return;
    setWorking(true); setErr('');
    try { const m = await onSend(pick); if (m) setErr(m); } finally { setWorking(false); }
  }

  return <div className="wsPick">
    {hint && <p className="muted">{hint}</p>}
    <div className="wsSearch"><Search aria-hidden="true" />
      <input value={q} onChange={e => { setQ(e.target.value); setPick(null); }} placeholder="Search customer by name, email or phone" aria-label="Search customer" autoComplete="off" />
      {onClose && <button type="button" className="icon" aria-label="Close" onClick={onClose}><X /></button>}</div>
    <ul className="wsList" role="listbox" aria-label="Customers">
      {shown.map(c => <li key={c.user_id}><button type="button" role="option" aria-selected={pick?.user_id === c.user_id}
        className={pick?.user_id === c.user_id ? 'on' : ''} onClick={() => setPick(c)}>
        <b>{c.name?.trim() || 'No name'}</b><small>{[c.email, c.phone].filter(Boolean).join(' · ')}</small></button></li>)}
      {shown.length === 0 && <li className="wsNone">{customers.length ? 'No customer matches.' : 'Loading customers…'}</li>}
    </ul>
    <button type="button" disabled={!pick || busy || working} onClick={go}><Send /> {pick ? `${buttonLabel || 'Send to'} ${pick.name?.trim() || pick.email}` : (buttonLabel || 'Send to customer')}</button>
    {err && <p className="wsErr" role="alert">{err}</p>}
  </div>;
}
