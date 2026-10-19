import { displayName } from "@/lib/text";
import type { Event } from "@/lib/types";

/**
 * D683: the one test for "is registration taking people now" - the switch is on, the close time has
 * not passed and the event is not archived. The register page, `registerAction`, "Register again"
 * and the SQL `registration_places` all follow it.
 */
export function registrationOpen(ev: Pick<Event, "status" | "registration_open" | "registration_closes_at">, now: Date): boolean {
  if (ev.status === "archived" || !ev.registration_open) return false;
  return !ev.registration_closes_at || Date.parse(ev.registration_closes_at) > now.getTime();
}

/** D677: the limit as typed in Settings. A positive whole number, else null (no limit). */
export function parseLimit(raw: string | null): number | null {
  const t = (raw ?? "").trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** "12 of 50 places taken"; null when there is no limit. Can read past the limit (52 of 50): organisers may move people in over it (D685). */
export function placesLabel(taken: number, limit: number | null): string | null {
  return limit === null ? null : `${taken} of ${limit} places taken`;
}

/** The name's first word as people expect to read it, for the WhatsApp greeting. */
export function firstName(name: string): string {
  return displayName(name).split(" ")[0] ?? "";
}
