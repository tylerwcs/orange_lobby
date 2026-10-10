"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent, updateEvent } from "@/lib/db/events";
import { deleteEventImage } from "@/lib/db/media";
import { flashPath } from "@/lib/flash";
import { isEventMediaFor } from "@/lib/storage";
import { clearSetupToken, getSetupRow, markApplied, rotateSetupToken } from "../db";
import { isBuiltStep } from "../sections";
import { sectionStatus } from "../status";
import { BASICS_IMAGE_FIELDS, BASICS_LABELS, basicsBaseline, basicsErrors, basicsMissing, basicsPatch, sanitizeBasics } from "../sections/basics";

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
  const baseline = basicsBaseline(row, ev);
  const patch = basicsPatch(submitted, baseline);
  const kindOf = (f: (typeof BASICS_IMAGE_FIELDS)[number]) => (f === "logo_url" ? "logo" : "banner");
  // Only an image about to be written has to be this event's own upload: an untouched legacy one is never written.
  for (const f of BASICS_IMAGE_FIELDS) {
    const url = patch[f];
    if (url && !isEventMediaFor(url, supabaseUrl, ev.org_id, ev.id, [kindOf(f)])) problems.push(`${BASICS_LABELS[f]} was not uploaded through this link`);
  }
  if (problems.length) redirect(flashPath(back, `Not applied. ${problems.join(". ")}.`, "error"));

  if (Object.keys(patch).length) await updateEvent(ev.id, patch);
  // A replaced image goes after the row points at the new one, as Settings does - but only the one
  // the organiser started from and replaced, never an image the admin put there since.
  for (const f of BASICS_IMAGE_FIELDS) {
    const old = ev[f];
    if (f in patch && old && old !== patch[f] && old === baseline[f] && isEventMediaFor(old, supabaseUrl, ev.org_id, ev.id, [kindOf(f)])) await deleteEventImage(old);
  }
  revalidatePath(`/admin/events/${ev.id}`, "layout");
  revalidatePath(`/e/${ev.slug}`, "layout");
  if (!(await markApplied(ev.id, section, row.rev, row.submitted))) {
    redirect(flashPath(back, "Applied, but the organiser changed this section meanwhile. Review the latest version.", "error"));
  }
  const n = Object.keys(patch).length;
  redirect(flashPath(setupPath(ev.id), n ? `Event basics applied: ${n} change${n === 1 ? "" : "s"} written.` : "Event basics applied. Nothing on the event needed changing."));
}
