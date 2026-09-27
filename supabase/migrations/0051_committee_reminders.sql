-- Committee reminders: an event's alert numbers, and when each change request was reminded
-- about, so a request that waits an hour is announced once.
alter table events add column committee_alert_numbers text[] not null default '{}';
alter table activity_change_requests add column reminded_at timestamptz;
create index activity_change_requests_due_idx on activity_change_requests (created_at)
  where status = 'pending' and reminded_at is null;

-- Every five minutes, ask the app to send what has fallen due. The secret is read from Vault at
-- call time (`committee_reminders_secret`, created outside migrations so it never sits in git);
-- without it the header is null and the route answers 401.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule(
  'committee-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://ecphub.vercel.app/api/cron/committee-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'committee_reminders_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
