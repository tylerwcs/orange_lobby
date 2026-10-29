import { eligible, seatsFor } from "@/features/activities/client";
import { isRichTextEmpty } from "@/lib/rich-text";
import type { Activity, ActivitySession } from "@/lib/types";
import type { PopupInput, PortalPopup } from "./types";

export type PickInput = {
  /** The event's popups, in the organiser's order. */
  popups: PortalPopup[];
  /** What `portalActivities` returns: open and shown ones only. */
  activities: Activity[];
  category: string | null;
  /** Activity ids the attendee holds a booking in. */
  held: ReadonlySet<string>;
  /** Activity ids they checked in at a door of - a walk-in counts as done. */
  arrived: ReadonlySet<string>;
  /** The popups' activities' sessions. */
  sessions: ActivitySession[];
  /** Bookings per session id. */
  counts: Record<string, number>;
  /** `nowInKL()`. */
  now: { date: string; time: string };
};

const notStarted = (s: ActivitySession, now: PickInput["now"]) =>
  s.day > now.date || (s.day === now.date && s.starts_at > now.time);

/**
 * The one popup this attendee sees on this open, or null (D752, D754): the first that is on,
 * whose activity they can see and still act on - a slot that hasn't started, with room - and
 * haven't done yet. A popup someone can't act on would only teach them to swat it away.
 * Booking activities only for now; a form's "not done" comes in pass 2.
 */
export function pickPopup(input: PickInput): PortalPopup | null {
  const { popups, activities, category, held, arrived, sessions, counts, now } = input;
  const byId = new Map(activities.map((a) => [a.id, a]));
  return popups.find((p) => {
    if (!p.is_on || p.trigger_kind !== "not_done") return false;
    const activity = byId.get(p.activity_id);
    if (!activity || activity.kind !== "booking" || !eligible(activity, category)) return false;
    if (held.has(activity.id) || arrived.has(activity.id)) return false;
    return sessions.some((s) => s.activity_id === activity.id && notStarted(s, now) && !seatsFor(s, counts[s.id] ?? 0).full);
  }) ?? null;
}

/** Whether the attendee is already on the page the popup's button leads to, where it would only be in the way. */
export function onTargetPage(pathname: string, basePath: string, activityId: string): boolean {
  return pathname.replace(/\/+$/, "") === `${basePath}/activities/${activityId}`;
}

/**
 * Whether the dialog opens now (D753, D754): one popup per open of the portal, whichever it
 * was. Booking from one popup can hand the layout the next one; that one waits for the next open.
 */
export function opensThisVisit({ popupId, onTarget, shownThisOpen }: { popupId: string | null; onTarget: boolean; shownThisOpen: boolean }): boolean {
  return popupId !== null && !onTarget && !shownThisOpen;
}

export type PopupFormResult =
  | { ok: true; input: Omit<PopupInput, "message_html"> & { message: string } }
  | { ok: false; error: string };

/** The admin form, checked. `message` is the editor's raw HTML; the action sanitises it. */
export function readPopupForm(fd: FormData, bookingActivityIds: readonly string[]): PopupFormResult {
  const get = (k: string) => String(fd.get(k) ?? "").trim();
  const heading = get("heading");
  const message = get("message");
  const button_label = get("button_label");
  const activity_id = get("activity_id");
  if (!heading || !button_label || isRichTextEmpty(message)) return { ok: false, error: "A popup needs a heading, a message and a button label." };
  if (!bookingActivityIds.includes(activity_id)) return { ok: false, error: "Pick the activity it reminds them about." };
  return { ok: true, input: { heading, message, button_label, activity_id } };
}
