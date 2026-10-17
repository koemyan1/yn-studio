-- YN Studio: Services page (service requests + "suggest a product" photos).
-- Run once in Supabase -> SQL Editor. Safe to run again.

-- 1) Service requests (printing, copy, social post, poster, logo)
create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  service text not null,                    -- print | copy | social | poster | logo
  service_label text,                       -- name shown to the admin
  details text not null,
  contact text,
  file_url text,
  status text not null default 'new',       -- new | in_progress | done | declined
  created_at timestamptz not null default now()
);
create index if not exists service_requests_user_idx on public.service_requests(user_id, created_at desc);
alter table public.service_requests enable row level security;

drop policy if exists "service requests own read" on public.service_requests;
create policy "service requests own read" on public.service_requests for select
  using (user_id = auth.uid() or exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));
drop policy if exists "service requests own insert" on public.service_requests;
create policy "service requests own insert" on public.service_requests for insert
  with check (user_id = auth.uid() and status = 'new');
drop policy if exists "service requests admin update" on public.service_requests;
create policy "service requests admin update" on public.service_requests for update
  using (exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));
drop policy if exists "service requests admin delete" on public.service_requests;
create policy "service requests admin delete" on public.service_requests for delete
  using (exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));

-- 2) Product suggestions (customer sends a photo of a product they could not find)
create table if not exists public.product_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  note text,
  image_url text not null,
  status text not null default 'new',       -- new | in_progress | done | declined
  created_at timestamptz not null default now()
);
create index if not exists product_suggestions_user_idx on public.product_suggestions(user_id, created_at desc);
alter table public.product_suggestions enable row level security;

drop policy if exists "product suggestions own read" on public.product_suggestions;
create policy "product suggestions own read" on public.product_suggestions for select
  using (user_id = auth.uid() or exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));
drop policy if exists "product suggestions own insert" on public.product_suggestions;
create policy "product suggestions own insert" on public.product_suggestions for insert
  with check (user_id = auth.uid() and status = 'new');
drop policy if exists "product suggestions admin update" on public.product_suggestions;
create policy "product suggestions admin update" on public.product_suggestions for update
  using (exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));
drop policy if exists "product suggestions admin delete" on public.product_suggestions;
create policy "product suggestions admin delete" on public.product_suggestions for delete
  using (exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin'));

-- 3) Storage bucket for the pictures / reference files customers attach
insert into storage.buckets (id, name, public) values ('service-uploads', 'service-uploads', true)
  on conflict (id) do update set public = true;
drop policy if exists "service uploads public read" on storage.objects;
create policy "service uploads public read" on storage.objects for select using (bucket_id = 'service-uploads');
drop policy if exists "service uploads authenticated upload" on storage.objects;
create policy "service uploads authenticated upload" on storage.objects for insert
  with check (bucket_id = 'service-uploads' and auth.uid() is not null);
drop policy if exists "service uploads owner delete" on storage.objects;
create policy "service uploads owner delete" on storage.objects for delete
  using (bucket_id = 'service-uploads' and (owner = auth.uid() or exists(select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')));

-- 4) Notify the admin (bell + live toast) when a customer sends something
create or replace function public.yn_notify_service_request() returns trigger language plpgsql security definer as $$
begin
  insert into public.notifications(user_id, target_role, title, message, type, link)
  values (null, 'admin', 'New service request', coalesce(new.service_label, new.service), 'service', '/admin/requests');
  return new;
end $$;
drop trigger if exists yn_notify_service_request on public.service_requests;
create trigger yn_notify_service_request after insert on public.service_requests
  for each row execute function public.yn_notify_service_request();

create or replace function public.yn_notify_product_suggestion() returns trigger language plpgsql security definer as $$
begin
  insert into public.notifications(user_id, target_role, title, message, type, link)
  values (null, 'admin', 'New product suggestion', coalesce(new.name, 'A customer sent a product photo'), 'service', '/admin/requests');
  return new;
end $$;
drop trigger if exists yn_notify_product_suggestion on public.product_suggestions;
create trigger yn_notify_product_suggestion after insert on public.product_suggestions
  for each row execute function public.yn_notify_product_suggestion();
