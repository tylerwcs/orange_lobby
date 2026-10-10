"use server";
import { revalidatePath } from "next/cache";
import type { Event } from "@/lib/types";
import { deleteEventImage, uploadEventImage } from "@/lib/db/media";
import { getSetupRow, liveAgenda, saveAnswers, submitAnswers, type SetupRow } from "../db";
import { isBuiltStep, problemSentence, type SetupSection } from "../sections";
import { BASICS_IMAGE_FIELDS, basicsComplete, basicsFromEvent, basicsMissing, BASICS_LABELS, sanitizeBasics } from "../sections/basics";
import { agendaFromLive, agendaProblems, agendaRange, sanitizeAgenda, seedFromForm } from "../sections/agenda";
import { imagesToDeleteOnSave, ownImageAnswers } from "../images";
import { loadByToken } from "./load";

export type SetupResult = { ok: true; rev: number } | { ok: false; message: string; stale?: boolean };

const RELOAD = "Reload the page and try again.";
const STALE: SetupResult = { ok: false, message: "Someone else updated this section — reload to see their changes.", stale: true };
const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });
const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * `seed` is what the organiser's form showed when the page opened. Only the first save (rev 0)
 * uses it: it becomes the baseline the first Apply compares against (D450, D454).
 */
export async function saveSectionAction(token: string, section: string, expectedRev: number, raw: unknown, seed?: unknown): Promise<SetupResult> {
  const loaded = await loadByToken(token);
  if (!loaded.ok) return fail(loaded.message);
  if (!isBuiltStep(section)) return fail("That section can't be filled in here yet.");
  if (!Number.isInteger(expectedRev) || expectedRev < 0) return STALE;
  const s: SetupSection = section;
  switch (s) {
    case "basics": return saveBasics(loaded.ev, expectedRev, raw, seed);
    case "agenda": return saveAgenda(loaded.ev, expectedRev, raw, seed);
    default: { const never: never = s; return never; }
  }
}

async function saveBasics(ev: Event, expectedRev: number, raw: unknown, seed: unknown): Promise<SetupResult> {
  const answers = ownImageAnswers(sanitizeBasics(raw), ev, supabaseUrl());
  const prev = await getSetupRow(ev.id, "basics");
  const rev = await saveAnswers(ev.id, "basics", expectedRev, answers, expectedRev === 0 ? (isObject(seed) ? sanitizeBasics(seed) : basicsFromEvent(ev)) : undefined);
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

/** The first save (rev 0) seeds the starting point from what the form showed, and the map from the live agenda (D450, D454). */
async function saveAgenda(ev: Event, expectedRev: number, raw: unknown, seed: unknown): Promise<SetupResult> {
  let seeded: ReturnType<typeof seedFromForm> | null = null;
  if (expectedRev === 0) {
    if (!isObject(seed)) return fail(RELOAD);
    const live = await liveAgenda(ev.id);
    seeded = seedFromForm(sanitizeAgenda(seed), agendaFromLive(live.days, live.items));
  }
  const rev = await saveAnswers(ev.id, "agenda", expectedRev, sanitizeAgenda(raw), seeded?.answers, seeded?.map);
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
