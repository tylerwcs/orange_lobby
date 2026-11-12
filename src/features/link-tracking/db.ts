import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { cleanSource } from "./client";

export type SourceCount = { source: string; visits: number; registrations: number; lastAt: string };

/** D899: one visit or registration under a tag. A tag that cleans to nothing is not recorded. */
export async function recordLinkHit(eventId: string, rawSource: unknown, kind: "visit" | "registration"): Promise<void> {
  const source = cleanSource(rawSource);
  if (!source) return;
  const { error } = await serviceClient().from("link_visits").insert({ event_id: eventId, source, kind });
  if (error) throw error;
}

/** Every tag that has been seen on this event, most visited first. */
export async function sourceCounts(eventId: string): Promise<SourceCount[]> {
  const { data, error } = await serviceClient().rpc("link_source_counts", { p_event_id: eventId });
  if (error) throw error;
  return ((data ?? []) as { source: string; visits: number | string; registrations: number | string; last_at: string }[])
    .map((r) => ({ source: r.source, visits: Number(r.visits), registrations: Number(r.registrations), lastAt: r.last_at }));
}
