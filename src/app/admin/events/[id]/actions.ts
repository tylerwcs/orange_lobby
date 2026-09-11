"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createEvent, requireEvent, updateEvent, setEventStatus } from "@/lib/db/events";
import { slugify } from "@/lib/slug";
import { questionsFromForm } from "@/lib/questions-form";
import type { EventStatus } from "@/lib/types";
import { parseMasterlist, type MasterlistResult } from "@/lib/masterlist";
import { createAttendee, createAttendees, deleteAttendee, listAttendees, updateAttendee, upsertByEmail, getAttendee, purgeAttendeePersonalData, type AttendeeInput } from "@/lib/db/attendees";
import { addField, renameField, removeField, fieldValuesFromForm, adoptValue, eventFields, coerceFieldValue } from "@/lib/attendee-fields";
import { bulkFields, BULK_BUILTIN_KEYS } from "@/lib/columns";
import { parseIds } from "@/lib/bulk";
import type { Attendee, Event } from "@/lib/types";
import { createAgendaItem, deleteAgendaItem } from "@/lib/db/agenda";
import { createAnnouncement, deleteAnnouncement } from "@/lib/db/announcements";
import { createCheckpoint, deleteCheckpoint, listCheckpoints, setCheckpointOrder } from "@/lib/db/checkpoints";
import { recordCheckins } from "@/lib/db/checkins";
import { parseCategories } from "@/lib/agenda";
import { localInputToIso } from "@/lib/time";
import { mergeExtra } from "@/lib/attendee-merge";
import { modulesFromForm } from "@/lib/modules-form";
import type { EventModule } from "@/lib/modules";

const str = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};

/** The map URL is rendered as an href, so only http(s) is stored — never javascript: or data:. */
const httpUrl = (v: string | null) => (v && /^https?:\/\//i.test(v) ? v : null);

export async function createEventAction(formData: FormData) {
  const { orgId } = await requireAdmin();
  const name = str(formData, "name");
  if (!name) redirect("/admin/events?error=Name+is+required");
  const slug = str(formData, "slug") ?? slugify(name);
  const ev = await createEvent(orgId, { name, slug: slugify(slug) });
  redirect(`/admin/events/${ev.id}`);
}

export async function updateSettingsAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  await requireEvent(eventId, orgId);
  let questions;
  try {
    questions = questionsFromForm((k) => { const v = formData.get(k); return typeof v === "string" ? v : null; });
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
    venue_map_url: httpUrl(str(formData, "venue_map_url")),
    contact_name: str(formData, "contact_name"),
    contact_phone: str(formData, "contact_phone"),
    description: str(formData, "description"),
    logo_url: str(formData, "logo_url"),
    banner_url: str(formData, "banner_url"),
    primary_color: str(formData, "primary_color") ?? "#F97316",
    floor_plan_url: str(formData, "floor_plan_url"),
    registration_open: formData.get("registration_open") === "on",
    registration_closes_at: localInputToIso(str(formData, "registration_closes_at")),
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

/** Loads the attendee and confirms it belongs to eventId; redirects to the attendee list otherwise. */
async function requireEventAttendee(eventId: string, attendeeId: string): Promise<Attendee> {
  const a = await getAttendee(attendeeId);
  if (!a || a.event_id !== eventId) redirect(`/admin/events/${eventId}/attendees`);
  return a;
}

export async function importMasterlistAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const file = formData.get("file");
  if (!(file instanceof File)) redirect(`/admin/events/${eventId}/attendees?error=Choose+a+file`);
  let parsed: MasterlistResult | null = null;
  try { parsed = await parseMasterlist(await file.arrayBuffer(), eventFields(ev.registration_questions, ev.attendee_fields)); }
  catch (e) { redirect(`/admin/events/${eventId}/attendees?error=${encodeURIComponent((e as Error).message)}`); }
  if (!parsed) redirect(`/admin/events/${eventId}/attendees?error=Could+not+read+file`);
  // One read of the existing roster instead of a lookup per row; new rows go out in one bulk insert.
  const existingByEmail = new Map((await listAttendees(ev.id)).flatMap((a) => (a.email ? [[a.email.trim().toLowerCase(), a] as const] : [])));
  const queued = new Map<string, AttendeeInput>();
  const toInsert: AttendeeInput[] = [];
  let updated = 0;
  for (const r of parsed.rows) {
    const input: AttendeeInput = { name: r.name, email: r.email, phone: r.phone, company: r.company, category: r.category, table_no: r.table_no, extra: r.extra };
    const key = input.email?.trim().toLowerCase();
    const existing = key ? existingByEmail.get(key) : undefined;
    if (existing) {
      await updateAttendee(existing.id, { ...input, extra: mergeExtra(existing.extra, input.extra) });
      updated++;
      continue;
    }
    const pending = key ? queued.get(key) : undefined;
    if (pending) {
      // A repeated email inside one file folds into the queued row; (event_id, lower(email)) is unique.
      Object.assign(pending, input, { extra: mergeExtra(pending.extra ?? {}, input.extra) });
      updated++;
      continue;
    }
    toInsert.push(input);
    if (key) queued.set(key, input);
  }
  const inserted = await createAttendees(ev, toInsert, "import");
  const skipped = parsed.skipped.map((s) => `row ${s.row}: ${s.reason}`).join("; ");
  revalidatePath(`/admin/events/${eventId}/attendees`);
  redirect(`/admin/events/${eventId}/attendees?imported=${inserted}&updated=${updated}&skipped=${encodeURIComponent(skipped)}`);
}

/**
 * Builds an attendee patch from a form, folding this event's custom columns into `extra`.
 *
 * The posted values are merged onto what is already stored rather than replacing it, so
 * a column the form did not render — including anything an imported masterlist left
 * under its own header — survives the save.
 */
function attendeeInputFrom(ev: Event, formData: FormData, existingExtra: Record<string, string> = {}) {
  const values = fieldValuesFromForm(eventFields(ev.registration_questions, ev.attendee_fields), (k) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : null;
  });
  return {
    name: str(formData, "name") ?? "", email: str(formData, "email"), phone: str(formData, "phone"), company: str(formData, "company"),
    category: str(formData, "category"), table_no: str(formData, "table_no"), extra: mergeExtra(existingExtra, values),
  };
}

export async function addAttendeeAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const input = attendeeInputFrom(ev, formData);
  if (!input.name) redirect(`/admin/events/${eventId}/attendees?error=Name+required`);
  const source = (str(formData, "source") ?? "walkin") as "walkin" | "import";
  const a = input.email ? (await upsertByEmail(ev, { ...input, email: input.email }, source)).attendee : await createAttendee(ev, input, source);
  revalidatePath(`/admin/events/${eventId}/attendees`);
  redirect(`/admin/events/${eventId}/attendees/${a.id}`);
}

export async function updateAttendeeAction(eventId: string, attendeeId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const existing = await requireEventAttendee(eventId, attendeeId);
  const input = attendeeInputFrom(ev, formData, existing.extra);
  if (!input.name) redirect(`/admin/events/${eventId}/attendees/${attendeeId}?error=Name+is+required`);
  await updateAttendee(attendeeId, input);
  revalidatePath(`/admin/events/${eventId}/attendees`);
  redirect(`/admin/events/${eventId}/attendees/${attendeeId}?saved=1`);
}

export async function deleteAttendeeAction(eventId: string, attendeeId: string) {
  const { orgId } = await requireAdmin();
  await requireEvent(eventId, orgId);
  await requireEventAttendee(eventId, attendeeId);
  await deleteAttendee(attendeeId);
  revalidatePath(`/admin/events/${eventId}/attendees`);
  redirect(`/admin/events/${eventId}/attendees`);
}

/**
 * Checks a selection in at one checkpoint, for the desk that registers a group off one
 * clipboard. The checkpoint is validated against this event, so a posted id cannot write
 * a check-in into somebody else's door.
 */
export async function markCheckedInAction(eventId: string, formData: FormData) {
  const { orgId, userId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const checkpointId = String(formData.get("checkpoint_id") ?? "");
  const onEvent = (await listCheckpoints(ev.id)).some((c) => c.id === checkpointId);
  if (!onEvent) redirect(`/admin/events/${ev.id}/attendees?error=Pick+a+checkpoint+first`);
  const allowed = new Set((await listAttendees(ev.id)).map((a) => a.id));
  const ids = parseIds(String(formData.get("ids") ?? ""), allowed);
  await recordCheckins(ev, checkpointId, ids, userId);
  revalidatePath(`/admin/events/${ev.id}/attendees`);
  revalidatePath(`/admin/events/${ev.id}`);
}

/**
 * Sets one column across a selection: a table number for a row of guests, a shirt size
 * for a group, a room for everyone arriving on the same coach. Replaces the old
 * assign-table and clear-table pair — one control that knows which column it is writing
 * to, and what kind of value that column holds.
 *
 * A blank value clears the column. That used to be guarded by refusing blanks entirely,
 * because a stray Enter on an empty box wiped the table; the guard now lives in the
 * confirmation the bar puts in front of a clear, which is the honest place for it.
 */
export async function setColumnAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const attendees = await listAttendees(ev.id);
  const ids = parseIds(String(formData.get("ids") ?? ""), new Set(attendees.map((a) => a.id)));
  if (ids.length === 0) return;

  const key = String(formData.get("column") ?? "");
  const raw = String(formData.get("value") ?? "");
  const field = bulkFields(eventFields(ev.registration_questions, ev.attendee_fields)).find((f) => f.key === key);
  if (!field) return; // a posted key that is not an editable column writes nothing

  const value = coerceFieldValue(field, raw);
  const chosen = new Set(ids);
  for (const a of attendees) {
    if (!chosen.has(a.id)) continue;
    if (BULK_BUILTIN_KEYS.includes(key)) await updateAttendee(a.id, { [key]: value || null });
    else await updateAttendee(a.id, { extra: mergeExtra(a.extra ?? {}, { [key]: value }) });
  }
  revalidatePath(`/admin/events/${ev.id}/attendees`);
}

// ---- Attendee columns ----
//
// The organiser's own columns on the attendee table. Definitions live on the event; the
// values live in each attendee's `extra`, so none of this touches the attendees table.

const columnsBack = (eventId: string) => `/admin/events/${eventId}/attendees`;

export async function addAttendeeFieldAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const result = addField(ev.attendee_fields, {
    label: String(formData.get("label") ?? ""),
    type: String(formData.get("type") ?? "text"),
    options: String(formData.get("options") ?? ""),
  }, ev.registration_questions.map((q) => q.key));
  if (!result.ok) redirect(`${columnsBack(eventId)}?error=${encodeURIComponent(result.error)}`);
  await updateEvent(eventId, { attendee_fields: result.fields });

  // A masterlist header or a registration answer may already hold this fact under another
  // spelling. Claim those, so a new column arrives populated rather than empty beside its
  // own data.
  const field = result.fields[result.fields.length - 1];
  let adopted = 0;
  for (const a of await listAttendees(ev.id)) {
    const next = adoptValue(a.extra ?? {}, field);
    if (!next) continue;
    await updateAttendee(a.id, { extra: next });
    adopted++;
  }

  revalidatePath(columnsBack(eventId));
  redirect(adopted > 0 ? `${columnsBack(eventId)}?adopted=${adopted}&column=${encodeURIComponent(field.label)}` : columnsBack(eventId));
}

export async function renameAttendeeFieldAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const result = renameField(ev.attendee_fields, String(formData.get("key") ?? ""), String(formData.get("label") ?? ""));
  if (!result.ok) redirect(`${columnsBack(eventId)}?error=${encodeURIComponent(result.error)}`);
  await updateEvent(eventId, { attendee_fields: result.fields });
  revalidatePath(columnsBack(eventId));
  redirect(columnsBack(eventId));
}

/** Drops the definition only. Every attendee keeps the value, so re-adding the column restores it. */
export async function deleteAttendeeFieldAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  await updateEvent(eventId, { attendee_fields: removeField(ev.attendee_fields, String(formData.get("key") ?? "")) });
  revalidatePath(columnsBack(eventId));
  redirect(columnsBack(eventId));
}

// ---- Agenda / announcements / info / checkpoints ----

export async function addAgendaItemAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const day = str(formData, "day");
  const starts_at = str(formData, "starts_at");
  const title = str(formData, "title");
  if (!day || !starts_at || !title) redirect(`/admin/events/${eventId}/agenda?error=Day,+start+time+and+title+are+required`);
  await createAgendaItem(ev, {
    day,
    starts_at,
    ends_at: str(formData, "ends_at"),
    title,
    description: str(formData, "description"),
    location: str(formData, "location"),
    categories: parseCategories(str(formData, "categories") ?? ""),
    sort_order: Number(str(formData, "sort_order") ?? 0),
  });
  revalidatePath(`/admin/events/${eventId}/agenda`);
  redirect(`/admin/events/${eventId}/agenda`);
}

export async function deleteAgendaItemAction(eventId: string, itemId: string) {
  const { orgId } = await requireAdmin();
  await requireEvent(eventId, orgId);
  await deleteAgendaItem(itemId, eventId);
  revalidatePath(`/admin/events/${eventId}/agenda`);
}

export async function addAnnouncementAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const title = str(formData, "title");
  const body = str(formData, "body");
  if (!title || !body) redirect(`/admin/events/${eventId}/announcements?error=Title+and+body+required`);
  await createAnnouncement(ev, { title, body, pinned: formData.get("pinned") === "on" });
  revalidatePath(`/admin/events/${eventId}/announcements`);
  redirect(`/admin/events/${eventId}/announcements`);
}

export async function deleteAnnouncementAction(eventId: string, annId: string) {
  const { orgId } = await requireAdmin();
  await requireEvent(eventId, orgId);
  await deleteAnnouncement(annId, eventId);
  revalidatePath(`/admin/events/${eventId}/announcements`);
}

export async function saveInfoPageAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  await requireEvent(eventId, orgId);
  await updateEvent(eventId, { info_page_title: str(formData, "info_page_title") ?? "Info", info_page_html: str(formData, "info_page_html") });
  revalidatePath(`/admin/events/${eventId}/info`);
  redirect(`/admin/events/${eventId}/info?saved=1`);
}

export async function addCheckpointAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const name = str(formData, "name");
  const day = str(formData, "day");
  const back = `/admin/events/${eventId}/settings`;
  if (!name) redirect(`${back}?error=Checkpoint+name+is+required`);
  // A checkpoint names a moment on a date, so the date is not optional — several
  // checkpoints can share one day and the filters need to tell them apart.
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) redirect(`${back}?error=Pick+a+date+for+the+checkpoint`);
  await createCheckpoint(ev, name, day);
  revalidatePath(back);
  revalidatePath(`/admin/events/${eventId}`);
  redirect(`${back}?saved=1`);
}

/**
 * Stores a day's running order from a dragged or keyboard-moved list. The posted ids are
 * filtered against this event's checkpoints on that day, so a stale tab or a tampered
 * payload cannot reorder — or touch — anything it does not own.
 */
export async function reorderCheckpointsAction(eventId: string, day: string, orderedIds: string[]) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const onDay = new Set((await listCheckpoints(ev.id)).filter((c) => c.day === day).map((c) => c.id));
  const ids = orderedIds.filter((id) => onDay.has(id));
  if (ids.length !== onDay.size) return; // a partial list would renumber the rest by accident
  await setCheckpointOrder(ev.id, ids);
  revalidatePath(`/admin/events/${ev.id}/settings`);
  revalidatePath(`/admin/events/${ev.id}`);
}

export async function deleteCheckpointAction(eventId: string, cpId: string) {
  const { orgId } = await requireAdmin();
  await requireEvent(eventId, orgId);
  await deleteCheckpoint(cpId, eventId);
  revalidatePath(`/admin/events/${eventId}/settings`);
  revalidatePath(`/admin/events/${eventId}`);
}

// ---- Archive / purge ----

export async function purgeEventAction(eventId: string) {
  const { orgId } = await requireAdmin(); const ev = await requireEvent(eventId, orgId);
  if (ev.status !== "archived") redirect(`/admin/events/${eventId}/settings?error=Archive+the+event+first`);
  await purgeAttendeePersonalData(eventId);
  revalidatePath(`/admin/events/${eventId}`); redirect(`/admin/events/${eventId}/settings?purged=1`);
}

// ---- Modules ----

export async function updateModulesAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  await requireEvent(eventId, orgId);
  let modules: EventModule[] | undefined;
  try { modules = modulesFromForm((k) => { const v = formData.get(k); return typeof v === "string" ? v : null; }); }
  catch (e) { redirect(`/admin/events/${eventId}/modules?error=${encodeURIComponent((e as Error).message)}`); }
  if (!modules) redirect(`/admin/events/${eventId}/modules?error=Unknown+error`);
  await updateEvent(eventId, { modules });
  revalidatePath(`/admin/events/${eventId}`);
  redirect(`/admin/events/${eventId}/modules?saved=1`);
}
