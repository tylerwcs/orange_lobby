import { sessionLabel, type ActivityState } from "@/lib/activities";
import { submitLabel, type SubmitState } from "@/lib/submissions";
import type { Activity } from "@/lib/types";
import { shortDate } from "@/lib/text";

/**
 * What one activity's card on the Activities tab says: a status chip, one line of detail and
 * the button's label. Pure, so every state an attendee can be in has a test rather than a
 * screenshot - the card itself only draws what this returns.
 *
 * The same answers head the activity's own page, so the card and the page never disagree
 * about whether something is booked, full or closed.
 */
export type CardTone = "primary" | "success" | "warning" | "muted";

export type CardView = {
  status: { label: string; tone: CardTone } | null;
  meta: { icon: "calendar" | "pin" | "clock"; text: string } | null;
  action: { label: string; primary: boolean };
};

const view = { label: "View", primary: false };

/** The days something runs, as few words as says it: "Mon 28 Sep", "28 – 30 Sep", "28 Sep – 2 Oct". */
export function dayRange(days: string[]): string | null {
  const sorted = [...new Set(days)].sort();
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return shortDate(sorted[0]);
  // shortDate is "Mon 28 Sep"; the range drops the weekday, which says nothing across days.
  const [, d1, m1] = shortDate(sorted[0]).split(" ");
  const [, d2, m2] = shortDate(sorted[sorted.length - 1]).split(" ");
  return m1 === m2 ? `${d1} – ${d2} ${m2}` : `${d1} ${m1} – ${d2} ${m2}`;
}

export type BookingCardInput = {
  state: Pick<ActivityState, "sessions" | "closed" | "mustPick" | "held">;
  /** A switch or cancel request is waiting for the desk. */
  pending: boolean;
};

export function bookingCard({ state, pending }: BookingCardInput): CardView {
  const { sessions } = state;
  if (sessions.length === 0) return { status: null, meta: { icon: "clock", text: "Sessions coming soon" }, action: view };

  const range = dayRange(sessions.map((s) => s.session.day))!;
  const left = sessions.reduce((n, s) => n + s.left, 0);
  const mine = sessions.find((s) => s.mine);
  const booked = mine
    ? { icon: "calendar" as const, text: [sessionLabel(mine.session), mine.session.location].filter(Boolean).join(" · ") }
    : null;
  const dates = { icon: "calendar" as const, text: range };
  const withSeats = { icon: "calendar" as const, text: `${range} · ${left} seat${left === 1 ? "" : "s"} left` };

  // Order is priority: a waiting request is the thing to know, even over "Booked".
  if (pending) return { status: { label: "Waiting for the desk", tone: "warning" }, meta: booked ?? dates, action: view };
  if (state.held > 0) return { status: { label: "Booked", tone: "success" }, meta: booked, action: view };
  if (state.closed) return { status: { label: "Closed", tone: "muted" }, meta: dates, action: view };
  if (state.mustPick) return { status: { label: "Pick one", tone: "primary" }, meta: withSeats, action: { label: "Choose", primary: true } };
  if (left === 0) return { status: { label: "Full", tone: "muted" }, meta: dates, action: view };
  return { status: null, meta: withSeats, action: { label: "Book", primary: true } };
}

export type FormCardInput = {
  form: Pick<Activity, "starts_on" | "ends_on" | "venue" | "action_label">;
  state: SubmitState;
};

/**
 * A submission activity's card. Its line says when and where, like a booking's - how many the
 * attendee has sent is theirs to see on the page, not something the list needs to shout.
 */
export function formCard({ form, state }: FormCardInput): CardView {
  const dates = form.starts_on ? dayRange([form.starts_on, form.ends_on ?? form.starts_on]) : null;
  const where = [dates, form.venue].filter(Boolean).join(" · ");
  const meta = where ? { icon: dates ? ("calendar" as const) : ("pin" as const), text: where } : null;

  if (state.can) return { status: { label: "Open", tone: "primary" }, meta, action: { label: submitLabel(form), primary: true } };
  if (state.reason === "today") return { status: { label: "Done for today", tone: "success" }, meta, action: view };
  if (state.reason === "limit") return { status: { label: "Submission done", tone: "success" }, meta, action: view };
  return { status: { label: "Closed", tone: "muted" }, meta, action: view };
}
