import type { AttendeeField } from "@/lib/attendee-fields";

/** An attendee column the organiser chose to carry on every export (`events.export_fields`). */
export type ExportColumn = { key: string; label: string };

/**
 * The event's chosen export columns, resolved against its current fields: in the order they
 * were chosen, under their current labels. A key whose field has since been deleted is dropped
 * quietly — an export is not the place to explain it — and so is any key in `exclude`, which
 * an export passes for a fact it already carries as a fixed column (Table on Personal links),
 * so no value prints twice.
 */
export function exportColumns(fields: AttendeeField[], chosen: string[], exclude: string[] = []): ExportColumn[] {
  const skip = new Set(exclude);
  return chosen.flatMap((key) => {
    const f = fields.find((x) => x.key === key);
    return f && !skip.has(key) ? [{ key: f.key, label: f.label }] : [];
  });
}

/** What the Exports page's picker posted, reduced to real field keys, once each, in order. */
export function exportFieldsFromForm(posted: string[], fields: AttendeeField[]): string[] {
  const known = new Set(fields.map((f) => f.key));
  return Array.from(new Set(posted.map((p) => p.trim()).filter((p) => known.has(p))));
}
