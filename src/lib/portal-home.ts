import "server-only";
import { listAgenda } from "@/lib/db/agenda";
import { listAnnouncements } from "@/lib/db/announcements";
import { visibleTo, nextSession } from "@/lib/agenda";
import { nowInKL } from "@/lib/time";
import { resolveTiles, type Tile } from "@/lib/modules";
import type { AgendaItem, Announcement, Attendee, Event } from "@/lib/types";

export type HomeData = {
  tiles: Tile[];
  banner: Announcement | null;
  next: { item: AgendaItem; status: "now" | "next" } | null;
  today: string;
};

export async function loadHomeData(event: Event, attendee: Attendee | null, basePath: string): Promise<HomeData> {
  const [agenda, announcements] = await Promise.all([listAgenda(event.id), listAnnouncements(event.id)]);
  const { date, time } = nowInKL();
  const next = nextSession(visibleTo(agenda, attendee?.category ?? null), date, time);
  const banner = announcements.find((a) => a.pinned) ?? announcements[0] ?? null;
  const tiles = resolveTiles({ event, personal: !!attendee, basePath, attendee, next, latestAnnouncement: banner?.title ?? null });
  return { tiles, banner, next, today: date };
}
