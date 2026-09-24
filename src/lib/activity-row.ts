import { dayRange } from "@/lib/activity-card";
import { capSummary } from "@/lib/submissions";
import type { Activity } from "@/lib/types";

/**
 * What one row of the admin Activities list says, whichever kind it is.
 *
 * Every kind answers the same three questions in the same places — what is it, how far along
 * is it, and does it need you — so the list reads as one list rather than three. Only the
 * progress line's unit differs, because the kinds genuinely count different things: a seat, a
 * submitter, a full card. Pure, so each wording has a test rather than a screenshot.
 */
export type RowProgress = { done: number; total: number; label: string };

export type ActivityRowView = {
  kind: "Sessions" | "Submission" | "Passport";
  /** When, where, how often — the line under the name. Null when there is nothing to say yet. */
  detail: string | null;
  progress: RowProgress;
  /** Something the organiser has to act on, or null. At most one, the most pressing. */
  attention: string | null;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function bookingRow(input: { days: string[]; sessions: number; booked: number; seats: number; pending: number }): ActivityRowView {
  const { days, sessions, booked, seats, pending } = input;
  const range = dayRange(days);
  return {
    kind: "Sessions",
    detail: range ? `${range} · ${plural(sessions, "session")}` : null,
    progress: { done: booked, total: seats, label: seats === 0 ? "No seats yet" : `${booked} of ${seats} seats` },
    // No sessions outranks a waiting request: an activity nobody can book is the bigger problem.
    attention: sessions === 0 ? "No sessions yet" : pending > 0 ? `${plural(pending, "request")} waiting` : null,
  };
}

export function submissionRow(input: {
  form: Pick<Activity, "per_day" | "max_per_attendee" | "starts_on" | "ends_on" | "venue">;
  /** Distinct people who have submitted at least once — not submissions, which a daily form multiplies. */
  submitters: number;
  eligible: number;
}): ActivityRowView {
  const { form, submitters, eligible } = input;
  const dates = form.starts_on ? dayRange([form.starts_on, form.ends_on ?? form.starts_on]) : null;
  return {
    kind: "Submission",
    detail: [dates, form.venue, capSummary(form)].filter(Boolean).join(" · "),
    progress: { done: submitters, total: eligible, label: `${submitters} of ${eligible} submitted` },
    attention: null,
  };
}

export function passportRow(input: { booths: number; completed: number; eligible: number; open: boolean }): ActivityRowView {
  const { booths, completed, eligible, open } = input;
  return {
    kind: "Passport",
    detail: booths ? plural(booths, "booth") : null,
    progress: { done: completed, total: eligible, label: `${completed} of ${eligible} cards full` },
    // Only while open: attendees are shown a card that no booth can stamp (D184).
    attention: open && booths === 0 ? "No booths yet" : null,
  };
}

/** The header line: "3 activities · 2 open · 1 needs you", dropping whatever is zero. */
export function listSummary(rows: { open: boolean; attention: string | null }[]): string {
  if (rows.length === 0) return "No activities yet";
  const open = rows.filter((r) => r.open).length;
  const needs = rows.filter((r) => r.attention).length;
  return [plural(rows.length, "activity", "activities"), open ? `${open} open` : null, needs ? `${needs} need${needs === 1 ? "s" : ""} you` : null]
    .filter(Boolean).join(" · ");
}

/**
 * What the delete confirmation warns will go with an activity, in its own kind's terms. One
 * wording for the list's menu and the activity's page, so the two never promise different things.
 */
export function removeWarning(
  input: { kind: "booking"; sessions: number; bookings: number } | { kind: "submission"; submissions: number } | { kind: "passport"; booths: number },
): string {
  // Cascades sessions and bookings (D135): the organiser is cancelling people's afternoons.
  if (input.kind === "booking") return `Its ${plural(input.sessions, "session")} and ${plural(input.bookings, "booking")} go with it. This can't be undone.`;
  if (input.kind === "submission") {
    return `${input.submissions > 0 ? `It takes ${plural(input.submissions, "submission")} and any uploaded files with it. ` : ""}This can't be undone.`;
  }
  // Refused by the database once anyone is stamped (D188), so it says what to do instead.
  const links = input.booths === 1 ? "its scanner link" : "their scanner links";
  return `Its ${plural(input.booths, "booth")} and ${links} go with it. Once anyone has been stamped it can't be deleted, so close it instead.`;
}
