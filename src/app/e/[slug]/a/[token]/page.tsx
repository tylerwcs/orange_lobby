import { loadPortalAttendee, portalHasInfo, isUnpublished } from "@/lib/portal";
import { loadActivityNav, loadHomeData } from "@/lib/portal-home";
import { loadActivityEntries } from "@/lib/portal-activity-entries";
import { activityCards } from "@/lib/activity-cards";
import { launcherItems, sectionIcons } from "@/lib/launcher";
import { firstCheckinAt } from "@/lib/db/checkins";
import { isoToLocalInput } from "@/lib/time";
import { myBreakouts } from "@/lib/breakouts";
import { categoryVisibleBreakoutItems } from "@/lib/agenda";
import { BadgeCard } from "@/components/portal/BadgeCard";
import { BreakoutCard } from "@/components/portal/BreakoutCard";
import { AnnouncementBanner } from "@/components/portal/AnnouncementBanner";
import { LauncherGrid } from "@/components/portal/LauncherGrid";
import { HomeActivities } from "@/components/portal/HomeActivities";
import { AgendaList } from "@/components/portal/AgendaList";
import { AnnouncementList } from "@/components/portal/AnnouncementList";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { floorPlanUrl } from "@/lib/modules";
import { resolvePins } from "@/lib/pinned-fields";
import { eventFields } from "@/lib/attendee-fields";
import type { Event } from "@/lib/types";
import { appBaseUrl, attendeeLink } from "@/lib/links";
import { qrDataUrl } from "@/lib/qr";

export const dynamic = "force-dynamic";

const caption = "text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground";

/**
 * The time this attendee was scanned in, for the line on their badge — or null when this
 * event has no door at all (D159).
 *
 * The flag is checked before the query rather than after it, so an event with check-in off
 * never touches its checkins. `BadgeCard` already treats null as "nothing to show", which is
 * why turning the door off needs no change there.
 */
async function arrivalTime(event: Pick<Event, "id" | "check_in_enabled">, attendeeId: string): Promise<string | null> {
  if (!event.check_in_enabled) return null;
  const at = await firstCheckinAt(event.id, attendeeId);
  return at ? isoToLocalInput(at).split("T")[1] : null;
}

export default async function PersonalHome({ params, searchParams }: {
  params: Promise<{ slug: string; token: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug, token } = await params;
  const { day: requestedDay } = await searchParams;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  // A draft shows only "Coming soon" (the layout's chrome); see isUnpublished.
  if (isUnpublished(event)) return null;
  const basePath = `/e/${slug}/a/${token}`;
  // None of these three depends on another, so they run together rather than in turn.
  // `arrivalTime` is skipped, not just hidden, when the event has no door (D159). The QR is
  // made here so the badge's QR button opens the code in place, with nothing left to fetch.
  const [
    { tiles, banner, agenda, allAgenda, assignedItemIds, days, day, announcements, now },
    checkedInAt,
    qr,
    hasInfo,
    activities,
  ] = await Promise.all([
    loadHomeData(event, attendee, basePath, requestedDay),
    arrivalTime(event, attendee.id),
    qrDataUrl(attendeeLink(appBaseUrl(), slug, attendee.token)),
    portalHasInfo(event.id),
    // The same answer the layout already read (its queries are memoised): whether there is an
    // Activities button, and whether it carries the dot.
    loadActivityNav(event, attendee),
  ]);
  // Only an attendee who can see an activity pays for the cards' queries (D214).
  const cards = activities.show ? activityCards(await loadActivityEntries(event, attendee), basePath) : [];
  const launcher = launcherItems({ basePath, personal: true, hasInfo, activities, tiles, icons: sectionIcons(event.section_icons) });

  return (
    <>
      <h1 className="sr-only">{event.name}</h1>

      {/*
        Three columns from xl: who you are and where you are, the whole day, what changed.
        Two at md, one on a phone. On a phone this page is the whole navigation (D209): badge,
        the latest announcement, the launcher, breakouts, then the activity cards (D215). The
        phone-only pieces live in the first column, hidden from md, where the header carries
        the sections and the other columns carry the agenda and announcements (D210).
      */}
      <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start md:gap-5 xl:grid-cols-[300px_minmax(0,1fr)_300px]">

        <div className="flex flex-col gap-4 md:gap-5">
          <BadgeCard attendee={attendee} basePath={basePath} qr={qr} checkedInAt={checkedInAt} floorPlan={Boolean(floorPlanUrl(event))} pins={resolvePins(event.pinned_fields, attendee, eventFields(event.registration_questions, event.attendee_fields))} />
          {banner && <div className="md:hidden"><AnnouncementBanner a={banner} items={announcements} /></div>}
          <LauncherGrid items={launcher} layout="row" className="md:hidden" />
          <BreakoutCard breakouts={myBreakouts(categoryVisibleBreakoutItems(allAgenda, attendee.category), assignedItemIds)} contactPhone={event.contact_phone} />
          <div className="md:hidden"><HomeActivities cards={cards} basePath={basePath} /></div>
        </div>

        <div className="hidden md:flex md:flex-col md:gap-5">
          <Card>
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

        <div className="hidden md:col-span-2 md:flex md:flex-col md:gap-5 xl:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className={caption}>Announcements</CardTitle>
            </CardHeader>
            <CardContent>
              <AnnouncementList items={announcements.slice(0, 4)} />
            </CardContent>
          </Card>
          {/* The header already links to the portal's own sections; only the tiles here. */}
          <LauncherGrid items={launcher.filter((i) => !i.builtin)} />
        </div>

      </div>
    </>
  );
}
