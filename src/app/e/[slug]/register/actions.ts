"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getEventBySlug } from "@/lib/db/events";
import { recordConsent, upsertByEmail } from "@/lib/db/attendees";
import { validateRegistration } from "@/lib/registration";
import { CONSENT_FIELD, consentError } from "@/lib/privacy";
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
  const result = validateRegistration(values, event.registration_questions);
  // Checked alongside the answers, not before them, so one submit reports everything to fix
  // (D410). The browser's `required` asks first; this is what a direct POST meets.
  const consent = consentError(values);
  if (!result.ok || consent) return { errors: { ...(result.ok ? {} : result.errors), ...(consent ? { [CONSENT_FIELD]: consent } : {}) }, values };

  const { attendee } = await upsertByEmail(event, result.data, "registration");
  await recordConsent(attendee.id);
  redirect(`/e/${slug}/register/done?t=${attendee.token}`);
}
