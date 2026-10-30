"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEventAccess } from "@/lib/access";
import { requireFeature } from "@/features/catalogue";
import { confirmFinalists, saveSettings, setDisqualified } from "@/features/qualifier";
import { parseCategories } from "@/lib/agenda";
import { flashPath } from "@/lib/flash";
import { localInputToIso } from "@/lib/time";

const qualifierPath = (eventId: string) => `/admin/events/${eventId}/qualifier`;

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();

/**
 * Saves the window and the left-out categories (D770). The database raises, rather than
 * answering, when the window is back to front, so that is checked here first. Both ends are
 * optional: a half-set or empty window is simply "Not scheduled".
 */
export async function saveQualifierSettingsAction(eventId: string, fd: FormData) {
  const { ev } = await requireEventAccess(eventId);
  const back = qualifierPath(ev.id);
  await requireFeature(ev.id, "typing_qualifier", back);

  const opens = text(fd, "opens_at");
  const closes = text(fd, "closes_at");
  const opens_at = localInputToIso(opens);
  const closes_at = localInputToIso(closes);
  if ((opens && !opens_at) || (closes && !closes_at)) redirect(flashPath(back, "That date isn't valid.", "error"));
  if (opens_at && closes_at && Date.parse(closes_at) <= Date.parse(opens_at)) redirect(flashPath(back, "Close must be after open", "error"));

  const result = await saveSettings(ev, {
    opens_at, closes_at,
    excluded_categories: parseCategories(text(fd, "excluded_categories")) ?? [],
  });
  if (result === "locked") redirect(flashPath(back, "Finalists are confirmed \u2014 settings are locked.", "error"));
  revalidatePath(back);
  redirect(flashPath(back, "Saved."));
}

/**
 * Disqualifies or restores one run (D775); the attendee's best, and so the board, is
 * recomputed by the database. Refused once the finalists are confirmed. Lands back on that
 * attendee's runs.
 */
export async function setRunDisqualifiedAction(eventId: string, attendeeId: string, runId: string, on: boolean) {
  const { ev } = await requireEventAccess(eventId);
  const back = `${qualifierPath(ev.id)}/${encodeURIComponent(attendeeId)}`;
  await requireFeature(ev.id, "typing_qualifier", qualifierPath(ev.id));

  const result = await setDisqualified(ev.id, runId, on);
  if (result === "locked") redirect(flashPath(back, "Settings are locked.", "error"));
  if (result === "missing") redirect(flashPath(back, "That run isn't there any more.", "error"));
  revalidatePath(qualifierPath(ev.id));
  redirect(flashPath(back, on ? "Run disqualified." : "Run restored."));
}

/**
 * Locks the top 10 as the finale list (D775). `confirmed_by` is a uuid: the signed-in user's
 * auth id, which an Ecopia admin and a committee member both have (`actor.userId`).
 * `not_closed` is also the answer while a run started before the close can still be submitted
 * (up to about 36 s after it), hence the second half of the message.
 */
export async function confirmFinalistsAction(eventId: string) {
  const { actor, ev } = await requireEventAccess(eventId);
  const back = qualifierPath(ev.id);
  await requireFeature(ev.id, "typing_qualifier", back);

  const result = await confirmFinalists(ev.id, actor.userId);
  if (result === "not_closed") redirect(flashPath(back, "Close the qualifier first — or wait a minute for the last runs to finish.", "error"));
  if (result === "already") redirect(flashPath(back, "Already confirmed.", "error"));
  revalidatePath(back);
  redirect(flashPath(back, "Finalists confirmed."));
}
