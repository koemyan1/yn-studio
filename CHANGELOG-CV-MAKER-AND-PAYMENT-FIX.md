# CV maker ($3) + Bakong payment fix

## Setup (3 steps)
1. Supabase -> SQL Editor: run `supabase-cv-maker.sql` (table `cv_orders` + wallet payment function).
2. Redeploy (new files: CvMaker.tsx, cvTemplates.tsx/.css, cv.css; changed: main.tsx, Services.tsx, PaymentScenes.tsx, paymentScenes.css, server/index.js).
3. Open `https://YOUR-APP/api/bakong/health` and read `verdict` (see below).

## CV maker
- Services page has a new CV card -> `/services/cv`.
- Flow: pick template (7 blank designs) -> English/Khmer -> fill info -> pay $3 (KHQR or wallet) -> generating animation -> preview, edit, Save as PDF.
- Price ($3.00, DB default of `cv_orders.price`) and paid status can only be changed by the server / wallet function.
- Paid CVs are listed under "Your CVs" and can be reopened and edited for free. Template and language are fixed after paying.
- Save as PDF uses the browser print dialog (choose "Save as PDF", margins None). This keeps Khmer text perfect.
- New animations: CV payment-success scene (sheet writes itself + tick), and the CV generating animation (scan line fills the template with the customer's info).

## Payment fix: "QR shows but never approves"
Real bug fixed: any Bakong answer with `responseCode 1` was treated as "not paid yet", so an expired token or wrong response looked like waiting forever. Now only "transaction not found" means pending; everything else is logged and the customer sees a "bank check unreachable" note.
Also: account/currency matching no longer fails if Bakong omits a field.
Most likely cause on your side (cannot be confirmed without your server): Bakong API blocks non-Cambodian IPs or the token expired. Check `/api/bakong/health`:
- TOKEN_REJECTED -> renew `BAKONG_API_TOKEN`.
- BLOCKED_OR_NOT_API / UNREACHABLE -> host the server in Cambodia or set `BAKONG_API_BASE_URL` to a proxy in Cambodia.
- OK -> check the Render logs for "Bakong mismatch".
