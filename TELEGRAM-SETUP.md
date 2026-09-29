# YN Studio Telegram alerts

This build includes a Telegram alert integration for customer activity. The bot does **not** store the bot token in the React app.

## What will alert you

- New customer account
- New customer order
- New customer message
- Customer wallet/top-up request (using the existing notification trigger)
- Other admin notifications that are inserted into `public.notifications`

## 1. Create the Telegram bot

1. Open Telegram and search for **@BotFather**.
2. Send `/newbot`.
3. Choose a bot name and username.
4. BotFather gives you a **bot token**. Keep it private.

## 2. Get your Telegram chat ID

1. Open your new bot and press **Start**.
2. Send the bot a message such as `hello`.
3. Open this URL in your browser, replacing `YOUR_TOKEN` with the token from BotFather:

`https://api.telegram.org/botYOUR_TOKEN/getUpdates`

4. Find `message.chat.id`. That number is your `TELEGRAM_CHAT_ID`.

## 3. Run the SQL upgrade

Open **Supabase → SQL Editor**, paste the contents of `supabase-marketplace-upgrade.sql`, and run it.

This adds the live customer message table, realtime policies, account alerts, and the server-side notifications used by Telegram.

## 4. Deploy the Telegram Edge Function

From the project folder, install/login to the Supabase CLI if needed, link the project, then run:

```cmd
supabase functions deploy telegram-alert --no-verify-jwt
```

The included `supabase/config.toml` also sets `verify_jwt = false` because this function is called by a signed database webhook rather than a browser user session.

## 5. Add the three secrets

In **Supabase → Edge Functions → Secrets**, add:

- `TELEGRAM_BOT_TOKEN` = your BotFather token
- `TELEGRAM_CHAT_ID` = your chat ID
- `YN_TELEGRAM_WEBHOOK_SECRET` = make up a long random secret, for example a 32+ character password

Do **not** put the bot token in `.env`, `VITE_*`, React code, or GitHub.

## 6. Connect the database webhook

In **Supabase → Database → Webhooks**, create a webhook:

- Table: `public.notifications`
- Event: **Insert**
- Method: `POST`
- Destination: the deployed `telegram-alert` Edge Function
- Add header:
  - Name: `x-yn-webhook-secret`
  - Value: the exact same value as `YN_TELEGRAM_WEBHOOK_SECRET`

The database webhook sends the new notification row to the Edge Function, which then sends the Telegram message.

## 7. Test

Create a customer account or place an order. You should receive a Telegram message like:

**YN Studio**

**New customer account**
John · john@example.com

or

**New order**
A new order #YN-12345678 needs review.

If Telegram is not configured yet, the app still works normally; Telegram is an optional notification layer.
