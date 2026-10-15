"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getEventBySlug } from "@/lib/db/events";
import { recordConsent, recordTermsAgreed, upsertByEmail } from "@/lib/db/attendees";
import { validateRegistration } from "@/lib/registration";
import { registrationErrors } from "@/lib/registration-check";
import { isRichTextEmpty } from "@/lib/rich-text";
import { allow } from "@/lib/ratelimit";

export type RegisterState = { errors?: Record<string, string>; values?: Record<string, string> };

export async function registerAction(slug: string, _prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const event = await getEventBySlug(slug);
  if (!event || event.status === "archived") return { errors: { form: "Registration is not available." } };
  const closed = !event.registration_open || (event.registration_closes_at && new Date(event.registration_closes_at) < new Date());
  if (closed) return { errors: { form: "Registration is closed." } };

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allow(`reg:${event.id}:${ip}`, 10, 60_000)) return { errors: { form: "Too many attempts. Try again in a minute." } };

  const values: Record<string, string> = {};
  formData.forEach((v, k) => { if (typeof v === "string") values[k] = v; });
  // Answers and both ticks checked together, so one submit reports everything to fix (D410).
  // The form runs the same check before it sends (D546); this is what a direct POST meets.
  const hasTerms = !isRichTextEmpty(event.registration_terms);
  const errors = registrationErrors(values, event.registration_form, hasTerms);
  const result = validateRegistration(values, event.registration_questions);
  if (Object.keys(errors).length || !result.ok) return { errors, values };

  const { attendee } = await upsertByEmail(event, result.data, "registration");
  await recordConsent(attendee.id);
  if (hasTerms) await recordTermsAgreed(attendee.id);
  redirect(`/e/${slug}/register/done?t=${attendee.token}`);
}
