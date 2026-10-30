/**
 * D762: the door survey - a form crew are offered on their scanner right after a check-in at a
 * checkpoint that names one (D761). Pure, so the scanner and its server actions share it.
 */

/** What a scan result says about the door's survey for the person just scanned. Never their answers. */
export type DoorSurveyState = {
  activityId: string;
  /** They already have a live entry, so the card says "Survey done" instead of offering it. */
  done: boolean;
  /** The form asks for health information and they have not agreed yet (D412): the consent box comes first. */
  needsConsent: boolean;
};

/**
 * Someone just checked in, or already in (they may have skipped it last time). Not a booking door's
 * "not booked" until crew let them in, and nothing that isn't an arrival.
 */
export function offersSurvey(status: "ok" | "duplicate" | "notfound" | "error" | "undone" | "not_booked"): boolean {
  return status === "ok" || status === "duplicate";
}

/**
 * Why the door may not take this survey, in crew's words, or null when it may. The door's own
 * form only, for someone checked in at that door: a crew link writes nothing else (D762).
 */
export function doorSurveyRefusal(x: { hasSurvey: boolean; checkedInHere: boolean; cancelled: boolean; activityMatches: boolean }): string | null {
  if (!x.hasSurvey || !x.activityMatches) return "This door has no survey.";
  if (x.cancelled) return "This registration was cancelled.";
  if (!x.checkedInHere) return "Scan them in at this door first.";
  return null;
}

/**
 * D765: a hand scanner types into whatever has focus. A badge scanned while the survey is open
 * lands in the answer being typed; this takes it back out. Only from the end, where it was typed.
 */
export function stripScan(value: string, scanned: string): string {
  return scanned && value.endsWith(scanned) ? value.slice(0, value.length - scanned.length) : value;
}
