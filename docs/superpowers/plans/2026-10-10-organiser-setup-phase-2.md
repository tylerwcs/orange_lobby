# Organiser Setup Page, Phase 2: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organisers fill in the Agenda and Info steps on their setup link, each with a live phone preview of their portal. Admins review each submitted section and apply it with one click. Apply writes only what the organiser changed. Admin edits survive, and a whole section applies or nothing does.

**Architecture:**

- **Two new section modules,** each pure and client-safe:
  - `sections/agenda.ts`, `sections/info.ts`: the answer shapes, sanitising, the starting point from the live event, checks, and preview data.
  - `sections/agenda-apply.ts`, `sections/info-apply.ts`: the planner. It compares `submitted`, the baseline, `applied_map` and the live rows, and returns one plan. The plan lists every insert, update, delete and order write, the new map, the change list for review, and any problems.
- **Review and Apply use the same plan,** so the review shows exactly what Apply writes (D449).
- **Each section's Apply runs one Postgres function** (`setup_apply_agenda`, `setup_apply_info`). It writes all the rows, the `applied_map`, and the guarded `applied` snapshot in one transaction (D451).
- **The step client becomes shared machinery:**
  - `useSectionAutosave` holds the save chain
  - `StepFrame` draws the title row, the Submit bar and the preview
  - `PhoneFrame` is the phone the previews draw in

  Basics, Agenda and Info all use them.
- **The previews reuse the portal's own `AgendaList` and `InfoPage`.** Rows gain a `data-item-id` attribute, so the preview can outline the session being edited.

**Tech Stack:**

- Next.js 16 App Router and server actions. Read `node_modules/next/dist/docs/` before using any Next API not already used in this repo.
- React 19 and TypeScript.
- Supabase: the service-role client, RLS on with no policies, plpgsql functions.
- Vitest: node environment, `.test.ts` files only, no DOM.
- Tiptap, through the existing `RichTextEditor`.

**Spec:** `docs/superpowers/specs/2026-10-10-organiser-setup-design.md` (D441–D452). This plan adds D453–D460 (below). Task 11 writes them into the spec.

## New decisions (D453–D460)

- **D453: what the Agenda step stores.**
  - `{ days: [{ id, date, name }], sessions: [{ id, day, starts_at, ends_at, title, location, description, categories, image_url, round, rooms }] }`.
  - A session with a `round` name is a breakout round. `rooms` lists its room codes ("3A, 3B"). A round has no location, categories or photo, as in admin's round form.
  - Image rows and session colours stay admin-only: they are never asked for, never written, and never touched.
- **D454: how setup items map to real rows.**
  - Setup ids are opaque strings. `applied_map` maps each id to its real row.
  - Rows prefilled from the live event keep their real ids. The map entries for them are written when the section row is first created. A prefilled round is `round:<first room id>`.
  - Round rooms are mapped one by one, keyed `<session id>#<room code, lowercase>`.
  - The first save seeds `seed` and the map. Both are limited to the ids the organiser's form actually showed (`seedIds`). Anything an admin added after the page opened is never treated as removed.
- **D455: one plan, run by one database function.**
  - The plan is computed in TypeScript (pure, tested). One Postgres function per section runs it.
  - The function also writes `applied_map`, and the `applied` snapshot guarded on `submitted_at`.
  - It returns whether the snapshot was marked. A failed statement rolls everything back.
- **D456: placement.**
  - New sessions, retimed sessions and moved sessions are placed by start time among their day's rows, the way admin's Add session places them (`placeKey`).
  - Every other row keeps its hand order.
  - The organiser's preview shows each day in time order.
- **D457: which dates days are checked against.**
  - The organiser's form checks against their own Basics dates when both are valid dates, else the live event's dates.
  - Apply checks against the live event. When dates moved, the admin applies Event basics first, and the problem text says so.
- **D458: Info.**
  - Apply writes tab titles and content only. Tab categories stay admin-only.
  - **Tab order:**
    - A new tab goes right after the tab before it in the organiser's list.
    - If the organiser reordered their tabs, their tabs take their new order, and admin tabs keep their places.
    - If not, an admin's reorder survives.
  - The floor plan goes on the `floor_plan` tile's `url` and on `events.floor_plan_url`, as `saveModuleAction` writes both. If the event has no Floor plan tile, Apply adds one, shown.
- **D459: image clean-up for lists.**
  - **A save deletes a draft image** that the new answers no longer use, when:
    - it is not in the starting point (`seed`), `submitted` or `applied`
    - it is this event's own upload of the section's kind
  - **Apply deletes an image** the organiser started from and replaced, when:
    - neither the applied version nor the working copy uses it
    - nothing on the event uses it after Apply
    - it is this event's own upload
- **D460: the shared step machinery.**
  - `useSectionAutosave` holds the save chain Basics had: debounce, rev, retry, the flush on leave, submit on the same chain.
  - `StepFrame` holds the step's layout.
  - New steps are fields plus a preview.

## Global Constraints

- **Sections:** `basics`, `agenda`, `info`.
  - Task 8 adds `agenda` to `BUILT_STEPS`, and Task 9 adds `info`.
  - At the end, `BUILT_STEPS = SETUP_SECTIONS`.
- **Status is derived, never stored** (unchanged from Phase 1): `sectionStatus` and `hasUnsubmittedChanges` in `status.ts`.
- **The baseline for Apply** is `applied` if set, else `seed`, else blank (agenda and info). Basics keeps its own `basicsBaseline`.
- **Apply writes only fields and items the organiser changed since the baseline that also differ from the live rows.** Items the admin created are never written, with two exceptions:
  - renaming a round renames every room in it
  - a round's shared fields (day, times, title, description) go to every room in it
- **The token is the identity.** Every organiser action does these, in order:
  1. re-checks `isValidToken`
  2. checks the rate limit `allow(\`setup:${token}\`, 240, 60_000)`
  3. looks the event up by `setup_token`

  All of this already lives in `load()` in `portal/actions.ts`.
- **Never pass a full `Event` row to a client component.** Pass explicit projections only, for example `range`, `primaryColor`, `infoTitle`.
- **Images:**
  - one image per request
  - PNG, JPEG, WebP or SVG, 4 MB or less (`acceptImage`)
  - shrink banners and session photos over 1.5 MB with `shrinkImage`; never logos or floor plans (they lose transparency)
  - proportions warn and never block
- **Upload kinds the setup link may use:** `logo`, `banner`, `agenda`, `info`, `floor-plan`.
- **Copy (verbatim):**
  - stale save: `"Someone else updated this section — reload to see their changes."`
  - turned-off or bad link: `"This setup link no longer works. Ask your project contact for a new one."`
  - Apply refused because a newer version arrived: `"The organiser sent a newer version — review it first."`
  - restored item note: `"Deleted in admin; added back because the organiser changed it."`
- **Features are imported only through their entry.** Server code uses `@/features/<name>`. Browser code and pure files use `@/features/<name>/client`. Inside the feature, files import each other relatively. Tests in `tests/setup/` may import internals.
- **The database functions:**
  - `revoke execute ... from public, anon, authenticated` and `grant execute ... to service_role`, as `0063_submit_for_group.sql` does
  - `set search_path = public`
- **Never test on the event with slug `ecphub`.** It is a real event. `ecpkom` (id `4e64a90c-728c-4a08-af62-8c8046afa0c9`) is the test event.
- **Git:**
  - Work on `main`.
  - Run `git pull --rebase --autostash` before each commit. Never push.
  - Never stage `docs/superpowers/specs/2026-09-27-intro-video-design.md` or `docs/image-guide/`; they are the user's own uncommitted files.
  - Every commit message ends with this trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **Checks before each commit:**
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npm test`

  All three must pass. Tasks that touch the UI also run `npm run build` once at the end (Task 11).

## File map

| File | Status | Responsibility |
| --- | --- | --- |
| `src/features/setup/portal/useSectionAutosave.ts` | create | The save chain, generic over a section's answers (D460) |
| `src/features/setup/portal/StepFrame.tsx` | create | A step's layout: title row, groups, Submit bar, preview (D460) |
| `src/features/setup/preview/PhoneFrame.tsx` | create | The phone the previews draw in |
| `src/features/setup/preview/HomePreview.tsx` | modify | Uses `PhoneFrame` |
| `src/features/setup/portal/BasicsStep.tsx` | modify | Fields only; uses the hook and the frame |
| `src/features/setup/sections/agenda.ts` | create | Agenda answers, sanitise, starting point, checks, preview data |
| `src/features/setup/sections/agenda-apply.ts` | create | Agenda baseline and planner |
| `src/features/setup/sections/changes.ts` | create | `PlanChange` and the one-line summary |
| `src/features/setup/sections/info.ts` | create | Info answers, sanitise, starting point, checks, preview data |
| `src/features/setup/sections/info-apply.ts` | create | Info baseline, planner, `withFloorPlan` |
| `src/features/setup/sections.ts` | modify | `SECTION_TITLES`, `problemSentence`, `BUILT_STEPS` |
| `src/features/setup/sections/basics.ts` | modify | `basicsProblems` |
| `src/features/setup/images.ts` | modify | Image targets for photos and floor plans; list-image rules |
| `src/features/setup/portal/SetupImageField.tsx` | modify | All four kinds; `field` prop |
| `supabase/migrations/0073_setup_apply.sql` | create | `setup_apply_agenda`, `setup_apply_info` |
| `src/features/setup/db.ts` | modify | Map on first save, live loaders, the two apply calls |
| `scripts/setup-db-check.mjs` | modify | Checks for both functions |
| `src/components/portal/AgendaList.tsx` | modify | `data-item-id` on each row |
| `src/features/setup/preview/AgendaPreview.tsx` | create | The agenda screen from draft answers |
| `src/features/setup/preview/InfoPreview.tsx` | create | The info screen and the floor plan from draft answers |
| `src/features/setup/portal/actions.ts` | modify | Save, submit and upload for every section |
| `src/features/setup/portal/SetupStepPage.tsx` | modify | Picks the step by section |
| `src/features/setup/portal/AgendaStep.tsx` | create | The Agenda form |
| `src/components/admin/RichTextEditor.tsx` | modify | Optional `onChange` |
| `src/features/setup/portal/InfoStep.tsx` | create | The Info form |
| `src/features/setup/admin/plans.ts` | create | Builds a section's plan and problems for review and Apply (server-only) |
| `src/features/setup/admin/PlanChanges.tsx` | create | The change list for Agenda and Info |
| `src/features/setup/admin/BasicsChanges.tsx` | create | Basics' change list, moved out of the review page |
| `src/features/setup/admin/SetupReviewPage.tsx` | modify | Review for every section |
| `src/features/setup/admin/actions.ts` | modify | Apply for every section |
| `src/features/setup/admin/SetupAdminPage.tsx` | modify | Every section; copy |
| `src/features/setup/client.ts` | modify | Exports the new pure modules and previews |
| `tests/setup/fixtures.ts` | create | Shared builders |
| `tests/setup/agenda.test.ts`, `agenda-apply.test.ts`, `changes.test.ts`, `info.test.ts`, `info-apply.test.ts` | create | Rules and planners |
| `tests/setup/images.test.ts` | modify | List-image rules |
| `docs/superpowers/specs/2026-10-10-organiser-setup-design.md` | modify | Status and D453–D460 (Task 11) |

## Task order and why

1. Task 1: shared step machinery. No behaviour change, so Basics is safe before anything new lands.
2. Tasks 2–5: pure rules with tests. Nothing in the app changes yet.
3. Task 6: the migration and the database layer.
4. Task 7: the previews.
5. Tasks 8–9: the organiser steps. Each turns its section on for organisers.
6. Task 10: admin review and Apply for both sections.
7. Task 11: close-out.

Nothing is pushed until the user says so. Between Task 8 and Task 10, a submitted Agenda shows on the admin Setup page, but its review page is not ready yet.

---

### Task 1: Shared step machinery (no behaviour change)

**Files:**
- Create: `src/features/setup/portal/useSectionAutosave.ts`
- Create: `src/features/setup/portal/StepFrame.tsx`
- Create: `src/features/setup/preview/PhoneFrame.tsx`
- Modify: `src/features/setup/preview/HomePreview.tsx`
- Modify: `src/features/setup/portal/BasicsStep.tsx` (full rewrite below)

**Interfaces:**
- Produces:
  - `useSectionAutosave<T>(opts): StepControls & { answers: T; setAnswers: Dispatch<SetStateAction<T>> }`
  - `StepControls = { save: SaveState; message: StepMessage | null; status: SectionStatus; unsubmitted: boolean; submitting: boolean; nothingNew: boolean; submit: () => void }`
  - `StepFrame({ token, title, step, complete, incompleteHint?, preview, children })`
  - `StepGroup({ title, help, children })`
  - `PhoneFrame({ primaryColor, label, compact?, children })`
- Task 8 adds a `seedIds` option to the hook.

- [ ] **Step 1: Create `PhoneFrame`**

`src/features/setup/preview/PhoneFrame.tsx`:

```tsx
"use client";
import { brandStyle } from "@/lib/brand";

/**
 * The phone every setup preview draws in (D445): a fixed screen that scrolls, coloured with the
 * event's brand colour as the portal is.
 */
export function PhoneFrame({ primaryColor, label, compact = false, children }: {
  primaryColor: string;
  label: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`mx-auto rounded-[2.25rem] bg-zinc-900 p-2.5 shadow-xl ${compact ? "w-[240px]" : "w-[300px]"}`} aria-label={label} role="img">
      <div className={`overflow-y-auto rounded-[1.75rem] bg-background ${compact ? "h-[460px]" : "h-[600px]"}`} style={brandStyle(primaryColor) as React.CSSProperties}>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Use it in `HomePreview`**

In `src/features/setup/preview/HomePreview.tsx`:

1. Replace the import `import { brandStyle } from "@/lib/brand";` with `import { PhoneFrame } from "./PhoneFrame";`.
2. Replace the two outer `<div>`s of the returned JSX, the frame and the scroll area (lines 57–58 and their closers at 85–86), with:

```tsx
    <PhoneFrame primaryColor={basics.primary_color} label="Preview of your portal home" compact={compact}>
      {/* ...the existing children, unchanged... */}
    </PhoneFrame>
```

- [ ] **Step 3: Create the hook**

`src/features/setup/portal/useSectionAutosave.ts`. This is BasicsStep's save logic moved out unchanged, generic over the answers' type, and taking the section name:

```ts
"use client";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { SetupSection } from "../sections";
import { sameAnswers, type SectionStatus } from "../status";
import { saveSectionAction, submitSectionAction } from "./actions";

const AUTOSAVE_MS = 1000;
const RETRY_MS = 5000;
const SAVE_FAILED = "We couldn't save — check your connection. We'll try again in a few seconds.";
const SAVE_FAILED_AGAIN = "We still couldn't save — check your connection. Change anything to try again.";
const SUBMIT_FAILED = "Couldn't submit — check your connection and try again.";

export type SaveState = "idle" | "saving" | "saved" | "error";
export type StepMessage = { text: string; tone: "error" | "info" };
export type StepControls = {
  save: SaveState;
  message: StepMessage | null;
  status: SectionStatus;
  unsubmitted: boolean;
  submitting: boolean;
  /** Submitted (or applied) and nothing changed since: Submit has nothing to send. */
  nothingNew: boolean;
  submit: () => void;
};

/**
 * A step's answers, saved about a second after the last change (D446, D460). Saves run one at a
 * time, each carrying the rev the last one returned, so a second person's save is refused instead
 * of overwritten. Nothing is lost quietly: leaving the page sends a pending save (and the browser
 * asks first while one is unsent or in flight), and a failed save is retried once a few seconds later.
 */
export function useSectionAutosave<T>({ token, section, initial, initialRev, initialStatus, initialUnsubmitted }: {
  token: string;
  section: SetupSection;
  initial: T;
  initialRev: number;
  initialStatus: SectionStatus;
  initialUnsubmitted: boolean;
}): StepControls & { answers: T; setAnswers: Dispatch<SetStateAction<T>> } {
  const [a, setA] = useState(initial);
  const [save, setSave] = useState<SaveState>("idle");
  const [message, setMessage] = useState<StepMessage | null>(null);
  const [status, setStatus] = useState(initialStatus);
  const [unsubmitted, setUnsubmitted] = useState(initialUnsubmitted);
  const [submitting, setSubmitting] = useState(false);
  const rev = useRef(initialRev);
  const latest = useRef(initial);
  // What the server holds. Comparing against it (not "is this the first render") means opening
  // the page never saves, even when React runs effects twice in development.
  const saved = useRef(initial);
  // Read inside the chain, which can run after a render that changed the status.
  const statusRef = useRef(initialStatus);
  // Every save and submit runs on this chain, one at a time. Each step catches its own errors,
  // so the chain always stays fulfilled and the next step always runs.
  const chain = useRef<Promise<void>>(Promise.resolve());
  const blocked = useRef(false);
  // A save or submit request on the wire: leaving now could lose it.
  const inFlight = useRef(false);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);

  const nothingNew = (status === "submitted" || status === "applied") && !unsubmitted;

  /**
   * One save, when there's something to send. Only ever called from a chain step. `force` sends
   * even unchanged answers while no row exists yet (rev 0), so submitting the untouched prefill
   * has a row to submit. `isRetry` marks the one automatic retry, whose failure says so.
   * True when the server now holds the latest answers.
   */
  const saveStep = useCallback(async (force: boolean, isRetry = false): Promise<boolean> => {
    if (blocked.current) return false;
    if (!(force && rev.current === 0) && sameAnswers(latest.current, saved.current)) return true;
    const sending = latest.current;
    setSave("saving");
    inFlight.current = true;
    try {
      const r = await saveSectionAction(token, section, rev.current, sending);
      if (r.ok) {
        rev.current = r.rev;
        saved.current = sending;
        setSave("saved");
        setMessage(null);
        if (statusRef.current === "submitted" || statusRef.current === "applied") setUnsubmitted(true);
        return true;
      }
      setSave("error");
      setMessage({ text: r.message, tone: "error" });
      if (r.stale) blocked.current = true;
      return false;
    } catch {
      setSave("error");
      setMessage({ text: isRetry ? SAVE_FAILED_AGAIN : SAVE_FAILED, tone: "error" });
      return false;
    } finally {
      inFlight.current = false;
    }
  }, [token, section]);

  const cancelRetry = useCallback(() => {
    if (retry.current) clearTimeout(retry.current);
    retry.current = null;
  }, []);

  /** After a failed save (not a stale one), one more try in a few seconds. The retry doesn't schedule another. */
  const scheduleRetry = useCallback(() => {
    cancelRetry();
    if (!mounted.current || blocked.current) return;
    retry.current = setTimeout(() => {
      retry.current = null;
      chain.current = chain.current.then(async () => { await saveStep(false, true); });
    }, RETRY_MS);
  }, [cancelRetry, saveStep]);

  const runSave = useCallback(() => {
    chain.current = chain.current.then(async () => {
      if (!(await saveStep(false))) scheduleRetry();
    });
    return chain.current;
  }, [saveStep, scheduleRetry]);

  // Leaving: the browser asks first while something is unsent or on the wire, a page hide sends
  // what's pending, and so does leaving within the app (unmount), which the browser can't catch.
  useEffect(() => {
    mounted.current = true;
    const unsaved = () => !sameAnswers(latest.current, saved.current);
    const flush = () => { if (unsaved()) void runSave(); };
    const warn = (e: BeforeUnloadEvent) => {
      if (!inFlight.current && !unsaved()) return;
      e.preventDefault();
      e.returnValue = true;
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("pagehide", flush);
      mounted.current = false;
      cancelRetry();
      flush();
    };
  }, [runSave, cancelRetry]);

  useEffect(() => {
    latest.current = a;
    // An edit replaces the pending retry: the debounced save below sends the newer answers.
    cancelRetry();
    if (sameAnswers(a, saved.current)) return;
    const t = setTimeout(() => { void runSave(); }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [a, runSave, cancelRetry]);

  // On the same chain as the saves, so a debounced save can't go out with the rev submit uses.
  const submit = () => {
    setSubmitting(true);
    latest.current = a;
    chain.current = chain.current.then(async () => {
      try {
        if (!(await saveStep(true))) {
          scheduleRetry();
          return;
        }
        inFlight.current = true;
        const r = await submitSectionAction(token, section, rev.current);
        if (r.ok) {
          rev.current = r.rev;
          statusRef.current = "submitted";
          setStatus("submitted");
          setUnsubmitted(false);
          setMessage({ text: "Submitted. We'll review it and let you know if anything needs changing.", tone: "info" });
        } else {
          if (r.stale) blocked.current = true;
          setMessage({ text: r.message, tone: "error" });
        }
      } catch {
        setMessage({ text: SUBMIT_FAILED, tone: "error" });
      } finally {
        inFlight.current = false;
        setSubmitting(false);
      }
    });
  };

  return { answers: a, setAnswers: setA, save, message, status, unsubmitted, submitting, nothingNew, submit };
}
```

- [ ] **Step 4: Create `StepFrame` and `StepGroup`**

`src/features/setup/portal/StepFrame.tsx`. The JSX is BasicsStep's frame, moved:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "../status";
import type { StepControls } from "./useSectionAutosave";

/** One short group of a step's fields, with a sentence of help from the guide (D446). */
export function StepGroup({ title, help, children }: { title: string; help: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="font-extrabold">{title}</h2>
        <p className="text-sm text-muted-foreground">{help}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * A setup step's page (D446, D460): the title row with its status and a quiet "Saved", the
 * step's fields, a sticky Submit bar, and the phone preview - beside the form on a laptop, behind
 * a Preview button on a phone (D445).
 */
export function StepFrame({ token, title, step, complete, incompleteHint = "Fill in the required fields to submit.", preview, children }: {
  token: string;
  title: string;
  step: StepControls;
  complete: boolean;
  incompleteHint?: string;
  preview: React.ReactNode;
  children: React.ReactNode;
}) {
  const { save, message, status, unsubmitted, submitting, nothingNew, submit } = step;
  const [showPreview, setShowPreview] = useState(false);
  const closePreview = useRef<HTMLButtonElement>(null);

  // The phone preview overlay: Close takes focus when it opens, Escape closes it.
  useEffect(() => {
    if (!showPreview) return;
    closePreview.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowPreview(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showPreview]);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/setup/${token}`} className="text-sm font-bold text-primary">‹ Checklist</Link>
          <h1 className="text-2xl font-extrabold">{title}</h1>
          <Badge variant={status === "applied" ? "success" : status === "submitted" ? "warning" : "secondary"}>{STATUS_LABELS[status]}</Badge>
          <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
            {save === "saving" ? "Saving…" : save === "saved" ? "Saved" : ""}
          </span>
        </div>
        {status === "applied" && !unsubmitted && <p className="text-sm text-muted-foreground">Live in your portal. You can still change anything here and submit again.</p>}
        {unsubmitted && status !== "draft" && <p className="text-sm font-semibold text-amber-700">You have changes you haven&apos;t submitted.</p>}

        {children}

        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-border bg-background/95 py-3 backdrop-blur">
          <Button type="button" onClick={submit} disabled={!complete || nothingNew || submitting || save === "saving"}>
            {submitting ? "Submitting…" : status === "draft" || status === "not_started" ? "Submit section" : "Submit changes"}
          </Button>
          <Button type="button" variant="outline" className="lg:hidden" onClick={() => setShowPreview(true)}>Preview</Button>
          {message && <span role="status" className={`text-sm ${message.tone === "error" ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{message.text}</span>}
          {!complete && !message && <span className="text-sm text-muted-foreground">{incompleteHint}</span>}
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
          <Button ref={closePreview} type="button" variant="outline" onClick={() => setShowPreview(false)}>Close preview</Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Rewrite `BasicsStep` on top of them**

Replace `src/features/setup/portal/BasicsStep.tsx` entirely:

```tsx
"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { basicsComplete, basicsErrors, BASICS_LABELS, type BasicsAnswers, type BasicsField } from "../sections/basics";
import type { SectionStatus } from "../status";
import { HomePreview, type PreviewSlot } from "../preview/HomePreview";
import { SetupImageField } from "./SetupImageField";
import { StepFrame, StepGroup } from "./StepFrame";
import { useSectionAutosave } from "./useSectionAutosave";

const SLOT_OF: Partial<Record<BasicsField, PreviewSlot>> = {
  name: "header", starts_on: "header", ends_on: "header", venue_name: "header",
  primary_color: "colour", logo_url: "logo", banner_url: "banner",
};
const FIELD_OF: Record<PreviewSlot, BasicsField> = { header: "name", logo: "logo_url", banner: "banner_url", colour: "primary_color" };

/**
 * Event basics (D446): short groups with a line of help each, next to the portal home they shape
 * (D445). Saving and submitting are the shared step machinery's (D460).
 */
export function BasicsStep({ token, initial, initialRev, initialStatus, initialUnsubmitted }: {
  token: string;
  initial: BasicsAnswers;
  initialRev: number;
  initialStatus: SectionStatus;
  initialUnsubmitted: boolean;
}) {
  const step = useSectionAutosave({ token, section: "basics", initial, initialRev, initialStatus, initialUnsubmitted });
  const { answers: a, setAnswers: setA } = step;
  const [focused, setFocused] = useState<PreviewSlot | null>(null);
  const errors = basicsErrors(a);

  const set = (f: BasicsField) => (v: string) => setA((p) => ({ ...p, [f]: v }));
  const focus = (f: BasicsField) => () => setFocused(SLOT_OF[f] ?? null);
  const jump = (slot: PreviewSlot) => {
    setFocused(slot);
    document.querySelector<HTMLElement>(`[data-setup-field="${FIELD_OF[slot]}"]`)?.focus();
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

  return (
    <StepFrame token={token} title="Event basics" step={step} complete={basicsComplete(a)}
      preview={<HomePreview basics={a} focused={focused} onSlot={jump} />}>
      <StepGroup title="Your event" help="Shown at the top of the portal and in WhatsApp messages. All times are Malaysia time.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{text("name", "text", "Ecopia Kick-Off Meeting 2027")}</div>
          {text("starts_on", "date")}
          {text("ends_on", "date")}
          <div className="sm:col-span-2">{text("venue_name", "text", "Sunway Pyramid Convention Centre")}</div>
        </div>
      </StepGroup>

      <StepGroup title="How it looks" help="Send each image at about twice its on-screen size so it stays sharp on phones.">
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
      </StepGroup>

      <StepGroup title="People" help="Categories decide who sees what. The committee numbers get WhatsApp alerts when attendees ask to change a booking.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{area("categories", "One per line, e.g.\nStaff\nVendor\nVIP")}</div>
          <div className="sm:col-span-2">{area("committee_numbers", "One per line, e.g.\n012-345 6789")}</div>
        </div>
      </StepGroup>

      <StepGroup title="Anything else" help="Anything we should know that isn't asked above.">{area("notes", "", 4)}</StepGroup>
    </StepFrame>
  );
}
```

- [ ] **Step 6: Check nothing changed**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all pass, and the test count is unchanged from before this task.

Run `npm run dev`. Open a Basics step on `ecpkom` through its setup link (Admin → ecpkom → Setup → Open as organiser). Check each of these:

- typing shows "Saving…" then "Saved"
- the preview outlines a slot when its field is focused
- Submit behaves as before

Undo any test edits, so `ecpkom`'s Basics answers are what they were.

- [ ] **Step 7: Commit**

```bash
git pull --rebase --autostash
git add src/features/setup/portal/useSectionAutosave.ts src/features/setup/portal/StepFrame.tsx src/features/setup/preview/PhoneFrame.tsx src/features/setup/preview/HomePreview.tsx src/features/setup/portal/BasicsStep.tsx
git commit -m "refactor(setup): the step's save chain, frame and phone are shared, ready for Agenda and Info (D460)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Agenda answers and checks (pure)

**Files:**
- Create: `src/features/setup/sections/agenda.ts`
- Create: `tests/setup/fixtures.ts`
- Create: `tests/setup/agenda.test.ts`
- Modify: `src/features/setup/sections.ts` (add `problemSentence`)

**Interfaces:**
- Produces, all exported from `sections/agenda.ts`:
  - `SetupDay = { id; date; name }`
  - `SetupSession = { id; day; starts_at; ends_at; title; location; description; categories; image_url; round; rooms }` (all strings)
  - `AgendaAnswers = { days: SetupDay[]; sessions: SetupSession[] }`
  - `AgendaMap = Record<string, string>`
  - `DateRange = { first: string | null; last: string | null }`
  - `SessionField`
  - `blankAgenda()`
  - `blankSession(id, day)`
  - `sanitizeAgenda(raw)`
  - `sessionFromItem(item)`
  - `roomKey(sessionId, code)`
  - `agendaFromLive(days, items) → { answers, map }`
  - `restrictSeed(seed, ids)`
  - `seedIdsOf(answers)`
  - `agendaRange(basics | null, ev)`
  - `errorKey(id, field)`
  - `agendaErrors(a, range) → Record<string, string>`
  - `agendaMissing(a) → string[]`
  - `agendaProblems(a, range) → string[]`
  - `dayName(day, index)`
  - `previewAgenda(a) → { days: { id; date; name: string | null }[]; items: AgendaItem[] }`
- Produces `problemSentence(problems) → string | null` in `sections.ts`.

- [ ] **Step 1: Shared test builders**

`tests/setup/fixtures.ts`:

```ts
import type { AgendaDay, AgendaItem, InfoTab } from "@/lib/types";
import { blankSession, type SetupSession } from "@/features/setup/sections/agenda";

export const day = (id: string, date: string, name: string | null = null): AgendaDay => ({ id, org_id: "o", event_id: "e", date, name });

export const item = (o: Partial<AgendaItem> & Pick<AgendaItem, "id" | "day_id">): AgendaItem => ({
  event_id: "e", day: "2027-01-10", kind: "session", starts_at: "09:00", ends_at: null, title: "Session",
  description: null, location: null, categories: null, slot: null, code: null, color: null, image_url: null, sort_order: 10,
  ...o,
});

export const session = (id: string, dayId: string, o: Partial<SetupSession> = {}): SetupSession => ({
  ...blankSession(id, dayId), starts_at: "09:00", title: "Session", ...o,
});

export const tab = (id: string, title: string, html: string | null, sort_order: number): InfoTab => ({
  id, org_id: "o", event_id: "e", title, html, sort_order, categories: null,
});

/** Ids "n1", "n2", ... in order, so the rows a plan creates are predictable. */
export function counter(prefix = "n"): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}
```

- [ ] **Step 2: Write the failing tests**

`tests/setup/agenda.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  agendaErrors, agendaFromLive, agendaMissing, agendaProblems, agendaRange, errorKey, previewAgenda, restrictSeed, sanitizeAgenda, seedIdsOf,
  type AgendaAnswers,
} from "@/features/setup/sections/agenda";
import { problemSentence } from "@/features/setup/sections";
import { day, item, session } from "./fixtures";

const range = { first: "2027-01-10", last: "2027-01-11" };
const answers = (o: Partial<AgendaAnswers> = {}): AgendaAnswers => ({
  days: [{ id: "d1", date: "2027-01-10", name: "" }],
  sessions: [session("s1", "d1", { title: "Keynote" })],
  ...o,
});

describe("sanitizeAgenda", () => {
  it("keeps known fields as strings, cut to their limits", () => {
    const a = sanitizeAgenda({
      days: [{ id: "d1", date: "2027-01-10", name: "x".repeat(99), evil: 1 }],
      sessions: [{ id: "s1", day: "d1", title: "t".repeat(500), starts_at: "09:00", extra: "no" }],
    });
    expect(a.days[0].name).toHaveLength(60);
    expect("evil" in a.days[0]).toBe(false);
    expect(a.sessions[0].title).toHaveLength(160);
    expect("extra" in a.sessions[0]).toBe(false);
  });
  it("drops repeated or malformed ids, and sessions whose day is gone", () => {
    const a = sanitizeAgenda({
      days: [{ id: "d1", date: "" }, { id: "d1", date: "" }, { id: "bad id!", date: "" }],
      sessions: [{ id: "s1", day: "d1" }, { id: "s2", day: "nope" }, { id: "s1", day: "d1" }],
    });
    expect(a.days.map((d) => d.id)).toEqual(["d1"]);
    expect(a.sessions.map((s) => s.id)).toEqual(["s1"]);
  });
  it("reads anything that isn't an object as blank", () => {
    expect(sanitizeAgenda(null)).toEqual({ days: [], sessions: [] });
    expect(sanitizeAgenda([1])).toEqual({ days: [], sessions: [] });
  });
});

describe("agendaFromLive (D454)", () => {
  const days = [day("D1", "2027-01-10", "Day 1")];
  const items = [
    item({ id: "I2", day_id: "D1", starts_at: "10:00", title: "Talk", sort_order: 20, categories: ["Staff", "VIP"] }),
    item({ id: "I1", day_id: "D1", starts_at: "09:00", title: "Keynote", sort_order: 10, location: "Hall" }),
    item({ id: "P1", day_id: "D1", kind: "image", starts_at: null, title: "", image_url: "https://x/p.png", sort_order: 30 }),
    item({ id: "R1", day_id: "D1", starts_at: "14:00", title: "Breakout 1", slot: "Breakout 1", code: "3A", sort_order: 40 }),
    item({ id: "R2", day_id: "D1", starts_at: "14:00", title: "Breakout 1", slot: "Breakout 1", code: "3B", sort_order: 40 }),
  ];
  const { answers: a, map } = agendaFromLive(days, items);

  it("keeps real ids, so the map is the identity", () => {
    expect(a.days).toEqual([{ id: "D1", date: "2027-01-10", name: "Day 1" }]);
    expect(map).toMatchObject({ D1: "D1", I1: "I1", I2: "I2" });
  });
  it("lists sessions in agenda order and leaves image rows out", () => {
    expect(a.sessions.map((s) => s.id)).toEqual(["I1", "I2", "round:R1"]);
    expect(a.sessions[0]).toMatchObject({ title: "Keynote", location: "Hall", starts_at: "09:00", day: "D1" });
    expect(a.sessions[1].categories).toBe("Staff, VIP");
  });
  it("folds a breakout round into one session, its rooms mapped by code", () => {
    expect(a.sessions[2]).toMatchObject({ round: "Breakout 1", rooms: "3A, 3B", title: "", starts_at: "14:00" });
    expect(map["round:R1#3a"]).toBe("R1");
    expect(map["round:R1#3b"]).toBe("R2");
  });
  it("restrictSeed keeps only what the form showed", () => {
    const r = restrictSeed({ answers: a, map }, ["D1", "I1", "round:R1"]);
    expect(r.answers.sessions.map((s) => s.id)).toEqual(["I1", "round:R1"]);
    expect(Object.keys(r.map).sort()).toEqual(["D1", "I1", "round:R1#3a", "round:R1#3b"]);
    // A session whose day the form didn't show goes too.
    expect(restrictSeed({ answers: a, map }, ["I1"]).answers).toEqual({ days: [], sessions: [] });
  });
  it("seedIdsOf lists every day and session id", () => {
    expect(seedIdsOf(a)).toEqual(["D1", "I1", "I2", "round:R1"]);
  });
});

describe("agendaRange (D457)", () => {
  const ev = { starts_on: "2027-01-10", ends_on: "2027-01-11" };
  it("uses the organiser's Basics dates when both are dates", () => {
    expect(agendaRange({ starts_on: "2027-02-01", ends_on: "2027-02-02" }, ev)).toEqual({ first: "2027-02-01", last: "2027-02-02" });
  });
  it("else the live event's", () => {
    expect(agendaRange({ starts_on: "", ends_on: "2027-02-02" }, ev)).toEqual({ first: "2027-01-10", last: "2027-01-11" });
    expect(agendaRange(null, { starts_on: null, ends_on: null })).toEqual({ first: null, last: null });
  });
});

describe("agendaErrors", () => {
  it("passes a good agenda", () => {
    expect(agendaErrors(answers(), range)).toEqual({});
  });
  it("checks day dates: real, one day per date, inside the event", () => {
    const e = agendaErrors(answers({
      days: [
        { id: "d1", date: "2027-02-30", name: "" }, { id: "d2", date: "2027-01-11", name: "" },
        { id: "d3", date: "2027-01-11", name: "" }, { id: "d4", date: "2027-01-12", name: "" },
      ],
      sessions: [],
    }), range);
    expect(e[errorKey("d1", "date")]).toBe("Pick a date.");
    expect(e[errorKey("d2", "date")]).toBe("Another day already has this date.");
    expect(e[errorKey("d4", "date")]).toMatch(/^Outside the event dates/);
  });
  it("checks times, and that the end is after the start", () => {
    const e = agendaErrors(answers({
      sessions: [session("s1", "d1", { starts_at: "9am" }), session("s2", "d1", { starts_at: "10:00", ends_at: "09:30" })],
    }), range);
    expect(e[errorKey("s1", "starts_at")]).toBe("Use a time like 09:30.");
    expect(e[errorKey("s2", "ends_at")]).toBe("The end must be after the start.");
  });
  it("refuses two breakout rounds with one name", () => {
    const e = agendaErrors(answers({
      sessions: [session("r1", "d1", { round: "Breakout 1", rooms: "3A" }), session("r2", "d1", { round: "breakout 1 ", rooms: "3B" })],
    }), range);
    expect(e[errorKey("r2", "round")]).toBe("Another breakout round already has this name.");
  });
  it("checks nothing against dates it doesn't know", () => {
    expect(agendaErrors(answers({ days: [{ id: "d1", date: "2030-01-01", name: "" }] }), { first: null, last: null })).toEqual({});
  });
});

describe("agendaMissing, agendaProblems, problemSentence", () => {
  it("asks for a day, then sessions, then what each session needs", () => {
    expect(agendaMissing({ days: [], sessions: [] })).toEqual(["Add at least one day."]);
    expect(agendaMissing(answers({ sessions: [] }))).toEqual(["Day 1 has no sessions yet."]);
    expect(agendaMissing(answers({
      sessions: [session("s1", "d1", { starts_at: "", title: "" }), session("r1", "d1", { round: "Breakout 1", rooms: " , " })],
    }))).toEqual(["Day 1: a session needs a start time.", "Day 1: a session needs a title.", "Day 1: Breakout 1 needs its rooms."]);
    expect(agendaMissing(answers({ days: [{ id: "d1", date: "", name: "Gala" }] }))).toEqual(["Gala needs a date."]);
  });
  it("names where each error is", () => {
    const p = agendaProblems(answers({ days: [{ id: "d1", date: "2027-01-12", name: "Gala" }] }), range);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^Gala: Outside the event dates/);
    expect(agendaProblems(answers({ sessions: [session("s1", "d1", { title: "Keynote", ends_at: "08:00" })] }), range))
      .toEqual(["Day 1: Keynote: The end must be after the start."]);
  });
  it("says the first problem, and how many more", () => {
    expect(problemSentence([])).toBeNull();
    expect(problemSentence(["A."])).toBe("A.");
    expect(problemSentence(["A.", "B.", "C."])).toBe("A. (and 2 more)");
  });
});

describe("previewAgenda (D445)", () => {
  it("shows each day's sessions in time order, ties in the form's order", () => {
    const p = previewAgenda(answers({
      sessions: [session("a", "d1", { starts_at: "10:00", title: "A" }), session("b", "d1", { starts_at: "09:00", title: "B" }), session("c", "d1", { starts_at: "10:00", title: "C" })],
    }));
    expect(p.items.map((i) => i.title)).toEqual(["B", "A", "C"]);
    expect(p.days).toEqual([{ id: "d1", date: "2027-01-10", name: null }]);
  });
  it("draws a round as one row naming its rooms", () => {
    const p = previewAgenda(answers({ sessions: [session("r", "d1", { round: "Breakout 1", rooms: "3A, 3B", title: "" })] }));
    expect(p.items[0]).toMatchObject({ title: "Breakout 1", location: "Breakout 1 · rooms 3A, 3B", slot: null });
  });
  it("skips days without a usable date", () => {
    expect(previewAgenda(answers({ days: [{ id: "d1", date: "", name: "" }] })).days).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/setup/agenda.test.ts`
Expected: FAIL. The cause is "Cannot find module '@/features/setup/sections/agenda'" or a missing `problemSentence` export.

- [ ] **Step 4: Add `problemSentence` to `sections.ts`**

Append to `src/features/setup/sections.ts`:

```ts
/** Why Submit (or Apply) is refused, as one line: the first problem, and how many more there are. */
export function problemSentence(problems: readonly string[]): string | null {
  if (problems.length === 0) return null;
  return problems.length === 1 ? problems[0] : `${problems[0]} (and ${problems.length - 1} more)`;
}
```

- [ ] **Step 5: Write `sections/agenda.ts`**

```ts
import type { AgendaDay, AgendaItem } from "@/lib/types";
import { agendaRows, parseRoomCodes } from "@/lib/breakouts";
import { parseCategories } from "@/lib/agenda";
import { formatDateRange } from "@/lib/text";

/** A day of the programme as the organiser fills it in (D453). */
export type SetupDay = { id: string; date: string; name: string };
/**
 * A session as the organiser fills it in (D453). With a `round` name it is a breakout round:
 * `rooms` lists its room codes, and it has no location, categories or photo, as in admin.
 */
export type SetupSession = {
  id: string; day: string; starts_at: string; ends_at: string; title: string; location: string;
  description: string; categories: string; image_url: string; round: string; rooms: string;
};
export type AgendaAnswers = { days: SetupDay[]; sessions: SetupSession[] };
/** Setup id → real row id (D454). A round's rooms are keyed by `roomKey`. */
export type AgendaMap = Record<string, string>;
/** The dates the days must fall within. Either end may be unknown. */
export type DateRange = { first: string | null; last: string | null };

export const MAX_DAYS = 14;
export const MAX_SESSIONS = 300;
/** Setup ids: uuids, the live ids they start from, and `round:<uuid>`. Never "#" or ".", which keys use. */
const ID = /^[A-Za-z0-9:_-]{1,80}$/;
const DAY_LIMITS = { date: 10, name: 60 } as const;
const SESSION_LIMITS = {
  starts_at: 5, ends_at: 5, title: 160, location: 120, description: 2000, categories: 300, image_url: 600, round: 60, rooms: 400,
} as const;
export type SessionField = keyof typeof SESSION_LIMITS;
const SESSION_FIELDS = Object.keys(SESSION_LIMITS) as SessionField[];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const isDate = (s: string) => DATE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export function blankAgenda(): AgendaAnswers {
  return { days: [], sessions: [] };
}

export function blankSession(id: string, day: string): SetupSession {
  return { id, day, starts_at: "", ends_at: "", title: "", location: "", description: "", categories: "", image_url: "", round: "", rooms: "" };
}

const text = (v: unknown, max: number) => (typeof v === "string" || typeof v === "number" ? String(v).slice(0, max) : "");
const record = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/**
 * Whatever the browser sent, as answers: known fields only, each a string cut to its limit. Not
 * trimmed - this runs on every autosave, mid-typing. A repeated or malformed id is dropped, and so
 * is a session whose day isn't there.
 */
export function sanitizeAgenda(raw: unknown): AgendaAnswers {
  const out = blankAgenda();
  const o = record(raw);
  if (!o) return out;
  const seen = new Set<string>();
  const takeId = (v: unknown): string | null => {
    if (typeof v !== "string" || !ID.test(v) || seen.has(v)) return null;
    seen.add(v);
    return v;
  };
  for (const raw of Array.isArray(o.days) ? o.days.slice(0, MAX_DAYS) : []) {
    const r = record(raw);
    const id = r ? takeId(r.id) : null;
    if (!r || !id) continue;
    out.days.push({ id, date: text(r.date, DAY_LIMITS.date), name: text(r.name, DAY_LIMITS.name) });
  }
  const dayIds = new Set(out.days.map((d) => d.id));
  for (const raw of Array.isArray(o.sessions) ? o.sessions.slice(0, MAX_SESSIONS) : []) {
    const r = record(raw);
    if (!r || typeof r.day !== "string" || !dayIds.has(r.day)) continue;
    const id = takeId(r.id);
    if (!id) continue;
    const s = blankSession(id, r.day);
    for (const f of SESSION_FIELDS) s[f] = text(r[f], SESSION_LIMITS[f]);
    out.sessions.push(s);
  }
  return out;
}

/** A live session as an answer. Review and Apply compare against the live agenda in this form. */
export function sessionFromItem(i: AgendaItem): SetupSession {
  return {
    ...blankSession(i.id, i.day_id ?? ""),
    starts_at: i.starts_at ?? "", ends_at: i.ends_at ?? "", title: i.title, location: i.location ?? "",
    description: i.description ?? "", categories: (i.categories ?? []).join(", "), image_url: i.image_url ?? "",
  };
}

/** The map key for one room of a round (D454): lowercase, as the import matches room codes. */
export const roomKey = (sessionId: string, code: string) => `${sessionId}#${code.trim().toLowerCase()}`;

/**
 * The live agenda as answers, and the map tying each answer to its row (D454): what an organiser
 * opening Agenda for the first time starts from. Days and sessions keep their real ids, so the
 * map is the identity. A breakout round becomes one session, `round:<first room id>`, its rooms
 * mapped by code; a room with no code has nothing to show and stays out. Image rows and colours
 * aren't asked for (D453), so they are left out and never touched.
 */
export function agendaFromLive(days: AgendaDay[], items: AgendaItem[]): { answers: AgendaAnswers; map: AgendaMap } {
  const answers = blankAgenda();
  const map: AgendaMap = {};
  for (const d of days) {
    answers.days.push({ id: d.id, date: d.date, name: d.name ?? "" });
    map[d.id] = d.id;
  }
  const known = new Set(days.map((d) => d.id));
  for (const row of agendaRows(items)) {
    if (row.kind === "item") {
      const i = row.item;
      if (i.kind !== "session" || !i.day_id || !known.has(i.day_id)) continue;
      answers.sessions.push(sessionFromItem(i));
      map[i.id] = i.id;
      continue;
    }
    const first = row.items[0];
    if (!first.day_id || !known.has(first.day_id)) continue;
    const id = `round:${first.id}`;
    const codes = row.items.map((r) => r.code?.trim() ?? "").filter(Boolean);
    answers.sessions.push({
      ...blankSession(id, first.day_id),
      starts_at: row.starts_at ?? "", ends_at: row.ends_at ?? "",
      // Admin titles an untitled round after itself; the form shows that as "no title".
      title: first.title === row.slot ? "" : first.title,
      description: first.description ?? "", round: row.slot, rooms: codes.join(", "),
    });
    for (const r of row.items) if (r.code?.trim()) map[roomKey(id, r.code)] = r.id;
  }
  return { answers, map };
}

/**
 * The starting point limited to what the organiser's form showed (`ids`, D454): anything the
 * admin added after the page opened stays out, so Apply never reads it as removed.
 */
export function restrictSeed(seed: { answers: AgendaAnswers; map: AgendaMap }, ids: readonly string[]): { answers: AgendaAnswers; map: AgendaMap } {
  const keep = new Set(ids);
  const days = seed.answers.days.filter((d) => keep.has(d.id));
  const dayIds = new Set(days.map((d) => d.id));
  const sessions = seed.answers.sessions.filter((s) => keep.has(s.id) && dayIds.has(s.day));
  const kept = new Set([...dayIds, ...sessions.map((s) => s.id)]);
  const map = Object.fromEntries(Object.entries(seed.map).filter(([k]) => kept.has(k.split("#")[0])));
  return { answers: { days, sessions }, map };
}

/** Every id the answers hold: what the form started from, sent with the first save. */
export function seedIdsOf(a: AgendaAnswers): string[] {
  return [...a.days.map((d) => d.id), ...a.sessions.map((s) => s.id)];
}

/**
 * The dates days are checked against (D457): the organiser's own Basics dates when both are
 * dates, else the live event's. Apply passes the live event's alone.
 */
export function agendaRange(basics: { starts_on: string; ends_on: string } | null, ev: { starts_on: string | null; ends_on: string | null }): DateRange {
  const first = basics?.starts_on.trim() ?? "";
  const last = basics?.ends_on.trim() ?? "";
  if (isDate(first) && isDate(last)) return { first, last };
  return { first: ev.starts_on, last: ev.ends_on };
}

export const errorKey = (id: string, field: string) => `${id}.${field}`;
export const dayName = (d: SetupDay, index: number) => d.name.trim() || `Day ${index + 1}`;

/** Values that are wrong, keyed `<id>.<field>`. Empty fields are `agendaMissing`'s business. */
export function agendaErrors(a: AgendaAnswers, range: DateRange): Record<string, string> {
  const e: Record<string, string> = {};
  const dates = new Map<string, number>();
  for (const d of a.days) {
    const t = d.date.trim();
    if (t) dates.set(t, (dates.get(t) ?? 0) + 1);
  }
  for (const d of a.days) {
    const t = d.date.trim();
    if (!t) continue;
    if (!isDate(t)) e[errorKey(d.id, "date")] = "Pick a date.";
    else if ((dates.get(t) ?? 0) > 1) e[errorKey(d.id, "date")] = "Another day already has this date.";
    else if ((range.first && t < range.first) || (range.last && t > range.last)) {
      e[errorKey(d.id, "date")] = `Outside the event dates (${formatDateRange(range.first, range.last)}).`;
    }
  }
  const rounds = new Map<string, number>();
  for (const s of a.sessions) {
    const r = s.round.trim().toLowerCase();
    if (r) rounds.set(r, (rounds.get(r) ?? 0) + 1);
  }
  for (const s of a.sessions) {
    const start = s.starts_at.trim();
    const end = s.ends_at.trim();
    if (start && !TIME.test(start)) e[errorKey(s.id, "starts_at")] = "Use a time like 09:30.";
    if (end && !TIME.test(end)) e[errorKey(s.id, "ends_at")] = "Use a time like 10:30.";
    else if (end && TIME.test(start) && end <= start) e[errorKey(s.id, "ends_at")] = "The end must be after the start.";
    const r = s.round.trim().toLowerCase();
    if (r && (rounds.get(r) ?? 0) > 1) e[errorKey(s.id, "round")] = "Another breakout round already has this name.";
  }
  return e;
}

/** What still has to be filled in before Submit, as sentences the organiser reads. */
export function agendaMissing(a: AgendaAnswers): string[] {
  if (a.days.length === 0) return ["Add at least one day."];
  const out: string[] = [];
  a.days.forEach((d, n) => {
    const label = dayName(d, n);
    if (!d.date.trim()) out.push(`${label} needs a date.`);
    const mine = a.sessions.filter((s) => s.day === d.id);
    if (mine.length === 0) out.push(`${label} has no sessions yet.`);
    for (const s of mine) {
      const what = s.title.trim() || s.round.trim() || "a session";
      if (!s.starts_at.trim()) out.push(`${label}: ${what} needs a start time.`);
      if (!s.round.trim() && !s.title.trim()) out.push(`${label}: a session needs a title.`);
      if (s.round.trim() && parseRoomCodes(s.rooms).length === 0) out.push(`${label}: ${s.round.trim()} needs its rooms.`);
    }
  });
  return out;
}

/** Everything stopping Submit or Apply, each naming where it is: "Day 2: Keynote: The end must be after the start." */
export function agendaProblems(a: AgendaAnswers, range: DateRange): string[] {
  const where = new Map<string, string>();
  a.days.forEach((d, n) => where.set(d.id, dayName(d, n)));
  for (const s of a.sessions) where.set(s.id, `${where.get(s.day)}: ${s.title.trim() || s.round.trim() || "a session"}`);
  const errors = Object.entries(agendaErrors(a, range)).map(([k, m]) => `${where.get(k.split(".")[0]) ?? "Agenda"}: ${m}`);
  return [...agendaMissing(a), ...errors];
}

export type PreviewAgenda = { days: { id: string; date: string; name: string | null }[]; items: AgendaItem[] };

/**
 * The answers as the portal agenda shows them (D445, D456): days with a usable date, each day's
 * sessions by start time (ties keep the form's order), a breakout round as one row listing its
 * rooms - an attendee sees only their own room, which the preview can't know.
 */
export function previewAgenda(a: AgendaAnswers): PreviewAgenda {
  const days = a.days
    .filter((d) => isDate(d.date.trim()))
    .map((d) => ({ id: d.id, date: d.date.trim(), name: d.name.trim() || null }))
    .sort((x, y) => x.date.localeCompare(y.date));
  const dateOf = new Map(days.map((d) => [d.id, d.date]));
  const items: AgendaItem[] = [];
  a.sessions.forEach((s, n) => {
    const date = dateOf.get(s.day);
    if (!date) return;
    const round = s.round.trim();
    items.push({
      id: s.id, event_id: "", day_id: s.day, day: date, kind: "session",
      starts_at: TIME.test(s.starts_at.trim()) ? s.starts_at.trim() : "--:--",
      ends_at: TIME.test(s.ends_at.trim()) ? s.ends_at.trim() : null,
      title: s.title.trim() || round || "Untitled session",
      description: s.description.trim() || null,
      location: round ? `${round} · rooms ${parseRoomCodes(s.rooms).join(", ") || "to be named"}` : s.location.trim() || null,
      categories: round ? null : parseCategories(s.categories),
      slot: null, code: null, color: null,
      image_url: round ? null : s.image_url.trim() || null,
      sort_order: n,
    });
  });
  items.sort((x, y) => x.day.localeCompare(y.day) || (x.starts_at ?? "").localeCompare(y.starts_at ?? "") || x.sort_order - y.sort_order);
  return { days, items };
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/setup/agenda.test.ts`
Expected: PASS. If `formatDateRange` throws on a `null` end, change the call to fall back to `range.first ?? range.last` and say so in the report.

- [ ] **Step 7: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint && npm test
git pull --rebase --autostash
git add src/features/setup/sections/agenda.ts src/features/setup/sections.ts tests/setup/fixtures.ts tests/setup/agenda.test.ts
git commit -m "feat(setup): the Agenda section's answers, starting point and checks (D453, D454, D457)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The Agenda planner (pure)

**Files:**
- Create: `src/features/setup/sections/changes.ts`
- Create: `src/features/setup/sections/agenda-apply.ts`
- Create: `tests/setup/changes.test.ts`
- Create: `tests/setup/agenda-apply.test.ts`

**Interfaces:**
- Consumes from Task 2:
  - `AgendaAnswers`, `AgendaMap`, `SetupDay`, `SetupSession`
  - `blankAgenda`, `roomKey`, `sanitizeAgenda`, `agendaFromLive`
- Produces, in `changes.ts`:
  - `PlanChange = { what: "day" | "session" | "round" | "tab" | "floor plan"; how: "added" | "changed" | "removed" | "kept"; label: string; lines: string[] }`
  - `changeSummary(changes) → string`
  - `RESTORED` (the verbatim note)
- Produces, in `agenda-apply.ts`:
  - `AgendaLive = { days: AgendaDay[]; items: AgendaItem[]; assigned: Record<string, number> }`
  - `DayInsert`, `DayUpdate`, `ItemValues`, `ItemInsert`, `ItemUpdate`
  - `AgendaPlan = { days: { insert; update; delete }; items: { insert; update; delete }; order: { id; sort_order }[]; map: AgendaMap; changes: PlanChange[]; problems: string[] }`
  - `agendaBaseline(row) → AgendaAnswers`
  - `planAgenda({ submitted, baseline, map, live, newId }) → AgendaPlan`

- [ ] **Step 1: Write the failing tests**

`tests/setup/changes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { changeSummary, type PlanChange } from "@/features/setup/sections/changes";

const c = (what: PlanChange["what"], how: PlanChange["how"]): PlanChange => ({ what, how, label: "x", lines: [] });

describe("changeSummary (D449)", () => {
  it("counts by kind, then by what happened, and leaves out what was kept", () => {
    const changes = [c("session", "added"), c("session", "added"), c("session", "added"), c("session", "changed"), c("session", "removed"), c("day", "added"), c("day", "kept")];
    expect(changeSummary(changes)).toBe("1 day added · 3 sessions added, 1 changed, 1 removed");
  });
  it("says nothing when nothing is written", () => {
    expect(changeSummary([c("day", "kept")])).toBe("");
  });
  it("uses the singular for one", () => {
    expect(changeSummary([c("round", "changed"), c("tab", "removed")])).toBe("1 breakout round changed · 1 tab removed");
  });
});
```

`tests/setup/agenda-apply.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { agendaFromLive, blankAgenda, type AgendaAnswers, type AgendaMap } from "@/features/setup/sections/agenda";
import { agendaBaseline, planAgenda, type AgendaLive } from "@/features/setup/sections/agenda-apply";
import { changeSummary, RESTORED } from "@/features/setup/sections/changes";
import type { AgendaDay, AgendaItem } from "@/lib/types";
import { counter, day, item, session } from "./fixtures";

const live = (days: AgendaDay[], items: AgendaItem[], assigned: Record<string, number> = {}): AgendaLive => ({ days, items, assigned });
const plan = (S: AgendaAnswers, B: AgendaAnswers, map: AgendaMap, l: AgendaLive) => planAgenda({ submitted: S, baseline: B, map, live: l, newId: counter() });
/** The live agenda as the organiser's starting point: their baseline and map at once. */
const seeded = (l: AgendaLive) => agendaFromLive(l.days, l.items);
const NOTHING = { insert: [], update: [], delete: [] };

const L = live([day("D1", "2027-01-10")], [item({ id: "I1", day_id: "D1", title: "Keynote", sort_order: 10 })]);

describe("agendaBaseline (D450)", () => {
  const a = { days: [{ id: "a", date: "2027-01-10", name: "" }], sessions: [] };
  const s = { days: [{ id: "s", date: "2027-01-10", name: "" }], sessions: [] };
  it("prefers the last applied version, then the starting point, else nothing", () => {
    expect(agendaBaseline({ applied: a, seed: s }).days[0].id).toBe("a");
    expect(agendaBaseline({ applied: null, seed: s }).days[0].id).toBe("s");
    expect(agendaBaseline(null)).toEqual(blankAgenda());
  });
});

describe("planAgenda (D450, D455, D456)", () => {
  it("first Apply onto an empty agenda creates the days and sessions, placed by time", () => {
    const S: AgendaAnswers = {
      days: [{ id: "d1", date: "2027-01-10", name: "Day 1" }],
      sessions: [session("s1", "d1", { starts_at: "10:00", title: "Lunch" }), session("s2", "d1", { starts_at: "09:00", title: "Keynote" })],
    };
    const p = plan(S, blankAgenda(), {}, live([], []));
    expect(p.days.insert).toEqual([{ id: "n1", date: "2027-01-10", name: "Day 1" }]);
    expect(p.items.insert.map((i) => [i.id, i.title, i.day_id, i.sort_order])).toEqual([["n2", "Lunch", "n1", 20], ["n3", "Keynote", "n1", 10]]);
    expect(p.map).toEqual({ d1: "n1", s1: "n2", s2: "n3" });
    expect(changeSummary(p.changes)).toBe("1 day added · 2 sessions added");
    expect(p.problems).toEqual([]);
  });

  it("writes nothing when the organiser changed nothing", () => {
    const { answers, map } = seeded(L);
    const p = plan(answers, answers, map, L);
    expect([p.days, p.items, p.order, p.changes]).toEqual([NOTHING, NOTHING, [], []]);
    expect(p.map).toEqual(map);
  });

  it("writes only the fields the organiser changed, so an admin's edit to another field survives", () => {
    const { answers: B, map } = seeded(L);
    const now = live(L.days, [{ ...L.items[0], title: "Opening keynote" }]);
    const p = plan({ ...B, sessions: [{ ...B.sessions[0], location: "Hall A" }] }, B, map, now);
    expect(p.items.update).toEqual([{ id: "I1", location: "Hall A" }]);
    expect(p.changes).toEqual([{ what: "session", how: "changed", label: "Keynote", lines: ["Location: empty → Hall A"] }]);
  });

  it("skips a change the live agenda already has, so the review lists exactly what Apply writes", () => {
    const { answers: B, map } = seeded(L);
    const now = live(L.days, [{ ...L.items[0], title: "Opening keynote" }]);
    const p = plan({ ...B, sessions: [{ ...B.sessions[0], title: "Opening keynote" }] }, B, map, now);
    expect(p.items.update).toEqual([]);
    expect(p.changes).toEqual([]);
  });

  it("a session the admin deleted stays deleted while the organiser leaves it alone", () => {
    const { answers: B, map } = seeded(L);
    const p = plan(B, B, map, live(L.days, []));
    expect(p.items.insert).toEqual([]);
    expect(p.map.I1).toBe("I1");
  });

  it("comes back when the organiser changes it again", () => {
    const { answers: B, map } = seeded(L);
    const p = plan({ ...B, sessions: [{ ...B.sessions[0], title: "Keynote 2" }] }, B, map, live(L.days, []));
    expect(p.items.insert).toMatchObject([{ id: "n1", title: "Keynote 2", day_id: "D1" }]);
    expect(p.map.I1).toBe("n1");
    expect(p.changes[0]).toMatchObject({ what: "session", how: "added" });
    expect(p.changes[0].lines).toContain(RESTORED);
  });

  it("deletes a session the organiser removed", () => {
    const { answers: B, map } = seeded(L);
    const p = plan({ ...B, sessions: [] }, B, map, L);
    expect(p.items.delete).toEqual(["I1"]);
    expect(p.map).toEqual({ D1: "D1" });
  });

  it("a new day on a date the admin already has uses that day", () => {
    const S = { days: [{ id: "d9", date: "2027-01-11", name: "Gala" }], sessions: [session("s1", "d9")] };
    const p = plan(S, blankAgenda(), {}, live([day("D2", "2027-01-11")], []));
    expect(p.days.insert).toEqual([]);
    expect(p.days.update).toEqual([{ id: "D2", name: "Gala" }]);
    expect(p.items.insert[0].day_id).toBe("D2");
    expect(p.map.d9).toBe("D2");
  });

  it("removes a day only when nothing the admin added is on it", () => {
    const { answers: B, map } = seeded(L);
    const empty = { days: [], sessions: [] };
    expect(plan(empty, B, map, L).days.delete).toEqual(["D1"]);
    const withAdmin = live(L.days, [...L.items, item({ id: "A1", day_id: "D1", title: "Admin's" })]);
    const p = plan(empty, B, map, withAdmin);
    expect(p.days.delete).toEqual([]);
    expect(p.items.delete).toEqual(["I1"]);
    expect(p.changes.find((c) => c.what === "day")).toMatchObject({ how: "kept" });
  });

  it("re-places a retimed session by its new time and leaves the rest in hand order", () => {
    const L4 = live([day("D1", "2027-01-10")], [
      item({ id: "I1", day_id: "D1", starts_at: "09:00", sort_order: 10 }),
      item({ id: "I2", day_id: "D1", starts_at: "10:00", sort_order: 20 }),
      item({ id: "I3", day_id: "D1", starts_at: "11:00", sort_order: 30 }),
    ]);
    const { answers: B, map } = seeded(L4);
    const S = { ...B, sessions: B.sessions.map((s) => (s.id === "I1" ? { ...s, starts_at: "10:30" } : s)) };
    const p = plan(S, B, map, L4);
    expect(p.items.update).toEqual([{ id: "I1", starts_at: "10:30" }]);
    expect(p.order).toEqual([{ id: "I2", sort_order: 10 }, { id: "I1", sort_order: 20 }]);
  });

  it("refuses two days on one date", () => {
    const L3 = live([day("D1", "2027-01-10"), day("D2", "2027-01-11")], []);
    // The organiser's form showed D1 only; the admin added D2 since.
    const B = { days: [{ id: "D1", date: "2027-01-10", name: "" }], sessions: [] };
    const p = plan({ days: [{ id: "D1", date: "2027-01-11", name: "" }], sessions: [] }, B, { D1: "D1" }, L3);
    expect(p.problems).toHaveLength(1);
    expect(p.problems[0]).toMatch(/^Two days would fall on /);
  });
});

describe("breakout rounds (D453)", () => {
  it("a new round becomes one row per room, sharing one place", () => {
    const S = {
      days: [{ id: "d1", date: "2027-01-10", name: "" }],
      sessions: [session("s1", "d1", { starts_at: "09:00", title: "Keynote" }), session("r", "d1", { starts_at: "14:00", title: "", round: "Breakout 1", rooms: "3A, 3b, 3A" })],
    };
    const p = plan(S, blankAgenda(), {}, live([], []));
    const rooms = p.items.insert.filter((i) => i.slot);
    expect(rooms.map((i) => [i.code, i.title, i.slot, i.location, i.sort_order])).toEqual([["3A", "Breakout 1", "Breakout 1", null, 20], ["3b", "Breakout 1", "Breakout 1", null, 20]]);
    expect(p.map["r#3a"]).toBe(rooms[0].id);
    expect(p.map["r#3b"]).toBe(rooms[1].id);
  });

  const Lr = live([day("D1", "2027-01-10")], [
    item({ id: "R1", day_id: "D1", starts_at: "14:00", title: "Breakout 1", slot: "Breakout 1", code: "3A", sort_order: 10 }),
    item({ id: "R2", day_id: "D1", starts_at: "14:00", title: "Breakout 1", slot: "Breakout 1", code: "3B", sort_order: 10 }),
  ], { R2: 4 });
  const B = { days: [{ id: "D1", date: "2027-01-10", name: "" }], sessions: [session("r", "D1", { starts_at: "14:00", title: "", round: "Breakout 1", rooms: "3A, 3B" })] };
  const map = { D1: "D1", "r#3a": "R1", "r#3b": "R2" };

  it("renames every room, the admin's too, adds and removes rooms, and says who loses a room", () => {
    const withAdminRoom = live(Lr.days, [...Lr.items, item({ id: "R3", day_id: "D1", starts_at: "14:00", title: "Breakout 1", slot: "Breakout 1", code: "3C", sort_order: 10 })], Lr.assigned);
    const p = plan({ ...B, sessions: [{ ...B.sessions[0], round: "Breakout A", rooms: "3A, 3D" }] }, B, map, withAdminRoom);
    expect(p.items.update).toEqual([{ id: "R1", title: "Breakout A", slot: "Breakout A" }, { id: "R3", title: "Breakout A", slot: "Breakout A" }]);
    expect(p.items.delete).toEqual(["R2"]);
    expect(p.items.insert).toMatchObject([{ id: "n1", code: "3D", slot: "Breakout A", title: "Breakout A", day_id: "D1", starts_at: "14:00", sort_order: 10 }]);
    expect(p.map).toEqual({ D1: "D1", "r#3a": "R1", "r#3d": "n1" });
    expect(p.changes).toEqual([{
      what: "round", how: "changed", label: "Breakout A",
      lines: ["Title: Breakout 1 → Breakout A", "Round name: Breakout 1 → Breakout A", "Rooms added: 3D", "Rooms removed: 3B — 4 assigned people lose their rooms"],
    }]);
    expect(p.problems).toEqual([]);
  });

  it("refuses a name another round already has", () => {
    const other = live(Lr.days, [...Lr.items, item({ id: "X1", day_id: "D1", slot: "Breakout 2", code: "1", title: "Breakout 2" })]);
    const p = plan({ ...B, sessions: [{ ...B.sessions[0], round: "Breakout 2" }] }, B, map, other);
    expect(p.problems).toEqual(["There's already a breakout round called “Breakout 2”. Rename one of them."]);
  });

  it("removing a round deletes only its mapped rooms", () => {
    const p = plan({ ...B, sessions: [] }, B, map, Lr);
    expect(p.items.delete).toEqual(["R1", "R2"]);
    expect(p.changes[0]).toMatchObject({ what: "round", how: "removed", label: "Breakout 1" });
  });

  it("turning a session into a round replaces its row with the rooms", () => {
    const { answers: B1, map: m1 } = seeded(L);
    const S = { ...B1, sessions: [{ ...B1.sessions[0], round: "Breakout 1", rooms: "1, 2" }] };
    const p = plan(S, B1, m1, L);
    expect(p.items.delete).toEqual(["I1"]);
    expect(p.items.insert.map((i) => i.code)).toEqual(["1", "2"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/setup/changes.test.ts tests/setup/agenda-apply.test.ts`
Expected: FAIL, with "Cannot find module".

- [ ] **Step 3: Write `sections/changes.ts`**

```ts
/** One line of a review (D449): what Apply does to one day, session, round, tab or the floor plan. */
export type PlanChange = {
  what: "day" | "session" | "round" | "tab" | "floor plan";
  how: "added" | "changed" | "removed" | "kept";
  label: string;
  lines: string[];
};

/** The note on an item the admin deleted that the organiser changed again (D450). */
export const RESTORED = "Deleted in admin; added back because the organiser changed it.";

const NOUNS: Record<PlanChange["what"], [string, string]> = {
  day: ["day", "days"], session: ["session", "sessions"], round: ["breakout round", "breakout rounds"],
  tab: ["tab", "tabs"], "floor plan": ["floor plan", "floor plans"],
};
const HOWS = ["added", "changed", "removed"] as const;

/**
 * The review's one-line summary: "1 day added · 3 sessions added, 1 changed, 1 removed". "Kept"
 * lines are notes, not writes, so they aren't counted. Empty when nothing is written.
 */
export function changeSummary(changes: readonly PlanChange[]): string {
  const parts: string[] = [];
  for (const what of Object.keys(NOUNS) as PlanChange["what"][]) {
    const counts = HOWS.map((how) => [how, changes.filter((c) => c.what === what && c.how === how).length] as const).filter(([, n]) => n > 0);
    if (counts.length === 0) continue;
    const [[how, n], ...rest] = counts;
    parts.push([`${n} ${NOUNS[what][n === 1 ? 0 : 1]} ${how}`, ...rest.map(([h, m]) => `${m} ${h}`)].join(", "));
  }
  return parts.join(" · ");
}
```

- [ ] **Step 4: Write `sections/agenda-apply.ts`**

```ts
import type { AgendaDay, AgendaItem } from "@/lib/types";
import { agendaRows, parseRoomCodes } from "@/lib/breakouts";
import { parseCategories } from "@/lib/agenda";
import { placeKey, rowKey, sortOrdersFor } from "@/lib/agenda-placement";
import { shortDate } from "@/lib/text";
import { blankAgenda, roomKey, sanitizeAgenda, type AgendaAnswers, type AgendaMap, type SetupDay, type SetupSession } from "./agenda";
import { RESTORED, type PlanChange } from "./changes";

/** The event's agenda now, plus how many people are assigned to each breakout room. */
export type AgendaLive = { days: AgendaDay[]; items: AgendaItem[]; assigned: Record<string, number> };

export type DayInsert = { id: string; date: string; name: string | null };
export type DayUpdate = { id: string; date?: string; name?: string | null };
export type ItemValues = {
  day_id: string; starts_at: string; ends_at: string | null; title: string; description: string | null;
  location: string | null; categories: string[] | null; image_url: string | null; slot: string | null; code: string | null;
};
export type ItemInsert = ItemValues & { id: string; sort_order: number };
export type ItemUpdate = { id: string } & Partial<ItemValues>;

/** Everything one Apply writes (D455), what the review lists, and why it would refuse. */
export type AgendaPlan = {
  days: { insert: DayInsert[]; update: DayUpdate[]; delete: string[] };
  items: { insert: ItemInsert[]; update: ItemUpdate[]; delete: string[] };
  order: { id: string; sort_order: number }[];
  /** The whole new applied_map. */
  map: AgendaMap;
  changes: PlanChange[];
  problems: string[];
};

type Shared = Omit<ItemValues, "day_id" | "code">;
type Key = keyof Shared | "day_id";

const LABELS: Record<Key, string> = {
  starts_at: "Start", ends_at: "End", title: "Title", description: "Description", location: "Location",
  categories: "Who it's for", image_url: "Photo", slot: "Round name", day_id: "Day",
};

const nul = (s: string) => s.trim() || null;
/** "" and [] read as null, so a blank from admin and a blank in the answers are the same. */
const norm = (v: unknown) => (v === "" || (Array.isArray(v) && v.length === 0) || v === undefined ? null : v);
const same = (a: unknown, b: unknown) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
const show = (v: unknown) => {
  const n = norm(v);
  return n === null ? "empty" : Array.isArray(n) ? n.join(", ") : String(n);
};
const dayText = (d: Pick<SetupDay, "date" | "name">) => d.name.trim() || (d.date.trim() ? shortDate(d.date.trim()) : "A day");
const timeText = (w: Shared) => (w.ends_at ? `${w.starts_at}–${w.ends_at}` : w.starts_at);

/**
 * A session's answer as Apply writes it: trimmed, blanks as null, categories as a list. A round
 * writes no location, categories or photo (D453), and is titled after itself when untitled.
 */
function written(s: SetupSession): Shared {
  const round = s.round.trim();
  return {
    starts_at: s.starts_at.trim(),
    ends_at: nul(s.ends_at),
    title: s.title.trim() || round,
    description: nul(s.description),
    location: round ? null : nul(s.location),
    categories: round ? null : parseCategories(s.categories),
    image_url: round ? null : nul(s.image_url),
    slot: round || null,
  };
}

function writtenLive(i: AgendaItem): Shared {
  return {
    starts_at: i.starts_at ?? "", ends_at: i.ends_at, title: i.title, description: i.description, location: i.location,
    categories: i.categories?.length ? i.categories : null, image_url: i.image_url, slot: i.slot?.trim() || null,
  };
}

/** The fields the organiser changed since the baseline. A move between days compares setup day ids. */
function changedKeys(s: SetupSession, b: SetupSession): Key[] {
  const w = written(s);
  const wb = written(b);
  const keys: Key[] = (Object.keys(w) as (keyof Shared)[]).filter((k) => !same(w[k], wb[k]));
  return s.day !== b.day ? [...keys, "day_id"] : keys;
}

/** The organiser's baseline for Apply (D450): the last applied version, else their starting point, else nothing. */
export function agendaBaseline(row: { applied: unknown; seed: unknown } | null): AgendaAnswers {
  if (row?.applied) return sanitizeAgenda(row.applied);
  if (row?.seed) return sanitizeAgenda(row.seed);
  return blankAgenda();
}

/**
 * What Apply writes (D450, D455, D456). Compares the submitted answers with the baseline, matches
 * them to real rows through `map`, and writes only what the organiser changed that the live
 * agenda doesn't already hold:
 * - a field the organiser left alone is never written, so an admin's edit survives;
 * - an item the admin deleted stays deleted unless the organiser changed it again;
 * - items the admin created are never touched, except that a round's shared fields and its name
 *   go to every room in it, the admin's rooms too - a round is one thing;
 * - a day the organiser removed goes only when nothing the admin added is on it;
 * - new, retimed and moved rows are placed by time among their day's rows (D456).
 * `newId` names new rows; Apply passes crypto.randomUUID, review a counter.
 */
export function planAgenda({ submitted: S, baseline: B, map, live, newId }: {
  submitted: AgendaAnswers;
  baseline: AgendaAnswers;
  map: AgendaMap;
  live: AgendaLive;
  newId: () => string;
}): AgendaPlan {
  const plan: AgendaPlan = {
    days: { insert: [], update: [], delete: [] }, items: { insert: [], update: [], delete: [] },
    order: [], map: {}, changes: [], problems: [],
  };
  const change = (c: PlanChange) => plan.changes.push(c);
  const liveDays = new Map(live.days.map((d) => [d.id, d]));
  const liveItems = new Map(live.items.map((i) => [i.id, i]));
  const bDays = new Map(B.days.map((d) => [d.id, d]));
  const bSessions = new Map(B.sessions.map((s) => [s.id, s]));
  const sDays = new Map(S.days.map((d) => [d.id, d]));
  const sSessionIds = new Set(S.sessions.map((s) => s.id));
  /** Rows to place by time, per day: a session's id or a round's `slot:<name>`. */
  const touched: { day: string; key: string; time: string }[] = [];
  /** Which setup round each real room belongs to, for the name check. */
  const owner = new Map<string, string>();

  // Days. A submitted day's own row while it exists; `claimed` rows are spoken for, so a new day
  // adopts an admin's day on its date without taking one another day uses.
  const real = new Map<string, string>();
  for (const d of S.days) {
    const r = map[d.id];
    if (r && liveDays.has(r)) real.set(d.id, r);
  }
  const claimed = new Set(real.values());

  /** The row a submitted day writes to, made on first need: its own, else an admin's day on its date, else a new one. */
  const needDay = (d: SetupDay, note?: string): string => {
    const have = real.get(d.id);
    if (have) return have;
    const date = d.date.trim();
    const adopt = live.days.find((x) => x.date === date && !claimed.has(x.id));
    if (adopt) {
      real.set(d.id, adopt.id);
      claimed.add(adopt.id);
      const name = nul(d.name);
      if (name && name !== (adopt.name?.trim() || null)) {
        plan.days.update.push({ id: adopt.id, name });
        change({ what: "day", how: "changed", label: dayText(d), lines: [`Name: ${show(adopt.name)} → ${name}`] });
      }
      return adopt.id;
    }
    const id = newId();
    real.set(d.id, id);
    claimed.add(id);
    plan.days.insert.push({ id, date, name: nul(d.name) });
    change({ what: "day", how: "added", label: dayText(d), lines: note ? [note] : [] });
    return id;
  };

  for (const d of S.days) {
    const b = bDays.get(d.id);
    if (!b || !map[d.id]) { needDay(d); continue; }
    const ld = liveDays.get(real.get(d.id) ?? "");
    const dateChanged = d.date.trim() !== b.date.trim();
    const nameChanged = nul(d.name) !== nul(b.name);
    if (!ld) {
      if (dateChanged || nameChanged) needDay(d, RESTORED);
      continue;
    }
    const patch: DayUpdate = { id: ld.id };
    const lines: string[] = [];
    if (dateChanged && d.date.trim() !== ld.date) {
      patch.date = d.date.trim();
      lines.push(`Date: ${shortDate(ld.date)} → ${shortDate(d.date.trim())}`);
    }
    if (nameChanged && nul(d.name) !== (ld.name?.trim() || null)) {
      patch.name = nul(d.name);
      lines.push(`Name: ${show(ld.name)} → ${show(nul(d.name))}`);
    }
    if (lines.length) {
      plan.days.update.push(patch);
      change({ what: "day", how: "changed", label: dayText(d), lines });
    }
  }

  const dayOf = (s: SetupSession) => sDays.get(s.day)!;
  const roomsOf = (s: SetupSession) => parseRoomCodes(s.rooms);
  const roomsLost = (gone: { code: string; id: string }[]) => {
    const people = gone.reduce((n, g) => n + (live.assigned[g.id] ?? 0), 0);
    const who = people === 0 ? "" : ` — ${people} assigned ${people === 1 ? "person loses their room" : "people lose their rooms"}`;
    return `Rooms removed: ${gone.map((g) => g.code).join(", ")}${who}`;
  };

  const insertSession = (s: SetupSession, note?: string) => {
    const d = dayOf(s);
    const dayId = needDay(d);
    const w = written(s);
    const notes = note ? [note] : [];
    if (!w.slot) {
      const id = newId();
      plan.items.insert.push({ id, day_id: dayId, ...w, code: null, sort_order: 0 });
      plan.map[s.id] = id;
      touched.push({ day: dayId, key: id, time: w.starts_at });
      change({ what: "session", how: "added", label: w.title, lines: [`${dayText(d)}, ${timeText(w)}`, ...notes] });
      return;
    }
    const codes = roomsOf(s);
    for (const code of codes) {
      const id = newId();
      plan.items.insert.push({ id, day_id: dayId, ...w, code, sort_order: 0 });
      plan.map[roomKey(s.id, code)] = id;
      owner.set(id, s.id);
    }
    touched.push({ day: dayId, key: `slot:${w.slot}`, time: w.starts_at });
    change({ what: "round", how: "added", label: w.slot, lines: [`${dayText(d)}, ${timeText(w)}`, `Rooms: ${codes.join(", ")}`, ...notes] });
  };

  const removeSession = (b: SetupSession) => {
    if (!b.round.trim()) {
      const r = map[b.id];
      const li = r ? liveItems.get(r) : undefined;
      if (!li) return;
      plan.items.delete.push(li.id);
      change({ what: "session", how: "removed", label: li.title, lines: [] });
      return;
    }
    const gone = roomsOf(b).flatMap((code) => {
      const r = map[roomKey(b.id, code)];
      return r && liveItems.has(r) ? [{ code, id: r }] : [];
    });
    if (gone.length === 0) return;
    for (const g of gone) plan.items.delete.push(g.id);
    change({ what: "round", how: "removed", label: liveItems.get(gone[0].id)!.slot?.trim() || b.round.trim(), lines: [roomsLost(gone)] });
  };

  const updateSession = (s: SetupSession, b: SetupSession) => {
    const r = map[s.id];
    const li = liveItems.get(r);
    const keys = changedKeys(s, b);
    if (!li) {
      if (keys.length) insertSession(s, RESTORED);
      else plan.map[s.id] = r;
      return;
    }
    plan.map[s.id] = r;
    const d = dayOf(s);
    const w = written(s);
    const lw = writtenLive(li);
    const patch: ItemUpdate = { id: li.id };
    const lines: string[] = [];
    for (const k of keys) {
      if (k === "day_id") {
        const to = needDay(d);
        if (to !== li.day_id) { patch.day_id = to; lines.push(`Day: ${shortDate(li.day)} → ${dayText(d)}`); }
        continue;
      }
      if (!same(w[k], lw[k])) {
        (patch as Record<string, unknown>)[k] = w[k];
        lines.push(`${LABELS[k]}: ${show(lw[k])} → ${show(w[k])}`);
      }
    }
    if (!lines.length) return;
    plan.items.update.push(patch);
    change({ what: "session", how: "changed", label: w.title, lines });
    if (patch.day_id || patch.starts_at) touched.push({ day: patch.day_id ?? li.day_id!, key: li.id, time: patch.starts_at ?? li.starts_at ?? w.starts_at });
  };

  const updateRound = (s: SetupSession, b: SetupSession) => {
    const fold = (c: string) => c.toLowerCase();
    const before = new Set(roomsOf(b).map(fold));
    const after = roomsOf(s);
    const wanted = new Set(after.map(fold));
    const mine = roomsOf(b).flatMap((code) => {
      const r = map[roomKey(s.id, code)];
      return r ? [{ code, id: r }] : [];
    });
    const alive = mine.filter((m) => liveItems.has(m.id));
    const keys = changedKeys(s, b);
    const added = after.filter((c) => !before.has(fold(c)));
    if (alive.length === 0) {
      // Every room was deleted in admin: back only if the organiser changed the round again.
      if (keys.length || added.length) { insertSession(s, RESTORED); return; }
      for (const m of mine) if (wanted.has(fold(m.code))) plan.map[roomKey(s.id, m.code)] = m.id;
      return;
    }
    const removed = alive.filter((m) => !wanted.has(fold(m.code)));
    const removedIds = new Set(removed.map((m) => m.id));
    const lead = liveItems.get(alive[0].id)!;
    const slotNow = lead.slot?.trim() ?? "";
    // The whole round as it is now, rooms added in admin included.
    const round = live.items.filter((i) => (i.slot?.trim() ?? "") === slotNow);
    for (const i of round) owner.set(i.id, s.id);
    const d = dayOf(s);
    const w = written(s);
    const lw = writtenLive(lead);
    const shared: Partial<ItemValues> = {};
    const lines: string[] = [];
    for (const k of keys) {
      if (k === "day_id") {
        const to = needDay(d);
        if (to !== lead.day_id) { shared.day_id = to; lines.push(`Day: ${shortDate(lead.day)} → ${dayText(d)}`); }
        continue;
      }
      if (!same(w[k], lw[k])) {
        (shared as Record<string, unknown>)[k] = w[k];
        lines.push(`${LABELS[k]}: ${show(lw[k])} → ${show(w[k])}`);
      }
    }
    if (Object.keys(shared).length) for (const i of round) if (!removedIds.has(i.id)) plan.items.update.push({ id: i.id, ...shared });
    for (const m of mine) if (wanted.has(fold(m.code)) && !removedIds.has(m.id)) plan.map[roomKey(s.id, m.code)] = m.id;
    for (const m of removed) plan.items.delete.push(m.id);
    const base = { ...lw, ...shared, day_id: shared.day_id ?? lead.day_id! };
    const made: string[] = [];
    for (const code of added) {
      const theirs = round.find((i) => fold(i.code?.trim() ?? "") === fold(code));
      if (theirs) { plan.map[roomKey(s.id, code)] = theirs.id; continue; }
      const id = newId();
      plan.items.insert.push({
        id, day_id: base.day_id, starts_at: base.starts_at, ends_at: base.ends_at, title: base.title, description: base.description,
        location: null, categories: null, image_url: null, slot: base.slot, code, sort_order: lead.sort_order,
      });
      plan.map[roomKey(s.id, code)] = id;
      owner.set(id, s.id);
      made.push(code);
    }
    if (made.length) lines.push(`Rooms added: ${made.join(", ")}`);
    if (removed.length) lines.push(roomsLost(removed));
    if (!lines.length) return;
    change({ what: "round", how: "changed", label: base.slot ?? slotNow, lines });
    if (shared.day_id || shared.starts_at) touched.push({ day: base.day_id, key: `slot:${base.slot}`, time: base.starts_at });
  };

  for (const s of S.sessions) {
    const b = bSessions.get(s.id);
    const wasRound = Boolean(b?.round.trim());
    const mapped = b ? (wasRound ? roomsOf(b).some((c) => map[roomKey(s.id, c)]) : Boolean(map[s.id])) : false;
    if (!b || !mapped) { insertSession(s); continue; }
    if (Boolean(s.round.trim()) !== wasRound) { removeSession(b); insertSession(s); continue; }
    if (wasRound) updateRound(s, b); else updateSession(s, b);
  }
  for (const b of B.sessions) if (!sSessionIds.has(b.id)) removeSession(b);

  // Days the organiser removed: gone only when nothing else is on them.
  const leaving = new Set(plan.items.delete);
  for (const u of plan.items.update) if (u.day_id) leaving.add(u.id);
  for (const b of B.days) {
    if (sDays.has(b.id)) continue;
    const r = map[b.id];
    const ld = r ? liveDays.get(r) : undefined;
    if (!ld || claimed.has(ld.id)) continue;
    const label = dayText({ date: ld.date, name: ld.name ?? "" });
    const others = live.items.filter((i) => i.day_id === ld.id && !leaving.has(i.id));
    if (others.length) {
      change({ what: "day", how: "kept", label, lines: [`Not removed: ${others.length} item${others.length === 1 ? " was" : "s were"} added in admin.`] });
    } else {
      plan.days.delete.push(ld.id);
      change({ what: "day", how: "removed", label, lines: [] });
    }
  }
  for (const d of S.days) {
    const r = real.get(d.id) ?? map[d.id];
    if (r) plan.map[d.id] = r;
  }

  // Problems. The portal finds a day by its date, so two can't share one.
  const deletedDays = new Set(plan.days.delete);
  const newDate = new Map(plan.days.update.filter((u) => u.date).map((u) => [u.id, u.date!]));
  const dates = [
    ...live.days.filter((d) => !deletedDays.has(d.id)).map((d) => newDate.get(d.id) ?? d.date),
    ...plan.days.insert.map((d) => d.date),
  ];
  for (const date of new Set(dates.filter((x, i) => dates.indexOf(x) !== i))) {
    plan.problems.push(`Two days would fall on ${shortDate(date)}. Change one of them in admin first.`);
  }
  // Two rounds can't share a name: rooms are grouped by it, so they would merge.
  const deleted = new Set(plan.items.delete);
  const slotUpdate = new Map(plan.items.update.filter((u) => u.slot !== undefined).map((u) => [u.id, u.slot ?? null]));
  const rounds = new Map<string, { name: string; owners: Set<string> }>();
  const note = (id: string, slot: string | null | undefined, fallback: string) => {
    const name = slot?.trim();
    if (!name) return;
    const entry = rounds.get(name.toLowerCase()) ?? { name, owners: new Set<string>() };
    entry.owners.add(owner.get(id) ?? fallback);
    rounds.set(name.toLowerCase(), entry);
  };
  for (const i of live.items) if (!deleted.has(i.id)) note(i.id, slotUpdate.has(i.id) ? slotUpdate.get(i.id) : i.slot, `admin:${i.slot?.trim()}`);
  for (const n of plan.items.insert) note(n.id, n.slot, `new:${n.id}`);
  for (const { name, owners } of rounds.values()) {
    if (owners.size > 1) plan.problems.push(`There's already a breakout round called “${name}”. Rename one of them.`);
  }

  // Order (D456): each touched row lifted out, then placed by time in turn; everything else keeps its hand order.
  const updates = new Map<string, ItemUpdate>();
  for (const u of plan.items.update) updates.set(u.id, { ...updates.get(u.id), ...u });
  const final: AgendaItem[] = [
    ...live.items.filter((i) => !deleted.has(i.id)).map((i) => ({ ...i, ...updates.get(i.id) }) as AgendaItem),
    ...plan.items.insert.map((n) => ({ ...n, event_id: "", kind: "session" as const, color: null, day: n.day_id })),
  ];
  const orders = new Map<string, number>();
  for (const dayId of new Set(touched.map((t) => t.day))) {
    const rows = agendaRows(final.filter((i) => i.day_id === dayId).map((i) => ({ ...i, day: dayId })));
    const byKey = new Map(rows.map((r) => [rowKey(r), r]));
    const moving = touched.filter((t) => t.day === dayId && byKey.has(t.key)).sort((x, y) => x.time.localeCompare(y.time));
    const lifted = new Set(moving.map((t) => t.key));
    let keys = rows.map(rowKey).filter((k) => !lifted.has(k));
    for (const t of moving) keys = placeKey(keys.map((k) => byKey.get(k)!), t.key, t.time);
    for (const [id, n] of sortOrdersFor(rows, keys)) orders.set(id, n);
  }
  for (const n of plan.items.insert) n.sort_order = orders.get(n.id) ?? n.sort_order;
  plan.order = [...orders]
    .filter(([id, n]) => liveItems.has(id) && !deleted.has(id) && liveItems.get(id)!.sort_order !== n)
    .map(([id, sort_order]) => ({ id, sort_order }));
  return plan;
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/setup/changes.test.ts tests/setup/agenda-apply.test.ts`
Expected: PASS.

If an expectation fails, read the test's comment for the rule it guards, and fix the planner, not the test. The exceptions are the exact text of `shortDate` and the order in which object keys are listed; for those, adjust the expectation and say so in the report.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint && npm test
git pull --rebase --autostash
git add src/features/setup/sections/changes.ts src/features/setup/sections/agenda-apply.ts tests/setup/changes.test.ts tests/setup/agenda-apply.test.ts
git commit -m "feat(setup): the Agenda plan - change-only writes, rounds as one thing, rows placed by time (D450, D455, D456)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Info answers and the Info planner (pure)

**Files:**
- Create: `src/features/setup/sections/info.ts`
- Create: `src/features/setup/sections/info-apply.ts`
- Create: `tests/setup/info.test.ts`
- Create: `tests/setup/info-apply.test.ts`

**Interfaces:**
- Consumes from Task 3: `PlanChange`, `RESTORED`.
- Produces, in `info.ts`:
  - `SetupTab = { id; title; html }`
  - `InfoAnswers = { tabs: SetupTab[]; floor_plan_url: string }`
  - `InfoMap`
  - `blankInfo()`, `blankTab(id)`
  - `sanitizeInfo(raw)`
  - `infoFromLive(tabs, floorPlan) → { answers, map }`
  - `restrictInfoSeed(seed, ids)`
  - `infoProblems(a) → string[]`
  - `previewInfo(a) → PortalInfoTab[]`
- Produces, in `info-apply.ts`:
  - `InfoLive = { tabs: InfoTab[]; floorPlan: string | null; modules: EventModule[] }`
  - `TabInsert`, `TabUpdate`
  - `InfoPlan = { tabs: { insert; update; delete }; order; floorPlan: { modules: EventModule[]; url: string | null } | null; map; changes; problems }`
  - `infoBaseline(row)`
  - `planInfo({ submitted, baseline, map, live, newId })`
  - `withFloorPlan(modules, url)`

- [ ] **Step 1: Write the failing tests**

`tests/setup/info.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { infoFromLive, infoProblems, previewInfo, restrictInfoSeed, sanitizeInfo } from "@/features/setup/sections/info";
import { tab } from "./fixtures";

describe("sanitizeInfo", () => {
  it("keeps known fields, cut to their limits, and drops repeated or malformed ids", () => {
    const a = sanitizeInfo({ tabs: [{ id: "t1", title: "x".repeat(99), html: "<p>a</p>", evil: 1 }, { id: "t1", title: "dup" }, { id: "no way", title: "bad" }], floor_plan_url: 5 });
    expect(a.tabs).toEqual([{ id: "t1", title: "x".repeat(60), html: "<p>a</p>" }]);
    expect(a.floor_plan_url).toBe("5");
  });
  it("reads anything that isn't an object as blank", () => {
    expect(sanitizeInfo("nope")).toEqual({ tabs: [], floor_plan_url: "" });
  });
});

describe("infoFromLive and restrictInfoSeed (D454)", () => {
  const { answers, map } = infoFromLive([tab("T2", "Parking", null, 20), tab("T1", "Venue", "<p>Hall</p>", 10)], "https://x/fp.png");
  it("starts from the live tabs in order, real ids, and the floor plan", () => {
    expect(answers).toEqual({ tabs: [{ id: "T1", title: "Venue", html: "<p>Hall</p>" }, { id: "T2", title: "Parking", html: "" }], floor_plan_url: "https://x/fp.png" });
    expect(map).toEqual({ T1: "T1", T2: "T2" });
  });
  it("keeps only the tabs the form showed", () => {
    const r = restrictInfoSeed({ answers, map }, ["T1"]);
    expect(r.answers.tabs.map((t) => t.id)).toEqual(["T1"]);
    expect(r.map).toEqual({ T1: "T1" });
    expect(r.answers.floor_plan_url).toBe("https://x/fp.png");
  });
});

describe("infoProblems", () => {
  it("needs a tab or a floor plan", () => {
    expect(infoProblems({ tabs: [], floor_plan_url: "" })).toEqual(["Add a tab or a floor plan."]);
    expect(infoProblems({ tabs: [], floor_plan_url: "https://x/fp.png" })).toEqual([]);
  });
  it("needs every tab titled and written", () => {
    expect(infoProblems({ tabs: [{ id: "a", title: "", html: "<p>x</p>" }, { id: "b", title: "Venue", html: "<p></p>" }], floor_plan_url: "" }))
      .toEqual(["Tab 1 needs a title.", "“Venue” has no content yet."]);
  });
});

describe("previewInfo (D445)", () => {
  it("shows tabs that have a title and content, in the form's order", () => {
    expect(previewInfo({ tabs: [{ id: "a", title: "Venue", html: "<p>x</p>" }, { id: "b", title: "", html: "<p>y</p>" }, { id: "c", title: "Empty", html: "" }], floor_plan_url: "" }))
      .toEqual([{ key: "a", title: "Venue", html: "<p>x</p>" }]);
  });
});
```

`tests/setup/info-apply.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { EventModule } from "@/lib/modules";
import type { InfoTab } from "@/lib/types";
import { blankInfo, infoFromLive, type InfoAnswers, type InfoMap } from "@/features/setup/sections/info";
import { infoBaseline, planInfo, withFloorPlan, type InfoLive } from "@/features/setup/sections/info-apply";
import { counter, tab } from "./fixtures";

const live = (tabs: InfoTab[], floorPlan: string | null = null, modules: EventModule[] = []): InfoLive => ({ tabs, floorPlan, modules });
const plan = (S: InfoAnswers, B: InfoAnswers, map: InfoMap, l: InfoLive) => planInfo({ submitted: S, baseline: B, map, live: l, newId: counter() });
const L = live([tab("T1", "Venue", "<p>Hall</p>", 10), tab("T2", "Parking", "<p>B2</p>", 20)]);
const seeded = (l: InfoLive) => infoFromLive(l.tabs, l.floorPlan);

describe("infoBaseline", () => {
  it("prefers applied, then the starting point, else nothing", () => {
    expect(infoBaseline({ applied: { tabs: [], floor_plan_url: "a" }, seed: { tabs: [], floor_plan_url: "s" } }).floor_plan_url).toBe("a");
    expect(infoBaseline({ applied: null, seed: { tabs: [], floor_plan_url: "s" } }).floor_plan_url).toBe("s");
    expect(infoBaseline(null)).toEqual(blankInfo());
  });
});

describe("planInfo (D450, D458)", () => {
  it("first Apply onto no tabs creates them in the organiser's order", () => {
    const S = { tabs: [{ id: "x1", title: "Venue", html: "<p>Hi</p>" }, { id: "x2", title: "Dress code", html: "<p>Smart</p>" }], floor_plan_url: "" };
    const p = plan(S, blankInfo(), {}, live([]));
    expect(p.tabs.insert).toEqual([{ id: "n1", title: "Venue", html: "<p>Hi</p>", sort_order: 10 }, { id: "n2", title: "Dress code", html: "<p>Smart</p>", sort_order: 20 }]);
    expect(p.map).toEqual({ x1: "n1", x2: "n2" });
  });

  it("writes nothing when the organiser changed nothing", () => {
    const { answers, map } = seeded(L);
    const p = plan(answers, answers, map, L);
    expect([p.tabs, p.order, p.floorPlan, p.changes]).toEqual([{ insert: [], update: [], delete: [] }, [], null, []]);
  });

  it("writes only what the organiser changed, so the admin's rewrite of the content survives", () => {
    const { answers: B, map } = seeded(L);
    const now = live([{ ...L.tabs[0], html: "<p>Admin</p>" }, L.tabs[1]]);
    const p = plan({ ...B, tabs: [{ ...B.tabs[0], title: "Getting there" }, B.tabs[1]] }, B, map, now);
    expect(p.tabs.update).toEqual([{ id: "T1", title: "Getting there" }]);
  });

  it("a tab the admin deleted stays deleted unless the organiser changes it again", () => {
    const { answers: B, map } = seeded(L);
    const gone = live([L.tabs[1]]);
    expect(plan(B, B, map, gone).tabs.insert).toEqual([]);
    const p = plan({ ...B, tabs: [{ ...B.tabs[0], html: "<p>New</p>" }, B.tabs[1]] }, B, map, gone);
    expect(p.tabs.insert).toMatchObject([{ id: "n1", title: "Venue", html: "<p>New</p>" }]);
    expect(p.map.T1).toBe("n1");
  });

  it("deletes a tab the organiser removed", () => {
    const { answers: B, map } = seeded(L);
    expect(plan({ ...B, tabs: [B.tabs[1]] }, B, map, L).tabs.delete).toEqual(["T1"]);
  });

  it("a reorder moves the organiser's tabs and leaves the admin's where they are", () => {
    const L3 = live([tab("T1", "Venue", "<p>a</p>", 10), tab("A", "Admin's", "<p>b</p>", 20), tab("T2", "Parking", "<p>c</p>", 30)]);
    const B = { tabs: [{ id: "T1", title: "Venue", html: "<p>a</p>" }, { id: "T2", title: "Parking", html: "<p>c</p>" }], floor_plan_url: "" };
    const p = plan({ ...B, tabs: [B.tabs[1], B.tabs[0]] }, B, { T1: "T1", T2: "T2" }, L3);
    expect(p.order).toEqual([{ id: "T2", sort_order: 10 }, { id: "T1", sort_order: 30 }]);
    expect(p.changes.some((c) => c.label === "Tab order")).toBe(true);
  });

  it("an admin's reorder survives a new tab, which goes after the tab before it", () => {
    const L4 = live([tab("T2", "Parking", "<p>c</p>", 10), tab("T1", "Venue", "<p>a</p>", 20)]);
    const B = { tabs: [{ id: "T1", title: "Venue", html: "<p>a</p>" }, { id: "T2", title: "Parking", html: "<p>c</p>" }], floor_plan_url: "" };
    const S = { ...B, tabs: [...B.tabs, { id: "x", title: "FAQ", html: "<p>q</p>" }] };
    const p = plan(S, B, { T1: "T1", T2: "T2" }, L4);
    expect(p.tabs.insert).toEqual([{ id: "n1", title: "FAQ", html: "<p>q</p>", sort_order: 20 }]);
    expect(p.order).toEqual([{ id: "T1", sort_order: 30 }]);
  });
});

describe("the floor plan (D458)", () => {
  const url = "https://x/fp.png";
  it("goes on the floor plan tile, adding a shown tile when there is none", () => {
    const p = plan({ tabs: [], floor_plan_url: url }, blankInfo(), {}, live([]));
    expect(p.floorPlan).toEqual({ modules: [{ key: "floor_plan", enabled: true, url }], url });
    expect(p.changes).toEqual([{ what: "floor plan", how: "added", label: "Floor plan", lines: [] }]);
  });
  it("replaces the tile's url and keeps the admin's other settings", () => {
    const modules: EventModule[] = [{ key: "floor_plan", enabled: false, label: "Map", url: "https://x/old.png" }];
    const B = { tabs: [], floor_plan_url: "https://x/old.png" };
    const p = plan({ tabs: [], floor_plan_url: url }, B, {}, live([], "https://x/old.png", modules));
    expect(p.floorPlan).toEqual({ modules: [{ key: "floor_plan", enabled: false, label: "Map", url }], url });
  });
  it("removing it clears the url from the tile and the column", () => {
    expect(withFloorPlan([{ key: "floor_plan", enabled: true, label: "Map", url }], null)).toEqual([{ key: "floor_plan", enabled: true, label: "Map" }]);
    const p = plan({ tabs: [], floor_plan_url: "" }, { tabs: [], floor_plan_url: url }, {}, live([], url, [{ key: "floor_plan", enabled: true, url }]));
    expect(p.floorPlan).toEqual({ modules: [{ key: "floor_plan", enabled: true }], url: null });
  });
  it("leaves an admin's newer plan alone when the organiser didn't touch theirs", () => {
    expect(plan({ tabs: [], floor_plan_url: url }, { tabs: [], floor_plan_url: url }, {}, live([], "https://x/admin.png")).floorPlan).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/setup/info.test.ts tests/setup/info-apply.test.ts`
Expected: FAIL, with "Cannot find module".

- [ ] **Step 3: Write `sections/info.ts`**

```ts
import type { InfoTab } from "@/lib/types";
import type { PortalInfoTab } from "@/lib/info-tabs";
import { isRichTextEmpty } from "@/lib/rich-text";

/** An Info tab as the organiser writes it (D458): a title and rich text. Categories stay admin-only. */
export type SetupTab = { id: string; title: string; html: string };
export type InfoAnswers = { tabs: SetupTab[]; floor_plan_url: string };
/** Setup tab id → real `info_tabs` id (D454). */
export type InfoMap = Record<string, string>;

export const MAX_TABS = 12;
const TITLE_MAX = 60;
const HTML_MAX = 50_000;
const URL_MAX = 600;
const ID = /^[A-Za-z0-9:_-]{1,80}$/;

export function blankInfo(): InfoAnswers {
  return { tabs: [], floor_plan_url: "" };
}

export function blankTab(id: string): SetupTab {
  return { id, title: "", html: "" };
}

const text = (v: unknown, max: number) => (typeof v === "string" || typeof v === "number" ? String(v).slice(0, max) : "");

/** Whatever the browser sent, as answers; not trimmed or cleaned (autosave runs mid-typing). Apply cleans the HTML. */
export function sanitizeInfo(raw: unknown): InfoAnswers {
  const out = blankInfo();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const o = raw as Record<string, unknown>;
  const seen = new Set<string>();
  for (const t of Array.isArray(o.tabs) ? o.tabs.slice(0, MAX_TABS) : []) {
    if (!t || typeof t !== "object") continue;
    const r = t as Record<string, unknown>;
    if (typeof r.id !== "string" || !ID.test(r.id) || seen.has(r.id)) continue;
    seen.add(r.id);
    out.tabs.push({ id: r.id, title: text(r.title, TITLE_MAX), html: text(r.html, HTML_MAX) });
  }
  out.floor_plan_url = text(o.floor_plan_url, URL_MAX);
  return out;
}

/** The live Info page as answers, real ids mapped to themselves (D454): what a first visit starts from. */
export function infoFromLive(tabs: InfoTab[], floorPlan: string | null): { answers: InfoAnswers; map: InfoMap } {
  const sorted = [...tabs].sort((a, b) => a.sort_order - b.sort_order);
  return {
    answers: { tabs: sorted.map((t) => ({ id: t.id, title: t.title, html: t.html ?? "" })), floor_plan_url: floorPlan ?? "" },
    map: Object.fromEntries(sorted.map((t) => [t.id, t.id])),
  };
}

/** The starting point limited to the tabs the form showed (D454). */
export function restrictInfoSeed(seed: { answers: InfoAnswers; map: InfoMap }, ids: readonly string[]): { answers: InfoAnswers; map: InfoMap } {
  const keep = new Set(ids);
  return {
    answers: { ...seed.answers, tabs: seed.answers.tabs.filter((t) => keep.has(t.id)) },
    map: Object.fromEntries(Object.entries(seed.map).filter(([k]) => keep.has(k))),
  };
}

/** Everything stopping Submit or Apply, as sentences the organiser reads. */
export function infoProblems(a: InfoAnswers): string[] {
  if (a.tabs.length === 0) return a.floor_plan_url.trim() ? [] : ["Add a tab or a floor plan."];
  const out: string[] = [];
  a.tabs.forEach((t, n) => {
    const title = t.title.trim();
    if (!title) out.push(`Tab ${n + 1} needs a title.`);
    if (isRichTextEmpty(t.html)) out.push(`${title ? `“${title}”` : `Tab ${n + 1}`} has no content yet.`);
  });
  return out;
}

/** The tabs as the portal's Info page shows them (D445): titled, written, in the form's order. */
export function previewInfo(a: InfoAnswers): PortalInfoTab[] {
  return a.tabs
    .filter((t) => t.title.trim() && !isRichTextEmpty(t.html))
    .map((t) => ({ key: t.id, title: t.title.trim(), html: t.html }));
}
```

- [ ] **Step 4: Write `sections/info-apply.ts`**

```ts
import type { InfoTab } from "@/lib/types";
import type { BuiltinModule, EventModule } from "@/lib/modules";
import { cleanRichText } from "@/lib/rich-text";
import { blankInfo, sanitizeInfo, type InfoAnswers, type InfoMap, type SetupTab } from "./info";
import { RESTORED, type PlanChange } from "./changes";

/** The Info page now: its tabs, the plan image attendees see, and the modules as admin would save them. */
export type InfoLive = { tabs: InfoTab[]; floorPlan: string | null; modules: EventModule[] };
export type TabInsert = { id: string; title: string; html: string | null; sort_order: number };
export type TabUpdate = { id: string; title?: string; html?: string | null };
export type InfoPlan = {
  tabs: { insert: TabInsert[]; update: TabUpdate[]; delete: string[] };
  order: { id: string; sort_order: number }[];
  /** The modules and the column to write when the floor plan changes (D458), else null. */
  floorPlan: { modules: EventModule[]; url: string | null } | null;
  map: InfoMap;
  changes: PlanChange[];
  problems: string[];
};

export function infoBaseline(row: { applied: unknown; seed: unknown } | null): InfoAnswers {
  if (row?.applied) return sanitizeInfo(row.applied);
  if (row?.seed) return sanitizeInfo(row.seed);
  return blankInfo();
}

/**
 * The modules with `url` as the floor plan (D458): on the floor plan tile, keeping the admin's
 * label and switch; a shown tile is added when there is none. Null takes the url off.
 */
export function withFloorPlan(modules: EventModule[], url: string | null): EventModule[] {
  const at = modules.findIndex((m) => m.key === "floor_plan");
  if (at === -1) return url ? [...modules, { key: "floor_plan", enabled: true, url }] : modules;
  return modules.map((m, i) => {
    if (i !== at) return m;
    const next: BuiltinModule = { ...(m as BuiltinModule) };
    delete next.url;
    return url ? { ...next, url } : next;
  });
}

/**
 * What Apply writes to the Info page (D450, D455, D458): only tabs and fields the organiser
 * changed that the live page doesn't already hold. A tab the admin deleted stays deleted unless
 * the organiser changed it again; tabs the admin created are never written. Order: a new tab goes
 * after the tab before it in the organiser's list; the organiser's tabs take their new order only
 * when they reordered them, and the admin's tabs keep their places either way.
 */
export function planInfo({ submitted: S, baseline: B, map, live, newId }: {
  submitted: InfoAnswers;
  baseline: InfoAnswers;
  map: InfoMap;
  live: InfoLive;
  newId: () => string;
}): InfoPlan {
  const plan: InfoPlan = { tabs: { insert: [], update: [], delete: [] }, order: [], floorPlan: null, map: {}, changes: [], problems: [] };
  const liveTabs = [...live.tabs].sort((a, b) => a.sort_order - b.sort_order);
  const liveById = new Map(liveTabs.map((t) => [t.id, t]));
  const bTabs = new Map(B.tabs.map((t) => [t.id, t]));
  const sIds = new Set(S.tabs.map((t) => t.id));
  const fresh = new Set<string>();

  const insert = (t: SetupTab, note?: string) => {
    const id = newId();
    plan.tabs.insert.push({ id, title: t.title.trim(), html: cleanRichText(t.html), sort_order: 0 });
    plan.map[t.id] = id;
    fresh.add(id);
    plan.changes.push({ what: "tab", how: "added", label: t.title.trim(), lines: note ? [note] : [] });
  };

  for (const t of S.tabs) {
    const b = bTabs.get(t.id);
    const r = map[t.id];
    if (!b || !r) { insert(t); continue; }
    const title = t.title.trim();
    const body = cleanRichText(t.html);
    const titleChanged = title !== b.title.trim();
    const bodyChanged = body !== cleanRichText(b.html);
    const li = liveById.get(r);
    if (!li) {
      if (titleChanged || bodyChanged) insert(t, RESTORED);
      else plan.map[t.id] = r;
      continue;
    }
    plan.map[t.id] = r;
    const patch: TabUpdate = { id: li.id };
    const lines: string[] = [];
    if (titleChanged && title !== li.title) { patch.title = title; lines.push(`Title: ${li.title} → ${title}`); }
    if (bodyChanged && body !== cleanRichText(li.html)) { patch.html = body; lines.push("Content rewritten"); }
    if (lines.length) {
      plan.tabs.update.push(patch);
      plan.changes.push({ what: "tab", how: "changed", label: title, lines });
    }
  }
  for (const b of B.tabs) {
    if (sIds.has(b.id)) continue;
    const li = map[b.id] ? liveById.get(map[b.id]) : undefined;
    if (!li) continue;
    plan.tabs.delete.push(li.id);
    plan.changes.push({ what: "tab", how: "removed", label: li.title, lines: [] });
  }

  // Order.
  const deleted = new Set(plan.tabs.delete);
  const liveOrder = liveTabs.map((t) => t.id).filter((id) => !deleted.has(id));
  const mine = S.tabs.map((t) => plan.map[t.id]).filter((id): id is string => !!id && (fresh.has(id) || liveOrder.includes(id)));
  const kept = S.tabs.filter((t) => bTabs.has(t.id)).map((t) => t.id);
  const keptBefore = B.tabs.filter((t) => sIds.has(t.id)).map((t) => t.id);
  const reordered = kept.join("\n") !== keptBefore.join("\n");
  if (reordered || fresh.size > 0) {
    const mineSet = new Set(mine);
    const existing = reordered ? mine.filter((id) => !fresh.has(id)) : liveOrder.filter((id) => mineSet.has(id));
    let k = 0;
    const result = liveOrder.map((id) => (mineSet.has(id) ? existing[k++] : id));
    mine.forEach((id, p) => {
      if (!fresh.has(id)) return;
      const before = mine.slice(0, p).reverse().find((x) => result.includes(x));
      const after = mine.slice(p + 1).find((x) => result.includes(x));
      const at = before ? result.indexOf(before) + 1 : after ? result.indexOf(after) : result.length;
      result.splice(at, 0, id);
    });
    result.forEach((id, n) => {
      const sort_order = (n + 1) * 10;
      const made = plan.tabs.insert.find((t) => t.id === id);
      if (made) made.sort_order = sort_order;
      else if (liveById.get(id)!.sort_order !== sort_order) plan.order.push({ id, sort_order });
    });
    if (reordered && plan.order.length) {
      const titleOf = (id: string) => plan.tabs.insert.find((t) => t.id === id)?.title ?? liveById.get(id)?.title ?? "";
      plan.changes.push({ what: "tab", how: "changed", label: "Tab order", lines: [result.map(titleOf).join(" · ")] });
    }
  }

  // The floor plan: written only when the organiser changed it and the live page differs.
  const url = S.floor_plan_url.trim();
  if (url !== B.floor_plan_url.trim() && url !== (live.floorPlan ?? "")) {
    plan.floorPlan = { modules: withFloorPlan(live.modules, url || null), url: url || null };
    plan.changes.push({ what: "floor plan", how: !url ? "removed" : live.floorPlan ? "changed" : "added", label: "Floor plan", lines: [] });
  }
  return plan;
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/setup/info.test.ts tests/setup/info-apply.test.ts`
Expected: PASS.

If `cleanRichText` rewrites `<p>Hi</p>` (for example, by adding attributes), adjust only the expected HTML strings, and say so in the report.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint && npm test
git pull --rebase --autostash
git add src/features/setup/sections/info.ts src/features/setup/sections/info-apply.ts tests/setup/info.test.ts tests/setup/info-apply.test.ts
git commit -m "feat(setup): the Info section and its plan - tabs, their order, and the floor plan (D450, D455, D458)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Image rules for Agenda and Info (pure), and the image field for every kind

**Files:**
- Modify: `src/features/setup/images.ts`
- Modify: `src/features/setup/portal/SetupImageField.tsx`
- Modify: `src/features/setup/portal/BasicsStep.tsx` (pass `field`)
- Modify: `tests/setup/images.test.ts`

**Interfaces:**
- Consumes: `AgendaAnswers` (Task 2), `InfoAnswers` (Task 4).
- Produces in `images.ts`:
  - `SetupImageKind = keyof typeof IMAGE_TARGETS` (`"logo" | "banner" | "agenda" | "floor-plan"`)
  - `ImageTarget.ratio: number | null`
  - `htmlImages(html)`, `agendaImages(a)`, `infoImages(a)`
  - `listImagesToDeleteOnSave(prev, next, keep, isOwn)`
  - `listImagesToDeleteOnApply(baseline, submitted, working, stillUsed, isOwn)`
  - `ownAgendaImages(a, isOwn, start)`, `ownFloorPlan(a, isOwn, start)`
- `SetupImageField` props become `{ token, kind: SetupImageKind, field: string, label, value, onChange, onFocus }`.

- [ ] **Step 1: Add the failing tests**

Append to `tests/setup/images.test.ts`. Add these to its imports from `@/features/setup/images`: `agendaImages`, `htmlImages`, `infoImages`, `listImagesToDeleteOnApply`, `listImagesToDeleteOnSave`, `ownAgendaImages`, `ownFloorPlan`, `IMAGE_TARGETS`, `proportionWarning`. Keep any of these the file already imports.

```ts
import { session } from "./fixtures";

describe("list images (D459)", () => {
  const own = (u: string) => u.startsWith("own:");
  it("finds every image in rich text, a session's photo and the floor plan", () => {
    expect(htmlImages('<p>a</p><img src="own:1" alt=""><p><img alt="x" src="own:2"></p>')).toEqual(["own:1", "own:2"]);
    expect(agendaImages({ days: [], sessions: [session("s", "d", { image_url: "own:p" }), session("t", "d")] })).toEqual(["own:p"]);
    expect(infoImages({ tabs: [{ id: "t", title: "x", html: '<img src="own:1">' }], floor_plan_url: "own:fp" })).toEqual(["own:1", "own:fp"]);
  });
  it("a save deletes only own draft images nothing else holds", () => {
    expect(listImagesToDeleteOnSave(null, [], [], own)).toEqual([]);
    expect(listImagesToDeleteOnSave(["own:a", "own:b", "own:c", "ext:d"], ["own:a"], ["own:b"], own)).toEqual(["own:c"]);
  });
  it("Apply deletes a replaced starting image only when nothing uses it any more", () => {
    expect(listImagesToDeleteOnApply(["own:old", "own:kept", "own:live", "ext:x"], ["own:new"], ["own:kept"], ["own:live"], own)).toEqual(["own:old"]);
  });
  it("an image answer counts only if it is an own upload or was in the starting point", () => {
    const a = { days: [], sessions: [session("s", "d", { image_url: "ext:x" }), session("t", "d", { image_url: "ext:start" }), session("u", "d", { image_url: "own:y" })] };
    expect(ownAgendaImages(a, own, ["ext:start"]).sessions.map((s) => s.image_url)).toEqual(["", "ext:start", "own:y"]);
    expect(ownFloorPlan({ tabs: [], floor_plan_url: "ext:x" }, own, []).floor_plan_url).toBe("");
  });
});

describe("photo and floor plan targets", () => {
  it("warns about a blurry floor plan but never about its shape", () => {
    expect(proportionWarning(3000, 1000, IMAGE_TARGETS["floor-plan"])).toBeNull();
    expect(proportionWarning(800, 600, IMAGE_TARGETS["floor-plan"])).toMatch(/blurry/);
  });
  it("warns when a session photo isn't square", () => {
    expect(proportionWarning(1600, 900, IMAGE_TARGETS.agenda)).toMatch(/cropped to square/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/setup/images.test.ts`
Expected: FAIL, because the new exports are missing.

- [ ] **Step 3: Extend `images.ts`**

At the top, add these imports:

```ts
import type { AgendaAnswers } from "./sections/agenda";
import type { InfoAnswers } from "./sections/info";
```

Change `ImageTarget` and `IMAGE_TARGETS`:

```ts
/** `ratio` null: any shape is fine (a floor plan); only the width is checked. */
export type ImageTarget = { ratio: number | null; minWidth: number; best: string; note: string; label: string };

/** The image guide's sizes for the images the setup steps take (D447). */
export const IMAGE_TARGETS = {
  logo: { ratio: 1, minWidth: 256, best: "512 × 512", note: "Square, transparent PNG. Shown in the header and on the LED screen.", label: "Logos" },
  banner: { ratio: 3, minWidth: 1200, best: "2400 × 800", note: "3:1, keep text away from the edges.", label: "Banners" },
  agenda: { ratio: 1, minWidth: 400, best: "800 × 800", note: "Square. Shown small beside the session; tapping opens it full size.", label: "Session photos" },
  "floor-plan": { ratio: null, minWidth: 1200, best: "2000 px wide", note: "The clearest version you have. Attendees can zoom in.", label: "Floor plans" },
} as const satisfies Record<string, ImageTarget>;

export type SetupImageKind = keyof typeof IMAGE_TARGETS;
```

In `proportionWarning`, guard the ratio check:

```ts
  if (target.ratio !== null && Math.abs(width / height - target.ratio) / target.ratio > RATIO_SLACK) {
```

Append:

```ts
/** Every `<img src>` in rich text, in order. */
export function htmlImages(html: string): string[] {
  return [...html.matchAll(/<img\b[^>]*?\ssrc\s*=\s*"([^"]+)"/gi)].map((m) => m[1]);
}

/** The images Agenda answers use: each session's photo. */
export function agendaImages(a: AgendaAnswers): string[] {
  return a.sessions.map((s) => s.image_url.trim()).filter(Boolean);
}

/** The images Info answers use: those inside the tabs, then the floor plan. */
export function infoImages(a: InfoAnswers): string[] {
  return [...a.tabs.flatMap((t) => htmlImages(t.html)), a.floor_plan_url.trim()].filter(Boolean);
}

/**
 * D459, on a save: images the previous answers used that the new ones don't, minus anything
 * `keep` holds (the starting point, submitted and applied), and only this event's own uploads.
 */
export function listImagesToDeleteOnSave(prev: readonly string[] | null, next: readonly string[], keep: readonly string[], isOwn: (url: string) => boolean): string[] {
  if (!prev) return [];
  const used = new Set([...next, ...keep]);
  return [...new Set(prev)].filter((u) => !used.has(u) && isOwn(u));
}

/**
 * D459, after Apply: images the organiser started from that neither the applied version nor
 * their working copy uses, and that nothing on the event uses any more. Only own uploads.
 */
export function listImagesToDeleteOnApply(
  baseline: readonly string[],
  submitted: readonly string[],
  working: readonly string[],
  stillUsed: readonly string[],
  isOwn: (url: string) => boolean,
): string[] {
  const used = new Set([...submitted, ...working, ...stillUsed]);
  return [...new Set(baseline)].filter((u) => !used.has(u) && isOwn(u));
}

/** A session photo counts only if it is this event's own upload or was in the starting point (D447). */
export function ownAgendaImages(a: AgendaAnswers, isOwn: (url: string) => boolean, start: readonly string[]): AgendaAnswers {
  const ok = (u: string) => !u || isOwn(u) || start.includes(u);
  return { ...a, sessions: a.sessions.map((s) => (ok(s.image_url) ? s : { ...s, image_url: "" })) };
}

/** The same rule for the floor plan. Images inside tab text are left to sanitizeHtml, as in admin. */
export function ownFloorPlan(a: InfoAnswers, isOwn: (url: string) => boolean, start: readonly string[]): InfoAnswers {
  const u = a.floor_plan_url;
  return !u || isOwn(u) || start.includes(u) ? a : { ...a, floor_plan_url: "" };
}
```

- [ ] **Step 4: Generalise `SetupImageField`**

In `src/features/setup/portal/SetupImageField.tsx`:

1. Import `type SetupImageKind` from `../images`.
2. Above the component, add:

```ts
/** The thumbnail's shape, as the portal shows each kind. */
const BOX: Record<SetupImageKind, string> = { logo: "size-16", banner: "aspect-[3/1] h-16", agenda: "size-16", "floor-plan": "aspect-[4/3] h-16" };
/** Logos and floor plans show whole; banners and photos are cropped to fill, as the portal does. */
const CONTAIN = new Set<SetupImageKind>(["logo", "floor-plan"]);
/** Shrinking re-encodes as JPEG, which would lose a logo's or a plan's transparency. */
const SHRINK = new Set<SetupImageKind>(["banner", "agenda"]);
```

3. Change the props to `{ token, kind, field, label, value, onChange, onFocus }` with `kind: SetupImageKind; field: string;`.
4. Make these replacements:
   - The shrink line becomes `const ready = SHRINK.has(kind) && shouldShrink(file) ? await shrinkImage(file) : file;`.
   - The thumbnail box class becomes `` `flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted ${BOX[kind]}` ``.
   - The image class becomes `` `size-full ${CONTAIN.has(kind) ? "object-contain" : "object-cover"}` ``.
   - The button's `data-setup-field` becomes `data-setup-field={field}`.
   - Update the comment above the shrink line to: `// Never shrink a logo or a floor plan: shrinking re-encodes as JPEG, which loses transparency.`

In `BasicsStep.tsx`, add `field="logo_url"` to the logo `SetupImageField` and `field="banner_url"` to the banner one.

- [ ] **Step 5: Run the tests, typecheck, lint**

Run: `npx vitest run tests/setup/images.test.ts && npx tsc --noEmit && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git pull --rebase --autostash
git add src/features/setup/images.ts src/features/setup/portal/SetupImageField.tsx src/features/setup/portal/BasicsStep.tsx tests/setup/images.test.ts
git commit -m "feat(setup): image rules for session photos, info pictures and the floor plan (D447, D459)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The apply functions, the database layer and the database check

**Files:**
- Create: `supabase/migrations/0073_setup_apply.sql`
- Modify: `src/features/setup/db.ts`
- Modify: `scripts/setup-db-check.mjs`

**Interfaces:**
- Consumes:
  - `AgendaPlan`, `AgendaLive` (Task 3)
  - `InfoPlan`, `InfoLive` (Task 4)
- Produces in `db.ts`:
  - `saveAnswers(eventId, section, expectedRev, answers, seed?, appliedMap?)`: the map is written on the first insert
  - `liveAgenda(eventId): Promise<AgendaLive>`
  - `liveInfo(ev: Event): Promise<InfoLive>`
  - `applyAgendaPlan(eventId, reviewedAt, submitted, plan): Promise<boolean>`
  - `applyInfoPlan(eventId, reviewedAt, submitted, plan): Promise<boolean>`

  Both apply functions return true when the reviewed version was marked applied, and throw if the transaction failed.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0073_setup_apply.sql`:

```sql
-- D451, D455: an organiser's Agenda or Info section is applied by one function each, so every
-- row it writes, the applied_map and the applied snapshot commit together or not at all. The plan
-- is worked out in the app (src/features/setup/sections/*-apply.ts); these functions only run it.
-- Every write is scoped to p_event. Only the service role may call them.

create or replace function setup_apply_agenda(p_event uuid, p_plan jsonb, p_map jsonb, p_reviewed_at timestamptz, p_submitted jsonb)
returns boolean language plpgsql set search_path = public as $$
declare
  v_org uuid;
  r jsonb;
begin
  select org_id into v_org from events where id = p_event;
  if v_org is null then raise exception 'event % not found', p_event; end if;

  -- Deletes first, so a date or a round name they free can be used below. A day's rows and their
  -- breakout assignments go with it (cascade); the plan only deletes a day nothing else is on.
  delete from agenda_items where event_id = p_event
    and id in (select (jsonb_array_elements_text(coalesce(p_plan->'items'->'delete', '[]')))::uuid);
  delete from agenda_days where event_id = p_event
    and id in (select (jsonb_array_elements_text(coalesce(p_plan->'days'->'delete', '[]')))::uuid);

  -- Days. A new date moves the day's rows with it (agenda_days_move_items, D194).
  for r in select * from jsonb_array_elements(coalesce(p_plan->'days'->'update', '[]')) loop
    update agenda_days set
      date = case when r ? 'date' then (r->>'date')::date else date end,
      name = case when r ? 'name' then r->>'name' else name end
    where id = (r->>'id')::uuid and event_id = p_event;
  end loop;
  insert into agenda_days (id, org_id, event_id, date, name)
  select (d->>'id')::uuid, v_org, p_event, (d->>'date')::date, d->>'name'
  from jsonb_array_elements(coalesce(p_plan->'days'->'insert', '[]')) d;

  -- Rows: only the fields a plan names are written, so an admin's edit to any other survives.
  for r in select * from jsonb_array_elements(coalesce(p_plan->'items'->'update', '[]')) loop
    update agenda_items set
      day_id      = case when r ? 'day_id'      then (r->>'day_id')::uuid else day_id end,
      starts_at   = case when r ? 'starts_at'   then (r->>'starts_at')::time else starts_at end,
      ends_at     = case when r ? 'ends_at'     then (r->>'ends_at')::time else ends_at end,
      title       = case when r ? 'title'       then r->>'title' else title end,
      description = case when r ? 'description' then r->>'description' else description end,
      location    = case when r ? 'location'    then r->>'location' else location end,
      categories  = case when r ? 'categories'  then (case when jsonb_typeof(r->'categories') = 'array'
                      then array(select jsonb_array_elements_text(r->'categories')) else null end) else categories end,
      image_url   = case when r ? 'image_url'   then r->>'image_url' else image_url end,
      slot        = case when r ? 'slot'        then r->>'slot' else slot end,
      code        = case when r ? 'code'        then r->>'code' else code end
    where id = (r->>'id')::uuid and event_id = p_event;
    -- unique (attendee_id, slot) reads the copy on each assignment (D80): a renamed round carries its people.
    if r ? 'slot' then
      update breakout_assignments set slot = r->>'slot' where agenda_item_id = (r->>'id')::uuid and event_id = p_event;
    end if;
  end loop;
  insert into agenda_items (id, org_id, event_id, day_id, kind, starts_at, ends_at, title, description, location, categories, image_url, slot, code, sort_order)
  select (i->>'id')::uuid, v_org, p_event, (i->>'day_id')::uuid, 'session', (i->>'starts_at')::time, (i->>'ends_at')::time,
    i->>'title', i->>'description', i->>'location',
    case when jsonb_typeof(i->'categories') = 'array' then array(select jsonb_array_elements_text(i->'categories')) else null end,
    i->>'image_url', i->>'slot', i->>'code', (i->>'sort_order')::int
  from jsonb_array_elements(coalesce(p_plan->'items'->'insert', '[]')) i;

  update agenda_items a set sort_order = (o->>'sort_order')::int
  from jsonb_array_elements(coalesce(p_plan->'order', '[]')) o
  where a.id = (o->>'id')::uuid and a.event_id = p_event;

  -- The map always lands with the rows it names. The snapshot only for the version reviewed.
  update event_setup_sections set applied_map = p_map where event_id = p_event and section = 'agenda';
  update event_setup_sections set applied = p_submitted, applied_at = now()
  where event_id = p_event and section = 'agenda' and submitted_at = p_reviewed_at;
  return found;
end $$;

create or replace function setup_apply_info(p_event uuid, p_plan jsonb, p_map jsonb, p_reviewed_at timestamptz, p_submitted jsonb)
returns boolean language plpgsql set search_path = public as $$
declare
  v_org uuid;
  r jsonb;
begin
  select org_id into v_org from events where id = p_event;
  if v_org is null then raise exception 'event % not found', p_event; end if;

  delete from info_tabs where event_id = p_event
    and id in (select (jsonb_array_elements_text(coalesce(p_plan->'tabs'->'delete', '[]')))::uuid);
  for r in select * from jsonb_array_elements(coalesce(p_plan->'tabs'->'update', '[]')) loop
    update info_tabs set
      title = case when r ? 'title' then r->>'title' else title end,
      html  = case when r ? 'html'  then r->>'html' else html end
    where id = (r->>'id')::uuid and event_id = p_event;
  end loop;
  insert into info_tabs (id, org_id, event_id, title, html, sort_order)
  select (t->>'id')::uuid, v_org, p_event, t->>'title', t->>'html', (t->>'sort_order')::int
  from jsonb_array_elements(coalesce(p_plan->'tabs'->'insert', '[]')) t;
  update info_tabs x set sort_order = (o->>'sort_order')::int
  from jsonb_array_elements(coalesce(p_plan->'order', '[]')) o
  where x.id = (o->>'id')::uuid and x.event_id = p_event;

  -- The floor plan lives on its tile and in the legacy column, written together as admin does (D458).
  if p_plan ? 'modules' then
    update events set modules = p_plan->'modules', floor_plan_url = p_plan->>'floor_plan_url' where id = p_event;
  end if;

  update event_setup_sections set applied_map = p_map where event_id = p_event and section = 'info';
  update event_setup_sections set applied = p_submitted, applied_at = now()
  where event_id = p_event and section = 'info' and submitted_at = p_reviewed_at;
  return found;
end $$;

revoke execute on function setup_apply_agenda(uuid, jsonb, jsonb, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function setup_apply_agenda(uuid, jsonb, jsonb, timestamptz, jsonb) to service_role;
revoke execute on function setup_apply_info(uuid, jsonb, jsonb, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function setup_apply_info(uuid, jsonb, jsonb, timestamptz, jsonb) to service_role;
```

- [ ] **Step 2: Apply it**

Apply with the Supabase MCP `apply_migration` tool: project `wfmqwwcolfigjylkgrsv`, name `setup_apply`, and the file contents as the query. Load the tool with ToolSearch (`select:mcp__0687aa52-4553-40db-b867-72024a86f547__apply_migration`).

Then run `get_advisors` (type `security`) and confirm both functions are absent from any "function search path mutable" or "exposed to anon" findings.

- [ ] **Step 3: Extend `db.ts`**

In `src/features/setup/db.ts`, add these imports:

```ts
import { listAgenda, listAgendaDays } from "@/lib/db/agenda";
import { listAssignments } from "@/lib/db/breakouts";
import { listInfoTabs } from "@/lib/db/info-tabs";
import { isBreakout } from "@/lib/breakouts";
import { floorPlanUrl, normalizeModules } from "@/lib/modules";
import type { AgendaLive, AgendaPlan } from "./sections/agenda-apply";
import type { InfoLive, InfoPlan } from "./sections/info-apply";
```

Change `saveAnswers` to take the map on the first insert. Update its doc comment to mention the map:

```ts
export async function saveAnswers(
  eventId: string, section: SetupSection, expectedRev: number, answers: unknown, seed?: unknown, appliedMap?: Record<string, string>,
): Promise<number | null> {
  if (expectedRev === 0) {
    const { error } = await table().insert({ event_id: eventId, section, answers, seed, applied_map: appliedMap ?? {}, rev: 1 });
```

Leave the rest of the function as it is. Then append:

```ts
/** The agenda as Apply and review compare against it, with each breakout room's head count (only fetched when there are rooms). */
export async function liveAgenda(eventId: string): Promise<AgendaLive> {
  const [days, items] = await Promise.all([listAgendaDays(eventId), listAgenda(eventId)]);
  const assigned: Record<string, number> = {};
  if (items.some(isBreakout)) {
    for (const a of await listAssignments(eventId)) assigned[a.agenda_item_id] = (assigned[a.agenda_item_id] ?? 0) + 1;
  }
  return { days, items, assigned };
}

/** The Info page as Apply and review compare against it. Modules as admin would save them (normalizeModules). */
export async function liveInfo(ev: Event): Promise<InfoLive> {
  return { tabs: await listInfoTabs(ev.id), floorPlan: floorPlanUrl(ev), modules: normalizeModules(ev) };
}

/** Runs an agenda plan in one transaction (D455). True when the reviewed version was marked applied. */
export async function applyAgendaPlan(eventId: string, reviewedAt: string, submitted: unknown, plan: AgendaPlan): Promise<boolean> {
  const { data, error } = await serviceClient().rpc("setup_apply_agenda", {
    p_event: eventId, p_plan: { days: plan.days, items: plan.items, order: plan.order }, p_map: plan.map,
    p_reviewed_at: reviewedAt, p_submitted: submitted,
  });
  if (error) throw error;
  return data === true;
}

/** Runs an info plan in one transaction (D455). True when the reviewed version was marked applied. */
export async function applyInfoPlan(eventId: string, reviewedAt: string, submitted: unknown, plan: InfoPlan): Promise<boolean> {
  const p_plan: Record<string, unknown> = { tabs: plan.tabs, order: plan.order };
  if (plan.floorPlan) {
    p_plan.modules = plan.floorPlan.modules;
    p_plan.floor_plan_url = plan.floorPlan.url;
  }
  const { data, error } = await serviceClient().rpc("setup_apply_info", {
    p_event: eventId, p_plan, p_map: plan.map, p_reviewed_at: reviewedAt, p_submitted: submitted,
  });
  if (error) throw error;
  return data === true;
}
```

- [ ] **Step 4: Extend the database check**

In `scripts/setup-db-check.mjs`:

1. Add points 6–9 to the header comment ("WHAT THIS PROVES"):
   - 6. `setup_apply_agenda` writes a plan's days and rows together, with the map and the applied snapshot.
   - 7. Renaming a round through it carries its assignments.
   - 8. A stale reviewed version still writes the rows but is not marked applied.
   - 9. A plan with a failing row writes nothing. `setup_apply_info` writes tabs and the floor plan. The public key cannot call either function.
2. Insert this block inside `try`, after check 4:

```js
  // 6-9. The apply functions (0073).
  const T = "2026-10-10T00:00:00+00:00";
  must(await db.from("event_setup_sections").insert([
    { event_id: a.id, section: "agenda", answers: {}, submitted: { v: 1 }, submitted_at: T, rev: 1 },
    { event_id: a.id, section: "info", answers: {}, submitted: { v: 1 }, submitted_at: T, rev: 1 },
  ]));
  const dayId = randomUUID();
  const itemId = randomUUID();
  const roomId = randomUUID();
  const none = { insert: [], update: [], delete: [] };
  const agendaPlan = {
    days: { ...none, insert: [{ id: dayId, date: "2027-01-10", name: "Day 1" }] },
    items: { ...none, insert: [
      { id: itemId, day_id: dayId, starts_at: "09:00", ends_at: null, title: "Keynote", description: null, location: "Hall", categories: ["Staff"], image_url: null, slot: null, code: null, sort_order: 10 },
      { id: roomId, day_id: dayId, starts_at: "14:00", ends_at: "15:00", title: "Breakout 1", description: null, location: null, categories: null, image_url: null, slot: "Breakout 1", code: "3A", sort_order: 20 },
    ] },
    order: [],
  };
  const marked = must(await db.rpc("setup_apply_agenda", { p_event: a.id, p_plan: agendaPlan, p_map: { d1: dayId }, p_reviewed_at: T, p_submitted: { v: 1 } }));
  const rows = must(await db.from("agenda_items").select("id, day, categories").eq("event_id", a.id));
  const agendaRow = must(await db.from("event_setup_sections").select("applied, applied_map").eq("event_id", a.id).eq("section", "agenda").single());
  const keynote = rows.find((r) => r.id === itemId);
  check("an agenda plan writes its days and rows together", marked === true && rows.length === 2 && keynote?.day === "2027-01-10" && keynote?.categories?.[0] === "Staff");
  check("the agenda apply records the map and the applied snapshot", agendaRow.applied_map.d1 === dayId && agendaRow.applied?.v === 1);

  const person = must(await db.from("attendees").insert({ org_id: org.id, event_id: a.id, name: "Setup check", token: `zz${runId}`, source: "walkin" }).select("id").single());
  must(await db.from("breakout_assignments").insert({ event_id: a.id, agenda_item_id: roomId, attendee_id: person.id, slot: "Breakout 1" }));
  const rename = { days: none, items: { ...none, update: [{ id: roomId, slot: "Breakout A", title: "Breakout A" }] }, order: [] };
  const renamed = must(await db.rpc("setup_apply_agenda", { p_event: a.id, p_plan: rename, p_map: { d1: dayId }, p_reviewed_at: "2026-10-09T00:00:00+00:00", p_submitted: { v: 2 } }));
  const seat = must(await db.from("breakout_assignments").select("slot").eq("agenda_item_id", roomId).single());
  const afterRename = must(await db.from("event_setup_sections").select("applied").eq("event_id", a.id).eq("section", "agenda").single());
  check("renaming a round carries its assignments", seat.slot === "Breakout A");
  check("a stale reviewed version writes its rows but isn't marked applied", renamed === false && afterRename.applied?.v === 1);

  const broken = {
    days: none,
    items: { ...none, insert: [
      { id: randomUUID(), day_id: dayId, starts_at: "16:00", ends_at: null, title: "Should vanish", description: null, location: null, categories: null, image_url: null, slot: null, code: null, sort_order: 30 },
      { id: randomUUID(), day_id: randomUUID(), starts_at: "17:00", ends_at: null, title: "No such day", description: null, location: null, categories: null, image_url: null, slot: null, code: null, sort_order: 40 },
    ] },
    order: [],
  };
  const failed = await db.rpc("setup_apply_agenda", { p_event: a.id, p_plan: broken, p_map: {}, p_reviewed_at: T, p_submitted: { v: 3 } });
  const stillTwo = must(await db.from("agenda_items").select("id").eq("event_id", a.id));
  check("a plan with a failing row writes nothing", !!failed.error && stillTwo.length === 2, failed.error?.message);

  const tabId = randomUUID();
  const plan = "https://example.com/plan.png";
  const infoPlan = { tabs: { ...none, insert: [{ id: tabId, title: "Venue", html: "<p>Hall</p>", sort_order: 10 }] }, order: [], modules: [{ key: "floor_plan", enabled: true, url: plan }], floor_plan_url: plan };
  const infoMarked = must(await db.rpc("setup_apply_info", { p_event: a.id, p_plan: infoPlan, p_map: { t1: tabId }, p_reviewed_at: T, p_submitted: { v: 1 } }));
  const tabs = must(await db.from("info_tabs").select("id, title").eq("event_id", a.id));
  const ev = must(await db.from("events").select("modules, floor_plan_url").eq("id", a.id).single());
  check("an info plan writes its tabs and the floor plan together", infoMarked === true && tabs.length === 1 && ev.modules?.[0]?.url === plan && ev.floor_plan_url === plan);

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (anonKey) {
    const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const refused = await anon.rpc("setup_apply_info", { p_event: a.id, p_plan: { tabs: none, order: [] }, p_map: {}, p_reviewed_at: T, p_submitted: {} });
    check("the public key can't run an apply function", !!refused.error, refused.error?.code);
  }
```

Deleting the event in `finally` cascades to every row this block creates.

- [ ] **Step 5: Run the check**

Run: `npm run check:setup`
Expected: every line `PASS`, ending "All checks passed."

- [ ] **Step 6: Typecheck, lint, test, commit**

```bash
npx tsc --noEmit && npm run lint && npm test
git pull --rebase --autostash
git add supabase/migrations/0073_setup_apply.sql src/features/setup/db.ts scripts/setup-db-check.mjs
git commit -m "feat(setup): Agenda and Info apply as one transaction each, with the map and the reviewed snapshot (D451, D455)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The Agenda and Info previews

**Files:**
- Modify: `src/components/portal/AgendaList.tsx` (two attributes)
- Create: `src/features/setup/preview/AgendaPreview.tsx`
- Create: `src/features/setup/preview/InfoPreview.tsx`
- Modify: `src/features/setup/client.ts`

**Interfaces:**
- Consumes:
  - `previewAgenda`, `AgendaAnswers` (Task 2)
  - `previewInfo`, `InfoAnswers` (Task 4)
  - `PhoneFrame` (Task 1)
- Produces:
  - `AgendaSlot = \`day:${string}\` | \`session:${string}\``
  - `AgendaPreview({ agenda, primaryColor, focused?, onSlot?, compact? })`
  - `InfoSlot = \`tab:${string}\` | "floor_plan"`
  - `InfoPreview({ info, title, primaryColor, focused?, onSlot?, compact? })`

- [ ] **Step 1: Let the portal's agenda rows be found by id**

In `src/components/portal/AgendaList.tsx`:

- Add `data-item-id={i.id}` to the session row's outer `<div key={i.id} …>`.
- Add `data-item-id={item.id}` to `ImageRow`'s `<figure>`.

Nothing reads these in the portal. The setup preview uses them to outline and pick the row being edited.

- [ ] **Step 2: Write `AgendaPreview`**

`src/features/setup/preview/AgendaPreview.tsx`:

```tsx
"use client";
import { useId } from "react";
import { AgendaList } from "@/components/portal/AgendaList";
import { previewAgenda, type AgendaAnswers } from "../sections/agenda";
import { PhoneFrame } from "./PhoneFrame";

/** A spot in the agenda preview: a day's tab, or one session's row. */
export type AgendaSlot = `day:${string}` | `session:${string}`;

/** No session is ever "now" in a preview. */
const NEVER = { date: "", time: "" };

/**
 * The portal's agenda screen drawn from the organiser's draft (D445): the real AgendaList, so it
 * can't drift from what attendees see. It shows the day being edited. The session being edited
 * is outlined; clicking a row or a day tab asks for its field instead of following the link.
 */
export function AgendaPreview({ agenda, primaryColor, focused = null, onSlot, compact = false }: {
  agenda: AgendaAnswers;
  primaryColor: string;
  focused?: AgendaSlot | null;
  onSlot?: (slot: AgendaSlot) => void;
  compact?: boolean;
}) {
  const scope = useId();
  const { days, items } = previewAgenda(agenda);
  const session = focused?.startsWith("session:") ? focused.slice("session:".length) : null;
  const dayId = focused?.startsWith("day:") ? focused.slice("day:".length) : items.find((i) => i.id === session)?.day_id ?? null;
  const day = days.find((d) => d.id === dayId) ?? days[0] ?? null;

  // Captured before any link or button inside sees the click: the preview never navigates.
  const onClickCapture = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onSlot) return;
    const target = e.target as HTMLElement;
    const row = target.closest<HTMLElement>("[data-item-id]");
    if (row?.dataset.itemId) { onSlot(`session:${row.dataset.itemId}`); return; }
    const href = target.closest("a")?.getAttribute("href") ?? "";
    const date = new URLSearchParams(href.split("?")[1] ?? "").get("day");
    const picked = days.find((d) => d.date === date);
    if (picked) onSlot(`day:${picked.id}`);
  };

  // Setup ids hold no quotes or backslashes (the ID rule in sections/agenda.ts), so they are safe inside a quoted selector.
  const outline = session
    ? `[data-preview="${scope}"] [data-item-id="${session}"]{outline:2px solid var(--primary);outline-offset:-2px}` +
      `[data-preview="${scope}"] [data-item-id="${session}"]::after{content:"Editing";position:absolute;top:4px;right:4px;` +
      "padding:1px 6px;border-radius:4px;background:var(--primary);color:var(--primary-foreground);font-size:10px;font-weight:700}"
    : "";

  return (
    <PhoneFrame primaryColor={primaryColor} label="Preview of your agenda" compact={compact}>
      {outline && <style>{outline}</style>}
      <div data-preview={scope} className={`p-4 ${onSlot ? "cursor-pointer" : ""}`} onClickCapture={onClickCapture}>
        <h1 className="mb-3 text-xl font-extrabold">Agenda</h1>
        {day ? (
          <AgendaList items={items} day={day.date} days={days.map((d) => ({ date: d.date, name: d.name }))} basePath="" now={NEVER} />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-orange-400 bg-orange-50 p-6 text-center text-[11px] font-extrabold text-orange-800">
            Your agenda<span className="font-semibold">Add a day to start</span>
          </div>
        )}
      </div>
    </PhoneFrame>
  );
}
```

- [ ] **Step 3: Write `InfoPreview`**

`src/features/setup/preview/InfoPreview.tsx`:

```tsx
"use client";
import { InfoPage } from "@/components/portal/InfoPage";
import { previewInfo, type InfoAnswers } from "../sections/info";
import { PhoneFrame } from "./PhoneFrame";

/** A spot in the info preview: one tab, or the floor plan screen. */
export type InfoSlot = `tab:${string}` | "floor_plan";

/**
 * The portal's Info page drawn from the organiser's draft (D445): the real InfoPage, showing the
 * tab being edited. While the floor plan is being edited, it shows the floor plan screen instead,
 * as attendees reach it from the home button. Clicking asks for the field instead of following a link.
 */
export function InfoPreview({ info, title, primaryColor, focused = null, onSlot, compact = false }: {
  info: InfoAnswers;
  /** The Info section's heading (events.info_page_title). */
  title: string;
  primaryColor: string;
  focused?: InfoSlot | null;
  onSlot?: (slot: InfoSlot) => void;
  compact?: boolean;
}) {
  const tabs = previewInfo(info);
  const tabId = focused?.startsWith("tab:") ? focused.slice("tab:".length) : null;
  const selected = tabs.find((t) => t.key === tabId) ?? tabs[0] ?? null;
  const unwritten = tabId !== null && !tabs.some((t) => t.key === tabId);
  const plan = info.floor_plan_url.trim();

  const onClickCapture = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onSlot) return;
    if (focused === "floor_plan") { onSlot("floor_plan"); return; }
    const href = (e.target as HTMLElement).closest("a")?.getAttribute("href") ?? "";
    const key = new URLSearchParams(href.split("?")[1] ?? "").get("tab");
    const tab = key ?? (unwritten ? tabId : selected?.key);
    if (tab) onSlot(`tab:${tab}`);
  };

  return (
    <PhoneFrame primaryColor={primaryColor} label="Preview of your info pages" compact={compact}>
      <div className={`p-4 ${onSlot ? "cursor-pointer" : ""}`} onClickCapture={onClickCapture}>
        {focused === "floor_plan" ? (
          <>
            <h1 className="mb-3 text-xl font-extrabold">Floor plan</h1>
            {plan ? (
              <div className="overflow-auto rounded-xl border border-border bg-card p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={plan} alt="Floor plan" className="min-h-40 w-full" />
              </div>
            ) : (
              <Placeholder title="Floor plan" detail="2000 px wide · optional" />
            )}
          </>
        ) : unwritten ? (
          <>
            <h1 className="mb-3 text-xl font-extrabold">{title}</h1>
            <Placeholder title="This tab" detail="Shows once it has a title and content" />
          </>
        ) : (
          <InfoPage event={{ info_page_title: title }} tabs={tabs} selected={selected} basePath="" />
        )}
      </div>
    </PhoneFrame>
  );
}

/** The image guide's dashed box: what goes here, and at what size. */
function Placeholder({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-orange-400 bg-orange-50 p-6 text-center text-[11px] font-extrabold text-orange-800">
      {title}<span className="font-semibold">{detail}</span>
    </div>
  );
}
```

- [ ] **Step 4: Export the new pure modules and previews from the client entry**

Replace `src/features/setup/client.ts`:

```ts
/**
 * The setup feature's client-safe entry (D402, D403): the pure rules and the phone previews. `index.ts` re-exports this
 * and adds the reads, writes and screens.
 */
export * from "./sections";
export * from "./status";
export * from "./checklist";
export * from "./images";
export * from "./sections/basics";
export * from "./sections/agenda";
export * from "./sections/agenda-apply";
export * from "./sections/info";
export * from "./sections/info-apply";
export * from "./sections/changes";
export { HomePreview, type PreviewBasics, type PreviewSlot } from "./preview/HomePreview";
export { AgendaPreview, type AgendaSlot } from "./preview/AgendaPreview";
export { InfoPreview, type InfoSlot } from "./preview/InfoPreview";
```

If two modules export the same name and `tsc` reports a conflict, rename the one in the newer module. Do not use `export { x as y }`.

- [ ] **Step 5: Typecheck, lint, test, build**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all pass.

The build matters here. `AgendaList` and `InfoPage` now render inside a client component. If the build reports a server-only import reaching the browser, find it from the error. Then split the drawing part into a client-safe component, the way D418 split the activity screens, and record the split in the commit message.

- [ ] **Step 6: Commit**

```bash
git pull --rebase --autostash
git add src/components/portal/AgendaList.tsx src/features/setup/preview/AgendaPreview.tsx src/features/setup/preview/InfoPreview.tsx src/features/setup/client.ts
git commit -m "feat(setup): agenda and info previews from the portal's own components, with the edited row outlined (D445)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The Agenda step for organisers

**Files:**
- Modify: `src/features/setup/portal/useSectionAutosave.ts` (adds `seedIds`)
- Modify: `src/features/setup/portal/actions.ts` (full replacement below)
- Modify: `src/features/setup/portal/SetupStepPage.tsx` (full replacement below)
- Create: `src/features/setup/portal/AgendaStep.tsx`
- Modify: `src/features/setup/sections.ts` (`BUILT_STEPS`, `SECTION_TITLES`)

**Interfaces:**
- Consumes:
  - from Task 2: `agendaFromLive`, `restrictSeed`, `sanitizeAgenda`, `agendaProblems`, `agendaErrors`, `agendaRange`, `seedIdsOf`, `blankSession`, `dayName`, `errorKey`
  - from Task 5: `agendaImages`, `ownAgendaImages`, `listImagesToDeleteOnSave`
  - from Task 6: `liveAgenda`, `saveAnswers(…, seed, map)`
  - from Task 7: `AgendaPreview`
- Produces:
  - `saveSectionAction(token, section, expectedRev, raw, seedIds?)`
  - `SECTION_TITLES: Record<SetupSection, string>`
  - `BUILT_STEPS = ["basics", "agenda"]`

- [ ] **Step 1: Titles and built steps**

In `src/features/setup/sections.ts`, change `BUILT_STEPS` and add the titles under it:

```ts
export const BUILT_STEPS: readonly SetupSection[] = ["basics", "agenda"];

/** Each section's name, as both the organiser and the admin see it. */
export const SECTION_TITLES: Record<SetupSection, string> = { basics: "Event basics", agenda: "Agenda", info: "Info and floor plan" };
```

- [ ] **Step 2: The hook carries `seedIds`**

In `useSectionAutosave.ts`:

1. Add the option to the parameter type, with this comment:

```ts
  /**
   * The ids the form started from (Agenda and Info). The first save sends them, and the server
   * seeds the organiser's starting point and the map from just these (D454).
   */
  seedIds?: readonly string[];
```

2. Destructure it, and keep it stable with `const seeds = useRef(seedIds);`.
3. Change the save call to `saveSectionAction(token, section, rev.current, sending, seeds.current)`.

- [ ] **Step 3: Replace `portal/actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import type { Event } from "@/lib/types";
import { isValidToken } from "@/lib/tokens";
import { allow } from "@/lib/ratelimit";
import { isEventMediaFor, type ImageKind } from "@/lib/storage";
import { deleteEventImage, uploadEventImage } from "@/lib/db/media";
import { getEventBySetupToken, getSetupRow, liveAgenda, saveAnswers, submitAnswers, type SetupRow } from "../db";
import { isBuiltStep, problemSentence, type SetupSection } from "../sections";
import { BASICS_IMAGE_FIELDS, basicsComplete, basicsFromEvent, basicsMissing, BASICS_LABELS, sanitizeBasics } from "../sections/basics";
import { agendaFromLive, agendaProblems, agendaRange, restrictSeed, sanitizeAgenda } from "../sections/agenda";
import { agendaImages, imagesToDeleteOnSave, listImagesToDeleteOnSave, ownAgendaImages, ownImageAnswers } from "../images";

export type SetupResult = { ok: true; rev: number } | { ok: false; message: string; stale?: boolean };

const GONE = "This setup link no longer works. Ask your project contact for a new one.";
const BUSY = "Too many saves at once — wait a moment and try again.";
const RELOAD = "Reload the page and try again.";
const STALE: SetupResult = { ok: false, message: "Someone else updated this section — reload to see their changes.", stale: true };
const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });
const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const UPLOAD_KINDS = new Set<ImageKind>(["logo", "banner", "agenda", "info", "floor-plan"]);

/**
 * The token is the only authority (D441): a server action is a public POST, so every call
 * re-checks the link and takes the event from it, never from the caller. A rate-limited call
 * says so, rather than claiming the link is dead.
 */
async function load(token: string): Promise<{ ok: true; ev: Event } | { ok: false; message: string }> {
  if (typeof token !== "string" || !isValidToken(token)) return fail(GONE);
  if (!allow(`setup:${token}`, 240, 60_000)) return fail(BUSY);
  const ev = await getEventBySetupToken(token);
  return ev ? { ok: true, ev } : fail(GONE);
}

const isIdList = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 1000 && v.every((x) => typeof x === "string");

export async function saveSectionAction(token: string, section: string, expectedRev: number, raw: unknown, seedIds?: unknown): Promise<SetupResult> {
  const loaded = await load(token);
  if (!loaded.ok) return fail(loaded.message);
  if (!isBuiltStep(section)) return fail("That section can't be filled in here yet.");
  if (!Number.isInteger(expectedRev) || expectedRev < 0) return STALE;
  const s: SetupSection = section;
  switch (s) {
    case "basics": return saveBasics(loaded.ev, expectedRev, raw);
    case "agenda": return saveAgenda(loaded.ev, expectedRev, raw, seedIds);
    case "info": return fail("That section can't be filled in here yet.");
    default: { const never: never = s; return never; }
  }
}

async function saveBasics(ev: Event, expectedRev: number, raw: unknown): Promise<SetupResult> {
  const answers = ownImageAnswers(sanitizeBasics(raw), ev, supabaseUrl());
  const prev = await getSetupRow(ev.id, "basics");
  const rev = await saveAnswers(ev.id, "basics", expectedRev, answers, expectedRev === 0 ? basicsFromEvent(ev) : undefined);
  if (rev === null) return STALE;
  // D447: a replaced draft image goes once the new answers are saved; never one that was
  // submitted, applied, or is live on the event, and only this event's own uploads.
  const before = prev ? sanitizeBasics(prev.answers) : null;
  const keep = [
    ...BASICS_IMAGE_FIELDS.map((f) => (prev?.submitted ? sanitizeBasics(prev.submitted)[f] : null)),
    ...BASICS_IMAGE_FIELDS.map((f) => (prev?.applied ? sanitizeBasics(prev.applied)[f] : null)),
  ];
  for (const url of imagesToDeleteOnSave(before, answers, keep, ev, supabaseUrl())) await deleteEventImage(url);
  return { ok: true, rev };
}

/**
 * The first save (rev 0) seeds the organiser's starting point and the map from the live agenda,
 * limited to the ids their form showed (D454). Session photos must be this event's own uploads
 * or ones the starting point already had (D447). A replaced draft photo goes after the save (D459).
 */
async function saveAgenda(ev: Event, expectedRev: number, raw: unknown, seedIds: unknown): Promise<SetupResult> {
  const prev = await getSetupRow(ev.id, "agenda");
  let seed: ReturnType<typeof restrictSeed> | null = null;
  if (expectedRev === 0) {
    if (!isIdList(seedIds)) return fail(RELOAD);
    const live = await liveAgenda(ev.id);
    seed = restrictSeed(agendaFromLive(live.days, live.items), seedIds);
  }
  const start = agendaImages(seed?.answers ?? sanitizeAgenda(prev?.seed));
  const isOwn = (u: string) => isEventMediaFor(u, supabaseUrl(), ev.org_id, ev.id, ["agenda"]);
  const answers = ownAgendaImages(sanitizeAgenda(raw), isOwn, start);
  const rev = await saveAnswers(ev.id, "agenda", expectedRev, answers, seed?.answers, seed?.map);
  if (rev === null) return STALE;
  const keep = [...start, ...agendaImages(sanitizeAgenda(prev?.submitted)), ...agendaImages(sanitizeAgenda(prev?.applied))];
  const before = prev ? agendaImages(sanitizeAgenda(prev.answers)) : null;
  for (const url of listImagesToDeleteOnSave(before, agendaImages(answers), keep, isOwn)) await deleteEventImage(url);
  return { ok: true, rev };
}

/** Why this section can't be submitted yet, or null. Agenda days are checked against the organiser's own Basics dates (D457). */
async function submitProblem(ev: Event, section: SetupSection, row: SetupRow): Promise<string | null> {
  switch (section) {
    case "basics": {
      const answers = sanitizeBasics(row.answers);
      if (basicsComplete(answers)) return null;
      const missing = basicsMissing(answers).map((f) => BASICS_LABELS[f]);
      return missing.length ? `Fill in ${missing.join(", ")} first.` : "Fix the fields marked in red first.";
    }
    case "agenda": {
      const basics = await getSetupRow(ev.id, "basics");
      return problemSentence(agendaProblems(sanitizeAgenda(row.answers), agendaRange(basics ? sanitizeBasics(basics.answers) : null, ev)));
    }
    case "info": return "That section can't be submitted here yet.";
    default: { const never: never = section; return never; }
  }
}

export async function submitSectionAction(token: string, section: string, expectedRev: number): Promise<SetupResult> {
  const loaded = await load(token);
  if (!loaded.ok) return fail(loaded.message);
  const { ev } = loaded;
  if (!isBuiltStep(section)) return fail("That section can't be submitted here yet.");
  const row = await getSetupRow(ev.id, section);
  if (!row || row.rev !== expectedRev) return STALE;
  const problem = await submitProblem(ev, section, row);
  if (problem) return fail(problem);
  const rev = await submitAnswers(ev.id, section, expectedRev);
  if (rev === null) return STALE;
  // The admin's badge reads this event's rows.
  revalidatePath(`/admin/events/${ev.id}`, "layout");
  return { ok: true, rev };
}

/** One image per call: Vercel refuses request bodies over 4.5 MB (storage.ts). */
export async function uploadSetupImageAction(token: string, kind: string, fd: FormData): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const loaded = await load(token);
  if (!loaded.ok) return fail(loaded.message);
  const { ev } = loaded;
  if (!UPLOAD_KINDS.has(kind as ImageKind)) return fail("That image can't be uploaded here.");
  const file = fd.get("image");
  if (!(file instanceof File) || file.size === 0) return fail("Choose an image first.");
  try {
    return { ok: true, url: await uploadEventImage({ orgId: ev.org_id, eventId: ev.id, kind: kind as ImageKind, file }) };
  } catch (e) {
    return fail((e as Error).message);
  }
}
```

The `never`-default switches are the repo's idiom (D404): adding a section fails the build until every switch handles it. If `uploadEventImage`'s `kind` parameter is narrower than `ImageKind`, widen it in `src/lib/db/media.ts`. It already accepts `"agenda"` from the admin actions.

- [ ] **Step 4: Replace `SetupStepPage.tsx`**

```tsx
import { notFound } from "next/navigation";
import { isValidToken } from "@/lib/tokens";
import { brandStyle } from "@/lib/brand";
import { getEventBySetupToken, getSetupRow, liveAgenda } from "../db";
import { isBuiltStep, type SetupSection } from "../sections";
import { basicsFromEvent, sanitizeBasics } from "../sections/basics";
import { agendaFromLive, agendaRange, sanitizeAgenda } from "../sections/agenda";
import { hasUnsubmittedChanges, sectionStatus } from "../status";
import { BasicsStep } from "./BasicsStep";
import { AgendaStep } from "./AgendaStep";

export async function SetupStepPage({ params }: { params: Promise<{ token: string; section: string }> }) {
  const { token, section } = await params;
  if (!isValidToken(token) || !isBuiltStep(section)) notFound();
  const ev = await getEventBySetupToken(token);
  if (!ev) notFound();
  const s: SetupSection = section;
  const row = await getSetupRow(ev.id, s);
  const common = { token, initialRev: row?.rev ?? 0, initialStatus: sectionStatus(row), initialUnsubmitted: hasUnsubmittedChanges(row) };

  let step: React.ReactNode;
  switch (s) {
    case "basics":
      // First visit starts from the live event, so the organiser sees and corrects what's there.
      step = <BasicsStep {...common} initial={row ? sanitizeBasics(row.answers) : basicsFromEvent(ev)} />;
      break;
    case "agenda": {
      const [basicsRow, live] = await Promise.all([getSetupRow(ev.id, "basics"), row ? null : liveAgenda(ev.id)]);
      const basics = basicsRow ? sanitizeBasics(basicsRow.answers) : null;
      const initial = row ? sanitizeAgenda(row.answers) : agendaFromLive(live!.days, live!.items).answers;
      step = <AgendaStep {...common} initial={initial} range={agendaRange(basics, ev)} primaryColor={basics?.primary_color || ev.primary_color} />;
      break;
    }
    case "info":
      return notFound();
    default: { const never: never = s; return never; }
  }
  return (
    <main className="mx-auto w-full max-w-6xl p-4 md:p-8" style={brandStyle(ev.primary_color) as React.CSSProperties}>
      {step}
    </main>
  );
}
```

- [ ] **Step 5: Write `AgendaStep.tsx`**

```tsx
"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { suggestedDayDate } from "@/lib/agenda";
import { eventDays, nowInKL } from "@/lib/time";
import { formatDateRange } from "@/lib/text";
import { problemSentence } from "../sections";
import {
  agendaErrors, agendaProblems, blankSession, dayName, errorKey, seedIdsOf,
  type AgendaAnswers, type DateRange, type SessionField, type SetupDay, type SetupSession,
} from "../sections/agenda";
import type { SectionStatus } from "../status";
import { AgendaPreview, type AgendaSlot } from "../preview/AgendaPreview";
import { SetupImageField } from "./SetupImageField";
import { StepFrame } from "./StepFrame";
import { useSectionAutosave } from "./useSectionAutosave";

const focusField = (slot: string) =>
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-setup-field="${slot}"]`)?.focus());

/**
 * The agenda (D446, D453): one card per day, the sessions under it, each with its time and title
 * up front and the rest behind More. A session can be a breakout round. The preview shows the day
 * being edited, with the session being edited outlined (D445).
 */
export function AgendaStep({ token, initial, initialRev, initialStatus, initialUnsubmitted, range, primaryColor }: {
  token: string;
  initial: AgendaAnswers;
  initialRev: number;
  initialStatus: SectionStatus;
  initialUnsubmitted: boolean;
  range: DateRange;
  primaryColor: string;
}) {
  // The ids this form starts from: the first save seeds the starting point from just these (D454).
  const [seedIds] = useState(() => seedIdsOf(initial));
  const step = useSectionAutosave({ token, section: "agenda", initial, initialRev, initialStatus, initialUnsubmitted, seedIds });
  const { answers: a, setAnswers: set } = step;
  const [focused, setFocused] = useState<AgendaSlot | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const errors = agendaErrors(a, range);
  const problems = agendaProblems(a, range);
  const err = (id: string, field: string) => errors[errorKey(id, field)];

  const addDay = () => {
    const id = crypto.randomUUID();
    const date = suggestedDayDate(eventDays(range.first, range.last), a.days.map((d) => d.date), nowInKL().date);
    set((p) => ({ ...p, days: [...p.days, { id, date, name: "" }] }));
    setFocused(`day:${id}`);
    focusField(`day:${id}`);
  };
  const editDay = (id: string, patch: Partial<SetupDay>) => set((p) => ({ ...p, days: p.days.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
  const removeDay = (d: SetupDay, n: number) => {
    const count = a.sessions.filter((s) => s.day === d.id).length;
    if (count > 0 && !window.confirm(`Remove ${dayName(d, n)} and its ${count} session${count === 1 ? "" : "s"}?`)) return;
    set((p) => ({ days: p.days.filter((x) => x.id !== d.id), sessions: p.sessions.filter((s) => s.day !== d.id) }));
  };
  const addSession = (day: string) => {
    const s = blankSession(crypto.randomUUID(), day);
    set((p) => ({ ...p, sessions: [...p.sessions, s] }));
    setFocused(`session:${s.id}`);
    focusField(`session:${s.id}`);
  };
  const editSession = (id: string, patch: Partial<SetupSession>) => set((p) => ({ ...p, sessions: p.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const removeSession = (id: string) => set((p) => ({ ...p, sessions: p.sessions.filter((s) => s.id !== id) }));
  const jump = (slot: AgendaSlot) => {
    setFocused(slot);
    focusField(slot);
  };
  const nextRound = `Breakout ${a.sessions.filter((s) => s.round.trim()).length + 1}`;

  return (
    <StepFrame token={token} title="Agenda" step={step} complete={problems.length === 0} incompleteHint={problemSentence(problems) ?? undefined}
      preview={<AgendaPreview agenda={a} primaryColor={primaryColor} focused={focused} onSlot={jump} />}>
      <p className="text-sm text-muted-foreground">
        One tab per day in the portal{range.first ? `, within your event dates (${formatDateRange(range.first, range.last)})` : ""}.
        Times are Malaysia time. Attendees see each day in time order.
      </p>

      {a.days.map((d, n) => (
        <section key={d.id} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5" onFocus={() => setFocused(`day:${d.id}`)}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-bold">Date</span>
              <Input type="date" value={d.date} data-setup-field={`day:${d.id}`} className="w-44"
                aria-invalid={err(d.id, "date") ? true : undefined} onChange={(e) => editDay(d.id, { date: e.target.value })} />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-sm font-bold">Name <span className="font-normal text-muted-foreground">(optional)</span></span>
              <Input value={d.name} placeholder={`Day ${n + 1}`} onChange={(e) => editDay(d.id, { name: e.target.value })} />
            </label>
            <Button type="button" variant="ghost" size="sm" onClick={() => removeDay(d, n)}>Remove day</Button>
          </div>
          {err(d.id, "date") && <span className="text-xs font-semibold text-destructive">{err(d.id, "date")}</span>}
          <ul className="flex flex-col gap-3">
            {a.sessions.filter((s) => s.day === d.id).map((s) => (
              <SessionRow key={s.id} token={token} s={s} nextRound={nextRound} error={(f) => err(s.id, f)}
                expanded={open === s.id} onExpand={() => setOpen(open === s.id ? null : s.id)}
                onEdit={(patch) => editSession(s.id, patch)} onRemove={() => removeSession(s.id)}
                onFocus={() => setFocused(`session:${s.id}`)} />
            ))}
          </ul>
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => addSession(d.id)}>Add session</Button>
        </section>
      ))}

      <Button type="button" variant="outline" className="self-start" onClick={addDay}>Add day</Button>
    </StepFrame>
  );
}

/** One session: time and title up front; place, audience, description and photo - or the round's rooms - behind More. */
function SessionRow({ token, s, nextRound, error, expanded, onExpand, onEdit, onRemove, onFocus }: {
  token: string;
  s: SetupSession;
  nextRound: string;
  error: (field: SessionField) => string | undefined;
  expanded: boolean;
  onExpand: () => void;
  onEdit: (patch: Partial<SetupSession>) => void;
  onRemove: () => void;
  onFocus: () => void;
}) {
  // The box, not the name: clearing the name to retype it mustn't turn the round back into a session.
  const [isRound, setIsRound] = useState(s.round !== "");
  const bind = (f: SessionField) => ({
    value: s[f],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onEdit({ [f]: e.target.value }),
    "aria-invalid": error(f) ? true : undefined,
  });
  const toggleRound = (on: boolean) => {
    setIsRound(on);
    onEdit(on ? { round: s.round || nextRound } : { round: "", rooms: "" });
  };
  const label = "flex flex-col gap-1.5 text-sm font-bold";

  return (
    // stopPropagation: the day's card also listens for focus, and the innermost spot wins.
    <li className="flex flex-col gap-3 rounded-lg border border-border p-3" onFocus={(e) => { e.stopPropagation(); onFocus(); }}>
      <div className="flex flex-wrap items-start gap-2">
        <Input type="time" aria-label="Starts" className="w-28" {...bind("starts_at")} />
        <Input type="time" aria-label="Ends (optional)" className="w-28" {...bind("ends_at")} />
        <Input aria-label="Title" placeholder={isRound ? "Title (optional)" : "Session title"} className="min-w-0 flex-1"
          data-setup-field={`session:${s.id}`} {...bind("title")} />
        <Button type="button" variant="ghost" size="sm" aria-expanded={expanded} onClick={onExpand}>{expanded ? "Less" : "More"}</Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Remove session" onClick={onRemove}><Trash2 /></Button>
      </div>
      {(["starts_at", "ends_at", "round"] as const).map((f) => error(f) && <span key={f} className="text-xs font-semibold text-destructive">{error(f)}</span>)}
      {expanded && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm font-bold sm:col-span-2">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={isRound} onChange={(e) => toggleRound(e.target.checked)} />
            Breakout round: attendees split into rooms
          </label>
          {isRound ? (
            <>
              <label className={label}>Round name<Input placeholder="Breakout 1" {...bind("round")} /></label>
              <label className={label}>
                Rooms<Input placeholder="3A, 3B, 3C" {...bind("rooms")} />
                <span className="text-xs font-normal text-muted-foreground">Separate rooms with commas. Each attendee sees only their own room.</span>
              </label>
            </>
          ) : (
            <>
              <label className={label}>Location<Input placeholder="Grand Ballroom" {...bind("location")} /></label>
              <label className={label}>
                Who it&apos;s for<Input placeholder="Everyone" {...bind("categories")} />
                <span className="text-xs font-normal text-muted-foreground">Leave empty for everyone, or list attendee categories, e.g. Staff, VIP.</span>
              </label>
            </>
          )}
          <label className={`${label} sm:col-span-2`}>Description<Textarea rows={2} {...bind("description")} /></label>
          {!isRound && (
            <div className="sm:col-span-2">
              <SetupImageField token={token} kind="agenda" field={`photo:${s.id}`} label="Photo (optional)" value={s.image_url}
                onChange={(url) => onEdit({ image_url: url })} onFocus={onFocus} />
            </div>
          )}
        </div>
      )}
    </li>
  );
}
```

- [ ] **Step 6: Typecheck, lint, test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 7: Try it in the browser on `ecpkom`**

Run `npm run dev`, then use the `ecpkom` setup link (Admin → ecpkom → Setup → Open as organiser). Check each of these:

1. The checklist shows Agenda as a step, not a card.
2. Opening Agenda shows `ecpkom`'s live agenda prefilled. The preview shows the first day.
3. Add a session, type a time and a title. "Saved" appears, and the preview shows the row in time order, outlined while you type.
4. Click a row in the preview. Its title field takes focus.
5. Add a breakout round with rooms "1, 2". The preview shows one row listing them.
6. A day outside the event dates shows the red error, and Submit is disabled with the first problem as the hint.
7. In the Supabase SQL editor, or with `execute_sql`, run `select seed is not null, applied_map from event_setup_sections where section = 'agenda' and event_id = '4e64a90c-728c-4a08-af62-8c8046afa0c9'`. The map must hold the prefilled ids.

Do not submit yet. Leave the draft in place; Task 10 uses it.

- [ ] **Step 8: Commit**

```bash
git pull --rebase --autostash
git add src/features/setup/portal/useSectionAutosave.ts src/features/setup/portal/actions.ts src/features/setup/portal/SetupStepPage.tsx src/features/setup/portal/AgendaStep.tsx src/features/setup/sections.ts
git commit -m "feat(setup): the Agenda step - days, sessions and breakout rounds with the live agenda preview (D446, D453, D454, D457)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The Info step for organisers

**Files:**
- Modify: `src/components/admin/RichTextEditor.tsx` (optional `onChange`)
- Create: `src/features/setup/portal/InfoStep.tsx`
- Modify: `src/features/setup/portal/actions.ts` (the `info` branches)
- Modify: `src/features/setup/portal/SetupStepPage.tsx` (the `info` branch)
- Modify: `src/features/setup/sections.ts` (`BUILT_STEPS` gets `info`)

**Interfaces:**
- Consumes:
  - from Task 4: `infoFromLive`, `restrictInfoSeed`, `sanitizeInfo`, `infoProblems`, `blankTab`
  - from Task 5: `infoImages`, `ownFloorPlan`, `listImagesToDeleteOnSave`
  - from Task 6: `liveInfo`
  - from Task 7: `InfoPreview`
- Produces: `RichTextEditor`'s new prop `onChange?: (html: string) => void`.

- [ ] **Step 1: Give the editor an `onChange`**

In `src/components/admin/RichTextEditor.tsx`:

1. Add `useEffect` to the React import.
2. Add `onChange` to the props, with this JSDoc:

```ts
  /** Called with the HTML after every edit ("" when empty), for forms that save as you type. */
  onChange?: (html: string) => void;
```

3. Inside the component, before `useEditor`, add:

```ts
  // useEditor keeps the first onUpdate it is given, so the latest callback is read through a ref.
  const changed = useRef(onChange);
  useEffect(() => { changed.current = onChange; }, [onChange]);
```

4. Change `onUpdate` to:

```ts
    onUpdate: ({ editor }) => {
      const out = editor.getHTML();
      const next = isRichTextEmpty(out) ? "" : out;
      setHtml(next);
      changed.current?.(next);
    },
```

- [ ] **Step 2: Write `InfoStep.tsx`**

```tsx
"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor, type UploadImage } from "@/components/admin/RichTextEditor";
import { problemSentence } from "../sections";
import { blankTab, infoProblems, type InfoAnswers, type SetupTab } from "../sections/info";
import type { SectionStatus } from "../status";
import { InfoPreview, type InfoSlot } from "../preview/InfoPreview";
import { SetupImageField } from "./SetupImageField";
import { StepFrame, StepGroup } from "./StepFrame";
import { useSectionAutosave } from "./useSectionAutosave";
import { uploadSetupImageAction } from "./actions";

/**
 * Info and the floor plan (D446, D458): one card per tab - its title, and rich text with
 * pictures - in the order attendees see them, then the floor plan. The preview shows the tab
 * being edited, or the floor plan screen while that is being edited (D445).
 */
export function InfoStep({ token, initial, initialRev, initialStatus, initialUnsubmitted, primaryColor, infoTitle }: {
  token: string;
  initial: InfoAnswers;
  initialRev: number;
  initialStatus: SectionStatus;
  initialUnsubmitted: boolean;
  primaryColor: string;
  infoTitle: string;
}) {
  const [seedIds] = useState(() => initial.tabs.map((t) => t.id));
  const step = useSectionAutosave({ token, section: "info", initial, initialRev, initialStatus, initialUnsubmitted, seedIds });
  const { answers: a, setAnswers: set } = step;
  const [focused, setFocused] = useState<InfoSlot | null>(null);
  const problems = infoProblems(a);

  const upload: UploadImage = async (fd) => {
    const r = await uploadSetupImageAction(token, "info", fd);
    return r.ok ? { url: r.url } : { error: r.message };
  };
  const editTab = (id: string, patch: Partial<SetupTab>) => set((p) => ({ ...p, tabs: p.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const move = (id: string, by: -1 | 1) => set((p) => {
    const i = p.tabs.findIndex((t) => t.id === id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= p.tabs.length) return p;
    const tabs = [...p.tabs];
    [tabs[i], tabs[j]] = [tabs[j], tabs[i]];
    return { ...p, tabs };
  });
  const addTab = () => {
    const t = blankTab(crypto.randomUUID());
    set((p) => ({ ...p, tabs: [...p.tabs, t] }));
    setFocused(`tab:${t.id}`);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-setup-field="tab:${t.id}"]`)?.focus());
  };
  const removeTab = (t: SetupTab) => {
    if (t.html.trim() && !window.confirm(`Remove “${t.title.trim() || "this tab"}” and what's written in it?`)) return;
    set((p) => ({ ...p, tabs: p.tabs.filter((x) => x.id !== t.id) }));
  };
  const jump = (slot: InfoSlot) => {
    setFocused(slot);
    document.querySelector<HTMLElement>(`[data-setup-field="${slot}"]`)?.focus();
  };

  return (
    <StepFrame token={token} title="Info and floor plan" step={step} complete={problems.length === 0} incompleteHint={problemSentence(problems) ?? undefined}
      preview={<InfoPreview info={a} title={infoTitle} primaryColor={primaryColor} focused={focused} onSlot={jump} />}>
      <StepGroup title="Info tabs" help="Each tab is a page attendees can open: getting there and parking, dress code, who to call. Add pictures with the Image button.">
        {a.tabs.map((t, n) => (
          <div key={t.id} className="flex flex-col gap-3 rounded-lg border border-border p-3" onFocus={() => setFocused(`tab:${t.id}`)}>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-sm font-bold">Tab title</span>
                <Input value={t.title} placeholder="Getting there" data-setup-field={`tab:${t.id}`} onChange={(e) => editTab(t.id, { title: e.target.value })} />
              </label>
              <Button type="button" variant="ghost" size="icon" aria-label="Move up" disabled={n === 0} onClick={() => move(t.id, -1)}><ArrowUp /></Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Move down" disabled={n === a.tabs.length - 1} onClick={() => move(t.id, 1)}><ArrowDown /></Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Remove tab" onClick={() => removeTab(t)}><Trash2 /></Button>
            </div>
            <RichTextEditor name={`tab-${t.id}`} label="Content" defaultValue={t.html} uploadImage={upload} minHeight={140}
              onChange={(html) => editTab(t.id, { html })} />
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={addTab}>Add tab</Button>
      </StepGroup>

      <StepGroup title="Floor plan" help="Opens from the Floor plan button on the portal home. Attendees can zoom in, so send the clearest version you have.">
        <SetupImageField token={token} kind="floor-plan" field="floor_plan" label="Floor plan" value={a.floor_plan_url}
          onChange={(url) => set((p) => ({ ...p, floor_plan_url: url }))} onFocus={() => setFocused("floor_plan")} />
      </StepGroup>
    </StepFrame>
  );
}
```

- [ ] **Step 3: The Info branches in `portal/actions.ts`**

1. Add these imports:

```ts
import { liveInfo } from "../db";   // merge into the existing ../db import
import { infoFromLive, infoProblems, restrictInfoSeed, sanitizeInfo } from "../sections/info";
import { infoImages, ownFloorPlan } from "../images";   // merge into the existing ../images import
```

2. In `saveSectionAction`, replace `case "info": return fail(...)` with `case "info": return saveInfo(loaded.ev, expectedRev, raw, seedIds);`.
3. In `submitProblem`, replace the `info` case with `case "info": return problemSentence(infoProblems(sanitizeInfo(row.answers)));`.
4. Add the save function:

```ts
/** As saveAgenda (D454, D459). Images inside tab text are any https image, as in admin; the floor plan must be an own upload or the starting one. */
async function saveInfo(ev: Event, expectedRev: number, raw: unknown, seedIds: unknown): Promise<SetupResult> {
  const prev = await getSetupRow(ev.id, "info");
  let seed: ReturnType<typeof restrictInfoSeed> | null = null;
  if (expectedRev === 0) {
    if (!isIdList(seedIds)) return fail(RELOAD);
    const live = await liveInfo(ev);
    seed = restrictInfoSeed(infoFromLive(live.tabs, live.floorPlan), seedIds);
  }
  const start = infoImages(seed?.answers ?? sanitizeInfo(prev?.seed));
  const isOwnPlan = (u: string) => isEventMediaFor(u, supabaseUrl(), ev.org_id, ev.id, ["floor-plan"]);
  const isOwn = (u: string) => isEventMediaFor(u, supabaseUrl(), ev.org_id, ev.id, ["info", "floor-plan"]);
  const answers = ownFloorPlan(sanitizeInfo(raw), isOwnPlan, start);
  const rev = await saveAnswers(ev.id, "info", expectedRev, answers, seed?.answers, seed?.map);
  if (rev === null) return STALE;
  const keep = [...start, ...infoImages(sanitizeInfo(prev?.submitted)), ...infoImages(sanitizeInfo(prev?.applied))];
  const before = prev ? infoImages(sanitizeInfo(prev.answers)) : null;
  for (const url of listImagesToDeleteOnSave(before, infoImages(answers), keep, isOwn)) await deleteEventImage(url);
  return { ok: true, rev };
}
```

- [ ] **Step 4: The Info branch in `SetupStepPage.tsx`**

Import `liveInfo` (from `../db`), `infoFromLive` and `sanitizeInfo` (from `../sections/info`), and `InfoStep` (from `./InfoStep`). Replace `case "info": return notFound();` with:

```tsx
    case "info": {
      const [basicsRow, live] = await Promise.all([getSetupRow(ev.id, "basics"), row ? null : liveInfo(ev)]);
      const basics = basicsRow ? sanitizeBasics(basicsRow.answers) : null;
      const initial = row ? sanitizeInfo(row.answers) : infoFromLive(live!.tabs, live!.floorPlan).answers;
      step = <InfoStep {...common} initial={initial} primaryColor={basics?.primary_color || ev.primary_color} infoTitle={ev.info_page_title} />;
      break;
    }
```

- [ ] **Step 5: Turn Info on**

In `sections.ts`: `export const BUILT_STEPS: readonly SetupSection[] = SETUP_SECTIONS;`. Update the comment above it to:

```ts
/** The steps organisers can fill in: all of them since Phase 2. A future section starts as a guide card until built (D452). */
```

- [ ] **Step 6: Typecheck, lint, test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: PASS.

`tests/setup/checklist.test.ts` passes `builtSteps` itself, so it is unaffected.

- [ ] **Step 7: Try it in the browser on `ecpkom`**

1. The checklist now shows three steps and no Agenda or Info cards.
2. Info opens prefilled with `ecpkom`'s tabs and floor plan. Edit a tab title; "Saved" appears and the preview updates.
3. Type in the editor; the preview updates after the save debounce. Insert an image through the editor's Image button; it uploads and shows in the preview.
4. Focus the floor plan field; the preview switches to the floor plan screen.
5. Move a tab up; the preview's tab strip follows.

Do not submit yet.

- [ ] **Step 8: Commit**

```bash
git pull --rebase --autostash
git add src/components/admin/RichTextEditor.tsx src/features/setup/portal/InfoStep.tsx src/features/setup/portal/actions.ts src/features/setup/portal/SetupStepPage.tsx src/features/setup/sections.ts
git commit -m "feat(setup): the Info step - tabs with rich text and pictures, and the floor plan, with the info preview (D446, D458)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Admin review and Apply for Agenda and Info

**Files:**
- Modify: `src/features/setup/sections/basics.ts` (`basicsProblems`)
- Create: `src/features/setup/admin/plans.ts`
- Create: `src/features/setup/admin/PlanChanges.tsx`
- Create: `src/features/setup/admin/BasicsChanges.tsx`
- Modify: `src/features/setup/admin/SetupReviewPage.tsx` (full replacement)
- Modify: `src/features/setup/admin/actions.ts` (Apply generalised)
- Modify: `src/features/setup/admin/SetupAdminPage.tsx`
- Modify: `tests/setup/basics.test.ts` (one test)

**Interfaces:**
- Consumes:
  - `planAgenda`, `agendaBaseline` (Task 3)
  - `planInfo`, `infoBaseline` (Task 4)
  - `liveAgenda`, `liveInfo`, `applyAgendaPlan`, `applyInfoPlan` (Task 6)
  - `AgendaPreview`, `InfoPreview` (Task 7)
  - `SECTION_TITLES` (Task 8)
- Produces:
  - `basicsProblems(a) → string[]`
  - `agendaReview(ev, row, newId)` and `infoReview(ev, row, newId)` in `admin/plans.ts`. Each returns its plan, its problems, and what the clean-up needs.

- [ ] **Step 1: `basicsProblems`, test first**

Append to `tests/setup/basics.test.ts`. Add `basicsProblems` to its import from `@/features/setup/sections/basics`:

```ts
describe("basicsProblems", () => {
  it("names each empty required field and each wrong value", () => {
    expect(basicsProblems(full())).toEqual([]);
    expect(basicsProblems(full({ name: "", primary_color: "red" }))).toEqual(["Event name is empty", "Brand colour: Use a colour like #F97316."]);
  });
});
```

Run `npx vitest run tests/setup/basics.test.ts`. Expected: FAIL.

Append to `sections/basics.ts`:

```ts
/** Why this Basics version can't be applied, one line per field. The review shows them; Apply refuses on them. */
export function basicsProblems(a: BasicsAnswers): string[] {
  return [
    ...basicsMissing(a).map((f) => `${BASICS_LABELS[f]} is empty`),
    ...Object.entries(basicsErrors(a)).map(([f, m]) => `${BASICS_LABELS[f as BasicsField]}: ${m}`),
  ];
}
```

Run the test again. Expected: PASS.

- [ ] **Step 2: One place that builds a section's plan**

`src/features/setup/admin/plans.ts`:

```ts
import "server-only";
import type { Event } from "@/lib/types";
import { isEventMediaFor } from "@/lib/storage";
import { liveAgenda, liveInfo, type SetupRow } from "../db";
import { agendaErrors, agendaProblems, sanitizeAgenda, type AgendaAnswers } from "../sections/agenda";
import { agendaBaseline, planAgenda, type AgendaLive, type AgendaPlan } from "../sections/agenda-apply";
import { infoProblems, sanitizeInfo, type InfoAnswers } from "../sections/info";
import { infoBaseline, planInfo, type InfoLive, type InfoPlan } from "../sections/info-apply";
import { agendaImages, infoImages } from "../images";

const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const DATES_HINT = "If the organiser changed the event dates, apply Event basics first.";

/** A counter for the review's plan: its new rows are never written, so their ids only need to be distinct. */
export function previewIds(): () => string {
  let n = 0;
  return () => `preview-${++n}`;
}

/**
 * The agenda plan and every reason to refuse it - the review shows exactly this and Apply runs
 * exactly this (D449). Days are checked against the live event (D457). A photo being written must
 * be this event's own upload or one the organiser started from.
 */
export async function agendaReview(ev: Event, row: SetupRow, newId: () => string): Promise<{
  submitted: AgendaAnswers; baseline: AgendaAnswers; live: AgendaLive; plan: AgendaPlan; problems: string[]; isOwn: (url: string) => boolean;
}> {
  const submitted = sanitizeAgenda(row.submitted);
  const baseline = agendaBaseline(row);
  const live = await liveAgenda(ev.id);
  const plan = planAgenda({ submitted, baseline, map: row.applied_map ?? {}, live, newId });
  const range = { first: ev.starts_on, last: ev.ends_on };
  const isOwn = (u: string) => isEventMediaFor(u, supabaseUrl(), ev.org_id, ev.id, ["agenda"]);
  const started = new Set(agendaImages(baseline));
  const photos = [...plan.items.insert.map((i) => i.image_url), ...plan.items.update.map((u) => u.image_url)].filter((u): u is string => !!u);
  const outside = Object.values(agendaErrors(submitted, range)).some((m) => m.startsWith("Outside the event dates"));
  const problems = [
    ...agendaProblems(submitted, range),
    ...(outside ? [DATES_HINT] : []),
    ...plan.problems,
    ...(photos.some((u) => !isOwn(u) && !started.has(u)) ? ["A session photo wasn't uploaded through the setup link."] : []),
  ];
  return { submitted, baseline, live, plan, problems, isOwn };
}

/** The info plan and every reason to refuse it (D449). The floor plan must be an own upload or the one they started from. */
export async function infoReview(ev: Event, row: SetupRow, newId: () => string): Promise<{
  submitted: InfoAnswers; baseline: InfoAnswers; live: InfoLive; plan: InfoPlan; problems: string[]; isOwn: (url: string) => boolean;
}> {
  const submitted = sanitizeInfo(row.submitted);
  const baseline = infoBaseline(row);
  const live = await liveInfo(ev);
  const plan = planInfo({ submitted, baseline, map: row.applied_map ?? {}, live, newId });
  const isOwn = (u: string) => isEventMediaFor(u, supabaseUrl(), ev.org_id, ev.id, ["info", "floor-plan"]);
  const planUrl = plan.floorPlan?.url;
  const foreignPlan = planUrl && !isEventMediaFor(planUrl, supabaseUrl(), ev.org_id, ev.id, ["floor-plan"]) && !infoImages(baseline).includes(planUrl);
  const problems = [...infoProblems(submitted), ...plan.problems, ...(foreignPlan ? ["The floor plan wasn't uploaded through the setup link."] : [])];
  return { submitted, baseline, live, plan, problems, isOwn };
}
```

- [ ] **Step 3: The change lists**

`src/features/setup/admin/PlanChanges.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { changeSummary, type PlanChange } from "../sections/changes";

const HOW: Record<PlanChange["how"], { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  added: { label: "Added", variant: "success" },
  changed: { label: "Changed", variant: "warning" },
  removed: { label: "Removed", variant: "destructive" },
  kept: { label: "Kept", variant: "secondary" },
};

/** What Apply would do, one line per day, session, round or tab, under a one-line summary (D449). */
export function PlanChanges({ changes, empty, extra }: {
  changes: PlanChange[];
  empty: string;
  /** Anything a change needs beyond its lines, such as the floor plan's before and after. */
  extra?: (c: PlanChange) => React.ReactNode;
}) {
  if (changes.length === 0) return <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground">{empty}</p>;
  const summary = changeSummary(changes);
  return (
    <>
      <p className="border-t border-border px-4 py-3 text-sm font-bold">{summary || "Nothing to write. See the notes below."}</p>
      <ul className="divide-y divide-border border-t border-border">
        {changes.map((c, i) => (
          <li key={i} className="flex flex-col gap-1 px-4 py-3">
            <span className="flex flex-wrap items-center gap-2 text-sm font-bold">
              <Badge variant={HOW[c.how].variant}>{HOW[c.how].label}</Badge>
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.what}</span>
              {c.label}
            </span>
            {c.lines.map((line) => <span key={line} className="text-sm text-muted-foreground">{line}</span>)}
            {extra?.(c)}
          </li>
        ))}
      </ul>
    </>
  );
}
```

`src/features/setup/admin/BasicsChanges.tsx` holds the Basics list, moved from `SetupReviewPage.tsx` lines 73–98 unchanged:

```tsx
import type { BasicsChange } from "../sections/basics";

/** Basics' changes, field by field: text before and after, images side by side (D449). */
export function BasicsChanges({ changes, applied }: { changes: BasicsChange[]; applied: boolean }) {
  if (changes.length === 0) {
    return <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground">{applied ? "Nothing new since the last Apply." : "Matches the live event."}</p>;
  }
  return (
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
  );
}
```

- [ ] **Step 4: Replace `SetupReviewPage.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { shortDateTime } from "@/lib/text";
import type { Event } from "@/lib/types";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSetupRow, type SetupRow } from "../db";
import { isBuiltStep, SECTION_TITLES, type SetupSection } from "../sections";
import { hasUnsubmittedChanges, sectionStatus, STATUS_LABELS } from "../status";
import { basicsBaseline, basicsChanges, basicsFromEvent, basicsProblems, sanitizeBasics } from "../sections/basics";
import { HomePreview } from "../preview/HomePreview";
import { AgendaPreview } from "../preview/AgendaPreview";
import { InfoPreview } from "../preview/InfoPreview";
import { agendaReview, infoReview, previewIds } from "./plans";
import { BasicsChanges } from "./BasicsChanges";
import { PlanChanges } from "./PlanChanges";
import { applySectionAction } from "./actions";

type Review = { problems: string[]; description: string; body: React.ReactNode; preview: React.ReactNode };

const ONLY_CHANGES = "Lists only what the organiser changed that differs from the live event. Apply writes just these, so your own edits stay unless the organiser changed the same thing again.";

/** Each section's review: its problems, what would change, and the preview the organiser saw (D449). */
async function reviewFor(section: SetupSection, ev: Event, row: SetupRow): Promise<Review> {
  switch (section) {
    case "basics": {
      const submitted = sanitizeBasics(row.submitted);
      return {
        problems: basicsProblems(submitted),
        description: ONLY_CHANGES,
        body: <BasicsChanges changes={basicsChanges(submitted, basicsFromEvent(ev), basicsBaseline(row, ev))} applied={Boolean(row.applied)} />,
        preview: <HomePreview basics={submitted} compact />,
      };
    }
    case "agenda": {
      const r = await agendaReview(ev, row, previewIds());
      return {
        problems: r.problems,
        description: `${ONLY_CHANGES} New and retimed sessions go in by time; everything else keeps its order.`,
        body: <PlanChanges changes={r.plan.changes} empty={row.applied ? "Nothing new since the last Apply." : "Matches the live agenda."} />,
        preview: <AgendaPreview agenda={r.submitted} primaryColor={ev.primary_color} compact />,
      };
    }
    case "info": {
      const r = await infoReview(ev, row, previewIds());
      const plan = (c: { what: string }) => c.what !== "floor plan" ? null : (
        <span className="flex items-center gap-3 text-xs text-muted-foreground">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {r.live.floorPlan ? <img src={r.live.floorPlan} alt="Current" className="h-20 rounded border border-border object-contain" /> : <span>None</span>}
          →
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {r.submitted.floor_plan_url ? <img src={r.submitted.floor_plan_url} alt="Submitted" className="h-20 rounded border border-border object-contain" /> : <span>Removed</span>}
        </span>
      );
      return {
        problems: r.problems,
        description: `${ONLY_CHANGES} Tabs you added in admin keep their places.`,
        body: <PlanChanges changes={r.plan.changes} empty={row.applied ? "Nothing new since the last Apply." : "Matches the live info pages."} extra={plan} />,
        preview: <InfoPreview info={r.submitted} title={ev.info_page_title} primaryColor={ev.primary_color} compact />,
      };
    }
    default: { const never: never = section; return never; }
  }
}

/** What Apply would change on the live event, next to the preview the organiser saw (D449). */
export async function SetupReviewPage({ params }: { params: Promise<{ id: string; section: string }> }) {
  const { id, section } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  if (!isBuiltStep(section)) notFound();
  const row = await getSetupRow(ev.id, section);
  const status = sectionStatus(row);
  const back = `/admin/events/${ev.id}/setup`;
  const title = SECTION_TITLES[section];

  if (!row?.submitted) {
    return (
      <div className="flex flex-col gap-4">
        <AdminHeader title={title} subtitle="Nothing submitted yet." />
        <Link href={back} className="text-sm font-bold text-primary">‹ Setup</Link>
      </div>
    );
  }

  const review = await reviewFor(section, ev, row);
  const canApply = status === "submitted" && review.problems.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title={title}
        subtitle={`Submitted ${row.submitted_at ? shortDateTime(row.submitted_at) : ""}${row.applied_at ? ` · last applied ${shortDateTime(row.applied_at)}` : ""}`}
        actions={
          canApply ? (
            // Bound to the version on screen: Apply refuses if the organiser has submitted since.
            <form action={applySectionAction.bind(null, ev.id, section, row.submitted_at ?? "")}>
              <SubmitButton>Apply to event</SubmitButton>
            </form>
          ) : (
            // SubmitButton does not forward `disabled` (it owns it for the pending state), so a plain Button.
            <Button disabled>Apply to event</Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Link href={back} className="text-sm font-bold text-primary">‹ Setup</Link>
        <Badge variant={status === "applied" ? "success" : "warning"}>{STATUS_LABELS[status]}</Badge>
        {hasUnsubmittedChanges(row) && <span className="text-xs text-muted-foreground">The organiser is editing again; you see their last submitted version.</span>}
      </div>
      {review.problems.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">Can&apos;t be applied yet</CardTitle>
            <CardDescription>Ask the organiser to fix these, or fix the event in admin first.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-5 text-sm">{review.problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="overflow-hidden pb-0">
          <CardHeader>
            <CardTitle>What would change</CardTitle>
            <CardDescription>{review.description}</CardDescription>
          </CardHeader>
          <CardContent className="px-0">{review.body}</CardContent>
        </Card>
        <aside className="flex flex-col gap-2">
          <p className="text-center text-xs font-bold uppercase tracking-wide text-muted-foreground">As submitted</p>
          {review.preview}
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Apply for every section**

In `src/features/setup/admin/actions.ts`:

1. Merge these into the imports: `applyAgendaPlan`, `applyInfoPlan`, `liveAgenda`, `liveInfo` and `type SetupRow` from `../db`; `agendaReview` and `infoReview` from `./plans`; `changeSummary` from `../sections/changes`; `agendaImages`, `htmlImages`, `infoImages` and `listImagesToDeleteOnApply` from `../images`; `sanitizeAgenda` from `../sections/agenda`; `sanitizeInfo` from `../sections/info`; `basicsProblems` from `../sections/basics`; `SECTION_TITLES` and `type SetupSection` from `../sections`; and `type Event` from `@/lib/types`.
2. Remove the basics imports that are no longer used.
3. Replace `applySectionAction` with:

```ts
type Outcome = { ok: boolean; message: string };

/**
 * Applies a submitted section (D449-D451): the version the admin reviewed, identified by its
 * `submitted_at` (bound by the review page). If the organiser has submitted since, it refuses. It
 * checks that version again against the event as it is now and writes only what the organiser
 * changed (the same plan the review showed). Recording is guarded on `submitted_at`, so a submit
 * landing mid-Apply is never marked applied; the event write has happened by then, and the
 * message says so.
 */
export async function applySectionAction(eventId: string, section: string, reviewedAt: string) {
  const ev = await event(eventId);
  const back = `${setupPath(ev.id)}/${section}`;
  if (!isBuiltStep(section)) redirect(flashPath(setupPath(ev.id), "That section can't be applied yet.", "error"));
  if (typeof reviewedAt !== "string" || !reviewedAt) redirect(flashPath(back, "Review the section before applying it.", "error"));
  const row = await getSetupRow(ev.id, section);
  if (!row || sectionStatus(row) !== "submitted") redirect(flashPath(back, "There is nothing new to apply.", "error"));
  if (row.submitted_at !== reviewedAt) redirect(flashPath(back, "The organiser sent a newer version — review it first.", "error"));

  const s: SetupSection = section;
  let outcome: Outcome;
  switch (s) {
    case "basics": outcome = await applyBasics(ev, row, reviewedAt); break;
    case "agenda": outcome = await applyAgenda(ev, row, reviewedAt); break;
    case "info": outcome = await applyInfo(ev, row, reviewedAt); break;
    default: { const never: never = s; outcome = never; }
  }
  revalidatePath(`/admin/events/${ev.id}`, "layout");
  revalidatePath(`/e/${ev.slug}`, "layout");
  redirect(outcome.ok ? flashPath(setupPath(ev.id), outcome.message) : flashPath(back, outcome.message, "error"));
}

const MEANWHILE = "Applied, but the organiser changed this section meanwhile. Review the latest version.";
const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/** Basics, as Phase 1 applied it: one row update with only the changed fields. */
async function applyBasics(ev: Event, row: SetupRow, reviewedAt: string): Promise<Outcome> {
  const submitted = sanitizeBasics(row.submitted);
  const problems = basicsProblems(submitted);
  const baseline = basicsBaseline(row, ev);
  // Only fields that differ from the live event: the count matches the review, no write is a no-op (D449).
  const patch = basicsPatch(submitted, baseline, basicsFromEvent(ev));
  const kindOf = (f: (typeof BASICS_IMAGE_FIELDS)[number]) => (f === "logo_url" ? "logo" : "banner");
  // Only an image about to be written has to be this event's own upload: an untouched legacy one is never written.
  for (const f of BASICS_IMAGE_FIELDS) {
    const url = patch[f];
    if (url && !isEventMediaFor(url, supabaseUrl(), ev.org_id, ev.id, [kindOf(f)])) problems.push(`${BASICS_LABELS[f]} was not uploaded through this link`);
  }
  if (problems.length) return { ok: false, message: `Not applied. ${problems.join(". ")}.` };
  if (Object.keys(patch).length) await updateEvent(ev.id, patch);
  // A replaced image goes after the row points at the new one, as Settings does (imagesToDeleteOnApply).
  for (const url of imagesToDeleteOnApply(ev, patch, baseline, sanitizeBasics(row.answers), supabaseUrl())) await deleteEventImage(url);
  if (!(await markApplied(ev.id, "basics", reviewedAt, row.submitted))) return { ok: false, message: MEANWHILE };
  const n = Object.keys(patch).length;
  return { ok: true, message: n ? `Event basics applied: ${n} change${n === 1 ? "" : "s"} written.` : "Event basics applied. Nothing on the event needed changing." };
}

/** The agenda's plan in one transaction (D451, D455), then the photos it freed (D459). */
async function applyAgenda(ev: Event, row: SetupRow, reviewedAt: string): Promise<Outcome> {
  const r = await agendaReview(ev, row, () => crypto.randomUUID());
  if (r.problems.length) return { ok: false, message: `Not applied. ${r.problems.join(" ")}` };
  let marked: boolean;
  try {
    marked = await applyAgendaPlan(ev.id, reviewedAt, row.submitted, r.plan);
  } catch (e) {
    return { ok: false, message: `Not applied, and nothing was changed: ${(e as Error).message}` };
  }
  const after = await liveAgenda(ev.id);
  const stillUsed = after.items.map((i) => i.image_url).filter((u): u is string => !!u);
  const freed = listImagesToDeleteOnApply(agendaImages(r.baseline), agendaImages(r.submitted), agendaImages(sanitizeAgenda(row.answers)), stillUsed, r.isOwn);
  for (const url of freed) await deleteEventImage(url);
  if (!marked) return { ok: false, message: MEANWHILE };
  const summary = changeSummary(r.plan.changes);
  return { ok: true, message: summary ? `${SECTION_TITLES.agenda} applied: ${summary}.` : `${SECTION_TITLES.agenda} applied. Nothing on the event needed changing.` };
}

/** The info plan in one transaction (D451, D455), then the pictures it freed (D459). */
async function applyInfo(ev: Event, row: SetupRow, reviewedAt: string): Promise<Outcome> {
  const r = await infoReview(ev, row, () => crypto.randomUUID());
  if (r.problems.length) return { ok: false, message: `Not applied. ${r.problems.join(" ")}` };
  let marked: boolean;
  try {
    marked = await applyInfoPlan(ev.id, reviewedAt, row.submitted, r.plan);
  } catch (e) {
    return { ok: false, message: `Not applied, and nothing was changed: ${(e as Error).message}` };
  }
  const evNow = await requireEvent(ev.id, ev.org_id);
  const after = await liveInfo(evNow);
  const stillUsed = [...after.tabs.flatMap((t) => htmlImages(t.html ?? "")), ...(after.floorPlan ? [after.floorPlan] : [])];
  const freed = listImagesToDeleteOnApply(infoImages(r.baseline), infoImages(r.submitted), infoImages(sanitizeInfo(row.answers)), stillUsed, r.isOwn);
  for (const url of freed) await deleteEventImage(url);
  if (!marked) return { ok: false, message: MEANWHILE };
  const summary = changeSummary(r.plan.changes);
  return { ok: true, message: summary ? `${SECTION_TITLES.info} applied: ${summary}.` : `${SECTION_TITLES.info} applied. Nothing on the event needed changing.` };
}
```

`markApplied` stays imported, because Basics uses it. Run `npm run lint` to remove any import left unused. If `requireEvent`'s signature differs from `(id, orgId)`, use it as `event()` does.

- [ ] **Step 6: The Setup page lists every section**

In `src/features/setup/admin/SetupAdminPage.tsx`:

1. Delete the local `TITLES` and import `SECTION_TITLES` from `../sections`.
2. Use `SECTION_TITLES[section]` in the list.
3. Change the Sections card description to `Open a submitted section to see what would change, then apply it.`

- [ ] **Step 7: Typecheck, lint, test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 8: Review and apply in the browser, on `ecpkom` only**

Signed in as admin:

1. As organiser, submit the Agenda draft from Task 8. As admin, open Setup. The badge shows 1; open Agenda.
2. The review lists exactly the sessions you added or changed, with the summary line. The preview matches what the organiser saw.
3. Apply. The flash shows the summary. Open the portal (`/e/ecpkom/agenda`): the new session is there in time order, and the breakout round's rooms exist in admin Agenda.
4. In admin, edit the title of one session the organiser created. As organiser, change that session's location only and resubmit. Apply again: the location is written and your admin title stays.
5. In admin, delete a session the organiser created. As organiser, resubmit something else. Apply: the deleted session stays deleted.
6. Do the same for Info:
   - change a tab title
   - add a tab with a picture
   - upload a floor plan
   - submit, review (the floor plan shows before and after), apply
   - check `/e/ecpkom/info` and the Floor plan tile

- [ ] **Step 9: Commit**

```bash
git pull --rebase --autostash
git add src/features/setup/sections/basics.ts tests/setup/basics.test.ts src/features/setup/admin/plans.ts src/features/setup/admin/PlanChanges.tsx src/features/setup/admin/BasicsChanges.tsx src/features/setup/admin/SetupReviewPage.tsx src/features/setup/admin/actions.ts src/features/setup/admin/SetupAdminPage.tsx
git commit -m "feat(setup): review and apply Agenda and Info - the review shows the plan Apply runs (D449-D451, D455)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Close-out

**Files:**
- Modify: `docs/superpowers/specs/2026-10-10-organiser-setup-design.md`
- Memory: `catalogue-setup-quote.md` (controller only, not a subagent)

- [ ] **Step 1: Run everything**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build && npm run check:setup
```

Expected: all pass, and `check:setup` ends "All checks passed."

- [ ] **Step 2: Update the spec**

In `docs/superpowers/specs/2026-10-10-organiser-setup-design.md`:

1. Replace the status line with:

   **Status: approved in chat on 10 Oct 2026. Phase 1 built 10 Oct 2026 (plan docs/superpowers/plans/2026-10-10-organiser-setup-phase-1.md). Phase 2 built 10 Oct 2026 (plan docs/superpowers/plans/2026-10-10-organiser-setup-phase-2.md): the Agenda and Info steps, their previews, and their review and Apply. All three steps are fillable.**

2. Add a section `## Phase 2 decisions` after D452, holding D453–D460 copied from this plan's "New decisions" section.
3. Under Testing, add bullets for:
   - `tests/setup/agenda*.test.ts`, `info*.test.ts`, `changes.test.ts`
   - the apply functions in `check:setup`

- [ ] **Step 3: Commit**

```bash
git pull --rebase --autostash
git add docs/superpowers/specs/2026-10-10-organiser-setup-design.md
git commit -m "docs(setup): Phase 2 built - Agenda and Info steps, D453-D460

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Browser walk-through (controller, signed in, on `ecpkom` only)**

Phone width (375 px) and laptop width:

1. Agenda and Info steps lay out without horizontal scroll at 375 px. Preview opens full screen and Escape closes it.
2. Two tabs on the same step: save in one, then edit in the other. The second shows the stale-save message.
3. Leave a step mid-edit within the app. The pending save lands, and reopening shows it.
4. Restore `ecpkom`:
   - delete the sessions, round, tabs and floor plan the walk-through added, in admin
   - turn the setup link off if it was off before

   Note what was there before step 1 of Task 8.

- [ ] **Step 5: Update memory (controller)**

Update `catalogue-setup-quote.md`:

- Phase 2 BUILT 10 Oct 2026, with the commit range and migration 0073.
- Next: brainstorm the quotation site.

Keep the existing links.
