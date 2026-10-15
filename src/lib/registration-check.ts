import type { RegistrationQuestion } from "@/lib/types";
import { validateRegistration } from "@/lib/registration";
import { answerQuestions } from "@/lib/registration-standard";
import { CONSENT_FIELD, consentError, TERMS_FIELD, termsError } from "@/lib/privacy";

/**
 * D546: everything a Register press still needs, keyed by field: the answers, the event terms'
 * tick (D541) and the Privacy Notice's (D410). The form runs it before it sends anything, so
 * the invitee is told at once; the server action runs the same function, so a direct POST meets
 * the same rules.
 *
 * `form` is the whole form, name and email included (`Event.registration_form`).
 */
export function registrationErrors(values: Record<string, string>, form: RegistrationQuestion[], hasTerms: boolean): Record<string, string> {
  const result = validateRegistration(values, answerQuestions(form));
  const consent = consentError(values);
  const terms = termsError(values, hasTerms);
  return {
    ...(result.ok ? {} : result.errors),
    ...(terms ? { [TERMS_FIELD]: terms } : {}),
    ...(consent ? { [CONSENT_FIELD]: consent } : {}),
  };
}

/** The problems in the order the form shows their fields: the questions, the terms, then consent. */
export function problemsInFormOrder(errors: Record<string, string>, form: RegistrationQuestion[]): { key: string; message: string }[] {
  return [...form.map((q) => q.key), TERMS_FIELD, CONSENT_FIELD]
    .filter((k) => errors[k])
    .map((k) => ({ key: k, message: errors[k] }));
}
