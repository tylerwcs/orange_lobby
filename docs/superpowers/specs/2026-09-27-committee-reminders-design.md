# Committee reminders — design

Approved in chat on 27 Sep 2026. When an attendee's booking change or cancel request has waited
an hour without a decision, the event's committee gets one WhatsApp saying how many are waiting.
Alongside it, the word "desk" becomes "committee" wherever it names the people who decide.

## Decisions

- **When:** only after a request has waited 60 minutes undecided. Nothing on arrival.
- **Who:** a list of WhatsApp numbers per event ("Committee alerts" in Settings). No admin
  account needed; an event with no numbers sends nothing.
- **Hours:** any time of day — no overnight hold.
- **How often:** each request is reminded about once. One message per event per round, however
  many requests fell due in it.
- **Wording:** "committee", never "desk", for the people who decide. "Registration desk" stays:
  it is a physical table at the venue.

## Settings

- A "Committee alerts" card in the event's Settings: a textarea, one number per line, and Save.
- Numbers go through `toE164My`, as attendee numbers do (Malaysian only). A line that does not
  read as a number is refused by name and nothing is saved; duplicates collapse.
- Stored in `events.committee_alert_numbers text[] not null default '{}'`, normalised.

## The reminder

- Template `ecphub_committee_pending`, Utility, positional, language `en`, footer
  "Ecopia Events":
  "There are {{1}} waiting for a decision at {{2}}, the oldest for over an hour. Tap below to
  review them." — {{1}} is "1 booking change request" / "3 booking change requests", {{2}} the
  event name.
- URL button "Review requests" → `https://ecphub.vercel.app/admin/requests/{{1}}`, {{1}} the
  event id. `/admin/requests/[eventId]` is a new route that checks the admin session and the
  event's org, then redirects to `/admin/events/<id>/activities`, where every activity shows its
  pending count.
- Not written to `whatsapp_sends`: that log is attendee sends (`attendee_id not null`).

## The timer

- Migration enables `pg_cron` and `pg_net` and schedules a job every 5 minutes that POSTs to
  `https://ecphub.vercel.app/api/cron/committee-reminders` with
  `Authorization: Bearer <secret>`. The secret lives in Supabase Vault as
  `committee_reminders_secret` and on Vercel as `CRON_SECRET`; the route refuses anything else
  with 401.
- A reminder therefore lands 60–65 minutes after the request.
- Vercel Cron was passed over: the Hobby plan runs a job at most once a day.

## The round

1. Load pending requests with `created_at <= now() - 60 min` and `reminded_at is null`.
2. Group by event. For an event with no alert numbers, skip it and leave its requests
   un-stamped (adding numbers later picks them up).
3. For each event with numbers: claim the due requests first — stamp `reminded_at` with
   `reminded_at is null` in the update's filter, and count only the rows this round won — so two
   overlapping rounds cannot both announce the same request.
4. Then send the template to each number with that count. The stamp stands whether or not Meta
   accepted the message, so a template still in review cannot cause a send every five minutes.
5. Respond with `{ events, requests, sent, failed }` for the cron log.

`activity_change_requests.reminded_at timestamptz` is the new column.

## Copy: desk → committee

The people who decide requests, on attendee and admin screens:
"The committee will decide", "The committee approves the move", "The committee can move you
later", "The committee declined your request…", "Ask the committee to cancel…", "Ask the
committee to move you…", "Your seat is held until the committee agrees", "Waiting for the
committee", "what the facilitator or the committee prints". Code comments are left alone.

## Testing

- Unit: which requests are due and how they group (`committeeDue`), the count phrase, reading
  the numbers textarea, the route's 401 without the secret.
- Browser: the Settings card on a test event (never `ecphub`).
- One manual round against a test event, with alert numbers the user chooses.
