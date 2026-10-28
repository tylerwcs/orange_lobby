import type { Attendee } from "@/lib/types";
import type { LogLabels, NewChange, PersonChange } from "../types";
import { attendeeValues, blank, diffValues } from "./values";

export const people = (n: number): string => (n === 1 ? "1 person" : `${n} people`);

const who = (a: Pick<Attendee, "id" | "name" | "email">): PersonChange => ({ attendeeId: a.id, name: a.name, email: a.email });

/** One attendee edited. Null when the saved values are the same as before. */
export function editChange(before: Attendee, after: Attendee, labels: LogLabels): NewChange | null {
  const fields = diffValues(attendeeValues(before, labels), attendeeValues(after, labels));
  if (fields.length === 0) return null;
  return { kind: "edit", summary: `Edited ${after.name}`, people: [{ ...who(after), fields }] };
}

/** Read the attendees before the delete: each keeps a full snapshot so the record can be re-created by hand. */
export function deleteChange(gone: Attendee[], labels: LogLabels): NewChange | null {
  if (gone.length === 0) return null;
  const list = gone.map((a): PersonChange => ({ ...who(a), snapshot: attendeeValues(a, labels) }));
  return gone.length === 1
    ? { kind: "delete", summary: `Deleted ${gone[0].name}`, people: list }
    : { kind: "bulk_delete", summary: `Deleted ${people(gone.length)}`, people: list };
}

/** One column set to one value for many people; anyone who already had it is left out. */
export function bulkSetChange(columnLabel: string, value: string, before: { a: Attendee; old: string }[]): NewChange | null {
  const now = blank(value);
  const changed = before.filter((r) => blank(r.old) !== now);
  if (changed.length === 0) return null;
  return {
    kind: "bulk_set",
    summary: `Set ${columnLabel} to ${now || "(blank)"} for ${people(changed.length)}`,
    people: changed.map((r): PersonChange => ({ ...who(r.a), fields: [{ label: columnLabel, before: blank(r.old), after: now }] })),
  };
}

/** A masterlist import: people it added (snapshot) and people it changed (before/after). Updates that changed nothing are left out. */
export function importChange(added: Attendee[], updated: { before: Attendee; after: Attendee }[], labels: LogLabels): NewChange | null {
  const list: PersonChange[] = added.map((a) => ({ ...who(a), snapshot: attendeeValues(a, labels) }));
  let changed = 0;
  for (const u of updated) {
    const fields = diffValues(attendeeValues(u.before, labels), attendeeValues(u.after, labels));
    if (fields.length === 0) continue;
    changed++;
    list.push({ ...who(u.after), fields });
  }
  if (list.length === 0) return null;
  return { kind: "import", summary: `Imported masterlist: ${added.length} added, ${changed} updated`, people: list };
}

/**
 * What the log search matches against. Must stay in step with the SQL in migration 0112
 * (`erase_from_attendee_changes`), which rebuilds `search` the same way after an erasure:
 * lower(trim(summary, actor name, actor email, then each person's name and email)).
 */
export function searchText(change: NewChange, actorName: string, actorEmail: string): string {
  const parts = [change.summary, actorName, actorEmail];
  for (const p of change.people) {
    // A missing email still takes its slot (and its space): the SQL joins name || ' ' || coalesce(email, '').
    parts.push(p.name, p.email ?? "");
  }
  return parts.join(" ").trim().toLowerCase();
}

/**
 * The inside of a PostgREST double-quoted ilike value, for `.or(`search.ilike."%${searchPattern(q)}%"`)`.
 * Two layers: ilike's own escape (\ % _, plus , ( ) which are harmless to escape there), then
 * PostgREST's quoting (\ and " get a backslash).
 */
export function searchPattern(q: string): string {
  return q
    .replace(/[\\%_,()]/g, "\\$&")
    .replace(/[\\"]/g, "\\$&");
}
