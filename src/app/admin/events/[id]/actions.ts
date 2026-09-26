"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createEvent, deleteEvent, requireEvent, updateEvent, setEventStatus, rotateCrewToken } from "@/lib/db/events";
import { confirmsDelete, deleteBlockedBecause } from "@/lib/event-delete";
import { slugify } from "@/lib/slug";
import { questionsFromForm } from "@/lib/questions-form";
import type { EventStatus } from "@/lib/types";
import { importedCategory, importedColumns, parseMasterlist, type MasterlistResult } from "@/lib/masterlist";
import { createAttendee, createAttendees, deleteAttendee, deleteAttendees, eraseExtraKeys, listAttendees, updateAttendee, upsertByEmail, getAttendee, purgeAttendeePersonalData, type AttendeeInput } from "@/lib/db/attendees";
import { addField, renameField, fieldValuesFromForm, adoptValue, eventFields, coerceFieldValue, keysToErase, MAX_ATTENDEE_FIELDS } from "@/lib/attendee-fields";
import { bulkFields, BULK_BUILTIN_KEYS } from "@/lib/columns";
import { parseIds } from "@/lib/bulk";
import type { Attendee, Event, AgendaDay } from "@/lib/types";
import { createAgendaItem, deleteAgendaItem, listAgenda, updateAgendaItem, listAgendaDays, createAgendaDay, updateAgendaDay, deleteAgendaDay, setAgendaOrder } from "@/lib/db/agenda";
import { breakoutSlots, matchAssignments, breakoutSlotFromColumn, parseRoomCodes, splitByExisting, describeAssignment, agendaRows } from "@/lib/breakouts";
import { assignMany, unassign, renameSlotAssignments, listAssignments } from "@/lib/db/breakouts";
import { createAnnouncement, deleteAnnouncement, listAnnouncements, setAnnouncementOrder, updateAnnouncement } from "@/lib/db/announcements";
import { createCheckpoint, deleteCheckpoint, listCheckpoints, setCheckpointOrder } from "@/lib/db/checkpoints";
import { recordCheckins } from "@/lib/db/checkins";
import { categoriesFromValues, dayLabel } from "@/lib/agenda";
import { itemKey, rowKey, placeKey, sortOrdersFor, isValidOrder } from "@/lib/agenda-placement";
import { listInfoTabs, createInfoTab, updateInfoTab, deleteInfoTab, setInfoTabOrder } from "@/lib/db/info-tabs";
import { parseAgendaColour } from "@/lib/agenda-colours";
import { localInputToIso, nowInKL } from "@/lib/time";
import { listActivities, listBookings } from "@/lib/db/activities";
import { mergeExtra } from "@/lib/attendee-merge";
import { moduleFromForm, moduleId, upsertModule, removeModule, reorderModules } from "@/lib/modules-form";
import { addPin, removePin, reorderPins } from "@/lib/pinned-fields";
import { flashPath } from "@/lib/flash";
import { ICON_SECTIONS, sectionIcons, type IconSection } from "@/lib/launcher";
import { normalizeModules, floorPlanUrl, type EventModule } from "@/lib/modules";
import { deleteEventFiles, deleteEventImage, nextImage, uploadEventImage, type ImageChange } from "@/lib/db/media";
import { scanFieldsFromForm } from "@/lib/scan";
import { cleanRichText } from "@/lib/rich-text";
import { splitAudience } from "@/lib/whatsapp-audience";
import { runSend } from "@/lib/whatsapp-run";
import { listTemplates } from "@/lib/whatsapp";
import { isSource, readTemplate, sourceValue, type Source } from "@/lib/whatsapp-templates";
import { inAudience, sendKey } from "@/lib/whatsapp-targets";
import { formatDateRange, shortDate } from "@/lib/text";

const str = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};

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
    logo_url: logo.url,
    banner_url: banner.url,
    primary_color: str(formData, "primary_color") ?? "#F97316",
    registration_open: formData.get("registration_open") === "on",
    registration_closes_at: localInputToIso(str(formData, "registration_closes_at")),
    registration_intro: str(formData, "registration_intro"),
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

/**
 * Turns this event's door on or off (D159).
 *
 * Applies on the click, like the status buttons beside it, because there is nothing to
 * fill in — and it deliberately leaves every checkpoint and checkin row alone. An
 * organiser who switches it off after a morning of scanning, then changes their mind,
 * gets their morning back.
 *
 * Revalidates the event root rather than the settings path alone: the flag decides what
 * the Overview renders and whether the sidebar carries a Scanner, so the pages that must
 * notice are the ones outside Settings.
 */
export async function setCheckInEnabledAction(eventId: string, enabled: boolean) {
  const { orgId } = await requireAdmin();
  await requireEvent(eventId, orgId);
  await updateEvent(eventId, { check_in_enabled: enabled });
  revalidatePath(`/admin/events/${eventId}`, "layout");
  redirect(flashPath(`/admin/events/${eventId}/settings`, enabled ? "Check-in is on." : "Check-in is off."));
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
  // Every header the event has no column for becomes one, so what the sheet carried shows in
  // the table straight away instead of waiting in the "add a column" dialog.
  const rounds = breakoutSlots(await listAgenda(ev.id)).map((s) => s.slot);
  const fresh = importedColumns(parsed.extraColumns, eventFields(ev.registration_questions, ev.attendee_fields), rounds);
  const room = Math.max(0, MAX_ATTENDEE_FIELDS - ev.attendee_fields.length);
  const added = fresh.slice(0, room);
  const leftOut = fresh.slice(room).map((f) => f.label);
  if (added.length > 0) await updateEvent(eventId, { attendee_fields: [...ev.attendee_fields, ...added] });
  // One read of the existing roster instead of a lookup per row; new rows go out in one bulk insert.
  const existingByEmail = new Map((await listAttendees(ev.id)).flatMap((a) => (a.email ? [[a.email.trim().toLowerCase(), a] as const] : [])));
  const queued = new Map<string, AttendeeInput>();
  const toInsert: AttendeeInput[] = [];
  let updated = 0;
  for (const r of parsed.rows) {
    const key = r.email?.trim().toLowerCase();
    const existing = key ? existingByEmail.get(key) : undefined;
    // Category from the sheet, else its "Joining X" columns, else what the attendee already has.
    const input: AttendeeInput = { name: r.name, email: r.email, category: importedCategory(r.category ?? null, r.extra, existing?.category ?? null), extra: r.extra };
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
  const problems = parsed.skipped.length > 0 || leftOut.length > 0 || assigned.some((l) => l.includes("No room matches"));
  revalidatePath(`/admin/events/${eventId}/attendees`);
  revalidatePath(`/admin/events/${eventId}/agenda`);
  redirect(flashPath(
    `/admin/events/${eventId}/attendees`,
    [
      `Imported ${inserted}, updated ${updated}.`,
      added.length > 0 ? `Added ${added.length} ${added.length === 1 ? "column" : "columns"} from the file.` : "",
      // Still stored on every attendee, so adding them by hand once there is room fills them in.
      leftOut.length > 0 ? `No room for ${leftOut.length} more (${leftOut.join(", ")}) — the limit is ${MAX_ATTENDEE_FIELDS} columns.` : "",
      ...assigned, skipped ? `Skipped — ${skipped}` : "",
    ].filter(Boolean).join(" "),
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
 * Deletes a selection, for clearing out a bad import before loading it again. Returns the
 * count rather than redirecting: the bulk bar reports it in a toast and clears its own
 * selection, and a redirect would drop the reader's search and page along the way.
 *
 * The ids are checked against this event's roster, so a posted id cannot reach another
 * event's attendee.
 */
export async function deleteAttendeesAction(eventId: string, formData: FormData): Promise<number> {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const allowed = new Set((await listAttendees(ev.id)).map((a) => a.id));
  const ids = parseIds(String(formData.get("ids") ?? ""), allowed);
  if (ids.length === 0) return 0;
  const deleted = await deleteAttendees(ev, ids);
  revalidatePath(`/admin/events/${ev.id}/attendees`);
  revalidatePath(`/admin/events/${ev.id}`);
  return deleted;
}

/**
 * Checks a selection in at one checkpoint, for the desk that registers a group off one
 * clipboard. The checkpoint is validated against this event, so a posted id cannot write
 * a check-in into somebody else's door.
 */
export async function markCheckedInAction(eventId: string, formData: FormData) {
  const { orgId, userId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  // The bulk bar hides itself when this event has no checkpoints to offer, but a posted
  // form is not the bar; refuse the write itself the way doCheckin does (D159).
  if (!ev.check_in_enabled) redirect(flashPath(`/admin/events/${ev.id}/attendees`, "Check-in is off for this event.", "error"));
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

/**
 * Deletes one or more columns and erases what was stored in them (D248). Posted as one or
 * more `key` fields, so the header menu's single delete and the Manage columns dialog's
 * several are the same action.
 *
 * Until D248 a delete kept the values and a same-named column brought them back. That suited
 * columns typed in by hand; an import now makes one per spreadsheet header, and clearing out
 * "Pax" should clear it. Only organiser-added columns can go: a registration question is owned
 * by the form in Settings, and a posted key naming one is ignored.
 *
 * The definitions go first, then the values. A failure in between leaves values nothing shows,
 * which the "add a column" suggestions still offer back — the recoverable side to fail on.
 */
export async function deleteAttendeeFieldsAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const asked = new Set(formData.getAll("key").map(String));
  const questionKeys = new Set(ev.registration_questions.map((q) => q.key));
  const doomed = ev.attendee_fields.filter((f) => asked.has(f.key) && !questionKeys.has(f.key));
  if (doomed.length === 0) redirect(flashPath(columnsBack(eventId), "Those columns can't be deleted here.", "error"));

  const kept = ev.attendee_fields.filter((f) => !doomed.includes(f));
  const gone = new Set(doomed.map((f) => f.key));
  // A pinned column that no longer exists would only be dropped at render; drop it here too.
  await updateEvent(eventId, { attendee_fields: kept, pinned_fields: ev.pinned_fields.filter((p) => !gone.has(p.key)) });
  const keys = keysToErase((await listAttendees(ev.id)).map((a) => a.extra ?? {}), doomed, eventFields(ev.registration_questions, kept));
  await eraseExtraKeys(ev.id, keys);

  revalidatePath(columnsBack(eventId));
  redirect(flashPath(columnsBack(eventId), doomed.length === 1
    ? `Deleted “${doomed[0].label}” and everything stored in it.`
    : `Deleted ${doomed.length} columns and everything stored in them.`));
}

// ---- Agenda / announcements / info / checkpoints ----

const agendaBack = (eventId: string) => `/admin/events/${eventId}/agenda`;

/** The day a form names, if it is one of this event's. A posted id is never trusted (D193). */
async function dayOf(eventId: string, dayId: string | null): Promise<AgendaDay | null> {
  if (!dayId) return null;
  return (await listAgendaDays(eventId)).find((d) => d.id === dayId) ?? null;
}

/**
 * Re-numbers one day so the row `key` sits where `time` puts it (D197) and writes the result.
 * Called after the row itself is written, so the row is among the day's rows and is lifted
 * out and re-inserted like any retimed row.
 */
async function placeInDay(eventId: string, dayId: string, key: string, time: string | null) {
  const rows = agendaRows((await listAgenda(eventId)).filter((i) => i.day_id === dayId));
  await setAgendaOrder(eventId, sortOrdersFor(rows, placeKey(rows, key, time)));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function addAgendaDayAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const date = str(formData, "date");
  if (!date || !ISO_DATE.test(date)) redirect(flashPath(agendaBack(eventId), "A day needs a date.", "error"));
  const made = await createAgendaDay(ev, { date, name: str(formData, "name") });
  if (!made) redirect(flashPath(agendaBack(eventId), `There's already a day on ${shortDate(date)}.`, "error"));
  revalidatePath(agendaBack(eventId));
  // Straight onto the new day's tab (DayTabs), where its sessions go next.
  redirect(flashPath(`${agendaBack(eventId)}?day=${made.id}`, `${dayLabel(made)} added.`));
}

/** Renames or re-dates a day; its rows move with a new date, in the database (D194). */
export async function updateAgendaDayAction(eventId: string, dayId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const day = await dayOf(ev.id, dayId);
  if (!day) redirect(flashPath(agendaBack(eventId), "That day no longer exists.", "error"));
  const date = str(formData, "date");
  if (!date || !ISO_DATE.test(date)) redirect(flashPath(agendaBack(eventId), "A day needs a date.", "error"));
  const name = str(formData, "name");
  if (!(await updateAgendaDay(day.id, ev.id, { date, name }))) {
    redirect(flashPath(agendaBack(eventId), `There's already a day on ${shortDate(date)}.`, "error"));
  }
  revalidatePath(agendaBack(eventId));
  redirect(flashPath(agendaBack(eventId), `${dayLabel({ date, name })} saved.`));
}

/**
 * Deletes a day with everything on it (D201). Its rows' images are read first and removed
 * from the bucket after, in the D160 order: nothing leaves storage until no row names it.
 */
export async function deleteAgendaDayAction(eventId: string, dayId: string) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const day = await dayOf(ev.id, dayId);
  if (!day) redirect(flashPath(agendaBack(eventId), "That day no longer exists.", "error"));
  const doomed = (await listAgenda(ev.id)).filter((i) => i.day_id === day.id);
  await deleteAgendaDay(day.id, ev.id);
  for (const i of doomed) await deleteEventImage(i.image_url);
  revalidatePath(agendaBack(eventId));
  redirect(flashPath(agendaBack(eventId), `${dayLabel(day)} removed.`));
}

/**
 * Saves one day's hand order (D197), from the drag list. A list that is not exactly the day's
 * rows - posted from a stale page - is ignored, and the list snaps back to what is stored.
 */
export async function reorderAgendaDayAction(eventId: string, dayId: string, keys: string[]) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const rows = agendaRows((await listAgenda(ev.id)).filter((i) => i.day_id === dayId));
  if (rows.length === 0 || !isValidOrder(rows.map(rowKey), keys)) return;
  await setAgendaOrder(ev.id, sortOrdersFor(rows, keys));
  revalidatePath(agendaBack(eventId));
}

export async function addAgendaItemAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const day = await dayOf(ev.id, str(formData, "day_id"));
  const starts_at = str(formData, "starts_at");
  const title = str(formData, "title");
  if (!day || !starts_at || !title) redirect(flashPath(`/admin/events/${eventId}/agenda`, "A session needs a day, a start time and a title.", "error"));
  // Uploaded before the row is written, as Settings does it: a file we will not take must
  // leave nothing behind rather than a session with half its fields.
  let image: ImageChange = { url: null, stale: null };
  try {
    image = await nextImage(formData, "image", null, { orgId, eventId, kind: "agenda" });
  } catch (e) {
    redirect(flashPath(`/admin/events/${eventId}/agenda`, (e as Error).message, "error"));
  }
  const id = await createAgendaItem(ev, {
    day_id: day.id,
    kind: "session",
    starts_at,
    ends_at: str(formData, "ends_at"),
    title,
    description: str(formData, "description"),
    location: str(formData, "location"),
    categories: categoriesFromValues(formData.getAll("categories").map(String)),
    slot: null,
    code: null,
    color: parseAgendaColour(str(formData, "color")),
    image_url: image.url,
    sort_order: 0,
  });
  // New rows go in by time; the organiser drags from there (D197).
  await placeInDay(ev.id, day.id, id, starts_at);
  revalidatePath(`/admin/events/${eventId}/agenda`);
  redirect(flashPath(`/admin/events/${eventId}/agenda`, `“${title}” added.`));
}

export async function deleteAgendaItemAction(eventId: string, itemId: string) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  // Read before the delete, because afterwards there is no row to ask.
  const doomed = (await listAgenda(ev.id)).find((i) => i.id === itemId);
  await deleteAgendaItem(itemId, eventId);
  await deleteEventImage(doomed?.image_url);
  revalidatePath(`/admin/events/${eventId}/agenda`);
}

export async function addAnnouncementAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const title = str(formData, "title");
  const body = str(formData, "body");
  if (!title || !body) redirect(flashPath(`/admin/events/${eventId}/announcements`, "An announcement needs a title and a body.", "error"));
  await createAnnouncement(ev, { title, body, pinned: formData.get("pinned") === "on", categories: categoriesFromValues(formData.getAll("categories").map(String)) });
  revalidatePath(`/admin/events/${eventId}/announcements`);
  redirect(flashPath(`/admin/events/${eventId}/announcements`, `“${title}” posted.`));
}

export async function updateAnnouncementAction(eventId: string, annId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  await requireEvent(eventId, orgId);
  const back = `/admin/events/${eventId}/announcements`;
  const title = str(formData, "title");
  const body = str(formData, "body");
  if (!title || !body) redirect(flashPath(back, "An announcement needs a title and a body.", "error"));
  await updateAnnouncement(annId, eventId, { title, body, pinned: formData.get("pinned") === "on", categories: categoriesFromValues(formData.getAll("categories").map(String)) });
  revalidatePath(back);
  redirect(flashPath(back, `“${title}” saved.`));
}

export async function deleteAnnouncementAction(eventId: string, annId: string) {
  const { orgId } = await requireAdmin();
  await requireEvent(eventId, orgId);
  await deleteAnnouncement(annId, eventId);
  revalidatePath(`/admin/events/${eventId}/announcements`);
}

/** The order a drag or an arrow left them in (D249). A list that is not exactly this event's announcements is dropped, as for info tabs. */
export async function reorderAnnouncementsAction(eventId: string, ids: string[]) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const current = (await listAnnouncements(ev.id)).map((a) => a.id);
  if (current.length === 0 || !isValidOrder(current, ids)) return;
  await setAnnouncementOrder(ev.id, ids);
  revalidatePath(`/admin/events/${eventId}/announcements`);
}

const infoBack = (eventId: string) => `/admin/events/${eventId}/info`;

/** The section's name: the Info tile's label and the page heading (D203). Saved on its own. */
export async function saveInfoTitleAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  await requireEvent(eventId, orgId);
  await updateEvent(eventId, { info_page_title: str(formData, "info_page_title") ?? "Info" });
  revalidatePath(infoBack(eventId));
  redirect(flashPath(infoBack(eventId), "Title saved."));
}

/** A new, empty tab at the end; its editor opens straight away (D207). */
export async function addInfoTabAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const title = str(formData, "title");
  if (!title) redirect(flashPath(infoBack(eventId), "A tab needs a title.", "error"));
  const id = await createInfoTab(ev, title);
  revalidatePath(infoBack(eventId));
  redirect(flashPath(`${infoBack(eventId)}?tab=${id}`, `“${title}” added. Write its content below.`));
}

export async function saveInfoTabAction(eventId: string, tabId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const back = `${infoBack(eventId)}?tab=${tabId}`;
  if (!(await listInfoTabs(ev.id)).some((t) => t.id === tabId)) redirect(flashPath(infoBack(eventId), "That tab no longer exists.", "error"));
  const title = str(formData, "title");
  if (!title) redirect(flashPath(back, "A tab needs a title.", "error"));
  await updateInfoTab(tabId, ev.id, { title, html: cleanRichText(str(formData, "html")), categories: categoriesFromValues(formData.getAll("categories").map(String)) });
  revalidatePath(infoBack(eventId));
  redirect(flashPath(back, "Tab saved."));
}

/** Its content goes with it. Images inside it stay in the bucket - D160's known limitation. */
export async function deleteInfoTabAction(eventId: string, tabId: string) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const tab = (await listInfoTabs(ev.id)).find((t) => t.id === tabId);
  if (!tab) redirect(flashPath(infoBack(eventId), "That tab no longer exists.", "error"));
  await deleteInfoTab(tab.id, ev.id);
  revalidatePath(infoBack(eventId));
  redirect(flashPath(infoBack(eventId), `“${tab.title}” removed.`));
}

/** From the drag list. A list that is not exactly this event's tabs is ignored and snaps back. */
export async function reorderInfoTabsAction(eventId: string, ids: string[]) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const current = (await listInfoTabs(ev.id)).map((t) => t.id);
  if (current.length === 0 || !isValidOrder(current, ids)) return;
  await setInfoTabOrder(ev.id, ids);
  revalidatePath(infoBack(eventId));
}

/**
 * Uploads one image for the info page's editor and hands back its URL; the editor puts it
 * where the cursor was (D160 said "at the end", because a textarea could not say where the
 * cursor was - the editor can).
 *
 * Returns rather than redirects: it is called from the editor while the page is still being
 * written, and a redirect would throw away everything typed and not yet saved. Nothing is
 * written to the event here - the image only becomes part of the page when the page is saved.
 */
export async function uploadInfoImageAction(eventId: string, formData: FormData): Promise<{ url: string } | { error: string }> {
  const { orgId } = await requireAdmin();
  await requireEvent(eventId, orgId);
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image first." };
  try {
    return { url: await uploadEventImage({ orgId, eventId, kind: "info", file }) };
  } catch (e) {
    return { error: (e as Error).message };
  }
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
  await purgeAttendeePersonalData(eventId, orgId);
  revalidatePath(`/admin/events/${eventId}`); redirect(flashPath(`/admin/events/${eventId}/settings`, "Personal data purged."));
}

/**
 * Deletes the event outright (event-delete.ts): refused while it is live, and only when the
 * typed name matches. Files first (deleteEventFiles), then the row, whose foreign keys take
 * every attendee, booking, check-in and message with it. Nothing here can be undone.
 */
export async function deleteEventAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const back = `/admin/events/${eventId}/settings`;
  const blocked = deleteBlockedBecause(ev.status);
  if (blocked) redirect(flashPath(back, `${ev.name} cannot be deleted. ${blocked}`, "error"));
  if (!confirmsDelete(String(formData.get("confirm_name") ?? ""), ev.name)) {
    redirect(flashPath(back, "Type the event's name exactly to delete it.", "error"));
  }
  await deleteEventFiles(orgId, ev.id);
  await deleteEvent(ev.id, orgId);
  revalidatePath("/admin/events");
  redirect(flashPath("/admin/events", `${ev.name} deleted.`));
}

// ---- Modules ----

const modulesPath = (eventId: string) => `/admin/events/${eventId}/modules`;

/** Loads the event's tiles in the shape the editor works in. */
async function currentModules(eventId: string) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  return { ev, modules: normalizeModules(ev) };
}

/** `stale` is an image the save leaves unreferenced, removed once the row no longer names it. */
async function saveModules(eventId: string, modules: EventModule[], message: string, stale?: string | null) {
  await updateEvent(eventId, { modules });
  await deleteEventImage(stale);
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
  const current = modules.find((m) => moduleId(m) === (isPlan ? "floor_plan" : id));
  const currentIcon = current && "icon_image" in current ? current.icon_image ?? null : null;
  // The floor plan's url and every tile's icon image are uploads rather than something
  // typed. They are resolved here and read back as if they had been posted, so
  // moduleFromForm stays a pure function of strings that knows nothing about uploads.
  const readWith = (url: string | null, icon: string | null) => (k: string) => {
    if (k === "url" && isPlan) return url;
    if (k === "icon_image") return icon;
    const v = formData.get(k);
    return typeof v === "string" ? v : null;
  };
  let next: EventModule[] | undefined;
  let image: ImageChange = { url: plan, stale: null };
  let icon: ImageChange = { url: currentIcon, stale: null };
  try {
    // What was typed is checked against the images already stored, before a byte moves: a
    // label this form will reject must not first have spent an upload.
    moduleFromForm(readWith(plan, currentIcon), id);
    if (isPlan) image = await nextImage(formData, "url", plan, { orgId: ev.org_id, eventId, kind: "floor-plan" });
    icon = await nextImage(formData, "icon_image", currentIcon, { orgId: ev.org_id, eventId, kind: "tile-icon" });
    next = upsertModule(modules, moduleFromForm(readWith(image.url, icon.url), id));
  } catch (e) {
    redirect(flashPath(modulesPath(eventId), (e as Error).message, "error"));
  }
  if (!next) redirect(flashPath(modulesPath(eventId), "Could not read that tile.", "error"));
  // The legacy column is written alongside the tile rather than left behind: floorPlanUrl
  // falls back to it, so a plan removed from the tile but still named in the column would
  // simply reappear.
  await updateEvent(eventId, { modules: next, ...(isPlan ? { floor_plan_url: image.url } : {}) });
  await deleteEventImage(image.stale);
  await deleteEventImage(icon.stale);
  revalidatePath(`/admin/events/${eventId}`);
  redirect(flashPath(modulesPath(eventId), posted ? "Tile saved." : "Tile added."));
}

export async function deleteModuleAction(eventId: string, id: string) {
  const { modules } = await currentModules(eventId);
  const doomed = modules.find((m) => moduleId(m) === id);
  await saveModules(eventId, removeModule(modules, id), "Tile removed.", doomed && "icon_image" in doomed ? doomed.icon_image : null);
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
  const day = await dayOf(ev.id, str(formData, "day_id"));
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
  const existing = breakoutSlots(await listAgenda(ev.id)).find((s) => s.slot === slot);
  const elsewhere = existing?.items.find((i) => i.day_id !== day.id);
  if (elsewhere) {
    redirect(flashPath(back, `“${slot}” is already on ${shortDate(elsewhere.day)}. A round runs on one day — rename this one, or edit the existing round to add rooms.`, "error"));
  }

  const shared = {
    day_id: day.id, kind: "session" as const, starts_at,
    ends_at: str(formData, "ends_at"),
    title: str(formData, "title") ?? slot,
    description: str(formData, "description"),
    location: null,
    categories: null,
    slot,
    color: parseAgendaColour(str(formData, "color")),
    // A round is many rooms sharing one form, so there is nowhere to put a picture that
    // would mean anything — the image belongs to a session, not to a round (D160).
    image_url: null,
    // Rooms added to an existing round join it where it already sits; only a new round is placed.
    sort_order: existing?.items[0]?.sort_order ?? 0,
  };
  for (const code of fresh) await createAgendaItem(ev, { ...shared, code });
  if (!existing) await placeInDay(ev.id, day.id, `slot:${slot}`, starts_at);

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

  const day = await dayOf(ev.id, str(formData, "day_id"));
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
    day_id: day.id, kind: "session" as const, starts_at,
    ends_at: str(formData, "ends_at"),
    // A round with no title of its own is titled after itself. Carrying the form's seeded
    // value through a rename would leave the OLD round name sitting under the new one.
    title: (() => { const t = str(formData, "title"); return !t || t === slot ? nextSlot : t; })(),
    description: str(formData, "description"),
    location: null,
    categories: null,
    slot: nextSlot,
    color: parseAgendaColour(str(formData, "color")),
    image_url: null,
    // An edit keeps the round where the organiser put it; a new time or day re-places it below.
    sort_order: current.items[0].sort_order,
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
    // `shared` carries image_url: null for the create path below; a room being UPDATED keeps
    // whatever it has. This function sends every column explicitly, so inheriting that null
    // would silently clear an image this form never offered to change.
    await updateAgendaItem(room.id, ev.id, { ...shared, code: nextCode, image_url: room.image_url });
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

  const first = current.items[0];
  if (day.id !== first.day_id || starts_at !== first.starts_at) {
    await placeInDay(ev.id, day.id, `slot:${nextSlot}`, starts_at);
  }

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

  const day = await dayOf(ev.id, str(formData, "day_id"));
  const starts_at = str(formData, "starts_at");
  const title = str(formData, "title");
  if (!day || !starts_at) redirect(flashPath(back, "A session needs a day and a start time.", "error"));

  const isBreakout = str(formData, "preset") === "breakout";
  const slot = isBreakout ? str(formData, "slot") : item.slot;
  const code = isBreakout ? str(formData, "code") : item.code;
  if (isBreakout && (!slot || !code)) redirect(flashPath(back, "A breakout room needs a round and a room.", "error"));

  // The breakout form has no picker, so it must pass the stored value through untouched
  // rather than let `nextImage` read a field that is not on its form.
  let image: ImageChange = { url: item.image_url, stale: null };
  if (!isBreakout) {
    try {
      image = await nextImage(formData, "image", item.image_url, { orgId, eventId, kind: "agenda" });
    } catch (e) {
      redirect(flashPath(back, (e as Error).message, "error"));
    }
  }

  await updateAgendaItem(itemId, ev.id, {
    day_id: day.id,
    kind: "session",
    starts_at,
    ends_at: str(formData, "ends_at"),
    title: title ?? slot ?? item.title,
    description: str(formData, "description"),
    location: isBreakout ? null : str(formData, "location"),
    categories: isBreakout ? null : categoriesFromValues(formData.getAll("categories").map(String)),
    slot,
    code,
    color: parseAgendaColour(str(formData, "color")),
    image_url: image.url,
    sort_order: item.sort_order,
  });
  // Only after the row naming the new object is written, exactly as Settings orders it.
  await deleteEventImage(image.stale);

  // A new time or a new day re-places the row by time; any other edit leaves it where the
  // organiser put it (D197).
  if (day.id !== item.day_id || starts_at !== item.starts_at) {
    await placeInDay(ev.id, day.id, itemKey({ ...item, slot }), starts_at);
  }

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

/**
 * An image placed in the programme (D196): a picture, an optional caption, optional
 * categories, and no time - so it goes to the end of its day and the organiser drags it.
 */
export async function addAgendaImageAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const back = agendaBack(eventId);
  const day = await dayOf(ev.id, str(formData, "day_id"));
  if (!day) redirect(flashPath(back, "That day no longer exists.", "error"));
  let image: ImageChange = { url: null, stale: null };
  try {
    image = await nextImage(formData, "image", null, { orgId, eventId, kind: "agenda" });
  } catch (e) {
    redirect(flashPath(back, (e as Error).message, "error"));
  }
  if (!image.url) redirect(flashPath(back, "Choose an image to add.", "error"));
  const id = await createAgendaItem(ev, {
    day_id: day.id,
    kind: "image",
    starts_at: null,
    ends_at: null,
    // `title` is not null in the table; an uncaptioned image stores "".
    title: str(formData, "title") ?? "",
    description: null,
    location: null,
    categories: categoriesFromValues(formData.getAll("categories").map(String)),
    slot: null,
    code: null,
    color: null,
    image_url: image.url,
    sort_order: 0,
  });
  await placeInDay(ev.id, day.id, id, null);
  revalidatePath(back);
  redirect(flashPath(back, "Image added. Drag it to where it belongs in the day."));
}

export async function updateAgendaImageAction(eventId: string, itemId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const back = agendaBack(eventId);
  const item = (await listAgenda(ev.id)).find((i) => i.id === itemId && i.kind === "image");
  if (!item) redirect(flashPath(back, "That image no longer exists.", "error"));
  const day = await dayOf(ev.id, str(formData, "day_id"));
  if (!day) redirect(flashPath(back, "That day no longer exists.", "error"));
  let image: ImageChange = { url: item.image_url, stale: null };
  try {
    image = await nextImage(formData, "image", item.image_url, { orgId, eventId, kind: "agenda" });
  } catch (e) {
    redirect(flashPath(back, (e as Error).message, "error"));
  }
  // The row IS the picture; removing it means deleting the row, which the Delete button does.
  if (!image.url) redirect(flashPath(back, "An image row needs its image. To remove it, delete the row.", "error"));
  await updateAgendaItem(itemId, ev.id, {
    day_id: day.id,
    kind: "image",
    starts_at: null,
    ends_at: null,
    title: str(formData, "title") ?? "",
    description: null,
    location: null,
    categories: categoriesFromValues(formData.getAll("categories").map(String)),
    slot: null,
    code: null,
    color: null,
    image_url: image.url,
    sort_order: item.sort_order,
  });
  await deleteEventImage(image.stale);
  if (day.id !== item.day_id) await placeInDay(ev.id, day.id, itemId, null);
  revalidatePath(back);
  redirect(flashPath(back, "Image saved."));
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

/**
 * Sends one approved WhatsApp template to every attendee who has not had it.
 *
 * The organiser picks the template and says what fills each `{{n}}` (whatsapp-templates.ts);
 * the link button, when there is one, always carries the attendee's own token. The template is
 * read from Meta again here rather than trusted from the form, so a template paused or edited
 * since the page loaded is refused, not sent with the wrong number of values.
 *
 * Idempotent by construction: `runSend` claims each attendee before messaging them, keyed on
 * the template, so pressing this twice — or re-running after a half-finished blast — reaches
 * only the people who have not had THAT template. Attendees whose number could not be read are
 * never claimed and never sent to; the page lists them by name so the masterlist can be
 * corrected and the button pressed again.
 */
export async function sendWhatsappAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const here = `/admin/events/${eventId}/whatsapp`;
  const fail = (message: string): never => redirect(flashPath(here, message, "error"));

  const list = await listTemplates();
  if (!list.ok) fail(`Could not read the templates from WhatsApp: ${list.error}`);
  const name = String(formData.get("template") ?? "");
  const template = list.ok ? list.templates.map(readTemplate).find((t) => t?.name === name) : null;
  if (!template) return fail("That template is not approved for sending. Reload the page and pick another.");

  const sources = Array.from({ length: template.variables }, (_, i) => String(formData.get(`var_${i + 1}`) ?? ""));
  const custom = Array.from({ length: template.variables }, (_, i) => String(formData.get(`custom_${i + 1}`) ?? "").trim());
  if (!sources.every(isSource)) fail("Choose what fills every variable in the message.");
  // Meta rejects an empty parameter outright, for every recipient.
  if (sources.some((src, i) => src === "custom" && !custom[i])) fail("Fill in the custom text, or choose something else for it.");
  if (sources.includes("venue") && !ev.venue_name?.trim()) fail("This event has no venue set. Add it in Settings, or choose something else.");

  // Who it goes to (whatsapp-targets.ts), worked out here from the database rather than from
  // anything the page counted: the audience key is the only thing trusted from the form.
  const audience = String(formData.get("audience") ?? "all");
  const again = formData.get("again") === "on";
  const [attendees, bookingActivities, bookings] = await Promise.all([
    listAttendees(eventId), listActivities(eventId, "booking"), listBookings(eventId),
  ]);
  const bookedBy = new Map<string, Set<string>>();
  for (const b of bookings) (bookedBy.get(b.activity_id) ?? bookedBy.set(b.activity_id, new Set()).get(b.activity_id)!).add(b.attendee_id);
  const fields = eventFields(ev.registration_questions, ev.attendee_fields);
  const reachable = splitAudience(attendees, fields).recipients;
  if (reachable.length === 0) fail("Nobody on this event has a number we can send to.");
  // "pick" is whoever was ticked - as ids, kept only when they are this event's reachable
  // attendees, so a posted id can never message somebody else's guest.
  const picked = new Set(formData.getAll("to").map(String));
  const nonce = String(formData.get("nonce") ?? "");
  if (audience !== "pick" && inAudience(audience, { id: "", category: null }, bookingActivities, bookedBy) === null) fail("That audience no longer exists. Reload the page and pick another.");
  const recipients = audience === "pick"
    ? reachable.filter((r) => picked.has(r.attendee.id))
    : reachable.filter((r) => inAudience(audience, r.attendee, bookingActivities, bookedBy));
  if (recipients.length === 0) fail(audience === "pick" ? "Tick at least one person to send to." : "Nobody in that audience has a number we can send to.");
  const today = nowInKL().date;

  const eventDates = formatDateRange(ev.starts_on, ev.ends_on);
  const result = await runSend({
    orgId,
    eventId,
    template: template.name,
    language: template.language,
    recipients,
    params: (a) => {
      const values = { attendeeName: a.name, eventName: ev.name, eventDates, venue: ev.venue_name ?? "" };
      return {
        bodyParams: sources.map((src, i) => sourceValue(src as Source, values, custom[i])),
        buttonParam: template.button ? a.token : undefined,
      };
    },
    // Once per attendee per template and audience; with Send again, once more per day;
    // picked people every time they are picked (sendKey).
    dedupeKey: (a) => sendKey({ template: template.name, audience, attendeeId: a.id, again, today, nonce }),
  });

  revalidatePath(here);
  const parts = [`${result.sent} sent`];
  if (result.skipped) parts.push(`${result.skipped} already had it`);
  if (result.failed) parts.push(`${result.failed} failed`);
  redirect(flashPath(here, parts.join(", ") + ".", result.failed ? "error" : "ok"));
}

/**
 * The picture for one of the launcher's own sections, set from that section's admin page
 * (D222). Upload, replace or remove - the same ImageField as a tile's icon. Removing it puts
 * the portal's default illustration back.
 */
export async function saveSectionIconAction(eventId: string, section: IconSection, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  if (!ICON_SECTIONS.includes(section)) redirect(flashPath(`/admin/events/${eventId}`, "That section has no icon.", "error"));
  const back = section === "agenda" ? agendaBack(eventId) : infoBack(eventId);
  const current = sectionIcons(ev.section_icons)[section];
  let image: ImageChange = { url: current, stale: null };
  try {
    image = await nextImage(formData, "icon_image", current, { orgId: ev.org_id, eventId, kind: "tile-icon" });
  } catch (e) {
    redirect(flashPath(back, (e as Error).message, "error"));
  }
  const next: Record<string, unknown> = { ...(ev.section_icons ?? {}) };
  if (image.url) next[section] = image.url;
  else delete next[section];
  await updateEvent(eventId, { section_icons: next });
  await deleteEventImage(image.stale);
  revalidatePath(back);
  redirect(flashPath(back, image.url ? "Icon saved." : "Icon reset to the default."));
}
