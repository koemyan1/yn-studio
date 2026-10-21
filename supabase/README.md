# supabase/

| Path | What it is |
|---|---|
| `sql/` | The ~50 SQL scripts you paste into **Supabase -> SQL Editor**. Order: [`sql/RUN-ORDER.md`](sql/RUN-ORDER.md). |
| `migrations/` | Reserved for **timestamped** migrations the Supabase CLI can run. Only add files named `YYYYMMDDHHMMSS_name.sql` here. |
| `functions/` | Supabase Edge Functions. |
| `config.toml` | Supabase CLI config. |

## Create the baseline (the one missing piece)

The app needs tables that **no SQL file in this repo creates** (`profiles`, `wallets`, `orders`, `order_items`, `products`, `carts`, `cart_items`, ... and the debt tables). They exist in your live project because they were made in the dashboard. Until they are in the repo, nobody (including you after a mistake) can rebuild the database from this folder.

The exact list is in [`docs/SCHEMA-COVERAGE.md`](../docs/SCHEMA-COVERAGE.md) (regenerate with `npm run schema:coverage`).

**Export the real schema (5 minutes, free):**

1. Install the Supabase CLI and log in: `npx supabase login`, then `npx supabase link --project-ref <your-project-ref>`.
2. Dump the structure only (no customer data):
   ```
   npx supabase db dump --schema public -f supabase/migrations/20260101000000_baseline.sql
   ```
   Add `--schema storage` in a second file if you also want bucket policies.
3. Open the file and check it contains your RLS policies (`create policy`) and your functions. Remove nothing.
4. Run `npm run schema:coverage` again. The "missing" tables list should now be empty.
5. Commit the baseline. **Never commit a dump made with `--data-only` or a full dump: it contains customer data.**

Why not a hand-written baseline? Writing one from the app code would only be a guess at your column types, defaults and policies, and a wrong guess is worse than none (it would look authoritative). The export is the truth.

## Server-side order pricing

`sql/supabase-server-side-order.sql` adds `yn_place_order()`, so the database (not the browser) calculates prices, delivery fee and total. It has a staged rollout (report -> enforce). Steps are in the header of that file, and a self-test is in `tests/sql/place-order.test.sql`.
