"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getEventBySlug } from "@/lib/db/events";
import { upsertByEmail } from "@/lib/db/attendees";
import { validateRegistration } from "@/lib/registration";
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
  if (!result.ok) return { errors: result.errors, values };

  // Omit blank phone/company so re-registering never nulls values the masterlist import supplied.
  const { phone, company, ...rest } = result.data;
  const { attendee } = await upsertByEmail(event, { ...rest, ...(phone ? { phone } : {}), ...(company ? { company } : {}) }, "registration");
  redirect(`/e/${slug}/register/done?t=${attendee.token}`);
}
