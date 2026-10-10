"use server";
import { revalidatePath } from "next/cache";
import type { Event } from "@/lib/types";
import { isValidToken } from "@/lib/tokens";
import { allow } from "@/lib/ratelimit";
import { deleteEventImage, uploadEventImage } from "@/lib/db/media";
import { getEventBySetupToken, getSetupRow, saveAnswers, submitAnswers } from "../db";
import { isBuiltStep } from "../sections";
import { BASICS_IMAGE_FIELDS, basicsComplete, basicsFromEvent, basicsMissing, BASICS_LABELS, sanitizeBasics } from "../sections/basics";
import { imagesToDeleteOnSave, ownImageAnswers } from "../images";

export type SetupResult = { ok: true; rev: number } | { ok: false; message: string; stale?: boolean };

const GONE = "This setup link no longer works. Ask your project contact for a new one.";
const BUSY = "Too many saves at once — wait a moment and try again.";
const STALE: SetupResult = { ok: false, message: "Someone else updated this section — reload to see their changes.", stale: true };
const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });
const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

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

export async function saveSectionAction(token: string, section: string, expectedRev: number, raw: unknown): Promise<SetupResult> {
  const loaded = await load(token);
  if (!loaded.ok) return fail(loaded.message);
  const { ev } = loaded;
  if (!isBuiltStep(section) || section !== "basics") return fail("That section can't be filled in here yet.");
  if (!Number.isInteger(expectedRev) || expectedRev < 0) return STALE;
  const answers = ownImageAnswers(sanitizeBasics(raw), ev, supabaseUrl());
  const prev = await getSetupRow(ev.id, section);
  const rev = await saveAnswers(ev.id, section, expectedRev, answers, expectedRev === 0 ? basicsFromEvent(ev) : undefined);
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

export async function submitSectionAction(token: string, section: string, expectedRev: number): Promise<SetupResult> {
  const loaded = await load(token);
  if (!loaded.ok) return fail(loaded.message);
  const { ev } = loaded;
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
  const loaded = await load(token);
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
