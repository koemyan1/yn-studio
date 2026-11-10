# YN CORE OWNER: the "big boss" and the Admins page

## What it does

- **One owner (the big boss)** sees two extra pages in the admin menu: **YN CORE** and **Admins**. (YN EMERGENCY too, from inside YN CORE.)
- On **Admins** the owner can search any account and make it an admin, or remove an admin. Every single change needs a fresh **Face ID** on the owner's phone (one time per change, it cannot be reused).
- When `YN_CORE_GATE=on`, the Admins page and YN CORE are also behind the **five-coin ritual** (see `YN-CORE-GATE.md`).
- **Admins the owner appoints** use the normal admin (orders, products, customers...). They do **not** see the Admins page or YN CORE: the menu hides them, and the server answers a plain "Not found" if they try the address.
- Every appointment or removal is written to the YN CORE audit log and sends an alert.

## Why the SQL step matters

Before this, "admins are exempt" in the profile guard meant **any admin could make anyone admin** by calling Supabase directly from the browser, without any page. `supabase-yn-core-owner.sql` closes that: a browser, even an admin's, can no longer change `profiles.role`. Only your server (after the owner checks above) and the SQL editor can.

## Set it up (once)

1. Supabase > SQL Editor > run `supabase/sql/supabase-yn-core-owner.sql` (step 53 in RUN-ORDER.md).
2. Add yourself as owner (only you can do this, in the SQL editor; the website cannot):
   ```sql
   insert into public.yn_core_owners (user_id)
     select user_id from public.profiles where lower(email) = lower('YOUR-EMAIL@example.com') on conflict do nothing;
   select * from public.yn_core_owners;   -- should show one row
   ```
3. Deploy, sign in, open **Admins**. You should see yourself marked "Owner".

Until step 2 is done ("no owner yet"), YN CORE works for admins exactly as before, and appointing admins is switched off. If the database cannot be reached the owner check fails closed (nobody gets in).

## Good to know

- Owners cannot be added, removed or changed from the website. To change the owner, edit `yn_core_owners` in the SQL editor.
- You cannot remove yourself or another owner from the Admins page.
- **Each change needs only Face ID, not all five coins again.** The coins open the page (when the gate is on); Face ID approves each change. If you want the full five coins for every change, tell me and I will add it.
- An appointed admin who also has a customer account keeps it; removing admin just sets the role back to `customer`.
- The Admins page and YN CORE need the same passkey you registered in YN CORE > Security.

## Undo

Re-run `supabase-security-hardening.sql` (restores the old guard) and `drop table public.yn_core_owners;`. Then every admin behaves as before.

## Tests

`node --test tests/core-owner.test.mjs` (12 tests: only owners get in, appointed admins get 404, one Face ID per change, wrong person's session refused, bad targets refused before the session is spent, search injection stripped, no-owner-yet and missing-table behaviour, database errors fail closed, gate scope).
