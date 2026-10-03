begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'profiles has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.broker_connections'::regclass),
  'broker_connections has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.trade_events'::regclass),
  'trade_events has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.outbox_events'::regclass),
  'outbox_events has RLS enabled'
);
select ok(
  not has_table_privilege('anon', 'public.profiles', 'SELECT'),
  'anonymous users cannot read profiles'
);
select ok(
  not has_table_privilege('authenticated', 'public.broker_connections', 'SELECT'),
  'authenticated clients cannot read encrypted broker connections directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.broker_connections', 'INSERT'),
  'authenticated clients cannot write broker connections directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.outbox_events', 'SELECT'),
  'authenticated clients cannot read the outbox'
);
select ok(
  has_table_privilege('anon', 'public.synthetic_fixtures', 'SELECT'),
  'anonymous users can read public synthetic fixtures'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'profiles'),
  3,
  'profiles has explicit select, insert, and update policies'
);

select * from finish();
rollback;
