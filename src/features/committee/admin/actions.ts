"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminEvent } from "@/lib/access";
import { flashPath } from "@/lib/flash";
import { parseMember } from "../lib/rules";
import { addMember, issueLink, removeMember, userIdByEmail, isOrgAdmin } from "../db";

const settingsPath = (eventId: string) => `/admin/events/${eventId}/settings`;

/** D553/D563: every committee write is Ecopia's. */
async function guard(eventId: string) {
  return requireAdminEvent(eventId);
}

export async function addMemberAction(eventId: string, fd: FormData) {
  const { ev, actor } = await guard(eventId);
  const path = settingsPath(eventId);
  const parsed = parseMember(String(fd.get("name") ?? ""), String(fd.get("email") ?? ""));
  if ("error" in parsed) redirect(flashPath(path, parsed.error, "error"));
  const existing = await userIdByEmail(parsed.email);
  if (existing && await isOrgAdmin(existing)) redirect(flashPath(path, "That's an Ecopia admin login already.", "error"));
  const made = await addMember(ev.id, parsed.name, parsed.email, actor.userId);
  if (made === "duplicate") redirect(flashPath(path, `${parsed.email} is already on this event's committee.`, "error"));
  revalidatePath(path);
  redirect(flashPath(path, `Link made for ${parsed.name}. Copy it from the list and send it to them.`));
}

export async function newSetupLinkAction(eventId: string, memberId: string) {
  const { ev } = await guard(eventId);
  const ok = await issueLink(ev.id, memberId, "setup");
  revalidatePath(settingsPath(eventId));
  redirect(flashPath(settingsPath(eventId), ok ? "New set-up link ready. The old one has stopped working." : "They've already set up their login. Send a password reset link instead.", ok ? "ok" : "error"));
}

export async function resetLinkAction(eventId: string, memberId: string) {
  const { ev } = await guard(eventId);
  const ok = await issueLink(ev.id, memberId, "reset");
  revalidatePath(settingsPath(eventId));
  redirect(flashPath(settingsPath(eventId), ok ? "Password reset link ready. Copy it from the list and send it to them." : "They haven't set up their login yet. Send a new set-up link instead.", ok ? "ok" : "error"));
}

export async function removeMemberAction(eventId: string, memberId: string) {
  const { ev } = await guard(eventId);
  const ok = await removeMember(ev.id, memberId);
  revalidatePath(settingsPath(eventId));
  redirect(flashPath(settingsPath(eventId), ok ? "Removed. Their access to this event has stopped." : "They were already removed.", ok ? "ok" : "error"));
}
