import { MONTHS } from "@/lib/text";
import type { Attendee, Event } from "@/lib/types";

const KL_OFFSET_MS = 8 * 60 * 60 * 1000;
const kl = (iso: string) => new Date(Date.parse(iso) + KL_OFFSET_MS);
const pad = (n: number) => String(n).padStart(2, "0");

/** "21 Oct" on the Malaysian calendar. */
export function klDay(iso: string): string {
  const d = kl(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "21 Oct, 18:00" in Malaysian time. */
export function klDayTime(iso: string): string {
  const d = kl(iso);
  return `${klDay(iso)}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** D588: the badge on a cancelled attendee. */
export function cancelledLabel(iso: string): string {
  return `Cancelled · ${klDay(iso)}`;
}

/** D616: matches the `cancel_reason` check in 0088, which counts characters (code points). */
export const CANCEL_REASON_MAX = 500;

/** D613: the reason typed in the dialog, trimmed. Empty or too long is refused with the message to show. */
export function parseCancelReason(raw: unknown): { reason: string } | { error: string } {
  const reason = typeof raw === "string" ? raw.trim() : "";
  if (!reason) return { error: "Tell the organiser why you're cancelling." };
  if ([...reason].length > CANCEL_REASON_MAX) return { error: `Keep the reason to ${CANCEL_REASON_MAX} characters or fewer.` };
  return { reason };
}

/** D584: may this attendee cancel now? The reason is shown to them as-is. */
export function canSelfCancel(
  ev: Pick<Event, "status" | "self_cancel" | "self_cancel_closes_at">,
  a: Pick<Attendee, "cancelled_at" | "cancel_requested_at">,
  hasCheckin: boolean,
  now: Date,
): { ok: true } | { ok: false; reason: string } {
  if (a.cancelled_at) return { ok: false, reason: "You've already cancelled." };
  if (a.cancel_requested_at) return { ok: false, reason: "You've already asked to cancel." }; // D595
  if (!ev.self_cancel) return { ok: false, reason: "Cancelling isn't available for this event." };
  if (ev.status === "archived") return { ok: false, reason: "This event has ended." };
  if (ev.self_cancel_closes_at && Date.parse(ev.self_cancel_closes_at) <= now.getTime()) {
    return { ok: false, reason: `Cancelling closed on ${klDayTime(ev.self_cancel_closes_at)}.` };
  }
  if (hasCheckin) return { ok: false, reason: "You've already checked in, so your registration can't be cancelled." };
  return { ok: true };
}

/** D585/D587: whether "Register again" can be offered. Registration's own closed test (registerAction), plus archived. */
export function registrationOpenNow(ev: Pick<Event, "status" | "registration_open" | "registration_closes_at">, now: Date): boolean {
  if (ev.status === "archived" || !ev.registration_open) return false;
  return !ev.registration_closes_at || Date.parse(ev.registration_closes_at) > now.getTime();
}
