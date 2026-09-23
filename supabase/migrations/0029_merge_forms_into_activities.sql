-- Two kinds of activity, one table (D178) — reversing D161.
--
-- D161 gave forms their own tables, and one of its two arguments was simply wrong: it said a
-- merge "would mean nullable session columns everywhere", but sessions were always their own
-- table and a merge never touched them. The real cost is three nullable columns, which is not
-- a reason to run two parallel policy systems.
--
-- The argument D161 missed is the one that decides it: `activities` and `forms` had the SAME
-- policy — categories, an open flag, a per-attendee cap, a sort order, "required" — and it was
-- implemented twice. `canSubmit` and `activityState` both decided eligibility; `missingFrom`
-- and `unbookedByActivity` both computed who had not taken part. Two implementations of one
-- rule is how they end up disagreeing, which this codebase has said in four other places.
--
-- What does NOT merge is the children, and that is the point of `kind` rather than a flag: a
-- booking is a seat in a session and a submission is a set of answers. They keep their own
-- tables, their own write functions and their own races.
--
-- Safe to run because `forms` is empty (no event has used one yet). The INSERT below is written
-- correctly regardless, so this migration is not silently dependent on that being true.

alter table activities
  -- 'booking' is the default so every existing row keeps its meaning without a backfill.
  add column if not exists kind text not null default 'booking'
    check (kind in ('booking', 'submission')),
  -- Submission-only. A booking activity carries an empty array, not null: "no questions" is a
  -- fact about it, not an absence of information.
  add column if not exists questions jsonb not null default '[]'::jsonb,
  -- Submission-only. At most one submission per Malaysian calendar day (D171).
  add column if not exists per_day boolean not null default false;

-- `booking_open` was honest while bookings were the only kind. It is a lie on a submission
-- activity, and a schema outlives the refactor that shaped it.
alter table activities rename column booking_open to is_open;

-- Both kinds now share one cap, so it takes the wider of the two meanings: null is no cap at
-- all (a daily check-in across ten weeks has none), and the ceiling rises from 10 to 366.
-- Booking activities gain "unlimited" as a result, which is a real new capability and a
-- coherent one — an open drop-in with no per-person limit (D178).
alter table activities alter column max_per_attendee drop not null;
alter table activities drop constraint if exists activities_max_per_attendee_check;
alter table activities add constraint activities_max_per_attendee_check
  check (max_per_attendee is null or max_per_attendee between 1 and 366);

-- Carry any forms across, then retire the table. Empty today; correct if it were not.
insert into activities (id, org_id, event_id, name, description, kind, questions, is_open,
                        categories, max_per_attendee, per_day, sort_order, created_at)
select id, org_id, event_id, name, description, 'submission', questions, submissions_open,
       categories, max_per_attendee, per_day, sort_order, created_at
from forms
on conflict (id) do nothing;

-- `form_submissions` becomes a sibling of `activity_bookings`: same parent, same naming.
alter table form_submissions rename to activity_submissions;
alter table activity_submissions rename column form_id to activity_id;

alter table activity_submissions drop constraint if exists form_submissions_form_id_fkey;
alter table activity_submissions
  add constraint activity_submissions_activity_id_fkey
  foreign key (activity_id) references activities(id) on delete cascade;

alter index if exists form_submissions_one_a_day rename to activity_submissions_one_a_day;
alter index if exists form_submissions_form_idx rename to activity_submissions_activity_idx;
alter index if exists form_submissions_attendee_idx rename to activity_submissions_attendee_idx;

drop table forms;
