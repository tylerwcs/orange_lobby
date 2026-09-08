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
3. Checkpoints: add "Day 1", "Day 2".
4. Agenda, announcements, info page.
5. Status → live when ready. Draft links show "Coming soon".

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
