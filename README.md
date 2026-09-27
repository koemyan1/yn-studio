# YN Studio

Responsive React + Supabase marketplace.

## Local setup
1. Copy `.env.example` to `.env.local`.
2. Put your Supabase URL and anon key in `.env.local`.
3. Run `npm install`.
4. Run `npm run dev`.
5. Run `npm run build` before deploying.

## Authentication
The app uses Supabase Auth with persistent sessions. A customer who has no session is sent to `/login`; after signing in, they reach the marketplace. Returning customers with a valid session go directly to the marketplace. Logging out clears the session.
