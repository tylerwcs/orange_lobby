"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEventAccess } from "@/lib/access";
import { requireFeature } from "@/features/catalogue";
import { saveSettings } from "@/features/qualifier";
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
