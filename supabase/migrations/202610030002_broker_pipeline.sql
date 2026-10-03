begin;

-- Single-use broker login state. Server-only: no client grants.
create table public.broker_login_states (
  nonce text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('zerodha', 'angel_one')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index broker_login_states_user_idx on public.broker_login_states(user_id, expires_at);

alter table public.broker_login_states enable row level security;
revoke all on public.broker_login_states from anon, authenticated;
comment on table public.broker_login_states is 'Server-only single-use OAuth-style state for broker hosted login.';

-- Pact edits are server-authoritative: clients can read but not write, so a device
-- cannot shorten the loosening delay by writing rows directly.
revoke insert, update on public.pacts from authenticated;
revoke insert on public.pact_changes from authenticated;

-- One logical notification per domain object, regardless of retries.
create unique index outbox_events_dedupe_idx
  on public.outbox_events(event_type, aggregate_type, aggregate_id);

-- Atomically store a canonical broker event with its assessment, pause and outbox row.
-- Returns 'duplicate' (and writes nothing else) when the event was already ingested.
create or replace function public.ingest_broker_event(
  p_event jsonb,
  p_assessment jsonb,
  p_pause jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (p_event ->> 'user_id')::uuid;
  v_event_id uuid := (p_event ->> 'id')::uuid;
  v_inserted uuid;
  v_pause_id uuid;
begin
  insert into public.trade_events (
    id, user_id, broker_connection_id, provider, provider_event_id, provider_order_id,
    event_type, observed_at, received_at, status, symbol, side, quantity,
    average_price_paise, pnl_paise, source, dedupe_hash, retain_until
  )
  values (
    v_event_id,
    v_user,
    nullif(p_event ->> 'broker_connection_id', '')::uuid,
    p_event ->> 'provider',
    p_event ->> 'provider_event_id',
    p_event ->> 'provider_order_id',
    p_event ->> 'event_type',
    (p_event ->> 'observed_at')::timestamptz,
    (p_event ->> 'received_at')::timestamptz,
    p_event ->> 'status',
    p_event ->> 'symbol',
    p_event ->> 'side',
    (p_event ->> 'quantity')::numeric,
    (p_event ->> 'average_price_paise')::bigint,
    (p_event ->> 'pnl_paise')::bigint,
    p_event ->> 'source',
    p_event ->> 'dedupe_hash',
    now() + interval '30 days'
  )
  on conflict do nothing
  returning id into v_inserted;

  if v_inserted is null then
    return 'duplicate';
  end if;

  insert into public.risk_assessments (
    id, user_id, trade_event_id, score, tier, signal_hits, hard_rule_overrides,
    engine_version, config_version, evaluated_at
  )
  values (
    (p_assessment ->> 'id')::uuid,
    v_user,
    v_event_id,
    (p_assessment ->> 'score')::numeric,
    p_assessment ->> 'tier',
    coalesce(p_assessment -> 'signal_hits', '[]'::jsonb),
    coalesce(p_assessment -> 'hard_rule_overrides', '[]'::jsonb),
    p_assessment ->> 'engine_version',
    p_assessment ->> 'config_version',
    (p_assessment ->> 'evaluated_at')::timestamptz
  );

  if p_pause is not null then
    v_pause_id := (p_pause ->> 'id')::uuid;

    insert into public.pause_events (
      id, user_id, assessment_id, tier, started_at, expires_at, outcome, idempotency_key
    )
    values (
      v_pause_id,
      v_user,
      (p_assessment ->> 'id')::uuid,
      p_pause ->> 'tier',
      (p_pause ->> 'started_at')::timestamptz,
      nullif(p_pause ->> 'expires_at', '')::timestamptz,
      'waiting',
      'broker-' || v_event_id::text
    );

    -- Generic payload only: no amount, symbol, source or journal text.
    insert into public.outbox_events (user_id, event_type, aggregate_type, aggregate_id, payload)
    values (
      v_user,
      'pause_created',
      'pause_event',
      v_pause_id,
      jsonb_build_object(
        'kind', 'pause',
        'pauseId', v_pause_id,
        'simulated', (p_event ->> 'source') = 'synthetic'
      )
    )
    on conflict do nothing;
  end if;

  return 'created';
end;
$$;

revoke all on function public.ingest_broker_event(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_broker_event(jsonb, jsonb, jsonb) to service_role;

-- Worker lease: expires sessions past their token lifetime, then leases live connections
-- whose monitoring consent is still active. Rows are skipped when another worker holds a lease.
create or replace function public.claim_broker_connections(
  p_worker text,
  p_lease_seconds integer,
  p_limit integer
)
returns setof public.broker_connections
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.broker_connections
     set status = 'reauth_required',
         encrypted_access_token = null,
         token_key_version = null,
         lease_owner = null,
         lease_expires_at = null
   where status in ('connecting', 'live', 'reconnecting', 'stale')
     and expires_at is not null
     and expires_at <= now();

  return query
  with candidates as (
    select c.id
      from public.broker_connections c
      join public.consents k on k.id = c.consent_id and k.revoked_at is null
     where c.status in ('connecting', 'live', 'reconnecting', 'stale')
       and (c.lease_owner is null or c.lease_owner = p_worker or c.lease_expires_at < now())
     order by c.created_at
     limit p_limit
       for update of c skip locked
  ),
  claimed as (
    update public.broker_connections c
       set lease_owner = p_worker,
           lease_expires_at = now() + make_interval(secs => p_lease_seconds)
      from candidates
     where c.id = candidates.id
    returning c.*
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_broker_connections(text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_broker_connections(text, integer, integer) to service_role;

commit;
