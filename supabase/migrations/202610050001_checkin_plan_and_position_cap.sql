begin;

-- Structured check-in plan (D-017). Self-reported, no free text; synced like fund_source.
alter table public.checkins
  add column exit_plan text check (exit_plan is null or exit_plan in ('price_level', 'loss_percent', 'time', 'undecided')),
  add column triggers jsonb not null default '[]'::jsonb
    check (jsonb_typeof(triggers) = 'array' and jsonb_array_length(triggers) <= 5);

-- Optional per-trade cap the user commits to in their Pact; null means no cap.
alter table public.pacts
  add column max_position_paise bigint check (max_position_paise is null or max_position_paise > 0);

commit;
