import type { EventStatus } from "@/lib/types";

/** D551: who is acting on an event. An Ecopia admin, or a committee member of that one event. */
export type AccessKind = "admin" | "committee";

/** The `event_committee` columns the decision needs. */
export type SeatRow = { event_id: string; user_id: string | null; removed_at: string | null };

/**
 * D551/D556: the one access decision, kept pure so it is tested apart from Supabase.
 * An admin of the event's org always gets in. A committee member gets in on their own event while
 * it is not archived; archiving ends their access and un-archiving gives it back.
 */
export function decideAccess(a: {
  userId: string;
  adminOrgId: string | null;
  ev: { id: string; org_id: string; status: EventStatus };
  seats: SeatRow[];
}): AccessKind | null {
  if (a.adminOrgId && a.adminOrgId === a.ev.org_id) return "admin";
  if (a.ev.status === "archived") return null;
  const seated = a.seats.some((s) => s.event_id === a.ev.id && s.user_id === a.userId && !s.removed_at);
  return seated ? "committee" : null;
}

/** D553: archiving would end a committee member's own access (D556), so only Ecopia archives. */
export function canSetStatus(kind: AccessKind, status: EventStatus): boolean {
  return status !== "archived" || kind === "admin";
}
