"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { loadPortalAttendee } from "@/lib/portal";
import { hasAnyCheckin } from "@/lib/db/checkins";
import { allow } from "@/lib/ratelimit";
import { flashPath } from "@/lib/flash";
import { canSelfCancel } from "../lib/rules";
import { cancelAttendee } from "../db";

/** D586: the token is the authority; every rule is re-checked here. */
export async function selfCancelAction(slug: string, token: string) {
  const base = `/e/${slug}/a/${token}`;
  if (!allow(`cancel:${token}`, 5, 60_000)) redirect(flashPath(`${base}/me`, "Too many attempts. Try again in a minute.", "error"));
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const verdict = canSelfCancel(event, attendee, await hasAnyCheckin(attendee.id), new Date());
  if (!verdict.ok) redirect(flashPath(`${base}/me`, verdict.reason, "error"));
  await cancelAttendee(event.id, attendee.id);
  revalidatePath(base, "layout");
  redirect(base);
}
