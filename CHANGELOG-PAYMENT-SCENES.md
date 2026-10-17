# Payment received: a different animation per payment type

New files: `src/PaymentScenes.tsx`, `src/paymentScenes.css`. Edited: `src/main.tsx`, `src/payment.css`.

- **Order** (any order, whatever was bought): the item drops into a box, the flaps close, tape seals it, the box hops, a tick pops.
- **Wallet top-up**: a banknote showing the amount (plus a few coins) flies into the wallet, the wallet jiggles, a tick pops.
- **Debt, not fully paid**: a jar fills with the debt, then a chunk is scooped out and the level drops by what was paid. A "-$amount" chip appears and an extra "Remaining debt" row is shown.
- **Debt fully paid**: a paper that says DEBT shakes, cracks and is ripped in two, then a big tick. After you tap Done, the Debt tab in the bottom nav tears away, then the app goes to Home.
  - "Fully paid" = the paid amount is at least the balance the Debt page had when the payment started.
  - The Debt page no longer jumps to Home in the middle of the animation when the balance reaches 0.
- The title, amount (counts up), details and Done button now appear when each scene finishes; the screen closes itself about 5 s after that.
- Closing the screen with X or by tapping outside after the payment succeeded now does the same as Done.
- Honours "reduce motion" (shows the finished state with no movement).
