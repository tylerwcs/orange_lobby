# Attendee change log

A record of every staff change to an event's attendees: who made it (an admin or a committee
member), when, what changed, and a detail to open (field-level before/after, deleted records as
they were, bulk lists). Design: `docs/superpowers/specs/2026-10-28-attendee-change-log-design.md`
(D741, D742). Table `attendee_changes`, migration `0112`. Database proof: `npm run check:log`.

The table is service-role only (RLS on, no policies). Each row keeps the actor's name and email
as they were, so it still reads right after a committee member is removed.

## PDPA erasure (by hand, D744)

No screen erases a person from the log. When someone asks to be erased, run this in the Supabase
SQL editor:

```sql
select public.erase_from_attendee_changes('<attendee id>');
```

It deletes every row that is only about that person, and from rows about several people it takes
them out of `attendee_ids` and `detail.people` and rebuilds `search` from what remains. It returns
the number of rows deleted or rewritten. Only the service role can run it.

If the attendee row is already gone, find the id from their email first. Every person in a
detail carries their `attendeeId`, name and email under `detail.people`:

```sql
select id, at, summary, detail -> 'people' from attendee_changes where search ilike '%<email>%';
```

Take `attendeeId` from the matching person in `detail.people`, then run the erase above.
