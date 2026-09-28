import type { Attendee, EventGroup } from "@/lib/types";

/**
 * D347: build groups from a column of the masterlist (previewed, deduplicated by value,
 * confirmed before anything is written). Stub for this task — the real picker and preview
 * land in Task 6, which builds on the props the Groups page already passes.
 */
export function BuildFromColumn({}: {
  eventId: string;
  fields: { key: string; label: string }[];
  from: string | null;
  attendees: Attendee[];
  groups: EventGroup[];
}) {
  return null;
}
