import { sessionLabel, type ActivityState } from "./activities";
import { submitLabel, type SubmitState } from "./submissions";
import type { Activity } from "@/lib/types";
import type { Passport } from "./booths";
import { shortDate } from "@/lib/text";
import type { Lang } from "@/features/language/client";
import { t } from "@/features/language/client";
import { opensLabel } from "./schedule";
import { ordinal } from "@/features/tournaments/client";

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
  /** What tapping does. Null on a Coming soon card, which is not a link (D604). */
  action: { label: string; primary: boolean } | null;
};

const view = { label: "View", primary: false };

/** The days something runs, as few words as says it: "Mon 28 Sep", "28 – 30 Sep", "28 Sep – 2 Oct". */
export function dayRange(days: string[], lang: Lang = "en"): string | null {
  const sorted = [...new Set(days)].sort();
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return shortDate(sorted[0], lang);
  // shortDate is "Mon 28 Sep"; the range drops the weekday, which says nothing across days.
  const [, d1, m1] = shortDate(sorted[0], lang).split(" ");
  const [, d2, m2] = shortDate(sorted[sorted.length - 1], lang).split(" ");
  return m1 === m2 ? `${d1} – ${d2} ${m2}` : `${d1} ${m1} – ${d2} ${m2}`;
}

export type BookingCardInput = {
  state: Pick<ActivityState, "sessions" | "closed" | "mustPick" | "held">;
  /** A switch or cancel request is waiting for the desk. */
  pending: boolean;
  /** Every held session has an arrival at its door (D334). */
  checkedIn: boolean;
};

export function bookingCard({ state, pending, checkedIn }: BookingCardInput, lang: Lang = "en"): CardView {
  const { sessions } = state;
  const d = t(lang).cards;
  const view = { label: t(lang).common.view, primary: false };
  if (sessions.length === 0) return { status: null, meta: { icon: "clock", text: d.sessionsSoon }, action: view };

  const range = dayRange(sessions.map((s) => s.session.day), lang)!;
  const left = sessions.reduce((n, s) => n + s.left, 0);
  const mine = sessions.find((s) => s.mine);
  const booked = mine
    ? { icon: "calendar" as const, text: [sessionLabel(mine.session, { lang }), mine.session.location].filter(Boolean).join(" · ") }
    : null;
  const dates = { icon: "calendar" as const, text: range };
  const withSeats = { icon: "calendar" as const, text: d.seatsLeft(range, left) };

  // Attended outranks a waiting request: once they have been, the request is moot (D334).
  if (checkedIn && state.held > 0) return { status: { label: d.checkedIn, tone: "success" }, meta: booked, action: view };
  // Order is priority: a waiting request is the thing to know, even over "Booked".
  if (pending) return { status: { label: d.waiting, tone: "warning" }, meta: booked ?? dates, action: view };
  if (state.held > 0) return { status: { label: d.booked, tone: "success" }, meta: booked, action: view };
  if (state.closed) return { status: { label: d.closed, tone: "muted" }, meta: dates, action: view };
  if (state.mustPick) return { status: { label: d.pickOne, tone: "primary" }, meta: withSeats, action: { label: d.choose, primary: true } };
  if (left === 0) return { status: { label: d.full, tone: "muted" }, meta: dates, action: view };
  return { status: null, meta: withSeats, action: { label: d.book, primary: true } };
}

export type FormCardInput = {
  form: Pick<Activity, "starts_on" | "ends_on" | "venue" | "action_label">;
  state: SubmitState;
};

/**
 * A submission activity's card. Its line says when and where, like a booking's - how many the
 * attendee has sent is theirs to see on the page, not something the list needs to shout.
 */
export function formCard({ form, state }: FormCardInput, lang: Lang = "en"): CardView {
  const d = t(lang).cards;
  const view = { label: t(lang).common.view, primary: false };
  const dates = form.starts_on ? dayRange([form.starts_on, form.ends_on ?? form.starts_on], lang) : null;
  const where = [dates, form.venue].filter(Boolean).join(" · ");
  const meta = where ? { icon: dates ? ("calendar" as const) : ("pin" as const), text: where } : null;

  if (state.can) return { status: { label: d.open, tone: "primary" }, meta, action: { label: submitLabel(form, lang), primary: true } };
  if (state.reason === "today") return { status: { label: d.doneToday, tone: "success" }, meta, action: view };
  if (state.reason === "limit") return { status: { label: d.submissionDone, tone: "success" }, meta, action: view };
  // A group form's own reasons (F1): a finished group reads like any other finished cap, and an
  // ungrouped attendee is told what to do about it rather than being told the form is shut.
  if (state.reason === "groupdone") return { status: { label: d.groupDone, tone: "success" }, meta, action: view };
  if (state.reason === "nogroup") return { status: { label: d.needsGroup, tone: "muted" }, meta, action: view };
  // D725: a track pair's card is open, just not to this person - "Closed" would read as shut for everyone.
  if (state.reason === "notrack") return { status: { label: d.noTrack, tone: "muted" }, meta, action: view };
  if (state.reason === "othertrack") return { status: { label: d.otherTrack, tone: "muted" }, meta, action: view };
  if (state.reason === "trackfull") return { status: { label: d.fullToday, tone: "muted" }, meta, action: view };
  // D390: a challenge before its first day is not over, it is coming - "Closed" read as the end.
  if (state.startsOn) return { status: { label: d.starts(shortDate(state.startsOn, lang).split(" ").slice(1).join(" ")), tone: "muted" }, meta, action: view };
  return { status: { label: d.closed, tone: "muted" }, meta, action: view };
}

export type PassportCardInput = {
  passport: Pick<Passport, "cells" | "collected" | "target" | "complete">;
  /** The activity's open flag: whether booths may stamp into it right now (D184). */
  open: boolean;
};

/**
 * A Booth Passport's card. Its line is how many stands there are, because that is what tells
 * an attendee whether it is worth a walk; the chip is how far along they are.
 *
 * Complete is checked before closed: a card filled before the organiser closed stamping is
 * still a full card, and the prize is still theirs.
 */
export function passportCard({ passport, open }: PassportCardInput): CardView {
  const n = passport.cells.length;
  if (n === 0) return { status: null, meta: { icon: "pin", text: "Booths coming soon" }, action: view };
  const meta = { icon: "pin" as const, text: `${n} booth${n === 1 ? "" : "s"} to visit` };
  if (passport.complete) return { status: { label: "Complete", tone: "success" }, meta, action: view };
  if (!open) return { status: { label: "Opens soon", tone: "muted" }, meta, action: view };
  return {
    status: { label: `${passport.collected} of ${passport.target} stamps`, tone: "primary" },
    meta,
    action: { label: "Open card", primary: true },
  };
}

/**
 * A polaroid wall's card (D481): the camera is the action, and nothing else. It used to carry
 * "N on the wall" as its status; the attendee's own posts are in the camera page's drawer.
 */
export function polaroidCard(): CardView {
  return { status: null, meta: null, action: { label: "Join Now", primary: true } };
}

/**
 * A tournament's card (D647). A picker sees how many of their group's squads are ready; anyone
 * else sees what they're playing. Once squads lock, everyone sees that, and the page is to look at.
 */
export function tournamentCard(input: {
  role: "picker" | "member"; ready: number; sports: number; playing: number; locked: boolean;
  /** D663: once any result is in - the group's overall place when attendees may see it, else null. */
  results?: { overall: { rank: number; tied: boolean; total: number } | null; any: boolean };
}): CardView {
  const look = { label: "View squads", primary: false };
  if (input.results?.any) {
    const o = input.results.overall;
    const label = o ? `Your group: ${ordinal(o.rank)}${o.tied ? "=" : ""} overall · ${o.total} pts` : "Results are in";
    return { status: { label, tone: "primary" }, meta: null, action: { label: "View results", primary: false } };
  }
  if (input.locked) return { status: { label: "Squads locked", tone: "muted" }, meta: null, action: look };
  if (input.role === "picker") {
    const status = input.sports > 0 && input.ready >= input.sports
      ? { label: "All squads ready ✓", tone: "success" as const }
      : { label: `${input.ready} of ${input.sports} sports ready`, tone: "primary" as const };
    return { status, meta: null, action: { label: "Pick squads", primary: true } };
  }
  if (input.playing === 0) return { status: { label: "Not playing yet", tone: "muted" }, meta: null, action: look };
  return { status: { label: `You're playing ${input.playing} sport${input.playing === 1 ? "" : "s"}`, tone: "success" }, meta: null, action: look };
}

/**
 * A scheduled activity's card before it opens (D604): when it opens, and nothing to press -
 * the card is not a link, because nothing on its page is open yet. Every kind uses this one.
 */
export function comingSoonCard(opensAt: string, lang: Lang = "en"): CardView {
  const d = t(lang).cards;
  return { status: { label: d.comingSoon, tone: "muted" }, meta: { icon: "clock", text: d.opens(opensLabel(opensAt, lang)) }, action: null };
}
