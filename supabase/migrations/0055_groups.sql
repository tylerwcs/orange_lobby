-- D344–D358 — attendee groups, and submission forms that run per group.
-- One group per attendee per event (D344): membership is a column, not a join table.
-- Composite foreign keys keep a group, its members and its entries inside one event.

create table event_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  event_id uuid not null references events(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (id, event_id)
);
create unique index event_groups_name on event_groups (event_id, lower(btrim(name)));
alter table event_groups enable row level security;

-- D349: deleting a group ungroups its members. Only group_id is nulled; event_id stays.
alter table attendees
  add column group_id uuid,
  add constraint attendees_group_fk foreign key (group_id, event_id)
    references event_groups (id, event_id) on delete set null (group_id);
create index attendees_group_idx on attendees (group_id) where group_id is not null;

-- D348: attendee field keys members may see about each other. Names are always shown.
alter table events add column group_fields jsonb not null default '[]'::jsonb;

-- D350/D351: who submits. A group form has no per-day rule.
alter table activities
  add column group_mode text not null default 'off'
    check (group_mode in ('off', 'entries', 'everyone')),
  add column group_target int check (group_target between 1 and 50),
  -- Named to not collide with the inline check above, which Postgres auto-names
  -- activities_group_target_check (<table>_<column>_check).
  add constraint activities_group_target_required_check
    check ((group_mode = 'entries') = (group_target is not null)),
  add constraint activities_group_per_day_check
    check (group_mode = 'off' or not per_day);

-- D355: an entry belongs to the group it was submitted for. D349: it survives the group's delete.
alter table activity_submissions
  add column group_id uuid,
  add constraint activity_submissions_group_fk foreign key (group_id, event_id)
    references event_groups (id, event_id) on delete set null (group_id);
create index activity_submissions_group_idx
  on activity_submissions (activity_id, group_id) where status = 'submitted';

-- D358: the group rules run under the same activity row lock as every other check, so two
-- members cannot both take a group's last entry, and one member cannot submit twice in
-- 'everyone' mode. A group form skips max_per_attendee and per_day (D351).
create or replace function submit_answers(
  p_activity_id uuid,
  p_attendee_id uuid,
  p_answers jsonb,
  p_today date
) returns text
language plpgsql
as $$
declare
  a activities%rowtype;
  att attendees%rowtype;
  used int;
  v_constraint text;
begin
  select * into a from activities where id = p_activity_id for update;
  if not found then return 'missing'; end if;
  if a.kind <> 'submission' then return 'missing'; end if;

  select * into att from attendees where id = p_attendee_id;
  if not found or att.event_id <> a.event_id then return 'missing'; end if;

  if not a.is_open then return 'closed'; end if;

  if not category_matches(a.categories, att.category) then return 'ineligible'; end if;

  if a.group_mode <> 'off' then
    if att.group_id is null then return 'nogroup'; end if;
    if a.group_mode = 'entries' then
      select count(*) into used from activity_submissions
       where activity_id = a.id and group_id = att.group_id and status = 'submitted';
      if used >= a.group_target then return 'groupdone'; end if;
    elsif exists (
      select 1 from activity_submissions
       where activity_id = a.id and attendee_id = p_attendee_id
         and group_id = att.group_id and status = 'submitted'
    ) then
      return 'limit';
    end if;
  else
    if a.max_per_attendee is not null then
      select count(*) into used from activity_submissions
       where activity_id = a.id and attendee_id = p_attendee_id and status = 'submitted';
      if used >= a.max_per_attendee then return 'limit'; end if;
    end if;

    if a.per_day and exists (
      select 1 from activity_submissions
       where activity_id = a.id and attendee_id = p_attendee_id and submitted_on = p_today and status = 'submitted'
    ) then
      return 'today';
    end if;
  end if;

  insert into activity_submissions (event_id, activity_id, attendee_id, group_id, answers, submitted_on, per_day)
  values (
    a.event_id, a.id, p_attendee_id,
    case when a.group_mode <> 'off' then att.group_id end,
    coalesce(p_answers, '{}'::jsonb), p_today, a.per_day
  );

  return 'ok';
exception
  -- Scoped to that one constraint BY NAME, as in 0053: anything else is a genuine fault.
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'activity_submissions_one_a_day' then
      return 'today';
    end if;
    raise;
end;
$$;

revoke execute on function submit_answers(uuid, uuid, jsonb, date) from public, anon, authenticated;
grant execute on function submit_answers(uuid, uuid, jsonb, date) to service_role;
