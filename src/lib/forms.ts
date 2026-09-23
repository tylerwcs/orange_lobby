import { categoryMatches } from "@/lib/agenda";
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
