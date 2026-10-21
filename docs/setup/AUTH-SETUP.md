# YN Studio authentication setup

This version uses Supabase Auth directly from the frontend, as the original Vite setup did. Signup and sign-in both use the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; the web server no longer creates users with a service-role key or needs `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.

## Render environment

Set these two variables for the Vite build:

- `VITE_SUPABASE_URL` = `https://fdqrmzlnahrrqfervlde.supabase.co` (or your intended project URL)
- `VITE_SUPABASE_ANON_KEY` = the public/anon key from that exact Supabase project

Save and redeploy so Vite rebuilds the frontend. Remove old `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` variables if they were only added for the previous signup endpoint; they are not used by this version.

## Supabase Auth settings

If you want signup to immediately sign the customer in without an email verification step, open Supabase Authentication settings and turn off email confirmation. With confirmation enabled, Supabase returns no active session until the user confirms their email, and the app explains that instead of reporting a false sign-in failure.

## Profiles

After signup, the app attempts to upsert a customer row in `profiles` using `user_id`, `name`, `email`, and `role: customer`. A profile-write error is logged without pretending the Auth account failed to be created. Admin roles are read from `profiles` during sign-in.

Never put a service-role key in a `VITE_` variable or expose it in the browser.
