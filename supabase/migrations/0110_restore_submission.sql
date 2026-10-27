-- Undo revoke (D735, the user's call on 27 Oct): an attendee appealed and was right, often after
-- the entry's day had closed, so they could not send it again. The entry comes back as it was,
-- marked approved (the appeal was the check), with who restored it.

-- An admin's approval names the auth user; a verifier's names the link, as before (D518).
alter table public.activity_submissions
  add column if not exists approved_by uuid references auth.users (id) on delete set null,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid references auth.users (id) on delete set null,
  add column if not exists restored_by_verifier uuid references public.verifier_links (id) on delete set null;

-- Exactly one of p_user_id / p_verifier_id is set. The row and, on a tagged pair, its partner row
-- come back together (D533), or neither does. Each is checked against the limits submit_answers
-- keeps for its own person and day, under the same activity row lock, so a submit racing the
-- restore takes turns with it. Not re-checked: open, the challenge window, categories, the track
-- placement and duplicate photos - the organiser deciding is the point.
create or replace function public.restore_submission(
  p_id uuid,
  p_activity_id uuid,
  p_user_id uuid,
  p_verifier_id uuid
) returns text
language plpgsql
set search_path = ''
as $$
declare
  a public.activities%rowtype;
  r public.activity_submissions%rowtype;
  v_pair_id uuid;
  v_target int;
  used int;
  v_constraint text;
begin
  select x.* into a from public.activities x where x.id = p_activity_id for update;
  if not found or a.kind <> 'submission' then return 'missing'; end if;

  select s.pair_id into v_pair_id from public.activity_submissions s
   where s.id = p_id and s.activity_id = a.id and s.status = 'revoked';
  if not found then return 'missing'; end if;

  select p.target into v_target from public.challenge_track_pairs p where a.id in (p.a_activity_id, p.b_activity_id);

  for r in
    select s.* from public.activity_submissions s
     where s.activity_id = a.id and s.status = 'revoked'
       and (s.id = p_id or (v_pair_id is not null and s.pair_id = v_pair_id))
  loop
    if a.group_mode <> 'off' then
      if a.group_mode = 'entries' and r.group_id is not null then
        select count(*) into used from public.activity_submissions s
         where s.activity_id = a.id and s.group_id = r.group_id and s.status = 'submitted';
        if used >= a.group_target then return 'groupdone'; end if;
      elsif a.group_mode = 'everyone' and exists (
        select 1 from public.activity_submissions s
         where s.activity_id = a.id and s.attendee_id = r.attendee_id
           and s.group_id is not distinct from r.group_id and s.status = 'submitted'
      ) then
        return 'limit';
      end if;
    else
      if a.max_per_attendee is not null then
        select count(*) into used from public.activity_submissions s
         where s.activity_id = a.id and s.attendee_id = r.attendee_id and s.status = 'submitted';
        if used >= a.max_per_attendee then return 'limit'; end if;
      end if;
      if r.per_day and exists (
        select 1 from public.activity_submissions s
         where s.activity_id = a.id and s.attendee_id = r.attendee_id and s.submitted_on = r.submitted_on and s.status = 'submitted'
      ) then
        return 'today';
      end if;
    end if;

    -- D730: a track takes at most `target` people from one team per day.
    if v_target is not null and r.group_id is not null and not exists (
      select 1 from public.activity_submissions s
       where s.activity_id = a.id and s.attendee_id = r.attendee_id and s.submitted_on = r.submitted_on and s.status = 'submitted'
    ) and (
      select count(distinct s.attendee_id) from public.activity_submissions s
       where s.activity_id = a.id and s.group_id = r.group_id and s.submitted_on = r.submitted_on and s.status = 'submitted'
    ) >= v_target then
      return 'trackfull';
    end if;
  end loop;

  -- Every row checked before any is written, so a refusal never leaves half a pair restored. The
  -- two rows of a pair are two people on two teams (D526), so one's checks never count the other.
  update public.activity_submissions s set
    status = 'submitted',
    revoked_at = null, revoked_by = null, revoked_by_verifier = null, revoke_reason = null,
    restored_at = now(), restored_by = p_user_id, restored_by_verifier = p_verifier_id,
    approved_at = now(), approved_by = p_user_id, approved_by_verifier = p_verifier_id
   where s.activity_id = a.id and s.status = 'revoked'
     and (s.id = p_id or (v_pair_id is not null and s.pair_id = v_pair_id));

  return 'ok';
exception
  -- As in submit_answers: only the one-a-day index is an ordinary refusal; anything else is a fault.
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'activity_submissions_one_a_day' then
      return 'today';
    end if;
    raise;
end;
$$;

revoke execute on function public.restore_submission(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.restore_submission(uuid, uuid, uuid, uuid) to service_role;
