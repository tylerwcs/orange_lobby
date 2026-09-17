"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createEvent, requireEvent, updateEvent, setEventStatus, rotateCrewToken } from "@/lib/db/events";
import { slugify } from "@/lib/slug";
import { questionsFromForm } from "@/lib/questions-form";
import type { EventStatus } from "@/lib/types";
import { parseMasterlist, type MasterlistResult } from "@/lib/masterlist";
import { createAttendee, createAttendees, deleteAttendee, listAttendees, updateAttendee, upsertByEmail, getAttendee, purgeAttendeePersonalData, type AttendeeInput } from "@/lib/db/attendees";
import { addField, renameField, removeField, fieldValuesFromForm, adoptValue, eventFields, coerceFieldValue } from "@/lib/attendee-fields";
import { bulkFields, BULK_BUILTIN_KEYS } from "@/lib/columns";
import { parseIds } from "@/lib/bulk";
import type { Attendee, Event } from "@/lib/types";
import { createAgendaItem, deleteAgendaItem, listAgenda, updateAgendaItem } from "@/lib/db/agenda";
import { breakoutSlots, matchAssignments, breakoutSlotFromColumn, parseRoomCodes, splitByExisting, describeAssignment } from "@/lib/breakouts";
import { assignMany, unassign, renameSlotAssignments, listAssignments } from "@/lib/db/breakouts";
import { createAnnouncement, deleteAnnouncement } from "@/lib/db/announcements";
import { createCheckpoint, deleteCheckpoint, listCheckpoints, setCheckpointOrder } from "@/lib/db/checkpoints";
import { recordCheckins } from "@/lib/db/checkins";
import { categoriesFromValues } from "@/lib/agenda";
import { parseAgendaColour } from "@/lib/agenda-colours";
import { localInputToIso } from "@/lib/time";
import { mergeExtra } from "@/lib/attendee-merge";
import { moduleFromForm, upsertModule, removeModule, reorderModules } from "@/lib/modules-form";
import { addPin, removePin, reorderPins } from "@/lib/pinned-fields";
import { flashPath } from "@/lib/flash";
import { normalizeModules, floorPlanUrl, type EventModule } from "@/lib/modules";
import { uploadEventImage, deleteEventImage } from "@/lib/db/media";
import type { ImageKind } from "@/lib/storage";
import { scanFieldsFromForm } from "@/lib/scan";

const str = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};

/** The map URL is rendered as an href, so only http(s) is stored — never javascript: or data:. */
const httpUrl = (v: string | null) => (v && /^https?:\/\//i.test(v) ? v : null);

/**
 * What one image field on a saved form means: the URL the column should hold, and the
 * object the save leaves behind once it lands.
 *
 * Three cases, and the third is the one worth naming: a form that posts an untouched file
 * input is saying nothing about that image, so the stored URL survives. Without this the
 * Settings save — which writes every column every time — would blank the logo of any event
 * whose owner only came to change the venue.
 *
 * `stale` is handed back rather than deleted here because the order matters. Nothing is
 * removed from the bucket until the row naming it has actually been written: a save that
 * fails after the upload must leave the event showing the image it showed before, not a
 * URL whose object we already threw away.
 */
type ImageChange = { url: string | null; stale: string | null };

async function nextImage(
  formData: FormData,
  name: string,
  current: string | null,
  where: { orgId: string; eventId: string; kind: ImageKind },
): Promise<ImageChange> {
  const file = formData.get(name);
  if (file instanceof File && file.size > 0) {
    return { url: await uploadEventImage({ ...where, file }), stale: current };
  }
  if (formData.get(`${name}_remove`) === "on") return { url: null, stale: current };
  return { url: current, stale: null };
}

export async function createEventAction(formData: FormData) {
  const { orgId } = await requireAdmin();
  const name = str(formData, "name");
  if (!name) redirect(flashPath("/admin/events", "An event needs a name.", "error"));
  const slug = str(formData, "slug") ?? slugify(name);
  const ev = await createEvent(orgId, { name, slug: slugify(slug) });
  redirect(`/admin/events/${ev.id}`);
}

export async function updateSettingsAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  let questions;
  try {
    questions = questionsFromForm((k) => { const v = formData.get(k); return typeof v === "string" ? v : null; });
  } catch (e) {
    redirect(flashPath(`/admin/events/${eventId}/settings`, (e as Error).message, "error"));
  }
  // The images go up before anything is written: a file we will not take must leave the
  // whole save unapplied rather than half of it.
  let logo: ImageChange = { url: ev.logo_url, stale: null };
  let banner: ImageChange = { url: ev.banner_url, stale: null };
  try {
    logo = await nextImage(formData, "logo", ev.logo_url, { orgId, eventId, kind: "logo" });
    banner = await nextImage(formData, "banner", ev.banner_url, { orgId, eventId, kind: "banner" });
  } catch (e) {
    redirect(flashPath(`/admin/events/${eventId}/settings`, (e as Error).message, "error"));
  }
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
    logo_url: logo.url,
    banner_url: banner.url,
    primary_color: str(formData, "primary_color") ?? "#F97316",
    registration_open: formData.get("registration_open") === "on",
    registration_closes_at: localInputToIso(str(formData, "registration_closes_at")),
    registration_questions: questions,
  });
  await deleteEventImage(logo.stale);
  await deleteEventImage(banner.stale);
  revalidatePath(`/admin/events/${eventId}`);
  redirect(flashPath(`/admin/events/${eventId}/settings`, "Settings saved."));
}

/**
 * The scan card's fields, saved from the Checkpoints tab. Its own action because that tab
 * sits outside the one big settings form — see the SaveBar comment in settings/page.tsx.
 */
export async function updateScanFieldsAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const fields = eventFields(ev.registration_questions, ev.attendee_fields);
  await updateEvent(eventId, { scan_extra_fields: scanFieldsFromForm(formData.getAll("scan_extra_fields").map(String), fields) });
  const path = `/admin/events/${eventId}/settings`;
  revalidatePath(path);
  redirect(flashPath(path, "Scan card updated."));
}

export async function setStatusAction(eventId: string, status: EventStatus) {
  const { orgId } = await requireAdmin();
  await requireEvent(eventId, orgId);
  await setEventStatus(eventId, status);
  revalidatePath(`/admin/events/${eventId}`);
}

/**
 * Mints the crew link, and replaces it. Same button either way: an organiser who has never made
 * one and an organiser whose link has leaked want the same thing, which is a link that works and
 * that nobody else has (D108).
 */
export async function rotateCrewTokenAction(eventId: string) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  await rotateCrewToken(ev.id);
  const path = `/admin/events/${eventId}/settings`;
  revalidatePath(path);
  redirect(flashPath(path, "New crew link ready. The old one has stopped working."));
}

// --- Attendees: masterlist import + admin CRUD ---

/** Loads the attendee and confirms it belongs to eventId; redirects to the attendee list otherwise. */
async function requireEventAttendee(eventId: string, attendeeId: string): Promise<Attendee> {
  const a = await getAttendee(attendeeId);
  if (!a || a.event_id !== eventId) redirect(`/admin/events/${eventId}/attendees`);
  return a;
}

/**
 * Places people into breakout rooms from the column the client's spreadsheet already carries,
 * for one round or for every round the event has.
 *
 * The import runs this for every round, add-only. That reverses half of D83, which kept it out
 * of the import because the masterlist is usually loaded before the agenda exists and an
 * automatic pass would then assign nobody, silently. Two things make it safe now: it reports
 * what it did, so a pass that placed nobody says so; and it never moves anyone who already has
 * a room, so a re-import on the morning of day 2 cannot undo the desk's moves at breakfast.
 * Overwriting is still a deliberate, separate act — the tick on Assign from column.
 *
 * `existing` is read BEFORE the write so "already had a room" is computed from data we hold
 * rather than inferred from what an ignoreDuplicates upsert reports having written.
 */
async function assignRoundsFromColumns(ev: Event, only: string | null, overwrite: boolean, overwriteHint?: string): Promise<string[]> {
  const rounds = breakoutSlots(await listAgenda(ev.id)).filter((s) => only === null || s.slot === only);
  if (rounds.length === 0) return [];
  const [attendees, existing] = await Promise.all([listAttendees(ev.id), listAssignments(ev.id)]);
  const lines: string[] = [];
  for (const slot of rounds) {
    const report = matchAssignments(attendees, slot);
    const { fresh, unchanged, conflicting } = splitByExisting(report.matched, existing);
    // Overwrite sends the disagreements back too, because moving those people is the point
    // of ticking it; the ones already in the right room are a no-op either way.
    const rows = overwrite ? [...fresh, ...conflicting] : fresh;
    if (rows.length > 0) await assignMany(ev.id, rows, overwrite);
    const line = describeAssignment(slot.slot, {
      fresh: rows.length,
      unchanged: unchanged.length,
      conflicting: overwrite ? 0 : conflicting.length,
      report,
    }, overwriteHint);
    if (line) lines.push(line);
  }
  return lines;
}

export async function importMasterlistAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const file = formData.get("file");
  if (!(file instanceof File)) redirect(flashPath(`/admin/events/${eventId}/attendees`, "Choose a file first.", "error"));
  let parsed: MasterlistResult | null = null;
  try { parsed = await parseMasterlist(await file.arrayBuffer(), eventFields(ev.registration_questions, ev.attendee_fields)); }
  catch (e) { redirect(flashPath(`/admin/events/${eventId}/attendees`, (e as Error).message, "error")); }
  if (!parsed) redirect(flashPath(`/admin/events/${eventId}/attendees`, "Could not read that file.", "error"));
  // One read of the existing roster instead of a lookup per row; new rows go out in one bulk insert.
  const existingByEmail = new Map((await listAttendees(ev.id)).flatMap((a) => (a.email ? [[a.email.trim().toLowerCase(), a] as const] : [])));
  const queued = new Map<string, AttendeeInput>();
  const toInsert: AttendeeInput[] = [];
  let updated = 0;
  for (const r of parsed.rows) {
    const input: AttendeeInput = { name: r.name, email: r.email, category: r.category, extra: r.extra };
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
  // After the rows exist, not before: an assignment needs the attendee it belongs to.
  const assigned = await assignRoundsFromColumns(ev, null, false);
  const skipped = parsed.skipped.map((s) => `row ${s.row}: ${s.reason}`).join("; ");
  const problems = parsed.skipped.length > 0 || assigned.some((l) => l.includes("No room matches"));
  revalidatePath(`/admin/events/${eventId}/attendees`);
  revalidatePath(`/admin/events/${eventId}/agenda`);
  redirect(flashPath(
    `/admin/events/${eventId}/attendees`,
    [`Imported ${inserted}, updated ${updated}.`, ...assigned, skipped ? `Skipped — ${skipped}` : ""].filter(Boolean).join(" "),
    problems ? "error" : "ok",
  ));
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
  // phone, company and table_no are no longer written here — they arrive in `values` as
  // ordinary fields, in `extra`. Nothing writes the legacy columns any more.
  return {
    name: str(formData, "name") ?? "", email: str(formData, "email"),
    category: str(formData, "category"), extra: mergeExtra(existingExtra, values),
  };
}

export async function addAttendeeAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const input = attendeeInputFrom(ev, formData);
  if (!input.name) redirect(flashPath(`/admin/events/${eventId}/attendees`, "An attendee needs a name.", "error"));
  const source = (str(formData, "source") ?? "walkin") as "walkin" | "import";
  const a = input.email ? (await upsertByEmail(ev, { ...input, email: input.email }, source)).attendee : await createAttendee(ev, input, source);
  revalidatePath(`/admin/events/${eventId}/attendees`);
  redirect(flashPath(`/admin/events/${eventId}/attendees?attendee=${a.id}`, `Added ${a.name}.`));
}

export async function updateAttendeeAction(eventId: string, attendeeId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const existing = await requireEventAttendee(eventId, attendeeId);
  const input = attendeeInputFrom(ev, formData, existing.extra);
  // Back to the panel the edit was made in, not a page of its own - there is no longer a
  // standalone attendee route to land on.
  if (!input.name) redirect(flashPath(`/admin/events/${eventId}/attendees?attendee=${attendeeId}`, "An attendee needs a name.", "error"));
  await updateAttendee(attendeeId, input);
  revalidatePath(`/admin/events/${eventId}/attendees`);
  // Back to the list rather than to the panel: saving is the end of the task, so the panel
  // opened to do it closes, and the toast carries the result out with it.
  redirect(flashPath(`/admin/events/${eventId}/attendees`, `Saved ${input.name}.`));
}

export async function deleteAttendeeAction(eventId: string, attendeeId: string) {
  const { orgId } = await requireAdmin();
  await requireEvent(eventId, orgId);
  // Loaded before the delete, because the toast needs a name the row will no longer have.
  const gone = await requireEventAttendee(eventId, attendeeId);
  await deleteAttendee(attendeeId);
  revalidatePath(`/admin/events/${eventId}/attendees`);
  redirect(flashPath(`/admin/events/${eventId}/attendees`, `Deleted ${gone.name}.`));
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
  if (!onEvent) redirect(flashPath(`/admin/events/${ev.id}/attendees`, "Pick a checkpoint first.", "error"));
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

  // A breakout round is offered as a column beside the attendee's own, but it is not stored
  // on the attendee — it is a row in breakout_assignments. Same gesture, different table.
  const slot = breakoutSlotFromColumn(key);
  if (slot) {
    const rooms = breakoutSlots(await listAgenda(ev.id)).find((s) => s.slot === slot);
    if (!rooms) return;
    const wanted = raw.trim().toLowerCase();
    const room = wanted ? rooms.items.find((i) => i.code?.trim().toLowerCase() === wanted) : undefined;
    // Blank clears the round. An unrecognised code writes nothing rather than guessing.
    if (wanted && !room) return;
    if (room) await assignMany(ev.id, ids.map((attendeeId) => ({ attendeeId, itemId: room.id, slot })), true);
    else for (const id of ids) await unassign(ev.id, id, slot);
    revalidatePath(`/admin/events/${ev.id}/attendees`);
    return;
  }

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
  if (!result.ok) redirect(flashPath(columnsBack(eventId), result.error, "error"));
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
  redirect(flashPath(columnsBack(eventId), adopted > 0
    ? `Added “${field.label}” and filled it in for ${adopted} ${adopted === 1 ? "attendee" : "attendees"} from what was already on file.`
    : `Added “${field.label}”.`));
}

export async function renameAttendeeFieldAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const result = renameField(ev.attendee_fields, String(formData.get("key") ?? ""), String(formData.get("label") ?? ""));
  if (!result.ok) redirect(flashPath(columnsBack(eventId), result.error, "error"));
  await updateEvent(eventId, { attendee_fields: result.fields });
  revalidatePath(columnsBack(eventId));
  redirect(flashPath(columnsBack(eventId), `Column renamed to “${String(formData.get("label") ?? "").trim()}”.`));
}

/** Drops the definition only. Every attendee keeps the value, so re-adding the column restores it. */
export async function deleteAttendeeFieldAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const key = String(formData.get("key") ?? "");
  const gone = ev.attendee_fields.find((f) => f.key === key);
  await updateEvent(eventId, { attendee_fields: removeField(ev.attendee_fields, key) });
  revalidatePath(columnsBack(eventId));
  redirect(flashPath(columnsBack(eventId), `Removed “${gone?.label ?? "the column"}”. What people entered is kept.`));
}

// ---- Agenda / announcements / info / checkpoints ----

export async function addAgendaItemAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const day = str(formData, "day");
  const starts_at = str(formData, "starts_at");
  const title = str(formData, "title");
  if (!day || !starts_at || !title) redirect(flashPath(`/admin/events/${eventId}/agenda`, "A session needs a day, a start time and a title.", "error"));
  await createAgendaItem(ev, {
    day,
    starts_at,
    ends_at: str(formData, "ends_at"),
    title,
    description: str(formData, "description"),
    location: str(formData, "location"),
    categories: categoriesFromValues(formData.getAll("categories").map(String)),
    slot: null,
    code: null,
    color: parseAgendaColour(str(formData, "color")),
    // Sessions at the same time now order by when they were added, so nothing to collect.
    sort_order: 0,
  });
  revalidatePath(`/admin/events/${eventId}/agenda`);
  redirect(flashPath(`/admin/events/${eventId}/agenda`, `“${title}” added.`));
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
  if (!title || !body) redirect(flashPath(`/admin/events/${eventId}/announcements`, "An announcement needs a title and a body.", "error"));
  await createAnnouncement(ev, { title, body, pinned: formData.get("pinned") === "on" });
  revalidatePath(`/admin/events/${eventId}/announcements`);
  redirect(flashPath(`/admin/events/${eventId}/announcements`, `“${title}” posted.`));
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
  redirect(flashPath(`/admin/events/${eventId}/info`, "Info page saved."));
}

export async function addCheckpointAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const name = str(formData, "name");
  const day = str(formData, "day");
  const back = `/admin/events/${eventId}/settings`;
  if (!name) redirect(flashPath(back, "A checkpoint needs a name.", "error"));
  // A checkpoint names a moment on a date, so the date is not optional — several
  // checkpoints can share one day and the filters need to tell them apart.
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) redirect(flashPath(back, "Pick a date for the checkpoint.", "error"));
  await createCheckpoint(ev, name, day);
  revalidatePath(back);
  revalidatePath(`/admin/events/${eventId}`);
  redirect(flashPath(back, `“${name}” added.`));
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

/**
 * Marks which checkpoint the event is running. One switch, and the dashboard, the scanner
 * and bulk check-in all follow it — so there is one answer to "which door are we on"
 * rather than three screens each guessing separately.
 */
export async function setActiveCheckpointAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  // Chosen from the Overview, and settable from anywhere else that grows a control for it,
  // so the flash lands where the organiser is rather than always on Settings.
  const back = `/admin/events/${eventId}`;
  const id = String(formData.get("checkpoint_id") ?? "");
  // Validated against this event's own checkpoints, so a posted id cannot point the
  // dashboard and the scanner at somebody else's door.
  const chosen = (await listCheckpoints(ev.id)).find((c) => c.id === id);
  if (!chosen) redirect(flashPath(back, "That checkpoint no longer exists.", "error"));
  await updateEvent(eventId, { active_checkpoint_id: chosen.id });
  revalidatePath(back);
  revalidatePath(`/admin/events/${eventId}/settings`);
  revalidatePath(`/admin/events/${eventId}/attendees`);
  redirect(flashPath(back, `Now running “${chosen.name}”.`));
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
  if (ev.status !== "archived") redirect(flashPath(`/admin/events/${eventId}/settings`, "Archive the event first.", "error"));
  await purgeAttendeePersonalData(eventId);
  revalidatePath(`/admin/events/${eventId}`); redirect(flashPath(`/admin/events/${eventId}/settings`, "Personal data purged."));
}

// ---- Modules ----

const modulesPath = (eventId: string) => `/admin/events/${eventId}/modules`;

/** Loads the event's tiles in the shape the editor works in. */
async function currentModules(eventId: string) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  return { ev, modules: normalizeModules(ev) };
}

async function saveModules(eventId: string, modules: EventModule[], message: string) {
  await updateEvent(eventId, { modules });
  revalidatePath(`/admin/events/${eventId}`);
  redirect(flashPath(modulesPath(eventId), message));
}

/** Adds a tile, or replaces the one whose id the form carries. */
export async function saveModuleAction(eventId: string, formData: FormData) {
  const { ev, modules } = await currentModules(eventId);
  const posted = String(formData.get("id") ?? "").trim();
  const id = /^[a-z0-9_-]{1,32}$/.test(posted) ? posted : crypto.randomUUID().slice(0, 8);
  const isPlan = formData.get("preset") === "floor_plan";
  const plan = floorPlanUrl(ev);
  // The floor plan is the one tile whose url is an uploaded image rather than something
  // typed. It is resolved here and read back as if it had been posted, so moduleFromForm
  // stays a pure function of strings that knows nothing about uploads.
  const readWith = (url: string | null) => (k: string) => {
    if (k === "url" && isPlan) return url;
    const v = formData.get(k);
    return typeof v === "string" ? v : null;
  };
  let next: EventModule[] | undefined;
  let image: ImageChange = { url: plan, stale: null };
  try {
    // What was typed is checked against the image already stored, before a byte moves: a
    // label this form will reject must not first have spent an upload on the plan.
    moduleFromForm(readWith(plan), id);
    if (isPlan) image = await nextImage(formData, "url", plan, { orgId: ev.org_id, eventId, kind: "floor-plan" });
    next = upsertModule(modules, moduleFromForm(readWith(image.url), id));
  } catch (e) {
    redirect(flashPath(modulesPath(eventId), (e as Error).message, "error"));
  }
  if (!next) redirect(flashPath(modulesPath(eventId), "Could not read that tile.", "error"));
  // The legacy column is written alongside the tile rather than left behind: floorPlanUrl
  // falls back to it, so a plan removed from the tile but still named in the column would
  // simply reappear.
  await updateEvent(eventId, { modules: next, ...(isPlan ? { floor_plan_url: image.url } : {}) });
  await deleteEventImage(image.stale);
  revalidatePath(`/admin/events/${eventId}`);
  redirect(flashPath(modulesPath(eventId), posted ? "Tile saved." : "Tile added."));
}

export async function deleteModuleAction(eventId: string, id: string) {
  const { modules } = await currentModules(eventId);
  await saveModules(eventId, removeModule(modules, id), "Tile removed.");
}

/**
 * Shows or hides one tile without opening it. Saving the whole row back through
 * upsertModule keeps this on the same path as an edit, so the two cannot disagree about
 * what a stored row looks like.
 */
export async function toggleModuleAction(eventId: string, id: string, enabled: boolean) {
  const { modules } = await currentModules(eventId);
  const m = modules.find((x) => ("id" in x ? x.id : x.key) === id);
  if (!m) redirect(flashPath(modulesPath(eventId), "That tile no longer exists.", "error"));
  await saveModules(eventId, upsertModule(modules, { ...m, enabled }), enabled ? "Tile shown." : "Tile hidden.");
}

export async function reorderModulesAction(eventId: string, orderedIds: string[]) {
  const { ev, modules } = await currentModules(eventId);
  await updateEvent(eventId, { modules: reorderModules(modules, orderedIds) });
  revalidatePath(modulesPath(ev.id));
  revalidatePath(`/admin/events/${ev.id}`);
}


// ---- Pinned fields ----

const settingsPath = (eventId: string) => `/admin/events/${eventId}/settings`;

/**
 * These save on click rather than with the settings form. updateSettingsAction writes
 * every column on every save, so a picker inside that form would have to be submitted to
 * take effect — and reordering a pin is not a thing anyone expects to have to save twice.
 */
export async function addPinAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const result = addPin(ev.pinned_fields, String(formData.get("key") ?? ""), String(formData.get("label") ?? ""));
  if (!result.ok) redirect(flashPath(settingsPath(eventId), result.error, "error"));
  await updateEvent(eventId, { pinned_fields: result.pins });
  revalidatePath(`/admin/events/${eventId}`);
  redirect(flashPath(settingsPath(eventId), "Pinned to the badge."));
}

export async function removePinAction(eventId: string, key: string) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  await updateEvent(eventId, { pinned_fields: removePin(ev.pinned_fields, key) });
  revalidatePath(`/admin/events/${eventId}`);
  redirect(flashPath(settingsPath(eventId), "Unpinned."));
}

export async function reorderPinsAction(eventId: string, keys: string[]) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  await updateEvent(eventId, { pinned_fields: reorderPins(ev.pinned_fields, keys) });
  revalidatePath(settingsPath(ev.id));
  revalidatePath(`/admin/events/${ev.id}`);
}

/**
 * A whole breakout round, in one go.
 *
 * Every room of a round shares its day, its time, its title and its colour — only the code
 * differs — so creating a four-room round used to mean filling the same form four times.
 * The rooms come in as one line, "3A, 3B, 3C, 3D", and each becomes an agenda item.
 *
 * Its own form because a breakout is not an ordinary session with extra fields: it has no
 * location of its own — the code IS the room — and no category restriction, because who
 * attends is decided by assignment rather than by category.
 */
export async function addBreakoutRoundAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const back = `/admin/events/${eventId}/agenda`;
  const day = str(formData, "day");
  const starts_at = str(formData, "starts_at");
  const slot = str(formData, "slot");
  const rooms = parseRoomCodes(str(formData, "code") ?? "");
  if (!day || !starts_at || !slot) {
    redirect(flashPath(back, "A breakout round needs a day, a start time and a name.", "error"));
  }
  if (rooms.length === 0) {
    redirect(flashPath(back, "List the rooms, separated by commas — for example 3A, 3B, 3C.", "error"));
  }

  // A round cannot reuse a room code it already has: the import matches on that value, so
  // two rooms answering to "3A" would put people in whichever came first.
  const taken = new Set(
    breakoutSlots(await listAgenda(ev.id))
      .filter((s) => s.slot === slot)
      .flatMap((s) => s.items.map((i) => i.code?.trim().toLowerCase()))
  );
  const fresh = rooms.filter((r) => !taken.has(r.toLowerCase()));
  if (fresh.length === 0) {
    redirect(flashPath(back, `“${slot}” already has ${rooms.join(", ")}.`, "error"));
  }
  // A round is one line on the agenda and is edited as one thing, so it has to live on one
  // day. Adding rooms to an existing round on a different day would render it twice and
  // make an edit of either rewrite both.
  const elsewhere = breakoutSlots(await listAgenda(ev.id)).find((s) => s.slot === slot)?.items.find((i) => i.day !== day);
  if (elsewhere) {
    redirect(flashPath(back, `“${slot}” is already on ${elsewhere.day}. A round runs on one day — rename this one, or edit the existing round to add rooms.`, "error"));
  }

  const shared = {
    day, starts_at,
    ends_at: str(formData, "ends_at"),
    title: str(formData, "title") ?? slot,
    description: str(formData, "description"),
    location: null,
    categories: null,
    slot,
    color: parseAgendaColour(str(formData, "color")),
    sort_order: 0,
  };
  for (const code of fresh) await createAgendaItem(ev, { ...shared, code });

  const skipped = rooms.length - fresh.length;
  revalidatePath(back);
  redirect(flashPath(back, `${slot}: ${fresh.join(", ")} added.${skipped > 0 ? ` ${skipped} already existed.` : ""}`));
}

/**
 * Edits a whole breakout round: its shared fields, its name, and which rooms it has.
 *
 * A round is created in one go and listed as one line, so it is edited in one go too. The
 * rooms field is the round's room list — codes added to it become new rooms, and codes
 * taken off it are removed ONLY if the removal box is ticked. That default is deliberate:
 * clearing a code by accident would otherwise delete a room and, by cascade, everybody
 * assigned to it.
 *
 * Renaming pushes onto the assignment rows, because `unique (attendee_id, slot)` reads the
 * copy denormalised there. Doing every room of the round at once is what makes renaming
 * safe here and dangerous one room at a time — this cannot split a round.
 */
export async function updateBreakoutRoundAction(eventId: string, slot: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const back = `/admin/events/${eventId}/agenda`;

  const current = breakoutSlots(await listAgenda(ev.id)).find((s) => s.slot === slot);
  if (!current) redirect(flashPath(back, "That round no longer exists.", "error"));

  const day = str(formData, "day");
  const starts_at = str(formData, "starts_at");
  const nextSlot = str(formData, "slot");
  const rooms = parseRoomCodes(str(formData, "code") ?? "");
  if (!day || !starts_at || !nextSlot) redirect(flashPath(back, "A round needs a day, a start time and a name.", "error"));
  if (rooms.length === 0) redirect(flashPath(back, "A round needs at least one room.", "error"));
  // Renaming into a name another round already uses would merge the two: `breakoutSlots`
  // groups on the name alone, so the next edit would pull both into one round and rewrite
  // the other one's day. Guarding creation was not enough — this is the same state by a
  // different door.
  if (nextSlot !== slot && breakoutSlots(await listAgenda(ev.id)).some((s) => s.slot === nextSlot)) {
    redirect(flashPath(back, `There is already a round called “${nextSlot}”. Two rounds cannot share a name.`, "error"));
  }

  const shared = {
    day, starts_at,
    ends_at: str(formData, "ends_at"),
    // A round with no title of its own is titled after itself. Carrying the form's seeded
    // value through a rename would leave the OLD round name sitting under the new one.
    title: (() => { const t = str(formData, "title"); return !t || t === slot ? nextSlot : t; })(),
    description: str(formData, "description"),
    location: null,
    categories: null,
    slot: nextSlot,
    color: parseAgendaColour(str(formData, "color")),
    sort_order: 0,
  };

  const wanted = new Map(rooms.map((r) => [r.toLowerCase(), r]));
  const removeMissing = formData.get("remove_missing") === "on";
  let removed = 0;

  for (const room of current.items) {
    const code = room.code?.trim() ?? "";
    // A room with no code never appears in the Rooms field — it has nothing to print there
    // — so its absence from that list is not a decision anybody made, and removing it (and
    // everybody assigned to it) on the strength of that would be silent data loss.
    const keep = code === "" || wanted.has(code.toLowerCase());
    if (!keep && removeMissing) { await deleteAgendaItem(room.id, ev.id); removed++; continue; }
    // `wanted` never holds a "" key, so a codeless room must keep what it has rather than
    // be handed an undefined that `updateAgendaItem` would drop from the payload — the one
    // place that function is documented to send every column explicitly.
    const nextCode = code === "" ? room.code : (wanted.get(code.toLowerCase()) ?? code);
    await updateAgendaItem(room.id, ev.id, { ...shared, code: nextCode });
    if (nextSlot !== slot) {
      try {
        await renameSlotAssignments(room.id, nextSlot);
      } catch {
        redirect(flashPath(back, `Renamed, but the people in ${code} could not follow — somebody there is already in “${nextSlot}”.`, "error"));
      }
    }
    wanted.delete(code.toLowerCase());
  }

  for (const code of wanted.values()) await createAgendaItem(ev, { ...shared, code });

  revalidatePath(back);
  redirect(flashPath(back, `${nextSlot} saved.${wanted.size > 0 ? ` ${wanted.size} room${wanted.size === 1 ? "" : "s"} added.` : ""}${removed > 0 ? ` ${removed} removed.` : ""}`));
}

/** Deletes a round and every room in it. Assignments go with the rooms, by cascade. */
export async function deleteBreakoutRoundAction(eventId: string, slot: string) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const round = breakoutSlots(await listAgenda(ev.id)).find((s) => s.slot === slot);
  if (round) for (const room of round.items) await deleteAgendaItem(room.id, ev.id);
  revalidatePath(`/admin/events/${eventId}/agenda`);
  redirect(flashPath(`/admin/events/${eventId}/agenda`, `“${slot}” removed.`));
}

/**
 * Edits one session, ordinary or breakout.
 *
 * `preset` says which form posted: a breakout carries a round and a room and never a
 * location or a category, so reading the wrong set would blank fields the form never
 * showed. Everything else — day, times, title, description, colour — is common.
 *
 * Renaming a round is the edit with teeth. Assignments carry their own copy of `slot`
 * because `unique (attendee_id, slot)` cannot reach through to this row, so the rename has
 * to be pushed onto them or the people in this room keep enforcing the old round. Two
 * things can then go wrong, and both are reported rather than swallowed: renaming only ONE
 * room of a round splits it in two, and renaming into a round somebody is already in
 * violates that unique index.
 */
export async function updateAgendaItemAction(eventId: string, itemId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const back = `/admin/events/${eventId}/agenda`;

  const item = (await listAgenda(ev.id)).find((i) => i.id === itemId);
  if (!item) redirect(flashPath(back, "That session no longer exists.", "error"));

  const day = str(formData, "day");
  const starts_at = str(formData, "starts_at");
  const title = str(formData, "title");
  if (!day || !starts_at) redirect(flashPath(back, "A session needs a day and a start time.", "error"));

  const isBreakout = str(formData, "preset") === "breakout";
  const slot = isBreakout ? str(formData, "slot") : item.slot;
  const code = isBreakout ? str(formData, "code") : item.code;
  if (isBreakout && (!slot || !code)) redirect(flashPath(back, "A breakout room needs a round and a room.", "error"));

  await updateAgendaItem(itemId, ev.id, {
    day,
    starts_at,
    ends_at: str(formData, "ends_at"),
    title: title ?? slot ?? item.title,
    description: str(formData, "description"),
    location: isBreakout ? null : str(formData, "location"),
    categories: isBreakout ? null : categoriesFromValues(formData.getAll("categories").map(String)),
    slot,
    code,
    color: parseAgendaColour(str(formData, "color")),
    sort_order: item.sort_order,
  });

  if (isBreakout && slot && slot !== item.slot) {
    try {
      await renameSlotAssignments(itemId, slot);
    } catch {
      redirect(flashPath(back, `Room moved to “${slot}”, but the people already in it could not follow — somebody in this room is already assigned to “${slot}”. Clear them first.`, "error"));
    }
  }

  revalidatePath(back);
  redirect(flashPath(back, `“${title ?? slot}” saved.`));
}

// ---- Breakouts ----

/**
 * Turns the imported spreadsheet column into assignments for one round.
 *
 * Deliberately not run by the import: the masterlist is imported before the agenda exists,
 * so anything automatic would silently assign nobody (D83). Re-runnable, and skips people who
 * already have a room unless `overwrite` is ticked, so running it again on the morning of
 * day 2 does not undo what the desk did at breakfast.
 */
export async function assignFromColumnAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const wanted = String(formData.get("slot") ?? "").trim();
  const overwrite = formData.get("overwrite") === "on";
  // Back to the attendee list, which is where this is run from and where the result is
  // read: the roster counts on the agenda are a summary of what this list already shows.
  const back = `/admin/events/${eventId}/attendees`;

  const exists = breakoutSlots(await listAgenda(ev.id)).some((s) => s.slot === wanted);
  if (!exists) redirect(flashPath(back, "That breakout round no longer exists.", "error"));

  // Same runner and same wording as the import, so one round cannot be described two ways
  // depending on which button placed the people in it.
  // Read from inside Assign from column, so the hint names the tick rather than the dialog.
  const lines = await assignRoundsFromColumns(ev, wanted, overwrite, "tick Overwrite to move them");
  const message = lines.join(" ") || `${wanted}: nothing to assign — no attendee has a room code in that column.`;
  revalidatePath(`/admin/events/${eventId}/agenda`);
  redirect(flashPath(back, message, message.includes("No room matches") ? "error" : "ok"));
}
