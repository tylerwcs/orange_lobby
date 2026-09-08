# Dry-run verification (23 Sep 2026)

Everything on this page can only be confirmed against a live Supabase project or a real
phone. The unit suite (55 tests) covers pure logic only; no server action, repository
function, or page has ever run against Postgres. Treat this list as the test plan: each
item is pass-or-block for badge printing on 24 Sep.

## Before the dry run

1. Apply the schema and seed the org and first admin (see `runbook.md`, "Apply the
   database schema").
2. Set `NEXT_PUBLIC_APP_URL` on Vercel to the final domain. The app now refuses to start
   exports in production without it, and the admin overview shows the resolved value
   under "Exports". Re-check after the DNS cutover and redeploy.

## Already verified against the live database (8 Sep 2026, local dev server)

- Registration submits, stores answers in `extra`, lowercases the email, and shows the
  personal link and QR.
- Re-registering with the same email (different case) returns the same link, updates the
  name and answers, and keeps the phone and department when those boxes are left blank.
- Personal portal: greeting, agenda with correct local date, seat fallback, empty
  announcements, info page. Generic portal hides "My seat". An invalid token shows the
  branded "This link isn't valid" page.

## Redesign (Direction 2), verified 8 Sep 2026 on the local dev server

- Portal home renders the attendee card, the pinned announcement banner and the module
  tiles configured for the event; generic home hides the attendee card and seat tile.
- Agenda day tabs switch by `?day=`; Me page shows the attendee's own QR; invalid
  links show the branded page.
- Admin, modules editor and scanner were reviewed in code but not opened in a browser
  (login required); walk them in the dry run.

## Must verify

1. **Print one badge before printing 100.** Open `<slug>-links.xlsx`, confirm the URL sits
   under the `Link` header (column G), scan the printed QR with a phone, and confirm it
   opens that attendee's portal on the final domain.
2. **Import the real 200-row file and time it.** Confirm no serverless timeout, report
   counts match the file, `Table`/`Seat` map from the real headers (a header like
   "Table No" becomes an extra column, not the table), and phone numbers keep leading
   zeros (Excel numeric cells lose them).
3. **Re-import the same file with one changed name.** Expect "updated" for every row and
   no duplicates.
4. **Registration on three phones**, including one that re-registers with the same email
   and a different phone. Same link both times; imported company must survive.
5. **Crew scanner on iOS Safari and Android Chrome over HTTPS.** Also open a personal
   link forwarded through WhatsApp or Teams and confirm the in-app browser can at least
   show the portal (the camera will not work there; the runbook says to use Safari).
6. **Name search with a comma** ("Tan, Ah Kow") and with an apostrophe. Both must return
   results, not an error. Known gap: a stored name containing a comma will not match a
   comma in the query.
7. **Walk-in using an email already in the masterlist**, then one with no email. Both
   must check in without an error card.
8. **Two crew phones scan the same badge.** Second shows amber "already checked in" with
   the earlier time. Counters on both phones are optimistic and only re-sync on reload.
9. **Post an announcement during the window and read the timestamp on a phone.** It must
   show Malaysia time and appear within seconds of posting.
10. **Open a personal link with one character changed.** Expect the branded "This link
    isn't valid" page, not a bare 404.
11. **Regenerate a token after a badge is printed** and confirm the old QR fails.
12. **Every page in dark mode** on a phone, especially `/scan` and `/login`.
13. **Portal load on a mid-range Android over 4G.** Target under 2 seconds.
14. **Archive, purge, then open the attendance export.** Counts survive, names read
    "Purged".
15. **Set a registration close time**, save, reload settings, confirm the same local time
    shows, and confirm the form actually closes at that Malaysia time.

## Known limitations parked until after the pilot

- Re-import correctness relies on a 2,000-row attendee lookup; events above 2,000
  attendees need an uncapped lookup first.
- A walk-in matched to an existing attendee shows a blank company on the scan card if
  crew left the box empty (database is unaffected).
- Search strips `%` but not `*`; typing `*` alone lists everyone.
- No offline scan queue: scans need a network connection.
- Sequential per-row updates on re-import and purge; fine at pilot scale.
- Duplicate event slug returns a raw error instead of a friendly message.
- Attendee lists are capped at 2,000 rows in exports.
