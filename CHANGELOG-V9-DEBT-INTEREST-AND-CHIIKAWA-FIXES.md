# v9 – weekly debt interest fixed + Chiikawa phone layout fixes

## 1. Debt: the weekly interest never got added
Run **`supabase-debt-interest-fix.sql`** once in Supabase → SQL Editor (safe to re-run). Then reload Admin → Debt Management.

Causes found
- The function the app calls to add interest (`accrue_customer_debt_interest`) is not in any SQL file of the project, so nothing in the project added interest.
- Accounts created in Admin → Debt Management were saved without `next_interest_at` (the date of the next weekly interest), so there was never anything scheduled.
- Interest was only attempted when the *customer* opened their Debt page, and it could not catch up several missed weeks. The admin screen never triggered it.

Now
- Interest is added for **every** missed week, counted every 7 days from the account's **Start date** (or the day it was created). Example: $139 starting 5 Oct, fixed $5/week → $144 on 12 Oct, $149 on 19 Oct …
- Runs when the customer opens Debt, when an admin opens Debt Management, before every payment / new debt, and hourly if pg_cron exists on the project.
- No interest while the balance is 0 or the account is disabled; paying off clears the schedule and new debt later restarts it from its own date (no back-charging).
- Existing accounts are repaired and caught up when the SQL runs.
- Percent interest is charged on the balance at that moment (compounding); fixed interest is a flat amount each week. Interest keeps being added after the End date while money is still owed.
- Customer Debt page: new **Interest added** figure, correct **Additional debt**, and the **next interest date**; the history shows each week's interest with its date. Admin list shows the next interest date; a red banner appears if the SQL has not been run.

## 2. Chiikawa theme fixes (phones)
- The banner was wider than the page (minimum height × aspect ratio pushed its width out): it stuck out to the right and made the page scroll sideways (up to ~78px at 320px wide). Fixed in `chiikawa.css` and `style.css`.
- The six bottom-bar buttons did not fit on phones narrower than ~400px and stuck out of the bar. They now shrink to fit.

## Files
New: `supabase-debt-interest-fix.sql`
Edited: `src/main.tsx` (Debt pages), `src/chiikawa.css`, `src/style.css`, `src/customer.css`

## Checked / not checked
Checked: a Python model of the accrual loop (your case, 8 missed weeks, percent, paid off, disabled, new debt after payoff); the Chiikawa home page rendered in real Chrome with the project's CSS at 320/360/390/768/1280px before and after (no sideways overflow after).
NOT checked: the SQL has not been executed (no Postgres here) – run it and check Admin → Debt Management; `npm run build`.
