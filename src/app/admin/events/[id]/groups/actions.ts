"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEventAccess } from "@/lib/access";
import { updateEvent } from "@/lib/db/events";
import { createGroup, createGroups, renameGroup, deleteGroup, getGroup, listGroups, setGroupMembers, setGroupImage, GroupNameRefused } from "@/lib/db/groups";
import { nextImage, deleteEventImage, type ImageChange } from "@/lib/db/media";
import { listAttendees } from "@/lib/db/attendees";
import { eventFields } from "@/lib/attendee-fields";
import { planGroupsFromColumn } from "@/lib/groups";
import { exportFieldsFromForm } from "@/lib/export-columns";
import { flashPath } from "@/lib/flash";
import { parseIds } from "@/lib/bulk";

async function event(eventId: string) {
  return (await requireEventAccess(eventId)).ev;
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
  const ev = await event(eventId);
  const group = await getGroup(ev.id, groupId);
  if (!group) redirect(flashPath(list(eventId), "That group no longer exists.", "error"));
  await deleteGroup(ev.id, groupId);
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
  const ev = await event(eventId);
  if (!(await getGroup(ev.id, groupId))) redirect(flashPath(list(eventId), "That group no longer exists.", "error"));
  const ids = parseIds(String(fd.get("ids") ?? ""), new Set((await listAttendees(ev.id)).map((a) => a.id)));
  if (ids.length) await setGroupMembers(ev.id, ids, groupId);
  revalidatePath(detail(eventId, groupId));
  redirect(flashPath(detail(eventId, groupId), ids.length === 1 ? "Added to the group." : `${ids.length} added to the group.`));
}

export async function removeFromGroupAction(eventId: string, groupId: string, attendeeId: string) {
  const ev = await event(eventId);
  // F6: scoped to `groupId` so a stale page can't pull someone out of a group they were just
  // moved to since this page was loaded.
  await setGroupMembers(ev.id, [attendeeId], null, groupId);
  revalidatePath(detail(eventId, groupId));
  redirect(flashPath(detail(eventId, groupId), "Removed from the group."));
}

/** D347. The plan is recomputed here from fresh rows; the preview only showed it. */
export async function buildGroupsFromColumnAction(eventId: string, fd: FormData) {
  const ev = await event(eventId);
  const field = String(fd.get("field") ?? "");
  const known = field === "category" || eventFields(ev.registration_questions, ev.attendee_fields).some((f) => f.key === field);
  if (!known) redirect(flashPath(list(eventId), "Pick a column to build groups from.", "error"));
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
  revalidatePath(list(eventId));
  redirect(flashPath(list(eventId), `${made.length} group${made.length === 1 ? "" : "s"} created, ${plan.moves.length} attendee${plan.moves.length === 1 ? "" : "s"} placed.`));
}
