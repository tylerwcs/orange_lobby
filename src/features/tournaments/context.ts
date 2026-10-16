import "server-only";
import { getEventBySlug } from "@/lib/db/events";
import { findByToken } from "@/lib/db/attendees";
import { getTournamentActivity } from "./db/tournaments";
import { groupMembers } from "@/lib/db/groups";
import { isValidToken } from "@/lib/tokens";
import { categoryMatches } from "@/lib/agenda";
import { isYes } from "@/lib/groups";
import { fieldValue } from "@/lib/attendee-values";
import type { Activity, Attendee, Event } from "@/lib/types";

/** Whether this attendee holds a Yes in one of the tournament's ticked fields (D640, as D392's `isProxy`). */
export function isPicker(activity: Pick<Activity, "proxy_fields">, attendee: Pick<Attendee, "extra">): boolean {
  return activity.proxy_fields.some((k) => isYes(fieldValue(attendee, k)));
}

/** Everything a portal squad action needs. `members` are the group's people the tournament is for. */
export type SquadContext = { event: Event; activity: Activity; attendee: Attendee; members: Attendee[]; picker: boolean };

/**
 * A portal attendee acting on a tournament from their own link (D644, D645). Null for anyone
 * who can't: a cancelled or groupless attendee, another event's tournament, a category it isn't
 * for, or a closed one. The squad functions re-check all of it (D642); this is what the page offers.
 */
export async function portalSquadContext(slug: string, token: string, activityId: string): Promise<SquadContext | null> {
  if (!isValidToken(token)) return null;
  const event = await getEventBySlug(slug);
  if (!event) return null;
  const attendee = await findByToken(event.id, token);
  if (!attendee || attendee.cancelled_at || !attendee.group_id) return null;
  const activity = await getTournamentActivity(activityId, event.id);
  if (!activity || !activity.is_open || !categoryMatches(activity.categories, attendee.category)) return null;
  const members = (await groupMembers(event.id, attendee.group_id)).filter((m) => categoryMatches(activity.categories, m.category));
  return { event, activity, attendee, members, picker: isPicker(activity, attendee) };
}
