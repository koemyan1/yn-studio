# YN Studio Authentication Setup

The app now supports:

- Email + password sign up/sign in
- 6-digit email verification code after signup
- Resend verification code
- Automatic resend when an existing account is not yet verified
- Google Sign-In
- Existing Supabase database/RLS/session compatibility
- Customer/admin role routing

## 1. Enable email confirmation

In Supabase Dashboard:

Authentication → Providers → Email

Enable:

- Email provider
- Confirm email

The app expects the confirmation email to contain the 6-digit OTP.

## 2. Make the confirmation email show a 6-digit code

In:

Authentication → Email Templates → Confirm signup

Use `{{ .Token }}` in the message. Supabase documents `{{ .Token }}` as the 6-digit OTP variable.

Example message:

Your YN Studio verification code is:

{{ .Token }}

This code is required to verify your YN Studio account.

## 3. Send the emails from ynstudio04@gmail.com

In:

Authentication → SMTP Settings

Configure custom SMTP with the Gmail account.

Recommended Gmail SMTP settings:

- Host: smtp.gmail.com
- Port: 587
- Username: ynstudio04@gmail.com
- Password: Gmail App Password
- Sender email: ynstudio04@gmail.com
- Sender name: YN Studio

Do NOT put the Gmail password or App Password in the React/Vite frontend or GitHub repository.

## 4. Google Sign-In

In Supabase:

Authentication → Providers → Google

Create a Google OAuth client in Google Cloud and copy the Client ID and Client Secret into the Supabase Google provider settings.

Add your production site URL to the Supabase URL configuration and Google OAuth redirect configuration.

For local development, use your local Vite URL as an allowed redirect where required.

## 5. Important

Do not disable email confirmation if you want customers to be blocked until they enter the 6-digit code.

The customer keeps using the same Supabase user ID, so existing orders, wallet transactions, wishlists, notifications and support records remain connected to the account.


## 5. Render/Vite environment variables

The Supabase client is initialized at build time by Vite. On Render, add these
under the web service's Environment settings and redeploy after changing them:

- `VITE_SUPABASE_URL` = `https://fdqrmzlnahrrqfervlde.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = your Supabase publishable/anon key

Alternatively, the app also accepts `VITE_SUPABASE_PUBLISHABLE_KEY`.

Do not use a `service_role` or `sb_secret_...` key in these Vite variables.
