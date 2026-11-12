import { supabase } from './supabase';

/* Cart for visitors who are not signed in. Lives in this browser's localStorage; when the visitor signs in or signs up,
   mergeGuestCart() moves every line into their real cart (carts / cart_items) so nothing is lost. */
const KEY = 'yn-guest-cart-v1';
export type GuestLine = { product_id: string; quantity: number; selected_options: any; price: number };

const same = (a: any, b: any) => JSON.stringify(a || {}) === JSON.stringify(b || {});
export const guestLineId = (l: { product_id: string; selected_options: any }) => 'g:' + l.product_id + '|' + JSON.stringify(l.selected_options || {});
export const isGuestId = (id: string) => typeof id === 'string' && id.startsWith('g:');

export function guestRead(): GuestLine[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(v)) return [];
    return v.filter((x: any) => x && typeof x.product_id === 'string' && Number(x.quantity) > 0)
      .map((x: any) => ({ product_id: x.product_id, quantity: Math.floor(Number(x.quantity)), selected_options: x.selected_options || {}, price: Number(x.price || 0) }));
  } catch { return []; }
}
function guestWrite(lines: GuestLine[]) {
  try { if (lines.length) localStorage.setItem(KEY, JSON.stringify(lines)); else localStorage.removeItem(KEY); } catch { /* private mode: cart just won't persist */ }
  window.dispatchEvent(new Event('yn-cart-updated'));
  window.dispatchEvent(new Event('yn-cart-badge'));
}
export const guestCount = () => guestRead().reduce((a, x) => a + x.quantity, 0);

export function guestAdd(line: GuestLine) {
  const lines = guestRead();
  const hit = lines.find(l => l.product_id === line.product_id && same(l.selected_options, line.selected_options));
  if (hit) { hit.quantity += line.quantity; hit.price = line.price; } else lines.push(line);
  guestWrite(lines);
}
export function guestSetQty(id: string, qty: number) {
  const lines = guestRead().map(l => guestLineId(l) === id ? { ...l, quantity: qty } : l).filter(l => l.quantity > 0);
  guestWrite(lines);
}
export function guestRemove(id: string) { guestWrite(guestRead().filter(l => guestLineId(l) !== id)); }

let merging = false;
export async function mergeGuestCart(userId: string) {
  if (merging || !userId) return;
  const lines = guestRead();
  if (!lines.length) return;
  merging = true;
  try {
    const { data: carts, error: ce } = await supabase.from('carts').select('id,created_at').eq('user_id', userId).order('created_at', { ascending: true }).limit(1);
    if (ce) return;
    let cart = carts?.[0];
    if (!cart) { const r = await supabase.from('carts').insert({ user_id: userId }).select('id,created_at').single(); if (r.error) return; cart = r.data; }
    const { data: rows, error: re } = await supabase.from('cart_items').select('id,quantity,selected_options,product_id').eq('cart_id', cart.id);
    if (re) return;
    const left: GuestLine[] = [];
    for (const l of lines) {
      const ex = (rows || []).find((x: any) => x.product_id === l.product_id && same(x.selected_options, l.selected_options));
      const r = ex
        ? await supabase.from('cart_items').update({ quantity: Number(ex.quantity || 0) + l.quantity, price: l.price }).eq('id', ex.id)
        : await supabase.from('cart_items').insert({ cart_id: cart.id, product_id: l.product_id, quantity: l.quantity, selected_options: l.selected_options, price: l.price });
      if (r.error) left.push(l); // keep a line that failed so it can be retried on the next sign-in
    }
    guestWrite(left);
  } finally { merging = false; }
}

/* Start once at app boot: whenever a signed-in session exists and a guest cart is waiting, move it into the account. */
export function startGuestCartSync() {
  const run = (uid?: string) => { if (uid && guestRead().length) setTimeout(() => { mergeGuestCart(uid); }, 0); };
  supabase.auth.onAuthStateChange((_e, session) => run(session?.user?.id));
  supabase.auth.getSession().then(({ data }) => run(data.session?.user?.id));
}
