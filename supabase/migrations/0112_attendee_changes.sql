-- Attendee change log (spec 2026-10-28-attendee-change-log-design.md, D742): one row per staff
-- change to an event's attendees - who (admin or committee), when, what, and the detail to open.
-- Like every table here: RLS on, no policies, only the service role reads or writes it.
create table if not exists public.attendee_changes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  at timestamptz not null default now(),
  -- No FK: the row outlives the login, and the name and email below are kept as they were.
  actor_user_id uuid,
  actor_email text not null,
  actor_name text not null,
  actor_kind text not null check (actor_kind in ('admin', 'committee')),
  -- No check constraint: the list of kinds lives in code (src/features/attendee-log).
  kind text not null,
  summary text not null,
  -- Every attendee the change touched. Kept only so a PDPA erasure can be done by hand (D744):
  -- erase_from_attendee_changes finds the rows through it. No FK, as the attendee may be gone.
  attendee_ids uuid[] not null default '{}',
  -- Lower-cased summary plus the name and email of each person in detail.people, for the log search.
  search text not null default '',
  -- Field-level before/after, deleted snapshots and bulk lists; each person carries attendeeId,
  -- name and email under detail.people.
  detail jsonb not null default '{}'::jsonb
);
create index if not exists attendee_changes_event_at on public.attendee_changes (event_id, at desc);
create index if not exists attendee_changes_attendee_ids on public.attendee_changes using gin (attendee_ids);
alter table public.attendee_changes enable row level security;

-- D744: the developer's by-hand PDPA erasure; no app code calls it. A row about only this person
-- is deleted. A row about several keeps the others: the person leaves attendee_ids and
-- detail.people, and search is rebuilt from the summary and the people who remain.
-- Returns the number of rows deleted or rewritten.
create or replace function public.erase_from_attendee_changes(p_attendee_id uuid) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted int;
  v_rewritten int;
begin
  delete from public.attendee_changes where attendee_ids = array[p_attendee_id];
  get diagnostics v_deleted = row_count;

  update public.attendee_changes c
  set attendee_ids = array_remove(c.attendee_ids, p_attendee_id),
      detail = case
        when jsonb_typeof(c.detail -> 'people') = 'array' then jsonb_set(c.detail, '{people}', r.people)
        else c.detail
      end,
      search = lower(btrim(c.summary || ' ' || r.names))
  from (
    select
      x.id,
      coalesce(jsonb_agg(p.person) filter (where p.person is not null), '[]'::jsonb) as people,
      coalesce(string_agg(coalesce(p.person ->> 'name', '') || ' ' || coalesce(p.person ->> 'email', ''), ' ') filter (where p.person is not null), '') as names
    from public.attendee_changes x
    left join lateral (
      select e.person
      from jsonb_array_elements(case when jsonb_typeof(x.detail -> 'people') = 'array' then x.detail -> 'people' else '[]'::jsonb end) as e(person)
      where e.person ->> 'attendeeId' is distinct from p_attendee_id::text
    ) p on true
    where x.attendee_ids @> array[p_attendee_id]
    group by x.id
  ) r
  where c.id = r.id;
  get diagnostics v_rewritten = row_count;

  return v_deleted + v_rewritten;
end;
$$;
revoke all on function public.erase_from_attendee_changes(uuid) from public, anon, authenticated;
grant execute on function public.erase_from_attendee_changes(uuid) to service_role;
