# Authentication restore

- Restored direct Supabase `auth.signUp` and `auth.signInWithPassword` from the Vite frontend.
- Removed the separate server-side signup flow that created accounts with a service-role client and then tried to sign in from a potentially different project.
- Removed the web server's requirement for `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Added graceful handling for Supabase email-confirmation mode and profile-write errors.
