"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent, updateEvent } from "@/lib/db/events";
import { flashPath } from "@/lib/flash";
import { featureForActivityKind, requireFeature } from "@/features/catalogue";
import { addVerifierLink, replaceVerifierToken, removeVerifierLink } from "../db/verifiers";
import { parseVerifierName } from "../lib/verifier";
import { parseReasonList } from "../lib/revoke";

const settingsPath = (eventId: string) => `/admin/events/${eventId}/settings`;

/** D502: the Verification tab's writes. Submissions are part of the Engagement add-on, so each one checks it. */
async function guard(eventId: string) {
  const { orgId, userId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  await requireFeature(ev.id, featureForActivityKind("submission"), settingsPath(eventId));
  return { ev, userId };
}

export async function addVerifierAction(eventId: string, fd: FormData) {
  const { ev, userId } = await guard(eventId);
  const parsed = parseVerifierName(String(fd.get("name") ?? ""));
  if ("error" in parsed) redirect(flashPath(settingsPath(eventId), parsed.error, "error"));
  await addVerifierLink(ev.id, parsed.name, userId);
  revalidatePath(settingsPath(eventId));
  redirect(flashPath(settingsPath(eventId), `Link made for ${parsed.name}. Copy it and send it to them.`));
}

/** D493: same name and history, new token; the old URL stops at once. */
export async function replaceVerifierLinkAction(eventId: string, linkId: string) {
  const { ev } = await guard(eventId);
  const ok = await replaceVerifierToken(ev.id, linkId);
  revalidatePath(settingsPath(eventId));
  redirect(flashPath(settingsPath(eventId), ok ? "New link ready. The old one has stopped working." : "That verifier was already removed.", ok ? "ok" : "error"));
}

/** D493: stamped, not deleted, so their past revokes keep their name. */
export async function removeVerifierAction(eventId: string, linkId: string) {
  const { ev } = await guard(eventId);
  const ok = await removeVerifierLink(ev.id, linkId);
  revalidatePath(settingsPath(eventId));
  redirect(flashPath(settingsPath(eventId), ok ? "Verifier removed. Their link has stopped working." : "That verifier was already removed.", ok ? "ok" : "error"));
}

/** D497: the templates, one per line. Past revokes keep their own wording (D499). */
export async function saveRevokeReasonsAction(eventId: string, fd: FormData) {
  const { ev } = await guard(eventId);
  const parsed = parseReasonList(String(fd.get("revoke_reasons") ?? ""));
  if ("error" in parsed) redirect(flashPath(settingsPath(eventId), `${parsed.error} Nothing was saved.`, "error"));
  await updateEvent(ev.id, { revoke_reasons: parsed.reasons });
  revalidatePath(settingsPath(eventId));
  redirect(flashPath(settingsPath(eventId), "Revoke reasons saved."));
}
