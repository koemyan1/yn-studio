/* Product reviews + star ratings.
   - useRatingStats / CardRating / RatingBadge : small star summaries (cards, product title)
   - ProductReviews                            : the full "Customer reviews" section on the product page
   - AdminReviewsList                          : moderation list used by /admin/reviews
   Everything quietly hides itself if supabase-product-reviews.sql has not been run yet. */
import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Camera, Eye, EyeOff, Pencil, ShieldCheck, Star, Trash2, X } from 'lucide-react';
import { supabase } from './supabase';
import { isKm, tr, useLang } from './lang';
import { optimizeImage } from './imageTools';
import { actionFx } from './actionFx';

type Stat = { count: number; avg: number };
type Review = {
  id: string;
  user_id?: string;
  rating: number;
  comment: string | null;
  photo_url: string | null;
  reviewer_name: string | null;
  created_at: string;
  status?: string;
};

/* ---------- ratings store (one request for the whole shop, shared by every card) ---------- */
let statMap: Map<string, Stat> = new Map();
let statLoadedAt = 0;
let statLoading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(f => f());

export function refreshRatings(force = false): Promise<void> {
  if (!force && statLoadedAt && Date.now() - statLoadedAt < 60000) return Promise.resolve();
  if (statLoading) return statLoading;
  statLoading = (async () => {
    try {
      const { data, error } = await supabase.from('product_rating_stats').select('product_id,review_count,avg_rating');
      if (!error && data) {
        const m = new Map<string, Stat>();
        for (const r of data as any[]) m.set(r.product_id, { count: Number(r.review_count) || 0, avg: Number(r.avg_rating) || 0 });
        statMap = m; // a new Map object tells subscribers to re-render
        emit();
      }
    } catch { /* SQL not installed yet: simply no stars */ }
    statLoadedAt = Date.now();
    statLoading = null;
  })();
  return statLoading;
}
function subscribe(cb: () => void) { listeners.add(cb); void refreshRatings(); return () => { listeners.delete(cb); }; }
const getStats = () => statMap;
export function useRatingStats(): Map<string, Stat> { return useSyncExternalStore(subscribe, getStats, getStats); }

/* ---------- stars ---------- */
export function StarRow({ value, size = 16 }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  const stars = [0, 1, 2, 3, 4].map(i => <Star key={i} style={{ width: size, height: size }} />);
  return (
    <span className="ynStars" role="img" aria-label={value.toFixed(1) + ' / 5'}>
      <span className="ynStarsBg">{stars}</span>
      <span className="ynStarsFg" style={{ width: pct + '%' }}>{stars}</span>
    </span>
  );
}

/** Tiny "★ 4.8 (12)" line for product cards. Renders nothing until the product has a review. */
export function CardRating({ id }: { id: string }) {
  const s = useRatingStats().get(id);
  if (!s || !s.count) return null;
  // <small>/<i> on purpose: product-card CSS styles the <div> and <span> inside .pcopy (price row, mascot padding)
  return <small className="cardRating" aria-label={s.avg.toFixed(1) + ' / 5'}><Star /><b>{s.avg.toFixed(1)}</b><i>({s.count})</i></small>;
}

/** "★★★★★ 4.8 (12 reviews)" under the product name; tap to jump to the reviews. */
export function RatingBadge({ productId }: { productId: string }) {
  useLang();
  const s = useRatingStats().get(productId);
  if (!s || !s.count) return null;
  return (
    <button type="button" className="ratingBadge" onClick={() => document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
      <StarRow value={s.avg} size={15} /><b>{s.avg.toFixed(1)}</b>
      <span>({s.count} {s.count === 1 ? tr('review', 'ការវាយតម្លៃ') : tr('reviews', 'ការវាយតម្លៃ')})</span>
    </button>
  );
}

/* ---------- helpers ---------- */
const fmtDate = (iso: string) => {
  try { return new Date(iso).toLocaleDateString(isKm() ? 'km-KH' : undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return ''; }
};
const photoPath = (url: string | null | undefined) => {
  const m = String(url || '').split('/storage/v1/object/public/review-photos/')[1];
  return m ? decodeURIComponent(m.split('?')[0]) : '';
};
const dropPhoto = async (url: string | null | undefined) => {
  const p = photoPath(url);
  if (p) { try { await supabase.storage.from('review-photos').remove([p]); } catch { /* best effort */ } }
};
const RATING_WORDS = (n: number) => [
  '',
  tr('Poor', 'ខ្សោយ'),
  tr('Fair', 'មធ្យម'),
  tr('Good', 'ល្អ'),
  tr('Very good', 'ល្អណាស់'),
  tr('Excellent', 'ល្អឥតខ្ចោះ'),
][n] || '';

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="reviewLightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <button type="button" className="reviewLightboxClose" aria-label={tr('Close', 'បិទ')} onClick={onClose}><X /></button>
      <img src={url} alt="" onClick={e => e.stopPropagation()} />
    </div>
  );
}

/* ---------- the write / edit form ---------- */
function ReviewForm({ productId, initial, onDone, onCancel }: { productId: string; initial: Review | null; onDone: () => void; onCancel: () => void }) {
  const [rating, setRating] = useState<number>(initial?.rating || 0);
  const [comment, setComment] = useState(initial?.comment || '');
  const [photo, setPhoto] = useState<string>(initial?.photo_url || '');
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setErr(tr('Please choose a picture.', 'សូមជ្រើសរើសរូបភាព។')); return; }
    if (file.size > 15 * 1024 * 1024) { setErr(tr('That picture is too big (max 15 MB).', 'រូបភាពធំពេក (អតិបរមា 15 MB)។')); return; }
    setErr(''); setUploading(true);
    try {
      const u = (await supabase.auth.getUser()).data.user?.id;
      if (!u) throw new Error(tr('Please sign in first.', 'សូមចូលគណនីជាមុនសិន។'));
      const small = await optimizeImage(file, 1280);
      const ext = small.type === 'image/png' ? 'png' : small.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${u}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from('review-photos').upload(path, small, { cacheControl: '31536000', contentType: small.type || 'image/jpeg' });
      if (up.error) throw up.error;
      setPhoto(supabase.storage.from('review-photos').getPublicUrl(path).data.publicUrl);
    } catch (x: any) {
      setErr(x?.message || tr('Could not upload the picture.', 'មិនអាចផ្ទុករូបភាពឡើងបានទេ។'));
    }
    setUploading(false);
  }

  async function submit() {
    if (!rating) { setErr(tr('Tap the stars to choose a rating.', 'សូមចុចផ្កាយដើម្បីជ្រើសរើសការវាយតម្លៃ។')); return; }
    setBusy(true); setErr('');
    const r = await supabase.rpc('submit_product_review', {
      p_product_id: productId, p_rating: rating, p_comment: comment.trim() || null, p_photo_url: photo || null,
    });
    setBusy(false);
    if (r.error) { setErr(r.error.message); return; }
    if (initial?.photo_url && initial.photo_url !== photo) void dropPhoto(initial.photo_url); // replaced or removed: clean up the old file
    actionFx('sent');
    void refreshRatings(true);
    onDone();
  }

  return (
    <div className="reviewForm">
      <div className="reviewStarsInput" role="radiogroup" aria-label={tr('Your rating', 'ការវាយតម្លៃរបស់អ្នក')}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={n + ' / 5'} className={n <= rating ? 'on' : ''} onClick={() => setRating(n)}><Star /></button>
        ))}
        <span className="reviewStarWord">{RATING_WORDS(rating)}</span>
      </div>
      <textarea rows={4} maxLength={1000} value={comment} onChange={e => setComment(e.target.value)}
        placeholder={tr('Tell others what you think (optional)', 'ចែករំលែកគំនិតរបស់អ្នកជូនអ្នកផ្សេង (ជម្រើស)')} />
      <div className="reviewFormRow">
        {photo ? (
          <div className="reviewPhotoPreview">
            <img src={photo} alt="" />
            <button type="button" aria-label={tr('Remove photo', 'លុបរូបភាព')} onClick={() => setPhoto('')}><X /></button>
          </div>
        ) : (
          <label className={'reviewPhotoPick' + (uploading ? ' busy' : '')}>
            <Camera /> {uploading ? tr('Uploading…', 'កំពុងផ្ទុកឡើង…') : tr('Add photo', 'បន្ថែមរូបភាព')}
            <input type="file" accept="image/*" hidden onChange={pick} disabled={uploading} />
          </label>
        )}
        <small className="reviewCount">{comment.length}/1000</small>
      </div>
      {err && <p className="reviewErr" role="alert">{err}</p>}
      <div className="reviewFormActions">
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>{tr('Cancel', 'បោះបង់')}</button>
        <button type="button" onClick={submit} disabled={busy || uploading}>{busy ? tr('Sending…', 'កំពុងផ្ញើ…') : initial ? tr('Save review', 'រក្សាទុក') : tr('Submit review', 'បញ្ជូនការវាយតម្លៃ')}</button>
      </div>
    </div>
  );
}

/* ---------- the section on the product page ---------- */
export function ProductReviews({ productId }: { productId: string }) {
  useLang();
  const [state, setState] = useState<'loading' | 'ok' | 'off'>('loading');
  const [rows, setRows] = useState<Review[]>([]);
  const [stat, setStat] = useState<{ count: number; avg: number; dist: number[] } | null>(null);
  const [mine, setMine] = useState<Review | null>(null);
  const [can, setCan] = useState(false);
  const [form, setForm] = useState(false);
  const [shown, setShown] = useState(5);
  const [light, setLight] = useState('');
  const [me, setMe] = useState('');

  const load = useCallback(async () => {
    try {
      const u = (await supabase.auth.getUser()).data.user?.id || '';
      setMe(u);
      const none: any = Promise.resolve({ data: null, error: null });
      const [list, st, mineQ, canQ]: any[] = await Promise.all([
        supabase.from('product_reviews').select('id,user_id,rating,comment,photo_url,reviewer_name,created_at').eq('product_id', productId).eq('status', 'published').order('created_at', { ascending: false }).limit(60),
        supabase.from('product_rating_stats').select('*').eq('product_id', productId).maybeSingle(),
        u ? supabase.from('product_reviews').select('*').eq('product_id', productId).eq('user_id', u).maybeSingle() : none,
        u ? supabase.rpc('can_review_product', { p_product_id: productId }) : none,
      ]);
      if (list.error) { setState('off'); return; } // the SQL file has not been run yet: hide the whole section
      setRows((list.data || []) as Review[]);
      const d = st.data;
      setStat(d && Number(d.review_count) > 0 ? { count: Number(d.review_count), avg: Number(d.avg_rating) || 0, dist: [d.r1, d.r2, d.r3, d.r4, d.r5].map((x: any) => Number(x) || 0) } : null);
      setMine((mineQ.data as Review) || null);
      setCan(!!canQ.data);
      setState('ok');
    } catch { setState('off'); }
  }, [productId]);

  useEffect(() => { setState('loading'); setForm(false); setShown(5); void load(); }, [load]);

  async function remove() {
    if (!mine || !window.confirm(tr('Delete your review?', 'លុបការវាយតម្លៃរបស់អ្នក?'))) return;
    const r = await supabase.from('product_reviews').delete().eq('id', mine.id);
    if (r.error) { window.alert(r.error.message); return; }
    void dropPhoto(mine.photo_url);
    void refreshRatings(true);
    setForm(false);
    void load();
  }

  if (state === 'off') return null;
  if (state === 'loading') return <section className="reviewsSection" id="reviews" aria-busy="true"><div className="reviewsSkel"><i /><i /><i /></div></section>;

  return (
    <section className="reviewsSection" id="reviews" aria-label={tr('Customer reviews', 'ការវាយតម្លៃពីអតិថិជន')}>
      <div className="reviewsHead"><h2>{tr('Customer reviews', 'ការវាយតម្លៃពីអតិថិជន')}</h2></div>

      {stat ? (
        <div className="reviewsSummary">
          <div className="reviewsScore"><strong>{stat.avg.toFixed(1)}</strong><StarRow value={stat.avg} size={18} /><small>{stat.count} {stat.count === 1 ? tr('review', 'ការវាយតម្លៃ') : tr('reviews', 'ការវាយតម្លៃ')}</small></div>
          <div className="reviewsBars">
            {[5, 4, 3, 2, 1].map(n => (
              <div className="reviewsBar" key={n}><span>{n}<Star /></span><i><b style={{ width: (stat.count ? (stat.dist[n - 1] / stat.count) * 100 : 0) + '%' }} /></i><em>{stat.dist[n - 1]}</em></div>
            ))}
          </div>
        </div>
      ) : (
        <p className="reviewsEmpty">{tr('No reviews yet.', 'មិនទាន់មានការវាយតម្លៃនៅឡើយទេ។')}</p>
      )}

      {mine?.status === 'hidden' && <p className="reviewsNote">{tr('Your review is hidden by YN Studio.', 'ការវាយតម្លៃរបស់អ្នកត្រូវបានលាក់ដោយ YN Studio។')}</p>}

      {!form && can && (
        <button type="button" className="reviewWriteBtn" onClick={() => setForm(true)}>
          {mine ? <><Pencil /> {tr('Edit your review', 'កែការវាយតម្លៃរបស់អ្នក')}</> : <><Star /> {tr('Write a review', 'សរសេរការវាយតម្លៃ')}</>}
        </button>
      )}
      {!can && !mine && <p className="reviewsHint">{tr('Only customers who bought this product can write a review.', 'មានតែអតិថិជនដែលបានទិញផលិតផលនេះប៉ុណ្ណោះដែលអាចសរសេរការវាយតម្លៃបាន។')}</p>}

      {form && can && <ReviewForm productId={productId} initial={mine} onCancel={() => setForm(false)} onDone={() => { setForm(false); void load(); }} />}
      {!form && mine && can && <button type="button" className="reviewDeleteLink" onClick={remove}><Trash2 /> {tr('Delete my review', 'លុបការវាយតម្លៃរបស់ខ្ញុំ')}</button>}

      <div className="reviewsList">
        {rows.slice(0, shown).map(r => (
          <article className="reviewItem" key={r.id}>
            <div className="reviewTop">
              <span className="reviewAvatar" aria-hidden="true">{(r.reviewer_name || '?').trim().charAt(0).toUpperCase()}</span>
              <div className="reviewWho">
                <b>{r.reviewer_name || tr('Customer', 'អតិថិជន')}{me && r.user_id === me && <em className="reviewYou">{tr('You', 'អ្នក')}</em>}</b>
                <span className="reviewVerified"><ShieldCheck /> {tr('Verified buyer', 'អ្នកទិញពិតប្រាកដ')}</span>
              </div>
              <time dateTime={r.created_at}>{fmtDate(r.created_at)}</time>
            </div>
            <StarRow value={r.rating} size={14} />
            {r.comment && <p className="reviewText">{r.comment}</p>}
            {r.photo_url && <button type="button" className="reviewPhoto" aria-label={tr('View photo', 'មើលរូបភាព')} onClick={() => setLight(r.photo_url || '')}><img src={r.photo_url} alt="" loading="lazy" /></button>}
          </article>
        ))}
      </div>
      {rows.length > shown && <button type="button" className="secondary reviewMore" onClick={() => setShown(n => n + 10)}>{tr('Show more reviews', 'បង្ហាញការវាយតម្លៃបន្ថែម')}</button>}
      {light && <Lightbox url={light} onClose={() => setLight('')} />}
    </section>
  );
}

/* ---------- admin: moderation list (wrapped in AdminShell by main.tsx) ---------- */
export function AdminReviewsList() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [tab, setTab] = useState<'all' | 'published' | 'hidden'>('all');
  const [err, setErr] = useState('');
  const [light, setLight] = useState('');

  const load = useCallback(async () => {
    const r = await supabase.from('product_reviews').select('*, products(name,main_image_url)').order('created_at', { ascending: false }).limit(300);
    if (r.error) {
      setErr(/product_reviews|relation|schema cache/i.test(r.error.message) ? 'Run supabase-product-reviews.sql in Supabase first.' : r.error.message);
      setRows([]);
      return;
    }
    setErr(''); setRows(r.data || []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function toggle(x: any) {
    const r = await supabase.from('product_reviews').update({ status: x.status === 'published' ? 'hidden' : 'published' }).eq('id', x.id);
    if (r.error) { window.alert(r.error.message); return; }
    void refreshRatings(true);
    void load();
  }
  async function remove(x: any) {
    if (!window.confirm('Delete this review for good?')) return;
    const r = await supabase.from('product_reviews').delete().eq('id', x.id);
    if (r.error) { window.alert(r.error.message); return; }
    void dropPhoto(x.photo_url);
    void refreshRatings(true);
    void load();
  }

  const all = rows || [];
  const list = all.filter(x => tab === 'all' || x.status === tab);
  const published = all.filter(x => x.status === 'published');
  const avg = published.length ? published.reduce((a, x) => a + Number(x.rating || 0), 0) / published.length : 0;

  return (
    <div className="adminReviews">
      <div className="adminReviewsStats">
        <div><b>{all.length}</b><span>Reviews</span></div>
        <div><b>{avg ? avg.toFixed(1) : '–'}</b><span>Average ★</span></div>
        <div><b>{all.length - published.length}</b><span>Hidden</span></div>
      </div>
      <div className="adminReviewsTabs">
        {(['all', 'published', 'hidden'] as const).map(t => <button key={t} type="button" className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'all' ? 'All' : t === 'published' ? 'Published' : 'Hidden'}</button>)}
      </div>
      {err && <p className="notice">{err}</p>}
      {rows === null && <p className="muted">Loading…</p>}
      {rows !== null && !list.length && !err && <p className="muted">No reviews here yet. They appear when customers who bought a product rate it.</p>}
      <div className="adminReviewsList">
        {list.map(x => (
          <article className={'adminReviewRow' + (x.status === 'hidden' ? ' isHidden' : '')} key={x.id}>
            <img className="adminReviewProduct" src={x.products?.main_image_url || '/yn-logo.png'} alt="" />
            <div className="adminReviewBody">
              <b>{x.products?.name || 'Deleted product'}</b>
              <div className="adminReviewMeta"><StarRow value={Number(x.rating || 0)} size={14} /><span>{x.reviewer_name || 'Customer'} · {fmtDate(x.created_at)}</span>{x.status === 'hidden' && <em>Hidden</em>}</div>
              {x.comment && <p>{x.comment}</p>}
              {x.photo_url && <button type="button" className="reviewPhoto" onClick={() => setLight(x.photo_url)}><img src={x.photo_url} alt="" loading="lazy" /></button>}
            </div>
            <div className="adminReviewActions">
              <button type="button" className="secondary" onClick={() => toggle(x)}>{x.status === 'published' ? <><EyeOff /> Hide</> : <><Eye /> Show</>}</button>
              <button type="button" className="icon danger" title="Delete" aria-label="Delete review" onClick={() => remove(x)}><Trash2 /></button>
            </div>
          </article>
        ))}
      </div>
      {light && <Lightbox url={light} onClose={() => setLight('')} />}
    </div>
  );
}
