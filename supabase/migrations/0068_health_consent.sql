-- Explicit consent before an activity collects health data (D412).
--
-- PDPA treats physical or mental health as sensitive personal data: it may be processed only
-- with the data subject's explicit consent, which the general Privacy Notice consent (D410) is
-- not. An organiser marks a submission activity that asks for it - InBody results, a medical
-- condition - and each attendee then ticks a separate consent once, before their first entry.
--
-- One row per attendee per activity: a nine-week challenge is asked once, not every day.
-- consent_notice is the Privacy Notice's date at the time, as on attendees (D410).
--
-- The rows are kept through a purge: like attendees.consented_at they identify nobody once the
-- attendee is anonymised, and they are the record that consent was had. They go with the
-- attendee or the activity when either is deleted.
alter table activities add column health_data boolean not null default false;

create table health_consents (
  attendee_id uuid not null references attendees(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  consented_at timestamptz not null default now(),
  consent_notice text not null,
  primary key (attendee_id, activity_id)
);
create index health_consents_activity_idx on health_consents (activity_id);
create index health_consents_event_idx on health_consents (event_id);

-- Written and read by the server alone, through the service role, like every other table.
alter table health_consents enable row level security;
