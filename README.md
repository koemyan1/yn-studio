# YN Studio

New React + Vite + Supabase marketplace/admin application.

## 1. Supabase
1. Create a Supabase project.
2. Open SQL Editor and run **all** of `supabase/schema.sql` once on a fresh project.
3. Authentication > Providers: enable Email.
4. Create your admin user in Authentication, then create/update its profile in SQL:
```sql
insert into public.profiles(user_id,name,email,role)
values('YOUR_AUTH_USER_UUID','Admin','YOUR_EMAIL','admin')
on conflict(user_id) do update set role='admin';
```
5. Project Settings > API: copy Project URL and anon/publishable key.

## 2. Environment
Copy `.env.example` to `.env` and fill both values.

## 3. Local
```bash
npm install
npm run dev
```

## 4. Render Static Site
Push this folder to GitHub. Render > New > Static Site.
- Build: `npm install && npm run build`
- Publish directory: `dist`
- Environment: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Rewrite: `/*` -> `/index.html`

## Pages implemented
Customer: auth/signup, home/search, categories, product/options, cart, checkout, orders, wallet/deposit receipt requests.
Admin: dashboard, products/add/publish, categories, orders/status, customers, wallet deposit approval/rejection, transactions, settings.
