"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent, updateEvent } from "@/lib/db/events";
import { deleteEventImage } from "@/lib/db/media";
import { flashPath } from "@/lib/flash";
import { isEventMediaFor } from "@/lib/storage";
import type { Event } from "@/lib/types";
import { imagesToDeleteOnApply } from "../images";
import { applyAgendaPlan, clearSetupToken, eventChecklist, getSetupRow, listSetupItems, markApplied, markSetupItemHandled, rotateSetupToken, type SetupRow } from "../db";
import { isBuiltStep, SECTION_TITLES, type SetupSection } from "../sections";
import { sectionStatus } from "../status";
import { BASICS_IMAGE_FIELDS, BASICS_LABELS, basicsBaseline, basicsFromEvent, basicsPatch, basicsProblems, sanitizeBasics } from "../sections/basics";
import { changeSummary } from "../sections/changes";
import { agendaReview } from "./plans";

const setupPath = (eventId: string) => `/admin/events/${eventId}/setup`;

async function event(eventId: string) {
  const { orgId } = await requireAdmin();
  return requireEvent(eventId, orgId);
}

/** Creates the first link only: a second click (another tab, a double submit) must not replace it. */
export async function createSetupLinkAction(eventId: string) {
  const ev = await event(eventId);
  if (ev.setup_token) redirect(flashPath(setupPath(ev.id), "The setup link already exists."));
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
    const text = (e as Error).message ?? "";
    // The database refused because a day the plan removes gained rows after this review was built.
    if (text.includes("still has")) {
      return { ok: false, message: "Not applied, and nothing was changed: something was added to the agenda since this review was built. Reload the review and apply again." };
    }
    return { ok: false, message: `Not applied, and nothing was changed: ${text}` };
  }
  if (!marked) return { ok: false, message: MEANWHILE };
  const summary = changeSummary(r.plan.changes);
  return { ok: true, message: summary ? `${SECTION_TITLES.agenda} applied: ${summary}.` : `${SECTION_TITLES.agenda} applied. Nothing on the event needed changing.` };
}

/**
 * The admin has dealt with an item's files and note (D458). Any later change makes it New again.
 * An item no longer on the checklist (its feature was turned off after files were sent) can still
 * be marked handled while it has a row, because the Setup badge counts it. It covers only what the
 * admin saw: `seenUpdatedAt` is bound by the page, and a later change by the organiser refuses it.
 */
export async function markItemHandledAction(eventId: string, itemKey: string, seenUpdatedAt: string) {
  const ev = await event(eventId);
  const [list, items] = await Promise.all([eventChecklist(ev), listSetupItems(ev.id)]);
  if (!list.some((e) => e.key === itemKey) && !items.some((i) => i.item_key === itemKey)) {
    redirect(flashPath(setupPath(ev.id), "That item isn't on this event's checklist.", "error"));
  }
  const stale = flashPath(setupPath(ev.id), "Something new arrived since you opened this page. Look again, then mark it handled.", "error");
  if (typeof seenUpdatedAt !== "string" || !seenUpdatedAt) redirect(stale);
  if (!(await markSetupItemHandled(ev.id, itemKey, seenUpdatedAt))) redirect(stale);
  revalidatePath(`/admin/events/${ev.id}`, "layout");
  redirect(flashPath(setupPath(ev.id), "Marked handled."));
}
