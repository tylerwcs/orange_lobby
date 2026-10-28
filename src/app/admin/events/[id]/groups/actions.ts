"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEventAccess } from "@/lib/access";
import { updateEvent } from "@/lib/db/events";
import { createGroup, createGroups, renameGroup, deleteGroup, getGroup, listGroups, setGroupMembers, setGroupImage, GroupNameRefused } from "@/lib/db/groups";
import { nextImage, deleteEventImage, type ImageChange } from "@/lib/db/media";
import { getAttendee, listAttendees } from "@/lib/db/attendees";
import { people, recordChange, type NewChange, type PersonChange } from "@/features/attendee-log";
import type { Attendee } from "@/lib/types";
import { eventFields } from "@/lib/attendee-fields";
import { planGroupsFromColumn } from "@/lib/groups";
import { exportFieldsFromForm } from "@/lib/export-columns";
import { flashPath } from "@/lib/flash";
import { parseIds } from "@/lib/bulk";

async function event(eventId: string) {
  return (await requireEventAccess(eventId)).ev;
}

/**
 * D745: the log row for people put in a group. Everyone already in it is left out, and a move
 * that changes nobody is null (no row). Each person keeps the group they came from; the summary
 * names the group, never a person, unless the row is about one.
 */
function movedToGroup(moves: Pick<Attendee, "id" | "name" | "email" | "group_id">[], target: string, groupName: Map<string, string>, summary: (n: number, who: string) => string): NewChange | null {
  const changed = moves.filter((a) => a.group_id !== target);
  if (changed.length === 0) return null;
  const list = changed.map((a): PersonChange => ({
    attendeeId: a.id, name: a.name, email: a.email,
    fields: [{ label: "Group", before: (a.group_id && groupName.get(a.group_id)) || "", after: groupName.get(target) ?? "" }],
  }));
  return { kind: "group_move", summary: summary(changed.length, changed[0].name), people: list };
}

const list = (eventId: string) => `/admin/events/${eventId}/groups`;
const detail = (eventId: string, groupId: string) => `${list(eventId)}/${groupId}`;

/** Only a name refusal becomes a flash; anything else is a real failure and re-throws. */
const refusal = (e: unknown) => (e instanceof GroupNameRefused ? e.message : null);

export async function createGroupAction(eventId: string, fd: FormData) {
  const ev = await event(eventId);
  let id: string;
  try {
    id = (await createGroup(ev, String(fd.get("name") ?? ""))).id;
  } catch (e) {
    const msg = refusal(e);
    if (!msg) throw e;
    redirect(flashPath(list(eventId), msg, "error"));
  }
  revalidatePath(list(eventId));
  redirect(flashPath(detail(eventId, id), "Group created. Add its members."));
}

export async function renameGroupAction(eventId: string, groupId: string, fd: FormData) {
  const ev = await event(eventId);
  const back = String(fd.get("back") ?? "") === "detail" ? detail(eventId, groupId) : list(eventId);
  try {
    await renameGroup(ev.id, groupId, String(fd.get("name") ?? ""));
  } catch (e) {
    const msg = refusal(e);
    if (!msg) throw e;
    redirect(flashPath(back, msg, "error"));
  }
  revalidatePath(list(eventId));
  redirect(flashPath(back, "Group renamed."));
}

/**
 * D506: the group's picture. Uploaded before the row is written, so a file we will not take
 * leaves the old picture in place; the old object goes only after the row has saved (D160).
 */
export async function setGroupImageAction(eventId: string, groupId: string, fd: FormData) {
  const ev = await event(eventId);
  const group = await getGroup(ev.id, groupId);
  if (!group) redirect(flashPath(list(eventId), "That group no longer exists.", "error"));
  let image: ImageChange = { url: group.image_url, stale: null };
  try {
    image = await nextImage(fd, "image", group.image_url, { orgId: ev.org_id, eventId: ev.id, kind: "group" });
  } catch (e) {
    redirect(flashPath(detail(eventId, groupId), (e as Error).message, "error"));
  }
  await setGroupImage(ev.id, group.id, image.url);
  await deleteEventImage(image.stale);
  revalidatePath(list(eventId));
  revalidatePath(detail(eventId, groupId));
  redirect(flashPath(detail(eventId, groupId), image.url ? "Picture saved." : "Picture removed."));
}

export async function deleteGroupAction(eventId: string, groupId: string) {
  const { ev, actor } = await requireEventAccess(eventId);
  const group = await getGroup(ev.id, groupId);
  if (!group) redirect(flashPath(list(eventId), "That group no longer exists.", "error"));
  // D745: the foreign key nulls every member's group_id, so who was in it is read before the delete.
  // Cancelled members lose the group too, so they are included and listed.
  const members = (await listAttendees(ev.id, undefined, "wide", { includeCancelled: true })).filter((a) => a.group_id === groupId);
  await deleteGroup(ev.id, groupId);
  await recordChange(ev.id, actor, members.length === 0 ? null : {
    kind: "group_delete",
    summary: `Deleted group ${group.name}: ${people(members.length)} left without a group`,
    people: members.map((a): PersonChange => ({ attendeeId: a.id, name: a.name, email: a.email, fields: [{ label: "Group", before: group.name, after: "" }] })),
  });
  // D515: nothing leaves the bucket until no row names it (D160).
  await deleteEventImage(group.image_url);
  revalidatePath(list(eventId));
  redirect(flashPath(list(eventId), "Group deleted."));
}

/** D348: which attendee fields members see about each other. Unknown keys are dropped. */
export async function updateGroupFieldsAction(eventId: string, fd: FormData) {
  const ev = await event(eventId);
  const fields = eventFields(ev.registration_questions, ev.attendee_fields);
  await updateEvent(ev.id, { group_fields: exportFieldsFromForm(fd.getAll("group_fields").map(String), fields) });
  revalidatePath(list(eventId));
  redirect(flashPath(list(eventId), "Shared fields saved."));
}

/** D367: shows or hides Groups on the portal. D507: and whether it has the All groups tab. */
export async function setGroupTileAction(eventId: string, fd: FormData) {
  const ev = await event(eventId);
  const on = fd.get("group_tile") === "on";
  const all = fd.get("all_groups") === "on";
  await updateEvent(ev.id, { group_tile: on, all_groups: all });
  revalidatePath(list(eventId));
  const msg = !on ? "Groups is hidden from the portal." : all ? "Groups is shown, with all groups." : "Groups is shown, with each attendee's own group.";
  redirect(flashPath(list(eventId), msg));
}

/** D344: joining this group moves them out of any other; one column, one write. */
export async function addToGroupAction(eventId: string, groupId: string, fd: FormData) {
  const { ev, actor } = await requireEventAccess(eventId);
  const group = await getGroup(ev.id, groupId);
  if (!group) redirect(flashPath(list(eventId), "That group no longer exists.", "error"));
  const roster = await listAttendees(ev.id);
  const ids = parseIds(String(fd.get("ids") ?? ""), new Set(roster.map((a) => a.id)));
  if (ids.length) {
    // D742: the groups they come from are read before the write moves them.
    const chosen = new Set(ids);
    const change = movedToGroup(roster.filter((a) => chosen.has(a.id)), groupId, new Map((await listGroups(ev.id)).map((g) => [g.id, g.name])),
      (n, who) => (n === 1 ? `Moved ${who} to ${group.name}` : `Moved ${people(n)} to ${group.name}`));
    await setGroupMembers(ev.id, ids, groupId);
    await recordChange(ev.id, actor, change);
  }
  revalidatePath(detail(eventId, groupId));
  redirect(flashPath(detail(eventId, groupId), ids.length === 1 ? "Added to the group." : `${ids.length} added to the group.`));
}

export async function removeFromGroupAction(eventId: string, groupId: string, attendeeId: string) {
  const { ev, actor } = await requireEventAccess(eventId);
  // D742: read before the write. Only someone who is in this group right now is logged, which
  // is the same condition the write below is scoped to.
  const [a, group] = await Promise.all([getAttendee(attendeeId), getGroup(ev.id, groupId)]);
  // F6: scoped to `groupId` so a stale page can't pull someone out of a group they were just
  // moved to since this page was loaded.
  await setGroupMembers(ev.id, [attendeeId], null, groupId);
  if (a && group && a.event_id === ev.id && a.group_id === groupId) {
    await recordChange(ev.id, actor, {
      kind: "group_move", summary: `Removed ${a.name} from ${group.name}`,
      people: [{ attendeeId: a.id, name: a.name, email: a.email, fields: [{ label: "Group", before: group.name, after: "" }] }],
    });
  }
  revalidatePath(detail(eventId, groupId));
  redirect(flashPath(detail(eventId, groupId), "Removed from the group."));
}

/** D347. The plan is recomputed here from fresh rows; the preview only showed it. */
export async function buildGroupsFromColumnAction(eventId: string, fd: FormData) {
  const { ev, actor } = await requireEventAccess(eventId);
  const field = String(fd.get("field") ?? "");
  const column = field === "category" ? { label: "Category" } : eventFields(ev.registration_questions, ev.attendee_fields).find((f) => f.key === field);
  if (!column) redirect(flashPath(list(eventId), "Pick a column to build groups from.", "error"));
  const [attendees, groups] = await Promise.all([listAttendees(ev.id), listGroups(ev.id)]);
  const plan = planGroupsFromColumn(attendees, field, groups);
  let made: Awaited<ReturnType<typeof createGroups>>;
  try {
    made = await createGroups(ev, plan.create);
  } catch (e) {
    const msg = refusal(e);
    if (!msg) throw e;
    redirect(flashPath(list(eventId), msg, "error"));
  }
  const idByName = new Map([...groups, ...made].map((g) => [g.name.trim().toLowerCase(), g.id]));
  const byGroup = new Map<string, string[]>();
  for (const m of plan.moves) {
    const gid = idByName.get(m.groupName.trim().toLowerCase())!;
    byGroup.set(gid, [...(byGroup.get(gid) ?? []), m.attendeeId]);
  }
  for (const [gid, ids] of byGroup) await setGroupMembers(ev.id, ids, gid);
  // D742: one row for the whole build. `attendees` and `groups` were read before any write, so each
  // person's previous group is what they had; the plan already leaves out anyone in the right group.
  const names = new Map([...groups, ...made].map((g) => [g.id, g.name]));
  const was = new Map(attendees.map((a) => [a.id, a]));
  const placed = [...byGroup].flatMap(([gid, ids]) => ids.flatMap((id): PersonChange[] => {
    const a = was.get(id);
    if (!a || a.group_id === gid) return [];
    return [{ attendeeId: a.id, name: a.name, email: a.email, fields: [{ label: "Group", before: (a.group_id && names.get(a.group_id)) || "", after: names.get(gid) ?? "" }] }];
  }));
  await recordChange(ev.id, actor, placed.length === 0 ? null : {
    kind: "group_move",
    summary: `Built groups from ${column.label}: ${made.length} created, ${people(placed.length)} placed`,
    people: placed,
  });
  revalidatePath(list(eventId));
  redirect(flashPath(list(eventId), `${made.length} group${made.length === 1 ? "" : "s"} created, ${plan.moves.length} attendee${plan.moves.length === 1 ? "" : "s"} placed.`));
}
