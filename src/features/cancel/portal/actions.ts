"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { loadPortalAttendee } from "@/lib/portal";
import { hasAnyCheckin } from "@/lib/db/checkins";
import { allow } from "@/lib/ratelimit";
import { flashPath } from "@/lib/flash";
import { canSelfCancel, parseCancelReason } from "../lib/rules";
import { requestCancel, withdrawCancelRequest } from "../db";

/**
 * D593/D586: the attendee asks to cancel. The token is the authority; every rule is re-checked here.
 * Nothing is cancelled until an organiser approves (D594) - this only records the request, with
 * the reason typed in the dialog (D613).
 */
export async function requestCancelAction(slug: string, token: string, rawReason: string) {
  const base = `/e/${slug}/a/${token}`;
  // Loaded before the rate limit so every redirect below can pick the right landing page. This is the
  // same per-request memo every portal page already pays for, so the limit guards nothing it did not.
  const { event, attendee } = await loadPortalAttendee(slug, token);
  // A draft event shows only Coming soon (no Me page), so every flash lands on the link root.
  const landing = event.status === "draft" ? base : `${base}/me`;
  if (!allow(`cancel:${token}`, 5, 60_000)) redirect(flashPath(landing, "Too many attempts. Try again in a minute.", "error"));
  const verdict = canSelfCancel(event, attendee, await hasAnyCheckin(attendee.id), new Date());
  if (!verdict.ok) redirect(flashPath(landing, verdict.reason, "error"));
  const parsed = parseCancelReason(rawReason);
  if ("error" in parsed) redirect(flashPath(landing, parsed.error, "error"));
  await requestCancel(event.id, attendee.id, parsed.reason);
  revalidatePath(base, "layout");
  redirect(flashPath(landing, "Request sent. The organiser will confirm."));
}

/** D595: take a waiting request back. */
export async function withdrawCancelRequestAction(slug: string, token: string) {
  const base = `/e/${slug}/a/${token}`;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const landing = event.status === "draft" ? base : `${base}/me`;
  if (!allow(`cancel:${token}`, 5, 60_000)) redirect(flashPath(landing, "Too many attempts. Try again in a minute.", "error"));
  const ok = await withdrawCancelRequest(event.id, attendee.id);
  revalidatePath(base, "layout");
  // Nothing was waiting (already decided, or withdrawn in another tab): say so rather than claim a withdrawal.
  redirect(ok ? flashPath(landing, "Request withdrawn.") : flashPath(landing, "There's no waiting request.", "error"));
}
