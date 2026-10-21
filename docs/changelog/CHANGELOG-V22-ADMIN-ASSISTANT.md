# V22 – Admin AI assistant (Jarvis)

## What's new
- **Floating bot avatar** on every admin page. Drag it anywhere (position is remembered); tap it to open the chat.
  On phones the chat opens as a bottom sheet. Hide it any time in AI Assistant → settings.
- **Better chat**: bubbles with times, typing dots, quick-command chips, step lines ("➜ Clicking Save"), voice in (mic), hands-free wake word, speak-replies toggle, clear chat.
- **Touch to stop**: while the assistant is working, any real touch / click / key press / scroll stops it at once
  (also the Stop button). Everything it does to the page checks for this, so a stopped task can't keep clicking.
- **New admin page: AI Assistant** (sidebar → System) to teach it commands:
  - *Reply*: answer with text (supports `{slots}` like "customer {name}")
  - *Steps*: go to a page, click, type, scroll, wait, dark mode, refresh
  - *Code*: your own JavaScript with `ctx.say / go / click / type / supabase …`
  - Enable/disable, edit, duplicate, delete, test, export / import JSON, "things it didn't understand" list.
- **Built-in store commands**: pending orders, sales (today/total), latest orders, find order YN-…, customers / products count,
  unread notifications, open any admin page, dark/light mode, refresh, plus weather, calculator, timers, notes, who-is.
- Destructive-looking clicks (delete, refund, cancel, sign out…) ask for a "yes" first.

## Setup (once)
1. Run `supabase-admin-assistant.sql` in the Supabase SQL editor (creates `assistant_skills`, admin-only).
2. Deploy as usual. No new npm packages.

## Files
- new: `src/assistantEngine.ts`, `src/AdminAssistant.tsx`, `src/AdminAssistantTeach.tsx`, `src/assistant.admin.css`, `supabase-admin-assistant.sql`
- edited: `src/main.tsx` (imports, sidebar item, `/admin/assistant` route, bot mounted in `App`)

## Notes
- Admin only: the bot renders only for signed-in profiles with `role = 'admin'`, only on `/admin/*`, never in the theme-editor preview.
  The skills table has an admin-only RLS policy, so customers cannot read the commands or the code.
- Taught *code* runs in the admin's browser with the admin's session – only teach it code you trust.
- Voice needs Chrome / Edge / Safari and HTTPS.
