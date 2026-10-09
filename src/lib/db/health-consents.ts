import "server-only";
import { cache } from "react";
import { serviceClient } from "@/lib/supabase/service";
import { PRIVACY_UPDATED } from "@/lib/privacy";

/**
 * D412: whether this attendee has agreed to a health-data activity collecting their health
 * information. Memoised per request: the submit form and the edit form on one page both ask.
 */
export const hasHealthConsent = cache(async (attendeeId: string, activityId: string): Promise<boolean> => {
  const { data, error } = await serviceClient().from("health_consents").select("attendee_id")
    .eq("attendee_id", attendeeId).eq("activity_id", activityId).maybeSingle();
  if (error) throw error;
  return data !== null;
});

/** Records the agreement, once: a second tick (another tab, a retried submit) keeps the first. */
export async function recordHealthConsent(attendee: { id: string; event_id: string }, activityId: string): Promise<void> {
  const { error } = await serviceClient().from("health_consents").upsert(
    { attendee_id: attendee.id, activity_id: activityId, event_id: attendee.event_id, consent_notice: PRIVACY_UPDATED },
    { onConflict: "attendee_id,activity_id", ignoreDuplicates: true },
  );
  if (error) throw error;
}
