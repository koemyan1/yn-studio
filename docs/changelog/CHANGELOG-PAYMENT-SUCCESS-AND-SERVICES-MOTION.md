# Payment-received celebration + Services page motion

## Payment received screen (src/main.tsx, src/payment.css)
Shown after every KHQR payment (order, wallet top-up, debt).
- Green flash behind the badge, rotating light rays, twinkling gold stars around the tick.
- Bigger confetti burst (34 pieces, 4 shapes, 6 colours) plus a confetti rain falling over the card.
- The amount counts up from 0 to the paid value (works for $ and riel).
- A shine sweeps across the amount; the badge floats gently; the Done button softly glows.
- Phone vibrates briefly when the payment is confirmed (where the device supports it).
- Screen now stays 5.2 s before closing on its own (was 4.2 s); Done still closes it instantly.

## Services page (src/Services.tsx, src/services.css)
- Hero sheet drops in like paper, a print-head line sweeps across it, crop marks pop in, the 4 CMYK dots bounce in and then keep drifting so their colours overlap and mix.
- Group headings, cards, the suggestion box and "Your requests" reveal as you scroll; headings draw their underline; tags pop in one by one.
- Service cards lift on hover, halftone dots drift on the coloured side, the icon bobs (and wiggles on hover), the Request button has a periodic shine.
- Status pills (Received / In progress) pulse softly.
- Request sheet: backdrop fades, sheet springs up, and the "Request sent" state now has a confetti burst, a drawn green tick and a pulsing ring.

All of it respects "reduce motion" settings. No database changes.
