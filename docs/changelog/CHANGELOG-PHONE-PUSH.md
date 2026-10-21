# Phone push notifications
New: supabase-push.sql, supabase/functions/send-push, src/push.ts, src/PushToggle.tsx, src/push.css, tools/generate-vapid.mjs, PUSH-SETUP.md.
Edited: public/sw.js (push + click handlers, cache v3), src/main.tsx (toggle on Profile, Notifications, Admin > Notifications), supabase/config.toml, .env.example.
Follow PUSH-SETUP.md (7 steps). Not checked: build, on-device test, or a real push (needs your keys + deployed function).
