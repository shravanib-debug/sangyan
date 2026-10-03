begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.broker_login_states'::regclass),
  'broker_login_states has RLS enabled'
);
select ok(
  not has_table_privilege('authenticated', 'public.broker_login_states', 'SELECT'),
  'clients cannot read broker login state'
);
select ok(
  not has_table_privilege('authenticated', 'public.pacts', 'UPDATE'),
  'clients cannot update pacts directly (server-authoritative loosening)'
);
select ok(
  not has_table_privilege('authenticated', 'public.pact_changes', 'INSERT'),
  'clients cannot insert pact changes directly'
);
select ok(
  not has_function_privilege('authenticated', 'public.ingest_broker_event(jsonb, jsonb, jsonb)', 'EXECUTE'),
  'clients cannot call the ingest function'
);
select ok(
  not has_function_privilege('anon', 'public.claim_broker_connections(text, integer, integer)', 'EXECUTE'),
  'anonymous users cannot claim broker connections'
);
select ok(
  has_function_privilege('service_role', 'public.ingest_broker_event(jsonb, jsonb, jsonb)', 'EXECUTE'),
  'service role can call the ingest function'
);
select has_index('public', 'outbox_events', 'outbox_events_dedupe_idx', 'outbox dedupes per aggregate');
select ok(
  not has_table_privilege('authenticated', 'public.risk_assessments', 'INSERT'),
  'clients cannot forge risk assessments'
);

select * from finish();
rollback;
