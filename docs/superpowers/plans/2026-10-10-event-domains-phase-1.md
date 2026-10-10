# Event Domains Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An event can be given its own address, either `<label>.ecphub.app` or a domain bought on
Vercel. Attendee links, QR codes and the WhatsApp short link then use it, and on that address
only that event's attendee pages answer.

**Architecture:**
- A new `event_domains` table holds each event's addresses, one of them primary.
- The new feature `src/features/domains/` holds:
  - the pure host rules (`hosts.ts`) and path rules (`routing.ts`)
  - the proxy's memoised host lookup (`lookup.ts`)
  - the admin reads and writes (`db.ts`), the Vercel status check (`vercel.ts`) and the
    Settings tab
- `src/proxy.ts` sends any non-main host through `routing.ts`.
- `src/lib/links.ts` builds attendee links from an `EventAddress` (slug + primary domain).

**Tech Stack:** Next.js 16 (Proxy on the Node runtime, App Router), Supabase (supabase-js,
service role), Vitest 5, Vercel REST API (read-only in this phase).

**Spec:** `docs/superpowers/specs/2026-10-09-event-domains-design.md` (D422–D430, approved
10 Oct 2026)

## Global Constraints

- Work on `main` (memory: works-on-main). Run `git pull --rebase --autostash` before each
  commit, because other sessions push to main.
- **Never test against the event with slug `ecphub`.** Use `ecpkom`
  (id `4e64a90c-728c-4a08-af62-8c8046afa0c9`).
- **`ecphub.vercel.app` must keep serving everything it serves today** (D422): the cron, the
  WhatsApp webhook, the frozen template buttons `ecphub.vercel.app/a/{{1}}`, and installed
  portals. It is a main host; nothing on it may redirect.
- **The migration only adds `event_domains`** (D423). No other table, row or policy changes.
- Subdomain labels:
  - pattern: lowercase letters, digits and hyphens, 3–40 characters, not starting or ending
    with a hyphen
  - reserved: `www`, `app`, `admin`, `api`, `mail`, `crew`, `host`, `display`, `booth`, `scan`,
    `login`, `help`, `status`
- Hosts are stored lowercase and complete, for example `sk2summit.ecphub.app` or
  `sk2summit.com`.
- The proxy memoises host lookups for 60 s per instance (D429). Main-host requests do no
  database work.
- Staff links (`boothScannerLink`, `crewLink`, `hostLink`, `displayLink`) stay on
  `appBaseUrl()` (D426).
- New environment variables, all server-side:
  - `EVENT_DOMAIN_ROOT`: default `ecphub.app` in production, `localhost` otherwise
  - `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`: optional. Without them, the Settings
    tab says it can't check own domains.
- Checks after every task: `npx tsc --noEmit -p .`, `npx eslint` (0 errors; the 4 existing
  warnings in `scripts/booking-concurrency.mjs` are expected), and `npm test`.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

### Decisions this plan adds

- **D431 — The proxy's lookup is exported from `client.ts`.**
  - `index.ts` re-exports `db.ts`, which imports `server-only`, and the proxy layer may not be
    allowed to load that.
  - So `lookup.ts` carries no `server-only` marker, and `client.ts` exports it alongside the
    pure rules.
  - It reads `SUPABASE_SERVICE_ROLE_KEY`, which Next never puts in a browser bundle (only
    `NEXT_PUBLIC_*` is inlined). A browser that somehow imported it would get a function that
    can't connect, not a secret.
- **D432 — Removing the primary address promotes the most recently added remaining address.**
  - An event with addresses but no primary would have aliases redirecting to nothing.
  - With no addresses left, the event is back on `ecphub.app/e/<slug>`.

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/0069_event_domains.sql` | the table (create) |
| `src/features/domains/hosts.ts` | config, main-host test, label and domain validation (create) |
| `src/features/domains/routing.ts` | path → route decision on an event's address (create) |
| `src/features/domains/lookup.ts` | host → event, memoised; used by the proxy (create) |
| `src/features/domains/db.ts` | list, add, remove and make-primary; `primaryDomainFor` (create) |
| `src/features/domains/vercel.ts` | is this domain on the project and verified? (create) |
| `src/features/domains/admin/AddressTab.tsx`, `admin/actions.ts` | the Settings tab and its actions (create) |
| `src/features/domains/client.ts`, `index.ts` | entries (create) |
| `src/lib/links.ts` | `EventAddress`, `hostUrl`; attendee builders take an address (modify) |
| `src/proxy.ts` | route non-main hosts (modify) |
| `src/app/a/[token]/page.tsx` | forward to the event's address (modify) |
| 9 link callers | pass the event's address (modify) |
| `src/app/admin/events/[id]/settings/page.tsx` | Address tab (modify) |
| `tests/domains/hosts.test.ts`, `tests/domains/routing.test.ts`, `tests/links.test.ts` | tests (create, create, modify) |

---

### Task 1: The `event_domains` table

**Files:**
- Create: `supabase/migrations/0069_event_domains.sql`
- Modify: `docs/superpowers/specs/2026-10-09-event-domains-design.md` (status line only)

- [ ] **Step 1: Write the migration**

```sql
-- D423: an event's addresses. One is primary and is used for links; the rest forward to it.
-- Adds a table and nothing else: no existing table, row or policy changes.
create table public.event_domains (
  domain     text primary key check (domain = lower(domain) and domain !~ '[^a-z0-9.-]' and domain like '%.%'),
  event_id   uuid not null references public.events (id) on delete cascade,
  org_id     uuid not null references public.organisations (id),
  is_primary boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index event_domains_one_primary on public.event_domains (event_id) where is_primary;
create index event_domains_event on public.event_domains (event_id);
-- Read and written only by the server with the service role: no policies on purpose.
alter table public.event_domains enable row level security;
```

- [ ] **Step 2: Apply it**

Apply it with the Supabase MCP `apply_migration` (name `0069_event_domains`), or
`supabase db push`. Then check it:

```sql
select count(*) from public.event_domains;                            -- 0
select relrowsecurity from pg_class where relname = 'event_domains';  -- true
select count(*) from public.events where slug = 'ecphub';             -- 1 (untouched)
```

- [ ] **Step 3: Mark the spec approved**

Change the status line of `docs/superpowers/specs/2026-10-09-event-domains-design.md` to:
`**Status: approved 10 Oct 2026.** Phase 1 plan: docs/superpowers/plans/2026-10-10-event-domains-phase-1.md.`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0069_event_domains.sql docs/superpowers/specs/2026-10-09-event-domains-design.md docs/superpowers/plans/2026-10-10-event-domains-phase-1.md
git commit -m "feat(domains): event_domains table (D423)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Host rules (`hosts.ts`)

**Files:**
- Create: `src/features/domains/hosts.ts`, `src/features/domains/client.ts`
- Test: `tests/domains/hosts.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type DomainConfig = { root: string; appHost: string };
  export function domainConfig(): DomainConfig;
  export function hostOf(hostHeader: string | null): string;          // lowercase, port dropped
  export function isMainHost(host: string, cfg: DomainConfig): boolean;
  export const RESERVED_LABELS: readonly string[];
  export type HostResult = { ok: true; host: string } | { ok: false; error: string };
  export function subdomainHost(label: string, root: string): HostResult;
  export function ownDomainHost(input: string, root: string): HostResult;
  export function isSubdomainOf(host: string, root: string): boolean;
  ```

- [ ] **Step 1: Write the failing test**

`tests/domains/hosts.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { hostOf, isMainHost, ownDomainHost, subdomainHost, isSubdomainOf } from "@/features/domains/hosts";

const cfg = { root: "ecphub.app", appHost: "ecphub.app" };

describe("hostOf", () => {
  it("lowercases and drops the port", () => {
    expect(hostOf("SK2Summit.ecphub.app:443")).toBe("sk2summit.ecphub.app");
    expect(hostOf("sk2summit.localhost:3000")).toBe("sk2summit.localhost");
    expect(hostOf(null)).toBe("");
  });
});

describe("isMainHost (D422)", () => {
  it("is the app, its root, www, any vercel.app host and localhost", () => {
    for (const h of ["", "ecphub.app", "www.ecphub.app", "ecphub.vercel.app", "ecphub-git-x.vercel.app", "localhost", "127.0.0.1"]) {
      expect(isMainHost(h, cfg), h).toBe(true);
    }
  });
  it("is not an event's address", () => {
    expect(isMainHost("sk2summit.ecphub.app", cfg)).toBe(false);
    expect(isMainHost("sk2summit.com", cfg)).toBe(false);
  });
  it("treats the configured app host as main even when it differs from the root", () => {
    expect(isMainHost("events.example.com", { root: "ecphub.app", appHost: "events.example.com" })).toBe(true);
  });
});

describe("subdomainHost (D424)", () => {
  it("builds the host from a valid label", () => {
    expect(subdomainHost(" SK2Summit ", "ecphub.app")).toEqual({ ok: true, host: "sk2summit.ecphub.app" });
    expect(subdomainHost("kom-2026", "ecphub.app")).toEqual({ ok: true, host: "kom-2026.ecphub.app" });
  });
  it("refuses bad and reserved labels with a sentence", () => {
    expect(subdomainHost("ab", "ecphub.app")).toMatchObject({ ok: false });
    expect(subdomainHost("-kom", "ecphub.app")).toMatchObject({ ok: false });
    expect(subdomainHost("kom_2026", "ecphub.app")).toMatchObject({ ok: false });
    expect(subdomainHost("a".repeat(41), "ecphub.app")).toMatchObject({ ok: false });
    expect(subdomainHost("admin", "ecphub.app")).toEqual({ ok: false, error: "“admin” is reserved. Pick another name." });
  });
});

describe("ownDomainHost (D424)", () => {
  it("accepts a domain typed with or without https:// and a trailing slash", () => {
    expect(ownDomainHost("https://SK2Summit.com/", "ecphub.app")).toEqual({ ok: true, host: "sk2summit.com" });
    expect(ownDomainHost("summit.sk2.com.my", "ecphub.app")).toEqual({ ok: true, host: "summit.sk2.com.my" });
  });
  it("sends addresses under our own root to the subdomain box", () => {
    expect(ownDomainHost("sk2.ecphub.app", "ecphub.app")).toEqual({ ok: false, error: "For an address ending in .ecphub.app, use the subdomain box." });
  });
  it("refuses what is not a domain", () => {
    expect(ownDomainHost("sk2summit", "ecphub.app")).toMatchObject({ ok: false });
    expect(ownDomainHost("sk2 summit.com", "ecphub.app")).toMatchObject({ ok: false });
    expect(ownDomainHost("ecphub.vercel.app", "ecphub.app")).toMatchObject({ ok: false });
  });
});

describe("isSubdomainOf", () => {
  it("is true only for hosts under the root", () => {
    expect(isSubdomainOf("sk2.ecphub.app", "ecphub.app")).toBe(true);
    expect(isSubdomainOf("ecphub.app", "ecphub.app")).toBe(false);
    expect(isSubdomainOf("notecphub.app", "ecphub.app")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/domains/hosts.test.ts`
Expected: FAIL, because `@/features/domains/hosts` doesn't exist.

- [ ] **Step 3: Implement `src/features/domains/hosts.ts`**

```ts
import { appBaseUrl } from "@/lib/links";

/** The root event subdomains live under, and the host the app itself answers on (D422). */
export type DomainConfig = { root: string; appHost: string };

export function domainConfig(): DomainConfig {
  const root = (process.env.EVENT_DOMAIN_ROOT || (process.env.NODE_ENV === "production" ? "ecphub.app" : "localhost")).toLowerCase();
  return { root, appHost: new URL(appBaseUrl()).hostname.toLowerCase() };
}

/** The Host header as a bare hostname: lowercase, no port. */
export function hostOf(hostHeader: string | null): string {
  return (hostHeader ?? "").trim().toLowerCase().replace(/:\d+$/, "");
}

/**
 * Hosts that serve the whole app as today (D422). Every *.vercel.app host is main: production's
 * own `ecphub.vercel.app` (the cron, the WhatsApp webhook and the frozen template buttons call it)
 * and every preview deployment.
 */
export function isMainHost(host: string, cfg: DomainConfig): boolean {
  // No Host at all is treated as main: never let a header-less request 404 the whole app.
  return host === "" || host === cfg.appHost || host === cfg.root || host === `www.${cfg.root}`
    || host.endsWith(".vercel.app") || host === "localhost" || host === "127.0.0.1";
}

export const RESERVED_LABELS = ["www", "app", "admin", "api", "mail", "crew", "host", "display", "booth", "scan", "login", "help", "status"] as const;

export type HostResult = { ok: true; host: string } | { ok: false; error: string };

const LABEL = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;

/** D424: the label an organiser types, as `<label>.<root>`. */
export function subdomainHost(label: string, root: string): HostResult {
  const l = label.trim().toLowerCase();
  if (!LABEL.test(l)) return { ok: false, error: "Use 3–40 letters, digits or hyphens, not starting or ending with a hyphen." };
  if ((RESERVED_LABELS as readonly string[]).includes(l)) return { ok: false, error: `“${l}” is reserved. Pick another name.` };
  return { ok: true, host: `${l}.${root}` };
}

const DOMAIN = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function isSubdomainOf(host: string, root: string): boolean {
  return host.endsWith(`.${root}`);
}

/** D424: a client's own domain, typed as an organiser would - with or without https:// and a slash. */
export function ownDomainHost(input: string, root: string): HostResult {
  const host = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (host === root || isSubdomainOf(host, root)) return { ok: false, error: `For an address ending in .${root}, use the subdomain box.` };
  if (host.endsWith(".vercel.app")) return { ok: false, error: "A vercel.app address can't be an event's address." };
  if (!DOMAIN.test(host)) return { ok: false, error: "That doesn't look like a domain. Type it like sk2summit.com." };
  return { ok: true, host };
}
```

`src/features/domains/client.ts`:
```ts
/**
 * The domains feature's entry for anywhere outside a server component (D402, D431): the pure host
 * and path rules, and the proxy's lookup. `index.ts` re-exports this and adds the admin side.
 */
export * from "./hosts";
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/domains/hosts.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the checks and commit**

```bash
npx tsc --noEmit -p . && npx eslint && npm test
git add src/features/domains tests/domains
git commit -m "feat(domains): host rules - main hosts, subdomain labels, own domains (D422, D424)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Path rules on an event's address (`routing.ts`)

**Files:**
- Create: `src/features/domains/routing.ts`
- Modify: `src/features/domains/client.ts`
- Test: `tests/domains/routing.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Route = { kind: "rewrite"; path: string } | { kind: "pass" } | { kind: "notFound" } | { kind: "main" };
  export function routeEventPath(pathname: string, slug: string): Route;
  ```

- [ ] **Step 1: Write the failing test**

`tests/domains/routing.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { routeEventPath } from "@/features/domains/routing";

const r = (p: string) => routeEventPath(p, "sk2summit");

describe("routeEventPath (D425)", () => {
  it("shows the event at the root and at its short public paths", () => {
    expect(r("/")).toEqual({ kind: "rewrite", path: "/e/sk2summit" });
    expect(r("/register")).toEqual({ kind: "rewrite", path: "/e/sk2summit/register" });
    expect(r("/register/done")).toEqual({ kind: "rewrite", path: "/e/sk2summit/register/done" });
    for (const s of ["agenda", "info", "plan", "stamps", "announcements"]) expect(r(`/${s}`)).toEqual({ kind: "rewrite", path: `/e/sk2summit/${s}` });
  });

  it("opens an attendee's portal from the short link, and below it", () => {
    expect(r("/a/abcdefghjkmn")).toEqual({ kind: "rewrite", path: "/e/sk2summit/a/abcdefghjkmn" });
    expect(r("/a/abcdefghjkmn/activities")).toEqual({ kind: "rewrite", path: "/e/sk2summit/a/abcdefghjkmn/activities" });
    expect(r("/a")).toEqual({ kind: "main" });
  });

  it("passes the event's own /e paths, and refuses another event's", () => {
    expect(r("/e/sk2summit/a/abcdefghjkmn/agenda")).toEqual({ kind: "pass" });
    expect(r("/e/sk2summit")).toEqual({ kind: "pass" });
    expect(r("/e/ecphub/a/abcdefghjkmn")).toEqual({ kind: "notFound" });
    expect(r("/e")).toEqual({ kind: "notFound" });
  });

  it("passes what attendee pages call or link to", () => {
    expect(r("/api/play/abcdefghjkmn/state")).toEqual({ kind: "pass" });
    expect(r("/privacy")).toEqual({ kind: "pass" });
    expect(r("/privacy/ms")).toEqual({ kind: "pass" });
    expect(r("/portal-icons/agenda.svg")).toEqual({ kind: "pass" });
    expect(r("/brand/logo.png")).toEqual({ kind: "pass" });
    expect(r("/app-icons/192.png")).toEqual({ kind: "pass" });
    expect(r("/globe.svg")).toEqual({ kind: "pass" });
  });

  it("sends every staff and admin path to the main address", () => {
    for (const p of ["/admin", "/admin/events/x/export/links.xlsx", "/login", "/scan/x", "/crew/x", "/host/x", "/display/x", "/booth/x", "/api/cron/committee-reminders", "/api/whatsapp/webhook", "/api/display/x/state", "/anything"]) {
      expect(r(p), p).toEqual({ kind: "main" });
    }
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/domains/routing.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/features/domains/routing.ts`**

```ts
/** What the proxy does with one path on an event's primary address (D425). */
export type Route = { kind: "rewrite"; path: string } | { kind: "pass" } | { kind: "notFound" } | { kind: "main" };

/** The event's public pages, which answer at /<section> on its address. */
const SECTIONS = new Set(["register", "agenda", "info", "plan", "stamps", "announcements"]);
/** public/ folders and root files the attendee pages load. */
const STATIC_DIRS = new Set(["app-icons", "brand", "portal-icons"]);
const ROOT_FILE = /^\/[^/]+\.(?:svg|png|ico|txt|webmanifest)$/;

export function routeEventPath(pathname: string, slug: string): Route {
  const parts = pathname.split("/").filter(Boolean);
  const [first, second] = parts;
  if (parts.length === 0) return { kind: "rewrite", path: `/e/${slug}` };
  if (first === "e") return second === slug ? { kind: "pass" } : { kind: "notFound" };
  // The portal checks the token within this event (loadPortalAttendee), so another event's
  // token gets that page's not-found, never that event's portal.
  if (first === "a") return second ? { kind: "rewrite", path: `/e/${slug}${pathname}` } : { kind: "main" };
  if (SECTIONS.has(first)) return { kind: "rewrite", path: `/e/${slug}${pathname}` };
  if (first === "api" && second === "play") return { kind: "pass" };
  if (first === "privacy") return { kind: "pass" };
  if (STATIC_DIRS.has(first) || ROOT_FILE.test(pathname)) return { kind: "pass" };
  return { kind: "main" };
}
```

Add to `client.ts`: `export * from "./routing";`

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/domains/routing.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the checks and commit**

```bash
npx tsc --noEmit -p . && npx eslint && npm test
git add src/features/domains tests/domains
git commit -m "feat(domains): path rules on an event's address (D425)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Reads and writes, and links built from an event's address

**Files:**
- Create: `src/features/domains/db.ts`, `src/features/domains/index.ts`
- Modify: `src/lib/links.ts`, `tests/links.test.ts`
- Modify (callers):
  - `src/app/admin/events/[id]/export/links.xlsx/route.ts:14,23`
  - `src/app/admin/events/[id]/export/qr.zip/route.ts:13-14`
  - `src/app/admin/events/[id]/exports/page.tsx:26,121`
  - `src/app/admin/events/[id]/settings/page.tsx:82,310-311`
  - `src/app/e/[slug]/a/[token]/activities/[activityId]/calendar.ics/route.ts:43`
  - `src/app/e/[slug]/a/[token]/me/page.tsx:34`
  - `src/app/e/[slug]/a/[token]/page.tsx:87`
  - `src/app/e/[slug]/register/done/page.tsx:25`
  - `src/components/admin/AttendeeDetail.tsx:45`
  - `src/app/a/[token]/page.tsx`

**Interfaces:**
- Produces, in `src/lib/links.ts`:
  ```ts
  export type EventAddress = { slug: string; domain: string | null };
  export function hostUrl(host: string): string;                       // app's protocol + port, that host
  export function genericLink(addr: EventAddress): string;
  export function attendeeLink(addr: EventAddress, token: string): string;
  export function registrationLink(addr: EventAddress): string;
  ```
- Produces, in `src/features/domains/db.ts`:
  ```ts
  export type EventDomain = { domain: string; event_id: string; is_primary: boolean; created_at: string };
  export function listEventDomains(eventId: string): Promise<EventDomain[]>;
  export const primaryDomainFor: (eventId: string) => Promise<string | null>;   // React cache
  export function eventAddress(ev: { id: string; slug: string }): Promise<EventAddress>;
  export function addEventDomain(ev: { id: string; org_id: string }, host: string): Promise<{ ok: true } | { ok: false; error: string }>;
  export function makePrimary(eventId: string, host: string): Promise<void>;
  export function removeEventDomain(eventId: string, host: string): Promise<void>;
  ```

- [ ] **Step 1: Rewrite the attendee-link tests**

In `tests/links.test.ts`, replace the first `describe("links", …)` block with the block below. Keep
the staff-link and `attendeePath` tests as they are.

```ts
import { afterEach, beforeEach, vi } from "vitest";

describe("attendee links (D426)", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://events.ecopiaevents.com/"));
  afterEach(() => vi.unstubAllEnvs());
  const plain = { slug: "kom-2026", domain: null };
  const own = { slug: "kom-2026", domain: "kom.example.com" };

  it("builds links on the app's address when the event has none", () => {
    expect(genericLink(plain)).toBe("https://events.ecopiaevents.com/e/kom-2026");
    expect(attendeeLink(plain, "abcdefghjkmn")).toBe("https://events.ecopiaevents.com/e/kom-2026/a/abcdefghjkmn");
    expect(registrationLink(plain)).toBe("https://events.ecopiaevents.com/e/kom-2026/register");
  });

  it("builds short links on the event's own address", () => {
    expect(genericLink(own)).toBe("https://kom.example.com");
    expect(attendeeLink(own, "abcdefghjkmn")).toBe("https://kom.example.com/a/abcdefghjkmn");
    expect(registrationLink(own)).toBe("https://kom.example.com/register");
  });

  it("keeps the app's protocol and port, so *.localhost works in development", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    expect(attendeeLink({ slug: "kom", domain: "kom.localhost" }, "abcdefghjkmn")).toBe("http://kom.localhost:3000/a/abcdefghjkmn");
  });
});
```

Merge the `vitest` import into the file's existing one:
`import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";`

Run: `npx vitest run tests/links.test.ts`
Expected: FAIL. The builders still take `(base, slug, …)`.

- [ ] **Step 2: Change the builders in `src/lib/links.ts`**

Replace `genericLink`, `attendeeLink` and `registrationLink` with the code below. Leave
`appBaseUrl`, `attendeePath` and the four staff builders as they are.

```ts
/** Where an event lives for attendees (D426): its slug, and its primary address if it has one. */
export type EventAddress = { slug: string; domain: string | null };

/** A host as a base URL, with the app's own protocol and port - https in production, http://…:3000 locally. */
export function hostUrl(host: string): string {
  const app = new URL(appBaseUrl());
  return `${app.protocol}//${host}${app.port ? `:${app.port}` : ""}`;
}

export function genericLink(addr: EventAddress) {
  return addr.domain ? hostUrl(addr.domain) : `${appBaseUrl()}/e/${addr.slug}`;
}

export function attendeeLink(addr: EventAddress, token: string) {
  return addr.domain ? `${hostUrl(addr.domain)}/a/${token}` : `${appBaseUrl()}${attendeePath(addr.slug, token)}`;
}

export function registrationLink(addr: EventAddress) {
  return addr.domain ? `${hostUrl(addr.domain)}/register` : `${appBaseUrl()}/e/${addr.slug}/register`;
}
```

Run: `npx vitest run tests/links.test.ts`
Expected: PASS.

- [ ] **Step 3: Create `src/features/domains/db.ts` and `index.ts`**

`db.ts`:
```ts
import "server-only";
import { cache } from "react";
import { serviceClient } from "@/lib/supabase/service";
import type { EventAddress } from "@/lib/links";

export type EventDomain = { domain: string; event_id: string; is_primary: boolean; created_at: string };

export async function listEventDomains(eventId: string): Promise<EventDomain[]> {
  const { data, error } = await serviceClient().from("event_domains").select("domain, event_id, is_primary, created_at")
    .eq("event_id", eventId).order("created_at");
  if (error) throw error;
  return (data ?? []) as EventDomain[];
}

/** The address links are built with (D426), once per request. */
export const primaryDomainFor = cache(async (eventId: string): Promise<string | null> => {
  const { data, error } = await serviceClient().from("event_domains").select("domain").eq("event_id", eventId).eq("is_primary", true).maybeSingle();
  if (error) throw error;
  return (data?.domain as string | undefined) ?? null;
});

export async function eventAddress(ev: { id: string; slug: string }): Promise<EventAddress> {
  return { slug: ev.slug, domain: await primaryDomainFor(ev.id) };
}

/** The first address an event gets is its primary; later ones forward to it until made primary. */
export async function addEventDomain(ev: { id: string; org_id: string }, host: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = serviceClient();
  const { data: existing, error: readError } = await db.from("event_domains").select("domain, event_id").eq("domain", host).maybeSingle();
  if (readError) throw readError;
  if (existing) return { ok: false, error: existing.event_id === ev.id ? "This event already has that address." : "Another event already uses that address." };
  const hasPrimary = (await listEventDomains(ev.id)).some((d) => d.is_primary);
  const { error } = await db.from("event_domains").insert({ domain: host, event_id: ev.id, org_id: ev.org_id, is_primary: !hasPrimary });
  if (error?.code === "23505") return { ok: false, error: "Another event already uses that address." };
  if (error) throw error;
  return { ok: true };
}

/** Clear the old primary first: the partial unique index allows one primary per event. */
export async function makePrimary(eventId: string, host: string): Promise<void> {
  const db = serviceClient();
  const { error: clearError } = await db.from("event_domains").update({ is_primary: false }).eq("event_id", eventId).eq("is_primary", true);
  if (clearError) throw clearError;
  const { error } = await db.from("event_domains").update({ is_primary: true }).eq("event_id", eventId).eq("domain", host);
  if (error) throw error;
}

/** D432: removing the primary promotes the most recently added address left, if any. */
export async function removeEventDomain(eventId: string, host: string): Promise<void> {
  const db = serviceClient();
  const { data: removed, error } = await db.from("event_domains").delete().eq("event_id", eventId).eq("domain", host).select("is_primary");
  if (error) throw error;
  if (!removed?.[0]?.is_primary) return;
  const left = await listEventDomains(eventId);
  const next = left.at(-1);
  if (next) await makePrimary(eventId, next.domain);
}
```

`index.ts`:
```ts
/** The domains feature's server entry (D402): everything in `client.ts`, plus its reads and writes. */
export * from "./client";
export * from "./db";
```

- [ ] **Step 4: Update the callers**

In each caller, load the event's address once with `eventAddress(ev)` from `@/features/domains`,
and pass it to the builder:

| Caller | Change |
|---|---|
| `export/links.xlsx/route.ts` | `const base = appBaseUrl();` → `const addr = await eventAddress(ev);`; `attendeeLink(base, ev.slug, a.token)` → `attendeeLink(addr, a.token)` |
| `export/qr.zip/route.ts` | the same two changes |
| `exports/page.tsx` | `const base = appBaseUrl();` → `const base = genericLink(await eventAddress(ev));` (line 121 now names the address links are made for); import `genericLink` |
| `settings/page.tsx` | add `eventAddress(ev)` to the page's `Promise.all` as `addr`; `genericLink(base, ev.slug)` → `genericLink(addr)`; `registrationLink(base, ev.slug)` → `registrationLink(addr)`. `base` stays, for `crewLink` |
| `calendar.ics/route.ts` | `attendeeLink(appBaseUrl(), slug, token)` → `attendeeLink(await eventAddress(event), token)` |
| `a/[token]/me/page.tsx` | `attendeeLink(appBaseUrl(), slug, attendee.token)` → `attendeeLink(await eventAddress(event), attendee.token)` |
| `a/[token]/page.tsx` (portal home) | same as Me; inside its existing `Promise.all`, use `eventAddress(event).then((addr) => qrDataUrl(attendeeLink(addr, attendee.token)))` |
| `register/done/page.tsx` | `attendeeLink(appBaseUrl(), slug, attendee.token)` → `attendeeLink(await eventAddress(event), attendee.token)` |
| `AttendeeDetail.tsx` | `attendeeLink(appBaseUrl(), ev.slug, a.token)` → `attendeeLink(await eventAddress(ev), a.token)` (it runs in the async loader at line 36–49) |

Remove `appBaseUrl` from each import where it's no longer used. The compiler lists every caller,
because the builders' signatures changed.

- [ ] **Step 5: Forward the WhatsApp short link (D427)**

In `src/app/a/[token]/page.tsx`, replace the last line, `redirect(attendeePath(ev.slug, token));`,
with:

```ts
  // D427: the frozen WhatsApp buttons point here on the main host; an event with its own
  // address takes the attendee there, one hop later. On an event's address the proxy rewrites
  // /a/<token> straight to the portal, so this page only ever runs on a main host.
  const domain = await primaryDomainFor(ev.id);
  redirect(domain ? attendeeLink({ slug: ev.slug, domain }, token) : attendeePath(ev.slug, token));
```

Add imports: `import { primaryDomainFor } from "@/features/domains";` and `attendeeLink` from
`@/lib/links`.

- [ ] **Step 6: Run the checks and commit**

Run: `npx tsc --noEmit -p . && npx eslint && npm test`
Expected: all pass. With no rows in `event_domains`, every link is exactly what it was.

```bash
git add src/lib/links.ts tests/links.test.ts src/features/domains src/app src/components/admin/AttendeeDetail.tsx
git commit -m "feat(domains): attendee links and the WhatsApp short link use the event's address (D426, D427)

No change while no event has an address: every link is built exactly as before.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The proxy routes by host

**Files:**
- Create: `src/features/domains/lookup.ts`
- Modify: `src/features/domains/client.ts`, `src/proxy.ts`

**Interfaces:**
- Consumes: `domainConfig`, `hostOf`, `isMainHost` (Task 2) and `routeEventPath` (Task 3).
- Produces:
  ```ts
  export type HostEvent = { slug: string; isPrimary: boolean; primaryDomain: string | null };
  export function lookupHost(host: string, now?: number): Promise<HostEvent | null>;
  ```

- [ ] **Step 1: Create `src/features/domains/lookup.ts`**

```ts
import { createClient } from "@supabase/supabase-js";

/**
 * Host → event for the proxy (D425, D429), memoised per server instance for a minute - the games
 * pattern (D259), so a busy event costs about one read per host per minute. No `server-only`
 * marker (D431): the proxy imports it, and the service key it reads is never in a browser bundle.
 */
export type HostEvent = { slug: string; isPrimary: boolean; primaryDomain: string | null };

const TTL_MS = 60_000;
const memo = new Map<string, { at: number; value: HostEvent | null }>();

export async function lookupHost(host: string, now = Date.now()): Promise<HostEvent | null> {
  const hit = memo.get(host);
  if (hit && now - hit.at < TTL_MS) return hit.value;
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.from("event_domains").select("domain, is_primary, event_id, events(slug)").eq("domain", host).maybeSingle();
  if (error) throw error;
  let value: HostEvent | null = null;
  if (data) {
    const slug = (data.events as unknown as { slug: string } | null)?.slug;
    let primaryDomain: string | null = data.is_primary ? host : null;
    if (!data.is_primary) {
      const { data: p } = await db.from("event_domains").select("domain").eq("event_id", data.event_id).eq("is_primary", true).maybeSingle();
      primaryDomain = (p?.domain as string | undefined) ?? null;
    }
    // An address whose event has no primary (only mid-change) serves the event itself.
    if (slug) value = { slug, isPrimary: data.is_primary || primaryDomain === null, primaryDomain };
  }
  memo.set(host, { at: now, value });
  return value;
}
```

Add to `client.ts`: `export * from "./lookup";`

- [ ] **Step 2: Rewrite `src/proxy.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { domainConfig, hostOf, isMainHost, lookupHost, routeEventPath } from "@/features/domains/client";
import { appBaseUrl } from "@/lib/links";

const ADMIN_PATHS = ["/admin", "/scan", "/login"];

export async function proxy(req: NextRequest) {
  const host = hostOf(req.headers.get("host"));
  if (!isMainHost(host, domainConfig())) return eventHost(req, host);
  const path = req.nextUrl.pathname;
  if (!ADMIN_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) return NextResponse.next();
  return adminSession(req);
}

/** D425: an event's address answers only that event's attendee pages. */
async function eventHost(req: NextRequest, host: string) {
  const ev = await lookupHost(host);
  if (!ev) return new NextResponse("Not found", { status: 404 });
  const { pathname, search } = req.nextUrl;
  if (!ev.isPrimary && ev.primaryDomain) {
    const to = new URL(`${pathname}${search}`, `${req.nextUrl.protocol}//${ev.primaryDomain}${req.nextUrl.port ? `:${req.nextUrl.port}` : ""}`);
    return NextResponse.redirect(to, 308);
  }
  const route = routeEventPath(pathname, ev.slug);
  switch (route.kind) {
    case "rewrite": {
      const to = req.nextUrl.clone();
      to.pathname = route.path;
      return NextResponse.rewrite(to);
    }
    case "pass": return NextResponse.next();
    case "notFound": return new NextResponse("Not found", { status: 404 });
    case "main": return NextResponse.redirect(new URL(`${pathname}${search}`, appBaseUrl()), 308);
    default: {
      const exhaustive: never = route;
      throw new Error(`Unhandled route: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Unchanged from before D425: the admin session check on /admin, /scan and /login. */
async function adminSession(req: NextRequest) {
  // Move the body of the old `proxy` function here unchanged, from
  // `let res = NextResponse.next({ request: req });` to `return res;`.
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)"],
};
```

Move the old function's body into `adminSession` exactly as it was. It covers creating the
Supabase server client, `getClaims`, the redirect to `/login?next=` for a protected path without
a session, and returning `res`.

- [ ] **Step 3: Check that the proxy may import its lookup**

Run: `npx next build`
Expected: the build succeeds. If it fails with a `server-only` or module-layer error that names
`src/features/domains`, check that `client.ts` doesn't re-export `db.ts`. It must not (D431);
only `index.ts` does.

- [ ] **Step 4: Run the checks and commit**

```bash
npx tsc --noEmit -p . && npx eslint && npm test
git add src/proxy.ts src/features/domains
git commit -m "feat(domains): the proxy routes an event's address to that event's pages (D425, D429, D431)

Main hosts - ecphub.app, www, every *.vercel.app, localhost - do exactly what they did, with no
database work. Any other host is looked up (memoised a minute): unknown is 404, an alias
308s to the primary, and on the primary only the event's attendee paths answer; staff and
admin paths 308 to the main address.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The Address tab in Settings

**Files:**
- Create: `src/features/domains/vercel.ts`, `src/features/domains/admin/actions.ts`, `src/features/domains/admin/AddressTab.tsx`
- Modify: `src/features/domains/index.ts`, `src/app/admin/events/[id]/settings/page.tsx`

**Interfaces:**
- Consumes: `subdomainHost`, `ownDomainHost`, `isSubdomainOf`, `domainConfig` (Task 2);
  `listEventDomains`, `addEventDomain`, `makePrimary`, `removeEventDomain`, `eventAddress` (Task 4);
  `genericLink` (Task 4).
- Produces:
  ```ts
  export type DomainStatus = "live" | "not-added" | "unverified" | "unknown";
  export function vercelDomainStatus(host: string): Promise<DomainStatus>;
  export function AddressTab(props: { eventId: string }): Promise<JSX.Element>;
  ```

- [ ] **Step 1: Create `src/features/domains/vercel.ts`**

```ts
import "server-only";

/**
 * Whether a domain is attached to this Vercel project and verified (D424). Read-only: buying and
 * attaching stay in the Vercel dashboard. "unknown" without the env vars, or when Vercel can't
 * be reached - the tab says so instead of guessing.
 */
export type DomainStatus = "live" | "not-added" | "unverified" | "unknown";

export async function vercelDomainStatus(host: string): Promise<DomainStatus> {
  const token = process.env.VERCEL_TOKEN, project = process.env.VERCEL_PROJECT_ID, team = process.env.VERCEL_TEAM_ID;
  if (!token || !project) return "unknown";
  const qs = team ? `?teamId=${encodeURIComponent(team)}` : "";
  try {
    const res = await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(host)}${qs}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    if (res.status === 404) return "not-added";
    if (!res.ok) return "unknown";
    const body = (await res.json()) as { verified?: boolean };
    return body.verified ? "live" : "unverified";
  } catch {
    return "unknown";
  }
}
```

- [ ] **Step 2: Create `src/features/domains/admin/actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { flashPath } from "@/lib/flash";
import { domainConfig, ownDomainHost, subdomainHost } from "../hosts";
import { addEventDomain, makePrimary, removeEventDomain } from "../db";

const back = (eventId: string) => `/admin/events/${eventId}/settings`;
// The proxy remembers an address for up to a minute per server (D429).
const SETTLE = " It can take a minute to take effect.";

async function event(eventId: string) {
  const { orgId } = await requireAdmin();
  return requireEvent(eventId, orgId);
}

async function add(eventId: string, read: { ok: true; host: string } | { ok: false; error: string }) {
  const ev = await event(eventId);
  if (!read.ok) redirect(flashPath(back(eventId), read.error, "error"));
  const added = await addEventDomain(ev, read.host);
  if (!added.ok) redirect(flashPath(back(eventId), added.error, "error"));
  revalidatePath(back(eventId));
  redirect(flashPath(back(eventId), `${read.host} added.${SETTLE}`));
}

export async function addSubdomainAction(eventId: string, fd: FormData) {
  await add(eventId, subdomainHost(String(fd.get("label") ?? ""), domainConfig().root));
}

export async function addOwnDomainAction(eventId: string, fd: FormData) {
  await add(eventId, ownDomainHost(String(fd.get("domain") ?? ""), domainConfig().root));
}

export async function makePrimaryAction(eventId: string, host: string) {
  const ev = await event(eventId);
  await makePrimary(ev.id, host);
  revalidatePath(back(eventId));
  redirect(flashPath(back(eventId), `Links now use ${host}.${SETTLE}`));
}

export async function removeDomainAction(eventId: string, host: string) {
  const ev = await event(eventId);
  await removeEventDomain(ev.id, host);
  revalidatePath(back(eventId));
  redirect(flashPath(back(eventId), `${host} removed.${SETTLE}`));
}
```

- [ ] **Step 3: Create `src/features/domains/admin/AddressTab.tsx`**

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { ShareLink } from "@/components/admin/ShareLink";
import { genericLink } from "@/lib/links";
import { requireEvent } from "@/lib/db/events";
import { requireAdmin } from "@/lib/auth";
import { domainConfig, isSubdomainOf } from "../hosts";
import { eventAddress, listEventDomains } from "../db";
import { vercelDomainStatus, type DomainStatus } from "../vercel";
import { addOwnDomainAction, addSubdomainAction, makePrimaryAction, removeDomainAction } from "./actions";

const STATUS: Record<DomainStatus, { label: string; tone: "success" | "destructive" | "outline" }> = {
  live: { label: "Live", tone: "success" },
  "not-added": { label: "Not added to the Vercel project yet", tone: "destructive" },
  unverified: { label: "Waiting for Vercel to verify", tone: "outline" },
  unknown: { label: "Can't check with Vercel", tone: "outline" },
};

/** D424: where attendees open this event. Staff pages stay on the main address. */
export async function AddressTab({ eventId }: { eventId: string }) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const { root } = domainConfig();
  const [domains, addr] = await Promise.all([listEventDomains(ev.id), eventAddress(ev)]);
  // Subdomains of our root are covered by the wildcard, so they are always live.
  const statuses = await Promise.all(domains.map((d) => (isSubdomainOf(d.domain, root) ? Promise.resolve("live" as const) : vercelDomainStatus(d.domain))));

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Attendee address</CardTitle>
          <CardDescription>
            Where QR codes, WhatsApp links and the registration link take attendees. Organiser, crew and scanner pages stay on
            the main address. Set this before badges are printed: a printed QR code keeps working only while its address stays on this event.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ShareLink label="Event link" url={genericLink(addr)} />
          {domains.length > 0 && (
            <ul className="flex flex-col divide-y rounded-md border">
              {domains.map((d, i) => (
                <li key={d.domain} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="font-mono">{d.domain}</span>
                  {d.is_primary ? <Badge>Primary</Badge> : <Badge variant="outline">Forwards to primary</Badge>}
                  <Badge variant={STATUS[statuses[i]].tone}>{STATUS[statuses[i]].label}</Badge>
                  <span className="ml-auto flex gap-2">
                    {!d.is_primary && (
                      <form action={makePrimaryAction.bind(null, ev.id, d.domain)}>
                        <SubmitButton variant="outline" size="sm">Make primary</SubmitButton>
                      </form>
                    )}
                    <form action={removeDomainAction.bind(null, ev.id, d.domain)}>
                      <ConfirmButton message={`Remove ${d.domain}? Links and QR codes that use it will stop working.`} confirmLabel="Remove">
                        Remove
                      </ConfirmButton>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add a subdomain</CardTitle>
          <CardDescription>Ready straight away, nothing to set up in Vercel.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={addSubdomainAction.bind(null, ev.id)} className="flex max-w-md flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1"><Field label={`Name (becomes name.${root})`} name="label" placeholder="sk2summit" /></div>
            <SubmitButton>Add</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add the client&apos;s own domain</CardTitle>
          <CardDescription>Buy it on Vercel and add it to the ECP Hub project first, then add it here.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={addOwnDomainAction.bind(null, ev.id)} className="flex max-w-md flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1"><Field label="Domain" name="domain" placeholder="sk2summit.com" /></div>
            <SubmitButton>Add</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

(`SubmitButton` takes `variant` and `size` like `Button`. `Badge` has `default`, `success`,
`destructive` and `outline` variants, checked 10 Oct 2026.)

Add to `index.ts`:
```ts
export * from "./vercel";
export { AddressTab } from "./admin/AddressTab";
```

- [ ] **Step 4: Add the tab to Settings**

In `src/app/admin/events/[id]/settings/page.tsx`:
1. Add `"address"` to the `rememberedTab(...)` allowed list:
   `["details", "registration", "checkpoints", "address", "alerts", "danger"]`.
2. Add a trigger after Checkpoints: `<TabsTrigger value="address">Address</TabsTrigger>`.
3. Add, outside the big settings `<form>` and next to the `alerts` `TabsContent`:
   ```tsx
   <TabsContent value="address" className="flex flex-col gap-4">
     <AddressTab eventId={ev.id} />
   </TabsContent>
   ```
4. Import `AddressTab` from `@/features/domains`.

- [ ] **Step 5: Run the checks and commit**

```bash
npx tsc --noEmit -p . && npx eslint && npm test
git add src/features/domains "src/app/admin/events/[id]/settings/page.tsx"
git commit -m "feat(domains): the Address tab - subdomains, own domains, primary, Vercel status (D424)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: End-to-end checks, locally and in production

**Files:**
- Modify: `docs/superpowers/specs/2026-10-09-event-domains-design.md` ("Built" note under D430)

- [ ] **Step 1: Local, with a subdomain of `localhost`**

1. `preview_start` `dev`. Sign in at `http://localhost:3000` (the user does this).
2. On `ecpkom`'s Settings → Address, add the subdomain `ecpkom`. It's stored as
   `ecpkom.localhost`, because `EVENT_DOMAIN_ROOT` defaults to `localhost` in development.
3. Check in the browser:
   - `http://ecpkom.localhost:3000/` shows ecpkom's public page.
   - `/register` shows ecpkom's registration.
   - `/a/u9ws4ftatd4b` shows the ZZ Consent Test portal. Tap Activities and Agenda; both load,
     and the address bar shows `/e/ecpkom/…` (expected, D425).
   - `/admin` redirects to `http://localhost:3000/admin`.
   - `/e/ecphub` is "Not found". Only check that it returns 404; don't open any `ecphub`
     attendee page.
   - `http://nope.localhost:3000/` is "Not found".
4. Settings → Exports: download `links.xlsx` and check that a link reads
   `http://ecpkom.localhost:3000/a/<token>`.
5. `http://localhost:3000/a/u9ws4ftatd4b` redirects to `http://ecpkom.localhost:3000/a/u9ws4ftatd4b` (D427).
6. Add a second subdomain `ecpkom-two`, then:
   - open `http://ecpkom-two.localhost:3000/agenda`; it should 308 to `ecpkom.localhost:3000/agenda`
   - Make primary → the event link now reads `ecpkom-two`
   - Remove `ecpkom-two` → `ecpkom` is promoted back to primary (D432)
7. Remove `ecpkom`, and check that the table is empty:
   `select count(*) from event_domains;` → 0.

- [ ] **Step 2: Production**

1. Push. When the deploy is live, check that the main hosts are unchanged:
   - `https://ecphub.vercel.app/admin` and `https://ecphub.app/admin` show the login
   - `https://ecphub.vercel.app/e/ecpkom` loads
2. On `ecpkom`, add the subdomain `ecpkom` (so `ecpkom.ecphub.app`). Repeat Step 1.3 on
   `https://ecpkom.ecphub.app`.
3. Remove it afterwards, unless the user wants to keep it.

- [ ] **Step 3: Record and commit**

Under D430 in the spec, add: "Built 10 Oct 2026 (plan
`docs/superpowers/plans/2026-10-10-event-domains-phase-1.md`); checked locally on
`ecpkom.localhost` and in production on `ecpkom.ecphub.app`." Then:

```bash
git add docs/superpowers/specs/2026-10-09-event-domains-design.md
git commit -m "docs(domains): Phase 1 built and checked

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git pull --rebase --autostash && git push
```

---

## For the user (not code)

- **Main address switch (D422):** in Vercel → Settings → Environment Variables (Production), set
  `NEXT_PUBLIC_APP_URL=https://ecphub.app`, then redeploy.
  - Can be done before or after this plan. Until it's done, links without an event address keep
    using `ecphub.vercel.app`.
  - Admins sign in once more on `ecphub.app`.
- **Optional, to show own-domain status in Settings:** create a Vercel token (Account →
  Tokens), then set `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` (Project → Settings → General) and
  `VERCEL_TEAM_ID` (Team → Settings → General) for Production. Without them the tab shows
  "Can't check with Vercel" and everything else works.

## Self-review

- **Spec coverage:**
  - D422 main hosts: Task 2 `isMainHost`; the env switch is the user step
  - D423 table: Task 1
  - D424 Settings and validation: Tasks 2 and 6
  - D425 proxy routing: Tasks 3 and 5
  - D426 links: Task 4
  - D427 short link: Task 4 Step 5
  - D428 feature layout: the file map
  - D429 memo and main-host fast path: Task 5
  - D430 testing: Tasks 2, 3 and 7
  - Phase 2 (domain pick-list, attaching via the API) and Phase 3 are not in this plan, by design.
- **Placeholders:** `adminSession`'s body is the existing proxy body, moved unchanged. The step
  says exactly what moves.
- **Types:**
  - `EventAddress`, from `@/lib/links`, is used by `db.ts` (`eventAddress`) and every caller.
  - `HostEvent`, `Route` and `DomainStatus` are each defined once.
  - `routeEventPath(pathname, slug)` is used with that signature in the proxy.
