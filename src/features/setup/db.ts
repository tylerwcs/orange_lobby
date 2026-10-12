import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { getEvent, updateEvent } from "@/lib/db/events";
import { generateToken } from "@/lib/tokens";
import type { Event } from "@/lib/types";
import { isStandardKey } from "@/lib/registration-standard";
import type { SetupSection } from "./sections";
import { sectionStatus } from "./status";
import { SETUP_BUCKET } from "@/lib/storage";
import { sweepSetupFiles } from "@/lib/db/media";
import { selectAll } from "@/lib/db/select-all";
import { listAgenda, listAgendaDays } from "@/lib/db/agenda";
import { eventFeatures } from "@/features/catalogue";
import { BUILT_STEPS } from "./sections";
import { buildChecklist, type ChecklistEntry } from "./checklist";
import { isSetupFilePath, itemStatus, MAX_FILES_PER_ITEM, setupFilePath } from "./hub";
import type { AgendaLive, AgendaPlan } from "./sections/agenda-apply";

export type SetupRow = {
  event_id: string; section: SetupSection; answers: unknown; submitted: unknown; applied: unknown; seed: unknown;
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
 * the row, with `seed`: the live event as the organiser's form first showed it, the baseline for
 * the first Apply (D450), and the map tying prefilled items to their rows (D454). A second
 * first-save racing it hits the primary key and is refused as stale.
 */
export async function saveAnswers(
  eventId: string, section: SetupSection, expectedRev: number, answers: unknown, seed?: unknown, appliedMap?: Record<string, string>,
): Promise<number | null> {
  if (expectedRev === 0) {
    const { error } = await table().insert({ event_id: eventId, section, answers, seed, applied_map: appliedMap ?? {}, rev: 1 });
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
 * Records what was applied (D451): `submitted`, the version the admin reviewed, identified by its
 * `submitted_at`. Guarded on that timestamp, not rev: autosaves bump rev and must not stop an
 * Apply, but a submit that lands while the admin is applying replaces `submitted_at`, so a
 * version nobody reviewed is never marked applied. Does not bump rev: applying changes nothing
 * the organiser is editing.
 */
export async function markApplied(eventId: string, section: SetupSection, reviewedAt: string, submitted: unknown): Promise<boolean> {
  const { data, error } = await table()
    .update({ applied: submitted, applied_at: now() })
    .eq("event_id", eventId).eq("section", section).eq("submitted_at", reviewedAt)
    .select("rev");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

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

export type SetupItemRow = { event_id: string; item_key: string; notes: string; updated_at: string; handled_at: string | null };
export type SetupFileRow = { id: string; event_id: string; item_key: string; path: string; name: string; size_bytes: number; content_type: string; uploaded_at: string };

const items = () => serviceClient().from("event_setup_items");
const files = () => serviceClient().from("event_setup_files");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Everything this event needs from its organiser (D444): its features' items and its custom modules. */
export async function eventChecklist(ev: Event): Promise<ChecklistEntry[]> {
  const features = await eventFeatures(ev.id);
  return buildChecklist({
    features, custom: features.custom,
    // Mobile and department are on every saved form, so only a question of the organiser's own counts.
    selfRegistration: ev.registration_open || ev.registration_questions.some((q) => !isStandardKey(q.key)), builtSteps: BUILT_STEPS,
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

/**
 * Marks the item handled (D458), but only as the admin saw it: `seenUpdatedAt` is the item's
 * `updated_at` when their page was built. If the organiser has changed it since, nothing matches
 * and this returns false, so a new arrival is never hidden.
 */
export async function markSetupItemHandled(eventId: string, itemKey: string, seenUpdatedAt: string): Promise<boolean> {
  const { data, error } = await items().update({ handled_at: now() }).eq("event_id", eventId).eq("item_key", itemKey).lte("updated_at", seenUpdatedAt).select("item_key");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

const NETWORK_FAILURE = /fetch failed|ECONNRESET|socket/i;

/** Whether an error is the network dropping a request (a stale pooled socket, a reset), not the storage API refusing it. */
function looksLikeNetworkFailure(e: unknown, depth = 0): boolean {
  if (!e || typeof e !== "object" || depth > 3) return false;
  const err = e as { name?: unknown; message?: unknown; cause?: unknown; originalError?: unknown };
  if (err.name === "StorageUnknownError") return true;
  if (typeof err.message === "string" && NETWORK_FAILURE.test(err.message)) return true;
  return looksLikeNetworkFailure(err.cause, depth + 1) || looksLikeNetworkFailure(err.originalError, depth + 1);
}

/**
 * Runs a storage call, and once more if the network dropped it (D459). storage-js hands back
 * failures as `{ error }` rather than throwing, so both are checked. Any other error is the
 * caller's to handle: a thrown one is rethrown, a returned one is returned.
 */
export async function retryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    const result = await fn();
    const error = result && typeof result === "object" ? (result as { error?: unknown }).error : null;
    return looksLikeNetworkFailure(error) ? await fn() : result;
  } catch (e) {
    if (!looksLikeNetworkFailure(e)) throw e;
    return fn();
  }
}

/** A signed upload for one new file (D459): the path is minted here, so the browser can write only this one object. */
export async function startSetupUpload(orgId: string, eventId: string, ext: string): Promise<{ path: string; token: string }> {
  const path = setupFilePath(orgId, eventId, crypto.randomUUID(), ext);
  const { data, error } = await retryOnce(() => serviceClient().storage.from(SETUP_BUCKET).createSignedUploadUrl(path));
  if (error || !data) throw new Error("Could not start the upload. Try again.");
  return { path, token: data.token };
}

/** True for storage's answer to a path with no object. */
const isMissingObject = (e: { message?: string; status?: number; statusCode?: string }) =>
  e.status === 404 || e.statusCode === "404" || /not.?found/i.test(e.message ?? "");

/**
 * Records a file once it is in the bucket (D459), and marks its item changed. Safe to repeat: a
 * path already recorded for this event and item returns that row, so finishing again after a
 * dropped response is harmless. Null when the path isn't one minted for this event, nothing is
 * there (the upload never finished), or it is recorded under another item. "full" when the item
 * already holds its maximum: the cap is enforced here, not only when the upload starts, so the
 * object just uploaded is removed again.
 */
export async function recordSetupFile(ev: Pick<Event, "id" | "org_id">, itemKey: string, path: string, name: string, contentType: string): Promise<SetupFileRow | "full" | null> {
  if (!isSetupFilePath(path, ev.org_id, ev.id)) return null;
  // The row for this path if it is already recorded: ours (same event and item) is returned, anyone else's is not.
  const recorded = async (): Promise<{ found: boolean; row: SetupFileRow | null }> => {
    const { data, error } = await files().select("*").eq("path", path).limit(1);
    if (error) throw error;
    const row = (data as SetupFileRow[] | null)?.[0];
    if (!row) return { found: false, row: null };
    return { found: true, row: row.event_id === ev.id && row.item_key === itemKey ? row : null };
  };
  const prior = await recorded();
  if (prior.found) return prior.row;
  const { data: object, error: objectError } = await retryOnce(() => serviceClient().storage.from(SETUP_BUCKET).info(path));
  if (objectError) {
    if (isMissingObject(objectError as { message?: string; status?: number; statusCode?: string })) return null;
    throw objectError;
  }
  if (!object) return null;
  const { count, error: countError } = await files().select("id", { count: "exact", head: true }).eq("event_id", ev.id).eq("item_key", itemKey);
  if (countError) throw countError;
  if ((count ?? 0) >= MAX_FILES_PER_ITEM) {
    const { error: removeError } = await serviceClient().storage.from(SETUP_BUCKET).remove([path]);
    if (removeError) throw removeError;
    return "full";
  }
  // The item's row first: a failure between the two writes can leave an item row with no file, but
  // never a file whose item has no row, which the admin could not mark handled.
  await touchSetupItem(ev.id, itemKey);
  const { data, error } = await files()
    .insert({ event_id: ev.id, item_key: itemKey, path, name, size_bytes: Math.max(Number(object.size ?? 0), 1), content_type: contentType })
    .select("*").single();
  if (error?.code === "23505") return (await recorded()).row;
  if (error) throw error;
  return data as SetupFileRow;
}

/** Removes one file: the object first, then the row, so no personal-data object ever outlives its row (a failed removal leaves the row, and the file stays findable and retryable). */
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
  const { data } = await retryOnce(() => serviceClient().storage.from(SETUP_BUCKET).createSignedUrl(f.path, 60, { download: f.name }));
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
