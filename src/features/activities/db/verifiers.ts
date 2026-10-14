import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { generateToken } from "@/lib/tokens";
import type { ActivitySubmission, VerifierLink } from "@/lib/types";
import { featureForActivityKind, has, eventFeatures } from "@/features/catalogue";
import { resolveVerifier, VERIFY_PAGE_SIZE, type VerifyStatus } from "../lib/verifier";

const links = () => serviceClient().from("verifier_links");

/** D493: the live links, oldest first. Removed ones stay in the table for the record, not here. */
export async function listVerifierLinks(eventId: string): Promise<VerifierLink[]> {
  const { data, error } = await links().select("*").eq("event_id", eventId).is("removed_at", null).order("created_at");
  if (error) throw error;
  return (data ?? []) as VerifierLink[];
}

/**
 * D496: the one check every verifier page, action and file makes - a live link whose event still
 * runs submissions. Turning the add-on off hides the Verification tab, so its links stop with it.
 */
export async function openVerifierLink(token: string): Promise<VerifierLink | null> {
  return resolveVerifier(token, verifierByToken, async (eventId) => has(await eventFeatures(eventId), featureForActivityKind("submission")));
}

/** Raw lookup; `resolveVerifier` decides whether it still opens anything (D496). */
export async function verifierByToken(token: string): Promise<VerifierLink | null> {
  const { data, error } = await links().select("*").eq("token", token).maybeSingle();
  if (error) throw error;
  return (data as VerifierLink | null) ?? null;
}

export async function addVerifierLink(eventId: string, name: string, userId: string): Promise<VerifierLink> {
  const { data, error } = await links().insert({ event_id: eventId, name, token: generateToken(), created_by: userId }).select("*").single();
  if (error) throw error;
  return data as VerifierLink;
}

/** D493: a new token on the same row - same name, same history; every copy of the old URL stops. */
export async function replaceVerifierToken(eventId: string, id: string): Promise<boolean> {
  const { data, error } = await links().update({ token: generateToken() })
    .eq("id", id).eq("event_id", eventId).is("removed_at", null).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** D493: stamped, not deleted, so "Revoked by Aisyah (verifier)" keeps its name. */
export async function removeVerifierLink(eventId: string, id: string): Promise<boolean> {
  const { data, error } = await links().update({ removed_at: new Date().toISOString() })
    .eq("id", id).eq("event_id", eventId).is("removed_at", null).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** Link ids to names for revoke credits, removed links included. Unresolvable ids are absent. */
export async function verifierNames(ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return {};
  const { data, error } = await links().select("id, name").in("id", unique);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r: { id: string; name: string }) => [r.id, r.name]));
}


/**
 * D495: one page of the verify list, newest first, across the given submission activities.
 * Reads one row past the page to know whether there is another. `attendeeIds` null means
 * everyone; an empty list (a name search that matched nobody) means no rows.
 */
export async function submissionsForVerify(o: {
  eventId: string; activityIds: string[]; status: VerifyStatus; attendeeIds: string[] | null; page: number;
}): Promise<{ rows: ActivitySubmission[]; more: boolean }> {
  if (o.activityIds.length === 0 || (o.attendeeIds && o.attendeeIds.length === 0)) return { rows: [], more: false };
  let q = serviceClient().from("activity_submissions").select("*").eq("event_id", o.eventId).in("activity_id", o.activityIds);
  // D519: To check is live and not yet approved; Approved is live and approved.
  if (o.status === "submitted") q = q.eq("status", "submitted").is("approved_at", null);
  else if (o.status === "approved") q = q.eq("status", "submitted").not("approved_at", "is", null);
  else if (o.status === "revoked") q = q.eq("status", "revoked");
  if (o.attendeeIds) q = q.in("attendee_id", o.attendeeIds);
  const from = o.page * VERIFY_PAGE_SIZE;
  const { data, error } = await q.order("created_at", { ascending: false }).order("id").range(from, from + VERIFY_PAGE_SIZE);
  if (error) throw error;
  const rows = (data ?? []) as ActivitySubmission[];
  return { rows: rows.slice(0, VERIFY_PAGE_SIZE), more: rows.length > VERIFY_PAGE_SIZE };
}
