import { loadPortalAttendee } from "@/lib/portal";
import { loadHomeData } from "@/lib/portal-home";
import { listCheckinsForEvent } from "@/lib/db/checkins";
import { checkinStatus } from "@/lib/checkins-stats";
import { isoToLocalInput } from "@/lib/time";
import { myBreakouts } from "@/lib/breakouts";
import { categoryVisibleBreakoutItems } from "@/lib/agenda";
import { BadgeCard } from "@/components/portal/BadgeCard";
import { BreakoutCard } from "@/components/portal/BreakoutCard";
import { AnnouncementBanner } from "@/components/portal/AnnouncementBanner";
import { TileGrid } from "@/components/portal/TileGrid";
import { AgendaList } from "@/components/portal/AgendaList";
import { AnnouncementList } from "@/components/portal/AnnouncementList";
import { VenueCard } from "@/components/portal/VenueCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { floorPlanUrl } from "@/lib/modules";
import { resolvePins } from "@/lib/pinned-fields";
import { eventFields } from "@/lib/attendee-fields";
import type { Event } from "@/lib/types";

export const dynamic = "force-dynamic";

const caption = "text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground";

/**
 * The time this attendee was scanned in, for the line on their badge — or null when this
 * event has no door at all (D159).
 *
 * The flag is checked before the query rather than after it, so an event with check-in off
 * never loads its checkins. `BadgeCard` already treats null as "nothing to show", which is
 * why turning the door off needs no change there.
 */
async function arrivalTime(event: Pick<Event, "id" | "check_in_enabled">, attendeeId: string): Promise<string | null> {
  if (!event.check_in_enabled) return null;
  const state = checkinStatus(attendeeId, await listCheckinsForEvent(event.id));
  return state.at ? isoToLocalInput(state.at).split("T")[1] : null;
}

export default async function PersonalHome({ params, searchParams }: {
  params: Promise<{ slug: string; token: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug, token } = await params;
  const { day: requestedDay } = await searchParams;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const basePath = `/e/${slug}/a/${token}`;
  const { tiles, banner, agenda, allAgenda, assignedItemIds, days, day, announcements, now } =
    await loadHomeData(event, attendee, basePath, requestedDay);
  // Skipped, not just hidden: an event with no door never reads its checkins at all (D159).
  // On a programme running for weeks this is the largest table on the page, fetched to
  // answer a question the badge is no longer asking.
  const checkedInAt = await arrivalTime(event, attendee.id);

  return (
    <>
      <h1 className="sr-only">{event.name}</h1>

      {/*
        Three columns from xl: who you are and where you are, the whole day, what changed.
        Two at md, one on a phone - where the agenda and announcement columns are hidden
        entirely rather than stacked. A phone showing eight sessions and three
        announcements under a badge is a scroll, not a home screen; that is what the
        bottom bar's Info slot and the announcement banner's dialog are for. Activities
        are not on this page at any width: they have their own slot in the bar.
      */}
      <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start md:gap-5 xl:grid-cols-[300px_minmax(0,1fr)_300px]">

        <div className="flex flex-col gap-4 md:gap-5">
          <BadgeCard attendee={attendee} basePath={basePath} checkedInAt={checkedInAt} floorPlan={Boolean(floorPlanUrl(event))} pins={resolvePins(event.pinned_fields, attendee, eventFields(event.registration_questions, event.attendee_fields))} />
          <BreakoutCard breakouts={myBreakouts(categoryVisibleBreakoutItems(allAgenda, attendee.category), assignedItemIds)} contactPhone={event.contact_phone} />
          <div className="hidden md:block"><VenueCard event={event} basePath={basePath} /></div>
        </div>

        <div className="flex flex-col gap-4 md:gap-5">
          {/* Phone: the latest announcement, opening all of them. No "next session" card -
              the bar's Info slot is one tap from the whole agenda. Desktop: the whole day, below. */}
          {banner && <div className="md:hidden"><AnnouncementBanner a={banner} items={announcements} /></div>}

          <Card className="hidden md:block">
            <CardHeader>
              <CardTitle>Today</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Day tabs stay on this page rather than jumping to /agenda - the point of
                  the dashboard is that you do not have to leave it. */}
              <AgendaList
                items={agenda}
                day={day}
                days={days}
                basePath={basePath}
                now={now}
                dayHref={(d) => `${basePath}?day=${d}`}
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4 md:col-span-2 md:gap-5 xl:col-span-1">
          <Card className="hidden md:block">
            <CardHeader>
              <CardTitle className={caption}>Announcements</CardTitle>
            </CardHeader>
            <CardContent>
              <AnnouncementList items={announcements.slice(0, 4)} />
            </CardContent>
          </Card>
          <TileGrid tiles={tiles} />
        </div>

      </div>
    </>
  );
}
