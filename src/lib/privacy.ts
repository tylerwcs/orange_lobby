/**
 * The Privacy Notice's "last updated" date. Shown at the top of /privacy and stored on each
 * attendee as `consent_notice` when they agree (D410), so change it whenever the notice's
 * substance changes: anyone who agreed to an older text can then be told apart.
 */
export const PRIVACY_UPDATED = "24 September 2026";

/** Who an attendee writes to about their data: the notice's contact, and the portal's consent screen's. */
export const PRIVACY_CONTACT = "admin@ecopiaevents.com";

/** Where the Privacy Notice lives, and its Bahasa Malaysia text (D411). */
export const PRIVACY_PATH = "/privacy";
export const PRIVACY_MS_PATH = "/privacy/ms";

/**
 * The registration form's consent tick. Named so no organiser-made question key can plausibly
 * take it: it rides the same FormData as the answers.
 */
export const CONSENT_FIELD = "privacy_consent";

/** The registration form's consent check: the tick must be there, and only the form sends it. */
export function consentError(input: Record<string, string>): string | null {
  return input[CONSENT_FIELD] === "yes" ? null : "Tick the box to agree to the Privacy Notice before registering.";
}

/**
 * D541: the event's own terms get a tick of their own beside the Privacy Notice's. They are the
 * client's conditions, not our data notice, so agreeing to one is never read as agreeing to both.
 */
export const TERMS_FIELD = "event_terms_consent";

/** The terms tick's check, asked only when the event has terms. */
export function termsError(input: Record<string, string>, hasTerms: boolean): string | null {
  return !hasTerms || input[TERMS_FIELD] === "yes" ? null : "Tick the box to agree to the event terms before registering.";
}

/**
 * D412: the separate, explicit consent a health-data activity asks for before an attendee's
 * first entry. A colon, like the submit form's `:for`, so no question key can be it.
 */
export const HEALTH_CONSENT_FIELD = ":health_consent";

export const HEALTH_CONSENT_REFUSED = "Tick the box to agree to your health information being collected before you submit.";

/** Whether a posted form carries the health-data tick. Only the checkbox sends "yes". */
export function healthConsentTicked(fd: Pick<FormData, "get">): boolean {
  return fd.get(HEALTH_CONSENT_FIELD) === "yes";
}
