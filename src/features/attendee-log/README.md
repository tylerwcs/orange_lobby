# Attendee change log

A record of every staff change to an event's attendees: who made it (an admin or a committee
member), when, what changed, and a detail to open (field-level before/after, deleted records as
they were, bulk lists). Design: `docs/superpowers/specs/2026-10-28-attendee-change-log-design.md`
(D742, D744). Table `attendee_changes`, migration `0112`. Database proof: `npm run check:log`.

The table is service-role only (RLS on, no policies). Each row keeps the actor's name and email
as they were, so it still reads right after a committee member is removed.

## PDPA erasure (by hand, D744)

No screen erases a person from the log, and deleting an attendee in the app does not remove them
from it: a delete keeps their full snapshot by design. When someone asks to be erased, run this in
the Supabase SQL editor.

One person often has several attendee ids in the log (a bad import deleted and loaded again, a
second registration after a delete), so erase every id, not just the current one.

1. Find every attendee id the person has had. Search by email; for people with no email, by name:

```sql
-- by email
select distinct p ->> 'attendeeId' as attendee_id
from attendee_changes c, jsonb_array_elements(c.detail -> 'people') p
where lower(p ->> 'email') = lower('<email>');

-- by name (people with no email; check the names are really them)
select distinct p ->> 'attendeeId' as attendee_id, p ->> 'name' as name
from attendee_changes c, jsonb_array_elements(c.detail -> 'people') p
where lower(p ->> 'name') = lower('<name>');
```

2. Run the erase once for each id the lookup returned:

```sql
select public.erase_from_attendee_changes('<attendee id>');
```

It deletes every row that is only about that person, and from rows about several people it takes
them out of `attendee_ids` and `detail.people` and rebuilds `search` from what remains. It returns
the number of rows deleted or rewritten. Only the service role can run it.

3. Run the lookup from step 1 again. It must return 0 rows.

Erasure only cleans `detail.people` and `search`. Anything that writes a log row must therefore
keep people's names out of the `summary` of a change that touches several people (counts such as
"6 people" are fine); a name in a multi-person summary would survive the erase.
