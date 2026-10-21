# Theme Studio v3 — what's new

## Run these once (Supabase → SQL Editor)
1. `supabase-theme-studio-v3.sql` – creates the public `theme-assets` bucket so theme pictures are uploaded (without it pictures still work; they are embedded in the theme).
2. `supabase-aba-payway.sql` – only if you want ABA PayWay (see `ABA-PAYWAY-SETUP.md`).

## Admin → Secret Code
| Tab | What you can do |
|---|---|
| **Look** | Colours, **Dark mode** (off / follow phone / always, with auto-made dark colours), **Background of everything** (gradient, moving gradient, frosted-glass cards, wallpaper), 🎲 *Surprise me* random look |
| **Categories** | Tick exactly which categories (and their products) this theme shows, with product counts. Option to hide uncategorised products. Overrides the older per-category table. |
| **Products** | Product pictures: keep / remove background / remove + one colour / **random colour per product** / random gradient. *Shuffle* re-rolls. Strength slider. Works live in the customer's browser; originals are never changed. |
| **Elements** | Add **buttons, text, pictures**. **Drag them in the preview**, resize with the pink corner. Choose what a button does, how it looks (gradient / solid / outline / glass / your own picture as the button face or icon, shape, shadow, hover), and how it moves. |
| Parts / Text / Layout & pages / Advanced | As before |

The preview bar has **Select parts / Move elements / Try it**, and a **Light / Dark** preview switch.
The whole Studio now follows the admin dark mode (and your phone/computer setting until you choose one).

### Button actions
Open a store page · show a category · open a product · search a word · open a web link · call · Telegram ·
**switch Khmer ⇄ English** · **dark ⇄ light** · **random background colour** · **shuffle product picture colours** ·
confetti · pop-up message · scroll to top.

### Movement
Float · pulse · wiggle · jump · spin · **fly around the screen** · **bounce off the edges** · sweep across (either way) · fall · orbit. Speed 1–10. (Customers with "reduce motion" turned on are not shown the flying animations.)

## Customer app
* **Khmer / English button** in the top bar (and on the login screen). Remembered per device. All screens are covered: text already wrapped in `tr()` plus ~110 extra strings that are translated automatically (`src/lang.tsx`). Add more in the `KM` list there.
* **Dark mode** per theme (see above); customers can flip it with a button you add.
* Product cards, gallery and cart use the themed pictures.
* A few polish touches: lift/zoom on product cards, press feedback, page-in animations, smoother scrolling, nicer scrollbars. All respect "reduce motion".

## Admin → Products
* The old "remove white background" option is replaced by a better remover that handles **any plain background colour**, with strength slider and optional **replace with colour / random colour**.
* ✂️ on an existing photo cuts its background out (the original file stays in storage).

## ABA PayWay
New server endpoints (`/api/aba/*`) + a **Pay now with ABA PayWay** button in checkout and in *My orders*. See `ABA-PAYWAY-SETUP.md`.

## Good to know
* Background removal is a colour-based cut-out (no AI): great for studio photos on plain backgrounds; photos with busy backgrounds are left unchanged, and *white products on white backgrounds* may lose parts — lower the strength.
* Existing themes keep working (old elements are converted automatically).
* Verified in a real browser with a simulated backend (dragging, resizing, actions, motion, dark mode, categories, product cut-outs, Khmer switch) and the PayWay server against a simulated PayWay/Supabase. I could not run `npm install`/`vite build` or reach ABA/Supabase from here, so please run `npm run build` and the ABA sandbox test before going live.
