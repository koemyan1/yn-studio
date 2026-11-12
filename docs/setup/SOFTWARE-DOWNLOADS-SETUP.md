# Software downloads ($1 per file)

Customers open **Services -> Software downloads**, pick a file, pay **$1** with Bakong KHQR and download it. They can download again any time. Cost: **$0** extra (Supabase, the Render server and Bakong you already use).

```
customer picks file -> POST /api/software/buy (price read from the database) -> KHQR -> paid -> Download (2-minute link)
```

## What you must do, in this order

1. **Bakong must already work** ([BAKONG-SETUP](BAKONG-SETUP.md)). Without it the page shows the files but cannot take payment.
2. **Supabase -> SQL Editor:** run `supabase/sql/supabase-software-downloads.sql` once (safe to run again). It creates the file catalog, the admin-only file locations, the purchases table, the private bucket `software-files` and the public bucket `software-guides` (how-to videos).
3. **Deploy** the new code on Render (no new environment variables, no new packages).
4. **Admin -> Inbox -> Software downloads -> Add software.** Fill the title and a short line, choose the file, optionally add a video, keep **Switched on** ticked, Save.
5. Have a Khmer speaker read the Khmer text on the page (it was machine-written).

## Adding a file

- **Upload:** up to **50 MB** (the Supabase free-plan limit per file). A progress bar shows while it uploads.
- **Paste a link:** for anything bigger. Use Google Drive, Mega, OneDrive... and make sure "anyone with the link" can open it. Customers only get the link **after paying**; it is never sent to the browser before.
- **Price:** $1.00 is pre-filled. You can change it per file ($0.01 to $100).
- **How-to video** (free to watch, helps people buy): upload an MP4 / WebM up to 50 MB, or paste a **YouTube** link (use *Unlisted* for a private-ish video of any length).

## Good to know

- A customer buys each file **once**, then it is theirs. The "Download" button works as often as they like; each click makes a fresh link that expires in 2 minutes.
- A file that already has buyers **cannot be deleted** (so history stays correct). Switch it off instead.
- Unpaid purchases are cancelled after 48 hours (never deleted). A late payment is checked once more before cancelling.
- **Refunds:** the app does not move money. Send the refund yourself; to take the file away from that customer, ask the developer or delete the row in `software_purchases` from the SQL editor.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Page says "not set up yet" / admin page says "Did you run supabase-software-downloads.sql?" | Run the SQL |
| "Payments are not available right now" | Bakong is not configured or the server is not redeployed |
| Upload fails with a size error | Over 50 MB: use "Paste a link" (files) or YouTube (videos) |
| Customer paid but sees "Get" | Wait a few seconds; the page updates by itself. Opening Orders also re-checks payments |
| Video does not play | MP4 (H.264) plays everywhere; re-export other formats |

Tests: `npm test` (includes `tests/software-shop.test.mjs`: "the browser cannot set the price", "no download before paying", "file location never leaked").
