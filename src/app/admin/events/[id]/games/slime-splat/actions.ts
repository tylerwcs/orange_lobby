"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEventAccess } from "@/lib/access";
import { requireFeature } from "@/features/catalogue";
import { addSlime, GAME_NAME, parsePerDay, parsePlayHours, removeSlime, saveSettings, setDisqualified, slimeAdminPath } from "@/features/qualifier";
import { parseCategories } from "@/lib/agenda";
import { flashPath } from "@/lib/flash";
import { localInputToIso } from "@/lib/time";

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
const gamesPath = (eventId: string) => `/admin/events/${eventId}/games`;

/** New game → Slime Splat (D809): adds it, once per event, and opens its settings. */
export async function addSlimeAction(eventId: string) {
  const { ev } = await requireEventAccess(eventId);
  await requireFeature(ev.id, "typing_qualifier", gamesPath(ev.id));
  await addSlime(ev);
  revalidatePath(gamesPath(ev.id));
  redirect(slimeAdminPath(ev.id));
}

/** Takes Slime Splat off the event's games (D809); its runs and leaderboard are kept. */
export async function removeSlimeAction(eventId: string) {
  const { ev } = await requireEventAccess(eventId);
  await removeSlime(ev.id);
  revalidatePath(gamesPath(ev.id));
  redirect(flashPath(gamesPath(ev.id), `${GAME_NAME} removed.`));
}

/**
 * Saves Slime Splat's window, the left-out categories, the runs a day and the play hours (D770,
 * D797, D910). A blank runs-a-day or play-hours field is "no limit". The database raises,
 * rather than answering, when the window is back to front, so that is checked here first. Both
 * ends are optional: a half-set or empty window is simply "Not scheduled". `locked` is only left
 * over from the old finalist snapshot: an event that confirmed one keeps its settings.
 */
export async function saveSlimeSettingsAction(eventId: string, fd: FormData) {
  const { ev } = await requireEventAccess(eventId);
  const back = slimeAdminPath(ev.id);
  await requireFeature(ev.id, "typing_qualifier", back);

  const opens = text(fd, "opens_at");
  const closes = text(fd, "closes_at");
  const opens_at = localInputToIso(opens);
  const closes_at = localInputToIso(closes);
  if ((opens && !opens_at) || (closes && !closes_at)) redirect(flashPath(back, "That date isn't valid.", "error"));
  if (opens_at && closes_at && Date.parse(closes_at) <= Date.parse(opens_at)) redirect(flashPath(back, "Close must be after open", "error"));

  const practice_per_day = parsePerDay(text(fd, "practice_per_day"));
  const official_per_day = parsePerDay(text(fd, "official_per_day"));
  if (practice_per_day === "invalid" || official_per_day === "invalid") {
    redirect(flashPath(back, "Runs a day must be a whole number from 0 to 99.", "error"));
  }
  const play_hours = parsePlayHours(text(fd, "play_hours"));
  if (play_hours === "invalid") redirect(flashPath(back, "Play hours should look like 12:00-14:00, 19:00-24:00.", "error"));

  const result = await saveSettings(ev, {
    opens_at, closes_at,
    excluded_categories: parseCategories(text(fd, "excluded_categories")) ?? [],
    practice_per_day, official_per_day, play_hours,
  });
  if (result === "locked") redirect(flashPath(back, "These settings are locked.", "error"));
  revalidatePath(back);
  redirect(flashPath(back, "Saved."));
}

/**
 * Disqualifies or restores one run (D775); the attendee's best, and so the board, is
 * recomputed by the database. Lands back on that attendee's runs.
 */
export async function setRunDisqualifiedAction(eventId: string, attendeeId: string, runId: string, on: boolean) {
  const { ev } = await requireEventAccess(eventId);
  const back = `${slimeAdminPath(ev.id)}/${encodeURIComponent(attendeeId)}`;
  await requireFeature(ev.id, "typing_qualifier", slimeAdminPath(ev.id));

  const result = await setDisqualified(ev.id, runId, on);
  if (result === "locked") redirect(flashPath(back, "Runs are locked.", "error"));
  if (result === "missing") redirect(flashPath(back, "That run isn't there any more.", "error"));
  revalidatePath(slimeAdminPath(ev.id));
  redirect(flashPath(back, on ? "Run disqualified." : "Run restored."));
}
