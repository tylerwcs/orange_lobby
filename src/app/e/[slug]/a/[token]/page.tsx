import { loadPortalAttendee } from "@/lib/portal";
import { loadHomeData } from "@/lib/portal-home";
import { listCheckinsForEvent } from "@/lib/db/checkins";
import { checkinStatus } from "@/lib/checkins-stats";
import { isoToLocalInput } from "@/lib/time";
import { PortalShell } from "@/components/portal/PortalShell";
import { BadgeCard } from "@/components/portal/BadgeCard";
import { AnnouncementBanner } from "@/components/portal/AnnouncementBanner";
import { TileGrid } from "@/components/portal/TileGrid";
import { NowCard } from "@/components/portal/NowCard";
import { AgendaList } from "@/components/portal/AgendaList";
import { AnnouncementList } from "@/components/portal/AnnouncementList";
import { VenueCard } from "@/components/portal/VenueCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { floorPlanUrl } from "@/lib/modules";
import { resolvePins } from "@/lib/pinned-fields";
import { eventFields } from "@/lib/attendee-fields";

export const dynamic = "force-dynamic";

const caption = "text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground";

export default async function PersonalHome({ params, searchParams }: {
  params: Promise<{ slug: string; token: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug, token } = await params;
  const { day: requestedDay } = await searchParams;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const basePath = `/e/${slug}/a/${token}`;
  const { tiles, banner, next, today, agenda, days, day, announcements, now } =
    await loadHomeData(event, attendee, basePath, requestedDay);
  const checkins = await listCheckinsForEvent(event.id);
  const state = checkinStatus(attendee.id, checkins);
  const checkedInAt = state.at ? isoToLocalInput(state.at).split("T")[1] : null;

  return (
    <PortalShell event={event} basePath={basePath} personal current="" hero dashboard>
      <h1 className="sr-only">{event.name}</h1>

      {/*
        Three columns from xl: who you are and where you are, the whole day, what changed.
        Two at md, one on a phone - where the agenda and announcement columns are hidden
        entirely rather than stacked. A phone showing eight sessions and three
        announcements under a badge is a scroll, not a home screen; that is what the
        bottom bar's Agenda and Info are for.
      */}
      <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start md:gap-5 xl:grid-cols-[300px_minmax(0,1fr)_300px]">

        <div className="flex flex-col gap-4 md:gap-5">
          <BadgeCard attendee={attendee} basePath={basePath} checkedInAt={checkedInAt} floorPlan={Boolean(floorPlanUrl(event))} pins={resolvePins(event.pinned_fields, attendee, eventFields(event.registration_questions, event.attendee_fields))} />
          <div className="hidden md:block"><VenueCard event={event} basePath={basePath} /></div>
        </div>

        <div className="flex flex-col gap-4 md:gap-5">
          {/* Phone: the one next thing. Desktop: the whole day, below. */}
          <div className="flex flex-col gap-4 md:hidden">
            {banner && <AnnouncementBanner a={banner} href={`${basePath}/announcements`} />}
            <NowCard next={next} href={`${basePath}/agenda`} today={today} />
          </div>

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
    </PortalShell>
  );
}
