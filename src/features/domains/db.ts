import "server-only";
import { cache } from "react";
import { serviceClient } from "@/lib/supabase/service";
import type { EventAddress } from "@/lib/links";

export type EventDomain = { domain: string; event_id: string; is_primary: boolean; created_at: string };

export async function listEventDomains(eventId: string): Promise<EventDomain[]> {
  const { data, error } = await serviceClient().from("event_domains").select("domain, event_id, is_primary, created_at")
    .eq("event_id", eventId).order("created_at");
  if (error) throw error;
  return (data ?? []) as EventDomain[];
}

/** The address links are built with (D426), once per request. */
export const primaryDomainFor = cache(async (eventId: string): Promise<string | null> => {
  const { data, error } = await serviceClient().from("event_domains").select("domain").eq("event_id", eventId).eq("is_primary", true).maybeSingle();
  if (error) throw error;
  return (data?.domain as string | undefined) ?? null;
});

export async function eventAddress(ev: { id: string; slug: string }): Promise<EventAddress> {
  return { slug: ev.slug, domain: await primaryDomainFor(ev.id) };
}

/** The first address an event gets is its primary; later ones forward to it until made primary. */
export async function addEventDomain(ev: { id: string; org_id: string }, host: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = serviceClient();
  const { data: existing, error: readError } = await db.from("event_domains").select("domain, event_id").eq("domain", host).maybeSingle();
  if (readError) throw readError;
  if (existing) return { ok: false, error: existing.event_id === ev.id ? "This event already has that address." : "Another event already uses that address." };
  const hasPrimary = (await listEventDomains(ev.id)).some((d) => d.is_primary);
  const { error } = await db.from("event_domains").insert({ domain: host, event_id: ev.id, org_id: ev.org_id, is_primary: !hasPrimary });
  if (error?.code === "23505") return { ok: false, error: "Another event already uses that address." };
  if (error) throw error;
  return { ok: true };
}

/** Clear the old primary first: the partial unique index allows one primary per event. */
export async function makePrimary(eventId: string, host: string): Promise<void> {
  const db = serviceClient();
  const { error: clearError } = await db.from("event_domains").update({ is_primary: false }).eq("event_id", eventId).eq("is_primary", true);
  if (clearError) throw clearError;
  const { error } = await db.from("event_domains").update({ is_primary: true }).eq("event_id", eventId).eq("domain", host);
  if (error) throw error;
}

/** D432: removing the primary promotes the most recently added address left, if any. */
export async function removeEventDomain(eventId: string, host: string): Promise<void> {
  const db = serviceClient();
  const { data: removed, error } = await db.from("event_domains").delete().eq("event_id", eventId).eq("domain", host).select("is_primary");
  if (error) throw error;
  if (!removed?.[0]?.is_primary) return;
  const left = await listEventDomains(eventId);
  const next = left.at(-1);
  if (next) await makePrimary(eventId, next.domain);
}
