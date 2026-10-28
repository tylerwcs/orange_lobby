import type { ChangeKind } from "../types";

/** The log's "All changes" filter. Every kind sits in exactly one group (tests/attendee-log/kinds.test.ts). */
export const KIND_GROUPS: Record<"edits" | "adds" | "deletes" | "bulk" | "columns" | "cancellations" | "groups_rooms", ChangeKind[]> = {
  edits: ["edit"],
  adds: ["add", "queue_approve", "queue_move_in", "move_in_auto"],
  deletes: ["delete", "bulk_delete"],
  bulk: ["bulk_set", "import"],
  columns: ["column_add", "column_delete"],
  cancellations: ["cancel_approve", "cancel_decline", "restore"],
  groups_rooms: ["group_move", "group_delete", "room_assign", "room_delete", "round_rename"],
};

export const KIND_GROUP_LABELS: Record<keyof typeof KIND_GROUPS, string> = {
  edits: "Edits",
  adds: "Added",
  deletes: "Deletes",
  bulk: "Bulk changes",
  columns: "Columns",
  cancellations: "Cancellations",
  groups_rooms: "Groups & rooms",
};

/** The verb in the log's "Did" column. */
export const VERB: Record<ChangeKind, string> = {
  edit: "Edited",
  add: "Added",
  delete: "Deleted",
  bulk_delete: "Bulk deleted",
  bulk_set: "Bulk set",
  import: "Imported",
  column_add: "Column added",
  column_delete: "Column deleted",
  cancel_approve: "Approved cancellation",
  cancel_decline: "Declined cancellation",
  restore: "Restored",
  queue_approve: "Approved from queue",
  queue_move_in: "Moved in from waiting list",
  move_in_auto: "Moved in automatically",
  group_move: "Moved group",
  group_delete: "Deleted group",
  room_assign: "Assigned room",
  room_delete: "Deleted room",
  round_rename: "Renamed round",
};
