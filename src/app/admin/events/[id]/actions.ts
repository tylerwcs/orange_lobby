"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createEvent, requireEvent, updateEvent, setEventStatus } from "@/lib/db/events";
import { slugify } from "@/lib/slug";
import { parseQuestions } from "@/lib/registration";
import type { EventStatus } from "@/lib/types";
import { parseMasterlist, type MasterlistResult } from "@/lib/masterlist";
import { createAttendee, deleteAttendee, regenerateToken, updateAttendee, upsertByEmail, getAttendee, type AttendeeInput } from "@/lib/db/attendees";

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

// --- Attendees: masterlist import + admin CRUD ---

export async function importMasterlistAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const file = formData.get("file");
  if (!(file instanceof File)) redirect(`/admin/events/${eventId}/attendees/import?error=Choose+a+file`);
  let parsed: MasterlistResult | null = null;
  try { parsed = await parseMasterlist(await file.arrayBuffer()); }
  catch (e) { redirect(`/admin/events/${eventId}/attendees/import?error=${encodeURIComponent((e as Error).message)}`); }
  if (!parsed) redirect(`/admin/events/${eventId}/attendees/import?error=Could+not+read+file`);
  let inserted = 0, updated = 0;
  for (const r of parsed.rows) {
    const input: AttendeeInput = { name: r.name, email: r.email, phone: r.phone, company: r.company, category: r.category, table_no: r.table_no, seat_no: r.seat_no, extra: r.extra };
    if (input.email) {
      const res = await upsertByEmail(ev, { ...input, email: input.email }, "import");
      if (res.created) inserted++; else updated++;
    } else { await createAttendee(ev, input, "import"); inserted++; }
  }
  const skipped = parsed.skipped.map((s) => `row ${s.row}: ${s.reason}`).join("; ");
  revalidatePath(`/admin/events/${eventId}/attendees`);
  redirect(`/admin/events/${eventId}/attendees?imported=${inserted}&updated=${updated}&skipped=${encodeURIComponent(skipped)}`);
}

function attendeeInputFrom(formData: FormData) {
  const extraRaw = str(formData, "extra") ?? "{}";
  let extra: Record<string, string> = {};
  try { extra = JSON.parse(extraRaw); } catch { /* ignore, keep {} */ }
  return {
    name: str(formData, "name") ?? "", email: str(formData, "email"), phone: str(formData, "phone"), company: str(formData, "company"),
    category: str(formData, "category"), table_no: str(formData, "table_no"), seat_no: str(formData, "seat_no"), extra,
  };
}

export async function addAttendeeAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const input = attendeeInputFrom(formData);
  if (!input.name) redirect(`/admin/events/${eventId}/attendees?error=Name+required`);
  const source = (str(formData, "source") ?? "walkin") as "walkin" | "import";
  const a = input.email ? (await upsertByEmail(ev, { ...input, email: input.email }, source)).attendee : await createAttendee(ev, input, source);
  revalidatePath(`/admin/events/${eventId}/attendees`);
  redirect(`/admin/events/${eventId}/attendees/${a.id}`);
}

export async function updateAttendeeAction(eventId: string, attendeeId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  await requireEvent(eventId, orgId);
  const a = await getAttendee(attendeeId);
  if (!a || a.event_id !== eventId) redirect(`/admin/events/${eventId}/attendees`);
  await updateAttendee(attendeeId, attendeeInputFrom(formData));
  revalidatePath(`/admin/events/${eventId}/attendees`);
  redirect(`/admin/events/${eventId}/attendees/${attendeeId}?saved=1`);
}

export async function regenerateTokenAction(eventId: string, attendeeId: string) {
  const { orgId } = await requireAdmin();
  await requireEvent(eventId, orgId);
  await regenerateToken(attendeeId);
  revalidatePath(`/admin/events/${eventId}/attendees/${attendeeId}`);
}

export async function deleteAttendeeAction(eventId: string, attendeeId: string) {
  const { orgId } = await requireAdmin();
  await requireEvent(eventId, orgId);
  await deleteAttendee(attendeeId);
  revalidatePath(`/admin/events/${eventId}/attendees`);
  redirect(`/admin/events/${eventId}/attendees`);
}
