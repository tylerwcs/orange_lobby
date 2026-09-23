import { categoryMatches } from "@/lib/agenda";
import { lastDays, daysBetween } from "@/lib/time";
import type { Form, FormSubmission } from "@/lib/types";

/** How many questions a form's editor offers, mirroring `MAX_QUESTIONS` for registration. */
export const MAX_FORM_QUESTIONS = 20;

export type SubmitReason = "ok" | "closed" | "ineligible" | "limit" | "today";
export type SubmitState = { can: boolean; reason: SubmitReason; used: number };

/**
 * Whether this attendee may submit to this form right now, and if not, why.
 *
 * Every reason here has a counterpart returned by the `submit_form` function, deliberately:
 * this decides what the page draws, and the database decides what is allowed (D167). These
 * numbers were true when the page rendered and are stale by definition — the same contract
 * `seatsFor` carries for activities.
 *
 * Order matters. A closed form is reported as closed even when the attendee is also
 * ineligible and also at their cap, because "the desk shut this" is the useful sentence.
 */
export function canSubmit(
  form: Form,
  mine: FormSubmission[],
  category: string | null,
  today: string,
): SubmitState {
  const used = mine.length;
  if (!form.submissions_open) return { can: false, reason: "closed", used };
  if (!categoryMatches(form.categories, category)) return { can: false, reason: "ineligible", used };
  if (form.max_per_attendee !== null && used >= form.max_per_attendee) return { can: false, reason: "limit", used };
  if (form.per_day && mine.some((s) => s.submitted_on === today)) return { can: false, reason: "today", used };
  return { can: true, reason: "ok", used };
}

/**
 * The cap in words, for the card an organiser scans rather than the two raw columns behind it
 * (D171's two independent dials, `per_day` and `max_per_attendee`). "Once" is called out
 * specially from "Up to 1" for the same reason `describePlacement` spells out a count instead
 * of leaving it to arithmetic: a form capped at exactly one submission is a different policy
 * from one merely capped low, and the word should say so.
 */
export function capSummary(form: Pick<Form, "per_day" | "max_per_attendee">): string {
  const total = form.max_per_attendee === null ? "" : form.max_per_attendee === 1 ? "Once" : `Up to ${form.max_per_attendee}`;
  if (form.per_day) return total ? `Once a day, ${total.toLowerCase()}` : "Once a day";
  return total || "Unlimited";
}

/**
 * The people this form still needs an answer from: eligible, and holding nothing.
 *
 * The activities equivalent (`unbookedByActivity`) has no `day` because a booking is a
 * booking whenever it was made. A daily check-in is not: yesterday's answer does not answer
 * for today, so the question is only well-formed once you say which day you mean.
 *
 * `day` null asks "has never submitted", which is the only reading a once-only form has.
 * A non-null `day` asks "did not submit on that day". Which one to pass is the CALLER's
 * decision — the page knows whether the form is per_day, and keeping that choice visible
 * there beats hiding it in a branch here where nobody reads it.
 *
 * Order is the caller's, which is `listAttendees` order — already alphabetical, which is
 * what a list somebody reads down wants. Same reasoning as `unbookedIds`.
 */
export function missingFrom(
  form: Pick<Form, "id" | "categories">,
  submissions: Pick<FormSubmission, "form_id" | "attendee_id" | "submitted_on">[],
  attendeeIds: string[],
  categoryOf: (attendeeId: string) => string | null,
  day: string | null,
): string[] {
  const answered = new Set(
    submissions
      .filter((s) => s.form_id === form.id && (day === null || s.submitted_on === day))
      .map((s) => s.attendee_id),
  );
  return attendeeIds.filter((id) => categoryMatches(form.categories, categoryOf(id)) && !answered.has(id));
}

export type ParticipationDay = { day: string; submitted: boolean };
export type ParticipationRow = {
  attendeeId: string;
  /** One entry per day of the window, oldest first. */
  days: ParticipationDay[];
  /** How many days OF THE WINDOW they submitted on — never more than the window's length. */
  count: number;
  /** Their most recent submission ever, not merely within the window. Null if they never have. */
  lastDay: string | null;
  /** Whole days from `lastDay` to `today`. Null when they have never submitted. */
  daysSince: number | null;
};

/**
 * Who is drifting: each eligible attendee's last `windowDays` as a strip of marks, with the
 * gap since they last submitted at all.
 *
 * The ordering is the feature, not a detail, which is why it lives here under test rather
 * than in the page's JSX. Two rules, and the second is a deliberate departure from "sort by
 * the longest gap":
 *
 *   1. Among people who HAVE submitted, longest gap first — somebody who answered every day
 *      until Tuesday and then stopped is exactly who this screen exists to surface, and an
 *      alphabetical list would bury them.
 *   2. Everyone who has NEVER submitted goes below all of them, in the order given.
 *      Treating "never" as the largest gap is arithmetically tidy and useless in practice:
 *      on a young form almost nobody has started, so the drifter this screen is for would
 *      sit under forty rows of people who simply have not begun — and those people are
 *      already the chasing list (`missingFrom`).
 *
 * `count` is bounded by the window; `daysSince` deliberately is not. Somebody whose last
 * submission predates the window has an empty strip AND a large gap, and both facts are
 * true and worth seeing.
 */
export function participation(
  form: Pick<Form, "id" | "categories">,
  submissions: Pick<FormSubmission, "form_id" | "attendee_id" | "submitted_on">[],
  attendeeIds: string[],
  categoryOf: (attendeeId: string) => string | null,
  today: string,
  windowDays: number,
): ParticipationRow[] {
  const window = lastDays(today, windowDays);
  const mine = submissions.filter((s) => s.form_id === form.id);

  // A Set per attendee, so a form that allows two submissions in one day still marks that
  // day once — the strip answers "did they take part", not "how many times".
  const byAttendee = new Map<string, Set<string>>();
  for (const s of mine) {
    const seen = byAttendee.get(s.attendee_id) ?? new Set<string>();
    seen.add(s.submitted_on);
    byAttendee.set(s.attendee_id, seen);
  }

  const rows = attendeeIds
    .filter((id) => categoryMatches(form.categories, categoryOf(id)))
    .map((attendeeId) => {
      const seen = byAttendee.get(attendeeId) ?? new Set<string>();
      const days = window.map((day) => ({ day, submitted: seen.has(day) }));
      const lastDay = [...seen].sort().at(-1) ?? null;
      return {
        attendeeId,
        days,
        count: days.filter((d) => d.submitted).length,
        lastDay,
        daysSince: lastDay === null ? null : daysBetween(lastDay, today),
      };
    });

  // Stable by construction: `rows` is already in `attendeeIds` order, and Array#sort is
  // stable, so people who have never submitted keep that order among themselves.
  return rows.sort((a, b) => {
    if (a.daysSince === null && b.daysSince === null) return 0;
    if (a.daysSince === null) return 1;
    if (b.daysSince === null) return -1;
    return b.daysSince - a.daysSince;
  });
}
