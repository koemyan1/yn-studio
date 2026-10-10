# Render TypeScript build fix

Fixed TS18047 in `src/main.tsx` by reading `price_adjustment` with null-safe access and storing it in a local numeric variable before use. This addresses the reported `v.data is possibly null` compiler error.

Deploy this project and run `npm run build`. This change addresses the reported compiler error only; it does not claim that the entire deployment or live Supabase integration has been tested.
