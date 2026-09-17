# Orange Lobby runbook

## Deploy (one-time setup)

1. Import the GitHub repo into Vercel. Framework preset Next.js.
2. Environment variables (Production + Preview): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL` (set to the Vercel URL first; change to `https://events.ecopiaevents.com` once DNS is live, then redeploy).
3. Add domain `events.ecopiaevents.com` in Vercel → Domains; give the DNS owner the CNAME target Vercel shows.
4. In Supabase → Authentication → URL Configuration, set Site URL to the app URL.

## New event

1. Admin → New event. Set slug (goes in every link; cannot change after badges print).
2. Settings: dates, venue, banner URL, colour, registration questions JSON, open registration.
   For the KOM, paste the contents of `docs/kom-registration-questions.json` into the questions box.
   A question may carry a `description` shown under its label.
3. Modules: choose which tiles appear on the portal home (Agenda, My seat, Floor plan, Info,
   Announcements) and add up to four link tiles, for example a Slido Q&A or a feedback form.
   Tiles that need content (floor plan URL, info page text) stay hidden until it exists.
4. Checkpoints: add "Day 1", "Day 2".
5. Agenda, announcements, info page.
6. Status → live when ready. Draft links show "Coming soon".

## Registration

Share `<app>/e/<slug>/register`. Watch the count in Attendees. Close via Settings.

## Badges

Overview → "QR codes (ZIP)" + "Links (Excel)" → send to printer. Regenerate a link only before printing.

## Onsite

Crew: sign in on phone → Admin → event → Scanner → pick checkpoint. Allow camera.
Green = checked in. Amber = duplicate (allowed). Red = not recognised → search by name → tap.
Walk-in: "Add walk-in" at bottom of scanner.

## After

Overview → Attendance (Excel). Status → archived. Purge personal data when the client no longer needs it.

## If the scanner cannot open the camera

iOS needs Safari (not in-app browsers). The page must be HTTPS. Reload and allow camera.

## Apply the database schema (one-time)

1. Create the Supabase project `orange-lobby` in region `ap-southeast-1`.
2. Run `supabase/migrations/0001_init.sql` in the SQL editor.
3. Run `supabase/seed_org.sql`.
4. Create the first admin user under Authentication → Users with "Auto confirm" on.
5. Run the commented `insert into org_members` line from `seed_org.sql` with that user's UUID.
6. Put the project URL, anon key and service-role key into `.env.local` (locally) and Vercel environment variables.

## Breakout rooms: apply migration manually

Migration `0007_breakouts.sql` adds columns `slot` and `code` to `agenda_items` and creates the `breakout_assignments` table. This migration has NOT been applied to production and must be run by a human before deploying code that uses breakout rooms.

An ordinary agenda item — one that leaves `slot` and `code` blank — inserts successfully whether or not this migration has run yet: the insert names those two columns only when there is a value to store in them, so a schema without them is never asked to accept them. That is what lets this deploy land before or after the migration with no effect on any event that has nothing to do with breakout rooms. Actually creating a breakout round (giving an agenda item a `slot` or `code`), or anything that touches `breakout_assignments`, still needs the migration applied first — that part has not changed. When you are ready to deploy breakout-room functionality, run this SQL in the production Supabase SQL editor:

```sql
-- Breakout rooms: which attendee goes to which room, in which round.
--
-- A breakout is an ordinary agenda item (D76) — it already has a day, a time, a room and a
-- title. `slot` names the round ("Breakout 1") and groups the items that are alternatives to
-- one another; `code` is this room's value ("3A"), and is what the client's spreadsheet
-- column holds. An item with a null slot is an ordinary agenda item and behaves as before.
alter table agenda_items add column slot text;
alter table agenda_items add column code text;

-- Assignment is a real relation rather than a match against the imported spreadsheet value,
-- so a typo in the client's sheet ("3a ", "Room 3B") cannot read as "unassigned" with
-- nothing to catch it (D79).
--
-- `slot` is denormalised onto this row for one reason: `unique (attendee_id, slot)` is what
-- stops one person holding two rooms in the same round, and a unique index cannot reach
-- through agenda_item_id to the slot on the item (D80). Renaming an item's slot must update
-- its assignment rows.
create table breakout_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  agenda_item_id uuid not null references agenda_items(id) on delete cascade,
  attendee_id uuid not null references attendees(id) on delete cascade,
  slot text not null,
  created_at timestamptz not null default now(),
  unique (attendee_id, slot)
);

create index breakout_assignments_item_idx on breakout_assignments (agenda_item_id);
create index breakout_assignments_event_idx on breakout_assignments (event_id);
```

Verify the migration worked:

```sql
select count(*) from information_schema.columns
where table_name = 'agenda_items' and column_name in ('slot','code');
-- expect 2
select count(*) from breakout_assignments;
-- expect 0
```

## Event images: create the storage bucket

The logo, banner and floor plan are uploaded files rather than pasted links. They live in a
Supabase Storage bucket called `event-media`, which `supabase/migrations/0013_event_media.sql`
creates. **Run it before deploying the code that uses uploads** — without the bucket every
upload fails with "Could not upload that image", though nothing else on the event breaks and
any link pasted before this change keeps rendering.

Run this in the production Supabase SQL editor (it is safe to re-run):

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-media', 'event-media', true, 4194304,
        array['image/png','image/jpeg','image/jpg','image/webp','image/svg+xml'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
```

Verify:

```sql
select id, public, file_size_limit from storage.buckets where id = 'event-media';
-- expect one row, public = true, file_size_limit = 4194304
```

The bucket is public to read because the portal is open to anyone holding the link. Nothing
can write to it from the browser: uploads go through the Server Action under the service role.
To replace an image, upload a new one — the old object is deleted on save, and "Remove on save"
clears the image entirely.

## Attendee fields: expand (migration 0014)

`0014_fields_expand.sql` turns company, phone and table_no from columns on `attendees` into
ordinary event fields: each event gets real field definitions for whatever it already
collects, every attendee's values move into `extra`, and the scan card is seeded with the two
lines it used to print by name. Additive — the columns and `collected_fields` stay — so it may
be applied after the deploy and the deploy may be rolled back without stranding any data.

**Release gate — read this before running the migration, not after.** The code that reads
`extra` first and falls back to the column is already committed, and it gates Company, Mobile
and Table on whether the event has a field of that key. Deploy that code before applying this
migration, never the other way round, and never leave the gap between the two open longer than
it takes to run the SQL. Nothing is deployed yet as of this writing (main is ahead of origin,
unpushed), so there is no live exposure today — but the day this deploys, this ordering stops
being advice and becomes a release gate: get it backwards, or leave it open too long, and an
event's data is intact but invisible until the migration runs.

> Deploy the code first, then apply this migration. The deployed code reads `extra` and
> falls back to the old column, so it is correct either side of the migration — but between
> the deploy and the migration an event has no field definitions, so Company, Mobile and
> Table are missing from the attendee table and the scan card. Keep that window to minutes,
> and never open it during a live event.

Run this in the production Supabase SQL editor:

```sql
-- 1. Field definitions. company and phone become registration questions, because that is
--    what the public form asked for them until now; table_no becomes an attendee column,
--    because it is assigned after seating and imported, never asked at sign-up.
update events set registration_questions = registration_questions ||
  jsonb_build_object('key','company','label','Company','type','text','required',false)
where 'company' = any(collected_fields)
  and not registration_questions @> '[{"key":"company"}]'::jsonb
  and not attendee_fields        @> '[{"key":"company"}]'::jsonb;

update events set registration_questions = registration_questions ||
  jsonb_build_object('key','phone','label','Mobile','type','phone','required',false)
where 'phone' = any(collected_fields)
  and not registration_questions @> '[{"key":"phone"}]'::jsonb
  and not attendee_fields        @> '[{"key":"phone"}]'::jsonb;

update events set attendee_fields = attendee_fields ||
  jsonb_build_object('key','table_no','label','Table','type','text')
where 'table_no' = any(collected_fields)
  and not registration_questions @> '[{"key":"table_no"}]'::jsonb
  and not attendee_fields        @> '[{"key":"table_no"}]'::jsonb;

-- 2. The values. `|| extra` last means an existing extra key always wins over the column.
update attendees set extra = jsonb_strip_nulls(jsonb_build_object(
    'company', company, 'phone', phone, 'table_no', table_no)) || extra
where company is not null or phone is not null or table_no is not null;

-- 3. The scan card showed Company, Category and Table by name. Category still shows; the
--    other two are fields now, so seed them as this event's chosen scan fields — otherwise
--    crew lose two lines they have been reading all along.
update events set scan_extra_fields = (
  select array_agg(k) from (
    select unnest(array['company','table_no']) as k
  ) legacy where k = any(collected_fields)
) || scan_extra_fields
where scan_extra_fields = '{}' and collected_fields && array['company','table_no'];
```

Verify — the first three must all return 0:

```sql
select count(*) from attendees where company  is not null and not extra ? 'company';
select count(*) from attendees where phone    is not null and not extra ? 'phone';
select count(*) from attendees where table_no is not null and not extra ? 'table_no';
```

and this must return one row per event that collects anything:

```sql
select slug, registration_questions, attendee_fields, scan_extra_fields from events;
```
