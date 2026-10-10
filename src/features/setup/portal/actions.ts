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

/**
 * An image URL counts only if it is this event's own upload of the right kind, or the image the
 * event shows now (the form starts from it, and it may predate the bucket's naming); anything
 * else is dropped.
 */
function ownImages(ev: Event, a: BasicsAnswers): BasicsAnswers {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const out = { ...a };
  for (const f of BASICS_IMAGE_FIELDS) {
    if (out[f] && out[f] !== ev[f] && !isEventMediaFor(out[f], supabaseUrl, ev.org_id, ev.id, [KIND_OF[f]])) out[f] = "";
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
  // Only this event's own uploads are ever deleted: a kept live image may live anywhere (ownImages).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  for (const url of droppedImages(before, answers, BASICS_IMAGE_FIELDS, keep)) {
    if (isEventMediaFor(url, supabaseUrl, ev.org_id, ev.id, ["logo", "banner"])) await deleteEventImage(url);
  }
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
