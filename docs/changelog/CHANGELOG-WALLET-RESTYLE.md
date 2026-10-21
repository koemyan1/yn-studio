# Wallet page restyle
* `src/wallet.css` (new, imported in main.tsx) + new `WalletPage` in main.tsx. No SQL or server changes.
* Hero: two balance tiles (Dollar wallet / Riel wallet), each with its own "Add" button that jumps to the top-up form with that currency selected.
* Add money: currency toggle, one big amount field with $ / ៛ prefix, quick-amount chips ($5/10/20/50 or 20,000/40,000/100,000/200,000 ៛), the button shows the amount ("Pay $10.00 with KHQR").
* Recent activity: filter (All / Dollar / Riel), grouped by day (Today, Yesterday, date), in/out icons, green for money in, a small $ / ៛ tag per row.
* Colours come from the active theme (currentColor / existing theme containers), so Coraline, Spidey, Chiikawa and the default theme keep their own look.
