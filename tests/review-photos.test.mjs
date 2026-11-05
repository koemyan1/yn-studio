// Review photos (up to 3) + the Customer photos strip: the database must only accept the caller's own pictures.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const sql = fs.readFileSync(path.join(root, 'supabase/sql/supabase-review-photos-gallery.sql'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'src/Reviews.tsx'), 'utf8');

test('SQL: extra photos only from the caller\'s own folder, max 2 extra, own review only', () => {
  assert.match(sql, /security definer/);
  assert.match(sql, /v_prefix := '\/storage\/v1\/object\/public\/review-photos\/' \|\| v_uid::text \|\| '\/'/);
  assert.match(sql, /strpos\(v_u, v_prefix\) = 0 then raise exception/);
  assert.match(sql, /cardinality\(v_clean\) > 2/);
  assert.match(sql, /where product_id = p_product_id and user_id = v_uid/);
  assert.doesNotMatch(sql, /set[^;]*\bstatus\b/i, 'must never touch the moderation status');
  assert.match(sql, /revoke all on function public\.set_review_extra_photos\(uuid, text\[\]\) from public, anon/);
  assert.match(sql, /grant execute on function public\.set_review_extra_photos\(uuid, text\[\]\) to authenticated/);
});
test('SQL: the public bucket is limited to images and 8 MB', () => {
  assert.match(sql, /file_size_limit = 8388608/);
  assert.match(sql, /allowed_mime_types = array\['image\/jpeg'/);
  assert.doesNotMatch(sql, /application\//);
});
test('the existing submit_product_review function is untouched', () => {
  assert.doesNotMatch(sql, /(create|drop)\s+(or replace\s+)?function\s+public\.submit_product_review/i);
});
test('UI: old databases keep working (the list falls back when the new column is missing)', () => {
  assert.match(ui, /a\.error \? q\(base\) : a/);
  assert.match(ui, /MAX_PHOTOS = 3/);
});
test('UI: nothing but hidden-aware published reviews feed the Customer photos strip', () => {
  assert.match(ui, /\.eq\('status', 'published'\)/);
  assert.match(ui, /className="reviewGallery"/);
});
