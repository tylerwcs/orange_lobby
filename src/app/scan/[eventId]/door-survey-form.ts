import "server-only";
import { getActivity } from "@/features/activities";
import { sanitizeHtml } from "@/lib/sanitize";
import { toRichHtml } from "@/lib/rich-text";
import type { Checkpoint } from "@/lib/types";
import type { DoorSurveyForm } from "./DoorSurvey";

/**
 * D763: the door's survey as the scanner draws it, for both its pages (an admin's and a crew
 * link's). The form only - its questions and wording - never anyone's answers. Undefined at a door
 * with none, or once its form is gone or no longer a form.
 */
export async function loadDoorSurvey(checkpoint: Checkpoint): Promise<DoorSurveyForm | undefined> {
  if (!checkpoint.survey_activity_id) return undefined;
  const form = await getActivity(checkpoint.survey_activity_id, checkpoint.event_id);
  if (!form || form.kind !== "submission") return undefined;
  return { id: form.id, name: form.name, descriptionHtml: sanitizeHtml(toRichHtml(form.description)), questions: form.questions, health_data: form.health_data };
}
