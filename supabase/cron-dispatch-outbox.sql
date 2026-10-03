-- Durable retry for push delivery. Run once per environment (after replacing the two
-- placeholders) from the SQL editor; it is intentionally not a migration because the
-- project URL and service key differ per environment.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'dispatch-outbox-retry',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/dispatch-outbox',
    headers := jsonb_build_object('Authorization', 'Bearer <service-role-key>')
  );
  $$
);
