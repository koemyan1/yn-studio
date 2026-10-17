# Phone push notifications (Android + iPhone)

Customers get pushes for order / wallet / support / debt updates. Admins get pushes for new orders, deposits, support tickets and service requests.
It uses every row the app already creates in `public.notifications`, so nothing else in the app has to change.

## 1. Make your keys (once)
```
node tools/generate-vapid.mjs
```
Keep the two values it prints.

## 2. Run the SQL
Supabase -> SQL Editor -> paste `supabase-push.sql` -> Run.

## 3. Deploy the sender function
```
supabase functions deploy send-push --no-verify-jwt
```

## 4. Add 4 secrets (Supabase -> Edge Functions -> Secrets)
| Name | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | public key from step 1 |
| `VAPID_PRIVATE_KEY` | private key from step 1 (secret!) |
| `VAPID_SUBJECT` | `mailto:you@yourmail.com` |
| `YN_PUSH_WEBHOOK_SECRET` | any long random password |

## 5. Connect the database webhook
Supabase -> Database -> Webhooks -> Create:
- Table `public.notifications`, event **Insert**, method POST
- Destination: the `send-push` Edge Function
- Header `x-yn-webhook-secret` = the same value as `YN_PUSH_WEBHOOK_SECRET`

(This is a second webhook next to the Telegram one; keep both.)

## 6. Give the website the public key
Render -> Environment -> add `VITE_VAPID_PUBLIC_KEY` = the public key, then redeploy (it is read at build time).

## 7. Turn it on, on each phone
- **Android:** open the site in Chrome -> Profile (or Notifications) -> **Turn on** -> Allow.
- **iPhone / iPad (iOS 16.4+):** Safari -> Share -> **Add to Home Screen** -> open YN Studio from the Home Screen icon -> Profile -> **Turn on** -> Allow. Pushes do not work from a normal Safari tab.
- **Admin:** same steps on your own phone, using Admin -> Notifications.

## Notes
- The toggle card is hidden on browsers that cannot do push, and until `VITE_VAPID_PUBLIC_KEY` is set.
- Phones that were removed or unsubscribed are cleaned up automatically.
- Some Android brands (Xiaomi, Oppo, Vivo, Realme) delay pushes if battery saver is on for Chrome / the app.
- The Capacitor APK/iOS app is separate: web push does not run inside it (that would need Firebase).
