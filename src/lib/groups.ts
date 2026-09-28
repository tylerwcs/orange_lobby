import { categoryMatches } from "@/lib/agenda";
import { liveSubmissions } from "@/lib/submissions";
import { fieldValue } from "@/lib/attendee-values";
import type { AttendeeField } from "@/lib/attendee-fields";
import type { Activity, ActivitySubmission, Attendee, EventGroup, GroupMode } from "@/lib/types";
import type { ExportColumn } from "@/lib/export-columns";

/**
 * The attendee table's Group column, and the bulk editor's key for it (D346). Leading `:`
 * keeps it out of reach of an ordinary field: `fieldKey()` builds a key with `slugify`, which
 * never produces a colon, so a custom column or an imported "Group" header can be keyed
 * "group" and still be a column distinct from this one — the same trick as "breakout:<slot>".
 */
export const GROUP_COLUMN_KEY = ":group";

export type GroupMember = Pick<Attendee, "id" | "name" | "category">;

export type GroupProgress = {
  groupId: string;
  done: boolean;
  have: number;
  need: number;
  members: { id: string; name: string; submitted: boolean }[];
  entries: ActivitySubmission[];
};

/**
 * Where one group stands on one group form: what every member sees, identically (D353).
 *
 * `members` is the group's CURRENT membership. An entry belongs to the group it was sent for
 * (D355), so an entry from someone who has since moved out is still in `entries`, and still
 * counts in `entries` mode. In `everyone` mode only current, eligible members count toward
 * "every" (D352), so that entry is listed but not counted.
 */
export function groupProgress(
  activity: Pick<Activity, "id" | "group_mode" | "group_target" | "categories">,
  groupId: string,
  members: GroupMember[],
  subs: ActivitySubmission[],
): GroupProgress {
  const entries = liveSubmissions(subs).filter((s) => s.activity_id === activity.id && s.group_id === groupId);
  const sent = new Set(entries.map((s) => s.attendee_id));
  const rows = members
    .filter((m) => categoryMatches(activity.categories, m.category))
    .map((m) => ({ id: m.id, name: m.name, submitted: sent.has(m.id) }));
  if (activity.group_mode === "entries") {
    const need = activity.group_target ?? 1;
    return { groupId, done: entries.length >= need, have: entries.length, need, members: rows, entries };
  }
  const have = rows.filter((r) => r.submitted).length;
  return { groupId, done: rows.length > 0 && have === rows.length, have, need: rows.length, members: rows, entries };
}

/** "2 of 3 entries" or "4 of 6 members submitted" (D353). */
export function groupSummary(p: Pick<GroupProgress, "have" | "need">, mode: GroupMode): string {
  if (mode === "everyone") return `${p.have} of ${p.need} members submitted`;
  return `${p.have} of ${p.need} ${p.need === 1 ? "entry" : "entries"}`;
}

export type GroupNotDone = {
  groupId: string;
  name: string;
  summary: string;
  /** Everyone mode only: current, eligible members still holding nothing. */
  waitingOn: string[];
  /** Eligible current members with no live entry for this group (D354, D360). */
  missingIds: string[];
};

/**
 * F2: every group this form still needs something from, for the desk's "Not done" tab and the
 * export's missing sheet — the one computation both read, so they can't disagree on who a group
 * form is still chasing. A group with nobody eligible is left out entirely, same as `groupProgress`
 * treats it (never done, but nothing to chase either).
 */
export function groupsNotDone(
  activity: Pick<Activity, "id" | "group_mode" | "group_target" | "categories">,
  groups: EventGroup[],
  attendees: (GroupMember & Pick<Attendee, "group_id">)[],
  subs: ActivitySubmission[],
): GroupNotDone[] {
  return groups.flatMap((g) => {
    const members = attendees.filter((a) => a.group_id === g.id);
    const p = groupProgress(activity, g.id, members, subs);
    if (p.done || p.members.length === 0) return [];
    const missing = p.members.filter((m) => !m.submitted);
    return [{
      groupId: g.id,
      name: g.name,
      summary: groupSummary(p, activity.group_mode),
      waitingOn: activity.group_mode === "everyone" ? missing.map((m) => m.name) : [],
      missingIds: missing.map((m) => m.id),
    }];
  });
}

export type GroupPlan = {
  /** New group names, in first-seen order, spelled as first seen (trimmed). */
  create: string[];
  /** Existing groups a value matched. */
  reuse: EventGroup[];
  /** Everyone whose group changes; people already in the matching group are left out. */
  moves: { attendeeId: string; groupName: string }[];
  /** How many of `moves` leave another group. */
  movingOut: number;
  /** Attendees with a blank value, left as they are. */
  blank: number;
};

const norm = (s: string) => s.trim().toLowerCase();

/**
 * D347: what "Build groups from a column" would do, so the admin sees it before Apply. Pure, so
 * the preview and the apply compute the identical plan from the same inputs.
 */
export function planGroupsFromColumn(
  attendees: Pick<Attendee, "id" | "group_id" | "category" | "extra">[],
  fieldKey: string,
  groups: EventGroup[],
): GroupPlan {
  const existing = new Map(groups.map((g) => [norm(g.name), g]));
  const create: string[] = [];
  const createdKeys = new Set<string>();
  const reused = new Map<string, EventGroup>();
  const moves: GroupPlan["moves"] = [];
  let movingOut = 0;
  let blank = 0;
  for (const a of attendees) {
    const raw = fieldKey === "category" ? (a.category ?? "").trim() : fieldValue(a, fieldKey);
    if (!raw) { blank++; continue; }
    const k = norm(raw);
    const match = existing.get(k);
    if (match) {
      reused.set(match.id, match);
      if (a.group_id === match.id) continue;
      moves.push({ attendeeId: a.id, groupName: match.name });
    } else {
      if (!createdKeys.has(k)) { createdKeys.add(k); create.push(raw); }
      moves.push({ attendeeId: a.id, groupName: create.find((n) => norm(n) === k)! });
    }
    if (a.group_id) movingOut++;
  }
  return { create, reuse: [...reused.values()], moves, movingOut, blank };
}

/** D348: the fields the admin chose to share, that this member has filled in, by label. */
export function groupFieldValues(attendee: Pick<Attendee, "extra">, keys: string[], fields: AttendeeField[]): { label: string; value: string }[] {
  return keys.flatMap((k) => {
    const f = fields.find((x) => x.key === k);
    const value = f ? fieldValue(attendee, k) : "";
    return f && value ? [{ label: f.label, value }] : [];
  });
}

/** Not a real attendee field: routes write the group's name into `extra` under this key for export only. */
export const GROUP_EXPORT_KEY = "__group";

/** D361: exports lead with Group when the event has any. */
export function withGroupColumn(columns: ExportColumn[], hasGroups: boolean): ExportColumn[] {
  return hasGroups ? [{ key: GROUP_EXPORT_KEY, label: "Group" }, ...columns] : columns;
}
