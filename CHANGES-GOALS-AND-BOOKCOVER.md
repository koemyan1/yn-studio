# Latest changes

## Wallet Goals
- src/WalletGoals.tsx, src/walletGoals.css (new), src/main.tsx (shows Goals on the Wallet page)
- supabase/sql/supabase-wallet-goals.sql: run once in Supabase (optional; without it goals are saved on the device)

## Book cover: JPEG save + A4 sheet with two A5 covers
- src/bookCoverSheet.tsx, src/AdminBookCovers.tsx, src/BookCover.tsx, src/bookCover.css

## Removed AI Assistant (admin) and YN Vision (customer search)
- Deleted: src/AdminAssistant.tsx, src/AdminAssistantTeach.tsx, src/assistantEngine.ts, src/assistant.admin.css, src/vision/, shared/visionMath.*, tests/vision.test.mjs, tools/build-vision-index.mjs
- src/main.tsx: bot, "AI Assistant" menu item + route, and the camera button in the search bar are gone. package.json: dropped @huggingface/transformers and the vision scripts. The Supabase SQL for the assistant is left alone (harmless).

## Admin book covers: long-press to save
- src/AdminBookCovers.tsx, src/bookCover.css: each paid order now shows its A4 sheet as a real picture. Press and hold it, then choose "Save to Photos". The old buttons (Preview & save, Save as JPEG, Print) still work.
