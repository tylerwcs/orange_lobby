import { categoryMatches } from "@/lib/agenda";

/**
 * Who a WhatsApp send goes to, and when somebody counts as already having it.
 *
 * `whatsapp-audience.ts` answers who CAN be reached (a usable number). This answers who
 * SHOULD be: everybody, or only the people booked — or not yet booked — for one booking
 * activity, which is what "your session is today" and "you have not chosen a session yet"
 * are for. Pure, so the send screen's counts and the send itself pick the same people.
 */

export type AudienceKey = "all" | "pick" | `booked:${string}` | `unbooked:${string}`;
export type AudienceOption = { key: AudienceKey; label: string };

type BookingActivity = { id: string; name: string; categories: string[] | null };

/**
 * Everybody first, then two choices per booking activity, then the people the organiser ticks
 * one by one ("pick"). `inAudience` does not decide "pick": its members are whoever was ticked.
 */
export function audienceOptions(activities: BookingActivity[]): AudienceOption[] {
  return [
    { key: "all", label: "Everyone" },
    ...activities.flatMap((a): AudienceOption[] => [
      { key: `booked:${a.id}`, label: `Booked for ${a.name}` },
      { key: `unbooked:${a.id}`, label: `Not yet booked for ${a.name}` },
    ]),
    { key: "pick", label: "Choose people…" },
  ];
}

/**
 * Whether one attendee is in an audience. "Not yet booked" leaves out anybody the activity is
 * not offered to (its categories): reminding a guest to book a staff-only session is a
 * message they can do nothing with. Null for a key that names no current activity.
 */
export function inAudience(
  key: string,
  attendee: { id: string; category: string | null },
  activities: BookingActivity[],
  bookedBy: Map<string, Set<string>>,
): boolean | null {
  if (key === "all") return true;
  const [kind, id] = key.split(":");
  const activity = activities.find((a) => a.id === id);
  if (!activity || (kind !== "booked" && kind !== "unbooked")) return null;
  const booked = bookedBy.get(activity.id)?.has(attendee.id) ?? false;
  return kind === "booked" ? booked : !booked && categoryMatches(activity.categories, attendee.category);
}

/**
 * The claim key that makes a send idempotent (see claimSend): one attendee holds it at most
 * once, so pressing Send twice never messages anybody twice.
 *
 * - Everyone, once: `template:attendee` — the shape every send before audiences used, so
 *   people who already had a template still count as having it.
 * - An audience, once: `template:audience:attendee` — "book Health Screening" and "book
 *   Yoga" are different messages even from one template.
 * - Send again: the same plus today's date, so it can go out once more each day, and a
 *   second press on the same day is still a no-op.
 * - People picked one by one: always sent - picking somebody is the organiser saying so, even
 *   if they had it before (a lost message, a changed number). `nonce` is fixed when the send
 *   screen opens, so pressing Send twice on that screen still sends once.
 */
export function sendKey(input: { template: string; audience: string; attendeeId: string; again: boolean; today: string; nonce?: string }): string {
  const { template, audience, attendeeId, again, today, nonce } = input;
  if (audience === "pick") return `${template}:pick:${attendeeId}:${nonce ?? ""}`;
  if (again) return `${template}:${audience}:${attendeeId}:${today}`;
  return audience === "all" ? `${template}:${attendeeId}` : `${template}:${audience}:${attendeeId}`;
}
