# Organiser Setup Page, Phase 2: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the setup link into the one place organisers send everything:

- every checklist item takes files and a note
- the Agenda step is a simple form (or a file upload), with a live preview and one-click Apply
- Info, Breakout rooms and Announcements are cards

Admins see every item in one table, download files, mark items handled, and review and apply the agenda.

**Architecture:**

- **The hub (D458, D459):**
  - two new tables: `event_setup_items` (one note and status per item) and `event_setup_files` (one row per file)
  - a private bucket, `setup-files`
  - the browser uploads each file straight to the bucket on a server-minted signed URL, then the server records it
  - pure rules live in `src/features/setup/hub.ts`
  - organiser actions live in `portal/hub-actions.ts`
  - one client component, `SetupItemPanel`, holds an item's file list, upload button and note box; every card and the Agenda step use it
- **The Agenda step (D453–D457):**
  - pure answers and checks in `sections/agenda.ts`
  - a pure planner in `sections/agenda-apply.ts`, which returns every write, the new `applied_map`, the change list for review, and any problems
  - one Postgres function, `setup_apply_agenda`, runs the plan in one transaction
  - review and Apply build the same plan
- **Shared step machinery (D460):** `useSectionAutosave`, `StepFrame` and `PhoneFrame`, taken out of `BasicsStep`.

**Tech Stack:**

- Next.js 16 App Router, server actions and one route handler. Read `node_modules/next/dist/docs/` before using any Next API not already used in this repo.
- React 19 and TypeScript.
- Supabase: the service-role client, RLS on with no policies, Storage signed upload and signed download URLs (supabase-js ^2.115), plpgsql.
- Vitest: node environment, `.test.ts` files only, no DOM.

**Spec:** `docs/superpowers/specs/2026-10-10-organiser-setup-design.md`. Read the opening "What the setup page is for" paragraph and the "Phase 2 revision" section (D453–D461) first. Where they differ from earlier decisions, they win.

## Global Constraints

- **Purpose (user, 11 Oct 2026):** the setup page eases onboarding and collects the event's information. It does not set up the portal exactly. Keep organiser forms simple, and prefer a file upload over a detailed form.
- **Sections:**
  - `SETUP_SECTIONS = ["basics", "agenda"]`
  - `BUILT_STEPS` stays `["basics"]` until Task 9 sets it to `SETUP_SECTIONS`
  - The database still accepts `info` (0071), and nothing writes it.
- **Agenda answers (D453):**
  - days: `{ id, date, name }`
  - sessions: `{ id, day, starts_at, ends_at, title, location, description }`
  - Apply never writes `categories`, `image_url`, `slot`, `code`, `color` or `kind`, and never touches breakout-round rows or image rows.
- **Apply writes only fields and items the organiser changed since the baseline, that also differ from the live rows.**
  - The baseline is `applied`, else `seed`, else blank.
  - Items the admin created are never written.
- **Item status (D458):**
  - `empty` when there are no files and the note is blank
  - `handled` when `handled_at` is at or after `updated_at`
  - otherwise `new`
  - Admin labels: Nothing sent / New / Handled. Organiser labels: Not sent / Sent / Received.
- **Files (D459):**
  - at most 25 MB each, at most 20 per item
  - extensions xlsx, xls, csv, docx, doc, pdf, pptx, ppt, txt, png, jpg, jpeg, webp
  - the content type is set from the extension
  - paths are `<org>/<event>/<uuid>.<ext>`
  - download links expire after 60 seconds and carry the file's name
  - files and notes are removed by Purge personal data, and files by event delete
- **The token is the identity.** Every organiser action goes through `loadByToken`, which:
  1. checks `isValidToken`
  2. checks the rate limit `allow(\`setup:${token}\`, 240, 60_000)`
  3. looks the event up by `setup_token`
  
  Item keys are checked against that event's checklist.
- **Never pass a full `Event` row to a client component.** Pass projections only. Never send a file's storage `path` to the browser, except the one just minted for an upload.
- **The database function:**
  - `set search_path = public`
  - every write scoped to `p_event`
  - `revoke execute ... from public, anon, authenticated; grant execute ... to service_role`, as `0063_submit_for_group.sql` does
- **Copy (verbatim):**
  - stale save: `"Someone else updated this section — reload to see their changes."`
  - bad or turned-off link: `"This setup link no longer works. Ask your project contact for a new one."`
  - Apply refused because a newer version arrived: `"The organiser sent a newer version — review it first."`
  - restored item note: `"Deleted in admin; added back because the organiser changed it."`
- **Features are imported only through their entry.**
  - Server code uses `@/features/<name>`; browser and pure code use `@/features/<name>/client`.
  - Inside the feature, files import each other relatively.
  - `src/lib` never imports a feature.
  - Tests in `tests/setup/` may import internals.
- **Never test on the event with slug `ecphub`.** It is a real event. Use `ecpkom` (id `4e64a90c-728c-4a08-af62-8c8046afa0c9`). Never run Purge personal data on `ecpkom`.
- **Git:**
  - Work on `main`.
  - Run `git pull --rebase --autostash` before each commit. Never push.
  - Never stage `docs/superpowers/specs/2026-09-27-intro-video-design.md` or `docs/image-guide/`.
  - Every commit message ends with this trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **Checks before every commit:**
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npm test`
  
  All must pass. `npm run build` runs in Tasks 8 and 11.

## File map

| File | Status | Responsibility |
| --- | --- | --- |
| `src/features/setup/portal/useSectionAutosave.ts` | create | The save chain, generic over a section's answers (D460) |
| `src/features/setup/portal/StepFrame.tsx` | create | A step's layout (D460) |
| `src/features/setup/preview/PhoneFrame.tsx` | create | The phone previews draw in |
| `src/features/setup/preview/HomePreview.tsx` | modify | Uses `PhoneFrame` |
| `src/features/setup/portal/BasicsStep.tsx` | modify | Fields only, on the shared machinery |
| `src/features/catalogue/catalogue.ts` | modify | Info, Breakout rooms and Announcements cards; Agenda's lines |
| `src/features/setup/sections.ts` | modify | `SETUP_SECTIONS`, `SECTION_TITLES`, `problemSentence`, `BUILT_STEPS` |
| `src/features/setup/checklist.ts` | modify | Comment only |
| `src/features/setup/sections/agenda.ts` | create | Agenda answers, starting point, checks, preview data |
| `src/features/setup/sections/agenda-apply.ts` | create | Agenda baseline and planner |
| `src/features/setup/sections/changes.ts` | create | `PlanChange`, `changeSummary`, `RESTORED` |
| `src/features/setup/hub.ts` | create | File rules, paths, item status, labels |
| `src/lib/storage.ts` | modify | `SETUP_BUCKET` |
| `src/lib/db/media.ts` | modify | `sweepSetupFiles`; `deleteEventFiles` sweeps the new bucket |
| `supabase/migrations/0073_setup_hub.sql` | create | Two tables, the bucket, `setup_apply_agenda` |
| `src/features/setup/db.ts` | modify | Checklist, hub reads and writes, live agenda, apply, badge |
| `src/app/admin/events/[id]/actions.ts`, `.../settings/page.tsx` | modify | Purge removes setup files and notes |
| `scripts/setup-db-check.mjs` | modify | Tables, bucket, apply function |
| `src/features/setup/portal/load.ts` | create | `loadByToken`, shared by both action files |
| `src/features/setup/portal/hub-actions.ts` | create | Upload, record, remove, link, note |
| `src/features/setup/portal/SetupItemPanel.tsx` | create | One item's files and note |
| `src/features/setup/portal/SetupHomePage.tsx` | modify | Cards take files and a note; "N of M items sent" |
| `src/components/portal/AgendaList.tsx` | modify | `data-item-id` on each row |
| `src/features/setup/preview/AgendaPreview.tsx` | create | The agenda screen from draft answers |
| `src/features/setup/client.ts` | modify | Exports the new pure modules and the preview |
| `src/features/setup/portal/actions.ts` | modify | Save and submit for both sections |
| `src/features/setup/portal/SetupStepPage.tsx` | modify | Picks the step by section |
| `src/features/setup/portal/AgendaStep.tsx` | create | The Agenda form with its upload panel |
| `src/features/setup/sections/basics.ts` | modify | `basicsProblems` |
| `src/features/setup/admin/plans.ts` | create | The agenda plan and its problems, for review and Apply |
| `src/features/setup/admin/PlanChanges.tsx`, `BasicsChanges.tsx` | create | Change lists |
| `src/features/setup/admin/SetupReviewPage.tsx` | modify | Review for both sections |
| `src/features/setup/admin/SetupAdminPage.tsx` | modify | One checklist table with files, notes and Mark handled |
| `src/features/setup/admin/actions.ts` | modify | Apply for both sections; Mark handled |
| `src/app/admin/events/[id]/setup/files/[fileId]/route.ts` | create | The admin download link |
| `tests/setup/*` | create/modify | Rules, planner, hub |

## Task order

1. Task 1: shared machinery, with no behaviour change.
2. Task 2: catalogue and sections.
3. Tasks 3–5: pure rules.
4. Task 6: database.
5. Task 7: organiser hub.
6. Task 8: the agenda preview.
7. Task 9: the Agenda step.
8. Task 10: admin.
9. Task 11: close-out.

Each task leaves the app working.

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
- Task 9 adds a `seedIds` option to the hook.

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

### Task 2: Catalogue cards and sections

**Files:**
- Modify: `src/features/catalogue/catalogue.ts`
- Modify: `src/features/setup/sections.ts`
- Modify: `src/features/setup/checklist.ts` (comment)
- Modify: `tests/catalogue/catalogue.test.ts`, `tests/setup/checklist.test.ts`

**Interfaces:**
- Produces:
  - `SETUP_SECTIONS = ["basics", "agenda"]`
  - `SECTION_TITLES: Record<SetupSection, string>`
  - `problemSentence(problems): string | null`
  - checklist card keys `info`, `announcements` and `breakouts`

- [ ] **Step 1: Change the tests first**

In `tests/catalogue/catalogue.test.ts`, the "only sections as steps" test now expects:

```ts
    expect(items.filter((i) => i.kind === "step").map((i) => i.key).sort()).toEqual(["agenda", "basics"]);
```

In `tests/setup/checklist.test.ts`:

- The first test expects `["basics", "agenda", "attendee-list", "info", "announcements", "check-in", "breakouts"]`.
- The last test expects `["basics", "agenda", "attendee-list", "info", "announcements", "check-in", "breakouts", "whatsapp", "custom:m1"]`.

Then add:

```ts
  it("makes Info, Announcements and Breakout rooms cards (D461)", () => {
    const list = buildChecklist({ ...base, features: featureSet([], 0) });
    for (const key of ["info", "announcements", "breakouts"]) expect(list.find((e) => e.key === key)?.kind).toBe("card");
  });
```

Add this test to a new `tests/setup/sections.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { problemSentence, SECTION_TITLES, SETUP_SECTIONS } from "@/features/setup/sections";

describe("sections (D461)", () => {
  it("has two sections, each titled", () => {
    expect([...SETUP_SECTIONS]).toEqual(["basics", "agenda"]);
    expect(SECTION_TITLES).toEqual({ basics: "Event basics", agenda: "Agenda" });
  });
  it("says the first problem, and how many more", () => {
    expect(problemSentence([])).toBeNull();
    expect(problemSentence(["A."])).toBe("A.");
    expect(problemSentence(["A.", "B.", "C."])).toBe("A. (and 2 more)");
  });
});
```

Run `npx vitest run tests/catalogue tests/setup`. Expected: FAIL.

- [ ] **Step 2: The catalogue**

In `src/features/catalogue/catalogue.ts`:

1. Change the `SetupItem` doc comment to:

```ts
/**
 * One line of the organiser's setup checklist (D444). A `step` is a section the organiser fills
 * in (its key is the section: basics, agenda); a `card` takes files and a note (D458). `send` says
 * what we need, a line each.
 */
```

2. Replace these features' entries:

```ts
  agenda: base("Agenda", "Days and sessions.", [
    { key: "agenda", kind: "step", title: "Agenda", send: ["Each day's date and an optional name", "Sessions: start time and title; end time, location and description if you have them", "Or upload the agenda you already have, in Excel, Word or PDF"] },
  ]),
  info: base("Event info and floor plan", "Info tabs and the venue plan.", [
    { key: "info", kind: "card", title: "Event info and floor plan", send: ["The info pages you want, e.g. Getting there, Dress code, FAQ. Any document is fine", "The floor plan, at least 2000 px wide"] },
  ]),
  announcements: base("Announcements", "News for attendees, pinned or not.", [
    { key: "announcements", kind: "card", title: "Announcements", send: ["What you want posted, and when", "Which ones should stay pinned at the top"] },
  ]),
```

```ts
  breakouts: base("Breakout rooms", "Rounds and room assignment.", [
    { key: "breakouts", kind: "card", title: "Breakout rooms", send: ["The rooms in each round, and who goes where", "The spreadsheet you already keep is fine"] },
  ]),
```

- [ ] **Step 3: Sections**

Replace the top of `src/features/setup/sections.ts`, the `SETUP_SECTIONS` and `BUILT_STEPS` lines, with:

```ts
/**
 * The sections an organiser fills in on the setup page (D442, D461). Info was one until the
 * Phase 2 revision made it a card; the database still accepts it, and nothing writes it.
 */
export const SETUP_SECTIONS = ["basics", "agenda"] as const;
export type SetupSection = (typeof SETUP_SECTIONS)[number];

/** The steps this release can fill in. The rest show on the checklist as cards until built (D452). */
export const BUILT_STEPS: readonly SetupSection[] = ["basics"];

/** Each section's name, as both the organiser and the admin see it. */
export const SECTION_TITLES: Record<SetupSection, string> = { basics: "Event basics", agenda: "Agenda" };
```

Append:

```ts
/** Why Submit (or Apply) is refused, as one line: the first problem, and how many more there are. */
export function problemSentence(problems: readonly string[]): string | null {
  if (problems.length === 0) return null;
  return problems.length === 1 ? problems[0] : `${problems[0]} (and ${problems.length - 1} more)`;
}
```

In `checklist.ts`, change "(basics, agenda, info)" in the doc comment to "(basics, agenda)".

- [ ] **Step 4: Run, typecheck, lint, commit**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: PASS.

If `tsc` reports `"info"` used as a `SetupSection` anywhere, it can only be `SetupAdminPage`'s `TITLES` map, which is `Record<string, string>`. Leave it: Task 10 replaces it.

```bash
git pull --rebase --autostash
git add src/features/catalogue/catalogue.ts src/features/setup/sections.ts src/features/setup/checklist.ts tests/catalogue/catalogue.test.ts tests/setup/checklist.test.ts tests/setup/sections.test.ts
git commit -m "feat(setup): Info, Breakout rooms and Announcements are checklist cards; Agenda asks less (D453, D461)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Agenda answers and checks (pure)

**Files:**
- Create: `src/features/setup/sections/agenda.ts`
- Create: `tests/setup/fixtures.ts`
- Create: `tests/setup/agenda.test.ts`

**Interfaces:**
- Produces, all in `sections/agenda.ts`:
  - `SetupDay = { id; date; name }`
  - `SetupSession = { id; day; starts_at; ends_at; title; location; description }` (all strings)
  - `AgendaAnswers = { days; sessions }`
  - `AgendaMap = Record<string, string>`
  - `DateRange = { first: string | null; last: string | null }`
  - `SessionField`
  - `blankAgenda()`, `blankSession(id, day)`
  - `sanitizeAgenda(raw)`
  - `sessionFromItem(item)`
  - `agendaFromLive(days, items) → { answers, map }`
  - `restrictSeed(seed, ids)`, `seedIdsOf(a)`
  - `agendaRange(basics | null, ev)`
  - `errorKey(id, field)`, `dayName(day, index)`
  - `agendaErrors(a, range)`, `agendaMissing(a)`, `agendaProblems(a, range)`
  - `previewAgenda(a) → { days: { id; date; name: string | null }[]; items: AgendaItem[] }`

- [ ] **Step 1: Shared test builders**

`tests/setup/fixtures.ts`:

```ts
import type { AgendaDay, AgendaItem } from "@/lib/types";
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
      sessions: [{ id: "s1", day: "d1", title: "t".repeat(500), starts_at: "09:00", image_url: "https://x", round: "R" }],
    });
    expect(a.days[0]).toEqual({ id: "d1", date: "2027-01-10", name: "x".repeat(60) });
    expect(a.sessions[0].title).toHaveLength(160);
    expect(Object.keys(a.sessions[0]).sort()).toEqual(["day", "description", "ends_at", "id", "location", "starts_at", "title"]);
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

describe("agendaFromLive (D453, D454)", () => {
  const days = [day("D1", "2027-01-10", "Day 1")];
  const items = [
    item({ id: "I2", day_id: "D1", starts_at: "10:00", title: "Talk", sort_order: 20, categories: ["Staff"], image_url: "https://x/p.png" }),
    item({ id: "I1", day_id: "D1", starts_at: "09:00", title: "Keynote", sort_order: 10, location: "Hall" }),
    item({ id: "P1", day_id: "D1", kind: "image", starts_at: null, title: "", image_url: "https://x/p.png", sort_order: 30 }),
    item({ id: "R1", day_id: "D1", starts_at: "14:00", title: "Breakout 1", slot: "Breakout 1", code: "3A", sort_order: 40 }),
  ];
  const { answers: a, map } = agendaFromLive(days, items);

  it("keeps real ids, so the map is the identity", () => {
    expect(a.days).toEqual([{ id: "D1", date: "2027-01-10", name: "Day 1" }]);
    expect(map).toEqual({ D1: "D1", I1: "I1", I2: "I2" });
  });
  it("lists sessions in agenda order, and leaves image rows and breakout rounds to admin", () => {
    expect(a.sessions.map((s) => s.id)).toEqual(["I1", "I2"]);
    expect(a.sessions[0]).toEqual({ id: "I1", day: "D1", starts_at: "09:00", ends_at: "", title: "Keynote", location: "Hall", description: "" });
  });
  it("restrictSeed keeps only what the form showed", () => {
    const r = restrictSeed({ answers: a, map }, ["D1", "I1"]);
    expect(r.answers.sessions.map((s) => s.id)).toEqual(["I1"]);
    expect(r.map).toEqual({ D1: "D1", I1: "I1" });
    // A session whose day the form didn't show goes too.
    expect(restrictSeed({ answers: a, map }, ["I1"])).toEqual({ answers: { days: [], sessions: [] }, map: {} });
  });
  it("seedIdsOf lists every day and session id", () => {
    expect(seedIdsOf(a)).toEqual(["D1", "I1", "I2"]);
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
  it("checks nothing against dates it doesn't know", () => {
    expect(agendaErrors(answers({ days: [{ id: "d1", date: "2030-01-01", name: "" }] }), { first: null, last: null })).toEqual({});
  });
});

describe("agendaMissing and agendaProblems", () => {
  it("asks for a day, then sessions, then what each session needs", () => {
    expect(agendaMissing({ days: [], sessions: [] })).toEqual(["Add at least one day."]);
    expect(agendaMissing(answers({ sessions: [] }))).toEqual(["Day 1 has no sessions yet."]);
    expect(agendaMissing(answers({ sessions: [session("s1", "d1", { starts_at: "", title: "" })] })))
      .toEqual(["Day 1: a session needs a start time.", "Day 1: a session needs a title."]);
    expect(agendaMissing(answers({ days: [{ id: "d1", date: "", name: "Gala" }] }))).toEqual(["Gala needs a date."]);
  });
  it("names where each error is", () => {
    const p = agendaProblems(answers({ days: [{ id: "d1", date: "2027-01-12", name: "Gala" }] }), range);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^Gala: Outside the event dates/);
    expect(agendaProblems(answers({ sessions: [session("s1", "d1", { title: "Keynote", ends_at: "08:00" })] }), range))
      .toEqual(["Day 1: Keynote: The end must be after the start."]);
  });
});

describe("previewAgenda (D445, D456)", () => {
  it("shows each day's sessions in time order, ties in the form's order", () => {
    const p = previewAgenda(answers({
      sessions: [session("a", "d1", { starts_at: "10:00", title: "A" }), session("b", "d1", { starts_at: "09:00", title: "B" }), session("c", "d1", { starts_at: "10:00", title: "C" })],
    }));
    expect(p.items.map((i) => i.title)).toEqual(["B", "A", "C"]);
    expect(p.days).toEqual([{ id: "d1", date: "2027-01-10", name: null }]);
  });
  it("skips days without a usable date", () => {
    expect(previewAgenda(answers({ days: [{ id: "d1", date: "", name: "" }] })).days).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/setup/agenda.test.ts`
Expected: FAIL, with "Cannot find module '@/features/setup/sections/agenda'".

- [ ] **Step 4: Write `sections/agenda.ts`**

```ts
import type { AgendaDay, AgendaItem } from "@/lib/types";
import { agendaRows } from "@/lib/breakouts";
import { formatDateRange } from "@/lib/text";

/** A day of the programme as the organiser fills it in (D453). */
export type SetupDay = { id: string; date: string; name: string };
/**
 * A session as the organiser fills it in (D453): when, what and where. Who it's for, a photo,
 * breakout rounds and colours are the admin's, built from what the organiser sends.
 */
export type SetupSession = { id: string; day: string; starts_at: string; ends_at: string; title: string; location: string; description: string };
export type AgendaAnswers = { days: SetupDay[]; sessions: SetupSession[] };
/** Setup id → real row id (D454). */
export type AgendaMap = Record<string, string>;
/** The dates the days must fall within. Either end may be unknown. */
export type DateRange = { first: string | null; last: string | null };

export const MAX_DAYS = 14;
export const MAX_SESSIONS = 300;
/** Setup ids: uuids, and the live ids a form starts from. Never ".", which error keys use. */
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const DAY_LIMITS = { date: 10, name: 60 } as const;
const SESSION_LIMITS = { starts_at: 5, ends_at: 5, title: 160, location: 120, description: 2000 } as const;
export type SessionField = keyof typeof SESSION_LIMITS;
const SESSION_FIELDS = Object.keys(SESSION_LIMITS) as SessionField[];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const isDate = (s: string) => DATE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export function blankAgenda(): AgendaAnswers {
  return { days: [], sessions: [] };
}

export function blankSession(id: string, day: string): SetupSession {
  return { id, day, starts_at: "", ends_at: "", title: "", location: "", description: "" };
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
  for (const rawDay of Array.isArray(o.days) ? o.days.slice(0, MAX_DAYS) : []) {
    const r = record(rawDay);
    const id = r ? takeId(r.id) : null;
    if (!r || !id) continue;
    out.days.push({ id, date: text(r.date, DAY_LIMITS.date), name: text(r.name, DAY_LIMITS.name) });
  }
  const dayIds = new Set(out.days.map((d) => d.id));
  for (const rawSession of Array.isArray(o.sessions) ? o.sessions.slice(0, MAX_SESSIONS) : []) {
    const r = record(rawSession);
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
    id: i.id, day: i.day_id ?? "", starts_at: i.starts_at ?? "", ends_at: i.ends_at ?? "",
    title: i.title, location: i.location ?? "", description: i.description ?? "",
  };
}

/**
 * The live agenda as answers, and the map tying each answer to its row (D454): what an organiser
 * opening Agenda for the first time starts from. Days and sessions keep their real ids, so the
 * map is the identity. Image rows and breakout rounds are the admin's (D453): left out, never touched.
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
    if (row.kind !== "item") continue;
    const i = row.item;
    if (i.kind !== "session" || !i.day_id || !known.has(i.day_id)) continue;
    answers.sessions.push(sessionFromItem(i));
    map[i.id] = i.id;
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
  return { answers: { days, sessions }, map: Object.fromEntries(Object.entries(seed.map).filter(([k]) => kept.has(k))) };
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
  for (const s of a.sessions) {
    const start = s.starts_at.trim();
    const end = s.ends_at.trim();
    if (start && !TIME.test(start)) e[errorKey(s.id, "starts_at")] = "Use a time like 09:30.";
    if (end && !TIME.test(end)) e[errorKey(s.id, "ends_at")] = "Use a time like 10:30.";
    else if (end && TIME.test(start) && end <= start) e[errorKey(s.id, "ends_at")] = "The end must be after the start.";
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
      if (!s.starts_at.trim()) out.push(`${label}: ${s.title.trim() || "a session"} needs a start time.`);
      if (!s.title.trim()) out.push(`${label}: a session needs a title.`);
    }
  });
  return out;
}

/** Everything stopping Submit or Apply, each naming where it is: "Day 2: Keynote: The end must be after the start." */
export function agendaProblems(a: AgendaAnswers, range: DateRange): string[] {
  const where = new Map<string, string>();
  a.days.forEach((d, n) => where.set(d.id, dayName(d, n)));
  for (const s of a.sessions) where.set(s.id, `${where.get(s.day)}: ${s.title.trim() || "a session"}`);
  const errors = Object.entries(agendaErrors(a, range)).map(([k, m]) => `${where.get(k.split(".")[0]) ?? "Agenda"}: ${m}`);
  return [...agendaMissing(a), ...errors];
}

export type PreviewAgenda = { days: { id: string; date: string; name: string | null }[]; items: AgendaItem[] };

/** The answers as the portal agenda shows them (D445, D456): days with a usable date, each day in time order (ties keep the form's order). */
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
    items.push({
      id: s.id, event_id: "", day_id: s.day, day: date, kind: "session",
      starts_at: TIME.test(s.starts_at.trim()) ? s.starts_at.trim() : "--:--",
      ends_at: TIME.test(s.ends_at.trim()) ? s.ends_at.trim() : null,
      title: s.title.trim() || "Untitled session",
      description: s.description.trim() || null,
      location: s.location.trim() || null,
      categories: null, slot: null, code: null, color: null, image_url: null,
      sort_order: n,
    });
  });
  items.sort((x, y) => x.day.localeCompare(y.day) || (x.starts_at ?? "").localeCompare(y.starts_at ?? "") || x.sort_order - y.sort_order);
  return { days, items };
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/setup/agenda.test.ts`
Expected: PASS. If `formatDateRange` throws on a `null` end, pass `range.last ?? range.first` instead, and say so in the report.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint && npm test
git pull --rebase --autostash
git add src/features/setup/sections/agenda.ts tests/setup/fixtures.ts tests/setup/agenda.test.ts
git commit -m "feat(setup): the Agenda section's answers, starting point and checks (D453, D454, D457)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The Agenda planner (pure)

**Files:**
- Create: `src/features/setup/sections/changes.ts`
- Create: `src/features/setup/sections/agenda-apply.ts`
- Create: `tests/setup/changes.test.ts`
- Create: `tests/setup/agenda-apply.test.ts`

**Interfaces:**
- Consumes from Task 3:
  - `AgendaAnswers`, `AgendaMap`, `SetupDay`, `SetupSession`
  - `blankAgenda`, `sanitizeAgenda`, `agendaFromLive`
- Produces, in `changes.ts`:
  - `PlanChange = { what: "day" | "session"; how: "added" | "changed" | "removed" | "kept"; label: string; lines: string[] }`
  - `changeSummary(changes)`
  - `RESTORED`
- Produces, in `agenda-apply.ts`:
  - `AgendaLive = { days: AgendaDay[]; items: AgendaItem[] }`
  - `DayInsert`, `DayUpdate`, `ItemValues`, `ItemInsert`, `ItemUpdate`
  - `AgendaPlan = { days: { insert; update; delete }; items: { insert; update; delete }; order: { id; sort_order }[]; map; changes; problems }`
  - `agendaBaseline(row)`
  - `planAgenda({ submitted, baseline, map, live, newId })`

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
    expect(changeSummary([c("session", "changed"), c("day", "removed")])).toBe("1 day removed · 1 session changed");
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

const live = (days: AgendaDay[], items: AgendaItem[]): AgendaLive => ({ days, items });
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
    const now = live(L.days, [{ ...L.items[0], title: "Opening keynote", categories: ["VIP"], image_url: "https://x/p.png" }]);
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
    expect(p.changes.find((c) => c.what === "day")).toMatchObject({ how: "kept", lines: ["Not removed: 1 item was added in admin."] });
  });

  it("leaves breakout rounds, which are admin's, alone (D453)", () => {
    const L5 = live([day("D1", "2027-01-10")], [
      item({ id: "I1", day_id: "D1", title: "Keynote", sort_order: 10 }),
      item({ id: "R1", day_id: "D1", starts_at: "14:00", title: "Breakout 1", slot: "Breakout 1", code: "3A", sort_order: 20 }),
      item({ id: "R2", day_id: "D1", starts_at: "14:00", title: "Breakout 1", slot: "Breakout 1", code: "3B", sort_order: 20 }),
    ]);
    const { answers: B, map } = seeded(L5);
    expect(B.sessions.map((s) => s.id)).toEqual(["I1"]);
    const p = plan({ days: [], sessions: [] }, B, map, L5);
    expect(p.items.delete).toEqual(["I1"]);
    expect(p.days.delete).toEqual([]);
    expect(p.changes.find((c) => c.what === "day")?.lines).toEqual(["Not removed: 2 items were added in admin."]);
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

  it("moves a session to another day", () => {
    const L6 = live([day("D1", "2027-01-10"), day("D2", "2027-01-11")], [item({ id: "I1", day_id: "D1", title: "Keynote" })]);
    const { answers: B, map } = seeded(L6);
    const p = plan({ ...B, sessions: [{ ...B.sessions[0], day: "D2" }] }, B, map, L6);
    expect(p.items.update).toEqual([{ id: "I1", day_id: "D2" }]);
    expect(p.order).toEqual([]);
    expect(p.changes[0].lines[0]).toMatch(/^Day: /);
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
```

The "moves a session to another day" test: `I1` lands on `D2`, which has no other rows, so it gets `sort_order` 10. It already has 10, so there is no order write.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/setup/changes.test.ts tests/setup/agenda-apply.test.ts`
Expected: FAIL, with "Cannot find module".

- [ ] **Step 3: Write `sections/changes.ts`**

```ts
/** One line of a review (D449): what Apply does to one day or session. */
export type PlanChange = {
  what: "day" | "session";
  how: "added" | "changed" | "removed" | "kept";
  label: string;
  lines: string[];
};

/** The note on an item the admin deleted that the organiser changed again (D450). */
export const RESTORED = "Deleted in admin; added back because the organiser changed it.";

const NOUNS: Record<PlanChange["what"], [string, string]> = { day: ["day", "days"], session: ["session", "sessions"] };
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
import { agendaRows } from "@/lib/breakouts";
import { placeKey, rowKey, sortOrdersFor } from "@/lib/agenda-placement";
import { shortDate } from "@/lib/text";
import { blankAgenda, sanitizeAgenda, type AgendaAnswers, type AgendaMap, type SetupDay, type SetupSession } from "./agenda";
import { RESTORED, type PlanChange } from "./changes";

/** The event's agenda now. */
export type AgendaLive = { days: AgendaDay[]; items: AgendaItem[] };

export type DayInsert = { id: string; date: string; name: string | null };
export type DayUpdate = { id: string; date?: string; name?: string | null };
/** The fields the Agenda step owns (D453). Who it's for, photos, rounds and colours are the admin's. */
export type ItemValues = { day_id: string; starts_at: string; ends_at: string | null; title: string; description: string | null; location: string | null };
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

type Shared = Omit<ItemValues, "day_id">;
type Key = keyof Shared | "day_id";

const LABELS: Record<Key, string> = { starts_at: "Start", ends_at: "End", title: "Title", description: "Description", location: "Location", day_id: "Day" };

const nul = (s: string) => s.trim() || null;
/** "" reads as null, so a blank from admin and a blank in the answers are the same. */
const norm = (v: string | null | undefined) => (v === "" || v === undefined ? null : v);
const same = (a: string | null | undefined, b: string | null | undefined) => norm(a) === norm(b);
const show = (v: string | null | undefined) => norm(v) ?? "empty";
const dayText = (d: Pick<SetupDay, "date" | "name">) => d.name.trim() || (d.date.trim() ? shortDate(d.date.trim()) : "A day");

/** A session's answer as Apply writes it: trimmed, blanks as null. */
function written(s: SetupSession): Shared {
  return { starts_at: s.starts_at.trim(), ends_at: nul(s.ends_at), title: s.title.trim(), description: nul(s.description), location: nul(s.location) };
}

function writtenLive(i: AgendaItem): Shared {
  return { starts_at: i.starts_at ?? "", ends_at: i.ends_at, title: i.title, description: i.description, location: i.location };
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
 * - a session the admin deleted stays deleted unless the organiser changed it again;
 * - rows the admin created (rounds and image rows too) are never touched;
 * - a day the organiser removed goes only when nothing else is on it;
 * - new, retimed and moved sessions are placed by time among their day's rows (D456).
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
  /** Sessions to place by time, per day. */
  const touched: { day: string; key: string; time: string }[] = [];

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
  const timeText = (w: Shared) => (w.ends_at ? `${w.starts_at}–${w.ends_at}` : w.starts_at);

  const insertSession = (s: SetupSession, note?: string) => {
    const d = dayOf(s);
    const dayId = needDay(d);
    const w = written(s);
    const id = newId();
    plan.items.insert.push({ id, day_id: dayId, ...w, sort_order: 0 });
    plan.map[s.id] = id;
    touched.push({ day: dayId, key: id, time: w.starts_at });
    change({ what: "session", how: "added", label: w.title, lines: [`${dayText(d)}, ${timeText(w)}`, ...(note ? [note] : [])] });
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

  for (const s of S.sessions) {
    const b = bSessions.get(s.id);
    if (!b || !map[s.id]) insertSession(s);
    else updateSession(s, b);
  }
  for (const b of B.sessions) {
    if (sSessionIds.has(b.id)) continue;
    const li = map[b.id] ? liveItems.get(map[b.id]) : undefined;
    if (!li) continue;
    plan.items.delete.push(li.id);
    change({ what: "session", how: "removed", label: li.title, lines: [] });
  }

  // Days the organiser removed: gone only when nothing else is on them.
  const leaving = new Set(plan.items.delete);
  for (const u of plan.items.update) if (u.day_id) leaving.add(u.id);
  for (const b of B.days) {
    if (sDays.has(b.id)) continue;
    const ld = map[b.id] ? liveDays.get(map[b.id]) : undefined;
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

  // The portal finds a day by its date, so two can't share one.
  const deletedDays = new Set(plan.days.delete);
  const newDate = new Map(plan.days.update.filter((u) => u.date).map((u) => [u.id, u.date!]));
  const dates = [
    ...live.days.filter((d) => !deletedDays.has(d.id)).map((d) => newDate.get(d.id) ?? d.date),
    ...plan.days.insert.map((d) => d.date),
  ];
  for (const date of new Set(dates.filter((x, i) => dates.indexOf(x) !== i))) {
    plan.problems.push(`Two days would fall on ${shortDate(date)}. Change one of them in admin first.`);
  }

  // Order (D456): each touched session lifted out, then placed by time in turn; everything else
  // (rounds and image rows too) keeps its hand order.
  const deleted = new Set(plan.items.delete);
  const updates = new Map(plan.items.update.map((u) => [u.id, u]));
  const final: AgendaItem[] = [
    ...live.items.filter((i) => !deleted.has(i.id)).map((i) => ({ ...i, ...updates.get(i.id) }) as AgendaItem),
    ...plan.items.insert.map((n): AgendaItem => ({
      ...n, event_id: "", kind: "session", day: n.day_id, categories: null, slot: null, code: null, color: null, image_url: null,
    })),
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
    .filter(([id, n]) => liveItems.has(id) && liveItems.get(id)!.sort_order !== n)
    .map(([id, sort_order]) => ({ id, sort_order }));
  return plan;
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/setup/changes.test.ts tests/setup/agenda-apply.test.ts`
Expected: PASS.

If an expectation fails, read the rule the test guards and fix the planner, not the test. The exception is the exact text `shortDate` produces; adjust that and say so in the report.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint && npm test
git pull --rebase --autostash
git add src/features/setup/sections/changes.ts src/features/setup/sections/agenda-apply.ts tests/setup/changes.test.ts tests/setup/agenda-apply.test.ts
git commit -m "feat(setup): the Agenda plan - change-only writes, admin rows untouched, sessions placed by time (D450, D455, D456)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Hub rules (pure)

**Files:**
- Create: `src/features/setup/hub.ts`
- Create: `tests/setup/hub.test.ts`

**Interfaces:**
- Produces, all in `hub.ts`:
  - `SETUP_FILE_MAX_BYTES`, `MAX_FILES_PER_ITEM`, `NOTE_MAX`, `SETUP_FILE_ACCEPT`, `SETUP_FILE_TYPES`
  - `acceptSetupFile({ name, size }) → { ok: true; ext; contentType } | { ok: false; message }`
  - `contentTypeFor(path): string | null`
  - `cleanFileName(name)`
  - `setupFilePath(orgId, eventId, id, ext)`, `isSetupFilePath(path, orgId, eventId)`
  - `ItemStatus = "empty" | "new" | "handled"`
  - `itemStatus(item | null, fileCount)`
  - `ITEM_STATUS_ADMIN`, `ITEM_STATUS_ORGANISER`
  - `HubFile = { id; name; size_bytes; uploaded_at }`
  - `toHubFile(row)`, `formatBytes(n)`

- [ ] **Step 1: Write the failing tests**

`tests/setup/hub.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  acceptSetupFile, cleanFileName, contentTypeFor, formatBytes, isSetupFilePath, itemStatus, setupFilePath, toHubFile,
} from "@/features/setup/hub";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

describe("acceptSetupFile (D459)", () => {
  it("takes office files and photos, typed by their extension", () => {
    expect(acceptSetupFile({ name: "Rooms.XLSX", size: 10 })).toEqual({ ok: true, ext: "xlsx", contentType: XLSX });
    expect(acceptSetupFile({ name: "list.csv", size: 10 })).toMatchObject({ ok: true, contentType: "text/csv" });
    expect(acceptSetupFile({ name: "photo.jpeg", size: 10 })).toMatchObject({ ok: true, ext: "jpg", contentType: "image/jpeg" });
  });
  it("refuses other types, empty files and files over 25 MB", () => {
    expect(acceptSetupFile({ name: "plan.svg", size: 10 }).ok).toBe(false);
    expect(acceptSetupFile({ name: "noext", size: 10 }).ok).toBe(false);
    expect(acceptSetupFile({ name: "a.pdf", size: 0 })).toEqual({ ok: false, message: "That file is empty." });
    expect(acceptSetupFile({ name: "a.pdf", size: 25 * 1024 * 1024 + 1 })).toEqual({ ok: false, message: "Files must be 25 MB or smaller." });
  });
  it("reads the type back from a stored path", () => {
    expect(contentTypeFor("o/e/abc.xlsx")).toBe(XLSX);
    expect(contentTypeFor("o/e/abc.exe")).toBeNull();
  });
});

describe("cleanFileName", () => {
  it("keeps the file's own name, without folders or control characters", () => {
    expect(cleanFileName("C:\\fakepath\\Rooms.xlsx")).toBe("Rooms.xlsx");
    expect(cleanFileName('a\u0007"b.pdf')).toBe("ab.pdf");
    expect(cleanFileName("   ")).toBe("file");
  });
  it("keeps the end of a long name, so the extension survives", () => {
    const long = `${"x".repeat(300)}.pdf`;
    expect(cleanFileName(long)).toHaveLength(200);
    expect(cleanFileName(long).endsWith(".pdf")).toBe(true);
  });
});

describe("setup file paths", () => {
  const id = "0b9a2f1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
  it("are minted under the event's folder", () => {
    expect(setupFilePath("o", "e", id, "pdf")).toBe(`o/e/${id}.pdf`);
    expect(isSetupFilePath(`o/e/${id}.pdf`, "o", "e")).toBe(true);
  });
  it("refuses anything else", () => {
    expect(isSetupFilePath(`o/x/${id}.pdf`, "o", "e")).toBe(false);
    expect(isSetupFilePath("o/e/../secret.pdf", "o", "e")).toBe(false);
    expect(isSetupFilePath(`o/e/sub/${id}.pdf`, "o", "e")).toBe(false);
  });
});

describe("itemStatus (D458)", () => {
  const at = (s: string) => `2026-10-11T0${s}:00:00+00:00`;
  it("is empty with no files and no note", () => {
    expect(itemStatus(null, 0)).toBe("empty");
    expect(itemStatus({ notes: "  ", updated_at: at("1"), handled_at: null }, 0)).toBe("empty");
  });
  it("is new until the admin marks it handled, and again after any change", () => {
    expect(itemStatus({ notes: "Hi", updated_at: at("1"), handled_at: null }, 0)).toBe("new");
    expect(itemStatus(null, 2)).toBe("new");
    expect(itemStatus({ notes: "", updated_at: at("1"), handled_at: at("2") }, 1)).toBe("handled");
    expect(itemStatus({ notes: "", updated_at: at("3"), handled_at: at("2") }, 1)).toBe("new");
  });
});

describe("toHubFile and formatBytes", () => {
  it("shows the browser only what it needs, never the storage path", () => {
    expect(toHubFile({ id: "f", name: "a.pdf", size_bytes: 5, uploaded_at: "t", path: "o/e/x.pdf" } as never)).toEqual({ id: "f", name: "a.pdf", size_bytes: 5, uploaded_at: "t" });
  });
  it("prints sizes", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5.5 * 1024 * 1024)).toBe("5.5 MB");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/setup/hub.test.ts`
Expected: FAIL, with "Cannot find module".

- [ ] **Step 3: Write `hub.ts`**

```ts
/** Per file (D459). Uploads go straight to the bucket, so the 4.5 MB request cap doesn't apply. */
export const SETUP_FILE_MAX_BYTES = 25 * 1024 * 1024;
export const MAX_FILES_PER_ITEM = 20;
export const NOTE_MAX = 4000;

/**
 * What organisers may send (D459), by extension. The content type is ours to choose: browsers
 * report CSV as anything from text/csv to application/vnd.ms-excel to nothing at all. No SVG.
 */
const TYPES: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** The file picker's `accept`, from the same list the server checks. */
export const SETUP_FILE_ACCEPT = Object.keys(TYPES).map((e) => `.${e}`).join(",");
/** The bucket's allowed types; 0073 lists the same ones. */
export const SETUP_FILE_TYPES = [...new Set(Object.values(TYPES))];

const extOf = (name: string) => /\.([a-z0-9]+)$/i.exec(name.trim())?.[1]?.toLowerCase() ?? "";

/** The extension a file is stored under and its content type, or the sentence the organiser reads. */
export function acceptSetupFile(f: { name: string; size: number }): { ok: true; ext: string; contentType: string } | { ok: false; message: string } {
  const ext = extOf(f.name);
  const contentType = TYPES[ext];
  if (!contentType) return { ok: false, message: "Send Excel, CSV, Word, PDF, PowerPoint, text or image files (PNG, JPEG, WebP)." };
  if (!f.size) return { ok: false, message: "That file is empty." };
  if (f.size > SETUP_FILE_MAX_BYTES) return { ok: false, message: "Files must be 25 MB or smaller." };
  return { ok: true, ext: ext === "jpeg" ? "jpg" : ext, contentType };
}

/** The content type a stored path's extension stands for; null for one we never mint. */
export function contentTypeFor(path: string): string | null {
  return TYPES[extOf(path)] ?? null;
}

/** The name shown, and given to downloads: no folders, no control characters or quotes, at most 200 characters - the end kept, so the extension survives. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim();
  return clean ? clean.slice(-200) : "file";
}

/** Where one setup file lives: under its event's folder, named by a fresh id (D459). */
export function setupFilePath(orgId: string, eventId: string, id: string, ext: string): string {
  return `${orgId}/${eventId}/${id}.${ext}`;
}

/** Whether `path` is one `setupFilePath` could have minted for this event. Anything else is never recorded. */
export function isSetupFilePath(path: string, orgId: string, eventId: string): boolean {
  const prefix = `${orgId}/${eventId}/`;
  return path.startsWith(prefix) && /^[0-9a-f-]{36}\.[a-z0-9]{2,4}$/.test(path.slice(prefix.length));
}

export type ItemStatus = "empty" | "new" | "handled";

/**
 * Worked out, never stored (D458): nothing sent, something new since the admin last marked it
 * handled, or handled. Any file or note change bumps `updated_at`, which makes it new again.
 */
export function itemStatus(item: { notes: string; updated_at: string; handled_at: string | null } | null, fileCount: number): ItemStatus {
  if (fileCount === 0 && !item?.notes.trim()) return "empty";
  if (!item?.handled_at) return "new";
  return Date.parse(item.handled_at) >= Date.parse(item.updated_at) ? "handled" : "new";
}

export const ITEM_STATUS_ADMIN: Record<ItemStatus, string> = { empty: "Nothing sent", new: "New", handled: "Handled" };
export const ITEM_STATUS_ORGANISER: Record<ItemStatus, string> = { empty: "Not sent", new: "Sent", handled: "Received" };

/** A file as the browser sees it: no storage path. */
export type HubFile = { id: string; name: string; size_bytes: number; uploaded_at: string };

export function toHubFile(r: HubFile): HubFile {
  return { id: r.id, name: r.name, size_bytes: r.size_bytes, uploaded_at: r.uploaded_at };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
```

- [ ] **Step 4: Run, typecheck, lint, commit**

Run: `npx vitest run tests/setup/hub.test.ts && npx tsc --noEmit && npm run lint && npm test`
Expected: PASS.

```bash
git pull --rebase --autostash
git add src/features/setup/hub.ts tests/setup/hub.test.ts
git commit -m "feat(setup): the hub's rules - which files, where they live, and an item's status (D458, D459)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Database: tables, bucket, apply function, data layer, purge

**Files:**
- Create: `supabase/migrations/0073_setup_hub.sql`
- Modify: `src/lib/storage.ts`, `src/lib/db/media.ts`
- Modify: `src/features/setup/db.ts`
- Modify: `src/app/admin/events/[id]/actions.ts` (`purgeEventAction`), `src/app/admin/events/[id]/settings/page.tsx` (purge copy)
- Modify: `scripts/setup-db-check.mjs`

**Interfaces:**
- Consumes:
  - from Task 2: `BUILT_STEPS`
  - from Task 4: `AgendaLive`, `AgendaPlan`
  - from Task 5: `setupFilePath`, `isSetupFilePath`, `itemStatus`
- Produces in `db.ts`:
  - `SetupItemRow`, `SetupFileRow`
  - `eventChecklist(ev)`
  - `listSetupItems(eventId)`, `listSetupFiles(eventId)`, `getSetupFile(eventId, id)`
  - `touchSetupItem`, `saveSetupNote`, `markSetupItemHandled`
  - `startSetupUpload(orgId, eventId, ext) → { path, token }`
  - `recordSetupFile(ev, itemKey, path, name, contentType) → SetupFileRow | null`
  - `removeSetupFile(eventId, id) → SetupFileRow | null`
  - `setupFileUrl(file) → string | null`
  - `purgeSetupFiles(orgId, eventId)`
  - `liveAgenda(eventId)`
  - `applyAgendaPlan(eventId, reviewedAt, submitted, plan) → boolean`
  - `saveAnswers(…, seed?, appliedMap?)`
  - `waitingCounts`, which now also counts New items
- Produces in `src/lib`: `SETUP_BUCKET`, `sweepSetupFiles(orgId, eventId)`.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0073_setup_hub.sql`:

```sql
-- D458, D459: files and a note on every setup checklist item. D455: the agenda's Apply as one
-- function. Adds two tables, one bucket and one function; no existing row or policy changes.

-- D458: one row per event and checklist item, made with its first file or note. Status is worked
-- out from updated_at and handled_at (and the item's files), never stored.
create table public.event_setup_items (
  event_id   uuid not null references public.events (id) on delete cascade,
  item_key   text not null check (length(item_key) between 1 and 80),
  notes      text not null default '' check (length(notes) <= 4000),
  updated_at timestamptz not null default now(),
  handled_at timestamptz,
  primary key (event_id, item_key)
);
alter table public.event_setup_items enable row level security;

-- D459: one row per file an organiser sent. The object lives in the setup-files bucket at `path`.
create table public.event_setup_files (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  item_key     text not null check (length(item_key) between 1 and 80),
  path         text not null unique,
  name         text not null check (length(name) between 1 and 200),
  size_bytes   bigint not null check (size_bytes > 0),
  content_type text not null,
  uploaded_at  timestamptz not null default now()
);
create index event_setup_files_item_idx on public.event_setup_files (event_id, item_key, uploaded_at);
-- Read and written only by the server with the service role: no policies on purpose.
alter table public.event_setup_files enable row level security;

-- D459: private, like form-uploads (0027): attendee lists are personal data. Reads go through
-- one-minute signed links; writes through signed upload URLs the server mints.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'setup-files', 'setup-files', false,
  26214400, -- 25 MB, SETUP_FILE_MAX_BYTES in src/features/setup/hub.ts
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint',
    'text/plain', 'image/png', 'image/jpeg', 'image/webp'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- D451, D455: an organiser's agenda is applied in one transaction: its days and sessions, the
-- applied_map and the applied snapshot commit together or not at all. The plan is worked out in
-- the app (src/features/setup/sections/agenda-apply.ts); this only runs it. It writes only the
-- fields the Agenda step owns (D453) and every write is scoped to p_event.
create or replace function setup_apply_agenda(p_event uuid, p_plan jsonb, p_map jsonb, p_reviewed_at timestamptz, p_submitted jsonb)
returns boolean language plpgsql set search_path = public as $$
declare
  v_org uuid;
  r jsonb;
begin
  select org_id into v_org from events where id = p_event;
  if v_org is null then raise exception 'event % not found', p_event; end if;

  -- Deletes first, so a date they free can be used below. The plan deletes only a day nothing else is on.
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

  -- Sessions: only the fields a plan names are written, so an admin's edit to any other survives.
  for r in select * from jsonb_array_elements(coalesce(p_plan->'items'->'update', '[]')) loop
    update agenda_items set
      day_id      = case when r ? 'day_id'      then (r->>'day_id')::uuid else day_id end,
      starts_at   = case when r ? 'starts_at'   then (r->>'starts_at')::time else starts_at end,
      ends_at     = case when r ? 'ends_at'     then (r->>'ends_at')::time else ends_at end,
      title       = case when r ? 'title'       then r->>'title' else title end,
      description = case when r ? 'description' then r->>'description' else description end,
      location    = case when r ? 'location'    then r->>'location' else location end
    where id = (r->>'id')::uuid and event_id = p_event and kind = 'session' and slot is null;
  end loop;
  insert into agenda_items (id, org_id, event_id, day_id, kind, starts_at, ends_at, title, description, location, sort_order)
  select (i->>'id')::uuid, v_org, p_event, (i->>'day_id')::uuid, 'session', (i->>'starts_at')::time, (i->>'ends_at')::time,
    i->>'title', i->>'description', i->>'location', (i->>'sort_order')::int
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

revoke execute on function setup_apply_agenda(uuid, jsonb, jsonb, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function setup_apply_agenda(uuid, jsonb, jsonb, timestamptz, jsonb) to service_role;
```

- [ ] **Step 2: Apply it**

Apply with the Supabase MCP `apply_migration` tool: project `wfmqwwcolfigjylkgrsv`, name `setup_hub`, and the file contents as the query. Load the tool with ToolSearch: `select:mcp__0687aa52-4553-40db-b867-72024a86f547__apply_migration,mcp__0687aa52-4553-40db-b867-72024a86f547__get_advisors`.

Then run `get_advisors` with type `security`. Confirm none of the new tables or the function appears in a finding.

- [ ] **Step 3: The bucket in `src/lib`**

In `src/lib/storage.ts`, after `SUBMISSION_BUCKET`, add:

```ts
/**
 * What organisers send through the setup link (D459): attendee lists, agendas, plans. Private,
 * like SUBMISSION_BUCKET: an attendee list is personal data. Read through one-minute signed links.
 */
export const SETUP_BUCKET = "setup-files";
```

In `src/lib/db/media.ts`:

1. Import `SETUP_BUCKET`.
2. Change `deleteEventFiles`'s loop to `for (const bucket of [MEDIA_BUCKET, SUBMISSION_BUCKET, SETUP_BUCKET])`.
3. Change its doc comment's first sentence to: "Every file an event ever stored, in all three buckets: its images, its attendees' uploads, and what its organiser sent through the setup link."
4. Append:

```ts
/** Every file an event's organiser sent through the setup link (D459), for the personal-data purge. */
export async function sweepSetupFiles(orgId: string, eventId: string): Promise<void> {
  const paths = await listAllObjectPaths(SETUP_BUCKET, `${orgId}/${eventId}`);
  for (let i = 0; i < paths.length; i += LIST_PAGE) {
    const { error } = await serviceClient().storage.from(SETUP_BUCKET).remove(paths.slice(i, i + LIST_PAGE));
    if (error) throw error;
  }
}
```

- [ ] **Step 4: Extend `src/features/setup/db.ts`**

Add these imports:

```ts
import { SETUP_BUCKET } from "@/lib/storage";
import { sweepSetupFiles } from "@/lib/db/media";
import { selectAll } from "@/lib/db/select-all";
import { listAgenda, listAgendaDays } from "@/lib/db/agenda";
import { eventFeatures } from "@/features/catalogue";
import { BUILT_STEPS } from "./sections";
import { buildChecklist, type ChecklistEntry } from "./checklist";
import { isSetupFilePath, itemStatus, setupFilePath } from "./hub";
import type { AgendaLive, AgendaPlan } from "./sections/agenda-apply";
```

Change `saveAnswers` to take the map on the first insert. Add to its doc comment: "…and the map tying prefilled items to their rows (D454)."

```ts
export async function saveAnswers(
  eventId: string, section: SetupSection, expectedRev: number, answers: unknown, seed?: unknown, appliedMap?: Record<string, string>,
): Promise<number | null> {
  if (expectedRev === 0) {
    const { error } = await table().insert({ event_id: eventId, section, answers, seed, applied_map: appliedMap ?? {}, rev: 1 });
```

Leave the rest of the function as it is. Replace `waitingCounts` with:

```ts
/**
 * What's waiting for the admin, per event: the badge (D448, D458). Sections submitted and not
 * applied, plus checklist items with something new. A few queries for any number of events.
 */
export async function waitingCounts(eventIds: readonly string[]): Promise<Record<string, number>> {
  if (eventIds.length === 0) return {};
  const ids = eventIds as string[];
  const [sections, itemRows, fileRows] = await Promise.all([
    table().select("event_id, answers, submitted, applied").in("event_id", ids),
    selectAll<SetupItemRow>((from, to) => items().select("event_id, item_key, notes, updated_at, handled_at").in("event_id", ids).order("event_id").order("item_key").range(from, to)),
    selectAll<{ event_id: string; item_key: string }>((from, to) => files().select("event_id, item_key").in("event_id", ids).order("id").range(from, to)),
  ]);
  if (sections.error) throw sections.error;
  const out: Record<string, number> = {};
  const bump = (id: string) => { out[id] = (out[id] ?? 0) + 1; };
  for (const r of sections.data as { event_id: string; answers: unknown; submitted: unknown; applied: unknown }[]) {
    if (sectionStatus(r) === "submitted") bump(r.event_id);
  }
  const count = new Map<string, number>();
  for (const f of fileRows) count.set(`${f.event_id}\u0000${f.item_key}`, (count.get(`${f.event_id}\u0000${f.item_key}`) ?? 0) + 1);
  for (const i of itemRows) if (itemStatus(i, count.get(`${i.event_id}\u0000${i.item_key}`) ?? 0) === "new") bump(i.event_id);
  return out;
}
```

Append:

```ts
export type SetupItemRow = { event_id: string; item_key: string; notes: string; updated_at: string; handled_at: string | null };
export type SetupFileRow = { id: string; event_id: string; item_key: string; path: string; name: string; size_bytes: number; content_type: string; uploaded_at: string };

const items = () => serviceClient().from("event_setup_items");
const files = () => serviceClient().from("event_setup_files");
const UUID = /^[0-9a-f-]{36}$/i;

/** Everything this event needs from its organiser (D444): its features' items and its custom modules. */
export async function eventChecklist(ev: Event): Promise<ChecklistEntry[]> {
  const features = await eventFeatures(ev.id);
  return buildChecklist({
    features, custom: features.custom,
    selfRegistration: ev.registration_open || ev.registration_questions.length > 0, builtSteps: BUILT_STEPS,
  });
}

export async function listSetupItems(eventId: string): Promise<SetupItemRow[]> {
  const { data, error } = await items().select("event_id, item_key, notes, updated_at, handled_at").eq("event_id", eventId);
  if (error) throw error;
  return data as SetupItemRow[];
}

export async function listSetupFiles(eventId: string): Promise<SetupFileRow[]> {
  const { data, error } = await files().select("*").eq("event_id", eventId).order("uploaded_at");
  if (error) throw error;
  return data as SetupFileRow[];
}

/** One file, if it is this event's. An id that isn't a uuid is simply not found. */
export async function getSetupFile(eventId: string, id: string): Promise<SetupFileRow | null> {
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const { data, error } = await files().select("*").eq("event_id", eventId).eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as SetupFileRow | null) ?? null;
}

/** Marks the item changed (D458): New for the admin until they mark it handled. Made on first use; keeps the note. */
export async function touchSetupItem(eventId: string, itemKey: string): Promise<void> {
  const { error } = await items().upsert({ event_id: eventId, item_key: itemKey, updated_at: now() }, { onConflict: "event_id,item_key" });
  if (error) throw error;
}

/** The note as typed; the last save wins (D458). */
export async function saveSetupNote(eventId: string, itemKey: string, notes: string): Promise<void> {
  const { error } = await items().upsert({ event_id: eventId, item_key: itemKey, notes, updated_at: now() }, { onConflict: "event_id,item_key" });
  if (error) throw error;
}

export async function markSetupItemHandled(eventId: string, itemKey: string): Promise<void> {
  const { error } = await items().update({ handled_at: now() }).eq("event_id", eventId).eq("item_key", itemKey);
  if (error) throw error;
}

/** A signed upload for one new file (D459): the path is minted here, so the browser can write only this one object. */
export async function startSetupUpload(orgId: string, eventId: string, ext: string): Promise<{ path: string; token: string }> {
  const path = setupFilePath(orgId, eventId, crypto.randomUUID(), ext);
  const { data, error } = await serviceClient().storage.from(SETUP_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error("Could not start the upload. Try again.");
  return { path, token: data.token };
}

/**
 * Records a file once it is in the bucket (D459), and marks its item changed. Null when the path
 * isn't one minted for this event, nothing is there (the upload never finished), or it is
 * already recorded.
 */
export async function recordSetupFile(ev: Pick<Event, "id" | "org_id">, itemKey: string, path: string, name: string, contentType: string): Promise<SetupFileRow | null> {
  if (!isSetupFilePath(path, ev.org_id, ev.id)) return null;
  const cut = path.lastIndexOf("/");
  const { data: listed } = await serviceClient().storage.from(SETUP_BUCKET).list(path.slice(0, cut), { search: path.slice(cut + 1) });
  const object = listed?.find((o) => o.name === path.slice(cut + 1));
  if (!object) return null;
  const size = Number((object.metadata as { size?: number } | null)?.size ?? 0);
  const { data, error } = await files()
    .insert({ event_id: ev.id, item_key: itemKey, path, name, size_bytes: Math.max(size, 1), content_type: contentType })
    .select("*").single();
  if (error?.code === "23505") return null;
  if (error) throw error;
  await touchSetupItem(ev.id, itemKey);
  return data as SetupFileRow;
}

/** Removes one file: the object first, then the row, so no row ever names a missing object. */
export async function removeSetupFile(eventId: string, id: string): Promise<SetupFileRow | null> {
  const f = await getSetupFile(eventId, id);
  if (!f) return null;
  const { error } = await serviceClient().storage.from(SETUP_BUCKET).remove([f.path]);
  if (error) throw error;
  const { error: rowError } = await files().delete().eq("id", f.id).eq("event_id", eventId);
  if (rowError) throw rowError;
  await touchSetupItem(eventId, f.item_key);
  return f;
}

/** A one-minute download link carrying the file's own name (D459). */
export async function setupFileUrl(f: Pick<SetupFileRow, "path" | "name">): Promise<string | null> {
  const { data } = await serviceClient().storage.from(SETUP_BUCKET).createSignedUrl(f.path, 60, { download: f.name });
  return data?.signedUrl ?? null;
}

/** Purge (D459): every file the organiser sent, then their rows and every note. Files first, as the attendee purge does. */
export async function purgeSetupFiles(orgId: string, eventId: string): Promise<void> {
  await sweepSetupFiles(orgId, eventId);
  const { error } = await files().delete().eq("event_id", eventId);
  if (error) throw error;
  const { error: noteError } = await items().update({ notes: "", updated_at: now() }).eq("event_id", eventId);
  if (noteError) throw noteError;
}

/** The agenda as Apply and review compare against it. */
export async function liveAgenda(eventId: string): Promise<AgendaLive> {
  const [days, agendaItems] = await Promise.all([listAgendaDays(eventId), listAgenda(eventId)]);
  return { days, items: agendaItems };
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
```

If `selectAll`'s page callback type rejects the query builder, follow how `listAssignments` in `src/lib/db/breakouts.ts` calls it.

- [ ] **Step 5: The purge removes setup files and notes**

In `src/app/admin/events/[id]/actions.ts`, import `purgeSetupFiles` from `@/features/setup`. In `purgeEventAction`, call `await purgeSetupFiles(orgId, eventId);` immediately before `await purgeAttendeePersonalData(eventId, orgId);`.

In `src/app/admin/events/[id]/settings/page.tsx`, add one sentence to the Purge card's description, after "including any files attendees uploaded.":

> Files and notes the organiser sent through the setup link go too.

Export `purgeSetupFiles` from the feature's `index.ts`. It already re-exports `./db` (`export * from "./db"`), so it should be exported already; confirm.

- [ ] **Step 6: Extend the database check**

In `scripts/setup-db-check.mjs`:

1. Add points 6–9 to the header comment ("WHAT THIS PROVES"):
   - 6. `event_setup_items` and `event_setup_files` refuse bad rows: a long note, a second row for the same item, a repeated path.
   - 7. The `setup-files` bucket is private and capped at 25 MB.
   - 8. `setup_apply_agenda` writes a plan's days and sessions with the map and the applied snapshot. A stale reviewed version writes but isn't marked. A plan with a failing row writes nothing.
   - 9. The public key can't run the function.
2. Insert inside `try`, after check 4:

```js
  // 6. The hub's tables.
  const long = await db.from("event_setup_items").insert({ event_id: a.id, item_key: "info", notes: "x".repeat(4001) });
  check("a note over 4000 characters is refused", long.error?.code === "23514", long.error?.code);
  must(await db.from("event_setup_items").insert({ event_id: a.id, item_key: "info", notes: "hi" }));
  const again = await db.from("event_setup_items").insert({ event_id: a.id, item_key: "info" });
  check("a second row for the same item is refused", again.error?.code === "23505", again.error?.code);
  const filePath = `${org.id}/${a.id}/${randomUUID()}.pdf`;
  must(await db.from("event_setup_files").insert({ event_id: a.id, item_key: "info", path: filePath, name: "a.pdf", size_bytes: 1, content_type: "application/pdf" }));
  const dupPath = await db.from("event_setup_files").insert({ event_id: a.id, item_key: "info", path: filePath, name: "b.pdf", size_bytes: 1, content_type: "application/pdf" });
  check("two files can't share a path", dupPath.error?.code === "23505", dupPath.error?.code);

  // 7. The bucket.
  const bucket = must(await db.storage.getBucket("setup-files"));
  check("the setup-files bucket is private and capped at 25 MB", bucket.public === false && Number(bucket.file_size_limit) === 26214400);

  // 8. setup_apply_agenda.
  const T = "2026-10-10T00:00:00+00:00";
  must(await db.from("event_setup_sections").insert({ event_id: a.id, section: "agenda", answers: {}, submitted: { v: 1 }, submitted_at: T, rev: 1 }));
  const dayId = randomUUID();
  const itemId = randomUUID();
  const none = { insert: [], update: [], delete: [] };
  const firstPlan = {
    days: { ...none, insert: [{ id: dayId, date: "2027-01-10", name: "Day 1" }] },
    items: { ...none, insert: [{ id: itemId, day_id: dayId, starts_at: "09:00", ends_at: null, title: "Keynote", description: null, location: "Hall", sort_order: 10 }] },
    order: [],
  };
  const marked = must(await db.rpc("setup_apply_agenda", { p_event: a.id, p_plan: firstPlan, p_map: { d1: dayId, s1: itemId }, p_reviewed_at: T, p_submitted: { v: 1 } }));
  const rows = must(await db.from("agenda_items").select("id, day, location").eq("event_id", a.id));
  const sec = must(await db.from("event_setup_sections").select("applied, applied_map").eq("event_id", a.id).eq("section", "agenda").single());
  check("an agenda plan writes its days and sessions together", marked === true && rows.length === 1 && rows[0].day === "2027-01-10" && rows[0].location === "Hall");
  check("the agenda apply records the map and the applied snapshot", sec.applied_map.s1 === itemId && sec.applied?.v === 1);

  const retitle = { days: none, items: { ...none, update: [{ id: itemId, title: "Opening" }] }, order: [] };
  const stale = must(await db.rpc("setup_apply_agenda", { p_event: a.id, p_plan: retitle, p_map: { d1: dayId, s1: itemId }, p_reviewed_at: "2026-10-09T00:00:00+00:00", p_submitted: { v: 2 } }));
  const retitled = must(await db.from("agenda_items").select("title, location").eq("id", itemId).single());
  const after = must(await db.from("event_setup_sections").select("applied").eq("event_id", a.id).eq("section", "agenda").single());
  check("an update writes only the fields it names", retitled.title === "Opening" && retitled.location === "Hall");
  check("a stale reviewed version writes its rows but isn't marked applied", stale === false && after.applied?.v === 1);

  const broken = {
    days: none,
    items: { ...none, insert: [
      { id: randomUUID(), day_id: dayId, starts_at: "16:00", ends_at: null, title: "Should vanish", description: null, location: null, sort_order: 30 },
      { id: randomUUID(), day_id: randomUUID(), starts_at: "17:00", ends_at: null, title: "No such day", description: null, location: null, sort_order: 40 },
    ] },
    order: [],
  };
  const failed = await db.rpc("setup_apply_agenda", { p_event: a.id, p_plan: broken, p_map: {}, p_reviewed_at: T, p_submitted: { v: 3 } });
  const stillOne = must(await db.from("agenda_items").select("id").eq("event_id", a.id));
  check("a plan with a failing row writes nothing", !!failed.error && stillOne.length === 1, failed.error?.message);

  // 9. Service role only.
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (anonKey) {
    const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const refused = await anon.rpc("setup_apply_agenda", { p_event: a.id, p_plan: firstPlan, p_map: {}, p_reviewed_at: T, p_submitted: {} });
    check("the public key can't run the apply function", !!refused.error, refused.error?.code);
  }
```

3. In the `finally` block, after the cascade check, add: `check("deleting the event removes its items and files", …)`. It must select `event_setup_items` and `event_setup_files` for `a.id`, and pass when both come back empty.

- [ ] **Step 7: Run the check and everything else**

```bash
npm run check:setup
npx tsc --noEmit && npm run lint && npm test
```

Expected: every check line `PASS`, ending "All checks passed."; then all green.

- [ ] **Step 8: Commit**

```bash
git pull --rebase --autostash
git add supabase/migrations/0073_setup_hub.sql src/lib/storage.ts src/lib/db/media.ts src/features/setup/db.ts "src/app/admin/events/[id]/actions.ts" "src/app/admin/events/[id]/settings/page.tsx" scripts/setup-db-check.mjs
git commit -m "feat(setup): files and notes for every checklist item, a private bucket, and the agenda's one-transaction Apply (D455, D458, D459)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The organiser hub: every card takes files and a note

**Files:**
- Create: `src/features/setup/portal/load.ts`
- Modify: `src/features/setup/portal/actions.ts` (uses `loadByToken`)
- Create: `src/features/setup/portal/hub-actions.ts`
- Create: `src/features/setup/portal/SetupItemPanel.tsx`
- Modify: `src/features/setup/portal/SetupHomePage.tsx` (full replacement)

**Interfaces:**
- Consumes:
  - from Task 5: `acceptSetupFile`, `cleanFileName`, `contentTypeFor`, `MAX_FILES_PER_ITEM`, `NOTE_MAX`, `SETUP_FILE_ACCEPT`, `formatBytes`, `itemStatus`, `ITEM_STATUS_ORGANISER`, `toHubFile`, `HubFile`
  - from Task 6: `eventChecklist`, `listSetupItems`, `listSetupFiles`, `getSetupFile`, `recordSetupFile`, `removeSetupFile`, `saveSetupNote`, `setupFileUrl`, `startSetupUpload`
- Produces:
  - `loadByToken(token)`
  - `SetupItemPanel({ token, itemKey, initialFiles, initialNotes, notesPlaceholder? })`
  - these actions:
    - `startSetupUploadAction(token, itemKey, file)`
    - `finishSetupUploadAction(token, itemKey, path, name)`
    - `removeSetupFileAction(token, fileId)`
    - `setupFileLinkAction(token, fileId)`
    - `saveSetupNoteAction(token, itemKey, notes)`

- [ ] **Step 1: Share the token check**

`src/features/setup/portal/load.ts`:

```ts
import "server-only";
import type { Event } from "@/lib/types";
import { isValidToken } from "@/lib/tokens";
import { allow } from "@/lib/ratelimit";
import { getEventBySetupToken } from "../db";

export const GONE = "This setup link no longer works. Ask your project contact for a new one.";
const BUSY = "Too many saves at once — wait a moment and try again.";

export type Loaded = { ok: true; ev: Event } | { ok: false; message: string };

/**
 * The token is the only authority (D441): a server action is a public POST, so every call
 * re-checks the link and takes the event from it, never from the caller. A rate-limited call
 * says so, rather than claiming the link is dead.
 */
export async function loadByToken(token: string): Promise<Loaded> {
  if (typeof token !== "string" || !isValidToken(token)) return { ok: false, message: GONE };
  if (!allow(`setup:${token}`, 240, 60_000)) return { ok: false, message: BUSY };
  const ev = await getEventBySetupToken(token);
  return ev ? { ok: true, ev } : { ok: false, message: GONE };
}
```

In `portal/actions.ts`:

1. Delete the local `GONE`, `BUSY` and `load`, and the `isValidToken`, `allow`, `getEventBySetupToken` and `Event` imports they used.
2. Import `{ loadByToken }` from `./load`.
3. Replace each `await load(token)` with `await loadByToken(token)`.

Nothing else changes.

- [ ] **Step 2: The hub's actions**

`src/features/setup/portal/hub-actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import type { Event } from "@/lib/types";
import { eventChecklist, getSetupFile, listSetupFiles, recordSetupFile, removeSetupFile, saveSetupNote, setupFileUrl, startSetupUpload } from "../db";
import { acceptSetupFile, cleanFileName, contentTypeFor, MAX_FILES_PER_ITEM, NOTE_MAX, toHubFile, type HubFile } from "../hub";
import { loadByToken } from "./load";

type Fail = { ok: false; message: string };
const fail = (message: string): Fail => ({ ok: false, message });
const NO_ITEM = "That item isn't on this event's checklist.";

/** Cards and the Agenda step take files and a note (D458). The key must be on this event's checklist. */
async function itemOf(token: string, itemKey: unknown): Promise<{ ok: true; ev: Event; key: string } | Fail> {
  const loaded = await loadByToken(token);
  if (!loaded.ok) return fail(loaded.message);
  if (typeof itemKey !== "string") return fail(NO_ITEM);
  const entry = (await eventChecklist(loaded.ev)).find((e) => e.key === itemKey);
  if (!entry || (entry.kind === "step" && entry.key !== "agenda")) return fail(NO_ITEM);
  return { ok: true, ev: loaded.ev, key: itemKey };
}

/** The admin's badge reads these rows. */
const changed = (ev: Event) => revalidatePath(`/admin/events/${ev.id}`, "layout");

/** Step 1 of an upload (D459): checks the file, then mints its path and a signed upload for it. */
export async function startSetupUploadAction(token: string, itemKey: string, file: { name: string; size: number }): Promise<{ ok: true; path: string; uploadToken: string; contentType: string } | Fail> {
  const item = await itemOf(token, itemKey);
  if (!item.ok) return item;
  const accepted = acceptSetupFile({ name: typeof file?.name === "string" ? file.name : "", size: Number(file?.size) || 0 });
  if (!accepted.ok) return fail(accepted.message);
  const have = (await listSetupFiles(item.ev.id)).filter((f) => f.item_key === item.key).length;
  if (have >= MAX_FILES_PER_ITEM) return fail(`Up to ${MAX_FILES_PER_ITEM} files per item. Remove one first.`);
  try {
    const s = await startSetupUpload(item.ev.org_id, item.ev.id, accepted.ext);
    return { ok: true, path: s.path, uploadToken: s.token, contentType: accepted.contentType };
  } catch (e) {
    return fail((e as Error).message);
  }
}

/** Step 3 of an upload: records the file once the browser has put it in the bucket. */
export async function finishSetupUploadAction(token: string, itemKey: string, path: string, name: string): Promise<{ ok: true; file: HubFile } | Fail> {
  const item = await itemOf(token, itemKey);
  if (!item.ok) return item;
  const contentType = typeof path === "string" ? contentTypeFor(path) : null;
  const row = contentType ? await recordSetupFile(item.ev, item.key, path, cleanFileName(String(name ?? "")), contentType) : null;
  if (!row) return fail("We couldn't find that upload. Try again.");
  changed(item.ev);
  return { ok: true, file: toHubFile(row) };
}

export async function removeSetupFileAction(token: string, fileId: string): Promise<{ ok: true } | Fail> {
  const loaded = await loadByToken(token);
  if (!loaded.ok) return fail(loaded.message);
  if (!(await removeSetupFile(loaded.ev.id, fileId))) return fail("That file has already gone.");
  changed(loaded.ev);
  return { ok: true };
}

/** A one-minute link to download a file this event's organiser sent. */
export async function setupFileLinkAction(token: string, fileId: string): Promise<{ ok: true; url: string } | Fail> {
  const loaded = await loadByToken(token);
  if (!loaded.ok) return fail(loaded.message);
  const f = await getSetupFile(loaded.ev.id, fileId);
  const url = f ? await setupFileUrl(f) : null;
  return url ? { ok: true, url } : fail("That file has already gone.");
}

/** The note as typed, cut to its limit; the last save wins (D458). */
export async function saveSetupNoteAction(token: string, itemKey: string, notes: string): Promise<{ ok: true } | Fail> {
  const item = await itemOf(token, itemKey);
  if (!item.ok) return item;
  await saveSetupNote(item.ev.id, item.key, String(notes ?? "").slice(0, NOTE_MAX));
  changed(item.ev);
  return { ok: true };
}
```

- [ ] **Step 3: The panel**

`src/features/setup/portal/SetupItemPanel.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SETUP_BUCKET } from "@/lib/storage";
import { browserStorage } from "@/lib/supabase/browser";
import { acceptSetupFile, formatBytes, MAX_FILES_PER_ITEM, NOTE_MAX, SETUP_FILE_ACCEPT, type HubFile } from "../hub";
import { finishSetupUploadAction, removeSetupFileAction, saveSetupNoteAction, setupFileLinkAction, startSetupUploadAction } from "./hub-actions";

const NOTE_SAVE_MS = 1000;
const UPLOAD_FAILED = "couldn't upload — check your connection and try again.";
const NOTE_FAILED = "Couldn't save your note — check your connection. Change it to try again.";

/**
 * One checklist item's files and note (D458). Each file goes straight to the private bucket on a
 * path the server minted, then is recorded (D459), so its size isn't capped by the 4.5 MB request
 * limit. The note saves a second after the last keystroke; the browser asks before leaving with
 * one unsaved.
 */
export function SetupItemPanel({ token, itemKey, initialFiles, initialNotes, notesPlaceholder = "Anything we should know about this" }: {
  token: string;
  itemKey: string;
  initialFiles: HubFile[];
  initialNotes: string;
  notesPlaceholder?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState(initialFiles);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notes, setNotes] = useState(initialNotes);
  const [noteState, setNoteState] = useState<"idle" | "saving" | "saved">("idle");
  const savedNote = useRef(initialNotes);

  useEffect(() => {
    if (notes === savedNote.current) return;
    const t = setTimeout(async () => {
      setNoteState("saving");
      try {
        const r = await saveSetupNoteAction(token, itemKey, notes);
        if (!r.ok) throw new Error(r.message);
        savedNote.current = notes;
        setNoteState("saved");
        router.refresh();
      } catch {
        setNoteState("idle");
        setErrors([NOTE_FAILED]);
      }
    }, NOTE_SAVE_MS);
    return () => clearTimeout(t);
  }, [notes, token, itemKey, router]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (notes === savedNote.current && busy === null) return;
      e.preventDefault();
      e.returnValue = true;
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [notes, busy]);

  const upload = async (picked: File[]) => {
    if (picked.length === 0) return;
    const problems: string[] = [];
    if (files.length + picked.length > MAX_FILES_PER_ITEM) {
      setErrors([`Up to ${MAX_FILES_PER_ITEM} files per item. Remove some first.`]);
      return;
    }
    for (const [n, file] of picked.entries()) {
      const ok = acceptSetupFile(file);
      if (!ok.ok) { problems.push(`${file.name}: ${ok.message}`); continue; }
      setBusy(picked.length > 1 ? `Uploading ${n + 1} of ${picked.length}…` : "Uploading…");
      try {
        const start = await startSetupUploadAction(token, itemKey, { name: file.name, size: file.size });
        if (!start.ok) { problems.push(`${file.name}: ${start.message}`); continue; }
        const { error } = await browserStorage().storage.from(SETUP_BUCKET).uploadToSignedUrl(start.path, start.uploadToken, file, { contentType: start.contentType });
        if (error) { problems.push(`${file.name}: ${UPLOAD_FAILED}`); continue; }
        const done = await finishSetupUploadAction(token, itemKey, start.path, file.name);
        if (!done.ok) { problems.push(`${file.name}: ${done.message}`); continue; }
        setFiles((p) => [...p, done.file]);
      } catch {
        problems.push(`${file.name}: ${UPLOAD_FAILED}`);
      }
    }
    setBusy(null);
    setErrors(problems);
    router.refresh();
  };

  // A download link carries the file's name, so the browser saves it and the page stays.
  const open = async (f: HubFile) => {
    const r = await setupFileLinkAction(token, f.id).catch(() => null);
    if (r?.ok) window.location.assign(r.url);
    else setErrors([r?.message ?? "Couldn't open that file — check your connection."]);
  };

  const remove = async (f: HubFile) => {
    if (!window.confirm(`Remove ${f.name}?`)) return;
    const r = await removeSetupFileAction(token, f.id).catch(() => null);
    if (r?.ok) { setFiles((p) => p.filter((x) => x.id !== f.id)); router.refresh(); }
    else setErrors([r?.message ?? "Couldn't remove that file — check your connection."]);
  };

  return (
    <div className="flex flex-col gap-3">
      {files.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <button type="button" className="min-w-0 flex-1 truncate text-left font-semibold hover:underline" onClick={() => open(f)}>{f.name}</button>
              <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(f.size_bytes)}</span>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${f.name}`} onClick={() => remove(f)}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => input.current?.click()}>
          <Upload />{busy ?? "Upload files"}
        </Button>
        <span className="text-xs text-muted-foreground">Excel, CSV, Word, PDF, PowerPoint or images, up to 25 MB each.</span>
        <input ref={input} type="file" multiple accept={SETUP_FILE_ACCEPT} className="sr-only" tabIndex={-1}
          onChange={(e) => { const picked = [...(e.target.files ?? [])]; e.target.value = ""; void upload(picked); }} />
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="flex items-center text-sm font-bold">
          Note
          <span className="ml-auto text-xs font-normal text-muted-foreground" aria-live="polite">{noteState === "saving" ? "Saving…" : noteState === "saved" ? "Saved" : ""}</span>
        </span>
        <Textarea rows={3} maxLength={NOTE_MAX} value={notes} placeholder={notesPlaceholder} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {errors.map((m) => <p key={m} role="alert" className="text-xs font-semibold text-destructive">{m}</p>)}
    </div>
  );
}
```

- [ ] **Step 4: The home page**

Replace `src/features/setup/portal/SetupHomePage.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { isValidToken } from "@/lib/tokens";
import { brandStyle } from "@/lib/brand";
import { formatDateRange } from "@/lib/text";
import { Badge } from "@/components/ui/badge";
import { Mark } from "@/components/portal/PortalHeader";
import { eventChecklist, getEventBySetupToken, listSetupFiles, listSetupItems, listSetupRows } from "../db";
import { hasUnsubmittedChanges, sectionStatus, STATUS_LABELS, type SectionStatus } from "../status";
import { ITEM_STATUS_ORGANISER, itemStatus, toHubFile, type ItemStatus } from "../hub";
import { basicsFromEvent, sanitizeBasics } from "../sections/basics";
import { HomePreview } from "../preview/HomePreview";
import { SetupItemPanel } from "./SetupItemPanel";

const STATUS_VARIANT: Record<SectionStatus, "secondary" | "warning" | "success"> = {
  not_started: "secondary", draft: "secondary", submitted: "warning", applied: "success",
};
const ITEM_VARIANT: Record<ItemStatus, "secondary" | "outline" | "success"> = { empty: "secondary", new: "outline", handled: "success" };

/**
 * The organiser's one place (D444, D458): everything the event needs. Steps open a form; every
 * other item takes files and a note right here. A small preview shows the portal as submitted so far.
 */
export async function SetupHomePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isValidToken(token)) notFound();
  const ev = await getEventBySetupToken(token);
  if (!ev) notFound();
  const [rows, list, items, files] = await Promise.all([listSetupRows(ev.id), eventChecklist(ev), listSetupItems(ev.id), listSetupFiles(ev.id)]);
  const rowOf = (key: string) => rows.find((r) => r.section === key) ?? null;
  const itemOf = (key: string) => items.find((i) => i.item_key === key) ?? null;
  const filesOf = (key: string) => files.filter((f) => f.item_key === key);
  const hub = (key: string) => itemStatus(itemOf(key), filesOf(key).length);
  const sent = list.filter((e) => hub(e.key) !== "empty" || (e.kind === "step" && ["submitted", "applied"].includes(sectionStatus(rowOf(e.key))))).length;
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
        <p className="text-sm">Everything we need from you for this event, in one place. Fill in the first steps here, and send the rest as files or a note on each item. Nothing goes to attendees until we&apos;ve reviewed it.</p>
        <p className="text-sm font-bold">{sent} of {list.length} item{list.length === 1 ? "" : "s"} sent</p>

        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
          {list.map((e) => {
            if (e.kind === "step") {
              const row = rowOf(e.key);
              const s = sectionStatus(row);
              return (
                <li key={e.key}>
                  <Link href={`/setup/${token}/${e.key}`} className="flex items-center gap-3 p-4 hover:bg-muted/50">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-bold">{e.title}</span>
                      <span className="text-xs text-muted-foreground">{e.send.join(" · ")}</span>
                    </span>
                    {filesOf(e.key).length > 0 && <span className="text-xs font-semibold text-muted-foreground">Files sent</span>}
                    {s === "applied" && hasUnsubmittedChanges(row) && <span className="text-xs font-semibold text-amber-700">Changes not submitted</span>}
                    <Badge variant={STATUS_VARIANT[s]}>{STATUS_LABELS[s]}</Badge>
                  </Link>
                </li>
              );
            }
            const status = hub(e.key);
            return (
              <li key={e.key}>
                <details className="group p-4">
                  <summary className="flex cursor-pointer list-none items-center gap-3">
                    <span className="min-w-0 flex-1 font-bold">{e.title}</span>
                    <Badge variant={ITEM_VARIANT[status]}>{ITEM_STATUS_ORGANISER[status]}</Badge>
                  </summary>
                  <div className="mt-3 flex flex-col gap-3">
                    <ul className="list-disc pl-5 text-sm">
                      {e.send.map((line) => <li key={line}>{line}</li>)}
                    </ul>
                    <SetupItemPanel token={token} itemKey={e.key} initialFiles={filesOf(e.key).map(toHubFile)} initialNotes={itemOf(e.key)?.notes ?? ""} />
                  </div>
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

- [ ] **Step 5: Typecheck, lint, test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 6: Try it on `ecpkom`**

Run `npm run dev` and open `ecpkom`'s setup link (Admin → ecpkom → Setup → Open as organiser). Check each of these:

1. Each card opens to show what to send, an upload button and a note box. The Info, Announcements and Breakout rooms cards are there.
2. Upload a small Excel file and a PDF over 5 MB to Breakout rooms. Both list with their sizes, and the card's badge reads Sent.
3. Click a file name. It downloads under its own name.
4. Type a note; "Saved" appears. Reload; the note is still there.
5. Remove one file; it goes. Upload an `.svg`; it's refused with the type sentence.
6. Use `execute_sql` to confirm `event_setup_files` rows exist for `ecpkom`, with paths under `<org>/<event>/`.

Leave the files in place; Task 10 uses them.

- [ ] **Step 7: Commit**

```bash
git pull --rebase --autostash
git add src/features/setup/portal/load.ts src/features/setup/portal/actions.ts src/features/setup/portal/hub-actions.ts src/features/setup/portal/SetupItemPanel.tsx src/features/setup/portal/SetupHomePage.tsx
git commit -m "feat(setup): every checklist card takes files and a note, uploaded straight to a private bucket (D458, D459)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The agenda preview

**Files:**
- Modify: `src/components/portal/AgendaList.tsx` (two attributes)
- Create: `src/features/setup/preview/AgendaPreview.tsx`
- Modify: `src/features/setup/client.ts`

**Interfaces:**
- Consumes: `previewAgenda`, `AgendaAnswers` (Task 3); `PhoneFrame` (Task 1).
- Produces:
  - `AgendaSlot = \`day:${string}\` | \`session:${string}\``
  - `AgendaPreview({ agenda, primaryColor, focused?, onSlot?, compact? })`

- [ ] **Step 1: Let the portal's agenda rows be found by id**

In `src/components/portal/AgendaList.tsx`:

- Add `data-item-id={i.id}` to the session row's outer `<div key={i.id} …>`.
- Add `data-item-id={item.id}` to `ImageRow`'s `<figure>`.

Nothing in the portal reads them. The setup preview uses them to outline and pick the row being edited.

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

  // Setup ids hold no quotes or backslashes (the ID rule in sections/agenda.ts), so they are safe in a quoted selector.
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

- [ ] **Step 3: The client entry**

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
export * from "./hub";
export * from "./sections/basics";
export * from "./sections/agenda";
export * from "./sections/agenda-apply";
export * from "./sections/changes";
export { HomePreview, type PreviewBasics, type PreviewSlot } from "./preview/HomePreview";
export { AgendaPreview, type AgendaSlot } from "./preview/AgendaPreview";
```

If `tsc` reports two modules exporting the same name, rename the one in the newer module.

- [ ] **Step 4: Typecheck, lint, test, build**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all pass.

The build matters: `AgendaList` now renders inside a client component. If a server-only import reaches the browser, the error names it. Split the drawing part into a client-safe component, as D418 split the activity screens, and record the split in the commit message.

- [ ] **Step 5: Commit**

```bash
git pull --rebase --autostash
git add src/components/portal/AgendaList.tsx src/features/setup/preview/AgendaPreview.tsx src/features/setup/client.ts
git commit -m "feat(setup): the agenda preview, drawn with the portal's own AgendaList, the edited row outlined (D445)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The Agenda step

**Files:**
- Modify: `src/features/setup/portal/useSectionAutosave.ts` (adds `seedIds`)
- Modify: `src/features/setup/portal/actions.ts` (full replacement below)
- Modify: `src/features/setup/portal/SetupStepPage.tsx` (full replacement below)
- Create: `src/features/setup/portal/AgendaStep.tsx`
- Modify: `src/features/setup/sections.ts` (`BUILT_STEPS = SETUP_SECTIONS`)

**Interfaces:**
- Consumes:
  - from Task 3: `agendaFromLive`, `restrictSeed`, `sanitizeAgenda`, `agendaProblems`, `agendaErrors`, `agendaRange`, `seedIdsOf`, `blankSession`, `dayName`, `errorKey`
  - from Task 6: `liveAgenda`, `saveAnswers(…, seed, map)`, `listSetupFiles`, `listSetupItems`
  - from Task 7: `loadByToken`, `SetupItemPanel`
  - from Task 8: `AgendaPreview`
- Produces: `saveSectionAction(token, section, expectedRev, raw, seedIds?)`.

- [ ] **Step 1: The hook carries `seedIds`**

In `useSectionAutosave.ts`:

1. Add the option to the parameter type, with this comment:

```ts
  /**
   * The ids the form started from (Agenda). The first save sends them, and the server seeds the
   * organiser's starting point and the map from just these (D454).
   */
  seedIds?: readonly string[];
```

2. Destructure it, and keep it stable with `const seeds = useRef(seedIds);`.
3. Change the save call to `saveSectionAction(token, section, rev.current, sending, seeds.current)`.

- [ ] **Step 2: Replace `portal/actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import type { Event } from "@/lib/types";
import { deleteEventImage, uploadEventImage } from "@/lib/db/media";
import { getSetupRow, liveAgenda, saveAnswers, submitAnswers, type SetupRow } from "../db";
import { isBuiltStep, problemSentence, type SetupSection } from "../sections";
import { BASICS_IMAGE_FIELDS, basicsComplete, basicsFromEvent, basicsMissing, BASICS_LABELS, sanitizeBasics } from "../sections/basics";
import { agendaFromLive, agendaProblems, agendaRange, restrictSeed, sanitizeAgenda } from "../sections/agenda";
import { imagesToDeleteOnSave, ownImageAnswers } from "../images";
import { loadByToken } from "./load";

export type SetupResult = { ok: true; rev: number } | { ok: false; message: string; stale?: boolean };

const RELOAD = "Reload the page and try again.";
const STALE: SetupResult = { ok: false, message: "Someone else updated this section — reload to see their changes.", stale: true };
const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });
const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const isIdList = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 1000 && v.every((x) => typeof x === "string");

export async function saveSectionAction(token: string, section: string, expectedRev: number, raw: unknown, seedIds?: unknown): Promise<SetupResult> {
  const loaded = await loadByToken(token);
  if (!loaded.ok) return fail(loaded.message);
  if (!isBuiltStep(section)) return fail("That section can't be filled in here yet.");
  if (!Number.isInteger(expectedRev) || expectedRev < 0) return STALE;
  const s: SetupSection = section;
  switch (s) {
    case "basics": return saveBasics(loaded.ev, expectedRev, raw);
    case "agenda": return saveAgenda(loaded.ev, expectedRev, raw, seedIds);
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

/** The first save (rev 0) seeds the starting point and the map from the live agenda, limited to the ids the form showed (D454). */
async function saveAgenda(ev: Event, expectedRev: number, raw: unknown, seedIds: unknown): Promise<SetupResult> {
  let seed: ReturnType<typeof restrictSeed> | null = null;
  if (expectedRev === 0) {
    if (!isIdList(seedIds)) return fail(RELOAD);
    const live = await liveAgenda(ev.id);
    seed = restrictSeed(agendaFromLive(live.days, live.items), seedIds);
  }
  const rev = await saveAnswers(ev.id, "agenda", expectedRev, sanitizeAgenda(raw), seed?.answers, seed?.map);
  return rev === null ? STALE : { ok: true, rev };
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
    default: { const never: never = section; return never; }
  }
}

export async function submitSectionAction(token: string, section: string, expectedRev: number): Promise<SetupResult> {
  const loaded = await loadByToken(token);
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

/** Basics' logo and banner. One image per call: Vercel refuses request bodies over 4.5 MB (storage.ts). */
export async function uploadSetupImageAction(token: string, kind: string, fd: FormData): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const loaded = await loadByToken(token);
  if (!loaded.ok) return fail(loaded.message);
  const { ev } = loaded;
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

The `never`-default switches are the repo's idiom (D404): adding a section fails the build until every switch handles it.

- [ ] **Step 3: Replace `SetupStepPage.tsx`**

```tsx
import { notFound } from "next/navigation";
import { isValidToken } from "@/lib/tokens";
import { brandStyle } from "@/lib/brand";
import { getEventBySetupToken, getSetupRow, listSetupFiles, listSetupItems, liveAgenda } from "../db";
import { isBuiltStep, type SetupSection } from "../sections";
import { basicsFromEvent, sanitizeBasics } from "../sections/basics";
import { agendaFromLive, agendaRange, sanitizeAgenda } from "../sections/agenda";
import { toHubFile } from "../hub";
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
      const [basicsRow, live, items, files] = await Promise.all([
        getSetupRow(ev.id, "basics"), row ? null : liveAgenda(ev.id), listSetupItems(ev.id), listSetupFiles(ev.id),
      ]);
      const basics = basicsRow ? sanitizeBasics(basicsRow.answers) : null;
      const initial = row ? sanitizeAgenda(row.answers) : agendaFromLive(live!.days, live!.items).answers;
      step = (
        <AgendaStep {...common} initial={initial} range={agendaRange(basics, ev)} primaryColor={basics?.primary_color || ev.primary_color}
          files={files.filter((f) => f.item_key === "agenda").map(toHubFile)} notes={items.find((i) => i.item_key === "agenda")?.notes ?? ""} />
      );
      break;
    }
    default: { const never: never = s; return never; }
  }
  return (
    <main className="mx-auto w-full max-w-6xl p-4 md:p-8" style={brandStyle(ev.primary_color) as React.CSSProperties}>
      {step}
    </main>
  );
}
```

- [ ] **Step 4: Write `AgendaStep.tsx`**

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
import type { HubFile } from "../hub";
import type { SectionStatus } from "../status";
import { AgendaPreview, type AgendaSlot } from "../preview/AgendaPreview";
import { SetupItemPanel } from "./SetupItemPanel";
import { StepFrame, StepGroup } from "./StepFrame";
import { useSectionAutosave } from "./useSectionAutosave";

const focusField = (slot: string) =>
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-setup-field="${slot}"]`)?.focus());

/**
 * The agenda (D446, D453): upload the one they already have, or type it in - one card per day,
 * its sessions under it, each with time and title up front and the rest behind More. The preview
 * shows the day being edited, the session being edited outlined (D445).
 */
export function AgendaStep({ token, initial, initialRev, initialStatus, initialUnsubmitted, range, primaryColor, files, notes }: {
  token: string;
  initial: AgendaAnswers;
  initialRev: number;
  initialStatus: SectionStatus;
  initialUnsubmitted: boolean;
  range: DateRange;
  primaryColor: string;
  files: HubFile[];
  notes: string;
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

  return (
    <StepFrame token={token} title="Agenda" step={step} complete={problems.length === 0} incompleteHint={problemSentence(problems) ?? undefined}
      preview={<AgendaPreview agenda={a} primaryColor={primaryColor} focused={focused} onSlot={jump} />}>
      <StepGroup title="Already have your agenda?" help="Upload it in Excel, Word or PDF and we'll set it up for you. Then you don't need to fill in the days below.">
        <SetupItemPanel token={token} itemKey="agenda" initialFiles={files} initialNotes={notes} notesPlaceholder="Anything we should know about the agenda" />
      </StepGroup>

      <p className="text-sm text-muted-foreground">
        Or type it in: one tab per day in the portal{range.first ? `, within your event dates (${formatDateRange(range.first, range.last)})` : ""}.
        Times are Malaysia time. Attendees see each day in time order. Breakout rounds, photos and who each session is for: send them as files and we&apos;ll add them.
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
              <SessionRow key={s.id} s={s} error={(f) => err(s.id, f)}
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

/** One session: time and title up front; location and description behind More. */
function SessionRow({ s, error, expanded, onExpand, onEdit, onRemove, onFocus }: {
  s: SetupSession;
  error: (field: SessionField) => string | undefined;
  expanded: boolean;
  onExpand: () => void;
  onEdit: (patch: Partial<SetupSession>) => void;
  onRemove: () => void;
  onFocus: () => void;
}) {
  const bind = (f: SessionField) => ({
    value: s[f],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onEdit({ [f]: e.target.value }),
    "aria-invalid": error(f) ? true : undefined,
  });
  const label = "flex flex-col gap-1.5 text-sm font-bold";

  return (
    // stopPropagation: the day's card also listens for focus, and the innermost spot wins.
    <li className="flex flex-col gap-3 rounded-lg border border-border p-3" onFocus={(e) => { e.stopPropagation(); onFocus(); }}>
      <div className="flex flex-wrap items-start gap-2">
        <Input type="time" aria-label="Starts" className="w-28" {...bind("starts_at")} />
        <Input type="time" aria-label="Ends (optional)" className="w-28" {...bind("ends_at")} />
        <Input aria-label="Title" placeholder="Session title" className="min-w-0 flex-1" data-setup-field={`session:${s.id}`} {...bind("title")} />
        <Button type="button" variant="ghost" size="sm" aria-expanded={expanded} onClick={onExpand}>{expanded ? "Less" : "More"}</Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Remove session" onClick={onRemove}><Trash2 /></Button>
      </div>
      {(["starts_at", "ends_at"] as const).map((f) => error(f) && <span key={f} className="text-xs font-semibold text-destructive">{error(f)}</span>)}
      {expanded && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>Location<Input placeholder="Grand Ballroom" {...bind("location")} /></label>
          <label className={`${label} sm:col-span-2`}>Description<Textarea rows={2} {...bind("description")} /></label>
        </div>
      )}
    </li>
  );
}
```

- [ ] **Step 5: Turn the Agenda step on**

In `sections.ts`: `export const BUILT_STEPS: readonly SetupSection[] = SETUP_SECTIONS;`. Update its comment to:

```ts
/** The steps organisers can fill in: both since Phase 2. A future section is a card until built (D452). */
```

- [ ] **Step 6: Typecheck, lint, test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: PASS.

`tests/setup/checklist.test.ts` passes its own `builtSteps`, so it is unaffected.

- [ ] **Step 7: Try it on `ecpkom`**

1. The checklist shows Agenda as a step.
2. Agenda opens prefilled with `ecpkom`'s sessions, without its breakout rounds or image rows. The preview shows the first day.
3. Upload a file in "Already have your agenda?". It lists, and the checklist row shows "Files sent".
4. Add a session, type a time and a title. "Saved" appears, and the preview shows the row in time order, outlined while you type.
5. Click a row in the preview. Its title field takes focus.
6. Set a day outside the event dates. It shows the red error, and Submit is disabled with the first problem as the hint.
7. Use `execute_sql`: `select seed is not null, applied_map from event_setup_sections where section = 'agenda' and event_id = '4e64a90c-728c-4a08-af62-8c8046afa0c9'`. The map must hold the prefilled ids.

Leave the draft in place for Task 10.

- [ ] **Step 8: Commit**

```bash
git pull --rebase --autostash
git add src/features/setup/portal/useSectionAutosave.ts src/features/setup/portal/actions.ts src/features/setup/portal/SetupStepPage.tsx src/features/setup/portal/AgendaStep.tsx src/features/setup/sections.ts
git commit -m "feat(setup): the Agenda step - upload the agenda or type days and sessions, with the live agenda preview (D446, D453, D454, D457)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Admin: one checklist table, downloads, Mark handled, and the Agenda's review and Apply

**Files:**
- Modify: `src/features/setup/sections/basics.ts` (`basicsProblems`), `tests/setup/basics.test.ts`
- Create: `src/features/setup/admin/plans.ts`
- Create: `src/features/setup/admin/PlanChanges.tsx`, `src/features/setup/admin/BasicsChanges.tsx`
- Modify: `src/features/setup/admin/SetupReviewPage.tsx` (full replacement)
- Modify: `src/features/setup/admin/actions.ts`
- Modify: `src/features/setup/admin/SetupAdminPage.tsx` (full replacement)
- Create: `src/app/admin/events/[id]/setup/files/[fileId]/route.ts`

**Interfaces:**
- Consumes:
  - `planAgenda`, `agendaBaseline` (Task 4)
  - `liveAgenda`, `applyAgendaPlan`, `eventChecklist`, `listSetupItems`, `listSetupFiles`, `getSetupFile`, `setupFileUrl`, `markSetupItemHandled` (Task 6)
  - `itemStatus`, `ITEM_STATUS_ADMIN`, `formatBytes` (Task 5)
  - `AgendaPreview` (Task 8)
  - `SECTION_TITLES` (Task 2)
- Produces:
  - `basicsProblems(a)`
  - `agendaReview(ev, row, newId)`, `previewIds()`
  - `markItemHandledAction(eventId, itemKey)`
  - the route `/admin/events/<id>/setup/files/<fileId>`

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
/** Why this Basics version can't be applied, one line per field. The review lists them; Apply refuses on them. */
export function basicsProblems(a: BasicsAnswers): string[] {
  return [
    ...basicsMissing(a).map((f) => `${BASICS_LABELS[f]} is empty`),
    ...Object.entries(basicsErrors(a)).map(([f, m]) => `${BASICS_LABELS[f as BasicsField]}: ${m}`),
  ];
}
```

Run the test again. Expected: PASS.

- [ ] **Step 2: One place that builds the agenda plan**

`src/features/setup/admin/plans.ts`:

```ts
import "server-only";
import type { Event } from "@/lib/types";
import { liveAgenda, type SetupRow } from "../db";
import { agendaErrors, agendaProblems, sanitizeAgenda, type AgendaAnswers } from "../sections/agenda";
import { agendaBaseline, planAgenda, type AgendaPlan } from "../sections/agenda-apply";

const DATES_HINT = "If the organiser changed the event dates, apply Event basics first.";

/** A counter for the review's plan: its new rows are never written, so their ids only need to be distinct. */
export function previewIds(): () => string {
  let n = 0;
  return () => `preview-${++n}`;
}

/**
 * The agenda plan and every reason to refuse it. The review shows exactly this and Apply runs
 * exactly this (D449). Days are checked against the live event (D457).
 */
export async function agendaReview(ev: Event, row: SetupRow, newId: () => string): Promise<{ submitted: AgendaAnswers; plan: AgendaPlan; problems: string[] }> {
  const submitted = sanitizeAgenda(row.submitted);
  const plan = planAgenda({ submitted, baseline: agendaBaseline(row), map: row.applied_map ?? {}, live: await liveAgenda(ev.id), newId });
  const range = { first: ev.starts_on, last: ev.ends_on };
  const outside = Object.values(agendaErrors(submitted, range)).some((m) => m.startsWith("Outside the event dates"));
  return { submitted, plan, problems: [...agendaProblems(submitted, range), ...(outside ? [DATES_HINT] : []), ...plan.problems] };
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

/** What Apply would do, one line per day or session, under a one-line summary (D449). */
export function PlanChanges({ changes, empty }: { changes: PlanChange[]; empty: string }) {
  if (changes.length === 0) return <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground">{empty}</p>;
  return (
    <>
      <p className="border-t border-border px-4 py-3 text-sm font-bold">{changeSummary(changes) || "Nothing to write. See the notes below."}</p>
      <ul className="divide-y divide-border border-t border-border">
        {changes.map((c, i) => (
          <li key={i} className="flex flex-col gap-1 px-4 py-3">
            <span className="flex flex-wrap items-center gap-2 text-sm font-bold">
              <Badge variant={HOW[c.how].variant}>{HOW[c.how].label}</Badge>
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.what}</span>
              {c.label}
            </span>
            {c.lines.map((line) => <span key={line} className="text-sm text-muted-foreground">{line}</span>)}
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
import { agendaReview, previewIds } from "./plans";
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
        description: `${ONLY_CHANGES} New and retimed sessions go in by time; everything else keeps its order. Breakout rounds, image rows, photos and audiences are never touched.`,
        body: <PlanChanges changes={r.plan.changes} empty={row.applied ? "Nothing new since the last Apply." : "Matches the live agenda."} />,
        preview: <AgendaPreview agenda={r.submitted} primaryColor={ev.primary_color} compact />,
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

- [ ] **Step 5: Apply for both sections, and Mark handled**

In `src/features/setup/admin/actions.ts`:

1. Merge in these imports: `applyAgendaPlan`, `eventChecklist`, `markSetupItemHandled` and `type SetupRow` from `../db`; `agendaReview` from `./plans`; `changeSummary` from `../sections/changes`; `basicsProblems` from `../sections/basics`; `SECTION_TITLES` and `type SetupSection` from `../sections`; and `type Event` from `@/lib/types`.
2. Replace `applySectionAction` with:

```ts
type Outcome = { ok: boolean; message: string };

/**
 * Applies a submitted section (D449-D451): the version the admin reviewed, identified by its
 * `submitted_at` (bound by the review page). If the organiser has submitted since, it refuses. It
 * checks that version again against the event as it is now and writes only what the organiser
 * changed - the same plan the review showed. Recording is guarded on `submitted_at`, so a submit
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

/** The agenda's plan in one transaction (D451, D455). */
async function applyAgenda(ev: Event, row: SetupRow, reviewedAt: string): Promise<Outcome> {
  const r = await agendaReview(ev, row, () => crypto.randomUUID());
  if (r.problems.length) return { ok: false, message: `Not applied. ${r.problems.join(" ")}` };
  let marked: boolean;
  try {
    marked = await applyAgendaPlan(ev.id, reviewedAt, row.submitted, r.plan);
  } catch (e) {
    return { ok: false, message: `Not applied, and nothing was changed: ${(e as Error).message}` };
  }
  if (!marked) return { ok: false, message: MEANWHILE };
  const summary = changeSummary(r.plan.changes);
  return { ok: true, message: summary ? `${SECTION_TITLES.agenda} applied: ${summary}.` : `${SECTION_TITLES.agenda} applied. Nothing on the event needed changing.` };
}

/** The admin has dealt with an item's files and note (D458). Any later change makes it New again. */
export async function markItemHandledAction(eventId: string, itemKey: string) {
  const ev = await event(eventId);
  if (!(await eventChecklist(ev)).some((e) => e.key === itemKey)) redirect(flashPath(setupPath(ev.id), "That item isn't on this event's checklist.", "error"));
  await markSetupItemHandled(ev.id, itemKey);
  revalidatePath(`/admin/events/${ev.id}`, "layout");
  redirect(flashPath(setupPath(ev.id), "Marked handled."));
}
```

Run `npm run lint` and remove any import it reports unused, such as `basicsErrors` and `basicsMissing`.

- [ ] **Step 6: The download route**

`src/app/admin/events/[id]/setup/files/[fileId]/route.ts`. Read `src/app/admin/events/[id]/export/submissions.xlsx/route.ts` first, and match how it checks the admin:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { getSetupFile, setupFileUrl } from "@/features/setup";

/** One file the organiser sent, for an admin of its event: a redirect to a one-minute link carrying its name (D459). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const f = await getSetupFile(ev.id, fileId);
  const url = f ? await setupFileUrl(f) : null;
  if (!url) return new NextResponse("That file is no longer available.", { status: 404 });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
```

- [ ] **Step 7: Replace `SetupAdminPage.tsx`: one checklist table**

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
import { eventChecklist, listSetupFiles, listSetupItems, listSetupRows } from "../db";
import { SECTION_TITLES, setupLink, type SetupSection } from "../sections";
import { sectionStatus, STATUS_LABELS, type SectionStatus } from "../status";
import { formatBytes, ITEM_STATUS_ADMIN, itemStatus, type ItemStatus } from "../hub";
import { createSetupLinkAction, markItemHandledAction, replaceSetupLinkAction, turnOffSetupLinkAction } from "./actions";

const STATUS_VARIANT: Record<SectionStatus, "secondary" | "warning" | "success"> = {
  not_started: "secondary", draft: "secondary", submitted: "warning", applied: "success",
};
const ITEM_VARIANT: Record<ItemStatus, "secondary" | "warning" | "success"> = { empty: "secondary", new: "warning", handled: "success" };

/**
 * The admin's side of the setup link (D448, D458): the link itself, then every checklist item in
 * one table - each step's review, and each item's files and note with Mark handled.
 */
export async function SetupAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const [rows, list, items, files] = await Promise.all([listSetupRows(ev.id), eventChecklist(ev), listSetupItems(ev.id), listSetupFiles(ev.id)]);
  const url = ev.setup_token ? setupLink(appBaseUrl(), ev.setup_token) : null;

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader title="Setup" subtitle="What the organiser sends, in one place, waiting for you." />

      <Card>
        <CardHeader>
          <CardTitle>Organiser link</CardTitle>
          <CardDescription>One private link for the organiser&apos;s team: their checklist, the steps they fill in, and the files they send. No login. Nothing they submit changes the event until you apply it.</CardDescription>
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
          <CardTitle>Checklist</CardTitle>
          <CardDescription>Everything the organiser sends, item by item. Open a submitted step to review and apply it. Mark an item handled once you&apos;ve dealt with its files and note; anything new they send flags it again.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <ul className="divide-y divide-border border-t border-border">
            {list.map((e) => {
              const item = items.find((i) => i.item_key === e.key) ?? null;
              const mine = files.filter((f) => f.item_key === e.key);
              const hub = itemStatus(item, mine.length);
              const row = e.kind === "step" ? rows.find((r) => r.section === e.key) ?? null : null;
              const s = e.kind === "step" ? sectionStatus(row) : null;
              return (
                <li key={e.key}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/50">
                      <span className="min-w-0 flex-1 text-sm font-bold">{e.title}</span>
                      {mine.length > 0 && <span className="text-xs text-muted-foreground">{mine.length} file{mine.length === 1 ? "" : "s"}</span>}
                      {s && <Badge variant={STATUS_VARIANT[s]}>{STATUS_LABELS[s]}</Badge>}
                      {(e.kind === "card" || hub !== "empty") && <Badge variant={ITEM_VARIANT[hub]}>{ITEM_STATUS_ADMIN[hub]}</Badge>}
                    </summary>
                    <div className="flex flex-col gap-3 px-4 pb-4">
                      {s && (
                        <p className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <Link href={`/admin/events/${ev.id}/setup/${e.key}`} className="text-sm font-bold text-primary">Review {SECTION_TITLES[e.key as SetupSection]} ›</Link>
                          <span>{row?.submitted_at ? `Submitted ${shortDateTime(row.submitted_at)}` : "Not submitted"}</span>
                          {row?.applied_at && <span>Applied {shortDateTime(row.applied_at)}</span>}
                        </p>
                      )}
                      {mine.length > 0 && (
                        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                          {mine.map((f) => (
                            <li key={f.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                              <a href={`/admin/events/${ev.id}/setup/files/${f.id}`} className="min-w-0 flex-1 truncate font-semibold text-primary hover:underline">{f.name}</a>
                              <span className="text-xs text-muted-foreground">{formatBytes(f.size_bytes)} · {shortDateTime(f.uploaded_at)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {item?.notes.trim() && <p className="whitespace-pre-line rounded-lg bg-muted/50 p-3 text-sm">{item.notes}</p>}
                      {hub === "empty" && e.kind === "card" && <p className="text-sm text-muted-foreground">Nothing sent yet.</p>}
                      {hub === "new" && (
                        <form action={markItemHandledAction.bind(null, ev.id, e.key)} className="self-start">
                          <SubmitButton>Mark handled</SubmitButton>
                        </form>
                      )}
                    </div>
                  </details>
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

- [ ] **Step 8: Typecheck, lint, test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 9: In the browser, on `ecpkom` only**

Signed in as admin:

1. Setup shows the checklist table. The badge counts the Breakout rooms item (New) and any other item with files or a note. Breakout rooms lists its files, and a file name downloads under its own name.
2. Mark Breakout rooms handled. It reads Handled, and the badge drops by one. As organiser, the card reads Received. Upload another file as organiser; as admin it reads New again.
3. As organiser, submit the Agenda draft from Task 9. As admin, the Agenda row shows Submitted. Open its review: it lists exactly the sessions added or changed, with the summary, beside the organiser's preview.
4. Apply. The flash shows the summary. `/e/ecpkom/agenda` shows the new session in time order, and the breakout rounds are untouched.
5. In admin, edit the title of a session the organiser created. As organiser, change only that session's location and resubmit. Apply: the location is written and your title stays.
6. In admin, delete a session the organiser created. As organiser, change something else and resubmit. Apply: the deleted session stays deleted.

- [ ] **Step 10: Commit**

```bash
git pull --rebase --autostash
git add src/features/setup/sections/basics.ts tests/setup/basics.test.ts src/features/setup/admin "src/app/admin/events/[id]/setup/files"
git commit -m "feat(setup): the admin checklist - files, notes and Mark handled per item, and the Agenda's review and Apply (D449-D451, D455, D458)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Close-out

**Files:**
- Modify: `docs/superpowers/specs/2026-10-10-organiser-setup-design.md`
- Memory: `catalogue-setup-quote.md` (controller only)

- [ ] **Step 1: Run everything**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build && npm run check:setup
```

Expected: all pass, and `check:setup` ends "All checks passed."

- [ ] **Step 2: Update the spec**

In `docs/superpowers/specs/2026-10-10-organiser-setup-design.md`:

1. In the status line, change "Phase 2 revised on 11 Oct 2026 (…) and not built yet" to "Phase 2 revised and built on 11 Oct 2026 (…)".
2. Under Testing, add bullets for:
   - `tests/setup/agenda.test.ts`, `agenda-apply.test.ts`, `changes.test.ts`, `hub.test.ts`, `sections.test.ts`
   - the checks `check:setup` now runs on the hub's tables, the bucket and `setup_apply_agenda`

```bash
git pull --rebase --autostash
git add docs/superpowers/specs/2026-10-10-organiser-setup-design.md
git commit -m "docs(setup): Phase 2 built - the Agenda step and files and notes on every item

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Browser walk-through (controller, signed in, on `ecpkom` only)**

At phone width (375 px) and laptop width:

1. The home page, a card's panel and the Agenda step lay out without horizontal scroll at 375 px. Preview opens full screen, and Escape closes it.
2. Two tabs on the Agenda step: save in one, then edit in the other. The second shows the stale-save message.
3. Leave the Agenda step mid-edit within the app. The pending save lands, and reopening shows it.
4. Restore `ecpkom`:
   - delete the sessions and days the walk-through added, in admin
   - remove the test files from each card as organiser
   - clear the test notes
   - turn the setup link off if it was off before

Do not run Purge personal data on `ecpkom`. The purge's setup clean-up is covered by code review: files first, then rows and notes, before the attendee purge.

- [ ] **Step 4: Update memory (controller)**

Update `catalogue-setup-quote.md`:

- Phase 2 BUILT, with the commit range and migration 0073.
- The hub: files and notes on every item, Mark handled.
- Next: brainstorm the quotation site.

Keep the existing links.
