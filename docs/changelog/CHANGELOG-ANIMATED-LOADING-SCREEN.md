# Animated loading screen (first open)

- New animated YN logo splash that shows while the app starts: the logo blurs in and settles, a soft glow and two pulse rings spread behind it, a light sweep crosses the letters, "YN STUDIO" fades in with a small progress bar. Shown at least ~1.3 s, then fades out. Calmer version for phones set to "reduce motion".
- It lives in `index.html` **outside** `#root`, so React starting up no longer restarts or flashes it; `src/main.tsx` fades it out once the app is on screen. A failsafe in `public/preload.js` removes it after 9 s if the app never starts.
- The same look is used for the "busy" overlay (payments and other long actions) when no custom loading picture is set. If a custom picture is set in Admin > Settings, it still takes over; returning visitors no longer see the default splash first (the choice is remembered in `localStorage` key `yn-loader-cfg-v1`).
- Edited: `index.html`, `public/preload.js`, `src/main.tsx`.
