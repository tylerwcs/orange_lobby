-- One row per WhatsApp template message the app hands to Meta.
--
-- Meta's send call answers `accepted`, which means it took the message — not that anybody
-- received it. Delivery and failure arrive later, over the webhook, keyed by the `wamid` the
-- send returned. Without this table there is nowhere to put that answer, and a blast of 150
-- personal links is sent blind: no way to tell the eight people whose number was wrong from
-- the ones who simply have not opened WhatsApp yet.
create table whatsapp_sends (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  event_id uuid not null references events(id) on delete cascade,
  attendee_id uuid not null references attendees(id) on delete cascade,
  -- The approved template's name, as Meta knows it. Not a foreign key: templates live in
  -- Meta's account, not here, and one that is deleted there must not erase the record that
  -- it was once sent.
  template text not null,
  -- What was actually dialled, after src/lib/phone.ts normalised it. Stored rather than
  -- recomputed because the attendee's phone can be edited afterwards, and the question this
  -- row answers is "where did it go", not "where would it go now".
  to_e164 text not null,
  -- Meta's message id. Null until the send is accepted; unique because the webhook finds
  -- this row by it, and two rows answering to one wamid would make that lookup a coin toss.
  wamid text unique,
  -- queued -> accepted -> sent -> delivered -> read, or failed at any point.
  status text not null default 'queued',
  error_code int,
  error_title text,
  -- What makes the 28th safe to retry. The portal-link blast writes
  -- `portal_link:<attendee_id>`, so a re-run after a half-finished send cannot message anyone
  -- twice; day-of notices leave it null and may repeat as often as the organiser needs.
  -- Nullable and unique: Postgres lets nulls repeat under a unique constraint, which is
  -- exactly the two behaviours wanted from one column.
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index whatsapp_sends_event_idx on whatsapp_sends (event_id, created_at desc);
create index whatsapp_sends_attendee_idx on whatsapp_sends (attendee_id);

alter table whatsapp_sends enable row level security;
-- No policies on purpose: only the service role (which bypasses RLS) may access data. The
-- webhook writes here too, and it authenticates by Meta's signature rather than by a user.
