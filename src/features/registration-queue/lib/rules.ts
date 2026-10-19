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

/**
 * The WhatsApp dedupe key for one admission (`whatsapp_sends.dedupe_key` is unique across the
 * table). The entry row is reused when someone starts over (D702), so the entry id alone would make
 * their second admission look already sent; `joined_at` changes on every start-over and is fixed
 * within one admission, so a repeated call still sends once.
 */
export function queueDedupeKey(reason: "moved_in" | "approved", entryId: string, joinedAt: string): string {
  return `${reason}:${entryId}:${joinedAt}`;
}

/**
 * The organiser's flash line for who a fill or Move in moved (D682, D701): one person by name,
 * several by count, and pending people said separately, since they are not in yet. Empty when
 * nobody moved, so it can be appended to any other line.
 */
export function movedFlash(people: { name: string; newState: "pending" | "registered" }[]): string {
  const registered = people.filter((p) => p.newState === "registered");
  const pending = people.filter((p) => p.newState === "pending");
  const who = (list: typeof people) => (list.length === 1 ? list[0].name : `${list.length} people`);
  return [
    registered.length > 0 ? `Moved in ${who(registered)} from the waiting list.` : "",
    pending.length > 0 ? `${who(pending)} moved from the waiting list to Pending approval.` : "",
  ].filter(Boolean).join(" ");
}

/**
 * What `notifyRegistered` did. `failed` sends are in the event's Send log; `noNumber` people never
 * reached it (no usable mobile on file), so the flash says that instead of pointing at the log.
 */
export type NotifyResult = { sent: number; failed: number; noNumber: number };

/** The flash line for a `NotifyResult` (D684, D699). Empty when nobody was due a message. */
export function whatsappNote({ sent, failed, noNumber }: NotifyResult): string {
  const notSent = failed + noNumber;
  if (notSent === 0) return sent > 0 ? "WhatsApp sent." : "";
  const why = failed === 0 ? "no usable mobile number on file" : "see the Send log on the WhatsApp page";
  return sent > 0 ? `WhatsApp sent to ${sent}, not sent to ${notSent}: ${why}.` : `Not sent on WhatsApp: ${why}.`;
}
