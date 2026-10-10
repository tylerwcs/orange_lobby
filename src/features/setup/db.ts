import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { getEvent, updateEvent } from "@/lib/db/events";
import { generateToken } from "@/lib/tokens";
import type { Event } from "@/lib/types";
import type { SetupSection } from "./sections";
import { sectionStatus } from "./status";

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
 * the first Apply (D450). A second first-save racing it hits the primary key and is refused as stale.
 */
export async function saveAnswers(eventId: string, section: SetupSection, expectedRev: number, answers: unknown, seed?: unknown): Promise<number | null> {
  if (expectedRev === 0) {
    const { error } = await table().insert({ event_id: eventId, section, answers, seed, rev: 1 });
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
