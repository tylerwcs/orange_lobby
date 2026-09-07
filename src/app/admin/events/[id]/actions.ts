"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createEvent, requireEvent, updateEvent, setEventStatus } from "@/lib/db/events";
import { slugify } from "@/lib/slug";
import { parseQuestions } from "@/lib/registration";
import type { EventStatus } from "@/lib/types";

const str = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};

export async function createEventAction(formData: FormData) {
  const { orgId } = await requireAdmin();
  const name = str(formData, "name");
  if (!name) redirect("/admin/events/new?error=Name+is+required");
  const slug = str(formData, "slug") ?? slugify(name);
  const ev = await createEvent(orgId, { name, slug: slugify(slug) });
  redirect(`/admin/events/${ev.id}`);
}

export async function updateSettingsAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  await requireEvent(eventId, orgId);
  let questions;
  try {
    questions = parseQuestions(str(formData, "registration_questions") ?? "[]");
  } catch (e) {
    redirect(`/admin/events/${eventId}/settings?error=${encodeURIComponent((e as Error).message)}`);
  }
  const extras = (str(formData, "scan_extra_fields") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 2);
  await updateEvent(eventId, {
    name: str(formData, "name") ?? undefined,
    starts_on: str(formData, "starts_on"),
    ends_on: str(formData, "ends_on"),
    venue_name: str(formData, "venue_name"),
    venue_address: str(formData, "venue_address"),
    venue_map_url: str(formData, "venue_map_url"),
    contact_name: str(formData, "contact_name"),
    contact_phone: str(formData, "contact_phone"),
    description: str(formData, "description"),
    logo_url: str(formData, "logo_url"),
    banner_url: str(formData, "banner_url"),
    primary_color: str(formData, "primary_color") ?? "#F97316",
    floor_plan_url: str(formData, "floor_plan_url"),
    registration_open: formData.get("registration_open") === "on",
    registration_closes_at: str(formData, "registration_closes_at"),
    registration_questions: questions,
    scan_extra_fields: extras,
  });
  revalidatePath(`/admin/events/${eventId}`);
  redirect(`/admin/events/${eventId}/settings?saved=1`);
}

export async function setStatusAction(eventId: string, status: EventStatus) {
  const { orgId } = await requireAdmin();
  await requireEvent(eventId, orgId);
  await setEventStatus(eventId, status);
  revalidatePath(`/admin/events/${eventId}`);
}
