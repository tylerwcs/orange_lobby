import type { AgendaDay, AgendaItem } from "@/lib/types";
import { blankSession, type SetupSession } from "@/features/setup/sections/agenda";

export const day = (id: string, date: string, name: string | null = null): AgendaDay => ({ id, org_id: "o", event_id: "e", date, name });

export const item = (o: Partial<AgendaItem> & Pick<AgendaItem, "id" | "day_id">): AgendaItem => ({
  event_id: "e", day: "2027-01-10", kind: "session", starts_at: "09:00", ends_at: null, title: "Session",
  description: null, location: null, categories: null, slot: null, code: null, color: null, image_url: null, sort_order: 10,
  ...o,
});

export const session = (id: string, dayId: string, o: Partial<SetupSession> = {}): SetupSession => ({
  ...blankSession(id, dayId), starts_at: "09:00", title: "Session", ...o,
});

/** Ids "n1", "n2", ... in order, so the rows a plan creates are predictable. */
export function counter(prefix = "n"): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}
