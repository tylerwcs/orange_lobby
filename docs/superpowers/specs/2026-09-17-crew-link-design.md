# Crew link — design

Date: 2026-09-17
Status: approved for implementation
Extends `2026-09-07-orange-lobby-pilot.md`. Decisions D104–D112.

## 1. Why

The scanner is behind `requireAdmin`, and there is exactly one role. So putting a second person
on a door today means either handing them the developer's own password, or creating them a
Supabase account that can read the attendee list, run the exports, edit Settings and delete the
event — for a job that is holding a phone at a door for two days.

The request that started this was "create admin accounts without going through Supabase". The
honest answer to it turned out to be a different feature: the accounts were wanted for crew who
only scan, and minting full admins for them is the problem, not the paperwork.

Booths already solved a version of this. `/booth/<token>` is a public route whose only authority
is an unguessable token, precisely because a booth is staffed by someone who must not be given an
admin login. A door is the same shape with a different answer about what the holder may see.

## 2. Decisions

- **D104** Crew get **one shared link per event**, not accounts and not one link each.
  Considered and rejected: a `crew` role on `org_members` (the column already exists) with real
  accounts — it keeps per-person attribution, at the price of an account lifecycle for people who
  work two days a year and must then be removed. Also rejected: a token per crew member, which
  keeps attribution without passwords but multiplies the thing that has to be distributed and
  revoked. The deciding fact is D105.
- **D105** Per-person attribution buys nothing today, so it is not worth designing around. Every
  one of the 149 `checkins` rows in the live database has `scanned_by = null`: the column has
  never recorded anybody. `scanned_by` stays, and a crew scan writes null into it — the same value
  every existing row already carries. If attribution is ever wanted, it arrives with roles, not
  with this.
- **D106** The link **expires by a computed rule, not a stored timestamp**. The rule: it works on
  any date up to and including one day after `ends_on`, falling back to `starts_on` when `ends_on`
  is null, with today taken in Asia/Kuala_Lumpur. One day of grace so a late teardown scan still
  works. A stored expiry
  would be a second date to keep in step with the event's own dates, and it would be wrong the
  first time someone moved the event.
- **D107** An event with **no dates set has a working link**. An undated event is one being set up,
  and a dry run before the dates are filled in is exactly when the link is first tried. Expiry is a
  courtesy against a screenshot that outlives the event, not an access control.
- **D108** **Rotation is the revocation mechanism.** Regenerating `crew_token` from Settings kills
  every copy of the old link at once. This is the answer to a leak mid-event; expiry is not.
- **D109** The crew link carries the **whole scanner** — the identification card with company,
  category, table and the event's chosen extras, the name search, and undo. This is deliberately
  more than the booth scanner gets (D98), and the difference is the job: a door is identifying a
  guest and seating them, and a mis-scan with no undo is a wrong count all day. Crew are Ecopia
  staff; booths are third parties.
- **D110** **One scanner, two doors.** `/crew/<token>` renders the same `Scanner` component as
  `/scan/<eventId>`, and the four server actions authorise as *either* a signed-in admin *or* a
  valid crew token for that event. Considered and rejected: copying `Scanner.tsx` as
  `BoothScanner.tsx` did — safer for the admin scanner, because nothing already working would be
  touched. Rejected because it would be the third copy of one camera lifecycle, and the second
  copy has already shown what that costs: the booth scanner inherited the original's 32px
  clear-search button, so the 44px floor is now missed in two files instead of one, and every
  later fix to scanning has two places to land. A third copy makes it three.
- **D111** `/crew` is **`noindex`**, like `/e` and `/booth`. A route that is both public and an
  authority does not belong in a search index.
- **D112** **No in-app admin account creation.** Creating a full admin stays a Supabase dashboard
  job. It happens perhaps twice a year, it takes two minutes there, and a form that mints
  credentials to every attendee record is the thing that most deserves an unhurried review — not
  one nine days before a freeze.

## 3. Out of scope

- Creating, listing, or removing admin accounts in the app (D112).
- Roles on `org_members`. The column exists and stays unused.
- Per-person attribution of check-ins (D105).
- Any change to `/booth/<token>` or to the booth scanner.
- Walk-in creation. The scanner does not have it today; this does not add it.

## 4. Schema

```sql
alter table events add column crew_token text unique;
```

Nullable: an event has no crew link until an admin mints one. Unique across the table rather than
per event, because it is looked up on its own before any event is known — the same reason
`booths.token` is.

Additive, and no deployed code reads the column.

## 5. Sequencing

Straight off `main`. Touches `src/app/scan/[eventId]/actions.ts` and `Scanner.tsx`, which are the
crew scanner in use today — so the admin path must stay byte-identical in behaviour when no crew
token is present, and that is the first thing to verify.

## 6. Risks

- **The link is shared, so it will be in a group chat.** That is the accepted cost of D104. It
  carries the attendee list with companies and table numbers to anyone who holds it. Mitigated by
  expiry (D106), rotation (D108), and by the link being event-scoped — it is worth nothing after
  the event it belongs to.
- **Threading a second authority through a working surface.** `authorise()` in the scanner's
  actions currently means `requireAdmin`. Widening it is the one change in this design that can
  break something that works today. Every action must fail closed: an absent or wrong crew token
  with no admin session is a refusal, never a fallthrough.
- **A public route that writes**, as with booths. Same rate-limiting caveat: `allow()` is an
  in-memory `Map`, so on Vercel it is per-instance and therefore weak.
- **Expiry is computed from event dates**, so moving an event's dates moves the link's life. That
  is the intent, and it is worth saying aloud because it means an event whose `ends_on` is cleared
  has a link that stops expiring.

## 7. Verification

`npm test`, `npm run lint`, `next build` per task. Unlike the admin pages, **this one is fully
verifiable here**: `/crew/<token>` is public, so the whole flow — a live link, an expired link, a
rotated link, a scan, a duplicate, an undo — can be driven in the browser against the test event.
The admin half is one Settings panel and goes on the user's checklist.
