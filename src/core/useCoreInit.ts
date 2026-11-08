import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

// Is YN EMERGENCY (the initialization page) still open? Used only to show or hide its sidebar item.
// The REAL lock is on the server (the page and API answer 404 once locked); this is just so the menu does not show a dead link.
const API_BASE: string = (((import.meta as any).env?.VITE_API_BASE_URL as string | undefined) || '').replace(/\/$/, '');
let cache: { open: boolean; at: number } | null = null;
export const resetCoreInit = () => { cache = null; };

export function useCoreInit(): boolean {
  const [open, setOpen] = useState(cache?.open ?? false);
  useEffect(() => {
    if (cache && Date.now() - cache.at < 60000) { setOpen(cache.open); return; }
    let live = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const r = await fetch(API_BASE + '/api/emergency/state', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
        const j = r.ok ? await r.json() : null;
        const v = !!j && j.locked === false && !!j.ready?.keyring;
        cache = { open: v, at: Date.now() };
        if (live) setOpen(v);
      } catch { /* menu stays as it was */ }
    })();
    return () => { live = false; };
  }, []);
  return open;
}
