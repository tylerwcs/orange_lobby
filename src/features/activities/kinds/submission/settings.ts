import { questionsFromForm } from "@/lib/questions-form";
import { FORM_QUESTION_TYPES } from "@/lib/registration";
import { MAX_SUBMISSION_QUESTIONS, readSubmissionDetails, readGroupRule } from "@/lib/submissions";
import { readScoring } from "@/lib/challenge";
import { parseCategories } from "@/lib/agenda";
import { cleanRichText } from "@/lib/rich-text";
import type { NewActivity } from "@/lib/db/activities";
import type { ChallengeScoring, GroupMode } from "@/lib/types";
import { categoryValues, type FormReader } from "../form";

export type SubmissionSettings = Pick<NewActivity, "name" | "description" | "categories" | "max_per_attendee" | "per_day" | "questions" | "starts_on" | "ends_on" | "venue" | "action_label" | "attendee_edit" | "proxy_fields" | "health_data">
  & { group_mode: GroupMode; group_target: number | null; scoring: ChallengeScoring | null };

/**
 * A submission's Setup form and its add form (D420) - everything but `is_open` (owned by the
 * Open switch alone, the same reason `readActivityPolicy` leaves it out) and `required`: a
 * submission carries that column (D178 shares it with booking), but neither form has ever
 * offered a control for it, so it is never read here and stays `false` from creation onward.
 */
export function readSubmissionSettings(form: FormReader): SubmissionSettings {
  const name = form.text("name");
  if (!name) throw new Error("A submission needs a name");
  const details = readSubmissionDetails(form.get);
  const maxRaw = form.text("max_per_attendee");
  let max_per_attendee: number | null = null;
  if (maxRaw) {
    max_per_attendee = Number.parseInt(maxRaw, 10);
    if (!Number.isFinite(max_per_attendee) || max_per_attendee < 1 || max_per_attendee > 366) {
      throw new Error("Submissions per attendee must be a whole number between 1 and 366, or left blank for no limit.");
    }
  }
  const questions = questionsFromForm(form.get, FORM_QUESTION_TYPES, MAX_SUBMISSION_QUESTIONS);
  const group = readGroupRule(form.get);
  // D372: read against the questions in this same post, so the score question can't be one being removed.
  const scoring = readScoring(form.get, questions);
  return {
    name,
    description: cleanRichText(form.text("description")),
    categories: parseCategories(categoryValues(form)),
    // D351: a group form carries no per-person rules - the group's own rule replaces them.
    max_per_attendee: group.group_mode === "off" ? max_per_attendee : null,
    per_day: group.group_mode === "off" ? form.checked("per_day") : false,
    attendee_edit: form.checked("attendee_edit"),
    health_data: form.checked("health_data"),
    // D392: field keys, as ticked. A key no attendee holds a Yes in simply makes nobody a proxy.
    proxy_fields: [...new Set(form.all("proxy_fields").map((v) => v.trim()).filter(Boolean))].slice(0, 10),
    questions,
    ...details,
    ...group,
    scoring,
  };
}

export function newSubmission(settings: SubmissionSettings, isOpen: boolean): NewActivity {
  return { ...settings, kind: "submission", required: false, is_open: isOpen };
}
