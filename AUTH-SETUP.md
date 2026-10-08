# YN Studio Authentication Setup

The app now supports:

- Email + password sign up/sign in
- 6-digit email verification code after signup
- Resend verification code
- Automatic resend when an existing account is not yet verified
- Google Sign-In
- Facebook Sign-In / Sign-Up
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

The YN Studio login page uses the supplied cropped Google logo at `public/google-logo.png`.

The app sends OAuth users back to:

- Production: `https://YOUR-DOMAIN/login`
- Local: `http://localhost:5173/login`

Add those callback URLs to Supabase Authentication → URL Configuration → Redirect URLs, and configure the matching OAuth redirect URI in Google Cloud.

## 5. Facebook Sign-In / Sign-Up

The login page now includes **Continue with Facebook**. Supabase handles the OAuth flow, and a first-time Facebook user is automatically given a normal YN Studio customer profile. Existing admin profiles keep their admin role.

In Supabase:

Authentication → Providers → Facebook

Enable Facebook and enter the Facebook App ID and App Secret. In Meta for Developers, create/configure a Facebook Login product for the app and add the Supabase callback URL shown by Supabase to the Facebook OAuth redirect settings.

Use the same YN Studio callback URL pattern for the frontend redirect:

- Production: `https://YOUR-DOMAIN/login`
- Local: `http://localhost:5173/login`

Also add the URLs to Supabase Authentication → URL Configuration → Redirect URLs.

Important: the Facebook App Secret belongs only in Supabase/Meta configuration. Do not put it in the React/Vite frontend, `.env` files committed to Git, or GitHub.

## 6. Important

Do not disable email confirmation if you want customers to be blocked until they enter the 6-digit code.

The customer keeps using the same Supabase user ID, so existing orders, wallet transactions, wishlists, notifications and support records remain connected to the account.


## Custom OTP server (current YN Studio flow)

The current app no longer calls `supabase.auth.signUp()` for customer registration. It calls the YN Studio `/api/auth/*` endpoints.

- The server creates the Supabase Auth user with `email_confirm: false`.
- The server generates and hashes a 6-digit OTP.
- The server stores only the hash in `public.email_otps`.
- The server sends the code through the configured SMTP account.
- After successful verification, the server marks the Supabase Auth email as confirmed.
- The frontend then signs in normally with `signInWithPassword()`.

Keep Supabase Email confirmation **OFF** while using this flow.

## SMTP troubleshooting

Open `/api/health` on the deployed site. It should return `"ok": true` and show
the configured SMTP host/port without exposing the password. Also check the
Render service logs for `SMTP connection verified` or `SMTP connection verification failed`.
When a code is accepted by the SMTP server, the logs will show `OTP email accepted by SMTP`
and the provider response/message ID. This confirms the server handed the message to Gmail;
it does not guarantee inbox placement, so check Gmail Spam/Promotions as well.
