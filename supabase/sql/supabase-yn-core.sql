-- =====================================================================================================================
-- YN CORE  (NFC coins 01-05, YN EMERGENCY initialization/recovery, passkeys, audit)   -- docs/setup/YN-CORE-SETUP.md
--
-- Run in Supabase -> SQL Editor, AFTER supabase-security-hardening.sql. Idempotent: safe to run twice.
-- TRY IT ON A COPY / TEST PROJECT FIRST. It only creates NEW tables and functions (all prefixed yn_core_); it does not
-- touch any existing table, policy or function.
--
-- Security model
--   * Every table has RLS ON and NO policy, and anon/authenticated have NO privileges: browsers can never read or write
--     these tables. Only the Express server (service-role key) can, through the functions below.
--   * Token plaintext is never stored. Only HMAC-SHA256(pepper, token) (+ the key id of the pepper) is kept.
--   * Activation / regeneration / revocation run as ONE atomic function that first consumes a single-use emergency session.
--     The per-coin auto-lock and the final lock therefore cannot be skipped by a bug or a race in the app code.
--   * yn_core_audit_log is append-only (a trigger blocks UPDATE/DELETE) and hash-chained.
--
-- Rollback (only if you want to remove YN CORE completely; this deletes its data):
--   drop table if exists yn_core_audit_log, yn_core_tap_events, yn_core_recovery_requests, yn_core_recovery_codes,
--     yn_core_emergency_sessions, yn_core_webauthn_challenges, yn_core_admin_credentials, yn_core_destinations,
--     yn_core_coin_tokens, yn_core_coins, yn_core_state cascade;
--   drop function if exists yn_core_audit(uuid,text,smallint,text,jsonb,text), yn_core_take_session(text,text,smallint,uuid),
--     yn_core_activate_coin(text,smallint,uuid,text,text,text,text,text,text),
--     yn_core_regenerate_token(text,smallint,uuid,text,text,integer), yn_core_revoke_coin(text,smallint,uuid,text),
--     yn_core_recovery_open(uuid,integer), yn_core_housekeeping(), yn_core_audit_no_change();
-- =====================================================================================================================

-- ------------------------------------------------------------------------------------------------ state (singleton)
create table if not exists public.yn_core_state (
  id                    smallint primary key default 1 check (id = 1),
  init_locked           boolean not null default false,   -- true once all five coins are active (final lock)
  init_locked_at        timestamptz,
  recovery_window_until timestamptz,                      -- a completed recovery reopens YN EMERGENCY until this moment
  recovery_window_by    uuid,
  updated_at            timestamptz not null default now()
);
insert into public.yn_core_state (id) values (1) on conflict (id) do nothing;

-- ------------------------------------------------------------------------------------------------------------ coins
create table if not exists public.yn_core_coins (
  slot                      smallint primary key check (slot between 1 and 5),
  label                     text not null default '',
  status                    text not null default 'uninitialized' check (status in ('uninitialized','active','paused','revoked')),
  policy                    text not null default 'redirect' check (policy in ('redirect','interstitial')),
  fallback_url              text check (fallback_url is null or fallback_url ~ '^https://'),
  rotation_mode             text not null default 'fixed' check (rotation_mode in ('fixed','interval')),
  rotation_interval_seconds integer not null default 3600 check (rotation_interval_seconds between 60 and 31536000),
  rotation_anchor           timestamptz not null default now(),
  rotation_tz               text not null default 'UTC',
  settings                  jsonb not null default '{}'::jsonb,
  activated_at              timestamptz,
  activated_by              uuid,
  written_verified_at       timestamptz,                  -- first successful tap after activation = the sticker was written correctly
  version                   integer not null default 1,
  updated_at                timestamptz not null default now()
);
insert into public.yn_core_coins (slot, label)
  select s, 'Coin 0' || s from generate_series(1, 5) s on conflict (slot) do nothing;

-- ------------------------------------------------------------------------------------------------------ coin tokens
create table if not exists public.yn_core_coin_tokens (
  id           uuid primary key default gen_random_uuid(),
  slot         smallint not null references public.yn_core_coins(slot),
  token_hmac   text not null unique,              -- hex HMAC-SHA256(pepper[key_id], token). The token itself is NEVER stored.
  key_id       text not null,
  generation   integer not null,
  status       text not null check (status in ('current','grace','revoked')),
  created_at   timestamptz not null default now(),
  created_by   uuid,
  grace_until  timestamptz,
  revoked_at   timestamptz,
  revoke_reason text,
  last_used_at timestamptz
);
create unique index if not exists yn_core_one_current_token on public.yn_core_coin_tokens (slot) where status = 'current';
create index if not exists yn_core_tokens_slot_idx on public.yn_core_coin_tokens (slot, generation desc);

-- ------------------------------------------------------------------------------------------------------ destinations
create table if not exists public.yn_core_destinations (
  id           uuid primary key default gen_random_uuid(),
  slot         smallint not null references public.yn_core_coins(slot),
  label        text not null default '',
  url          text not null check (url ~ '^https://' and length(url) <= 2000),
  priority     integer not null default 100,
  active       boolean not null default true,
  starts_at    timestamptz,
  ends_at      timestamptz,
  weekdays     smallint[],                        -- 0 = Sunday ... 6 = Saturday; null = every day
  window_start time,                              -- daily window in the coin's rotation_tz; both null = all day
  window_end   time,
  created_by   uuid,
  created_at   timestamptz not null default now()
);
create index if not exists yn_core_destinations_slot_idx on public.yn_core_destinations (slot, priority);

-- ------------------------------------------------------------------------------------------------ admin passkeys
create table if not exists public.yn_core_admin_credentials (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  credential_id  text not null unique,            -- base64url
  public_key     text not null,                   -- base64url DER SubjectPublicKeyInfo (ES256 / P-256)
  sign_count     bigint not null default 0,
  transports     text[],
  backed_up      boolean,
  device_type    text,
  aaguid         text,
  nickname       text not null default '',
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz,
  revoked_at     timestamptz
);
create index if not exists yn_core_creds_user_idx on public.yn_core_admin_credentials (user_id) where revoked_at is null;

create table if not exists public.yn_core_webauthn_challenges (
  id             uuid primary key default gen_random_uuid(),
  purpose        text not null,
  user_id        uuid not null,
  slot           smallint,
  challenge_hash text not null,                   -- sha256 of the challenge; single use, 90 s
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  consumed_at    timestamptz
);

create table if not exists public.yn_core_emergency_sessions (
  id            uuid primary key default gen_random_uuid(),
  session_hmac  text not null unique,             -- HMAC of the opaque session token (the browser keeps it in memory only)
  user_id       uuid not null,
  credential_id text,
  scope         text not null check (scope in ('init','coin_security','security')),
  slot          smallint,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  consumed_at   timestamptz,
  revoked_at    timestamptz,
  revoke_reason text
);

create table if not exists public.yn_core_recovery_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  code_hmac  text not null unique,
  created_at timestamptz not null default now(),
  used_at    timestamptz
);

create table if not exists public.yn_core_recovery_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  status       text not null default 'pending' check (status in ('pending','opened','cancelled','expired')),
  requested_at timestamptz not null default now(),
  ready_at     timestamptz not null,              -- cooling-off delay: recovery cannot be opened before this
  expires_at   timestamptz not null,
  opened_at    timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid
);

-- ------------------------------------------------------------------------------------------------------ analytics
create table if not exists public.yn_core_tap_events (
  id             bigint generated always as identity primary key,
  ts             timestamptz not null default now(),
  slot           smallint,
  token_id       uuid,
  outcome        text not null,                   -- redirected | interstitial | paused | revoked | expired | no_destination | unknown | bot
  destination_id uuid,
  ip_hash        text,
  country        text,
  ua_class       text,
  is_bot         boolean not null default false
);
create index if not exists yn_core_tap_events_slot_idx on public.yn_core_tap_events (slot, ts desc);
create index if not exists yn_core_tap_events_ts_idx on public.yn_core_tap_events (ts desc);

-- ------------------------------------------------------------------------------------------------ audit (append-only)
create table if not exists public.yn_core_audit_log (
  id        bigint generated always as identity primary key,
  ts        timestamptz not null,
  actor     uuid,
  action    text not null,
  slot      smallint,
  result    text not null,
  details   jsonb not null default '{}'::jsonb,
  ip_hash   text,
  prev_hash text,
  row_hash  text not null
);

create or replace function public.yn_core_audit_no_change() returns trigger language plpgsql as $$
begin raise exception 'yn_core_audit_log is append-only'; end $$;
drop trigger if exists yn_core_audit_no_update on public.yn_core_audit_log;
create trigger yn_core_audit_no_update before update or delete on public.yn_core_audit_log
  for each row execute function public.yn_core_audit_no_change();

-- ---------------------------------------------------------------------------------------------------- lock it down
alter table public.yn_core_state              enable row level security;
alter table public.yn_core_coins              enable row level security;
alter table public.yn_core_coin_tokens        enable row level security;
alter table public.yn_core_destinations       enable row level security;
alter table public.yn_core_admin_credentials  enable row level security;
alter table public.yn_core_webauthn_challenges enable row level security;
alter table public.yn_core_emergency_sessions enable row level security;
alter table public.yn_core_recovery_codes     enable row level security;
alter table public.yn_core_recovery_requests  enable row level security;
alter table public.yn_core_tap_events         enable row level security;
alter table public.yn_core_audit_log          enable row level security;
-- (no policies on purpose: with RLS on and no policy, anon/authenticated see and change nothing)
revoke all on public.yn_core_state, public.yn_core_coins, public.yn_core_coin_tokens, public.yn_core_destinations,
  public.yn_core_admin_credentials, public.yn_core_webauthn_challenges, public.yn_core_emergency_sessions,
  public.yn_core_recovery_codes, public.yn_core_recovery_requests, public.yn_core_tap_events, public.yn_core_audit_log
  from public, anon, authenticated;
grant select, insert, update, delete on
  public.yn_core_state, public.yn_core_coins, public.yn_core_coin_tokens, public.yn_core_destinations,
  public.yn_core_admin_credentials, public.yn_core_webauthn_challenges, public.yn_core_emergency_sessions,
  public.yn_core_recovery_codes, public.yn_core_recovery_requests, public.yn_core_tap_events to service_role;
grant select, insert on public.yn_core_audit_log to service_role;       -- append-only for the server too
grant usage, select on all sequences in schema public to service_role;

-- =====================================================================================================================
-- Functions (SECURITY DEFINER, callable only by the server's service role)
-- =====================================================================================================================

-- Append one hash-chained audit row.
create or replace function public.yn_core_audit(p_actor uuid, p_action text, p_slot smallint, p_result text, p_details jsonb, p_ip_hash text)
returns void language plpgsql security definer set search_path = public as $$
declare v_prev text; v_ts timestamptz := now(); v_hash text;
begin
  perform pg_advisory_xact_lock(727001);
  select row_hash into v_prev from public.yn_core_audit_log order by id desc limit 1;
  v_hash := encode(sha256(convert_to(
    coalesce(v_prev,'') || '|' || v_ts::text || '|' || coalesce(p_actor::text,'') || '|' || p_action || '|' ||
    coalesce(p_slot::text,'') || '|' || p_result || '|' || coalesce(p_details::text,'{}') || '|' || coalesce(p_ip_hash,''), 'utf8')), 'hex');
  insert into public.yn_core_audit_log (ts, actor, action, slot, result, details, ip_hash, prev_hash, row_hash)
  values (v_ts, p_actor, p_action, p_slot, p_result, coalesce(p_details,'{}'::jsonb), p_ip_hash, v_prev, v_hash);
end $$;

-- Atomically consume a single-use emergency session (ONE statement, so two parallel requests cannot both win).
create or replace function public.yn_core_take_session(p_hmac text, p_scope text, p_slot smallint, p_user uuid)
returns uuid language sql security definer set search_path = public as $$
  update public.yn_core_emergency_sessions
     set consumed_at = now(), revoked_at = now(), revoke_reason = 'used'
   where session_hmac = p_hmac and scope = p_scope and user_id = p_user
     and slot is not distinct from p_slot
     and consumed_at is null and revoked_at is null and expires_at > now()
  returning id;
$$;

-- ACTIVATE one coin. Consumes the init session (per-coin auto-lock) and, when the fifth coin becomes active, sets the final lock.
create or replace function public.yn_core_activate_coin(
  p_session_hmac text, p_slot smallint, p_user uuid, p_token_hmac text, p_key_id text,
  p_label text, p_policy text, p_dest_url text, p_dest_label text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sid uuid; v_state record; v_coin record; v_gen integer; v_active integer; v_locked boolean := false;
begin
  v_sid := public.yn_core_take_session(p_session_hmac, 'init', p_slot, p_user);
  if v_sid is null then
    perform public.yn_core_audit(p_user, 'coin.activate', p_slot, 'denied', '{"why":"no valid init session"}', null);
    return jsonb_build_object('ok', false, 'error', 'session');
  end if;
  select * into v_state from public.yn_core_state where id = 1 for update;
  if v_state.init_locked and not coalesce(v_state.recovery_window_until > now(), false) then
    perform public.yn_core_audit(p_user, 'coin.activate', p_slot, 'denied', '{"why":"initialization is locked"}', null);
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  select * into v_coin from public.yn_core_coins where slot = p_slot for update;
  if not found or v_coin.status not in ('uninitialized','revoked') then
    perform public.yn_core_audit(p_user, 'coin.activate', p_slot, 'denied', '{"why":"coin already active"}', null);
    return jsonb_build_object('ok', false, 'error', 'already_active');
  end if;
  if p_policy not in ('redirect','interstitial') then p_policy := 'redirect'; end if;

  update public.yn_core_coin_tokens set status = 'revoked', revoked_at = now(), revoke_reason = 'coin re-initialized'
   where slot = p_slot and status <> 'revoked';
  select coalesce(max(generation), 0) + 1 into v_gen from public.yn_core_coin_tokens where slot = p_slot;
  insert into public.yn_core_coin_tokens (slot, token_hmac, key_id, generation, status, created_by)
  values (p_slot, p_token_hmac, p_key_id, v_gen, 'current', p_user);

  update public.yn_core_coins
     set status = 'active', label = coalesce(nullif(left(p_label, 60), ''), label), policy = p_policy,
         activated_at = now(), activated_by = p_user, written_verified_at = null, version = version + 1, updated_at = now()
   where slot = p_slot;
  if p_dest_url is not null then
    insert into public.yn_core_destinations (slot, label, url, created_by) values (p_slot, left(coalesce(p_dest_label, ''), 60), p_dest_url, p_user);
  end if;

  select count(*) into v_active from public.yn_core_coins where status = 'active';
  if v_active >= 5 then
    update public.yn_core_state set init_locked = true, init_locked_at = now(), recovery_window_until = null, recovery_window_by = null, updated_at = now() where id = 1;
    v_locked := true;
  end if;
  perform public.yn_core_audit(p_user, 'coin.activate', p_slot, 'ok', jsonb_build_object('generation', v_gen, 'final_lock', v_locked), null);
  return jsonb_build_object('ok', true, 'slot', p_slot, 'generation', v_gen, 'final_lock', v_locked, 'active_count', v_active);
end $$;

-- REGENERATE the token of an active/paused coin (new URL; the old one stays valid for p_grace_minutes, 0 = immediately dead).
create or replace function public.yn_core_regenerate_token(
  p_session_hmac text, p_slot smallint, p_user uuid, p_token_hmac text, p_key_id text, p_grace_minutes integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sid uuid; v_coin record; v_gen integer; v_grace integer := least(greatest(coalesce(p_grace_minutes, 0), 0), 60 * 24 * 30);
begin
  v_sid := public.yn_core_take_session(p_session_hmac, 'coin_security', p_slot, p_user);
  if v_sid is null then
    perform public.yn_core_audit(p_user, 'token.regenerate', p_slot, 'denied', '{"why":"no valid session"}', null);
    return jsonb_build_object('ok', false, 'error', 'session');
  end if;
  select * into v_coin from public.yn_core_coins where slot = p_slot for update;
  if not found or v_coin.status not in ('active','paused') then
    perform public.yn_core_audit(p_user, 'token.regenerate', p_slot, 'denied', '{"why":"coin not active"}', null);
    return jsonb_build_object('ok', false, 'error', 'not_active');
  end if;
  update public.yn_core_coin_tokens set status = 'revoked', revoked_at = now(), revoke_reason = 'replaced (older grace token)'
   where slot = p_slot and status = 'grace';
  if v_grace > 0 then
    update public.yn_core_coin_tokens set status = 'grace', grace_until = now() + make_interval(mins => v_grace) where slot = p_slot and status = 'current';
  else
    update public.yn_core_coin_tokens set status = 'revoked', revoked_at = now(), revoke_reason = 'regenerated' where slot = p_slot and status = 'current';
  end if;
  select coalesce(max(generation), 0) + 1 into v_gen from public.yn_core_coin_tokens where slot = p_slot;
  insert into public.yn_core_coin_tokens (slot, token_hmac, key_id, generation, status, created_by)
  values (p_slot, p_token_hmac, p_key_id, v_gen, 'current', p_user);
  update public.yn_core_coins set written_verified_at = null, version = version + 1, updated_at = now() where slot = p_slot;
  perform public.yn_core_audit(p_user, 'token.regenerate', p_slot, 'ok', jsonb_build_object('generation', v_gen, 'grace_minutes', v_grace), null);
  return jsonb_build_object('ok', true, 'slot', p_slot, 'generation', v_gen, 'grace_minutes', v_grace);
end $$;

-- REVOKE a coin: every token dies at once. The final lock stays on (re-activating a revoked coin needs recovery).
create or replace function public.yn_core_revoke_coin(p_session_hmac text, p_slot smallint, p_user uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sid uuid; v_coin record;
begin
  v_sid := public.yn_core_take_session(p_session_hmac, 'coin_security', p_slot, p_user);
  if v_sid is null then
    perform public.yn_core_audit(p_user, 'coin.revoke', p_slot, 'denied', '{"why":"no valid session"}', null);
    return jsonb_build_object('ok', false, 'error', 'session');
  end if;
  select * into v_coin from public.yn_core_coins where slot = p_slot for update;
  if not found or v_coin.status not in ('active','paused') then
    return jsonb_build_object('ok', false, 'error', 'not_active');
  end if;
  update public.yn_core_coin_tokens set status = 'revoked', revoked_at = now(), revoke_reason = left(coalesce(p_reason, 'revoked'), 120)
   where slot = p_slot and status <> 'revoked';
  update public.yn_core_coins set status = 'revoked', version = version + 1, updated_at = now() where slot = p_slot;
  perform public.yn_core_audit(p_user, 'coin.revoke', p_slot, 'ok', jsonb_build_object('reason', left(coalesce(p_reason, ''), 120)), null);
  return jsonb_build_object('ok', true, 'slot', p_slot);
end $$;

-- OPEN recovery: only when a recovery request has finished its cooling-off delay. Reopens YN EMERGENCY for a short window.
create or replace function public.yn_core_recovery_open(p_user uuid, p_window_minutes integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_until timestamptz := now() + make_interval(mins => least(greatest(coalesce(p_window_minutes, 15), 1), 60));
begin
  select id into v_id from public.yn_core_recovery_requests
   where user_id = p_user and status = 'pending' and ready_at <= now() and expires_at > now()
   order by requested_at limit 1 for update;
  if v_id is null then
    perform public.yn_core_audit(p_user, 'recovery.open', null, 'denied', '{"why":"no ready request"}', null);
    return jsonb_build_object('ok', false, 'error', 'not_ready');
  end if;
  update public.yn_core_recovery_requests set status = 'opened', opened_at = now() where id = v_id;
  update public.yn_core_state set recovery_window_until = v_until, recovery_window_by = p_user, updated_at = now() where id = 1;
  perform public.yn_core_audit(p_user, 'recovery.open', null, 'ok', jsonb_build_object('until', v_until), null);
  return jsonb_build_object('ok', true, 'until', v_until);
end $$;

-- Housekeeping (the server calls it daily; you may also schedule it with pg_cron if your project has it).
create or replace function public.yn_core_housekeeping() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.yn_core_tap_events where ts < now() - interval '90 days';
  delete from public.yn_core_webauthn_challenges where expires_at < now() - interval '1 day';
  delete from public.yn_core_emergency_sessions where expires_at < now() - interval '1 day';
  update public.yn_core_recovery_requests set status = 'expired' where status = 'pending' and expires_at <= now();
  update public.yn_core_coin_tokens set status = 'revoked', revoked_at = now(), revoke_reason = 'grace period ended'
   where status = 'grace' and grace_until <= now();
end $$;

-- Functions are executable by PUBLIC unless revoked. These are server-only.
revoke all on function public.yn_core_audit(uuid, text, smallint, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.yn_core_take_session(text, text, smallint, uuid) from public, anon, authenticated;
revoke all on function public.yn_core_activate_coin(text, smallint, uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.yn_core_regenerate_token(text, smallint, uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.yn_core_revoke_coin(text, smallint, uuid, text) from public, anon, authenticated;
revoke all on function public.yn_core_recovery_open(uuid, integer) from public, anon, authenticated;
revoke all on function public.yn_core_housekeeping() from public, anon, authenticated;
grant execute on function public.yn_core_audit(uuid, text, smallint, text, jsonb, text) to service_role;
grant execute on function public.yn_core_take_session(text, text, smallint, uuid) to service_role;
grant execute on function public.yn_core_activate_coin(text, smallint, uuid, text, text, text, text, text, text) to service_role;
grant execute on function public.yn_core_regenerate_token(text, smallint, uuid, text, text, integer) to service_role;
grant execute on function public.yn_core_revoke_coin(text, smallint, uuid, text) to service_role;
grant execute on function public.yn_core_recovery_open(uuid, integer) to service_role;
grant execute on function public.yn_core_housekeeping() to service_role;
