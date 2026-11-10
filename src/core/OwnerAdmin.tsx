import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, ShieldCheck } from './icons';
import { ApiError, coreApi, stepUp } from './api';
import { resetOwner } from './useOwner';
import '../admin-security.css';
import './core.css';

// /admin/owner: the Admins page. Only the owner ("big boss") sees it. Appointing or removing an admin needs
//   1) the five-coin protocol (when YN_CORE_GATE=on) to open this page, and
//   2) a fresh Face ID / passkey check for EVERY single change (one-time session, consumed by the server).
// Admins the owner appoints never see this page or YN CORE: the server answers 404 to them.
type Shell = React.ComponentType<{ title: string; children: React.ReactNode }>;
const O = '/api/admin/owner';
type Admin = { userId: string; name: string; email: string; isOwner: boolean };
type Hit = { userId: string; name: string; email: string; role: string };
type Overview = { owner: boolean; bootstrap: boolean; tableMissing: boolean; me: string; admins: Admin[] };

export default function OwnerAdmin({ Shell }: { Shell: Shell }) {
  return <Shell title="Admins"><div className="secPage corePage"><View /></div></Shell>;
}

function View() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [locked, setLocked] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);

  const load = useCallback(async () => {
    setErr('');
    try { setOv(await coreApi(O + '/overview')); setLocked(false); }
    catch (e: any) {
      if (e instanceof ApiError && e.code === 'gate_locked') { setLocked(true); return; }
      setErr(e?.message || 'Could not load.');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const search = async () => {
    setBusy(true); setMsg('');
    try { const r = await coreApi(O + '/search?q=' + encodeURIComponent(q.trim())); setHits(r.results || []); }
    catch (e: any) { setMsg(e?.message || 'Search failed.'); }
    finally { setBusy(false); }
  };

  const change = async (kind: 'grant' | 'revoke', who: { userId: string; email: string; name: string }) => {
    const label = who.email || who.name || who.userId;
    if (!window.confirm(kind === 'grant' ? `Make ${label} an admin?\n\nThey will use the normal admin, but will not see this page or YN CORE.` : `Remove admin from ${label}?`)) return;
    setBusy(true); setMsg('');
    try {
      const s = await stepUp('security');                                   // Face ID / Touch ID on this phone
      await coreApi(`${O}/${kind}`, { body: { user_id: who.userId }, session: s.sessionToken });
      setMsg(kind === 'grant' ? `${label} is now an admin.` : `${label} is no longer an admin.`);
      setHits(null); resetOwner(); await load();
    } catch (e: any) {
      if (e instanceof ApiError && e.code === 'gate_locked') setLocked(true);
      else setMsg(e?.message || 'Failed.');
    } finally { setBusy(false); }
  };

  if (locked) {
    return (
      <div className="panel coreAlert">
        <p className="eyebrow">ADMIN PROTOCOL</p>
        <h2><Lock size={20} /> Locked</h2>
        <p>Hold your phone to one of your YN CORE coins and finish the five-coin ritual with Face ID. Then come back here.</p>
        <div className="coreBtns">
          <Link className="primary small" to="/yn-core">Open the coin page</Link>
          <button className="secondary small" onClick={load}>I did it, retry</button>
        </div>
      </div>
    );
  }
  if (err) return <p className="emgWarn">{err}</p>;
  if (!ov) return <p className="secMuted">Loading…</p>;

  return (
    <>
      <div className="panel">
        <p className="eyebrow">THE BIG BOSS</p>
        <h2><ShieldCheck size={20} /> Admins</h2>
        <p className="secMuted">Admins you appoint can use the normal admin. They never see this page or YN CORE. Every change needs Face ID on your phone, one time per change.</p>
      </div>

      {ov.bootstrap && (
        <div className="emgWarn">
          No owner is set yet{ov.tableMissing ? ' (the owner table is missing: run supabase-yn-core-owner.sql first)' : ''}. Until you add yourself as owner in the
          Supabase SQL editor, appointing admins is switched off. Steps: docs/setup/YN-CORE-OWNER.md.
        </div>
      )}
      {msg && <p className="emgMsg">{msg}</p>}

      <div className="panel">
        <h3>Current admins ({ov.admins.length})</h3>
        {ov.admins.map(a => (
          <div className="ownRow" key={a.userId}>
            <div><strong>{a.name || a.email || a.userId}</strong>{a.name && a.email ? <small className="secMuted"> · {a.email}</small> : null}</div>
            {a.isOwner ? <span className="ownTag">Owner</span>
              : ov.owner ? <button className="secondary small dangerBtn" disabled={busy} onClick={() => change('revoke', a)}>Remove admin</button> : null}
          </div>
        ))}
      </div>

      {ov.owner && (
        <div className="panel">
          <h3>Make someone an admin</h3>
          <div className="coreBtns">
            <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && q.trim().length >= 2) search(); }} placeholder="Search by email or name" aria-label="Search accounts" />
            <button className="primary small" disabled={busy || q.trim().length < 2} onClick={search}>Search</button>
          </div>
          {hits && !hits.length && <p className="secMuted">No account found.</p>}
          {hits?.map(h => (
            <div className="ownRow" key={h.userId}>
              <div><strong>{h.name || h.email}</strong>{h.name && h.email ? <small className="secMuted"> · {h.email}</small> : null}</div>
              {h.role === 'admin' ? <span className="ownTag">Already admin</span>
                : <button className="primary small" disabled={busy} onClick={() => change('grant', h)}>Make admin</button>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
