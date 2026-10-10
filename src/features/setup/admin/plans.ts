import "server-only";
import type { Event } from "@/lib/types";
import { liveAgenda, type SetupRow } from "../db";
import { agendaErrors, agendaProblems, sanitizeAgenda, type AgendaAnswers } from "../sections/agenda";
import { agendaBaseline, planAgenda, type AgendaPlan } from "../sections/agenda-apply";

const DATES_HINT = "If the organiser changed the event dates, apply Event basics first.";

/** A counter for the review's plan: its new rows are never written, so their ids only need to be distinct. */
export function previewIds(): () => string {
  let n = 0;
  return () => `preview-${++n}`;
}

/**
 * The agenda plan and every reason to refuse it. The review shows exactly this and Apply runs
 * exactly this (D449). Days are checked against the live event (D457).
 */
export async function agendaReview(ev: Event, row: SetupRow, newId: () => string): Promise<{ submitted: AgendaAnswers; plan: AgendaPlan; problems: string[] }> {
  const submitted = sanitizeAgenda(row.submitted);
  const plan = planAgenda({ submitted, baseline: agendaBaseline(row), map: row.applied_map ?? {}, live: await liveAgenda(ev.id), newId });
  const range = { first: ev.starts_on, last: ev.ends_on };
  const outside = Object.values(agendaErrors(submitted, range)).some((m) => m.startsWith("Outside the event dates"));
  return { submitted, plan, problems: [...agendaProblems(submitted, range), ...(outside ? [DATES_HINT] : []), ...plan.problems] };
}
