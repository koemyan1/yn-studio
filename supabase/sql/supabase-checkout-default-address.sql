-- Run in Supabase SQL Editor to enable saving a default checkout delivery address.
alter table public.profiles add column if not exists delivery_is_default boolean not null default true;
