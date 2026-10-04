begin;

alter table public.pause_events
  drop constraint pause_events_outcome_check;

alter table public.pause_events
  add constraint pause_events_outcome_check
  check (outcome in ('waiting', 'continued', 'skipped_pause', 'abandoned', 'expired'));

commit;
