"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEventAccess } from "@/lib/access";
import { flashPath } from "@/lib/flash";
import { serviceClient } from "@/lib/supabase/service";
import { getGroup } from "@/lib/db/groups";
import { requireFeature } from "@/features/catalogue";
import { readAdjustment } from "@/lib/adjustments";
import { addAdjustment, removeAdjustment } from "./db";

/**
 * D704: the organiser's ad hoc points. Only a tournament or a scored challenge in this event takes
 * them, only for this event's groups, and every write lands back on that activity's Leaderboard tab.
 */

const leaderboard = (eventId: string, activityId: string) => `/admin/events/${eventId}/activities/${activityId}?tab=leaderboard`;

async function guard(eventId: string, activityId: string) {
  const { actor, ev } = await requireEventAccess(eventId);
  const list = `/admin/events/${ev.id}/activities`;
  await requireFeature(ev.id, "engagement", list);
  const { data, error } = await serviceClient().from("activities").select("id, kind, scoring").eq("id", activityId).eq("event_id", ev.id).maybeSingle();
  if (error) throw error;
  const ok = data && (data.kind === "tournament" || (data.kind === "submission" && data.scoring));
  if (!ok) redirect(flashPath(list, "That leaderboard no longer exists.", "error"));
  return { actor, ev, back: leaderboard(ev.id, activityId) };
}

function done(eventId: string, activityId: string, back: string, message: string): never {
  revalidatePath(`/admin/events/${eventId}/activities/${activityId}`);
  redirect(flashPath(back, message));
}

export async function addAdjustmentAction(eventId: string, activityId: string, fd: FormData) {
  const { actor, ev, back } = await guard(eventId, activityId);
  const form = { text: (k: string) => String(fd.get(k) ?? "").trim() };
  const groupId = form.text("group");
  const group = /^[0-9a-f-]{36}$/i.test(groupId) ? await getGroup(ev.id, groupId) : null;
  if (!group) redirect(flashPath(back, "Pick a group.", "error"));
  let read: { points: number; reason: string };
  try {
    read = readAdjustment(form);
  } catch (e) {
    redirect(flashPath(back, (e as Error).message, "error"));
  }
  await addAdjustment({ activityId, groupId: group.id, points: read.points, reason: read.reason, addedBy: actor.email });
  done(ev.id, activityId, back, `${read.points > 0 ? "+" : ""}${read.points} points for ${group.name}.`);
}

export async function removeAdjustmentAction(eventId: string, activityId: string, id: string) {
  const { ev, back } = await guard(eventId, activityId);
  await removeAdjustment(activityId, id);
  done(ev.id, activityId, back, "Points removed.");
}
