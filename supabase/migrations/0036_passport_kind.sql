-- The Booth Passport becomes the third kind of activity (D179) — the expand half of an
-- expand/contract pair (D189). 0037 drops events.stamps_required and events.stamps_message
-- once the code that stops reading them is live.
--
-- Booths become a passport's children the way sessions are a booking's (D180). booth_stamps is
-- untouched: a stamp still points at a booth, and a booth now points at its passport.

alter table activities drop constraint if exists activities_kind_check;
alter table activities add constraint activities_kind_check
  check (kind in ('booking', 'submission', 'passport'));

-- Passport-only, as questions and per_day are submission-only (D182). Null target is every
-- booth, exactly as events.stamps_required meant.
alter table activities
  add column if not exists stamps_required int check (stamps_required is null or stamps_required >= 1),
  add column if not exists reward_message text;

-- Cascade, not restrict: deleting a passport takes its booths — and the restrict that
-- booth_stamps.booth_id already carries is what refuses that once anyone is stamped (D188).
alter table booths add column if not exists activity_id uuid references activities(id) on delete cascade;

-- One open, everyone passport per event that has booths (D186), named after the event's own
-- "stamps" tile when it has one. Written for the data that might exist, not the data believed
-- to exist (the 0029 lesson), and idempotent: an event that already has a passport is skipped.
insert into activities (org_id, event_id, name, kind, required, is_open, max_per_attendee,
                        categories, stamps_required, reward_message, sort_order)
select e.org_id, e.id,
       coalesce(
         (select nullif(btrim(m->>'label'), '')
            from jsonb_array_elements(case when jsonb_typeof(e.modules) = 'array' then e.modules else '[]'::jsonb end) m
           where m->>'key' = 'tile' and m->'target'->>'route' = 'stamps'
           limit 1),
         'Booth Passport'),
       'passport', false, true, null, null,
       -- A zero or negative target always meant "every booth" (stampsTarget); the new column
       -- refuses it, so it arrives as the null that means the same thing.
       case when e.stamps_required >= 1 then e.stamps_required end,
       e.stamps_message,
       coalesce((select max(a.sort_order) + 1 from activities a where a.event_id = e.id), 0)
  from events e
 where exists (select 1 from booths b where b.event_id = e.id)
   and not exists (select 1 from activities a where a.event_id = e.id and a.kind = 'passport');

update booths b
   set activity_id = (select a.id from activities a
                       where a.event_id = b.event_id and a.kind = 'passport'
                       order by a.sort_order, a.created_at limit 1)
 where b.activity_id is null;

alter table booths alter column activity_id set not null;
create index if not exists booths_activity_id_idx on booths (activity_id);

-- Stamping, decided in one function (D185). It was a bare insert while there was nothing to
-- check; categories and the open flag (D184) would make it a read-then-write in the server
-- action, and every other activity write here is decided in the database for that reason.
create or replace function record_stamp(p_booth_id uuid, p_attendee_id uuid) returns text
language plpgsql
as $$
declare
  b booths%rowtype;
  a activities%rowtype;
  att attendees%rowtype;
  inserted int;
begin
  select * into b from booths where id = p_booth_id;
  if not found then return 'missing'; end if;

  -- FOR SHARE, not FOR UPDATE: a close (an UPDATE of this row) waits for stamps in flight and
  -- they wait for it, so a stamp is either before the close or after it — but two booths
  -- stamping at once do not queue behind each other.
  select * into a from activities where id = b.activity_id for share;
  if not found then return 'missing'; end if;
  -- The 0030 convention: another kind's id is not a closed passport, it is no passport.
  if a.kind <> 'passport' then return 'missing'; end if;

  select * into att from attendees where id = p_attendee_id;
  if not found or att.event_id <> b.event_id then return 'missing'; end if;

  if not a.is_open then return 'closed'; end if;

  if a.categories is not null and array_length(a.categories, 1) > 0 then
    if att.category is null or not exists (
      select 1 from unnest(a.categories) c
      where lower(btrim(c)) = lower(btrim(att.category))
    ) then
      return 'ineligible';
    end if;
  end if;

  insert into booth_stamps (org_id, event_id, booth_id, attendee_id)
  values (b.org_id, b.event_id, b.id, p_attendee_id)
  on conflict (booth_id, attendee_id) do nothing;
  get diagnostics inserted = row_count;

  return case when inserted = 1 then 'ok' else 'duplicate' end;
end;
$$;

revoke execute on function record_stamp(uuid, uuid) from public, anon, authenticated;
grant execute on function record_stamp(uuid, uuid) to service_role;
