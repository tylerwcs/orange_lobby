import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { serviceClient } from "@/lib/supabase/service";
import { flashPath } from "@/lib/flash";
import { featureSet, has, notPartOf, type FeatureSet } from "./features";
import type { FeatureKey, StoredAddon } from "./catalogue";

export type CustomModule = { id: string; event_id: string; name: string; description: string | null; sort_order: number };
export type EventFeatures = FeatureSet & { custom: CustomModule[] };

export async function listCustomModules(eventId: string): Promise<CustomModule[]> {
  const { data, error } = await serviceClient()
    .from("event_custom_modules").select("id, event_id, name, description, sort_order")
    .eq("event_id", eventId).order("sort_order").order("created_at");
  if (error) throw error;
  return data as CustomModule[];
}

/** Memoised per request, like requireEvent: the layout, the page and its actions all ask (D437). */
export const eventFeatures = cache(async (eventId: string): Promise<EventFeatures> => {
  const [stored, custom] = await Promise.all([
    serviceClient().from("event_features").select("feature").eq("event_id", eventId),
    listCustomModules(eventId),
  ]);
  if (stored.error) throw stored.error;
  const keys = (stored.data as { feature: string }[]).map((r) => r.feature);
  return { ...featureSet(keys, custom.length), custom };
});

/** The guard every gated write calls (D438). Sends the admin back with the reason. */
export async function requireFeature(eventId: string, key: FeatureKey, back: string): Promise<void> {
  if (!has(await eventFeatures(eventId), key)) redirect(flashPath(back, notPartOf(key), "error"));
}

/** Turning off deletes this one row and nothing else (D439). */
export async function setAddon(eventId: string, key: StoredAddon, on: boolean): Promise<void> {
  const table = serviceClient().from("event_features");
  const { error } = on
    ? await table.upsert({ event_id: eventId, feature: key }, { onConflict: "event_id,feature", ignoreDuplicates: true })
    : await table.delete().eq("event_id", eventId).eq("feature", key);
  if (error) throw error;
}

export async function addCustomModule(ev: { id: string; org_id: string }, input: { name: string; description: string | null }): Promise<void> {
  const existing = await listCustomModules(ev.id);
  const sort_order = existing.length ? Math.max(...existing.map((m) => m.sort_order)) + 1 : 0;
  const { error } = await serviceClient().from("event_custom_modules").insert({ org_id: ev.org_id, event_id: ev.id, ...input, sort_order });
  if (error) throw error;
}

/** False when the id isn't one of this event's, so a crafted post changes nothing. */
export async function updateCustomModule(eventId: string, id: string, input: { name: string; description: string | null }): Promise<boolean> {
  const { data, error } = await serviceClient().from("event_custom_modules").update(input).eq("id", id).eq("event_id", eventId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function removeCustomModule(eventId: string, id: string): Promise<void> {
  const { error } = await serviceClient().from("event_custom_modules").delete().eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}
