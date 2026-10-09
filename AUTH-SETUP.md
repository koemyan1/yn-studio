# YN Studio Authentication Setup

Customer registration uses three fields: name, email, and password. The Node server creates the Supabase Auth account with email confirmation already completed, stores the `profiles` row, and the frontend signs the new customer in using the normalized lowercase email. No email verification code, SMTP configuration, or `email_otps` table is required. If the server is not running/deployed with the frontend, registration will fail. Admins can create orders for existing customers from Admin → Orders → Create order for customer.

## Required server variables

Set these on the Render Web Service:

- `SUPABASE_URL` — the Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — the Supabase service-role key; keep it server-only and never prefix it with `VITE_`.

Google sign-in remains available if its OAuth provider is configured in Supabase. Existing customer records, orders, wallets, transactions, wishlists, and support records are not deleted by this change.
