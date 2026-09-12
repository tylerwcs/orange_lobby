import "server-only";
import { listAgenda } from "@/lib/db/agenda";
import { listAnnouncements } from "@/lib/db/announcements";
import { visibleTo, nextSession, groupByDay, pickDay } from "@/lib/agenda";
import { nowInKL } from "@/lib/time";
import { resolveTiles, type Tile } from "@/lib/modules";
import type { AgendaItem, Announcement, Attendee, Event } from "@/lib/types";

export type HomeData = {
  tiles: Tile[];
  banner: Announcement | null;
  next: { item: AgendaItem; status: "now" | "next" } | null;
  today: string;
  /** The whole programme this attendee may see, for the desktop home's agenda column. */
  agenda: AgendaItem[];
  days: string[];
  /** The day the desktop home is showing - today when the event is running, else the first. */
  day: string | null;
  announcements: Announcement[];
  now: { date: string; time: string };
};

export async function loadHomeData(
  event: Event,
  attendee: Attendee | null,
  basePath: string,
  requestedDay?: string,
): Promise<HomeData> {
  const [allAgenda, announcements] = await Promise.all([listAgenda(event.id), listAnnouncements(event.id)]);
  const { date, time } = nowInKL();
  // Filtered once, here: everything downstream - the next card, the day tabs and the
  // desktop agenda column - must agree about what this attendee is allowed to see.
  const agenda = visibleTo(allAgenda, attendee?.category ?? null);
  const next = nextSession(agenda, date, time);
  const banner = announcements.find((a) => a.pinned) ?? announcements[0] ?? null;
  const tiles = resolveTiles({ event, basePath });
  const days = groupByDay(agenda).map((g) => g.day);
  return {
    tiles, banner, next, today: date,
    agenda, days, day: pickDay(days, requestedDay, date),
    announcements, now: { date, time },
  };
}
