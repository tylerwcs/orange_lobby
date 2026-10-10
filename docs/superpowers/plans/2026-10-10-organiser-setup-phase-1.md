# Organiser Setup Page, Phase 1: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each event gets one private setup link. Organisers open it and see their whole checklist. They fill in Event basics with a live phone preview of their portal, and submit. An admin reviews the changes and applies them with one click. A later Apply never overwrites the admin's own edits.

**Architecture:**

- New feature folder `src/features/setup/`:
  - pure rules: section list, status, checklist, the Basics section, image helpers
  - `db.ts` for the table and the token
  - `portal/` for the organiser screens and their token-gated actions
  - `preview/` for the phone preview
  - `admin/` for the Setup area, review and Apply
- One new table, `event_setup_sections`, holds three JSON snapshots per section: `answers`, `submitted` and `applied`. Status is derived from them, never stored.
- The checklist comes from a new optional `setup` field on the catalogue's features.
- Agenda and Info stay guide cards in this phase. Phase 2 makes them steps.

**Tech Stack:** Next.js 16 App Router and server actions. Read `node_modules/next/dist/docs/` before using any Next API not already used in this repo. Also React 19, Supabase (service-role client, RLS on with no policies), Vitest (node environment, `.test.ts` only) and TypeScript.

**Spec:** `docs/superpowers/specs/2026-10-10-organiser-setup-design.md` (D441–D452). Task 1 corrects four details in it.

## Global Constraints

- **Sections:** `basics`, `agenda`, `info`. Phase 1 builds `basics` only: `BUILT_STEPS = ["basics"]`.
- **Status is derived, never stored:**
  - no row: "Not started"
  - `submitted` is null: "Draft"
  - `submitted` differs from `applied`: "Submitted"
  - otherwise: "Applied"
  - Separately, "unsubmitted changes" means `submitted` is not null and `answers` differs from `submitted`.
- **Apply writes only fields that changed since the last Apply.** The baseline is `applied`, or the blank answers when nothing has been applied yet. So a blank optional field never wipes a live value on the first Apply.
- **The token is the identity.** Every organiser action:
  - re-checks `isValidToken`
  - checks the rate limit `allow(\`setup:${token}\`, 240, 60_000)`
  - looks the event up by `setup_token`
  
  A bad or turned-off link returns 404 on pages, and `{ ok: false }` from actions.
- **Never pass a full `Event` row to a client component.** It carries `crew_token`, `host_token`, `setup_token` and `org_id`. Pass explicit projections only.
- **One image per request.** Vercel caps a request body at 4.5 MB. Images are PNG, JPEG, WebP or SVG, 4 MB or less (`acceptImage`). Shrink non-SVG files over 1.5 MB in the browser with `shrinkImage` before uploading.
- **Image proportions warn, never block** (D447). The 4 MB limit does block.
- **Copy (verbatim):**
  - stale save: `"Someone else updated this section — reload to see their changes."`
  - turned-off or bad link: `"This setup link no longer works. Ask your project contact for a new one."`
- **Features are imported only through their entry.** Server code uses `@/features/<name>`. Browser code and pure files use `@/features/<name>/client`. ESLint enforces this (D403). Inside the feature, files import each other relatively.
- **Never test on the event with slug `ecphub`.** It is a real event. `ecpkom` (id `4e64a90c-728c-4a08-af62-8c8046afa0c9`) is the test event.
- **Git:**
  - Work on `main`.
  - Run `git pull --rebase --autostash` before each commit. Never push.
  - Never stage `docs/superpowers/specs/2026-09-27-intro-video-design.md` or `docs/image-guide/`; they are the user's own uncommitted files.
  - Every commit message ends with this trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## File map

| File | Status | Responsibility |
| --- | --- | --- |
| `supabase/migrations/0071_event_setup.sql` | create | `setup_token` plus `event_setup_sections` |
| `src/lib/types.ts` | modify | `Event.setup_token` |
| `src/features/domains/hosts.ts`, `tests/domains/hosts.test.ts`, `tests/domains/routing.test.ts` | modify | Reserve `setup`; `/setup/x` goes to the main address |
| `src/features/catalogue/catalogue.ts`, `tests/catalogue/catalogue.test.ts` | modify | `SetupItem` and each feature's `setup` |
| `src/features/setup/sections.ts` | create | `SETUP_SECTIONS`, `BUILT_STEPS` |
| `src/features/setup/status.ts` | create | `stableJson`, `sameAnswers`, `sectionStatus`, `hasUnsubmittedChanges` |
| `src/features/setup/checklist.ts` | create | `buildChecklist` |
| `src/features/setup/sections/basics.ts` | create | The Basics section's rules |
| `src/features/setup/images.ts` | create | `IMAGE_TARGETS`, `proportionWarning`, `droppedImages` |
| `src/features/setup/client.ts` | create | Client-safe entry |
| `src/features/setup/db.ts` | create | Token and table reads and writes |
| `src/features/setup/index.ts` | create | Server entry |
| `src/features/setup/preview/HomePreview.tsx` | create | Phone preview of the portal home |
| `src/features/setup/portal/actions.ts` | create | Save, submit, upload (token-gated) |
| `src/features/setup/portal/SetupHomePage.tsx` | create | The checklist page |
| `src/features/setup/portal/SetupStepPage.tsx` | create | Loads a step |
| `src/features/setup/portal/BasicsStep.tsx` | create | The Basics form with autosave and preview |
| `src/features/setup/portal/SetupImageField.tsx` | create | Immediate upload with a proportion warning |
| `src/app/setup/layout.tsx`, `src/app/setup/[token]/page.tsx`, `src/app/setup/[token]/[section]/page.tsx` | create | Thin route shells |
| `src/features/setup/admin/actions.ts` | create | Link create, replace and turn off; Apply |
| `src/features/setup/admin/SetupAdminPage.tsx` | create | Setup area |
| `src/features/setup/admin/SetupReviewPage.tsx` | create | Review a section |
| `src/app/admin/events/[id]/setup/page.tsx`, `.../setup/[section]/page.tsx` | create | Thin route shells |
| `src/components/admin/nav.ts`, `AppSidebar.tsx`, `tests/nav.test.ts` | modify | Setup item and its badge |
| `src/app/admin/events/[id]/layout.tsx`, `src/app/admin/events/(list)/page.tsx` | modify | Waiting counts |
| `tests/setup/*.test.ts` | create | Pure tests |
| `scripts/setup-db-check.mjs`, `package.json` | create/modify | Database check |

---

### Task 1: Migration, `Event.setup_token`, reserved label, spec corrections

**Files:**
- Create: `supabase/migrations/0071_event_setup.sql`
- Modify: `src/lib/types.ts` (the `Event` type, next to `crew_token`)
- Modify: `src/features/domains/hosts.ts:27`
- Modify: `tests/domains/hosts.test.ts`
- Modify: `tests/domains/routing.test.ts:38`
- Modify: `docs/superpowers/specs/2026-10-10-organiser-setup-design.md`

**Interfaces:**
- Produces:
  - the column `events.setup_token text unique`
  - the table `event_setup_sections(event_id, section, answers, submitted, applied, applied_map, rev, submitted_at, applied_at, updated_at)`, with primary key `(event_id, section)`
  - `Event.setup_token: string | null`

- [ ] **Step 1: Check the migration number is free**

Run: `ls supabase/migrations | tail -3`. The last file should be `0070_event_features.sql`. If `0071_*` exists, use the next free number and report it.

- [ ] **Step 2: Write the migration**

```sql
-- D441, D442: the organiser setup link and what organisers submit through it. Adds one column
-- and one table; no existing row or policy changes.

-- D441: one private link per event. Null means the link is off. Unique, like crew_token, so a
-- token alone names one event.
alter table public.events add column setup_token text unique;

-- D442: one row per event and section. `answers` is the organiser's working copy, `submitted`
-- the snapshot taken at Submit, `applied` the snapshot taken at Apply. Status is worked out
-- from the three, never stored. `rev` guards autosave against two people saving at once.
create table public.event_setup_sections (
  event_id     uuid not null references public.events (id) on delete cascade,
  section      text not null check (section in ('basics', 'agenda', 'info')),
  answers      jsonb not null default '{}'::jsonb,
  submitted    jsonb,
  applied      jsonb,
  applied_map  jsonb not null default '{}'::jsonb,
  rev          int not null default 1 check (rev >= 1),
  submitted_at timestamptz,
  applied_at   timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (event_id, section)
);
-- Read and written only by the server with the service role: no policies on purpose.
alter table public.event_setup_sections enable row level security;
```

- [ ] **Step 3: Apply it and verify**

1. Apply the migration with the Supabase MCP `apply_migration` tool. Use project `wfmqwwcolfigjylkgrsv`, name `event_setup`, and the file contents as the query. Load the tool with ToolSearch.
2. Verify with `execute_sql`:

```sql
select column_name from information_schema.columns where table_name = 'events' and column_name = 'setup_token';
select count(*) from public.event_setup_sections;
```

Expected: one row named `setup_token`, and a count of `0`.

- [ ] **Step 4: Add the field to `Event`**

In `src/lib/types.ts`, directly after the line `crew_token: string | null;` in the `Event` type, add:

```ts
  /** D441: the organiser setup link. Null when the link is off. */
  setup_token: string | null;
```

- [ ] **Step 5: Reserve `setup` as a subdomain, and test it**

In `src/features/domains/hosts.ts:27`, add `"setup"` to `RESERVED_LABELS`, after `"scan"`.

In `tests/domains/hosts.test.ts`, find the test that checks reserved labels are refused (search for `reserved`). Add `"setup"` to the labels it loops over, or add an assertion of the same shape for `"setup"`.

In `tests/domains/routing.test.ts:38`, add `"/setup/x"` to the list in "sends every staff and admin path to the main address".

Run: `npx vitest run tests/domains`
Expected: PASS.

- [ ] **Step 6: Correct the spec**

Make these edits in `docs/superpowers/specs/2026-10-10-organiser-setup-design.md`:

1. **Status line:** after the first sentence, add: `Built in two phases: Phase 1 (plan docs/superpowers/plans/2026-10-10-organiser-setup-phase-1.md) is the link, the checklist, Basics with its preview, and the admin review and Apply for Basics; Phase 2 adds the Agenda and Info steps and their Apply functions. Until Phase 2, Agenda and Info show on the checklist as guide cards.`
2. **D441, the "minted the first time an admin opens the event's Setup area" bullet:** replace it with: `- It is created by a **Create setup link** button in the Setup area, not by opening the page: a page view never writes. It can be replaced or turned off there, with the same buttons and confirmations as the crew link.`
3. **D444, the first bullet:** replace "Each catalogue feature's `setup` field lists its items" with "Each catalogue feature has an optional `setup` field listing its items (`SetupItem` in `catalogue.ts`)". Keep the rest of the bullet.
4. **D448, the link card bullet:** replace it with: `- the link card: the link with Copy, Open as organiser, and the Replace link and Turn off link buttons, each with a confirmation (the crew link's pattern)`.

- [ ] **Step 7: Commit**

```bash
git pull --rebase --autostash
git add supabase/migrations/0071_event_setup.sql src/lib/types.ts src/features/domains/hosts.ts tests/domains docs/superpowers/specs/2026-10-10-organiser-setup-design.md
git commit -m "feat(setup): setup_token and event_setup_sections, setup reserved as a subdomain (D441, D442)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The checklist and section status (pure)

**Files:**
- Modify: `src/features/catalogue/catalogue.ts`
- Modify: `tests/catalogue/catalogue.test.ts`
- Create: `src/features/setup/sections.ts`
- Create: `src/features/setup/status.ts`
- Create: `src/features/setup/checklist.ts`
- Test: `tests/setup/status.test.ts`
- Test: `tests/setup/checklist.test.ts`

**Interfaces:**
- Produces, from `@/features/catalogue/client`:
  - `type SetupItem = { key: string; kind: "step" | "card"; title: string; send: readonly string[]; onlyWithRegistration?: boolean }`
  - `Feature.setup?: readonly SetupItem[]`
- Produces, from `src/features/setup/sections.ts`:
  - `SETUP_SECTIONS = ["basics", "agenda", "info"] as const`
  - `type SetupSection`
  - `BUILT_STEPS: readonly SetupSection[] = ["basics"]`
  - `isBuiltStep(s: string): s is SetupSection`
- Produces, from `status.ts`:
  - `stableJson(v: unknown): string`
  - `sameAnswers(a: unknown, b: unknown): boolean`
  - `type SectionStatus = "not_started" | "draft" | "submitted" | "applied"`
  - `type StatusRow = { answers: unknown; submitted: unknown; applied: unknown }`
  - `sectionStatus(row: StatusRow | null): SectionStatus`
  - `hasUnsubmittedChanges(row: StatusRow | null): boolean`
  - `STATUS_LABELS: Record<SectionStatus, string>`
- Produces, from `checklist.ts`:
  - `type ChecklistEntry = { key: string; kind: "step" | "card"; title: string; send: readonly string[] }`
  - `buildChecklist(input: { features: FeatureSet; custom: readonly { id: string; name: string; description: string | null }[]; selfRegistration: boolean; builtSteps: readonly string[] }): ChecklistEntry[]`

- [ ] **Step 1: Write the failing tests**

`tests/setup/status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hasUnsubmittedChanges, sameAnswers, sectionStatus, stableJson } from "@/features/setup/status";

describe("stableJson / sameAnswers", () => {
  it("ignores key order", () => {
    expect(stableJson({ b: 1, a: { d: 2, c: 3 } })).toBe(stableJson({ a: { c: 3, d: 2 }, b: 1 }));
    expect(sameAnswers({ a: "x", b: "y" }, { b: "y", a: "x" })).toBe(true);
  });
  it("tells different values apart, and null from an object", () => {
    expect(sameAnswers({ a: "x" }, { a: "y" })).toBe(false);
    expect(sameAnswers(null, {})).toBe(false);
    expect(sameAnswers(null, null)).toBe(true);
  });
});

describe("sectionStatus (D442)", () => {
  it("is Not started with no row", () => {
    expect(sectionStatus(null)).toBe("not_started");
  });
  it("is Draft before the first submit", () => {
    expect(sectionStatus({ answers: { a: "1" }, submitted: null, applied: null })).toBe("draft");
  });
  it("is Submitted while the submit differs from what was applied", () => {
    expect(sectionStatus({ answers: { a: "1" }, submitted: { a: "1" }, applied: null })).toBe("submitted");
    expect(sectionStatus({ answers: { a: "2" }, submitted: { a: "2" }, applied: { a: "1" } })).toBe("submitted");
  });
  it("is Applied when the submit was applied, even with unsubmitted changes", () => {
    const row = { answers: { a: "3" }, submitted: { a: "2" }, applied: { a: "2" } };
    expect(sectionStatus(row)).toBe("applied");
    expect(hasUnsubmittedChanges(row)).toBe(true);
  });
  it("has no unsubmitted changes before a first submit or when answers match it", () => {
    expect(hasUnsubmittedChanges({ answers: { a: "1" }, submitted: null, applied: null })).toBe(false);
    expect(hasUnsubmittedChanges({ answers: { a: "1" }, submitted: { a: "1" }, applied: null })).toBe(false);
    expect(hasUnsubmittedChanges(null)).toBe(false);
  });
});
```

`tests/setup/checklist.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildChecklist } from "@/features/setup/checklist";
import { featureSet } from "@/features/catalogue/features";

const base = { custom: [], selfRegistration: false, builtSteps: ["basics"] as const };

describe("buildChecklist (D444)", () => {
  it("lists only base items for an event with no add-ons, steps first", () => {
    const list = buildChecklist({ ...base, features: featureSet([], 0) });
    expect(list.map((e) => e.key)).toEqual(["basics", "agenda", "info", "attendee-list", "check-in"]);
    expect(list[0]).toMatchObject({ kind: "step", title: "Event basics" });
  });
  it("shows a step not built yet as a card", () => {
    const list = buildChecklist({ ...base, features: featureSet([], 0) });
    expect(list.find((e) => e.key === "agenda")?.kind).toBe("card");
    expect(list.find((e) => e.key === "basics")?.kind).toBe("step");
  });
  it("adds a card per add-on the event has", () => {
    const keys = buildChecklist({ ...base, features: featureSet(["lucky_draw", "whatsapp"], 0) }).map((e) => e.key);
    expect(keys).toContain("lucky-draw");
    expect(keys).toContain("whatsapp");
    expect(keys).not.toContain("live-games");
  });
  it("shows registration questions only when attendees sign up themselves", () => {
    expect(buildChecklist({ ...base, features: featureSet([], 0) }).map((e) => e.key)).not.toContain("registration");
    expect(buildChecklist({ ...base, selfRegistration: true, features: featureSet([], 0) }).map((e) => e.key)).toContain("registration");
  });
  it("adds one card per custom module, with its description", () => {
    const list = buildChecklist({ ...base, features: featureSet([], 1), custom: [{ id: "m1", name: "Photo mosaic wall", description: "Live wall of guest photos" }] });
    expect(list.find((e) => e.key === "custom:m1")).toMatchObject({ kind: "card", title: "Custom: Photo mosaic wall", send: ["Live wall of guest photos"] });
  });
  it("gives a custom module with no description a default line", () => {
    const list = buildChecklist({ ...base, features: featureSet([], 1), custom: [{ id: "m1", name: "Mosaic", description: null }] });
    expect(list.find((e) => e.key === "custom:m1")?.send).toEqual(["We'll be in touch about what we need for this."]);
  });
});
```

Add to `tests/catalogue/catalogue.test.ts`, inside `describe("the catalogue (D433)", …)`:

```ts
  it("gives every setup item a unique key, and only sections as steps (D444)", () => {
    const items = (Object.values(FEATURES) as { setup?: readonly { key: string; kind: string }[] }[]).flatMap((f) => f.setup ?? []);
    const keys = items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(items.filter((i) => i.kind === "step").map((i) => i.key).sort()).toEqual(["agenda", "basics", "info"]);
  });
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `npx vitest run tests/setup tests/catalogue`
Expected: FAIL. The setup modules don't exist yet, and the catalogue test finds no setup items.

- [ ] **Step 3: Add `SetupItem` and the items to the catalogue**

In `src/features/catalogue/catalogue.ts`:

1. Below the `Unlocks` type, add:

```ts
/**
 * One line of the organiser's setup checklist (D444). A `step` is a section the organiser fills
 * in (its key is the section: basics, agenda, info); a `card` says what to send.
 */
export type SetupItem = {
  key: string;
  kind: "step" | "card";
  title: string;
  /** What to send, a line each; for a step, what it covers. */
  send: readonly string[];
  /** Only for events where attendees sign up themselves. */
  onlyWithRegistration?: boolean;
};
```

2. Change the `Feature` type to:

```ts
export type Feature = { name: string; summary: string; tier: "base" | "addon"; unlocks: Unlocks; setup?: readonly SetupItem[] };
```

3. Change the two helpers so each takes an optional setup list:

```ts
const base = (name: string, summary: string, setup?: readonly SetupItem[]): Feature => ({ name, summary, tier: "base", unlocks: {}, setup });
const addon = (name: string, summary: string, unlocks: Unlocks = {}, setup?: readonly SetupItem[]): Feature => ({ name, summary, tier: "addon", unlocks, setup });
```

4. Give these `FEATURES` entries their setup lists. Keep every name, summary and unlock exactly as it is; only add the last argument.

```ts
  portal: base("Attendee portal and personal links", "Each attendee's own link to the portal.", [
    { key: "basics", kind: "step", title: "Event basics", send: ["Name, dates and venue", "Brand colour, logo and banner", "Committee numbers"] },
  ]),
  attendees: base("Attendee list", "Import and manage who is coming.", [
    { key: "attendee-list", kind: "card", title: "Attendee list", send: ["One Excel file (.xlsx), one person per row, headings in row 1", "Name (required), Mobile, Email and Category; Table No, team and breakout columns if you use them", "Malaysian mobile numbers. We flag any that can't receive WhatsApp"] },
  ]),
  agenda: base("Agenda", "Days and sessions.", [
    { key: "agenda", kind: "step", title: "Agenda", send: ["Each day's date and an optional name", "Sessions: start time and title; end time, location, description and a photo if you have them", "Breakout rounds and their room codes"] },
  ]),
  info: base("Event info and floor plan", "Info tabs and the venue plan.", [
    { key: "info", kind: "step", title: "Event info and floor plan", send: ["The info tabs you want, e.g. Getting there, Dress code, FAQ, with their text and images", "The floor plan, at least 2000 px wide"] },
  ]),
  registration: base("Self-registration", "A sign-up form with your own questions.", [
    { key: "registration", kind: "card", title: "Registration questions", onlyWithRegistration: true, send: ["Opening and closing dates, and a short welcome paragraph", "Up to 10 questions beyond name, email, mobile and department"] },
  ]),
  check_in: base("Check-in", "Crew scanning, checkpoints and badges.", [
    { key: "check-in", kind: "card", title: "Check-in points", send: ["Each checkpoint you need, e.g. Day 1 registration or Gala dinner, and the day it applies to"] },
  ]),
  whatsapp: addon("WhatsApp messaging", "Send portal links and announcements by WhatsApp.", { nav: ["whatsapp"] }, [
    { key: "whatsapp", kind: "card", title: "WhatsApp messages", send: ["The wording of each message, written as a notice or confirmation, not an advert", "When each goes out, and to whom", "Meta approves every message first, so send these early"] },
  ]),
  booking: addon("Session booking", "Time slots attendees book, with capacity.", { activityKinds: ["booking"] }, [
    { key: "booking", kind: "card", title: "Session booking", send: ["Days, opening hours, slot length and breaks", "Places per slot, the location, and how many bookings each person may make"] },
  ]),
  engagement: addon("Engagement activities", "Stamp passport, submissions and scored challenges.", { activityKinds: ["submission", "passport"] }, [
    { key: "activities", kind: "card", title: "Activities", send: ["A name, a short description and a 1600 × 800 cover image for each", "Passport: booth names and locations, stamps needed and the reward message", "Submissions: the questions, open and close dates, entries per person and team rules"] },
  ]),
  live_games: addon("Live games", "Tap race and Last one standing on the LED.", { gameKinds: ["tap_race", "survival"] }, [
    { key: "live-games", kind: "card", title: "Live games", send: ["Tap race length, 10 to 60 seconds", "Quiz: up to 50 questions, 2 to 4 options each, with the right answer", "An LED background if you want your own, 1920 × 1080"] },
  ]),
  lucky_draw: addon("Lucky draw", "Slot machine, wheel, mosaic and card round.", { gameKinds: ["draw"] }, [
    { key: "lucky-draw", kind: "card", title: "Lucky draw", send: ["Prizes: name, quantity and a photo, about 1040 × 560 (transparent PNG is best)", "Who can win: a check-in point, and any categories to leave out", "The draw style: slot machine, wheel, mosaic or card round (card back 1000 × 1400)"] },
  ]),
  custom_domain: addon("Custom domain", "The event on its own address.", { settingsTabs: ["address"] }, [
    { key: "custom-domain", kind: "card", title: "Custom domain", send: ["The address you want, e.g. event.yourcompany.com", "Who manages your DNS, so we can send them the records to add"] },
  ]),
  slido: addon("Slido embedding", "Slido inside the portal. Until the embed is built, use a link tile.", {}, [
    { key: "slido", kind: "card", title: "Slido", send: ["Your Slido event link"] },
  ]),
```

`announcements`, `exports`, `groups`, `breakouts` and `custom` keep no setup list. Custom modules get their cards from `buildChecklist`.

- [ ] **Step 4: Write `sections.ts`**

```ts
/** The sections an organiser fills in on the setup page (D442). */
export const SETUP_SECTIONS = ["basics", "agenda", "info"] as const;
export type SetupSection = (typeof SETUP_SECTIONS)[number];

/** The steps this release can fill in. The rest show on the checklist as guide cards until built (D452). */
export const BUILT_STEPS: readonly SetupSection[] = ["basics"];

export function isBuiltStep(s: string): s is SetupSection {
  return (BUILT_STEPS as readonly string[]).includes(s);
}
```

- [ ] **Step 5: Write `status.ts`**

```ts
/** JSON with object keys sorted, so two snapshots compare by content, not by key order. */
export function stableJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(",")}}`;
}

export function sameAnswers(a: unknown, b: unknown): boolean {
  return stableJson(a) === stableJson(b);
}

export type SectionStatus = "not_started" | "draft" | "submitted" | "applied";
export type StatusRow = { answers: unknown; submitted: unknown; applied: unknown };

export const STATUS_LABELS: Record<SectionStatus, string> = {
  not_started: "Not started",
  draft: "Draft",
  submitted: "Submitted",
  applied: "Applied",
};

/**
 * Worked out from the three snapshots, never stored (D442): a stored status would be one more
 * thing to keep in step with the snapshots, and the snapshots already say it.
 */
export function sectionStatus(row: StatusRow | null): SectionStatus {
  if (!row) return "not_started";
  if (row.submitted === null || row.submitted === undefined) return "draft";
  return sameAnswers(row.submitted, row.applied) ? "applied" : "submitted";
}

/** Edits since the last submit: shown to the organiser as "You have changes you haven't submitted". */
export function hasUnsubmittedChanges(row: StatusRow | null): boolean {
  if (!row || row.submitted === null || row.submitted === undefined) return false;
  return !sameAnswers(row.answers, row.submitted);
}
```

- [ ] **Step 6: Write `checklist.ts`**

```ts
import { ADDON_KEYS, BASE_KEYS, FEATURES, type SetupItem } from "@/features/catalogue/catalogue";
import { has, type FeatureSet } from "@/features/catalogue/features";

const CUSTOM_DEFAULT_LINE = "We'll be in touch about what we need for this.";

export type ChecklistEntry = { key: string; kind: "step" | "card"; title: string; send: readonly string[] };

/**
 * Everything this event needs from its organiser (D444). Steps come first, in
 * catalogue order (basics, agenda, info). Then the guide cards in catalogue order, base features
 * before add-ons, then one card per custom module. A step not built yet is shown as a card but
 * still sorts with the steps, so the checklist is complete from the first release (D452).
 */
export function buildChecklist(input: {
  features: FeatureSet;
  custom: readonly { id: string; name: string; description: string | null }[];
  selfRegistration: boolean;
  builtSteps: readonly string[];
}): ChecklistEntry[] {
  const { features, custom, selfRegistration, builtSteps } = input;
  const items: (SetupItem & { order: number })[] = [];
  for (const key of [...BASE_KEYS, ...ADDON_KEYS]) {
    if (!has(features, key)) continue;
    for (const item of FEATURES[key].setup ?? []) {
      if (item.onlyWithRegistration && !selfRegistration) continue;
      items.push({ ...item, order: items.length });
    }
  }
  for (const m of custom) {
    items.push({
      key: `custom:${m.id}`, kind: "card", title: `Custom: ${m.name}`,
      send: [m.description?.trim() || CUSTOM_DEFAULT_LINE], order: items.length,
    });
  }
  return items
    .sort((a, b) => Number(a.kind !== "step") - Number(b.kind !== "step") || a.order - b.order)
    .map((i) => ({
      key: i.key,
      kind: i.kind === "step" && builtSteps.includes(i.key) ? "step" : "card",
      title: i.title,
      send: i.send,
    }));
}
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/setup tests/catalogue`
Expected: PASS.

The order test expects `["basics", "agenda", "info", "attendee-list", "check-in"]` for an event with no add-ons:
- Steps come first in catalogue order (`basics`, `agenda`, `info`), then the cards in catalogue order (`attendee-list`, `check-in`).
- If it fails, fix the code, not the test.

- [ ] **Step 8: Typecheck, lint, full test run**

Run: `npx tsc --noEmit && npx eslint src/features tests/setup tests/catalogue && npm test`
Expected: no errors, all tests pass.

- [ ] **Step 9: Commit**

```bash
git pull --rebase --autostash
git add src/features/catalogue/catalogue.ts tests/catalogue/catalogue.test.ts src/features/setup/sections.ts src/features/setup/status.ts src/features/setup/checklist.ts tests/setup
git commit -m "feat(setup): the checklist from the catalogue and derived status (D442, D444)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The Basics section and image helpers (pure)

**Files:**
- Create: `src/features/setup/sections/basics.ts`
- Create: `src/features/setup/images.ts`
- Test: `tests/setup/basics.test.ts`
- Test: `tests/setup/images.test.ts`

**Interfaces:**
- Produces, from `sections/basics.ts`:
  - **Constants and types:**
    - `BASICS_FIELDS` (readonly tuple)
    - `type BasicsField`
    - `type BasicsAnswers = Record<BasicsField, string>`
    - `BASICS_LABELS: Record<BasicsField, string>`
    - `BASICS_REQUIRED: readonly BasicsField[]`
    - `BASICS_IMAGE_FIELDS = ["logo_url", "banner_url"] as const`
    - `DEFAULT_COLOUR = "#F97316"`
    - `type BasicsSource = Pick<Event, "name" | "starts_on" | "ends_on" | "venue_name" | "primary_color" | "logo_url" | "banner_url" | "committee_alert_numbers">`
    - `type EventPatch`
    - `type BasicsChange = { field: BasicsField; label: string; before: string; after: string; image: boolean; infoOnly: boolean }`
  - **Functions:**
    - `blankBasics(): BasicsAnswers`
    - `basicsFromEvent(ev: BasicsSource): BasicsAnswers`
    - `sanitizeBasics(raw: unknown): BasicsAnswers`
    - `basicsErrors(a: BasicsAnswers): Partial<Record<BasicsField, string>>`
    - `basicsMissing(a: BasicsAnswers): BasicsField[]`
    - `basicsComplete(a: BasicsAnswers): boolean`
    - `basicsChanges(submitted: BasicsAnswers, live: BasicsAnswers): BasicsChange[]`
    - `basicsPatch(submitted: BasicsAnswers, applied: BasicsAnswers | null): EventPatch`
- Produces, from `images.ts`:
  - `type ImageTarget = { ratio: number; minWidth: number; best: string; note: string; label: string }`
  - `IMAGE_TARGETS: { logo: ImageTarget; banner: ImageTarget }`
  - `proportionWarning(width: number, height: number, target: ImageTarget): string | null`
  - `droppedImages(before: Record<string, string> | null, after: Record<string, string>, fields: readonly string[], keep: readonly (string | null | undefined)[]): string[]`

- [ ] **Step 1: Write the failing tests**

`tests/setup/basics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  basicsChanges, basicsComplete, basicsErrors, basicsFromEvent, basicsMissing, basicsPatch, blankBasics, sanitizeBasics,
  type BasicsAnswers,
} from "@/features/setup/sections/basics";

const full = (over: Partial<BasicsAnswers> = {}): BasicsAnswers => ({
  ...blankBasics(),
  name: "KOM 2027", starts_on: "2027-01-10", ends_on: "2027-01-11", venue_name: "Sunway Pyramid",
  primary_color: "#0EA5E9",
  ...over,
});

const event = {
  name: "Old name", starts_on: "2026-12-01", ends_on: "2026-12-02", venue_name: "Old venue", primary_color: "#F97316",
  logo_url: "https://x.supabase.co/storage/v1/object/public/event-media/o/e/logo-1.png", banner_url: null,
  committee_alert_numbers: ["60123456789"],
};

describe("blank, fromEvent, sanitize", () => {
  it("starts blank with the default colour", () => {
    expect(blankBasics()).toMatchObject({ name: "", primary_color: "#F97316", committee_numbers: "" });
  });
  it("prefills from the live event, committee numbers as +60 lines", () => {
    expect(basicsFromEvent(event)).toMatchObject({ name: "Old name", logo_url: event.logo_url, banner_url: "", committee_numbers: "+60123456789" });
  });
  it("keeps only known fields, as strings, cut to their limits", () => {
    const s = sanitizeBasics({ name: "x".repeat(500), evil: "1", starts_on: 20270110, notes: null });
    expect(s.name).toHaveLength(120);
    expect("evil" in s).toBe(false);
    expect(s.starts_on).toBe("20270110");
    expect(s.notes).toBe("");
  });
  it("reads anything that isn't an object as blank", () => {
    expect(sanitizeBasics("nope")).toEqual(blankBasics());
  });
});

describe("errors, missing, complete", () => {
  it("passes a complete answer set", () => {
    expect(basicsErrors(full())).toEqual({});
    expect(basicsMissing(full())).toEqual([]);
    expect(basicsComplete(full())).toBe(true);
  });
  it("lists the required fields still empty", () => {
    expect(basicsMissing(blankBasics())).toEqual(["name", "starts_on", "ends_on", "venue_name"]);
    expect(basicsComplete(blankBasics())).toBe(false);
  });
  it("refuses a last day before the first", () => {
    expect(basicsErrors(full({ ends_on: "2027-01-09" })).ends_on).toBe("The last day can't be before the first.");
  });
  it("refuses a date that isn't a date", () => {
    expect(basicsErrors(full({ starts_on: "2027-02-30" })).starts_on).toBe("Pick a date.");
  });
  it("refuses a colour that isn't #RRGGBB", () => {
    expect(basicsErrors(full({ primary_color: "orange" })).primary_color).toBe("Use a colour like #F97316.");
  });
  it("names committee numbers it can't read", () => {
    expect(basicsErrors(full({ committee_numbers: "012-345 6789\nabc" })).committee_numbers).toBe("These can't be read as Malaysian mobile numbers: abc");
  });
  it("is not complete while there is an error", () => {
    expect(basicsComplete(full({ primary_color: "red" }))).toBe(false);
  });
});

describe("basicsChanges (D449)", () => {
  it("lists only fields that differ from the live event, trimmed", () => {
    const live = basicsFromEvent(event);
    const changes = basicsChanges({ ...live, name: "New name ", venue_name: "Old venue" }, live);
    expect(changes.map((c) => c.field)).toEqual(["name"]);
    expect(changes[0]).toMatchObject({ label: "Event name", before: "Old name", after: "New name", image: false, infoOnly: false });
  });
  it("marks images, and lists categories and notes as info only when filled", () => {
    const live = basicsFromEvent(event);
    const changes = basicsChanges({ ...live, banner_url: "https://b", categories: "Staff\nVIP", notes: "" }, live);
    expect(changes.find((c) => c.field === "banner_url")?.image).toBe(true);
    expect(changes.find((c) => c.field === "categories")?.infoOnly).toBe(true);
    expect(changes.some((c) => c.field === "notes")).toBe(false);
  });
});

describe("basicsPatch (D450)", () => {
  it("first apply writes every filled field and leaves blank optional fields alone", () => {
    const patch = basicsPatch(full(), null);
    expect(patch).toEqual({
      name: "KOM 2027", starts_on: "2027-01-10", ends_on: "2027-01-11", venue_name: "Sunway Pyramid",
      primary_color: "#0EA5E9",
    });
    expect("logo_url" in patch).toBe(false);
  });
  it("a later apply writes only what the organiser changed since the last apply", () => {
    const applied = full();
    expect(basicsPatch(full({ venue_name: "MITEC" }), applied)).toEqual({ venue_name: "MITEC" });
  });
  it("writes nothing when nothing changed, so an admin's own edit survives", () => {
    expect(basicsPatch(full(), full())).toEqual({});
  });
  it("clearing an optional field writes null", () => {
    expect(basicsPatch(full({ banner_url: "" }), full({ banner_url: "https://b" }))).toEqual({ banner_url: null });
  });
  it("turns committee lines into the stored +60-less list", () => {
    expect(basicsPatch(full({ committee_numbers: "012-345 6789\n+60 19 876 5432\n012-345 6789" }), null).committee_alert_numbers)
      .toEqual(["60123456789", "60198765432"]);
  });
  it("never writes categories or notes", () => {
    const patch = basicsPatch(full({ categories: "Staff", notes: "Hi" }), null);
    expect("categories" in patch || "notes" in patch).toBe(false);
  });
});
```

`tests/setup/images.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { IMAGE_TARGETS, droppedImages, proportionWarning } from "@/features/setup/images";

describe("proportionWarning (D447)", () => {
  it("is quiet for the recommended size", () => {
    expect(proportionWarning(2400, 800, IMAGE_TARGETS.banner)).toBeNull();
    expect(proportionWarning(512, 512, IMAGE_TARGETS.logo)).toBeNull();
  });
  it("tolerates a few percent off the ratio", () => {
    expect(proportionWarning(2400, 820, IMAGE_TARGETS.banner)).toBeNull();
  });
  it("warns when the banner will be cropped", () => {
    expect(proportionWarning(1600, 900, IMAGE_TARGETS.banner)).toBe("This image is 1600 × 900. Banners are cropped to 3:1, so some of it will be cut off. Best: 2400 × 800.");
  });
  it("warns when an image is too small to stay sharp", () => {
    expect(proportionWarning(900, 300, IMAGE_TARGETS.banner)).toBe("This image is only 900 px wide, so it may look blurry. Best: 2400 × 800.");
  });
});

describe("droppedImages (D447)", () => {
  const f = ["logo_url", "banner_url"] as const;
  it("returns an image the new answers no longer use", () => {
    expect(droppedImages({ logo_url: "a", banner_url: "b" }, { logo_url: "c", banner_url: "b" }, f, [])).toEqual(["a"]);
  });
  it("keeps an image that is submitted, applied or live", () => {
    expect(droppedImages({ logo_url: "a", banner_url: "b" }, { logo_url: "", banner_url: "" }, f, ["a", null])).toEqual(["b"]);
  });
  it("drops nothing on a first save", () => {
    expect(droppedImages(null, { logo_url: "a", banner_url: "" }, f, [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `npx vitest run tests/setup/basics.test.ts tests/setup/images.test.ts`
Expected: FAIL, because the modules don't exist yet.

- [ ] **Step 3: Write `sections/basics.ts`**

```ts
import type { Event } from "@/lib/types";
import { toE164My } from "@/lib/phone";

export const BASICS_FIELDS = [
  "name", "starts_on", "ends_on", "venue_name", "primary_color", "logo_url", "banner_url",
  "categories", "committee_numbers", "notes",
] as const;
export type BasicsField = (typeof BASICS_FIELDS)[number];
export type BasicsAnswers = Record<BasicsField, string>;

export const DEFAULT_COLOUR = "#F97316";
export const BASICS_IMAGE_FIELDS = ["logo_url", "banner_url"] as const;
export const BASICS_REQUIRED: readonly BasicsField[] = ["name", "starts_on", "ends_on", "venue_name"];

const LIMITS: Record<BasicsField, number> = {
  name: 120, starts_on: 10, ends_on: 10, venue_name: 160, primary_color: 7, logo_url: 600, banner_url: 600,
  categories: 1000, committee_numbers: 600, notes: 2000,
};

export const BASICS_LABELS: Record<BasicsField, string> = {
  name: "Event name", starts_on: "First day", ends_on: "Last day", venue_name: "Venue",
  primary_color: "Brand colour", logo_url: "Logo", banner_url: "Home banner",
  categories: "Attendee categories",
  committee_numbers: "Committee WhatsApp numbers", notes: "Notes",
};

/** Shown in review but never written to the event (D450). */
const INFO_ONLY: readonly BasicsField[] = ["categories", "notes"];

export type BasicsSource = Pick<Event,
  "name" | "starts_on" | "ends_on" | "venue_name" | "primary_color" | "logo_url" | "banner_url" | "committee_alert_numbers">;

export function blankBasics(): BasicsAnswers {
  const a = Object.fromEntries(BASICS_FIELDS.map((f) => [f, ""])) as BasicsAnswers;
  a.primary_color = DEFAULT_COLOUR;
  return a;
}

/** The live event as answers: what an organiser opening Basics for the first time starts from. */
export function basicsFromEvent(ev: BasicsSource): BasicsAnswers {
  return {
    ...blankBasics(),
    name: ev.name ?? "", starts_on: ev.starts_on ?? "", ends_on: ev.ends_on ?? "", venue_name: ev.venue_name ?? "",
    primary_color: ev.primary_color || DEFAULT_COLOUR, logo_url: ev.logo_url ?? "", banner_url: ev.banner_url ?? "",
    committee_numbers: (ev.committee_alert_numbers ?? []).map((n) => `+${n}`).join("\n"),
  };
}

/**
 * Whatever the browser sent, as answers: known fields only, each a string cut to its limit.
 * Not trimmed - this runs on every autosave, mid-typing.
 */
export function sanitizeBasics(raw: unknown): BasicsAnswers {
  const out = blankBasics();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const o = raw as Record<string, unknown>;
  for (const f of BASICS_FIELDS) {
    const v = o[f];
    if (v === null || v === undefined) continue;
    if (typeof v === "string" || typeof v === "number") out[f] = String(v).slice(0, LIMITS[f]);
  }
  return out;
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const lines = (s: string) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

export function basicsErrors(a: BasicsAnswers): Partial<Record<BasicsField, string>> {
  const e: Partial<Record<BasicsField, string>> = {};
  const t = (f: BasicsField) => a[f].trim();
  if (t("starts_on") && !isDate(t("starts_on"))) e.starts_on = "Pick a date.";
  if (t("ends_on") && !isDate(t("ends_on"))) e.ends_on = "Pick a date.";
  if (!e.starts_on && !e.ends_on && t("starts_on") && t("ends_on") && t("ends_on") < t("starts_on")) e.ends_on = "The last day can't be before the first.";
  if (!/^#[0-9a-fA-F]{6}$/.test(t("primary_color"))) e.primary_color = "Use a colour like #F97316.";
  const bad = lines(a.committee_numbers).filter((l) => !toE164My(l));
  if (bad.length) e.committee_numbers = `These can't be read as Malaysian mobile numbers: ${bad.join(", ")}`;
  return e;
}

export function basicsMissing(a: BasicsAnswers): BasicsField[] {
  return BASICS_REQUIRED.filter((f) => !a[f].trim());
}

export function basicsComplete(a: BasicsAnswers): boolean {
  return basicsMissing(a).length === 0 && Object.keys(basicsErrors(a)).length === 0;
}

export type BasicsChange = { field: BasicsField; label: string; before: string; after: string; image: boolean; infoOnly: boolean };

/** What Apply would change on the live event, plus the info-only fields the organiser filled (D449). */
export function basicsChanges(submitted: BasicsAnswers, live: BasicsAnswers): BasicsChange[] {
  return BASICS_FIELDS.flatMap((f) => {
    const after = submitted[f].trim();
    const infoOnly = INFO_ONLY.includes(f);
    if (infoOnly ? !after : after === live[f].trim()) return [];
    return [{ field: f, label: BASICS_LABELS[f], before: infoOnly ? "" : live[f].trim(), after, image: (BASICS_IMAGE_FIELDS as readonly string[]).includes(f), infoOnly }];
  });
}

export type EventPatch = Partial<{
  name: string; starts_on: string | null; ends_on: string | null; venue_name: string | null; primary_color: string;
  logo_url: string | null; banner_url: string | null;
  committee_alert_numbers: string[];
}>;

/**
 * Only what the organiser changed since the last Apply (D450). The baseline is the last applied
 * snapshot, or blank answers before the first Apply - so a blank optional field never wipes a
 * live value, and a field the admin edited in admin keeps the admin's value until the organiser
 * changes that field again.
 */
export function basicsPatch(submitted: BasicsAnswers, applied: BasicsAnswers | null): EventPatch {
  const baseline = applied ?? blankBasics();
  const changed = (f: BasicsField) => submitted[f].trim() !== baseline[f].trim();
  const val = (f: BasicsField) => submitted[f].trim() || null;
  const p: EventPatch = {};
  if (changed("name") && val("name")) p.name = val("name")!;
  if (changed("starts_on")) p.starts_on = val("starts_on");
  if (changed("ends_on")) p.ends_on = val("ends_on");
  if (changed("venue_name")) p.venue_name = val("venue_name");
  if (changed("primary_color") && val("primary_color")) p.primary_color = val("primary_color")!;
  if (changed("logo_url")) p.logo_url = val("logo_url");
  if (changed("banner_url")) p.banner_url = val("banner_url");
  if (changed("committee_numbers")) {
    p.committee_alert_numbers = [...new Set(lines(submitted.committee_numbers).map((l) => toE164My(l)).filter((n): n is string => !!n))];
  }
  return p;
}
```

- [ ] **Step 4: Write `images.ts`**

```ts
export type ImageTarget = { ratio: number; minWidth: number; best: string; note: string; label: string };

/** The image guide's sizes for the images Basics takes (D447). */
export const IMAGE_TARGETS = {
  logo: { ratio: 1, minWidth: 256, best: "512 × 512", note: "Square, transparent PNG. Shown in the header and on the LED screen.", label: "Logos" },
  banner: { ratio: 3, minWidth: 1200, best: "2400 × 800", note: "3:1, keep text away from the edges.", label: "Banners" },
} as const satisfies Record<string, ImageTarget>;

const RATIO_SLACK = 0.05;

/** A sentence when an image will be cropped or look blurry; null when it's fine. Never blocks. */
export function proportionWarning(width: number, height: number, target: ImageTarget): string | null {
  if (!width || !height) return null;
  if (Math.abs(width / height - target.ratio) / target.ratio > RATIO_SLACK) {
    const shape = target.ratio === 1 ? "square" : `${target.ratio}:1`;
    return `This image is ${width} × ${height}. ${target.label} are cropped to ${shape}, so some of it will be cut off. Best: ${target.best}.`;
  }
  if (width < target.minWidth) return `This image is only ${width} px wide, so it may look blurry. Best: ${target.best}.`;
  return null;
}

/**
 * Images the previous answers used that the new answers don't, minus any still needed (the
 * submitted or applied snapshot, or the live event). Those are safe to delete from storage.
 */
export function droppedImages(
  before: Record<string, string> | null,
  after: Record<string, string>,
  fields: readonly string[],
  keep: readonly (string | null | undefined)[],
): string[] {
  if (!before) return [];
  const kept = new Set(keep.filter((k): k is string => !!k));
  const now = new Set(fields.map((f) => after[f]).filter(Boolean));
  return fields.map((f) => before[f]).filter((u): u is string => !!u && !now.has(u) && !kept.has(u));
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/setup`
Expected: PASS.

If an expected string fails, check the code against the test's exact copy. The tests are the specification.

- [ ] **Step 6: Typecheck, lint, test**

Run: `npx tsc --noEmit && npx eslint src/features/setup tests/setup && npm test`
Expected: no errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git pull --rebase --autostash
git add src/features/setup/sections/basics.ts src/features/setup/images.ts tests/setup/basics.test.ts tests/setup/images.test.ts
git commit -m "feat(setup): the Basics section's rules, change summary and change-only apply (D443, D447, D449, D450)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Database module and the feature's entries

**Files:**
- Create: `src/features/setup/db.ts`
- Create: `src/features/setup/client.ts`
- Create: `src/features/setup/index.ts`

**Interfaces:**
- Consumes: `generateToken` from `@/lib/tokens`, `updateEvent` and `getEvent` from `@/lib/db/events`, `serviceClient`, `sectionStatus`
- Produces, from `@/features/setup`:
  - `type SetupRow = { event_id: string; section: SetupSection; answers: unknown; submitted: unknown; applied: unknown; applied_map: Record<string, string>; rev: number; submitted_at: string | null; applied_at: string | null; updated_at: string }`
  - `getEventBySetupToken(token: string): Promise<Event | null>`
  - `rotateSetupToken(eventId: string): Promise<string>` and `clearSetupToken(eventId: string): Promise<void>`
  - `listSetupRows(eventId: string): Promise<SetupRow[]>` and `getSetupRow(eventId: string, section: SetupSection): Promise<SetupRow | null>`
  - `saveAnswers(eventId: string, section: SetupSection, expectedRev: number, answers: unknown): Promise<number | null>`. Returns the new rev, or null when stale. `expectedRev` 0 means "no row yet".
  - `submitAnswers(eventId: string, section: SetupSection, expectedRev: number): Promise<number | null>`
  - `markApplied(eventId: string, section: SetupSection, expectedRev: number, submitted: unknown): Promise<boolean>`
  - `waitingCounts(eventIds: readonly string[]): Promise<Record<string, number>>`
  - Everything from `./client`.

- [ ] **Step 1: Write `db.ts`**

```ts
import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { getEvent, updateEvent } from "@/lib/db/events";
import { generateToken } from "@/lib/tokens";
import type { Event } from "@/lib/types";
import type { SetupSection } from "./sections";
import { sectionStatus } from "./status";

export type SetupRow = {
  event_id: string; section: SetupSection; answers: unknown; submitted: unknown; applied: unknown;
  applied_map: Record<string, string>; rev: number; submitted_at: string | null; applied_at: string | null; updated_at: string;
};

const table = () => serviceClient().from("event_setup_sections");
const now = () => new Date().toISOString();

/** The event behind a setup link (D441). Looked up by token alone; the token is unique across events. */
export async function getEventBySetupToken(token: string): Promise<Event | null> {
  const { data } = await serviceClient().from("events").select("id").eq("setup_token", token).maybeSingle();
  return data ? getEvent(data.id) : null;
}

/** Mints or replaces the link. Replacing IS the revocation: every copy of the old link stops working (D108, D441). */
export async function rotateSetupToken(eventId: string): Promise<string> {
  const setup_token = generateToken();
  await updateEvent(eventId, { setup_token });
  return setup_token;
}

export async function clearSetupToken(eventId: string): Promise<void> {
  await updateEvent(eventId, { setup_token: null });
}

export async function listSetupRows(eventId: string): Promise<SetupRow[]> {
  const { data, error } = await table().select("*").eq("event_id", eventId);
  if (error) throw error;
  return data as SetupRow[];
}

export async function getSetupRow(eventId: string, section: SetupSection): Promise<SetupRow | null> {
  const { data, error } = await table().select("*").eq("event_id", eventId).eq("section", section).maybeSingle();
  if (error) throw error;
  return (data as SetupRow | null) ?? null;
}

/**
 * Saves the working copy if nobody else saved since `expectedRev` (D446). The first save inserts
 * the row; a second first-save racing it hits the primary key and is refused as stale.
 */
export async function saveAnswers(eventId: string, section: SetupSection, expectedRev: number, answers: unknown): Promise<number | null> {
  if (expectedRev === 0) {
    const { error } = await table().insert({ event_id: eventId, section, answers, rev: 1 });
    if (error) {
      if (error.code === "23505") return null;
      throw error;
    }
    return 1;
  }
  const { data, error } = await table()
    .update({ answers, rev: expectedRev + 1, updated_at: now() })
    .eq("event_id", eventId).eq("section", section).eq("rev", expectedRev)
    .select("rev");
  if (error) throw error;
  return data?.[0]?.rev ?? null;
}

/** Snapshots the working copy as submitted, under the same rev guard. */
export async function submitAnswers(eventId: string, section: SetupSection, expectedRev: number): Promise<number | null> {
  const row = await getSetupRow(eventId, section);
  if (!row || row.rev !== expectedRev) return null;
  const { data, error } = await table()
    .update({ submitted: row.answers, submitted_at: now(), rev: expectedRev + 1, updated_at: now() })
    .eq("event_id", eventId).eq("section", section).eq("rev", expectedRev)
    .select("rev");
  if (error) throw error;
  return data?.[0]?.rev ?? null;
}

/**
 * Records what was applied (D451). Guarded by rev, so a submit that lands while the admin is
 * applying is not marked applied without being reviewed. Does not bump rev: applying changes
 * nothing the organiser is editing.
 */
export async function markApplied(eventId: string, section: SetupSection, expectedRev: number, submitted: unknown): Promise<boolean> {
  const { data, error } = await table()
    .update({ applied: submitted, applied_at: now() })
    .eq("event_id", eventId).eq("section", section).eq("rev", expectedRev)
    .select("rev");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** Sections waiting for review, per event: the admin badge (D448). One query for any number of events. */
export async function waitingCounts(eventIds: readonly string[]): Promise<Record<string, number>> {
  if (eventIds.length === 0) return {};
  const { data, error } = await table().select("event_id, answers, submitted, applied").in("event_id", eventIds as string[]);
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const r of data as { event_id: string; answers: unknown; submitted: unknown; applied: unknown }[]) {
    if (sectionStatus(r) === "submitted") out[r.event_id] = (out[r.event_id] ?? 0) + 1;
  }
  return out;
}
```

- [ ] **Step 2: Write `client.ts` and `index.ts`**

`client.ts`:

```ts
/**
 * The setup feature's client-safe entry (D402, D403): the pure rules. `index.ts` re-exports this
 * and adds the reads, writes and screens. Task 5 adds the preview here.
 */
export * from "./sections";
export * from "./status";
export * from "./checklist";
export * from "./images";
export * from "./sections/basics";
```

`index.ts`:

```ts
/** The setup feature's server entry (D402): everything in `client.ts`, plus its reads and writes. */
export * from "./client";
export * from "./db";
```

- [ ] **Step 3: Typecheck, lint, test**

Run: `npx tsc --noEmit && npx eslint src/features/setup && npm test`
Expected: no errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git pull --rebase --autostash
git add src/features/setup/db.ts src/features/setup/client.ts src/features/setup/index.ts
git commit -m "feat(setup): the setup link and section rows, with the rev guard and waiting counts (D441, D442, D446)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The phone preview

**Files:**
- Create: `src/features/setup/preview/HomePreview.tsx`
- Modify: `src/features/setup/client.ts`

**Interfaces:**
- Consumes: `PortalHeader` from `@/components/portal/PortalHeader`, `LauncherGrid`, `launcherItems` and `sectionIcons` from `@/lib/launcher`, and `brandStyle`. None of them is server-only.
- Produces:
  - `type PreviewBasics = Pick<BasicsAnswers, "name" | "starts_on" | "ends_on" | "venue_name" | "primary_color" | "logo_url" | "banner_url">`
  - `type PreviewSlot = "header" | "logo" | "banner" | "colour"`
  - `HomePreview({ basics, focused, onSlot, compact }: { basics: PreviewBasics; focused?: PreviewSlot | null; onSlot?: (slot: PreviewSlot) => void; compact?: boolean })`

- [ ] **Step 1: Write `HomePreview.tsx`**

```tsx
"use client";
import { PortalHeader } from "@/components/portal/PortalHeader";
import { LauncherGrid } from "@/components/portal/LauncherGrid";
import { launcherItems, sectionIcons } from "@/lib/launcher";
import { brandStyle } from "@/lib/brand";
import type { BasicsAnswers } from "../sections/basics";

export type PreviewBasics = Pick<BasicsAnswers, "name" | "starts_on" | "ends_on" | "venue_name" | "primary_color" | "logo_url" | "banner_url">;
export type PreviewSlot = "header" | "logo" | "banner" | "colour";

const SLOT_LABELS: Record<PreviewSlot, string> = {
  header: "Name, dates and venue", logo: "Logo · 512 × 512", banner: "Banner · 2400 × 800", colour: "Brand colour",
};

// The launcher as every attendee's home starts: the portal's own sections, no tiles. Built once.
const ITEMS = launcherItems({ basePath: "", personal: true, hasInfo: true, tiles: [], icons: sectionIcons(null) });

/**
 * The portal home as attendees will see it, drawn from the organiser's draft (D445). The real
 * header and launcher components, so the preview can't drift from the portal. Empty image
 * slots show the image guide's dashed placeholder with the size to send. Focusing a field
 * outlines its slot; clicking a slot asks for its field.
 */
export function HomePreview({ basics, focused = null, onSlot, compact = false }: {
  basics: PreviewBasics;
  focused?: PreviewSlot | null;
  onSlot?: (slot: PreviewSlot) => void;
  compact?: boolean;
}) {
  const event = {
    name: basics.name.trim() || "Your event name",
    logo_url: basics.logo_url || null,
    starts_on: basics.starts_on || null,
    ends_on: basics.ends_on || null,
    venue_name: basics.venue_name.trim() || null,
  };
  const slot = (name: PreviewSlot, children: React.ReactNode, className = "") => (
    <div
      data-setup-slot={name}
      // stopPropagation: the logo slot sits inside the header slot; a click names the innermost.
      onClick={onSlot ? (e) => { e.stopPropagation(); onSlot(name); } : undefined}
      className={`relative rounded-xl transition-shadow ${onSlot ? "cursor-pointer" : ""} ${focused === name ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""} ${className}`}
    >
      {children}
      {focused === name && (
        <span className="pointer-events-none absolute -top-2.5 left-2 z-10 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
          {SLOT_LABELS[name]}
        </span>
      )}
    </div>
  );

  return (
    <div className={`mx-auto rounded-[2.25rem] bg-zinc-900 p-2.5 shadow-xl ${compact ? "w-[240px]" : "w-[300px]"}`} aria-label="Preview of your portal home" role="img">
      <div className={`overflow-y-auto rounded-[1.75rem] bg-background ${compact ? "h-[460px]" : "h-[600px]"}`} style={brandStyle(basics.primary_color) as React.CSSProperties}>
        {slot("header", (
          <div className="relative">
            <PortalHeader event={event} />
            {/* The logo's own slot, over the mark. Without a logo attendees see initials; the
                dashed outline says a logo goes here. */}
            <div className="absolute left-4 top-4 size-10">
              {slot("logo", <div className={`size-10 rounded-[10px] ${basics.logo_url ? "" : "border-2 border-dashed border-orange-400"}`} />)}
            </div>
          </div>
        ))}
        <div className="flex flex-col gap-4 p-4">
          {slot("banner", basics.banner_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={basics.banner_url} alt="" className="aspect-[3/1] w-full rounded-xl object-cover" />
          ) : (
            <div className="flex aspect-[3/1] w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-orange-400 bg-orange-50 text-center text-[11px] font-extrabold text-orange-800">
              Banner<span className="font-semibold">2400 × 800 · optional</span>
            </div>
          ))}
          {slot("colour", <div inert><LauncherGrid items={ITEMS} layout="row" /></div>)}
          <div aria-hidden className="flex flex-col gap-2">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="h-14 rounded-xl border border-border bg-card" />
            <div className="h-14 rounded-xl border border-border bg-card" />
          </div>
        </div>
      </div>
    </div>
  );
}
```

Before writing it, check three things:

1. `LauncherGrid` and `PortalHeader` export exactly these names. Check `src/components/portal/`.
2. `launcherItems` accepts the input shown. Its required fields are `basePath`, `personal`, `hasInfo` and `tiles`.
3. React 19 types accept the `inert` prop on a `div`. If the typecheck refuses `inert`, use `inert={true}`. If it still refuses, wrap the launcher in a `div` with `className="pointer-events-none"` and `aria-hidden`, and say so in your report.

- [ ] **Step 2: Export it from `client.ts`**

Append to `src/features/setup/client.ts`:

```ts
export { HomePreview, type PreviewBasics, type PreviewSlot } from "./preview/HomePreview";
```

- [ ] **Step 3: Typecheck, lint, test**

Run: `npx tsc --noEmit && npx eslint src/features/setup && npm test`
Expected: no errors, all tests pass. The pure tests import the defining files directly, not `client.ts`, so the TSX file doesn't load in node.

- [ ] **Step 4: Commit**

```bash
git pull --rebase --autostash
git add src/features/setup/preview src/features/setup/client.ts
git commit -m "feat(setup): the portal home preview with teaching placeholders and focus slots (D445)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The organiser page: actions, home, the Basics step

**Files:**
- Create: `src/features/setup/portal/actions.ts`
- Create: `src/features/setup/portal/SetupImageField.tsx`
- Create: `src/features/setup/portal/BasicsStep.tsx`
- Create: `src/features/setup/portal/SetupHomePage.tsx`
- Create: `src/features/setup/portal/SetupStepPage.tsx`
- Modify: `src/features/setup/index.ts`
- Create: `src/app/setup/layout.tsx`
- Create: `src/app/setup/[token]/page.tsx`
- Create: `src/app/setup/[token]/[section]/page.tsx`

**Interfaces:**
- Consumes:
  - from Task 4: `getEventBySetupToken`, `getSetupRow`, `listSetupRows`, `saveAnswers`, `submitAnswers`
  - from Task 3: `sanitizeBasics`, `basicsFromEvent`, `basicsComplete`, `basicsMissing`, `basicsErrors`, `BASICS_LABELS`, `BASICS_IMAGE_FIELDS`, `droppedImages`, `IMAGE_TARGETS`, `proportionWarning`
  - from Task 2: `buildChecklist`, `sectionStatus`, `hasUnsubmittedChanges`, `isBuiltStep`, `BUILT_STEPS`, `STATUS_LABELS`
  - from `@/features/catalogue`: `eventFeatures`
  - from Task 5: `HomePreview`
  - also `isEventMediaFor`, `acceptImage` and `IMAGE_ACCEPT` (`@/lib/storage`); `uploadEventImage` and `deleteEventImage` (`@/lib/db/media`); `shouldShrink` and `shrinkImage` (`@/lib/shrink-image`); `isValidToken`; `allow`; `brandStyle`; `formatDateRange` (`@/lib/text`)
- Produces:
  - `type SetupResult = { ok: true; rev: number } | { ok: false; message: string; stale?: boolean }`
  - `saveSectionAction(token: string, section: string, expectedRev: number, raw: unknown): Promise<SetupResult>`
  - `submitSectionAction(token: string, section: string, expectedRev: number): Promise<SetupResult>`
  - `uploadSetupImageAction(token: string, kind: string, fd: FormData): Promise<{ ok: true; url: string } | { ok: false; message: string }>`
  - `SetupHomePage` and `SetupStepPage`: server components taking `{ params }`

- [ ] **Step 1: Write the actions**

`src/features/setup/portal/actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import type { Event } from "@/lib/types";
import { isValidToken } from "@/lib/tokens";
import { allow } from "@/lib/ratelimit";
import { isEventMediaFor } from "@/lib/storage";
import { deleteEventImage, uploadEventImage } from "@/lib/db/media";
import { getEventBySetupToken, getSetupRow, saveAnswers, submitAnswers } from "../db";
import { isBuiltStep } from "../sections";
import { BASICS_IMAGE_FIELDS, basicsComplete, basicsMissing, BASICS_LABELS, sanitizeBasics, type BasicsAnswers } from "../sections/basics";
import { droppedImages } from "../images";

export type SetupResult = { ok: true; rev: number } | { ok: false; message: string; stale?: boolean };

const GONE = "This setup link no longer works. Ask your project contact for a new one.";
const STALE: SetupResult = { ok: false, message: "Someone else updated this section — reload to see their changes.", stale: true };
const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });
const KIND_OF: Record<(typeof BASICS_IMAGE_FIELDS)[number], "logo" | "banner"> = { logo_url: "logo", banner_url: "banner" };

/**
 * The token is the only authority (D441): a server action is a public POST, so every call
 * re-checks the link and takes the event from it, never from the caller.
 */
async function load(token: string): Promise<Event | null> {
  if (typeof token !== "string" || !isValidToken(token)) return null;
  if (!allow(`setup:${token}`, 240, 60_000)) return null;
  return getEventBySetupToken(token);
}

/** An image URL counts only if it is this event's own upload of the right kind; anything else is dropped. */
function ownImages(ev: Event, a: BasicsAnswers): BasicsAnswers {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const out = { ...a };
  for (const f of BASICS_IMAGE_FIELDS) {
    if (out[f] && !isEventMediaFor(out[f], supabaseUrl, ev.org_id, ev.id, [KIND_OF[f]])) out[f] = "";
  }
  return out;
}

export async function saveSectionAction(token: string, section: string, expectedRev: number, raw: unknown): Promise<SetupResult> {
  const ev = await load(token);
  if (!ev) return fail(GONE);
  if (!isBuiltStep(section) || section !== "basics") return fail("That section can't be filled in here yet.");
  if (!Number.isInteger(expectedRev) || expectedRev < 0) return STALE;
  const answers = ownImages(ev, sanitizeBasics(raw));
  const prev = await getSetupRow(ev.id, section);
  const rev = await saveAnswers(ev.id, section, expectedRev, answers);
  if (rev === null) return STALE;
  // D447: a replaced draft image goes once the new answers are saved; never one that was
  // submitted, applied, or is live on the event.
  const before = prev ? sanitizeBasics(prev.answers) : null;
  const keep = [
    ...BASICS_IMAGE_FIELDS.map((f) => (prev?.submitted ? sanitizeBasics(prev.submitted)[f] : null)),
    ...BASICS_IMAGE_FIELDS.map((f) => (prev?.applied ? sanitizeBasics(prev.applied)[f] : null)),
    ev.logo_url, ev.banner_url,
  ];
  for (const url of droppedImages(before, answers, BASICS_IMAGE_FIELDS, keep)) await deleteEventImage(url);
  return { ok: true, rev };
}

export async function submitSectionAction(token: string, section: string, expectedRev: number): Promise<SetupResult> {
  const ev = await load(token);
  if (!ev) return fail(GONE);
  if (!isBuiltStep(section) || section !== "basics") return fail("That section can't be submitted here yet.");
  const row = await getSetupRow(ev.id, section);
  if (!row || row.rev !== expectedRev) return STALE;
  const answers = sanitizeBasics(row.answers);
  if (!basicsComplete(answers)) {
    const missing = basicsMissing(answers).map((f) => BASICS_LABELS[f]);
    return fail(missing.length ? `Fill in ${missing.join(", ")} first.` : "Fix the fields marked in red first.");
  }
  const rev = await submitAnswers(ev.id, section, expectedRev);
  if (rev === null) return STALE;
  // The admin's badge reads this event's rows.
  revalidatePath(`/admin/events/${ev.id}`, "layout");
  return { ok: true, rev };
}

/** One image per call: Vercel refuses request bodies over 4.5 MB (storage.ts). */
export async function uploadSetupImageAction(token: string, kind: string, fd: FormData): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const ev = await load(token);
  if (!ev) return fail(GONE);
  if (kind !== "logo" && kind !== "banner") return fail("That image can't be uploaded here.");
  const file = fd.get("image");
  if (!(file instanceof File) || file.size === 0) return fail("Choose an image first.");
  try {
    return { ok: true, url: await uploadEventImage({ orgId: ev.org_id, eventId: ev.id, kind, file }) };
  } catch (e) {
    return fail((e as Error).message);
  }
}
```

- [ ] **Step 2: Write `SetupImageField.tsx`**

```tsx
"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { acceptImage, IMAGE_ACCEPT } from "@/lib/storage";
import { shouldShrink, shrinkImage } from "@/lib/shrink-image";
import { IMAGE_TARGETS, proportionWarning } from "../images";
import { uploadSetupImageAction } from "./actions";

/**
 * An image the organiser uploads straight away (D447): the URL lands in the answers, which
 * autosave. Shows what attendees will get, and warns - never blocks - when the shape is off.
 */
export function SetupImageField({ token, kind, label, value, onChange, onFocus }: {
  token: string;
  kind: "logo" | "banner";
  label: string;
  value: string;
  onChange: (url: string) => void;
  onFocus: () => void;
}) {
  const target = IMAGE_TARGETS[kind];
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!value) { setWarning(null); return; }
    const img = new Image();
    img.onload = () => setWarning(proportionWarning(img.naturalWidth, img.naturalHeight, target));
    img.src = value;
  }, [value, target]);

  const pick = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      acceptImage(file);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    start(async () => {
      const ready = file.type !== "image/svg+xml" && shouldShrink(file) ? await shrinkImage(file) : file;
      const fd = new FormData();
      fd.set("image", ready);
      const r = await uploadSetupImageAction(token, kind, fd);
      if (r.ok) onChange(r.url);
      else setError(r.message);
    });
  };

  return (
    <div className="flex flex-col gap-2" onFocus={onFocus}>
      <span className="text-sm font-bold">{label}</span>
      <div className="flex items-center gap-3">
        <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted ${kind === "logo" ? "size-16" : "aspect-[3/1] h-16"}`}>
          {value
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={value} alt="" className={`size-full ${kind === "logo" ? "object-contain" : "object-cover"}`} />
            : <span className="text-[10px] text-muted-foreground">{target.best}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pending} data-setup-field={kind === "logo" ? "logo_url" : "banner_url"} onClick={() => input.current?.click()}>
            {pending ? "Uploading…" : value ? "Replace" : "Choose image"}
          </Button>
          {value && !pending && <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>Remove</Button>}
        </div>
        <input ref={input} type="file" accept={IMAGE_ACCEPT} className="sr-only" tabIndex={-1} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      <p className="text-xs text-muted-foreground">Best: {target.best}. {target.note} PNG, JPEG, WebP or SVG, up to 4 MB.</p>
      {warning && <p className="text-xs font-semibold text-amber-700">{warning}</p>}
      {error && <p role="alert" className="text-xs font-semibold text-destructive">{error}</p>}
    </div>
  );
}
```

Before writing it, check that `Button` takes `size="sm"` and `variant="ghost"` (`src/components/ui/button.tsx`), and that `IMAGE_ACCEPT` is exported from `src/lib/storage.ts`. If either differs, adapt minimally and report it.

- [ ] **Step 3: Write `BasicsStep.tsx`**

```tsx
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { basicsComplete, basicsErrors, BASICS_LABELS, type BasicsAnswers, type BasicsField } from "../sections/basics";
import { sameAnswers, STATUS_LABELS, type SectionStatus } from "../status";
import { HomePreview, type PreviewSlot } from "../preview/HomePreview";
import { SetupImageField } from "./SetupImageField";
import { saveSectionAction, submitSectionAction } from "./actions";

const SLOT_OF: Partial<Record<BasicsField, PreviewSlot>> = {
  name: "header", starts_on: "header", ends_on: "header", venue_name: "header",
  primary_color: "colour", logo_url: "logo", banner_url: "banner",
};
const FIELD_OF: Record<PreviewSlot, BasicsField> = { header: "name", logo: "logo_url", banner: "banner_url", colour: "primary_color" };
const AUTOSAVE_MS = 1000;

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Event basics (D446): short groups with a line of help each, saved about a second after the
 * last change, next to the portal home it shapes (D445). Saves run one at a time, each carrying
 * the rev the last one returned, so a second person's save is refused instead of overwritten.
 */
export function BasicsStep({ token, initial, initialRev, initialStatus, initialUnsubmitted }: {
  token: string;
  initial: BasicsAnswers;
  initialRev: number;
  initialStatus: SectionStatus;
  initialUnsubmitted: boolean;
}) {
  const [a, setA] = useState(initial);
  const [focused, setFocused] = useState<PreviewSlot | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState(initialStatus);
  const [unsubmitted, setUnsubmitted] = useState(initialUnsubmitted);
  const [submitting, setSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const rev = useRef(initialRev);
  const latest = useRef(initial);
  // What the server holds. Comparing against it (not "is this the first render") means opening
  // the page never saves, even when React runs effects twice in development.
  const saved = useRef(initial);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const blocked = useRef(false);

  const errors = basicsErrors(a);
  const complete = basicsComplete(a);
  const nothingNew = (status === "submitted" || status === "applied") && !unsubmitted;

  const runSave = useCallback(() => {
    chain.current = chain.current.then(async () => {
      if (blocked.current || sameAnswers(latest.current, saved.current)) return;
      const sending = latest.current;
      setSave("saving");
      const r = await saveSectionAction(token, "basics", rev.current, sending);
      if (r.ok) {
        rev.current = r.rev;
        saved.current = sending;
        setSave("saved");
        setMessage(null);
        if (status === "submitted" || status === "applied") setUnsubmitted(true);
      } else {
        setSave("error");
        setMessage(r.message);
        if (r.stale) blocked.current = true;
      }
    });
    return chain.current;
  }, [token, status]);

  useEffect(() => {
    latest.current = a;
    if (sameAnswers(a, saved.current)) return;
    const t = setTimeout(() => { void runSave(); }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [a, runSave]);

  const set = (f: BasicsField) => (v: string) => setA((p) => ({ ...p, [f]: v }));
  const focus = (f: BasicsField) => () => setFocused(SLOT_OF[f] ?? null);
  const jump = (slot: PreviewSlot) => {
    setFocused(slot);
    document.querySelector<HTMLElement>(`[data-setup-field="${FIELD_OF[slot]}"]`)?.focus();
  };

  const submit = async () => {
    setSubmitting(true);
    latest.current = a;
    await runSave();
    await chain.current;
    if (blocked.current) { setSubmitting(false); return; }
    const r = await submitSectionAction(token, "basics", rev.current);
    setSubmitting(false);
    if (r.ok) { rev.current = r.rev; setStatus("submitted"); setUnsubmitted(false); setMessage("Submitted. We'll review it and let you know if anything needs changing."); }
    else setMessage(r.message);
  };

  const text = (f: BasicsField, type = "text", placeholder = "") => (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold">{BASICS_LABELS[f]}</span>
      <Input type={type} value={a[f]} placeholder={placeholder} data-setup-field={f} onFocus={focus(f)} onChange={(e) => set(f)(e.target.value)}
        aria-invalid={errors[f] ? true : undefined} className={type === "date" ? "w-44" : ""} />
      {errors[f] && <span className="text-xs font-semibold text-destructive">{errors[f]}</span>}
    </label>
  );
  const area = (f: BasicsField, placeholder: string, rows = 3) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold">{BASICS_LABELS[f]}</span>
      <Textarea value={a[f]} rows={rows} placeholder={placeholder} data-setup-field={f} onFocus={focus(f)} onChange={(e) => set(f)(e.target.value)}
        aria-invalid={errors[f] ? true : undefined} />
      {errors[f] && <span className="text-xs font-semibold text-destructive">{errors[f]}</span>}
    </label>
  );
  const group = (title: string, help: string, children: React.ReactNode) => (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="font-extrabold">{title}</h2>
        <p className="text-sm text-muted-foreground">{help}</p>
      </div>
      {children}
    </section>
  );

  const preview = <HomePreview basics={a} focused={focused} onSlot={jump} />;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/setup/${token}`} className="text-sm font-bold text-primary">‹ Checklist</Link>
          <h1 className="text-2xl font-extrabold">Event basics</h1>
          <Badge variant={status === "applied" ? "success" : status === "submitted" ? "warning" : "secondary"}>{STATUS_LABELS[status]}</Badge>
          <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
            {save === "saving" ? "Saving…" : save === "saved" ? "Saved" : ""}
          </span>
        </div>
        {status === "applied" && !unsubmitted && <p className="text-sm text-muted-foreground">Live in your portal. You can still change anything here and submit again.</p>}
        {unsubmitted && status !== "draft" && <p className="text-sm font-semibold text-amber-700">You have changes you haven&apos;t submitted.</p>}

        {group("Your event", "Shown at the top of the portal and in WhatsApp messages. All times are Malaysia time.", (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">{text("name", "text", "Ecopia Kick-Off Meeting 2027")}</div>
            {text("starts_on", "date")}
            {text("ends_on", "date")}
            <div className="sm:col-span-2">{text("venue_name", "text", "Sunway Pyramid Convention Centre")}</div>
          </div>
        ))}

        {group("How it looks", "Send each image at about twice its on-screen size so it stays sharp on phones.", (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-bold">{BASICS_LABELS.primary_color}</span>
              <span className="flex items-center gap-2">
                <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(a.primary_color) ? a.primary_color : "#F97316"} onFocus={focus("primary_color")}
                  onChange={(e) => set("primary_color")(e.target.value)} className="h-9 w-14 cursor-pointer rounded-md border border-input" aria-label="Pick a colour" />
                <Input value={a.primary_color} data-setup-field="primary_color" onFocus={focus("primary_color")} onChange={(e) => set("primary_color")(e.target.value)} className="w-28 font-mono" />
              </span>
              {errors.primary_color && <span className="text-xs font-semibold text-destructive">{errors.primary_color}</span>}
            </label>
            <SetupImageField token={token} kind="logo" label={BASICS_LABELS.logo_url} value={a.logo_url} onChange={set("logo_url")} onFocus={focus("logo_url")} />
            <SetupImageField token={token} kind="banner" label={BASICS_LABELS.banner_url} value={a.banner_url} onChange={set("banner_url")} onFocus={focus("banner_url")} />
          </div>
        ))}

        {group("People", "Categories decide who sees what. The committee numbers get WhatsApp alerts when attendees ask to change a booking.", (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">{area("categories", "One per line, e.g.\nStaff\nVendor\nVIP")}</div>
            <div className="sm:col-span-2">{area("committee_numbers", "One per line, e.g.\n012-345 6789")}</div>
          </div>
        ))}

        {group("Anything else", "Anything we should know that isn't asked above.", area("notes", "", 4))}

        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-border bg-background/95 py-3 backdrop-blur">
          <Button type="button" onClick={submit} disabled={!complete || nothingNew || submitting || save === "saving"}>
            {submitting ? "Submitting…" : status === "draft" || status === "not_started" ? "Submit section" : "Submit changes"}
          </Button>
          <Button type="button" variant="outline" className="lg:hidden" onClick={() => setShowPreview(true)}>Preview</Button>
          {message && <span role="status" className={`text-sm ${save === "error" ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{message}</span>}
          {!complete && !message && <span className="text-sm text-muted-foreground">Fill in the required fields to submit.</span>}
        </div>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-6 flex flex-col gap-2">
          <p className="text-center text-xs font-bold uppercase tracking-wide text-muted-foreground">Your portal, as attendees see it</p>
          {preview}
        </div>
      </aside>

      {showPreview && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/95 p-4 lg:hidden" role="dialog" aria-label="Preview">
          {preview}
          <Button type="button" variant="outline" onClick={() => setShowPreview(false)}>Close preview</Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write `SetupStepPage.tsx` and `SetupHomePage.tsx`**

`SetupStepPage.tsx`:

```tsx
import { notFound } from "next/navigation";
import { isValidToken } from "@/lib/tokens";
import { brandStyle } from "@/lib/brand";
import { getEventBySetupToken, getSetupRow } from "../db";
import { isBuiltStep } from "../sections";
import { basicsFromEvent, sanitizeBasics } from "../sections/basics";
import { hasUnsubmittedChanges, sectionStatus } from "../status";
import { BasicsStep } from "./BasicsStep";

export async function SetupStepPage({ params }: { params: Promise<{ token: string; section: string }> }) {
  const { token, section } = await params;
  if (!isValidToken(token) || !isBuiltStep(section)) notFound();
  const ev = await getEventBySetupToken(token);
  if (!ev) notFound();
  const row = await getSetupRow(ev.id, section);
  // First visit starts from the live event, so the organiser sees and corrects what's there.
  const initial = row ? sanitizeBasics(row.answers) : basicsFromEvent(ev);
  return (
    <main className="mx-auto w-full max-w-6xl p-4 md:p-8" style={brandStyle(ev.primary_color) as React.CSSProperties}>
      <BasicsStep token={token} initial={initial} initialRev={row?.rev ?? 0} initialStatus={sectionStatus(row)} initialUnsubmitted={hasUnsubmittedChanges(row)} />
    </main>
  );
}
```

`SetupHomePage.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { isValidToken } from "@/lib/tokens";
import { brandStyle } from "@/lib/brand";
import { formatDateRange } from "@/lib/text";
import { Badge } from "@/components/ui/badge";
import { Mark } from "@/components/portal/PortalHeader";
import { eventFeatures } from "@/features/catalogue";
import { getEventBySetupToken, listSetupRows } from "../db";
import { BUILT_STEPS } from "../sections";
import { buildChecklist } from "../checklist";
import { sectionStatus, STATUS_LABELS, type SectionStatus } from "../status";
import { basicsFromEvent, sanitizeBasics } from "../sections/basics";
import { HomePreview } from "../preview/HomePreview";

const STATUS_VARIANT: Record<SectionStatus, "secondary" | "warning" | "success"> = {
  not_started: "secondary", draft: "secondary", submitted: "warning", applied: "success",
};

/**
 * The organiser's one place (D444): everything the event needs. Steps open
 * a form; cards say what to send. A small preview shows the portal as submitted so far.
 */
export async function SetupHomePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isValidToken(token)) notFound();
  const ev = await getEventBySetupToken(token);
  if (!ev) notFound();
  const [rows, features] = await Promise.all([listSetupRows(ev.id), eventFeatures(ev.id)]);
  const list = buildChecklist({
    features, custom: features.custom,
    selfRegistration: ev.registration_open || ev.registration_questions.length > 0, builtSteps: BUILT_STEPS,
  });
  const rowOf = (key: string) => rows.find((r) => r.section === key) ?? null;
  const steps = list.filter((e) => e.kind === "step");
  const done = steps.filter((e) => ["submitted", "applied"].includes(sectionStatus(rowOf(e.key)))).length;
  const basicsRow = rowOf("basics");
  const shown = basicsRow ? sanitizeBasics(basicsRow.submitted ?? basicsRow.answers) : basicsFromEvent(ev);

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-8 p-4 md:p-8 lg:grid-cols-[minmax(0,1fr)_260px]" style={brandStyle(ev.primary_color) as React.CSSProperties}>
      <div className="flex flex-col gap-6">
        <header className="flex items-center gap-3">
          <Mark event={ev} />
          <div>
            <h1 className="text-xl font-extrabold">{ev.name}</h1>
            <p className="text-sm text-muted-foreground">Event setup · {[formatDateRange(ev.starts_on, ev.ends_on), ev.venue_name].filter(Boolean).join(" · ")}</p>
          </div>
        </header>
        <p className="text-sm">Everything we need from you for this event. Fill in each section here, or send the items listed to your project contact. Nothing goes to attendees until we&apos;ve reviewed it.</p>
        <p className="text-sm font-bold">{done} of {steps.length} section{steps.length === 1 ? "" : "s"} submitted</p>

        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
          {list.map((e) => {
            if (e.kind === "step") {
              const s = sectionStatus(rowOf(e.key));
              return (
                <li key={e.key}>
                  <Link href={`/setup/${token}/${e.key}`} className="flex items-center gap-3 p-4 hover:bg-muted/50">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-bold">{e.title}</span>
                      <span className="text-xs text-muted-foreground">{e.send.join(" · ")}</span>
                    </span>
                    <Badge variant={STATUS_VARIANT[s]}>{STATUS_LABELS[s]}</Badge>
                  </Link>
                </li>
              );
            }
            return (
              <li key={e.key}>
                <details className="group p-4">
                  <summary className="flex cursor-pointer list-none items-center gap-3">
                    <span className="min-w-0 flex-1 font-bold">{e.title}</span>
                    <span className="text-xs font-bold text-primary group-open:hidden">What to send</span>
                  </summary>
                  <ul className="mt-3 list-disc pl-5 text-sm">
                    {e.send.map((line) => <li key={line}>{line}</li>)}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">Send these to your project contact.</p>
                </details>
              </li>
            );
          })}
        </ul>
      </div>
      <aside className="hidden lg:block">
        <div className="sticky top-6 flex flex-col gap-2">
          <p className="text-center text-xs font-bold uppercase tracking-wide text-muted-foreground">So far</p>
          <HomePreview basics={shown} compact />
        </div>
      </aside>
    </main>
  );
}
```

`Mark` takes a header-event projection. Passing `ev` to a server-rendered `Mark` is fine: `Mark` is not a client component, so nothing is serialised. `HomePreview` is a client component, and it gets only `shown`, which is a `BasicsAnswers` with no tokens.
- [ ] **Step 5: Add exports and the routes**

Append to `src/features/setup/index.ts`:

```ts
export { SetupHomePage } from "./portal/SetupHomePage";
export { SetupStepPage } from "./portal/SetupStepPage";
```

`src/app/setup/layout.tsx`:

```tsx
import type { Metadata } from "next";

// A private working page: never in a search index (D441).
export const metadata: Metadata = { title: "Event setup", robots: { index: false, follow: false } };

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-muted/30">{children}</div>;
}
```

`src/app/setup/[token]/page.tsx`:

```tsx
import { SetupHomePage } from "@/features/setup";

export const dynamic = "force-dynamic";

export default function Page(props: { params: Promise<{ token: string }> }) {
  return <SetupHomePage {...props} />;
}
```

`src/app/setup/[token]/[section]/page.tsx`:

```tsx
import { SetupStepPage } from "@/features/setup";

export const dynamic = "force-dynamic";

export default function Page(props: { params: Promise<{ token: string; section: string }> }) {
  return <SetupStepPage {...props} />;
}
```

Check how `src/app/crew/[token]/page.tsx` declares `params` and `dynamic` in this Next version, and match it.

- [ ] **Step 6: Typecheck, lint, test, build**

Run: `npx tsc --noEmit && npx eslint src && npm test && npm run build`
Expected: no errors, all tests pass, and the build succeeds. The build compiles the client and server split, so it catches server-only modules imported into client files.

- [ ] **Step 7: Commit**

```bash
git pull --rebase --autostash
git add src/features/setup src/app/setup
git commit -m "feat(setup): the organiser page - checklist, Basics with autosave, uploads and the live preview (D441, D444-D447)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Admin Setup area, sidebar badge, events list badge

**Files:**
- Create: `src/features/setup/admin/actions.ts`
- Create: `src/features/setup/admin/SetupAdminPage.tsx`
- Modify: `src/features/setup/index.ts`
- Create: `src/app/admin/events/[id]/setup/page.tsx`
- Modify: `src/components/admin/nav.ts`
- Modify: `src/components/admin/AppSidebar.tsx`
- Modify: `tests/nav.test.ts`
- Modify: `src/app/admin/events/[id]/layout.tsx`
- Modify: `src/app/admin/events/(list)/page.tsx`

**Interfaces:**
- Consumes: `rotateSetupToken`, `clearSetupToken`, `listSetupRows`, `waitingCounts`, `sectionStatus`, `STATUS_LABELS`, `BUILT_STEPS`, `appBaseUrl`, `ShareLink`, `ConfirmButton`, `SubmitButton`
- Produces:
  - `createSetupLinkAction(eventId: string)`
  - `replaceSetupLinkAction(eventId: string)`
  - `turnOffSetupLinkAction(eventId: string)`
  - `setupLink(base: string, token: string): string` in `src/features/setup/sections.ts`, alongside `SETUP_SECTIONS`
  - `groupsFor(ev, hidden = [], badges: { setup?: number } = {})`
  - `Item.badge?: number`

- [ ] **Step 1: Write the failing nav tests**

In `tests/nav.test.ts`:

1. Update the "orders the groups the way the sidebar reads" test. The Event group becomes `["Setup", "WhatsApp", "Settings", "Exports"]`.
2. Append inside the `describe` block:

```ts
  it("puts Setup first under Event, with the waiting count as its badge (D448)", () => {
    const event = groupsFor({ id: "e1", check_in_enabled: true }, [], { setup: 2 }).find((g) => g.title === "Event");
    expect(event?.items[0]).toMatchObject({ href: "/admin/events/e1/setup", label: "Setup", badge: 2 });
  });

  it("shows no badge when nothing is waiting", () => {
    const event = groupsFor({ id: "e1", check_in_enabled: true }).find((g) => g.title === "Event");
    expect(event?.items[0].badge).toBeUndefined();
  });
```

Run: `npx vitest run tests/nav.test.ts`
Expected: FAIL. There is no Setup item yet.

- [ ] **Step 2: Add Setup to the nav and the badge to the sidebar**

`src/components/admin/nav.ts`:

- `Item` gains `badge?: number`.
- The signature becomes `groupsFor(ev, hidden: readonly NavKey[] = [], badges: { setup?: number } = {})`.
- In the Event group, add this as the first item:

```ts
      { href: `${b}/setup`, label: "Setup", icon: "check", ...(badges.setup ? { badge: badges.setup } : {}) },
```

- Add a sentence to the doc comment: "Setup leads Event: it is where the organiser's submissions wait, and its badge counts them (D448)."
- Check `"check"` is an `IconName` in `src/components/ui/icon.tsx`. If it isn't, use `"flag"`.

`src/components/admin/AppSidebar.tsx`:

- The props gain `badges?: { setup?: number }`, and the call becomes `groupsFor(event, hidden, badges)`.
- Inside `SidebarMenuButton`, after the label `<span>`, add:

```tsx
                      {i.badge ? <Badge variant="warning" className="ml-auto">{i.badge}<span className="sr-only"> waiting</span></Badge> : null}
```

`Badge` is already imported there.

Run: `npx vitest run tests/nav.test.ts`
Expected: PASS.

- [ ] **Step 3: Pass the counts from the layout and the events list**

`src/app/admin/events/[id]/layout.tsx`:
- Import `waitingCounts` from `@/features/setup`.
- After `features`, add `const waiting = (await waitingCounts([ev.id]))[ev.id] ?? 0;`
- Pass `badges={{ setup: waiting }}` to `AppSidebar`.

`src/app/admin/events/(list)/page.tsx`:
- Import `waitingCounts` from `@/features/setup`.
- After `counts`, add `const waiting = await waitingCounts(events.map((e) => e.id));`
- In the row's status `div`, wrap the status badge as below so the count sits next to it:

```tsx
                    <span className="flex items-center gap-1.5">
                      <Badge variant={e.status === "live" ? "success" : e.status === "archived" ? "outline" : "secondary"}>{e.status}</Badge>
                      {waiting[e.id] ? <Badge variant="warning">{waiting[e.id]} to review</Badge> : null}
                    </span>
```

- [ ] **Step 4: Write `setupLink` and the admin actions**

Append to `src/features/setup/sections.ts`:

```ts
/** The organiser's link, always on the main address like the crew link (D441). */
export function setupLink(base: string, token: string): string {
  return `${base.replace(/\/+$/, "")}/setup/${token}`;
}
```

`src/features/setup/admin/actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { flashPath } from "@/lib/flash";
import { clearSetupToken, rotateSetupToken } from "../db";

const setupPath = (eventId: string) => `/admin/events/${eventId}/setup`;

async function event(eventId: string) {
  const { orgId } = await requireAdmin();
  return requireEvent(eventId, orgId);
}

export async function createSetupLinkAction(eventId: string) {
  const ev = await event(eventId);
  await rotateSetupToken(ev.id);
  revalidatePath(setupPath(ev.id));
  redirect(flashPath(setupPath(ev.id), "Setup link ready. Send it to the organiser."));
}

/** Replacing is the revocation (D108, D441): every copy of the old link stops working. */
export async function replaceSetupLinkAction(eventId: string) {
  const ev = await event(eventId);
  await rotateSetupToken(ev.id);
  revalidatePath(setupPath(ev.id));
  redirect(flashPath(setupPath(ev.id), "New setup link ready. The old one has stopped working."));
}

export async function turnOffSetupLinkAction(eventId: string) {
  const ev = await event(eventId);
  await clearSetupToken(ev.id);
  revalidatePath(setupPath(ev.id));
  redirect(flashPath(setupPath(ev.id), "Setup link turned off. What the organiser sent is kept."));
}
```

- [ ] **Step 5: Write `SetupAdminPage.tsx`**

```tsx
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { appBaseUrl } from "@/lib/links";
import { shortDateTime } from "@/lib/text";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ShareLink } from "@/components/admin/ShareLink";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSetupRows } from "../db";
import { BUILT_STEPS, setupLink } from "../sections";
import { sectionStatus, STATUS_LABELS, type SectionStatus } from "../status";
import { createSetupLinkAction, replaceSetupLinkAction, turnOffSetupLinkAction } from "./actions";

const TITLES: Record<string, string> = { basics: "Event basics", agenda: "Agenda", info: "Event info and floor plan" };
const STATUS_VARIANT: Record<SectionStatus, "secondary" | "warning" | "success"> = {
  not_started: "secondary", draft: "secondary", submitted: "warning", applied: "success",
};

export async function SetupAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const rows = await listSetupRows(ev.id);
  const url = ev.setup_token ? setupLink(appBaseUrl(), ev.setup_token) : null;

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader title="Setup" subtitle="What the organiser sends, waiting for your review before it goes live." />

      <Card>
        <CardHeader>
          <CardTitle>Organiser link</CardTitle>
          <CardDescription>One private link for the organiser&apos;s team: their checklist and the sections they fill in. No login. Nothing they submit changes the event until you apply it.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {url ? (
            <>
              <ShareLink label="Setup" url={url} />
              <div className="flex flex-wrap gap-2">
                <a href={url} target="_blank" rel="noopener" className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm font-semibold hover:bg-muted">Open as organiser</a>
                <form action={replaceSetupLinkAction.bind(null, ev.id)}>
                  <ConfirmButton message="Replace the setup link? The old one stops working immediately. What the organiser sent is kept.">Replace link</ConfirmButton>
                </form>
                <form action={turnOffSetupLinkAction.bind(null, ev.id)}>
                  <ConfirmButton message="Turn off the setup link? The organiser can't open it until you create a new one. What they sent is kept.">Turn off link</ConfirmButton>
                </form>
              </div>
            </>
          ) : (
            <form action={createSetupLinkAction.bind(null, ev.id)}><SubmitButton>Create setup link</SubmitButton></form>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden pb-0">
        <CardHeader>
          <CardTitle>Sections</CardTitle>
          <CardDescription>Open a submitted section to see what would change, then apply it. Agenda and Info arrive in the next release; until then the organiser sees them as checklist cards.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <ul className="divide-y divide-border border-t border-border">
            {BUILT_STEPS.map((section) => {
              const row = rows.find((r) => r.section === section) ?? null;
              const s = sectionStatus(row);
              return (
                <li key={section}>
                  <Link href={`/admin/events/${ev.id}/setup/${section}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/50">
                    <span className="min-w-0 flex-1 text-sm font-bold">{TITLES[section]}</span>
                    <span className="text-xs text-muted-foreground">{row?.submitted_at ? `Submitted ${shortDateTime(row.submitted_at)}` : "Not submitted"}</span>
                    <span className="text-xs text-muted-foreground">{row?.applied_at ? `Applied ${shortDateTime(row.applied_at)}` : ""}</span>
                    <Badge variant={STATUS_VARIANT[s]}>{STATUS_LABELS[s]}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
```

Append to `src/features/setup/index.ts`:

```ts
export { SetupAdminPage } from "./admin/SetupAdminPage";
```

`src/app/admin/events/[id]/setup/page.tsx`:

```tsx
import { SetupAdminPage } from "@/features/setup";

export const metadata = { title: "Setup" };

export default function Page(props: { params: Promise<{ id: string }> }) {
  return <SetupAdminPage {...props} />;
}
```

- [ ] **Step 6: Typecheck, lint, test**

Run: `npx tsc --noEmit && npx eslint src && npm test`
Expected: no errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git pull --rebase --autostash
git add src/features/setup src/app/admin/events/[id]/setup/page.tsx src/components/admin/nav.ts src/components/admin/AppSidebar.tsx tests/nav.test.ts "src/app/admin/events/[id]/layout.tsx" "src/app/admin/events/(list)/page.tsx"
git commit -m "feat(setup): the admin Setup area, its link buttons and the waiting badge (D441, D448)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Review and Apply for Basics

**Files:**
- Create: `src/features/setup/admin/SetupReviewPage.tsx`
- Modify: `src/features/setup/admin/actions.ts`
- Modify: `src/features/setup/index.ts`
- Create: `src/app/admin/events/[id]/setup/[section]/page.tsx`

**Interfaces:**
- Consumes: `getSetupRow`, `markApplied`, `sanitizeBasics`, `basicsFromEvent`, `basicsChanges`, `basicsErrors`, `basicsMissing`, `basicsPatch`, `BASICS_LABELS`, `BASICS_IMAGE_FIELDS`, `sectionStatus`, `isBuiltStep`, `HomePreview`, `updateEvent`, `deleteEventImage`, `isEventMediaFor`
- Produces:
  - `applySectionAction(eventId: string, section: string)`
  - `SetupReviewPage({ params })`

- [ ] **Step 1: Add the Apply action**

Append to `src/features/setup/admin/actions.ts`, adding the imports at the top:

```ts
import { updateEvent } from "@/lib/db/events";
import { deleteEventImage } from "@/lib/db/media";
import { isEventMediaFor } from "@/lib/storage";
import { getSetupRow, markApplied } from "../db";
import { isBuiltStep } from "../sections";
import { sectionStatus } from "../status";
import { BASICS_IMAGE_FIELDS, BASICS_LABELS, basicsErrors, basicsMissing, basicsPatch, sanitizeBasics } from "../sections/basics";
```

`requireEvent` is already imported from `@/lib/db/events`. Merge `updateEvent` into that same import, and `getSetupRow`/`markApplied` into the existing `../db` import.

```ts
/**
 * Applies a submitted section (D450, D451): checks it again against the event as it is now,
 * writes only what the organiser changed since the last Apply, then records the snapshot -
 * guarded by rev, so a newer submit is never marked applied without being reviewed.
 */
export async function applySectionAction(eventId: string, section: string) {
  const ev = await event(eventId);
  const back = `${setupPath(ev.id)}/${section}`;
  if (!isBuiltStep(section) || section !== "basics") redirect(flashPath(setupPath(ev.id), "That section can't be applied yet.", "error"));
  const row = await getSetupRow(ev.id, section);
  if (!row || sectionStatus(row) !== "submitted") redirect(flashPath(back, "There is nothing new to apply.", "error"));

  const submitted = sanitizeBasics(row.submitted);
  const problems = [...basicsMissing(submitted).map((f) => `${BASICS_LABELS[f]} is empty`), ...Object.entries(basicsErrors(submitted)).map(([f, m]) => `${BASICS_LABELS[f as keyof typeof BASICS_LABELS]}: ${m}`)];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  for (const f of BASICS_IMAGE_FIELDS) {
    if (submitted[f] && !isEventMediaFor(submitted[f], supabaseUrl, ev.org_id, ev.id, [f === "logo_url" ? "logo" : "banner"])) problems.push(`${BASICS_LABELS[f]} was not uploaded through this link`);
  }
  if (problems.length) redirect(flashPath(back, `Not applied. ${problems.join(". ")}.`, "error"));

  const patch = basicsPatch(submitted, row.applied ? sanitizeBasics(row.applied) : null);
  if (Object.keys(patch).length) await updateEvent(ev.id, patch);
  // Replaced images go after the row points at the new ones, as Settings does.
  for (const f of BASICS_IMAGE_FIELDS) {
    if (f in patch && ev[f] && ev[f] !== patch[f]) await deleteEventImage(ev[f]);
  }
  if (!(await markApplied(ev.id, section, row.rev, row.submitted))) {
    redirect(flashPath(back, "Applied, but the organiser submitted again meanwhile. Review the new version.", "error"));
  }
  revalidatePath(`/admin/events/${ev.id}`, "layout");
  revalidatePath(`/e/${ev.slug}`, "layout");
  const n = Object.keys(patch).length;
  redirect(flashPath(setupPath(ev.id), n ? `Event basics applied: ${n} change${n === 1 ? "" : "s"} written.` : "Event basics applied. Nothing on the event needed changing."));
}
```

- [ ] **Step 2: Write `SetupReviewPage.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { shortDateTime } from "@/lib/text";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSetupRow } from "../db";
import { isBuiltStep } from "../sections";
import { hasUnsubmittedChanges, sectionStatus, STATUS_LABELS } from "../status";
import { basicsChanges, basicsErrors, basicsFromEvent, basicsMissing, BASICS_LABELS, sanitizeBasics } from "../sections/basics";
import { HomePreview } from "../preview/HomePreview";
import { applySectionAction } from "./actions";

/** What Apply would change on the live event, next to the preview the organiser saw (D449). */
export async function SetupReviewPage({ params }: { params: Promise<{ id: string; section: string }> }) {
  const { id, section } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  if (!isBuiltStep(section)) notFound();
  const row = await getSetupRow(ev.id, section);
  const status = sectionStatus(row);
  const back = `/admin/events/${ev.id}/setup`;

  if (!row?.submitted) {
    return (
      <div className="flex flex-col gap-4">
        <AdminHeader title="Event basics" subtitle="Nothing submitted yet." />
        <Link href={back} className="text-sm font-bold text-primary">‹ Setup</Link>
      </div>
    );
  }

  const submitted = sanitizeBasics(row.submitted);
  const changes = basicsChanges(submitted, basicsFromEvent(ev));
  const problems = basicsMissing(submitted).length + Object.keys(basicsErrors(submitted)).length;
  const canApply = status === "submitted" && problems === 0;

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title="Event basics"
        subtitle={`Submitted ${row.submitted_at ? shortDateTime(row.submitted_at) : ""}${row.applied_at ? ` · last applied ${shortDateTime(row.applied_at)}` : ""}`}
        actions={
          <form action={applySectionAction.bind(null, ev.id, section)}>
            <SubmitButton disabled={!canApply}>Apply to event</SubmitButton>
          </form>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Link href={back} className="text-sm font-bold text-primary">‹ Setup</Link>
        <Badge variant={status === "applied" ? "success" : "warning"}>{STATUS_LABELS[status]}</Badge>
        {hasUnsubmittedChanges(row) && <span className="text-xs text-muted-foreground">The organiser is editing again; you see their last submitted version.</span>}
        {problems > 0 && <span className="text-xs font-semibold text-destructive">This version has problems the organiser needs to fix before it can be applied.</span>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="overflow-hidden pb-0">
          <CardHeader>
            <CardTitle>What would change</CardTitle>
            <CardDescription>Compared with the live event. Apply writes only fields the organiser changed since the last Apply, so your own edits in Settings stay unless they changed that field again.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {changes.length === 0 ? (
              <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground">Matches the live event.</p>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {changes.map((c) => (
                  <li key={c.field} className="flex flex-col gap-1 px-4 py-3">
                    <span className="text-sm font-bold">{c.label}{c.infoOnly && <span className="ml-2 text-xs font-normal text-muted-foreground">For your notes, not written to the event</span>}</span>
                    {c.image ? (
                      <span className="flex items-center gap-3 text-xs text-muted-foreground">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {c.before ? <img src={c.before} alt="Current" className="h-14 rounded border border-border object-contain" /> : <span>None</span>}
                        →
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {c.after ? <img src={c.after} alt="Submitted" className="h-14 rounded border border-border object-contain" /> : <span>Removed</span>}
                      </span>
                    ) : (
                      <span className="whitespace-pre-line text-sm">
                        {!c.infoOnly && <span className="text-muted-foreground line-through">{c.before || "empty"}</span>}
                        {!c.infoOnly && " → "}
                        {c.after || <span className="text-muted-foreground">empty</span>}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <aside className="flex flex-col gap-2">
          <p className="text-center text-xs font-bold uppercase tracking-wide text-muted-foreground">As submitted</p>
          <HomePreview basics={submitted} compact />
        </aside>
      </div>
    </div>
  );
}
```

Check that `SubmitButton` forwards `disabled`. Its props spread `...rest` per `SubmitButton.tsx:21`; confirm `disabled` reaches the button. If it doesn't, render a plain disabled `<Button>` when `!canApply`.

Append to `src/features/setup/index.ts`:

```ts
export { SetupReviewPage } from "./admin/SetupReviewPage";
```

`src/app/admin/events/[id]/setup/[section]/page.tsx`:

```tsx
import { SetupReviewPage } from "@/features/setup";

export const metadata = { title: "Review setup" };

export default function Page(props: { params: Promise<{ id: string; section: string }> }) {
  return <SetupReviewPage {...props} />;
}
```

- [ ] **Step 3: Typecheck, lint, test, build**

Run: `npx tsc --noEmit && npx eslint src && npm test && npm run build`
Expected: no errors, all tests pass, and the build succeeds.

- [ ] **Step 4: Commit**

```bash
git pull --rebase --autostash
git add src/features/setup "src/app/admin/events/[id]/setup"
git commit -m "feat(setup): review a submitted section and apply only what changed (D449-D451)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Database check and close-out

**Files:**
- Create: `scripts/setup-db-check.mjs`
- Modify: `package.json`
- Modify: `docs/superpowers/specs/2026-10-10-organiser-setup-design.md` (status line)

- [ ] **Step 1: Write the check**

```js
// Executable evidence that the setup tables (supabase/migrations/0071_event_setup.sql) behave as
// the spec says against a real database. vitest has no database (D141); the apply rules are pure
// and tested in tests/setup.
//
// WHAT THIS PROVES:
//   1. setup_token is unique across events (D441).
//   2. event_setup_sections refuses an unknown section and a second row for the same section.
//   3. The rev guard (D446): an update carrying the current rev lands and bumps it; one carrying
//      a stale rev changes nothing.
//   4. Deleting the event removes its section rows (cascade).
//
// HOW TO RUN: npm run check:setup (node --env-file=.env.local scripts/setup-db-check.mjs).
// SAFE TO RE-RUN: it creates two draft events with random slugs and deletes them in `finally`.
// It never writes to any other event.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env vars. Run with: node --env-file=.env.local scripts/setup-db-check.mjs");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const runId = randomUUID().replaceAll("-", "");
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
};
const must = ({ data, error }) => { if (error) throw error; return data; };

const org = must(await db.from("organisations").select("id").limit(1).single());
const token = `zz${runId.slice(0, 10)}`;
const a = must(await db.from("events").insert({ org_id: org.id, name: `Setup check ${runId}`, slug: `setup-check-${runId}`, setup_token: token }).select("id").single());
const b = must(await db.from("events").insert({ org_id: org.id, name: `Setup check b ${runId}`, slug: `setup-check-b-${runId}` }).select("id").single());

try {
  // 1. Unique token.
  const dup = await db.from("events").update({ setup_token: token }).eq("id", b.id);
  check("a setup token can't be given to a second event", Boolean(dup.error), dup.error?.code);

  // 2. Section rows.
  must(await db.from("event_setup_sections").insert({ event_id: a.id, section: "basics", answers: { name: "x" }, rev: 1 }));
  const bad = await db.from("event_setup_sections").insert({ event_id: a.id, section: "raffle", answers: {} });
  check("an unknown section is refused", bad.error?.code === "23514", bad.error?.code);
  const twice = await db.from("event_setup_sections").insert({ event_id: a.id, section: "basics", answers: {} });
  check("a second basics row is refused", twice.error?.code === "23505", twice.error?.code);

  // 3. Rev guard.
  const ok = must(await db.from("event_setup_sections").update({ answers: { name: "y" }, rev: 2 }).eq("event_id", a.id).eq("section", "basics").eq("rev", 1).select("rev"));
  check("a save with the current rev lands and bumps it", ok.length === 1 && ok[0].rev === 2);
  const stale = must(await db.from("event_setup_sections").update({ answers: { name: "z" }, rev: 2 }).eq("event_id", a.id).eq("section", "basics").eq("rev", 1).select("rev"));
  const after = must(await db.from("event_setup_sections").select("answers, rev").eq("event_id", a.id).eq("section", "basics").single());
  check("a save with a stale rev changes nothing", stale.length === 0 && after.answers.name === "y" && after.rev === 2);
} finally {
  // 4. Cascade.
  must(await db.from("events").delete().in("id", [a.id, b.id]));
  const left = must(await db.from("event_setup_sections").select("event_id").eq("event_id", a.id));
  check("deleting the event removes its section rows", left.length === 0);
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Add the script to `package.json`**

After the `"check:catalogue"` line, add:

```json
    "check:setup": "node --env-file=.env.local scripts/setup-db-check.mjs",
```

- [ ] **Step 3: Run the check, then everything else**

Run: `npm run check:setup`
Expected: every line PASS, and exit code 0.

Run: `npx tsc --noEmit && npx eslint src && npm test && npm run build`
Expected: no errors, all tests pass, and the build succeeds.

- [ ] **Step 4: Mark the spec's Phase 1 built**

In the spec's status line, change `Not built yet.` to:

`Phase 1 built 10 Oct 2026 (plan docs/superpowers/plans/2026-10-10-organiser-setup-phase-1.md); Phase 2 not built.`

- [ ] **Step 5: Commit**

```bash
git pull --rebase --autostash
git add scripts/setup-db-check.mjs package.json docs/superpowers/specs/2026-10-10-organiser-setup-design.md
git commit -m "test(setup): database check for the token, section rows, rev guard and cascade

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Browser walk-through (controller, signed in, on `ecpkom` only)**

1. Admin: open Setup and press **Create setup link**, then **Open as organiser**.
2. Organiser: check the checklist shows the right items for `ecpkom`'s add-ons, steps first.
3. Open Event basics. Change the venue, upload a banner and a logo, and type a wrong-shaped banner to see the warning. Check the preview slots highlight, then submit.
4. Admin: check the sidebar badge shows 1 and the review lists the changes. Press Apply.
5. Check the portal home shows the new venue and banner.
6. Admin: change the venue in Settings. Organiser: change only the colour and resubmit. Apply again, and check the admin's venue survived.
7. Restore `ecpkom`: venue, logo, banner and colour back to their original values (note them before step 3). Then turn the link off.

## Spec coverage

| Spec decision | Task |
| --- | --- |
| D441 Link | 1 (column), 4 (rotate/clear/lookup), 6 (pages, actions), 7 (buttons) |
| D442 Table, derived status | 1, 2 |
| D443 Sections as code | 2 (`sections.ts`), 3 (`sections/basics.ts`) |
| D444 Checklist from catalogue | 2 |
| D445 Preview | 5, 6 |
| D446 Short guided forms, autosave, rev | 4 (guard), 6 |
| D447 Uploads warn, don't block | 3, 6 |
| D448 Admin Setup area, badge | 7 |
| D449 Review | 3 (`basicsChanges`), 8 |
| D450 Change-only apply | 3 (`basicsPatch`), 8 |
| D451 All-or-nothing apply | 8. Basics is a single-row update guarded by rev; Postgres functions come with Phase 2's multi-row applies |
| D452 Cards until built | 2 (`builtSteps`) |
