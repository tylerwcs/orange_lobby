-- Mileage x Active (spec 2026-10-25-mileage-x-active-tracks-design.md, D726, the user's call on
-- 25 Oct): switching someone's track removes the entries they logged today on the track they leave.
-- Replaces set_challenge_track only; same signature. The app removes those entries' photos.

create or replace function public.set_challenge_track(p_pair_id uuid, p_attendee_id uuid, p_activity_id uuid, p_actor_id uuid, p_admin boolean)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_pair public.challenge_track_pairs%rowtype;
  v_a public.activities%rowtype;
  v_b public.activities%rowtype;
  v_att public.attendees%rowtype;
  v_actor public.attendees%rowtype;
  v_old uuid;
begin
  select p.* into v_pair from public.challenge_track_pairs p where p.id = p_pair_id for update;
  if not found then return 'missing'; end if;
  if p_activity_id is not null and p_activity_id not in (v_pair.a_activity_id, v_pair.b_activity_id) then return 'missing'; end if;
  select a.* into v_a from public.activities a where a.id = v_pair.a_activity_id;
  select a.* into v_b from public.activities a where a.id = v_pair.b_activity_id;

  select x.* into v_att from public.attendees x where x.id = p_attendee_id;
  if not found or v_att.event_id <> v_pair.event_id or v_att.cancelled_at is not null or v_att.group_id is null then
    return 'not_member';
  end if;

  if not p_admin then
    if not (v_a.is_open or v_b.is_open) then return 'closed'; end if;
    select x.* into v_actor from public.attendees x where x.id = p_actor_id;
    if not found or v_actor.event_id <> v_pair.event_id or v_actor.cancelled_at is not null
       or v_actor.group_id is distinct from v_att.group_id then
      return 'not_member';
    end if;
    if not exists (
      select 1 from unnest(v_a.proxy_fields || v_b.proxy_fields) as f(k)
       where lower(btrim(coalesce(v_actor.extra->>f.k, ''))) in ('yes', 'y', 'true')
    ) then
      return 'not_allowed';
    end if;
  end if;

  -- D726: leaving a track - for the other one, or for none - removes what the person logged on it
  -- today (Malaysian date), so nobody scores on both tracks in one day. Earlier days stay.
  select m.activity_id into v_old from public.challenge_track_members m
   where m.pair_id = p_pair_id and m.attendee_id = p_attendee_id and m.group_id = v_att.group_id;
  if v_old is not null and v_old is distinct from p_activity_id then
    delete from public.activity_submissions s
     where s.activity_id = v_old and s.attendee_id = p_attendee_id
       and s.submitted_on = (now() at time zone 'Asia/Kuala_Lumpur')::date;
  end if;

  if p_activity_id is null then
    delete from public.challenge_track_members m where m.pair_id = p_pair_id and m.attendee_id = p_attendee_id;
  else
    insert into public.challenge_track_members (pair_id, attendee_id, group_id, activity_id, assigned_by)
    values (p_pair_id, p_attendee_id, v_att.group_id, p_activity_id, case when p_admin then null else p_actor_id end)
    on conflict (pair_id, attendee_id) do update
      set group_id = excluded.group_id, activity_id = excluded.activity_id, assigned_by = excluded.assigned_by, assigned_at = now();
  end if;
  return 'ok';
end;
$$;

revoke execute on function public.set_challenge_track(uuid, uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_challenge_track(uuid, uuid, uuid, uuid, boolean) to service_role;
