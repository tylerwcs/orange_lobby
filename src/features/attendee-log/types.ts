import type { AttendeeField } from "@/lib/attendee-fields";

/** One labelled value, as a person sees it in the table: "Shirt size" = "L", never the stored key. */
export type FieldValue = { label: string; value: string };
export type FieldChange = { label: string; before: string; after: string };

/**
 * One attendee a change touched. Name and email are kept as they were, so the row still
 * reads right after the attendee is deleted. `fields` is a before/after list (edits);
 * `snapshot` is everything they had (deletes and imports that added them).
 */
export type PersonChange = {
  attendeeId: string;
  name: string;
  email: string | null;
  fields?: FieldChange[];
  snapshot?: FieldValue[];
};

export type ChangeKind =
  | "edit" | "add" | "delete" | "bulk_delete" | "bulk_set" | "import"
  | "column_add" | "column_delete" | "cancel_approve" | "cancel_decline" | "restore"
  | "queue_approve" | "queue_move_in" | "move_in_auto"
  | "group_move" | "group_delete" | "room_assign" | "room_delete" | "round_rename";

export type NewChange = { kind: ChangeKind; summary: string; people: PersonChange[] };

export type AttendeeChange = NewChange & {
  id: string;
  at: string;
  actorName: string;
  actorEmail: string;
  actorKind: "admin" | "committee";
};

/** What turns an attendee row into labelled values: fields at the time, group names, rooms by attendee. */
export type LogLabels = {
  fields: AttendeeField[];
  groupName: Map<string, string>;
  roomsOf: Map<string, Record<string, string>>;
};
