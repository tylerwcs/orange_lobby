import "server-only";
import { serviceClient } from "@/lib/supabase/service";

/**
 * D580/D582: mark cancelled, free their activity bookings, withdraw pending change requests.
 * The mark is conditional on still being active, so a replay never re-stamps the date. The cleanup
 * runs whenever the row ends up cancelled (this call or an earlier one), so a retry after a partial
 * failure still frees the seats; both steps are idempotent. Returns true only when this call set the
 * mark. Entries, points, check-ins and polaroids stay.
 */
export async function cancelAttendee(eventId: string, attendeeId: string): Promise<boolean> {
  const db = serviceClient();
  const { data, error } = await db.from("attendees").update({ cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", attendeeId).eq("event_id", eventId).is("cancelled_at", null).select("id");
  if (error) throw error;
  const didMark = (data?.length ?? 0) > 0;
  if (!didMark) {
    // any-status: nothing matched, so this reads the row whatever its state - already cancelled (a retry after a partial failure) or not here at all.
    const { data: row, error: readErr } = await db.from("attendees").select("cancelled_at")
      .eq("id", attendeeId).eq("event_id", eventId).maybeSingle();
    if (readErr) throw readErr;
    if (!row?.cancelled_at) return false;
  }
  const now = new Date().toISOString();
  const [b, r] = await Promise.all([
    db.from("activity_bookings").delete().eq("event_id", eventId).eq("attendee_id", attendeeId),
    db.from("activity_change_requests").update({ status: "withdrawn", decided_at: now }).eq("event_id", eventId).eq("attendee_id", attendeeId).eq("status", "pending"),
  ]);
  if (b.error) throw b.error;
  if (r.error) throw r.error;
  return didMark;
}

/** D588: Restore clears the mark. Bookings given up are not restored. */
export async function restoreAttendee(eventId: string, attendeeId: string): Promise<boolean> {
  const { data, error } = await serviceClient().from("attendees").update({ cancelled_at: null, updated_at: new Date().toISOString() })
    .eq("id", attendeeId).eq("event_id", eventId).not("cancelled_at", "is", null).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
