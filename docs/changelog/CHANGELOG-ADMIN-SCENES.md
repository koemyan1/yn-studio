# Admin animated scenes (payment-success style)

Illustrated, looping scenes for the admin side – same style as the "Payment received" animations.

## 1. A scene on every admin page (top of the page)
Dashboard = the shop opens and coins pop out · Products = item drops into a box · Snacks = bouncing cookies ·
Categories = swinging tags · Themes = paint palette + brush stroke · Product Mascots = jumping blob · Banners = picture frames taking turns ·
Coupons = shining ticket · Orders = delivery truck on a moving road · Package Labels = printer pushes out a barcode label ·
Order Statuses = pin travels a track, stops turn green · Customers = avatars pop up with a heart · Debt = jar + scooped chunk ·
Wallet = money flies into the wallet · Transactions = receipt prints its lines · Requests = CV writes itself ·
Notifications = ringing bell · Support = chat bubbles + typing dots · Settings = turning gears.
Tap the × to hide a scene (remembered); a small "Show page scene" chip brings it back.
Not shown on: Video Editor, AI Assistant, Secret Code, product add/edit forms.

## 2. Celebration after admin actions (centered card, 3 seconds, tap to close)
- Order payment approved → item goes into a box
- Wallet deposit approved → money with the amount flies into the wallet
- Debt payment recorded → jar fills; if fully paid → the DEBT paper is ripped
- Product saved / updated → item goes into a box
- Coupon created → shining ticket with a pulse
Trigger your own anywhere: `adminScene({kind:'order'|'wallet'|'debt'|'debtClear'|'cv'|'ticket', label:'…', sub:'…'})` (import from `./AdminScenes`).

## Files
- new: `src/AdminScenes.tsx`, `src/admin-scenes.css`
- edited: `src/main.tsx` (import, banner inside `AdminShell`, `<AdminActionScene/>` in `App`, 5 `adminScene(...)` calls)
- plus the earlier micro-animations: `src/admin-motion.css`, `src/adminMotion.tsx` (see CHANGELOG-ADMIN-MOTION.md)

All motion respects "reduce motion". No new packages, no SQL.
