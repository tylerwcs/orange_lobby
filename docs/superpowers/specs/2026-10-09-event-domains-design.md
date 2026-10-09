# Event domains — design

**Status: proposed 9 Oct 2026, not yet approved.** No code, database or Vercel change until it is.

ECP Hub moves to its own domain, `ecphub.app`, bought on Vercel. Each event can then have an
address of its own, either a subdomain (`sk2summit.ecphub.app`) or a domain bought for that
client (`sk2summit.com`), also on Vercel. Attendees see the event's address on their QR codes,
WhatsApp links and posters. Organisers and crew keep working on `ecphub.app`.

## Where we are (checked 9 Oct 2026)

- **One address today.**
  - The app answers on `ecphub.vercel.app`, set by `NEXT_PUBLIC_APP_URL`.
  - Every link the app hands out is built in `src/lib/links.ts`:
    - attendee-facing: `genericLink`, `attendeeLink`, `registrationLink`
    - staff: `boothScannerLink`, `crewLink`, `hostLink`, `displayLink`
  - Those builders are called from 11 places. Among them are the QR zip, the links export, the
    calendar file, the portal's Me and home pages, registration's done page and the settings page.
- **Event pages** live under `/e/<slug>/…`. The attendee portal is `/e/<slug>/a/<token>/…`.
  About 30 places (in 24 files) build `/e/${slug}…` paths directly for links and redirects.
- **The short link `/a/<token>`** finds the event from the token and redirects to the portal.
  It exists because WhatsApp template buttons are frozen once Meta approves them. The approved
  templates' buttons point at `https://ecphub.vercel.app/a/{{1}}`.
- **Uniqueness:** `events.slug`, `attendees.token`, and the crew, host and display tokens are
  all unique across every event, so a token alone always names one event.
- **Outside services call `ecphub.vercel.app` directly:**
  - pg_cron calls `https://ecphub.vercel.app/api/cron/committee-reminders` (migration 0051)
  - Meta's webhook calls `/api/whatsapp/…`

  Neither follows redirects.
- **The proxy** (`src/proxy.ts`) runs only on `/admin`, `/scan` and `/login`, to check the admin
  session.
- **Admin sign-in** is email and password (`signInWithPassword`). No email links carry an
  address, but a session is kept per host, so moving hosts means signing in once more.
- **Installed portals:** the portal's web-app manifest (D227) scopes an installed home-screen
  app to `/e/<slug>/a/<token>` on the host it was installed from. `ecphub`'s staff have it
  installed on `ecphub.vercel.app`, and Project Mileage runs until 4 Dec.

## Goals and non-goals

**Goals**
- `ecphub.app` becomes the app's address, and nothing that works today stops working.
- An event can be given a subdomain of `ecphub.app` with no DNS or Vercel steps per event.
- An event can be given a domain bought on Vercel, with one Vercel step per domain.
- Every attendee-facing link the app hands out uses the event's address once it has one.
- On an event's address, only that event's attendee pages answer. Admin and staff pages, and
  other events, are not reachable there.

**Non-goals (now)**
- Buying domains from inside the app. Purchases stay manual, in the Vercel dashboard.
- Domains bought elsewhere (for example `.com.my` from a local registrar), which need a DNS
  record at the client's side. Phase 3, if a client needs it.
- Short paths everywhere. After the first page, the address bar may show `/e/<slug>/…` on an
  event's address (D425). Changing every internal path is a separate, larger job.
  **Decided 9 Oct 2026: later.** It becomes its own step after Phase 1 works (about a day): the
  ~30 places move onto one path helper that knows the current address.

## Decisions

### D422 — `ecphub.app` is the main address, and `ecphub.vercel.app` keeps answering

- Buy `ecphub.app` on Vercel and add `ecphub.app`, `www.ecphub.app` (redirecting to the apex)
  and `*.ecphub.app` to the project. Because Vercel is the domain's DNS, the wildcard works with
  no records to add.
- `NEXT_PUBLIC_APP_URL` becomes `https://ecphub.app`, so new links use it from then on.
- **`ecphub.vercel.app` is not redirected.** Both addresses serve the same app:
  - the cron job and the WhatsApp webhook keep calling it, and they don't follow redirects
  - the frozen WhatsApp buttons keep working
  - `ecphub`'s installed home-screen apps keep working until Mileage ends on 4 Dec

  A forced redirect of non-API paths can be decided after 4 Dec. Until then, the old address is
  simply a second way in.
- Migration 0051's cron URL and the WhatsApp webhook may move to `ecphub.app` later, as a
  separate, deliberate change. They don't need to.
- `.app` is HTTPS-only in every browser (HSTS preload). Vercel's certificates cover it.

### D423 — An event's addresses live in a new table, `event_domains`

```sql
create table public.event_domains (
  domain     text primary key check (domain = lower(domain) and domain !~ '[^a-z0-9.-]'),
  event_id   uuid not null references public.events (id) on delete cascade,
  org_id     uuid not null references public.organisations (id),
  is_primary boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index event_domains_one_primary on public.event_domains (event_id) where is_primary;
alter table public.event_domains enable row level security;  -- no policies: service role only
```

- **A table, not a column on `events`:**
  - An event can have more than one address. For example `sk2summit.ecphub.app` while the
    client's `sk2summit.com` is being set up, or an old address kept after a change.
  - Exactly one is primary, and that is the one links are built with. The others keep working
    and forward to it (D425), so a QR code printed before a change still lands.
  - Adding a table leaves `events` untouched. The migration adds one empty table, changes no
    existing row and cannot affect `ecphub`'s data.
- **Storage:** the stored value is always the full host, lowercase: `sk2summit.ecphub.app` or
  `sk2summit.com`. A subdomain is just an address under ours.
- **Deleting an event** deletes its addresses (cascade). The domain itself stays bought on
  Vercel until someone releases it.

### D424 — Setting an address in admin

The event's Settings page gets an **Address** section:

- **Subdomain:** type a label, for example `sk2summit`; it is saved as `sk2summit.ecphub.app`.
  - Allowed: lowercase letters, digits and hyphens, 3–40 characters, not starting or ending
    with a hyphen.
  - Reserved: `www`, `app`, `admin`, `api`, `mail`, `crew`, `host`, `display`, `booth`, `scan`,
    `login`, `help`, `status`.
  - A label already taken by another event is refused by name.
- **Own domain:** type the domain, for example `sk2summit.com`. Phase 2 adds a pick-list of
  domains the Vercel team owns.
  - Saving checks with Vercel's API that the domain is attached to the project and verified.
  - If it isn't, the domain is saved as not yet live, and the page says "Add sk2summit.com to the
    ECP Hub project in Vercel" with a Re-check button.
- **Make primary / remove.**
  - Removing the primary address leaves the event on `ecphub.app/e/<slug>`, and old links to
    the removed address stop working. Removing therefore needs a confirmation that says so.
  - Removing a non-primary address is the same, without the warning when it never went out.
- **What the page shows:** the event's link as attendees will see it, with a Copy button.
- **Warning while live:** changing the primary address shows "Printed QR codes and links already
  sent keep working through the old address only while it stays on this event."

Vercel API calls use a team token in `VERCEL_TOKEN`, plus `VERCEL_PROJECT_ID` and
`VERCEL_TEAM_ID`, server-side only. Phase 1 needs only the read calls: is this domain on the
project, and is it verified.

### D425 — The proxy routes by host

`src/proxy.ts` runs on every request except static files. It still runs on Node (Proxy's
default in Next 16).

```ts
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)"],
};
```

How each host is treated:

1. **Main host** (`ecphub.app`, `*.vercel.app`, `localhost`): everything works as today. The
   admin session check still runs only on `/admin`, `/scan` and `/login`.
2. **Any other host:** look the host up in `event_domains`. The answer is memoised per server
   instance for 60 seconds, the games pattern (D259), so the database sees about one read per
   host per minute.
   - **Unknown host:** a plain 404 page with no event content.
   - **Not primary:** a 308 redirect to the same path on the event's primary address, so old
     QR codes land.
   - **Primary address,** by path:
     - `/` → rewrite to `/e/<slug>` (the event's public page)
     - `/register`, `/agenda`, `/info`, `/plan`, `/stamps`, `/announcements` → rewrite to
       `/e/<slug>/…`
     - `/a/<token>/…` → rewrite to `/e/<slug>/a/<token>/…`. The proxy doesn't check the token:
       the portal already looks it up within this event only (`loadPortalAttendee` →
       `findByToken(event.id, token)`), so another event's token gets that page's 404, not
       that event's portal.
     - `/e/<slug>/…` for this event's slug: passes through. These are the paths the pages'
       own links and redirects already use (see below).
     - `/e/<other-slug>/…`: 404.
     - `/api/play/…`: passes through. The phone polls it, and it is checked by token.
     - `/privacy`, `/privacy/ms`: pass through. The consent gate links to them.
     - Anything else, including `/admin`, `/login`, `/scan`, `/crew`, `/host`, `/display`,
       `/booth`, `/api/cron` and `/api/whatsapp`: a 308 redirect to the same path on
       `ecphub.app`. Staff links are always built on the main address anyway (D426).

**Shared links are short, and in-app navigation keeps its paths.** The links people share or
scan are short, such as `sk2summit.com` and `sk2summit.com/a/<token>`, and they are rewritten,
so the address bar shows them. Once inside, the pages' own links and redirects still go to
`/e/<slug>/…`, on the event's address. That works because rule 2 lets the event's own slug
through. Shortening those ~30 places is the deferred non-goal; it isn't needed for the address
to work.

### D426 — Links are built from the event's address

- `src/lib/links.ts` gains `eventBaseUrl(event)`: `https://<primary domain>` when the event has
  one, otherwise `appBaseUrl()`.
- The attendee-facing builders take the event and use it:

  | Builder | Event with an address | Event without one |
  |---|---|---|
  | `genericLink` | `https://sk2summit.com` | `https://ecphub.app/e/<slug>` |
  | `attendeeLink` | `https://sk2summit.com/a/<token>` | `https://ecphub.app/e/<slug>/a/<token>` |
  | `registrationLink` | `https://sk2summit.com/register` | `https://ecphub.app/e/<slug>/register` |

- The staff builders (`boothScannerLink`, `crewLink`, `hostLink`, `displayLink`) stay on
  `appBaseUrl()`.
- The 11 callers pass the event they already hold; most already load it. The compiler finds
  each one, because the builders' signatures change.
- The QR zip, the links export and the calendar file pick it up automatically, because they
  call these builders.

### D427 — The WhatsApp short link forwards to the event's address

`/a/<token>` on the main host (`src/app/a/[token]/page.tsx`) redirects to
`https://<primary domain>/a/<token>` when the event has an address, and to the existing
`/e/<slug>/a/<token>` otherwise. The frozen template buttons keep working, at the cost of one
extra redirect, and no template has to be resubmitted.

### D428 — Feature layout

This is a new feature, so it starts in `src/features/domains/` (D402):

- `db.ts`: `event_domains` reads and writes, plus the host lookup
- `hosts.ts` (pure): label validation, the reserved list, and the host classification the proxy
  uses (main, unknown, primary, alias)
- `routing.ts` (pure): path → action for an event's address (rewrite, pass, 404 or redirect),
  so the rules in D425 are unit-tested rather than only browser-tested
- `vercel.ts`: the Vercel API calls (server-only)
- `admin/AddressSection.tsx` and `admin/actions.ts`
- `index.ts` / `client.ts` entries

`src/proxy.ts` and `src/lib/links.ts` call it through `@/features/domains`.

### D429 — Performance and safety

- **Main-host requests** do a string comparison and no database work, so the app's existing
  traffic costs nothing extra (D405 rule 5).
- **Event-address requests** do at most one memoised lookup a minute per host per instance, and
  nothing else. Tokens are checked by the pages that already check them (D425).
- **The proxy only ever rewrites to the host's own event.** A crafted `Host` header can't reach
  another event, because Vercel only routes hosts attached to the project, and the lookup
  returns one event per host.
- **The migration only adds a table.** No existing table, row or policy changes, and `ecphub`
  isn't touched.

### D430 — Testing

- **Unit:** `hosts.ts` and `routing.ts` cover every rule in D424 and D425: reserved labels, a
  taken label, uppercase input, each path class, another event's slug and another event's token.
- **Local:** Chrome resolves `*.localhost` to this machine, so with the subdomain root set to
  `localhost` in development, `sk2summit.localhost:3000` exercises the real proxy end to end.
- **Production, before the first client:** a test subdomain on `ecpkom` (for example
  `ecpkom.ecphub.app`) and one cheap test domain bought for the purpose, checked end to end:
  - the QR from the zip, `/a/<token>` from the old address, and registration
  - that `/admin` redirects away and that another event's slug returns 404
- **Never on `ecphub`.**

## Order of work

1. **You:** buy `ecphub.app` on Vercel and add `ecphub.app`, `www.ecphub.app` and
   `*.ecphub.app` to the project.
2. **Main address (D422):** set `NEXT_PUBLIC_APP_URL=https://ecphub.app` and redeploy. Check
   that admin, the portal, the cron and WhatsApp still work on both addresses.
3. **Phase 1:**
   - migration (`event_domains`)
   - `src/features/domains/`: the proxy routing, the link builders, the short-link forward
   - the Settings section with subdomains, plus own domains typed in and checked through
     Vercel's API
   - tests, local `*.localhost` checks and the production check on `ecpkom`
4. **Phase 2:** the pick-list of the team's Vercel domains in Settings, and attaching a domain to
   the project from the app.
5. **Phase 3 (only if a client needs it):** domains bought elsewhere, with the DNS record shown
   in Settings and Vercel's verification status.

## Open questions

- **Address before printing.** The 1,000-pax event next month: will it get its own address?
  If so, it has to be set before badges and QR codes are printed (D424's warning).
- **Domain ownership policy for clients:** who pays renewals, how long you keep the domain
  after the event, and whether the client can take it over (transfer out). This goes in the
  quote rather than the code, but Settings could show each domain's renewal date in Phase 2.
- **When to redirect `ecphub.vercel.app`** to `ecphub.app` for non-API paths. Proposed: after
  Mileage ends on 4 Dec, or never.
