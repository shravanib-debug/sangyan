insert into public.synthetic_fixtures (id, persona, description, payload, seed)
values
  (
    'calm-v1',
    'calm',
    'Synthetic calm-trading fixture for deterministic tests.',
    '{"synthetic":true,"trades":[]}'::jsonb,
    101
  ),
  (
    'revenge-v1',
    'revenge',
    'Synthetic rapid post-loss sequence; never derived from a real account.',
    '{"synthetic":true,"trades":[]}'::jsonb,
    202
  ),
  (
    'loan-funded-v1',
    'loan_funded',
    'Synthetic instant-loan check-in; never derived from a real person.',
    '{"synthetic":true,"fundSource":"borrowed","borrowKind":"instant_loan"}'::jsonb,
    303
  )
on conflict (id) do update
set description = excluded.description,
    payload = excluded.payload,
    seed = excluded.seed;
