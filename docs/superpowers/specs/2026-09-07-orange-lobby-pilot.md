# Orange Lobby — Product Spec (v1 and KOM Pilot)

Date: 2026-09-07
Owner: CS Wong (cs.wong@ecopiaevents.com), sole developer
Status: agreed after grilling session; source of truth for the pilot build

## 1. What this is

Orange Lobby is Ecopia Events' in-house replacement for Dreamory's Blue Lobby. It is a
mobile-first web app used onsite at events by three groups:

- **Attendees** open a link (from a QR on their badge) and see event info, their agenda,
  their seat, announcements, and extra content.
- **Organisers** (Ecopia staff) create events, brand them, import or collect attendee
  lists, publish content, export QR codes for badge printing, and export attendance.
- **Crew** (Ecopia staff onsite) scan badges at checkpoints and look attendees up by name.

Long term it becomes an all-in-one platform (registration blasts, badge printing, lead
scanning, lucky draw, etc). This spec covers **v1** and the **pilot slice** of v1.

## 2. Decisions (settled)

| # | Decision | Choice |
|---|----------|--------|
| D1 | v1 scope | Flow A (masterlist to portal) + check-in scanning. Flow B email/WhatsApp blasts deferred. Minimal built-in registration page **is** in the pilot. |
| D2 | Event setup | Self-serve admin, no developer per event. |
| D3 | Tenancy | Ecopia internal only. Every table carries `org_id`. No tenant-switching UI. |
| D4 | Attendee identity | Unguessable token in the URL. No login. Links are bookmarkable. Per-event verification toggle is a later feature. |
| D5 | Delivery | Mobile-first web app. No native apps. |
| D6 | Scale assumptions | 20–50 events/year, 100–2,000 attendees, occasional same-day overlap. |
| D7 | Stack | Next.js (App Router, TypeScript), Tailwind, Supabase (Postgres, Auth, Storage) in `ap-southeast-1`, Vercel. |
| D8 | Data location | Singapore region. Archived events expose a purge action. |
| D9 | Language | English only. Portal copy stored per event, not hardcoded. |
| D10 | Masterlist | Fixed Excel template for the pilot. Column-mapping UI post-pilot. |
| D11 | Generic vs unique | Every event has a generic link (signage, forwards). Every attendee gets a unique token at creation. Unique links go on badges. Events without personalised content may use only the generic link. |
| D12 | Portal modules (v1) | Event info, agenda, my seat + floor plan image, announcements, custom pages. Pilot: one rich-text "info" page, floor plan as image URL. |
| D13 | Personalisation | Attendee has one `category`. Agenda items and pages carry a category filter (`null` = everyone). Seat = `table_no` + optional `seat_no`. |
| D14 | Check-in | Crew phone web scanner + name search. Duplicate scan warns, does not block, counts once. Result shows name, company, category, table + up to 2 event-chosen extra fields. Walk-ins added from the scanner. |
| D15 | Checkpoints | Event has named checkpoints. Pilot: "Day 1", "Day 2". Crew selects one when opening the scanner. |
| D16 | Badge export | ZIP of PNG QRs named by attendee, and Excel with a link column. Badge PDFs and live printing deferred. |
| D17 | Connectivity | Online-first. Offline scan queue deferred (moves into pilot only if venue wifi is known bad). |
| D18 | Admin auth | Supabase email + password, accounts created by an admin, no self sign-up. Microsoft 365 sign-in post-pilot. Pilot has one role (`admin`); organiser/crew split post-pilot. |
| D19 | Domains | One platform domain, event at a slug: `events.ecopiaevents.com/e/<slug>`. Custom domains deferred. Registration may open on a temporary Vercel address. |
| D20 | Live changes | No push notifications. Portal fetches fresh data on every open; announcements module. |
| D21 | Event lifecycle | `draft` (all links show "coming soon"), `live`, `archived` (read-only + purge personal data, keep counts). |
| D22 | Registration (pilot) | Public page at `/e/<slug>/register`. Anyone with the link. Fixed fields name, email, phone, company + custom questions configured per event as JSON (no builder UI). Email is the unique key; resubmitting updates and returns the same link. Confirmation screen shows link + QR, no email sent. Admin toggles open/closed with optional auto-close date. No cap. Auto-approved; `status` column exists. |
| D23 | Attendance export | One Excel per event: all attendee columns + per-checkpoint checked-in yes/no, time, scanned-by. |
| D24 | Attendee profile/bookmarks | Out of v1. |
| D25 | Source control | github.com/tylerwcs/orange_lobby, private. |

## 3. Pilot: Ecopia KOM, 30 September – 1 October 2026

- ~100 attendees, 2 days, Ecopia staff.
- Unique QR on every badge. Generic link for signage.
- Registration via the built-in page, open by **12 Sep**, close **22 Sep**, announced on Teams.
- Content draft by **15 Sep**, final by **22 Sep**.
- Dry run **23 Sep** with a fake list of 200 rows.
- Badges print from **24 Sep** with the final domain.
- Code freeze **26 Sep**, bug fixes only.
- Fallback: printed list alongside.
- Developer time: ~10–15 h/week plus Claude sessions.

### Pilot slice (must ship)

1. Admin login, create event, brand it (name, logo, banner, primary colour), set status.
2. Registration page + confirmation screen; admin sees live count.
3. Masterlist import from fixed template (add/update by email).
4. Attendee list, add/edit, regenerate token.
5. Attendee portal: home (event info), agenda by day filtered by category, my seat with floor plan image, announcements, one rich-text info page.
6. Generic portal (same minus seat and personal greeting).
7. QR export: ZIP of PNGs + Excel with links.
8. Checkpoints (Day 1, Day 2). Crew scanner page with camera scan + name search + walk-in add.
9. Attendance export.

### Explicitly deferred (post-pilot, in order)

Column-mapping import, organiser/crew roles, offline scan queue, re-upload diff preview,
multiple custom pages, floor plan file upload, confirmation email, Microsoft sign-in.
Then Flow B (invite lists, blasts, form builder), badge PDF, table highlight on plan,
lead scanning, lucky draw, Slido embed, custom domains, verification step, i18n, kiosk,
push notifications, attendee profiles/bookmarks.

## 4. Data model

All tables have `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`.
All event-scoped tables carry `org_id uuid` (denormalised) for tenancy.

```
organisations   (id, name, slug unique)
org_members     (org_id, user_id -> auth.users, role text default 'admin', pk(org_id,user_id))

events          (id, org_id, slug unique, name, status text check in ('draft','live','archived'),
                 starts_on date, ends_on date,
                 venue_name, venue_address, venue_map_url, contact_name, contact_phone,
                 description text,
                 logo_url, banner_url, primary_color text default '#F97316', floor_plan_url,
                 info_page_title text default 'Info', info_page_html text,
                 registration_open bool default false, registration_closes_at timestamptz,
                 registration_questions jsonb default '[]',
                 scan_extra_fields text[] default '{}',   -- max 2 keys from attendee columns/extra
                 updated_at)

attendees       (id, org_id, event_id, token text unique, name, email, phone, company,
                 category, table_no, seat_no, extra jsonb default '{}',
                 source text check in ('import','registration','walkin'),
                 status text default 'active',
                 updated_at,
                 unique (event_id, lower(email)) where email is not null)

agenda_items    (id, org_id, event_id, day date, starts_at time, ends_at time,
                 title, description, location, categories text[] null, sort_order int default 0)

announcements   (id, org_id, event_id, title, body, pinned bool default false)

checkpoints     (id, org_id, event_id, name, sort_order int default 0)

checkins        (id, org_id, event_id, checkpoint_id, attendee_id, scanned_by uuid,
                 scanned_at timestamptz default now(),
                 unique (checkpoint_id, attendee_id))
```

`registration_questions` JSON shape:

```json
[
  {"key": "dietary", "label": "Dietary requirements", "type": "select",
   "required": false, "options": ["None", "Vegetarian", "Halal", "Other"]},
  {"key": "tshirt", "label": "T-shirt size", "type": "select", "required": true,
   "options": ["S","M","L","XL"]},
  {"key": "remarks", "label": "Anything else?", "type": "text", "required": false}
]
```

Answers are stored in `attendees.extra` keyed by `key`.

### Security model

- RLS enabled on every table. **No policies for `anon`.** The anon key can read nothing.
- All reads and writes happen in Next.js server code (server components, route handlers,
  server actions) using the service-role key, after the app's own checks:
  - Admin/crew routes: Supabase Auth session must exist and the user must be in `org_members`.
  - Attendee portal: lookup by `(event.slug, attendee.token)`; a miss is a 404.
  - Registration: public write, validated, rate-limited per IP (simple in-memory limiter is
    acceptable for the pilot).
- Tokens: 12 chars from a 32-symbol unambiguous alphabet (`abcdefghjkmnpqrstuvwxyz23456789`),
  generated with `crypto.randomBytes`. Regenerating a token invalidates the old link.

## 5. Routes

Attendee (public, no auth):
- `/e/[slug]` generic home; `/e/[slug]/agenda`, `/announcements`, `/info`
- `/e/[slug]/a/[token]` personal home; `/agenda`, `/seat`, `/announcements`, `/info`
- `/e/[slug]/register`, `/e/[slug]/register/done?t=<token>`

Admin (auth):
- `/login`
- `/admin` events list; `/admin/events/new`
- `/admin/events/[id]` overview: status, links, counts, QR export buttons
- `/admin/events/[id]/settings` (branding, venue, contact, registration, scan fields)
- `/admin/events/[id]/attendees` (list, search, add, edit, import, regenerate token)
- `/admin/events/[id]/agenda`, `/announcements`, `/info`, `/checkpoints`
- `/admin/events/[id]/export/attendance.xlsx`, `/export/qr.zip`, `/export/links.xlsx`

Crew (auth):
- `/scan/[eventId]` pick checkpoint, then camera scanner + name search + walk-in form.

Draft events: every `/e/...` route renders "Coming soon" with the event banner.
Exception: `/e/[slug]/register` ignores draft status so registration can open before the portal goes live.
Archived events: `/e/...` read-only; `/scan` disabled; admin shows "Purge personal data".

## 6. Masterlist template (pilot)

Sheet 1, header row exactly:

`Name | Email | Phone | Company | Category | Table | Seat | <any extra columns>`

- `Name` required. `Email` recommended (dedupe key). Other columns optional.
- Extra columns are stored into `extra` keyed by their header (trimmed).
- Import upserts by `(event_id, lower(email))`; rows without email always insert.
- Import report: inserted, updated, skipped (blank name), with row numbers.

## 7. Non-functional

- Attendee pages must render in under 2 s on a mid-range Android over 4G. Server-render,
  minimal client JS, no heavy UI library.
- Scanner must work on iOS Safari and Android Chrome via camera (`html5-qrcode`).
- All admin destructive actions (delete attendee, purge, regenerate token) confirm first.
- Every export streams from the server; no client-side Excel building.
