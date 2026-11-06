-- 0128: the one-minute timer for session reminders (D836). Applied after the route is live, so
-- it never calls an address that is not there yet.
--
-- Every minute, ask the app to send the reminders that have fallen due. Same Vault secret as
-- the committee reminders (0051): the route checks it against CRON_SECRET on Vercel.
select cron.schedule(
  'session-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://ecphub.vercel.app/api/cron/session-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'committee_reminders_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
