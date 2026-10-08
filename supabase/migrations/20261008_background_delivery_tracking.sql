alter table public.orders
  add column if not exists tracking_active boolean not null default false,
  add column if not exists tracking_token text,
  add column if not exists tracking_started_at timestamptz;

create index if not exists orders_tracking_token_idx on public.orders(tracking_token) where tracking_token is not null;
