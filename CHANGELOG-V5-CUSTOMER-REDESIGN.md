# v5 – customer side redesign ("Aurora")

Everything customer-facing (Login, Home, Product, Cart, Checkout, Orders, Wallet, Debt, Rewards,
Wishlist, Notifications, Support chat, Profile) has a new look and new motion. Admin screens are untouched.

## New / changed files
- `src/customer.css`  – the whole redesign (imported last in `main.tsx`)
- `src/fx.ts`         – tiny motion helper (scroll state + cursor spotlight on cards)
- `src/main.tsx`      – 4 small edits: sliding nav indicator, page-transition wrapper (`RouteFx`), discount badge on product cards, imports
- `index.html`        – Outfit + Inter fonts, first-paint splash logo

## What you get
- Animated aurora background with a soft dotted grid that drifts as you scroll
- Glass top bar and floating bottom dock with a **gradient pill that glides** between tabs
- **Page transitions**: pages slide + un-blur in with a stagger (forward = from the right, Back = from the left), new page starts at the top
- Product cards: staggered pop-in, scroll-reveal for cards further down, lift + cursor spotlight on hover, heart pop, `-NN%` badge when there is an original price
- Category chips become gradient pills (with 🍦 ☕ 🧋 🍰 🍔 🍱 icons for matching categories)
- Product page: soft studio-style gallery, gradient price, gradient option chips, glass sticky buy bar
- Cart: glowing gradient border on selected items, floating checkout bar that springs up
- Checkout / wallet / payment modals: blurred backdrop, spring-in cards
- Wallet + Home fallback hero: animated mesh gradient with a light sheen
- Orders: accent bar cards, pulsing status dots
- Chat: gradient "mine" bubbles with pop-in
- Sign-in: floating logo, animated gradient headline, frosted card
- Buttons: gradient with a sweeping shine on hover

## Themes
The default storefront gets the new look. Secret-code themes (Chiikawa, custom) still layer on top exactly as before –
the redesign rules are switched off while a theme is on. Page transitions and the entrance animation work in every mode.

## Notes
- Respects "reduce motion" (all animation is turned off for those users).
- Not verified here: `npm install` / `npm run build` and a visual check in a browser (no network / browser in this environment).
  Please run `npm run build` and look over each page once.
- Home-screen installs cache assets – if the old look shows, reload twice or reinstall the app.

## v5.1 fixes
- Checkout button text was invisible: the fixed checkout bar sits outside the page container, so the gradient variable was undefined and the button had no background (white text on white). Tokens now live on `<html>`.
- Banner no longer zooms out/in while sliding (removed the Ken-Burns loop).
