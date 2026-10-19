# Stay logged in (no more surprise log-outs)
- `Protected` used to go to the login page on ANY auth event that had no session, and `getSession()` returning nothing during a bad connection counted as logged out. Now:
  - Only a real `SIGNED_OUT` event leaves the page, and only after re-checking that the saved login is truly gone.
  - If the app starts offline / on a weak connection, it waits and retries (up to ~5 times) instead of sending the customer to login.
  - When the app comes back to the foreground or the internet returns, the login is refreshed immediately.
- `src/supabase.ts` asks the browser for persistent storage so the saved login is not cleared when the phone is low on space.
- Same patient check for the admin guard.

## If people are STILL logged out: check Supabase (this is not in the code)
Supabase Dashboard > Authentication > Sessions: make sure **"Time-box user sessions"** and **"Inactivity timeout"** are OFF (or very long). Under Settings, a very short **JWT expiry** is fine (the app refreshes it), but do not enable refresh-token limits.
Signing out on purpose still works: the Log-out buttons call `signOut()` and go to login.
