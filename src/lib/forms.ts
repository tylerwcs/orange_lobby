import { categoryMatches } from "@/lib/agenda";
import type { Form, FormSubmission } from "@/lib/types";

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
