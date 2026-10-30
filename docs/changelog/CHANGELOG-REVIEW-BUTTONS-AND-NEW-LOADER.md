# Easy-to-find "Write a review" + calmer loading screen

## What was wrong
- The "Write a review" button only showed for a signed-in customer who had already bought that product. Everyone else saw a faint grey sentence and no button, and the section sits at the very bottom of the product page, so it looked like customers could not review at all.
- The first-open loading screen had too many things moving at once (floating blobs, glow, two pulsing rings, a shine, a progress bar) and always stayed for at least 1.3 seconds.

## Reviews: where a customer can click now
1. **Under the product name** (product page): stars + "(12 reviews)" or "No reviews yet", and a **Write a review** button. It scrolls down and opens the form.
2. **In the Customer reviews section**: the big purple **Write a review** button is always there. A customer who has not bought the product taps it and gets a clear note ("Only buyers can review... once your order is paid you can rate it here or from Orders") instead of nothing.
3. **Orders page and the order screen**: under every item of a paid order there is a **Write a review** button (it becomes "Edit your review" with the stars once rated). It opens a small window with the same form (stars, words, photo). This is the place customers naturally go after buying.

The rule did not change: **only customers who bought the product can review it**, and the database enforces it. One review per customer per product. To let everyone review, edit `yn_has_bought_product()` in `supabase/sql/supabase-product-reviews.sql` (return true) and run the file again.

### SQL: run `supabase-product-reviews.sql` again (safe to repeat)
The "bought it" check now also accepts the status `delivered` and **any status marked "counts as paid" in order statuses** (for example "left china warehouse"). Before, a real buyer whose order was in one of those statuses but whose `payment_status` was not `paid` could not review.

Until the SQL has been run, all review buttons stay hidden (same as before).

## Loading screen
- New look: the YN logo inside a slim spinning purple ring, "YN STUDIO" underneath, flat soft-lavender background. One moving part, no entrance animation, fades out in 0.28 s.
- Shown for at least ~0.6 s (was 1.3 s) and then as soon as the app is ready. The custom loading picture set in Admin > Settings still replaces it, and its minimum time is shorter too (0.7 s, was 1.4 s).
- The same ring is used for the "please wait" screen during payments.

## Files
`index.html`, `src/main.tsx`, `src/Reviews.tsx`, `src/growth.css`, `supabase/sql/supabase-product-reviews.sql`.

## Checked / not checked
Checked: the review buttons, form, "buyers only" note, Orders window, edit/re-open, hidden-when-SQL-missing, and the new loader were exercised in a real browser against a fake database; `node --test` (59 pass); syntax check of `main.tsx` and `Reviews.tsx`.
Not checked: `npm run build` / the full app (the package registry was not reachable where this was made), the SQL on a real Supabase database, an on-device test.
