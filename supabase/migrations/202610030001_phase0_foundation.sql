begin;

create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 80),
  locale text not null default 'en' check (locale in ('en', 'hi', 'mr')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text check (label is null or char_length(label) <= 80),
  locale text not null default 'en' check (locale in ('en', 'hi', 'mr')),
  last_seen_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (id, user_id)
);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('sync', 'journal_sync', 'broker_monitoring', 'push')),
  policy_version text not null,
  granted_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  check (revoked_at is null or revoked_at >= granted_at)
);

create table public.broker_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_id uuid not null references public.consents(id) on delete restrict,
  provider text not null check (provider in ('zerodha', 'angel_one')),
  provider_user_ref text not null,
  encrypted_access_token bytea,
  token_key_version smallint,
  status text not null default 'disconnected' check (
    status in ('disconnected', 'connecting', 'live', 'reconnecting', 'stale', 'reauth_required')
  ),
  expires_at timestamptz,
  last_event_at timestamptz,
  last_heartbeat_at timestamptz,
  lease_owner text,
  lease_expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  disconnected_at timestamptz,
  unique (user_id, provider),
  check ((encrypted_access_token is null) = (token_key_version is null))
);

create table public.pacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  daily_loss_limit_paise bigint not null check (daily_loss_limit_paise >= 0),
  maximum_trades_per_day smallint not null check (maximum_trades_per_day between 1 and 100),
  cooldown_after_loss_minutes smallint not null check (cooldown_after_loss_minutes between 1 and 1440),
  blocked_windows jsonb not null default '[]'::jsonb,
  block_borrowed_funds boolean not null default true,
  block_emergency_funds boolean not null default true,
  revision bigint not null default 0 check (revision >= 0),
  effective_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id)
);

create table public.pact_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pact_id uuid not null references public.pacts(id) on delete cascade,
  requested_values jsonb not null,
  classification text not null check (classification in ('tighten', 'loosen', 'mixed')),
  status text not null check (status in ('pending', 'effective', 'rejected', 'superseded')),
  effective_at timestamptz not null,
  client_created_at timestamptz not null,
  server_received_at timestamptz not null default timezone('utc', now()),
  idempotency_key text not null,
  unique (user_id, idempotency_key)
);

create table public.checkins (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_at timestamptz not null,
  amount_paise bigint not null check (amount_paise >= 0),
  fund_source text not null check (fund_source in ('surplus', 'savings', 'emergency_fund', 'borrowed')),
  borrow_kind text not null check (borrow_kind in ('none', 'bank_loan', 'instant_loan', 'credit_card', 'other')),
  horizon text not null check (horizon in ('intraday', 'days', 'weeks', 'months', 'years')),
  reason text not null check (char_length(reason) between 1 and 1000),
  exit_condition text not null check (char_length(exit_condition) between 1 and 500),
  revision bigint not null default 0,
  idempotency_key text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, idempotency_key)
);

create table public.trade_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  broker_connection_id uuid references public.broker_connections(id) on delete set null,
  provider text check (provider is null or provider in ('zerodha', 'angel_one')),
  provider_event_id text,
  provider_order_id text,
  event_type text not null check (event_type in ('order_update', 'trade_update', 'reconciliation', 'csv', 'synthetic')),
  observed_at timestamptz not null,
  received_at timestamptz not null default timezone('utc', now()),
  status text,
  symbol text check (symbol is null or symbol ~ '^[A-Z0-9._-]{1,32}$'),
  side text check (side is null or side in ('buy', 'sell')),
  quantity numeric check (quantity is null or quantity > 0),
  average_price_paise bigint check (average_price_paise is null or average_price_paise >= 0),
  pnl_paise bigint,
  source text not null check (source in ('csv', 'synthetic', 'connected')),
  dedupe_hash text not null check (dedupe_hash ~ '^[a-f0-9]{64}$'),
  retain_until timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, dedupe_hash),
  unique nulls not distinct (provider, provider_event_id, user_id)
);

create table public.risk_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  checkin_id uuid references public.checkins(id) on delete set null,
  trade_event_id uuid references public.trade_events(id) on delete set null,
  score numeric(5,4) not null check (score between 0 and 1),
  tier text not null check (tier in ('L0', 'L1', 'L2', 'L3')),
  signal_hits jsonb not null default '[]'::jsonb,
  hard_rule_overrides jsonb not null default '[]'::jsonb,
  engine_version text not null,
  config_version text not null,
  evaluated_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  check (checkin_id is not null or trade_event_id is not null)
);

create table public.pause_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  assessment_id uuid not null references public.risk_assessments(id) on delete cascade,
  tier text not null check (tier in ('L0', 'L1', 'L2', 'L3')),
  started_at timestamptz not null,
  expires_at timestamptz,
  outcome text not null check (outcome in ('waiting', 'continued', 'abandoned', 'expired')),
  revision bigint not null default 0,
  idempotency_key text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, idempotency_key),
  check (expires_at is null or expires_at >= started_at)
);

create table public.journal_entries (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 1000),
  horizon text not null check (horizon in ('intraday', 'days', 'weeks', 'months', 'years')),
  exit_condition text not null check (char_length(exit_condition) between 1 and 500),
  transcript_source text not null check (transcript_source in ('typed', 'on_device_voice')),
  revision bigint not null default 0,
  idempotency_key text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, idempotency_key)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid references public.devices(id) on delete cascade,
  endpoint_ciphertext bytea not null,
  key_ciphertext bytea not null,
  key_version smallint not null,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  attempts smallint not null default 0 check (attempts >= 0),
  available_at timestamptz not null default timezone('utc', now()),
  dispatched_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_code text not null,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  check (not (metadata ?| array['journal_text', 'raw_csv', 'audio', 'access_token', 'api_secret']))
);

create table public.synthetic_fixtures (
  id text primary key,
  persona text not null,
  description text not null,
  payload jsonb not null,
  seed bigint not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index devices_user_idx on public.devices(user_id);
create index consents_user_purpose_idx on public.consents(user_id, purpose, granted_at desc);
create index broker_connections_status_idx on public.broker_connections(status, lease_expires_at);
create index pact_changes_user_status_idx on public.pact_changes(user_id, status, effective_at);
create index checkins_user_occurred_idx on public.checkins(user_id, occurred_at desc);
create index trade_events_user_observed_idx on public.trade_events(user_id, observed_at desc);
create index assessments_user_evaluated_idx on public.risk_assessments(user_id, evaluated_at desc);
create index pauses_user_started_idx on public.pause_events(user_id, started_at desc);
create index journals_user_created_idx on public.journal_entries(user_id, created_at desc);
create index outbox_pending_idx on public.outbox_events(available_at) where dispatched_at is null;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger broker_connections_updated_at before update on public.broker_connections
for each row execute function public.set_updated_at();
create trigger pacts_updated_at before update on public.pacts
for each row execute function public.set_updated_at();
create trigger pause_events_updated_at before update on public.pause_events
for each row execute function public.set_updated_at();
create trigger journal_entries_updated_at before update on public.journal_entries
for each row execute function public.set_updated_at();
create trigger push_subscriptions_updated_at before update on public.push_subscriptions
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.consents enable row level security;
alter table public.broker_connections enable row level security;
alter table public.pacts enable row level security;
alter table public.pact_changes enable row level security;
alter table public.checkins enable row level security;
alter table public.trade_events enable row level security;
alter table public.risk_assessments enable row level security;
alter table public.pause_events enable row level security;
alter table public.journal_entries enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.outbox_events enable row level security;
alter table public.audit_events enable row level security;
alter table public.synthetic_fixtures enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.devices to authenticated;
grant select, insert, update on public.consents to authenticated;
grant select, insert, update on public.pacts to authenticated;
grant select, insert on public.pact_changes to authenticated;
grant select, insert, update on public.checkins to authenticated;
grant select on public.trade_events to authenticated;
grant select on public.risk_assessments to authenticated;
grant select, insert, update on public.pause_events to authenticated;
grant select, insert, update, delete on public.journal_entries to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select on public.synthetic_fixtures to anon, authenticated;

create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy profiles_insert_own on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy devices_own on public.devices for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy consents_select_own on public.consents for select to authenticated using ((select auth.uid()) = user_id);
create policy consents_insert_own on public.consents for insert to authenticated with check ((select auth.uid()) = user_id);
create policy consents_update_own on public.consents for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy pacts_select_own on public.pacts for select to authenticated using ((select auth.uid()) = user_id);
create policy pacts_insert_own on public.pacts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy pacts_update_own on public.pacts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy pact_changes_select_own on public.pact_changes for select to authenticated using ((select auth.uid()) = user_id);
create policy pact_changes_insert_own on public.pact_changes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy checkins_own on public.checkins for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy trade_events_select_own on public.trade_events for select to authenticated using ((select auth.uid()) = user_id);
create policy assessments_select_own on public.risk_assessments for select to authenticated using ((select auth.uid()) = user_id);
create policy pauses_own on public.pause_events for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy journals_own on public.journal_entries for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy push_subscriptions_own on public.push_subscriptions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy synthetic_fixtures_read on public.synthetic_fixtures for select to anon, authenticated using (true);

comment on table public.broker_connections is 'Server-only encrypted broker sessions. No anon/authenticated table grants.';
comment on column public.broker_connections.encrypted_access_token is 'Authenticated ciphertext only; never plaintext and never exposed through client APIs.';
comment on table public.outbox_events is 'Server-only durable background delivery queue.';
comment on table public.audit_events is 'Security metadata only; no free text, raw financial payload, or credentials.';

commit;
