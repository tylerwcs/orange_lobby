import "server-only";
import { getEvent, getEventBySlug } from "@/lib/db/events";
import { findByToken } from "@/lib/db/attendees";
import { isValidToken } from "@/lib/tokens";
import { categoryMatches } from "@/lib/agenda";
import { crewLinkLive } from "@/lib/crew";
import { nowInKL } from "@/lib/time";
import { createMemo } from "@/lib/memo";
import type { Activity, Event } from "@/lib/types";
import { activityByToken, getPolaroidActivity } from "./db/polaroids";
import { LINK_OFF, OVER, PAUSED, walkinRefusal } from "./lib/post-rules";
import type { PostContext } from "./post";

/** A portal attendee posting from their own link (D481). Drafts are allowed, as for bookings. */
export async function portalContext(slug: string, token: string, activityId: string): Promise<PostContext | null> {
  if (!isValidToken(token)) return null;
  const event = await getEventBySlug(slug);
  if (!event) return null;
  const attendee = await findByToken(event.id, token);
  if (!attendee) return null;
  const activity = await getPolaroidActivity(activityId, event.id);
  if (!activity || !categoryMatches(activity.categories, attendee.category)) return null;
  return { event, activity, attendeeId: attendee.id };
}

async function lookupWalkin(slug: string, publicToken: string): Promise<{ event: Event; activity: Activity } | null> {
  if (!isValidToken(publicToken)) return null;
  const event = await getEventBySlug(slug);
  // Public, so a draft is never shown, unlike the portal.
  if (!event || event.status === "draft") return null;
  const activity = await activityByToken("public_token", publicToken);
  if (!activity || activity.event_id !== event.id) return null;
  return { event, activity };
}

/** The full event comes with it: `walkinClosed` needs its dates. */
export type WalkinContext = PostContext & { event: Event };

export async function walkinContext(slug: string, publicToken: string): Promise<WalkinContext | null> {
  const found = await lookupWalkin(slug, publicToken);
  return found ? { ...found, attendeeId: null } : null;
}

/** Why this walk-in context may not post now (the event is over, paused, link off), or null. */
export function walkinClosed(ctx: WalkinContext): string | null {
  return walkinRefusal(ctx.event, ctx.activity, nowInKL().date);
}

export type WalkinPage =
  | { kind: "missing" }
  | { kind: "closed"; eventName: string; title: string; body: string }
  | { kind: "open"; eventName: string; activity: Activity };

const CLOSED_BODY: Record<string, string> = {
  [PAUSED]: "The wall is still on screen. Check back soon.",
  [OVER]: "Thanks for being part of it.",
  [LINK_OFF]: "Ask the event team how to share a photo.",
};

/** What the walk-in page shows (D481): the composer, a friendly "not now", or a 404. */
export async function walkinPage(slug: string, publicToken: string): Promise<WalkinPage> {
  const found = await lookupWalkin(slug, publicToken);
  if (!found) return { kind: "missing" };
  const no = walkinRefusal(found.event, found.activity, nowInKL().date);
  if (no) return { kind: "closed", eventName: found.event.name, title: no, body: CLOSED_BODY[no] ?? "" };
  return { kind: "open", eventName: found.event.name, activity: found.activity };
}

export type WallLink = { event: Event; activity: Activity } | { refused: "missing" | "draft" | "expired" };

// One read per second per instance, however often the wall polls (D259).
const tokenMemo = createMemo<Activity | null>(1000);
const eventMemo = createMemo<Event | null>(1000);

/** D484: gated like the games display: a real token, a published event, not past the crew link's day. */
export async function wallLinkState(token: string): Promise<WallLink> {
  if (!isValidToken(token)) return { refused: "missing" };
  const activity = await tokenMemo.get(token, () => activityByToken("wall_token", token));
  if (!activity) return { refused: "missing" };
  const event = await eventMemo.get(activity.event_id, () => getEvent(activity.event_id));
  if (!event) return { refused: "missing" };
  if (event.status === "draft") return { refused: "draft" };
  if (!crewLinkLive(event, nowInKL().date)) return { refused: "expired" };
  return { event, activity };
}
