import ExcelJS from "exceljs";
import type { Attendee, Checkin, Checkpoint, Booth, BoothStamp } from "@/lib/types";
import type { AttendeeField } from "@/lib/attendee-fields";
import type { SlotRoster } from "@/lib/breakouts";
import { completionByAttendee } from "@/lib/booths";
import { fieldValue } from "@/lib/attendee-values";
import { FORMER_BUILTIN_KEYS } from "@/lib/columns";

const FORMER_BUILTIN_KEY_SET = new Set<string>(FORMER_BUILTIN_KEYS);

export type LinkRow = { name: string; email: string | null; category: string | null; table_no: string | null; link: string };

export function buildLinksWorkbook(rows: LinkRow[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Links");
  ws.addRow(["Name", "Email", "Category", "Table", "Link"]);
  for (const r of rows) ws.addRow([r.name, r.email, r.category, r.table_no, r.link]);
  ws.columns?.forEach((c) => { c.width = 24; });
  return wb;
}

/**
 * The extra columns, in the order the sheet should carry them: the event's own defined
 * columns first, under their current labels, then anything else that turned up in
 * `extra` — a header an imported masterlist brought along that nobody declared — under
 * its raw key, so importing a spreadsheet and exporting it again is lossless.
 *
 * Phone and table_no are excluded even once they are ordinary fields: the sheet already
 * carries them as fixed columns (via attendeeSheetRow), so leaving them in here would print
 * every value twice. Company is not excluded — it has no fixed column any more, so this is
 * the only path that can put it on the sheet, and it takes it on the same terms as Dietary
 * or Shirt Size.
 */
export function attendanceExtraColumns(attendees: Pick<Attendee, "extra">[], fields: AttendeeField[]): { key: string; label: string }[] {
  const relevant = fields.filter((f) => !FORMER_BUILTIN_KEY_SET.has(f.key));
  const defined = new Set(relevant.map((f) => f.key));
  const seen = Array.from(new Set(attendees.flatMap((a) => Object.keys(a.extra ?? {}))));
  return [...relevant.map((f) => ({ key: f.key, label: f.label })), ...seen.filter((k) => !defined.has(k) && !FORMER_BUILTIN_KEY_SET.has(k)).map((k) => ({ key: k, label: k }))];
}

/**
 * One attendee's row for the Attendance sheet, pulled out so the fixed-column assembly is
 * testable without building a workbook. Phone and Table read through fieldValue so they keep
 * working once the columns they used to be are dropped; `extraColumns` must already have
 * those two keys filtered out (attendanceExtraColumns does that) or a value prints twice.
 */
export function attendeeSheetRow(a: Pick<Attendee, "name" | "email" | "category" | "source" | "extra">, extraColumns: { key: string }[]): unknown[] {
  return [
    a.name, a.email, fieldValue(a, "phone"), a.category, fieldValue(a, "table_no"),
    a.source, ...extraColumns.map((c) => a.extra?.[c.key] ?? ""),
  ];
}

export function buildAttendanceWorkbook(attendees: Attendee[], checkpoints: Pick<Checkpoint, "id" | "name">[], checkins: Pick<Checkin, "checkpoint_id" | "attendee_id" | "scanned_at" | "scanned_by">[], scannerNames: Record<string, string>, fields: AttendeeField[] = []): ExcelJS.Workbook {
  const extraColumns = attendanceExtraColumns(attendees, fields);
  const byKey = new Map(checkins.map((c) => [`${c.checkpoint_id}:${c.attendee_id}`, c]));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Attendance");
  ws.addRow(["Name", "Email", "Phone", "Category", "Table", "Source", ...extraColumns.map((c) => c.label), ...checkpoints.flatMap((c) => [`${c.name} checked in`, `${c.name} time`, `${c.name} scanned by`])]);
  for (const a of attendees) {
    const row = attendeeSheetRow(a, extraColumns);
    for (const c of checkpoints) {
      const ci = byKey.get(`${c.id}:${a.id}`);
      row.push(ci ? "Yes" : "No", ci ? new Date(ci.scanned_at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" }) : "", ci?.scanned_by ? scannerNames[ci.scanned_by] ?? ci.scanned_by : "");
    }
    ws.addRow(row);
  }
  ws.columns?.forEach((c) => { c.width = 20; });
  return wb;
}

export type RosterPerson = { name: string; email: string | null };

/** Strips every character Excel forbids in a sheet name: `: \ / ? * [ ]`. */
export function sanitizeSheetNamePart(s: string): string {
  return s.replace(/[:\\/?*[\]]/g, "-").trim();
}

/**
 * Truncates an already-sanitised sheet name to Excel's 31-character cap and makes it unique
 * against `taken`. Shared by every export that builds one sheet per room/session/etc., so a
 * name collision after truncation (two long titles that agree on their first 31 characters)
 * cannot silently make ExcelJS throw at the second `addWorksheet` — or, worse, silently drop
 * a sheet by both call sites picking the same fallback independently.
 *
 * Checks and records `taken` case-insensitively, and does the recording itself (the caller
 * never calls `taken.add`): ExcelJS's own duplicate-name check lowercases both sides
 * (`worksheet.js`) before comparing, so "Morning" and "morning" are the same sheet name to it
 * even though they are different strings to a case-sensitive `Set`. Two sessions named that way
 * would have passed a case-sensitive check here and then thrown inside `addWorksheet`, failing
 * the whole download.
 */
export function uniqueSheetName(base: string, taken: Set<string>): string {
  const claim = (name: string): string => { taken.add(name.toLowerCase()); return name; };
  const truncated = base.slice(0, 31);
  if (!taken.has(truncated.toLowerCase())) return claim(truncated);
  for (let n = 2; n < 100; n++) {
    const candidate = `${truncated.slice(0, 31 - String(n).length - 1)} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return claim(candidate);
  }
  return claim(truncated.slice(0, 29) + "~~");
}

/**
 * A sheet name Excel will actually accept: no : \ / ? * [ ], 31 characters, and unique within
 * the workbook. Two rooms called "3A" in rounds whose names collide after truncation would
 * otherwise make ExcelJS throw at the second one.
 */
export function rosterSheetName(slot: string, code: string, taken: Set<string>): string {
  const base = `${sanitizeSheetNamePart(slot)} · ${sanitizeSheetNamePart(code) || "no code"}`;
  return uniqueSheetName(base, taken);
}

/** The title for one activity session's sheet: "<activity> — <session>", sanitised and unique. */
export function activitySheetName(activityName: string, sessionTitle: string, taken: Set<string>): string {
  return uniqueSheetName(`${sanitizeSheetNamePart(activityName)} — ${sanitizeSheetNamePart(sessionTitle)}`, taken);
}

/** The title for an activity's "who has not booked" sheet. */
export function activityUnbookedSheetName(activityName: string, taken: Set<string>): string {
  return uniqueSheetName(`${sanitizeSheetNamePart(activityName)} — Not booked`, taken);
}

/**
 * One printable sheet per room, plus one per round listing whoever has no room.
 *
 * Per room rather than one grid, because the artefact a facilitator asks for is the page for
 * their own room. The cross-tab of everyone against every round is the file the client sent
 * you in the first place.
 *
 * Each room's `attendeeIds` already arrives sorted alphabetically by `rosters` (it sorts into
 * the order of the `attendeeIds` it was given, which `listAttendees` orders by name) — rows are
 * written in that order as-is, with no re-sort here.
 */
export function buildRosterWorkbook(slots: SlotRoster[], people: Map<string, RosterPerson>): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const taken = new Set<string>();
  const sheet = (slot: string, code: string, ids: string[]) => {
    // rosterSheetName (via uniqueSheetName) claims the name in `taken` itself.
    const name = rosterSheetName(slot, code, taken);
    const ws = wb.addWorksheet(name);
    ws.addRow(["Name", "Email"]);
    for (const id of ids) {
      const p = people.get(id);
      if (p) ws.addRow([p.name, p.email]);
    }
    ws.columns = [{ width: 28 }, { width: 28 }];
  };
  for (const s of slots) {
    for (const r of s.rooms) sheet(s.slot, r.code || "no code", r.attendeeIds);
    if (s.unassignedIds.length) sheet(s.slot, "unassigned", s.unassignedIds);
  }
  return wb;
}

export type ActivitySessionRoster = { activityName: string; sessionTitle: string; attendeeIds: string[] };
export type ActivityUnbookedRoster = { activityName: string; attendeeIds: string[] };

/**
 * The door list: one printable sheet per session, titled "<activity> — <session>", plus one
 * sheet per required activity listing whoever is eligible and has booked nothing.
 *
 * Same shape as `buildRosterWorkbook` on purpose — one sheet per bookable unit plus a sheet for
 * whoever has none — and it reuses the same "Name"/"Email" columns a printed roster carries.
 * `attendeeIds` on both inputs must already be in the order the caller wants printed (the
 * route sorts into `listAttendees` order); this only writes rows.
 *
 * A session with no bookings still gets its sheet, header and all: an empty room is
 * information the door list has to state, not a row this function is entitled to skip.
 *
 * When `sessions` and `unbooked` are both empty — an event whose activities have no sessions
 * yet, or no required activity to report on — this still writes one sheet. A workbook with no
 * worksheets is not a valid xlsx (Excel refuses to open it), which would turn "nothing to
 * print yet" into a download that silently fails; a sheet that says so in words is the honest
 * version of the same fact.
 */
export function buildActivityRostersWorkbook(
  sessions: ActivitySessionRoster[],
  unbooked: ActivityUnbookedRoster[],
  people: Map<string, RosterPerson>,
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const taken = new Set<string>();
  // activitySheetName / activityUnbookedSheetName (via uniqueSheetName) claim the name in
  // `taken` themselves, so this closure only ever receives an already-unique name to write.
  const sheet = (name: string, ids: string[]) => {
    const ws = wb.addWorksheet(name);
    ws.addRow(["Name", "Email"]);
    for (const id of ids) {
      const p = people.get(id);
      if (p) ws.addRow([p.name, p.email]);
    }
    ws.columns = [{ width: 28 }, { width: 28 }];
  };
  for (const s of sessions) sheet(activitySheetName(s.activityName, s.sessionTitle, taken), s.attendeeIds);
  for (const u of unbooked) sheet(activityUnbookedSheetName(u.activityName, taken), u.attendeeIds);
  if (sessions.length === 0 && unbooked.length === 0) {
    const ws = wb.addWorksheet("No sessions");
    ws.addRow(["This event's activities have no sessions yet."]);
    ws.columns = [{ width: 48 }];
  }
  return wb;
}

/**
 * The passport, as its own sheet (D100).
 *
 * Deliberately not folded into the attendance workbook: five booths there would add fifteen
 * columns to a file that answers a different question, and a booth visit is not attendance.
 * One row per attendee, one column per booth, then the two numbers anyone actually reads —
 * how many stamps, and whether the card is full.
 */
export type FormExportRow = { name: string; email: string | null; category: string | null; submittedOn: string; createdAt: string; answers: Record<string, string> };
export type FormSheet = { formName: string; questions: { key: string; label: string }[]; rows: FormExportRow[] };

/**
 * Every answer key that turns up in `answerSets` but is not among `currentKeys`, in the order
 * each was first seen — a RETIRED question: the admin editor lets an organiser rename a
 * question's key (or clear the box so it re-derives from the label) after submissions already
 * exist under the old one, and an answer never moves once written (D166). Both read surfaces
 * — this export and `SubmissionTable` — share this rather than each recomputing it, so the two
 * cannot quietly drift on what counts as retired, the same reasoning `attendanceExtraColumns`
 * already carries for attendee columns.
 */
export function retiredAnswerKeys(currentKeys: Iterable<string>, answerSets: Record<string, string>[]): string[] {
  const current = new Set(currentKeys);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const answers of answerSets) {
    for (const key of Object.keys(answers)) {
      if (current.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

/**
 * One sheet per form, named after it, fixed columns first (Name, Email, Category, Submitted,
 * Timestamp — spec §6: "attendee, email, category, the day, the timestamp") then one column
 * per question in the order the form declares them, then one column per RETIRED key: an
 * answer key that shows up in the data but not in `questions` any more, because the admin
 * editor lets an organiser rename a question's key (or clear the box so it re-derives from
 * the label) after submissions already exist under the old one.
 *
 * Every answer is looked up **by key**, never by position: a form whose questions were
 * reordered, or had one removed, since a given submission was made would otherwise file that
 * submission's answers under the wrong headings — silently, since the sheet would still have
 * the right shape. `answers[q.key] ?? ""` is the whole of that lookup; there is no zip against
 * `questions` by index anywhere here.
 *
 * The retired columns exist so that rename never makes a real, immutable answer (D166)
 * unreachable through this export — dropping it silently would be worse than a column headed
 * plainly as retired. Headed `<key> (retired)` rather than a stored label, because the label
 * that went with that key does not exist here any more either.
 *
 * A workbook with no worksheets is not a valid xlsx (buildActivityRostersWorkbook's note
 * applies here too), so an event with no forms still gets one sheet that says so in words
 * rather than a download that fails silently.
 */
export function buildFormsWorkbook(forms: FormSheet[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  if (forms.length === 0) {
    const ws = wb.addWorksheet("No forms");
    ws.addRow(["This event has no forms yet."]);
    ws.columns = [{ width: 48 }];
    return wb;
  }
  const taken = new Set<string>();
  for (const f of forms) {
    const retiredKeys = retiredAnswerKeys(f.questions.map((q) => q.key), f.rows.map((r) => r.answers));
    const ws = wb.addWorksheet(uniqueSheetName(sanitizeSheetNamePart(f.formName), taken));
    ws.addRow([
      "Name", "Email", "Category", "Submitted", "Timestamp",
      ...f.questions.map((q) => q.label),
      ...retiredKeys.map((k) => `${k} (retired)`),
    ]);
    for (const r of f.rows) {
      ws.addRow([
        r.name, r.email, r.category, r.submittedOn, r.createdAt,
        ...f.questions.map((q) => r.answers[q.key] ?? ""),
        ...retiredKeys.map((k) => r.answers[k] ?? ""),
      ]);
    }
    ws.columns?.forEach((c) => { c.width = 24; });
  }
  return wb;
}

export function buildPassportWorkbook(attendees: Attendee[], booths: Booth[], stamps: BoothStamp[], required: number | null): ExcelJS.Workbook {
  const completion = completionByAttendee(booths, stamps, required);
  const stamped = new Set(stamps.map((s) => `${s.booth_id}:${s.attendee_id}`));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Booth Passport");
  ws.addRow(["Name", "Email", "Category", ...booths.map((b) => b.name), "Stamps", "Completed"]);
  for (const a of attendees) {
    const c = completion.get(a.id) ?? { collected: 0, complete: false };
    ws.addRow([
      a.name, a.email, a.category,
      ...booths.map((b) => (stamped.has(`${b.id}:${a.id}`) ? "Yes" : "No")),
      c.collected,
      c.complete ? "Yes" : "No",
    ]);
  }
  ws.columns?.forEach((col) => { col.width = 20; });
  return wb;
}
