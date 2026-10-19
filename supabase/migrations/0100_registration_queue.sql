-- Registration limit, waiting list and approval (spec 2026-10-19-registration-limit-waitlist-design.md,
-- D677-D703, with the approval amendment D696-D703). Adds two columns to events, one table and the
-- functions every place-taking goes through; no existing row changes.
--
-- Locking (D688): every function that can take, free or hand out a place first locks the event row
-- with `for no key update`. That serialises them per event, so the last place cannot be taken twice
-- and two fills cannot move the same person in, while (unlike `for update`) it does not block other
-- sessions inserting rows that merely reference the event (their foreign-key check takes `key
-- share`, which `no key update` allows). Under read committed each statement after the lock sees
-- everything the previous holder committed, so the counts below are always current.

-- D677: a limit on form registrations (null = none). D696: registrations need approval.
alter table public.events
  add column if not exists registration_limit integer check (registration_limit > 0),
  add column if not exists registration_needs_approval boolean not null default false;

-- D687 + amendment: everyone who is waiting, pending, or was once either, lives here rather than in
-- `attendees`, so no existing attendees reader can see them. One row per person per event, reused
-- when they come back (D702). The token is the person's link before and after they are moved in.
create table if not exists public.registration_entries (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organisations (id),
  event_id        uuid not null references public.events (id) on delete cascade,
  token           text not null,
  name            text not null,
  email           text not null check (email = lower(email)),
  extra           jsonb not null default '{}'::jsonb,
  consented_at    timestamptz,
  consent_notice  text,
  terms_agreed_at timestamptz,
  state           text not null check (state in ('waiting', 'pending', 'declined', 'left', 'removed', 'registered')),
  -- D679: queue order. Written with clock_timestamp() after the event lock, so the order is the
  -- order places were decided in, not the order transactions happened to start.
  joined_at       timestamptz not null default now(),
  -- When the entry ended (declined, left, removed, registered).
  decided_at      timestamptz,
  attendee_id     uuid references public.attendees (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists registration_entries_event_email_uq on public.registration_entries (event_id, lower(email));
create unique index if not exists registration_entries_token_uq on public.registration_entries (token);
create index if not exists registration_entries_waiting_idx on public.registration_entries (event_id, joined_at, id) where state = 'waiting';
create index if not exists registration_entries_pending_idx on public.registration_entries (event_id, joined_at) where state = 'pending';
create index if not exists registration_entries_attendee_idx on public.registration_entries (attendee_id) where attendee_id is not null;

-- Service role only, as tournament_sports (0097): RLS on, no policies.
alter table public.registration_entries enable row level security;

-- D677, D697: places taken = active form registrations + pending entries. Imports and admin adds
-- never count. D691: with a limit set, full when taken >= limit or anyone waits, so the queue is
-- never skipped. D683: open = switch on, close time not passed, not archived (registrationOpenNow).
create or replace function public.registration_places(p_event_id uuid)
returns table(taken int, waiting int, pending int, lim int, full_ boolean, open_ boolean)
language sql
set search_path = ''
as $$
  with c as (
    select
      (select count(*)::int from public.attendees a
        where a.event_id = e.id and a.source = 'registration' and a.cancelled_at is null) as reg,
      (select count(*)::int from public.registration_entries r where r.event_id = e.id and r.state = 'pending') as pend,
      (select count(*)::int from public.registration_entries r where r.event_id = e.id and r.state = 'waiting') as wait,
      e.registration_limit as lim, e.status, e.registration_open, e.registration_closes_at
    from public.events e
    where e.id = p_event_id
  )
  select c.reg + c.pend, c.wait, c.pend, c.lim,
    c.lim is not null and (c.reg + c.pend >= c.lim or c.wait > 0),
    c.status <> 'archived' and c.registration_open and (c.registration_closes_at is null or c.registration_closes_at > now())
  from c;
$$;

-- D680: 1-based place among the event's waiting entries (null unless waiting).
create or replace function public.registration_entry_position(p_entry_id uuid)
returns int
language sql
set search_path = ''
as $$
  select (
    select count(*)::int + 1 from public.registration_entries o
    where o.event_id = r.event_id and o.state = 'waiting' and (o.joined_at, o.id) < (r.joined_at, r.id)
  )
  from public.registration_entries r
  where r.id = p_entry_id and r.state = 'waiting';
$$;

-- D687, D692, D695: makes a person a registered attendee. Their existing row (cancelled, by email)
-- is reactivated on its own token with source 'registration', the answers merged as
-- reactivationPatch does; otherwise a row is inserted on p_token. Consent is stamped only if not
-- already given (recordConsent); terms move when given (recordTermsAgreed). Caller holds the lock.
create or replace function public.registration_admit(
  p_event_id uuid, p_org_id uuid, p_name text, p_email text, p_extra jsonb, p_token text,
  p_consented_at timestamptz, p_consent_notice text, p_terms_at timestamptz
)
returns uuid
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id uuid;
begin
  update public.attendees a set
    name = p_name,
    extra = a.extra || coalesce(p_extra, '{}'::jsonb),
    cancelled_at = null,
    -- D614: a cancelled row drops its old reason; an active one keeps it.
    cancel_reason = case when a.cancelled_at is not null then null else a.cancel_reason end,
    source = 'registration',
    consent_notice = case when a.consented_at is null then p_consent_notice else a.consent_notice end,
    consented_at = coalesce(a.consented_at, p_consented_at),
    terms_agreed_at = coalesce(p_terms_at, a.terms_agreed_at),
    updated_at = now()
  where a.event_id = p_event_id and lower(a.email) = p_email
  returning a.id into v_id;
  if v_id is null then
    insert into public.attendees (org_id, event_id, token, name, email, extra, source, consented_at, consent_notice, terms_agreed_at)
    values (p_org_id, p_event_id, p_token, p_name, p_email, coalesce(p_extra, '{}'::jsonb), 'registration', p_consented_at, p_consent_notice, p_terms_at)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- D692, D693: an open entry whose email already has an ACTIVE attendee (restored or added outside
-- the queue) is not a move: it closes as registered against that attendee, who is left exactly as
-- they are (source, name, answers) and so spends no counted place. Returns that attendee's id if it
-- closed the entry, else null. Caller holds the lock.
create or replace function public.registration_close_if_active(p_entry_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_att uuid;
begin
  select a.id into v_att
    from public.registration_entries r
    join public.attendees a on a.event_id = r.event_id and lower(a.email) = r.email and a.cancelled_at is null
    where r.id = p_entry_id;
  if v_att is null then return null; end if;
  update public.registration_entries r
    set state = 'registered', attendee_id = v_att, decided_at = now(), updated_at = now()
    where r.id = p_entry_id;
  return v_att;
end;
$$;

-- D682, D699: an entry becomes a registered attendee with its own token, answers and consent, and
-- the entry closes as registered. Caller holds the lock and has checked the entry's state. The one
-- admission point: if the person is already active it only closes the entry (above) and returns
-- null, which every caller treats as "nobody moved" (no row, no message).
create or replace function public.registration_admit_entry(p_entry_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  r public.registration_entries%rowtype;
  v_att uuid;
begin
  if public.registration_close_if_active(p_entry_id) is not null then return null; end if;
  select x.* into r from public.registration_entries x where x.id = p_entry_id;
  v_att := public.registration_admit(r.event_id, r.org_id, r.name, r.email, r.extra, r.token,
    coalesce(r.consented_at, now()), r.consent_notice, r.terms_agreed_at);
  update public.registration_entries x
    set state = 'registered', attendee_id = v_att, decided_at = now(), updated_at = now()
    where x.id = p_entry_id;
  return v_att;
end;
$$;

-- D678, D679, D691, D692, D695, D697, D702: the registration form's one write.
--   updated    - an active attendee (any source) submitted: updated as today, never queued (D692).
--   waiting    - full (D691), or a re-submit of a waiting entry, which keeps its joined_at (D679).
--   pending    - a place was free and approval is on (D697), or a re-submit of a pending entry.
--   registered - a place was free and approval is off: a new attendee on p_new_token, or the
--                cancelled row reactivated on its own token (D692).
-- A declined/left/removed/registered entry starts over on the same row and token with a new
-- joined_at (D702). Token: the cancelled attendee's, else the entry's, else p_new_token (D695).
-- p_extra arrives with blank answers already dropped.
create or replace function public.register_or_queue(
  p_event_id uuid, p_name text, p_email text, p_extra jsonb, p_new_token text, p_consent_notice text, p_terms boolean
)
-- "position" is quoted only because it is a keyword; the column still comes back as `position`.
returns table(outcome text, token text, attendee_id uuid, entry_id uuid, "position" int)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_event public.events%rowtype;
  v_email text := lower(btrim(p_email));
  v_extra jsonb := coalesce(p_extra, '{}'::jsonb);
  v_att public.attendees%rowtype;
  v_entry public.registration_entries%rowtype;
  v_places record;
  v_now timestamptz;
  v_terms_at timestamptz;
  v_token text;
  v_state text;
  v_att_id uuid;
  v_entry_id uuid;
begin
  select e.* into v_event from public.events e where e.id = p_event_id for no key update;
  if not found then
    raise exception 'register_or_queue: no event %', p_event_id using errcode = 'P0002';
  end if;
  v_now := clock_timestamp();
  v_terms_at := case when p_terms then v_now end;

  select a.* into v_att from public.attendees a where a.event_id = p_event_id and lower(a.email) = v_email;

  -- D692: an active attendee is updated as today (name, answers merged, consent kept, terms re-stamped).
  if v_att.id is not null and v_att.cancelled_at is null then
    update public.attendees a set
      name = p_name,
      extra = a.extra || v_extra,
      consent_notice = case when a.consented_at is null then p_consent_notice else a.consent_notice end,
      consented_at = coalesce(a.consented_at, v_now),
      terms_agreed_at = coalesce(v_terms_at, a.terms_agreed_at),
      updated_at = v_now
    where a.id = v_att.id;
    -- D693: an open entry left over for someone already active closes against them.
    update public.registration_entries r
      set state = 'registered', attendee_id = v_att.id, decided_at = v_now, updated_at = v_now
      where r.event_id = p_event_id and lower(r.email) = v_email and r.state in ('waiting', 'pending');
    return query select 'updated'::text, v_att.token, v_att.id, null::uuid, null::int;
    return;
  end if;

  select r.* into v_entry from public.registration_entries r
    where r.event_id = p_event_id and lower(r.email) = v_email for update;

  -- D679: a re-submit while waiting or pending updates the answers and keeps the place.
  if v_entry.id is not null and v_entry.state in ('waiting', 'pending') then
    update public.registration_entries r set
      name = p_name,
      extra = r.extra || v_extra,
      consent_notice = case when r.consented_at is null then p_consent_notice else r.consent_notice end,
      consented_at = coalesce(r.consented_at, v_now),
      terms_agreed_at = coalesce(v_terms_at, r.terms_agreed_at),
      updated_at = v_now
    where r.id = v_entry.id;
    return query select v_entry.state, v_entry.token, null::uuid, v_entry.id,
      public.registration_entry_position(v_entry.id);
    return;
  end if;

  -- D695: a returning person keeps their link.
  v_token := coalesce(v_att.token, v_entry.token, p_new_token);
  if v_token is null then
    raise exception 'register_or_queue: p_new_token is required' using errcode = '22004';
  end if;
  -- Tokens are unique across attendees and entries; a fresh one that is not is the caller's to retry.
  if v_att.id is null and v_entry.id is null and (
    exists (select 1 from public.attendees a where a.token = v_token)
    or exists (select 1 from public.registration_entries r where r.token = v_token)
  ) then
    raise exception 'register_or_queue: token already in use' using errcode = '23505';
  end if;

  -- D691, D697: full -> waiting; else approval on -> pending; else registered.
  select * into v_places from public.registration_places(p_event_id);
  if v_places.full_ then
    v_state := 'waiting';
  elsif v_event.registration_needs_approval then
    v_state := 'pending';
  else
    v_state := 'registered';
  end if;

  if v_state = 'registered' then
    v_att_id := public.registration_admit(p_event_id, v_event.org_id, p_name, v_email, v_extra, v_token,
      v_now, p_consent_notice, v_terms_at);
    -- A returning person's old entry (declined, left, ...) closes as registered.
    if v_entry.id is not null then
      update public.registration_entries r set
        state = 'registered', token = v_token, name = p_name, extra = r.extra || v_extra,
        attendee_id = v_att_id, decided_at = v_now, updated_at = v_now
      where r.id = v_entry.id;
    end if;
    return query select 'registered'::text, v_token, v_att_id, v_entry.id, null::int;
    return;
  end if;

  if v_entry.id is not null then
    -- D702: starting over on the same row and token, at the back of the queue.
    update public.registration_entries r set
      state = v_state, token = v_token, name = p_name, extra = r.extra || v_extra,
      consent_notice = case when r.consented_at is null then p_consent_notice else r.consent_notice end,
      consented_at = coalesce(r.consented_at, v_now),
      terms_agreed_at = coalesce(v_terms_at, r.terms_agreed_at),
      joined_at = v_now, decided_at = null, attendee_id = null, updated_at = v_now
    where r.id = v_entry.id
    returning r.id into v_entry_id;
  else
    insert into public.registration_entries
      (org_id, event_id, token, name, email, extra, consented_at, consent_notice, terms_agreed_at, state, joined_at)
    values
      (v_event.org_id, p_event_id, v_token, p_name, v_email, v_extra, v_now, p_consent_notice, v_terms_at, v_state, v_now)
    returning id into v_entry_id;
  end if;
  return query select v_state, v_token, null::uuid, v_entry_id,
    case when v_state = 'waiting' then public.registration_entry_position(v_entry_id) end;
end;
$$;

-- D682, D683, D691, D700, D701: while registration is open and places are free, the earliest
-- waiting entry moves - to pending with approval on, else registered. With no limit, everyone
-- waiting moves (clearing the limit). Returns one row per entry moved, in queue order. A waiting
-- person who is already an active attendee is not a move: their entry closes and the loop goes on
-- to the next in line (registration_close_if_active).
create or replace function public.fill_free_places(p_event_id uuid)
returns table(entry_id uuid, attendee_id uuid, new_state text)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_event public.events%rowtype;
  v_places record;
  v_entry uuid;
  v_att uuid;
begin
  select e.* into v_event from public.events e where e.id = p_event_id for no key update;
  if not found then return; end if;
  loop
    select * into v_places from public.registration_places(p_event_id);
    exit when not v_places.open_;
    exit when v_places.lim is not null and v_places.taken >= v_places.lim;
    v_entry := null;
    select r.id into v_entry from public.registration_entries r
      where r.event_id = p_event_id and r.state = 'waiting'
      order by r.joined_at, r.id limit 1 for update;
    exit when v_entry is null;
    continue when public.registration_close_if_active(v_entry) is not null;
    if v_event.registration_needs_approval then
      update public.registration_entries r set state = 'pending', updated_at = now() where r.id = v_entry;
      return query select v_entry, null::uuid, 'pending'::text;
    else
      v_att := public.registration_admit_entry(v_entry);
      if v_att is not null then
        return query select v_entry, v_att, 'registered'::text;
      end if;
    end if;
  end loop;
end;
$$;

-- D685, D694, D701: the organiser's Move in, from waiting only. Ignores the limit and the open
-- test. Pending with approval on, else registered. One row, or none if the entry is not waiting
-- or the person is already an active attendee (their entry then just closes).
create or replace function public.move_in_entry(p_entry_id uuid)
returns table(entry_id uuid, attendee_id uuid, new_state text)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_event_id uuid;
  v_needs boolean;
  v_state text;
  v_att uuid;
begin
  select r.event_id into v_event_id from public.registration_entries r where r.id = p_entry_id;
  if v_event_id is null then return; end if;
  select e.registration_needs_approval into v_needs from public.events e where e.id = v_event_id for no key update;
  select r.state into v_state from public.registration_entries r where r.id = p_entry_id for update;
  if v_state is distinct from 'waiting' then return; end if;
  if public.registration_close_if_active(p_entry_id) is not null then return; end if;
  if v_needs then
    update public.registration_entries r set state = 'pending', updated_at = now() where r.id = p_entry_id;
    return query select p_entry_id, null::uuid, 'pending'::text;
  else
    v_att := public.registration_admit_entry(p_entry_id);
    if v_att is not null then
      return query select p_entry_id, v_att, 'registered'::text;
    end if;
  end if;
end;
$$;

-- D699: Approve, pending -> registered (source 'registration', same token). Works when closed.
-- One row, or none if the entry is not pending or the person is already an active attendee (their
-- entry then just closes, and nobody is messaged).
create or replace function public.approve_entry(p_entry_id uuid)
returns table(attendee_id uuid)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_event_id uuid;
  v_state text;
  v_att uuid;
begin
  select r.event_id into v_event_id from public.registration_entries r where r.id = p_entry_id;
  if v_event_id is null then return; end if;
  perform 1 from public.events e where e.id = v_event_id for no key update;
  select r.state into v_state from public.registration_entries r where r.id = p_entry_id for update;
  if v_state is distinct from 'pending' then return; end if;
  v_att := public.registration_admit_entry(p_entry_id);
  if v_att is not null then
    return query select v_att;
  end if;
end;
$$;

-- D700: Decline, pending -> declined. The place frees, so the fill runs (pending with approval on,
-- D701); returns the fill's rows. Nothing happens, and nothing is returned, if not pending.
create or replace function public.decline_entry(p_entry_id uuid)
returns table(entry_id uuid, attendee_id uuid, new_state text)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_event_id uuid;
  v_state text;
begin
  select r.event_id into v_event_id from public.registration_entries r where r.id = p_entry_id;
  if v_event_id is null then return; end if;
  perform 1 from public.events e where e.id = v_event_id for no key update;
  select r.state into v_state from public.registration_entries r where r.id = p_entry_id for update;
  if v_state is distinct from 'pending' then return; end if;
  update public.registration_entries r set state = 'declined', decided_at = now(), updated_at = now() where r.id = p_entry_id;
  return query select * from public.fill_free_places(v_event_id);
end;
$$;

-- D681, D697: the person leaves from their own link, waiting or pending -> left. Leaving while
-- pending frees a place, so the fill runs and its rows are returned; a waiting person held none.
create or replace function public.leave_entry(p_event_id uuid, p_token text)
returns table(entry_id uuid, attendee_id uuid, new_state text)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_entry_id uuid;
  v_state text;
begin
  perform 1 from public.events e where e.id = p_event_id for no key update;
  if not found then return; end if;
  select r.id, r.state into v_entry_id, v_state from public.registration_entries r
    where r.event_id = p_event_id and r.token = p_token for update;
  if v_state is null or v_state not in ('waiting', 'pending') then return; end if;
  update public.registration_entries r set state = 'left', decided_at = now(), updated_at = now() where r.id = v_entry_id;
  if v_state = 'pending' then
    return query select * from public.fill_free_places(p_event_id);
  end if;
end;
$$;

-- D685: the organiser's Remove, waiting -> removed. No fill: a waiting person held no place.
-- True if it removed the entry.
create or replace function public.remove_entry(p_entry_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_event_id uuid;
  v_done boolean;
begin
  select r.event_id into v_event_id from public.registration_entries r where r.id = p_entry_id;
  if v_event_id is null then return false; end if;
  perform 1 from public.events e where e.id = v_event_id for no key update;
  update public.registration_entries r set state = 'removed', decided_at = now(), updated_at = now()
    where r.id = p_entry_id and r.state = 'waiting';
  v_done := found;
  return v_done;
end;
$$;

-- D693: an organiser added (or imported) someone who is waiting or pending: their entry closes as
-- registered, linked to that attendee. Returns the entry's token, or null if none was open.
create or replace function public.close_entry_for_attendee(p_event_id uuid, p_email text, p_attendee_id uuid)
returns text
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_token text;
begin
  perform 1 from public.events e where e.id = p_event_id for no key update;
  update public.registration_entries r
    set state = 'registered', attendee_id = p_attendee_id, decided_at = now(), updated_at = now()
    where r.event_id = p_event_id and lower(r.email) = lower(btrim(p_email)) and r.state in ('waiting', 'pending')
    returning r.token into v_token;
  return v_token;
end;
$$;

-- Only the service role runs these; nothing in the browser should (as 0086, 0097).
revoke execute on function public.registration_places(uuid) from public, anon, authenticated;
grant execute on function public.registration_places(uuid) to service_role;
revoke execute on function public.registration_entry_position(uuid) from public, anon, authenticated;
grant execute on function public.registration_entry_position(uuid) to service_role;
revoke execute on function public.registration_admit(uuid, uuid, text, text, jsonb, text, timestamptz, text, timestamptz) from public, anon, authenticated;
grant execute on function public.registration_admit(uuid, uuid, text, text, jsonb, text, timestamptz, text, timestamptz) to service_role;
revoke execute on function public.registration_close_if_active(uuid) from public, anon, authenticated;
grant execute on function public.registration_close_if_active(uuid) to service_role;
revoke execute on function public.registration_admit_entry(uuid) from public, anon, authenticated;
grant execute on function public.registration_admit_entry(uuid) to service_role;
revoke execute on function public.register_or_queue(uuid, text, text, jsonb, text, text, boolean) from public, anon, authenticated;
grant execute on function public.register_or_queue(uuid, text, text, jsonb, text, text, boolean) to service_role;
revoke execute on function public.fill_free_places(uuid) from public, anon, authenticated;
grant execute on function public.fill_free_places(uuid) to service_role;
revoke execute on function public.move_in_entry(uuid) from public, anon, authenticated;
grant execute on function public.move_in_entry(uuid) to service_role;
revoke execute on function public.approve_entry(uuid) from public, anon, authenticated;
grant execute on function public.approve_entry(uuid) to service_role;
revoke execute on function public.decline_entry(uuid) from public, anon, authenticated;
grant execute on function public.decline_entry(uuid) to service_role;
revoke execute on function public.leave_entry(uuid, text) from public, anon, authenticated;
grant execute on function public.leave_entry(uuid, text) to service_role;
revoke execute on function public.remove_entry(uuid) from public, anon, authenticated;
grant execute on function public.remove_entry(uuid) to service_role;
revoke execute on function public.close_entry_for_attendee(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.close_entry_for_attendee(uuid, text, uuid) to service_role;
