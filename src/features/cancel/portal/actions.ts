"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { loadPortalAttendee } from "@/lib/portal";
import { hasAnyCheckin } from "@/lib/db/checkins";
import { allow } from "@/lib/ratelimit";
import { flashPath } from "@/lib/flash";
import { canSelfCancel } from "../lib/rules";
import { requestCancel, withdrawCancelRequest } from "../db";

/**
 * D593/D586: the attendee asks to cancel. The token is the authority; every rule is re-checked here.
 * Nothing is cancelled until an organiser approves (D594) - this only records the request.
 */
export async function requestCancelAction(slug: string, token: string) {
  const base = `/e/${slug}/a/${token}`;
  if (!allow(`cancel:${token}`, 5, 60_000)) redirect(flashPath(`${base}/me`, "Too many attempts. Try again in a minute.", "error"));
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const verdict = canSelfCancel(event, attendee, await hasAnyCheckin(attendee.id), new Date());
  if (!verdict.ok) redirect(flashPath(`${base}/me`, verdict.reason, "error"));
  await requestCancel(event.id, attendee.id);
  revalidatePath(base, "layout");
  // A draft event shows only Coming soon (no Me page), so the flash lands on the link root.
  redirect(flashPath(event.status === "draft" ? base : `${base}/me`, "Request sent. The organiser will confirm."));
}

/** D595: take a waiting request back. */
export async function withdrawCancelRequestAction(slug: string, token: string) {
  const base = `/e/${slug}/a/${token}`;
  if (!allow(`cancel:${token}`, 5, 60_000)) redirect(flashPath(`${base}/me`, "Too many attempts. Try again in a minute.", "error"));
  const { event, attendee } = await loadPortalAttendee(slug, token);
  await withdrawCancelRequest(event.id, attendee.id);
  revalidatePath(base, "layout");
  redirect(flashPath(event.status === "draft" ? base : `${base}/me`, "Request withdrawn."));
}
