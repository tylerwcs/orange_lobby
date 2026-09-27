# Committee Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WhatsApp an event's committee numbers once when booking change requests have waited 60 minutes undecided, and say "committee" instead of "desk" for the people who decide.

**Architecture:** Supabase `pg_cron` + `pg_net` POST to a Next route every 5 minutes with a shared secret; the route claims due requests (stamping `reminded_at`), groups them by event, and sends one template per alert number through the existing `sendTemplate`. Pure logic (due-selection, phrasing, number parsing, secret check) lives in `src/lib/committee-reminders.ts` and is unit tested.

**Tech Stack:** Next.js 16 (App Router, route handlers, server actions), Supabase Postgres (pg_cron, pg_net, Vault), WhatsApp Cloud API, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-27-committee-reminders-design.md`

## Global Constraints

- Reminder after **60 minutes** undecided; job runs **every 5 minutes**; any time of day.
- Each request is reminded about **once**; one message per event per round.
- Template `ecphub_committee_pending`, Utility, positional, `en`, footer "Ecopia Events", URL button "Review requests" → `https://ecphub.vercel.app/admin/requests/{{1}}`.
- Numbers via `toE164My` (Malaysian only, stored as `60…` with no plus).
- "committee" replaces "desk" only where it names the people who decide; "registration desk" stays; code comments untouched.
- Never test on the `ecphub` event.

---

### Task 1: Schema and types

**Files:**
- Create: `supabase/migrations/0051_committee_reminders.sql`
- Modify: `src/lib/types.ts` (Event, ActivityChangeRequest), `src/lib/db/events.ts` (`hydrate`)

**Interfaces:**
- Produces: `Event.committee_alert_numbers: string[]`, `ActivityChangeRequest.reminded_at: string | null`

- [ ] **Step 1: Write the migration**

```sql
-- Committee reminders: an event's alert numbers, and when each change request was reminded
-- about, so a request that waits an hour is announced once.
alter table events add column committee_alert_numbers text[] not null default '{}';
alter table activity_change_requests add column reminded_at timestamptz;
create index activity_change_requests_due_idx on activity_change_requests (created_at)
  where status = 'pending' and reminded_at is null;

-- Every five minutes, ask the app to send what has fallen due. The secret is read from Vault at
-- call time (`committee_reminders_secret`, created outside migrations so it never sits in git);
-- without it the header is null and the route answers 401.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule(
  'committee-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://ecphub.vercel.app/api/cron/committee-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'committee_reminders_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

- [ ] **Step 2: Add the types**

In `src/lib/types.ts`, on `Event` after `export_fields`:

```ts
  /** WhatsApp numbers (60…, no plus) told when change requests wait an hour. */
  committee_alert_numbers: string[];
```

On `ActivityChangeRequest` after `decided_by`:

```ts
  /** When the committee was reminded about it; null until then. Set once. */
  reminded_at: string | null;
```

In `src/lib/db/events.ts` `hydrate`, widen `raw` with `committee_alert_numbers?: unknown` and add:

```ts
    committee_alert_numbers: Array.isArray(raw.committee_alert_numbers) ? raw.committee_alert_numbers.filter((n): n is string => typeof n === "string") : [],
```

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit -p .` → no errors.
- [ ] **Step 4: Commit** — `git add` the three files; `feat(db): committee alert numbers and request reminder stamp`.

(Applying the migration and creating the Vault secret are Task 6.)

### Task 2: Pure reminder logic

**Files:**
- Create: `src/lib/committee-reminders.ts`
- Test: `tests/committee-reminders.test.ts`

**Interfaces:**
- Produces:
  - `REMINDER_AFTER_MS = 60 * 60 * 1000`
  - `dueCutoff(now: Date): string` — ISO time 60 minutes before `now`
  - `groupByEvent(requests: Pick<ActivityChangeRequest, "id" | "event_id">[]): Map<string, string[]>` — event id → request ids, in input order
  - `pendingPhrase(n: number): string` — "1 booking change request" / "3 booking change requests"
  - `parseAlertNumbers(text: string): { numbers: string[]; bad: string[] }`
  - `cronAuthorised(header: string | null, secret: string | undefined): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { dueCutoff, groupByEvent, pendingPhrase, parseAlertNumbers, cronAuthorised } from "@/lib/committee-reminders";

describe("dueCutoff", () => {
  it("is exactly an hour before now", () => {
    expect(dueCutoff(new Date("2026-09-30T03:00:00.000Z"))).toBe("2026-09-30T02:00:00.000Z");
  });
});

describe("groupByEvent", () => {
  it("collects request ids under their event, keeping order", () => {
    const g = groupByEvent([{ id: "r1", event_id: "e1" }, { id: "r2", event_id: "e2" }, { id: "r3", event_id: "e1" }]);
    expect([...g.entries()]).toEqual([["e1", ["r1", "r3"]], ["e2", ["r2"]]]);
  });
});

describe("pendingPhrase", () => {
  it("counts in words the template reads naturally", () => {
    expect(pendingPhrase(1)).toBe("1 booking change request");
    expect(pendingPhrase(3)).toBe("3 booking change requests");
  });
});

describe("parseAlertNumbers", () => {
  it("normalises each line, drops blanks and repeats", () => {
    expect(parseAlertNumbers("012-345 6789\n\n+60 12 345 6789\n0198765432 ")).toEqual({ numbers: ["60123456789", "60198765432"], bad: [] });
  });
  it("names every line it cannot read", () => {
    expect(parseAlertNumbers("0123456789\nabc\n+65 8123 4567")).toEqual({ numbers: ["60123456789"], bad: ["abc", "+65 8123 4567"] });
  });
});

describe("cronAuthorised", () => {
  it("accepts only the exact bearer secret", () => {
    expect(cronAuthorised("Bearer s3cret", "s3cret")).toBe(true);
    expect(cronAuthorised("Bearer wrong", "s3cret")).toBe(false);
    expect(cronAuthorised(null, "s3cret")).toBe(false);
  });
  it("refuses everything when no secret is configured", () => {
    expect(cronAuthorised("Bearer ", undefined)).toBe(false);
    expect(cronAuthorised("Bearer undefined", undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/committee-reminders.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import { timingSafeEqual } from "node:crypto";
import { toE164My } from "@/lib/phone";
import type { ActivityChangeRequest } from "@/lib/types";

/** How long a change request may wait undecided before the committee hears about it. */
export const REMINDER_AFTER_MS = 60 * 60 * 1000;

export function dueCutoff(now: Date): string {
  return new Date(now.getTime() - REMINDER_AFTER_MS).toISOString();
}

export function groupByEvent(requests: Pick<ActivityChangeRequest, "id" | "event_id">[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of requests) out.set(r.event_id, [...(out.get(r.event_id) ?? []), r.id]);
  return out;
}

export function pendingPhrase(n: number): string {
  return `${n} booking change request${n === 1 ? "" : "s"}`;
}

/** The Settings textarea: one number per line. Every unreadable line is named, not dropped. */
export function parseAlertNumbers(text: string): { numbers: string[]; bad: string[] } {
  const numbers: string[] = [];
  const bad: string[] = [];
  for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const n = toE164My(line);
    if (!n) bad.push(line);
    else if (!numbers.includes(n)) numbers.push(n);
  }
  return { numbers, bad };
}

/** The cron route's gate. No configured secret means nobody gets in, not everybody. */
export function cronAuthorised(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Run** the test → PASS.
- [ ] **Step 5: Commit** — `feat(committee): reminder due-selection, phrasing, numbers and cron gate`.

### Task 3: Committee alerts in Settings

**Files:**
- Modify: `src/app/admin/events/[id]/actions.ts` (new action), `src/app/admin/events/[id]/settings/page.tsx` (tab + card)

**Interfaces:**
- Consumes: `parseAlertNumbers` (Task 2), `Event.committee_alert_numbers` (Task 1)
- Produces: `updateCommitteeNumbersAction(eventId: string, formData: FormData)`

- [ ] **Step 1: Add the action** after `updateScanFieldsAction`:

```ts
/** The numbers told when change requests wait an hour. Its own action: the tab sits outside the big settings form. */
export async function updateCommitteeNumbersAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  await requireEvent(eventId, orgId);
  const path = `/admin/events/${eventId}/settings`;
  const { numbers, bad } = parseAlertNumbers(String(formData.get("committee_alert_numbers") ?? ""));
  if (bad.length > 0) {
    redirect(flashPath(path, `Couldn't read ${bad.map((b) => `"${b}"`).join(", ")} as a Malaysian number. Nothing was saved.`, "error"));
  }
  await updateEvent(eventId, { committee_alert_numbers: numbers });
  revalidatePath(path);
  redirect(flashPath(path, numbers.length ? "Committee alert numbers saved." : "Committee alerts switched off."));
}
```

Import `parseAlertNumbers` from `@/lib/committee-reminders`.

- [ ] **Step 2: Add the tab.** In `settings/page.tsx`: add `"alerts"` to the `rememberedTab` list; add `<TabsTrigger value="alerts">Committee alerts</TabsTrigger>` before Danger zone; add, outside the big settings form next to the danger tab:

```tsx
      <TabsContent value="alerts" className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Committee alerts</CardTitle>
            <CardDescription>
              When an attendee&apos;s request to change or cancel a booking has waited an hour without a decision, these numbers get one WhatsApp saying how many are waiting. One number per line. Leave empty to switch alerts off.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form key={ev.committee_alert_numbers.join(",")} action={updateCommitteeNumbersAction.bind(null, ev.id)} className="flex max-w-sm flex-col items-start gap-3">
              <label htmlFor="committee_alert_numbers" className="sr-only">Committee alert numbers</label>
              <Textarea id="committee_alert_numbers" name="committee_alert_numbers" rows={4} placeholder={"012-345 6789\n019-876 5432"}
                defaultValue={ev.committee_alert_numbers.map((n) => `+${n}`).join("\n")} />
              <SubmitButton>Save numbers</SubmitButton>
            </form>
          </CardContent>
        </Card>
      </TabsContent>
```

Import `Textarea` from `@/components/ui/textarea` and the action.

- [ ] **Step 3: Typecheck and lint** both files.
- [ ] **Step 4: Browser check** on a test event (not `ecphub`): save two numbers, reload, see them as `+60…`; save `abc` and see the error flash with nothing saved; clear and see "switched off". Restore the event's value afterwards.
- [ ] **Step 5: Commit** — `feat(settings): committee alert numbers`.

### Task 4: The round, its route, and the review link

**Files:**
- Modify: `src/lib/db/activity-requests.ts` (two helpers)
- Create: `src/lib/committee-run.ts`, `src/app/api/cron/committee-reminders/route.ts`, `src/app/admin/requests/[eventId]/page.tsx`
- Test: `tests/committee-run.test.ts`

**Interfaces:**
- Consumes: Task 1 columns; Task 2 `dueCutoff`, `groupByEvent`, `pendingPhrase`, `cronAuthorised`; `sendTemplate` from `@/lib/whatsapp`; `getEvent` from `@/lib/db/events`
- Produces: `listDueRequests(cutoffIso: string)`, `claimForReminder(ids: string[]): Promise<string[]>`, `runCommitteeReminders(now: Date): Promise<RoundResult>` with `RoundResult = { events: number; requests: number; sent: number; failed: number }`

- [ ] **Step 1: DB helpers** in `activity-requests.ts`:

```ts
/** Pending requests old enough to remind about and not yet reminded — the round's input. */
export async function listDueRequests(cutoffIso: string): Promise<ActivityChangeRequest[]> {
  const { data, error } = await serviceClient().from("activity_change_requests").select("*")
    .eq("status", "pending").is("reminded_at", null).lte("created_at", cutoffIso).order("created_at");
  if (error) throw error;
  return (data ?? []) as ActivityChangeRequest[];
}

/**
 * Stamps `reminded_at` on those of `ids` still un-stamped and returns the ones this call won.
 * Claim before sending: two overlapping rounds then count each request once, and a template
 * still in review cannot cause a send attempt every five minutes.
 */
export async function claimForReminder(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data, error } = await serviceClient().from("activity_change_requests")
    .update({ reminded_at: new Date().toISOString() })
    .in("id", ids).is("reminded_at", null).eq("status", "pending").select("id");
  if (error) throw error;
  return (data ?? []).map((r) => (r as { id: string }).id);
}
```

- [ ] **Step 2: Write the failing round test** (`tests/committee-run.test.ts`), stubbing db and WhatsApp:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  due: [] as { id: string; event_id: string }[],
  events: {} as Record<string, { id: string; name: string; committee_alert_numbers: string[] }>,
  claimed: [] as string[][],
}));
const sendTemplate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/activity-requests", () => ({
  listDueRequests: async () => state.due,
  claimForReminder: async (ids: string[]) => { state.claimed.push(ids); return ids; },
}));
vi.mock("@/lib/db/events", () => ({ getEvent: async (id: string) => state.events[id] ?? null }));
vi.mock("@/lib/whatsapp", () => ({ sendTemplate }));

const { runCommitteeReminders } = await import("@/lib/committee-run");

beforeEach(() => {
  state.due = []; state.events = {}; state.claimed = [];
  sendTemplate.mockReset();
  sendTemplate.mockResolvedValue({ ok: true, wamid: "w" });
});

describe("runCommitteeReminders", () => {
  it("sends one message per number per event, counting that event's due requests", async () => {
    state.due = [{ id: "r1", event_id: "e1" }, { id: "r2", event_id: "e1" }];
    state.events.e1 = { id: "e1", name: "Kick-Off", committee_alert_numbers: ["60123456789", "60198765432"] };
    expect(await runCommitteeReminders(new Date())).toEqual({ events: 1, requests: 2, sent: 2, failed: 0 });
    expect(sendTemplate).toHaveBeenCalledWith({
      to: "60123456789", template: "ecphub_committee_pending",
      bodyParams: ["2 booking change requests", "Kick-Off"], buttonParam: "e1",
    });
    expect(state.claimed).toEqual([["r1", "r2"]]);
  });

  it("leaves an event with no numbers alone, un-stamped, so adding numbers later picks it up", async () => {
    state.due = [{ id: "r1", event_id: "e1" }];
    state.events.e1 = { id: "e1", name: "Kick-Off", committee_alert_numbers: [] };
    expect(await runCommitteeReminders(new Date())).toEqual({ events: 0, requests: 0, sent: 0, failed: 0 });
    expect(state.claimed).toEqual([]);
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it("counts a refused send as failed and still keeps the stamp", async () => {
    state.due = [{ id: "r1", event_id: "e1" }];
    state.events.e1 = { id: "e1", name: "Kick-Off", committee_alert_numbers: ["60123456789"] };
    sendTemplate.mockResolvedValue({ ok: false, code: 132001, title: "Template does not exist" });
    expect(await runCommitteeReminders(new Date())).toEqual({ events: 1, requests: 1, sent: 0, failed: 1 });
    expect(state.claimed).toEqual([["r1"]]);
  });
});
```

- [ ] **Step 3: Run** → FAIL (module not found).

- [ ] **Step 4: Implement `src/lib/committee-run.ts`**

```ts
import "server-only";
import { listDueRequests, claimForReminder } from "@/lib/db/activity-requests";
import { getEvent } from "@/lib/db/events";
import { sendTemplate } from "@/lib/whatsapp";
import { dueCutoff, groupByEvent, pendingPhrase } from "@/lib/committee-reminders";

export type RoundResult = { events: number; requests: number; sent: number; failed: number };

/**
 * One reminder round: every event whose change requests have waited an hour gets one WhatsApp
 * per committee number saying how many. Requests are claimed before anything is sent (see
 * claimForReminder), so each is announced once however the rounds overlap or fail.
 */
export async function runCommitteeReminders(now: Date): Promise<RoundResult> {
  const result: RoundResult = { events: 0, requests: 0, sent: 0, failed: 0 };
  for (const [eventId, ids] of groupByEvent(await listDueRequests(dueCutoff(now)))) {
    const ev = await getEvent(eventId);
    if (!ev || ev.committee_alert_numbers.length === 0) continue;
    const claimed = await claimForReminder(ids);
    if (claimed.length === 0) continue;
    result.events++;
    result.requests += claimed.length;
    for (const to of ev.committee_alert_numbers) {
      const res = await sendTemplate({
        to, template: "ecphub_committee_pending",
        bodyParams: [pendingPhrase(claimed.length), ev.name], buttonParam: ev.id,
      });
      if (res.ok) result.sent++;
      else { result.failed++; console.error(`committee reminder to ${to} for ${ev.id} failed: ${res.title}`); }
    }
  }
  return result;
}
```

(The test's `sendTemplate` expectation omits `language`: `sendTemplate` defaults it to `en`.)

- [ ] **Step 5: Run** → PASS.

- [ ] **Step 6: The route** `src/app/api/cron/committee-reminders/route.ts`:

```ts
import { cronAuthorised } from "@/lib/committee-reminders";
import { runCommitteeReminders } from "@/lib/committee-run";

/**
 * Called every five minutes by pg_cron (migration 0051) with the Vault secret as a bearer
 * token; CRON_SECRET on Vercel is the same value. Anything else is turned away before any work.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!cronAuthorised(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await runCommitteeReminders(new Date()));
}
```

- [ ] **Step 7: The review link** `src/app/admin/requests/[eventId]/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";

/**
 * Where the committee reminder's button lands. A WhatsApp template's link is a fixed prefix plus
 * one variable, so the event id is the whole variable and this forwards to the page that lists
 * each activity with its waiting requests. The proxy sends a signed-out tap to /login first.
 */
export default async function RequestsRedirect({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  redirect(`/admin/events/${ev.id}/activities`);
}
```

- [ ] **Step 8: Typecheck, lint, full test run.**
- [ ] **Step 9: Commit** — `feat(committee): the reminder round, its cron route and review link`.

### Task 5: "Desk" becomes "committee"

**Files:**
- Modify: `src/app/admin/events/[id]/exports/page.tsx:49`, `src/app/e/[slug]/a/[token]/activities/actions.ts:129,160`, `src/app/e/[slug]/a/[token]/activities/[activityId]/page.tsx:91`, `src/components/portal/ActivityBooking.tsx:52,68,69,94,107`, `src/components/portal/ActivitySessions.tsx:182`, `src/lib/activity-card.ts:56`

- [ ] **Step 1: Replace, in strings only** (not comments):
  - "the facilitator or the desk prints" → "the facilitator or the committee prints"
  - "The desk will decide." → "The committee will decide." (both actions)
  - "The desk approves the move." → "The committee approves the move."
  - "The desk can move you later." → "The committee can move you later."
  - "until the desk agrees" → "until the committee agrees"
  - "The desk declined your request" → "The committee declined your request" (both)
  - "Ask the desk to cancel" → "Ask the committee to cancel"
  - "The desk approves it." → "The committee approves it."
  - "Ask the desk to move you" → "Ask the committee to move you"
  - "Waiting for the desk" → "Waiting for the committee"
  - Leave every "registration desk".
- [ ] **Step 2: Check** `grep -rniE "\bdesk\b" src tests` for string hits other than "registration desk"; update any test asserting the old copy.
- [ ] **Step 3: Full test run, typecheck.**
- [ ] **Step 4: Commit** — `copy: the committee, not the desk, decides requests`.

### Task 6: Go live

- [ ] **Step 1: Submit the template** `ecphub_committee_pending` to the WABA (Graph API `POST /<WABA>/message_templates`, same shape as `ecphub_booking_open`): Utility, `en`, body "There are {{1}} waiting for a decision at {{2}}, the oldest for over an hour. Tap below to review them." with example `["3 booking change requests", "Ecopia Kick-Off Meeting 2026"]`, footer "Ecopia Events", URL button "Review requests" → `https://ecphub.vercel.app/admin/requests/{{1}}` with example `https://ecphub.vercel.app/admin/requests/4e64a90c-728c-4a08-af62-8c8046afa0c9`.
- [ ] **Step 2: Generate the secret** (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`), store it in Vault (`select vault.create_secret('<value>', 'committee_reminders_secret');`) and as `CRON_SECRET=` in `.env.local` — never in git or chat.
- [ ] **Step 3: Apply migration 0051** through the Supabase MCP `apply_migration`; confirm `select jobname, schedule from cron.job;` lists `committee-reminders`.
- [ ] **Step 4: Local round** — with the dev server running and `CRON_SECRET` in `.env.local`, POST to `http://localhost:3000/api/cron/committee-reminders` without the header (expect 401) and with it (expect JSON counts). Only a test event with numbers the user chose may be involved.
- [ ] **Step 5: Hand-off** — the user adds `CRON_SECRET` (value from `.env.local`) to Vercel's Production environment and redeploys; until then the 5-minute calls get 401 and nothing is sent.
- [ ] **Step 6: Update the WhatsApp memory** with the new template.
