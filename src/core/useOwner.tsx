import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../supabase';

// Is the signed-in admin the OWNER ("big boss")? Only owners see YN CORE, YN EMERGENCY and the Admins page.
// `bootstrap` = no owner has been set up yet (upgrade period): YN CORE keeps working for admins as before, and the Admins page explains how to add the owner.
// This only decides what to SHOW. The real check is on the server (yn_core_owners), so hiding a link never grants or removes anything.
const API_BASE: string = (((import.meta as any).env?.VITE_API_BASE_URL as string | undefined) || '').replace(/\/$/, '');
export type OwnerInfo = { loaded: boolean; owner: boolean; bootstrap: boolean };
let cache: { uid: string; at: number; v: OwnerInfo } | null = null;
export const resetOwner = () => { cache = null; };

export function useOwner(): OwnerInfo {
  const [info, setInfo] = useState<OwnerInfo>({ loaded: false, owner: false, bootstrap: false });
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token, uid = data.session?.user?.id || '';
        if (!token) { if (live) setInfo({ loaded: true, owner: false, bootstrap: false }); return; }
        if (cache && cache.uid === uid && Date.now() - cache.at < 60000) { if (live) setInfo(cache.v); return; }
        const r = await fetch(API_BASE + '/api/admin/me-owner', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
        const j = r.ok ? await r.json() : null;
        const v: OwnerInfo = { loaded: true, owner: !!j?.owner, bootstrap: !!j?.bootstrap };
        cache = { uid, at: Date.now(), v };
        if (live) setInfo(v);
      } catch { if (live) setInfo({ loaded: true, owner: false, bootstrap: false }); }
    })();
    return () => { live = false; };
  }, []);
  return info;
}

/** Wrap a route so a non-owner admin is sent back to the normal admin instead of seeing a dead page. */
export function OwnerOnly({ children }: { children: React.ReactNode }) {
  const o = useOwner();
  if (!o.loaded) return null;
  if (!(o.owner || o.bootstrap)) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}
