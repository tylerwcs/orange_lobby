import { loadPortalAttendee, portalHasInfo, isUnpublished } from "@/lib/portal";
import { loadActivityNav, loadHomeData } from "@/lib/portal-home";
import { loadActivityEntries, activityCards, HomeActivities } from "@/features/activities";
import { launcherItems, sectionIcons } from "@/lib/launcher";
import { getCheckin } from "@/lib/db/checkins";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { getGroup } from "@/lib/db/groups";
import { activeCheckpoint, badgeCheckin, type BadgeCheckin } from "@/lib/checkpoints";
import { isoToLocalInput, nowInKL } from "@/lib/time";
import { myBreakouts } from "@/lib/breakouts";
import { categoryVisibleBreakoutItems } from "@/lib/agenda";
import { BadgeCard } from "@/components/portal/BadgeCard";
import { BreakoutCard } from "@/components/portal/BreakoutCard";
import { AnnouncementBanner } from "@/components/portal/AnnouncementBanner";
import { LauncherGrid } from "@/components/portal/LauncherGrid";
import { AddToHomeScreen, HomeScreenRow } from "@/components/portal/AddToHomeScreen";
import { shortName } from "@/lib/web-app";
import { AgendaList } from "@/components/portal/AgendaList";
import { AnnouncementList } from "@/components/portal/AnnouncementList";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GROUP_PIN, resolvePins } from "@/lib/pinned-fields";
import { eventFields } from "@/lib/attendee-fields";
import type { Attendee, Event } from "@/lib/types";
import { countGames, phoneState, GameBanner } from "@/features/games";
import { appBaseUrl, attendeeLink } from "@/lib/links";
import { qrDataUrl } from "@/lib/qr";

export const dynamic = "force-dynamic";

const caption = "text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground";

/**
 * The badge's check-in pill (D388): the checkpoint running now and when this attendee came
 * through it - or null when the event has no door (D159) or the organiser hid the pill.
 *
 * Both flags are checked before any query, so an event that shows no pill never touches its
 * checkpoints or checkins. `badgeCheckin` decides the rest, booking doors included.
 */
async function checkinPill(event: Pick<Event, "id" | "check_in_enabled" | "badge_checkin" | "active_checkpoint_id">, attendeeId: string): Promise<BadgeCheckin | null> {
  if (!event.check_in_enabled || !event.badge_checkin) return null;
  const running = activeCheckpoint(event.active_checkpoint_id, await listCheckpoints(event.id), nowInKL().date);
  const scan = running ? await getCheckin(running.id, attendeeId) : null;
  return badgeCheckin(running, scan ? isoToLocalInput(scan.scanned_at).split("T")[1] : null);
}

/** The attendee's group name, read only when the badge pins Group (D389) and they are in one. */
async function pinnedGroupName(event: Pick<Event, "id" | "pinned_fields">, attendee: Pick<Attendee, "group_id">): Promise<string | null> {
  if (!attendee.group_id || !event.pinned_fields.some((p) => p.key === GROUP_PIN.key)) return null;
  return (await getGroup(event.id, attendee.group_id))?.name ?? null;
}

/**
 * The Game on banner's first state, or null when the banner has nothing to follow: only events
 * with a game pay for the read (D254), and an archived event's play endpoints are closed.
 * Built here, outside render, because the state is taken at the moment of the request.
 */
async function gameBanner(event: Event, attendee: Attendee, hasGames: boolean) {
  if (!hasGames || event.status === "archived") return null;
  return phoneState({ event, attendee }, null, Date.now());
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
    { tiles, banner, agenda, allAgenda, assignedItemIds, days, day, announcements, now, bookedActivity },
    checkin,
    groupName,
    qr,
    hasInfo,
    activities,
    games,
  ] = await Promise.all([
    loadHomeData(event, attendee, basePath, requestedDay),
    checkinPill(event, attendee.id),
    pinnedGroupName(event, attendee),
    qrDataUrl(attendeeLink(appBaseUrl(), slug, attendee.token)),
    portalHasInfo(event.id, attendee.category),
    // The same answer the layout already read (its queries are memoised): whether there is an
    // Activities button, and whether it carries the dot.
    loadActivityNav(event, attendee),
    countGames(event.id),
  ]);
  // Only an attendee who can see an activity pays for the cards' queries (D214), and only an
  // event with a game for the banner's first state; the two do not wait on each other.
  const [cards, game] = await Promise.all([
    activities.show ? loadActivityEntries(event, attendee).then((entries) => activityCards(entries, basePath)) : [],
    gameBanner(event, attendee, games > 0),
  ]);
  const launcher = launcherItems({ basePath, personal: true, hasInfo, hasGroup: event.group_tile && !!attendee.group_id, activities, tiles, icons: sectionIcons(event.section_icons) });

  return (
    <>
      <h1 className="sr-only">{event.name}</h1>
      <AddToHomeScreen appName={shortName(event.name)} />

      {/*
        Three columns from xl: who you are and where you are, the whole day, what changed.
        Two at md, one on a phone. On a phone this page is the whole navigation (D209): badge,
        the latest announcement, the launcher, breakouts, then the activity cards (D215). The
        phone-only pieces live in the first column, hidden from md, where the header carries
        the sections and the other columns carry the agenda and announcements (D210).
      */}
      <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start md:gap-5 xl:grid-cols-[300px_minmax(0,1fr)_300px]">

        <div className="flex flex-col gap-4 md:gap-5">
          {game && <GameBanner token={token} basePath={basePath} initial={game} />}
          <BadgeCard attendee={attendee} qr={qr} checkin={checkin} pins={resolvePins(event.pinned_fields, attendee, eventFields(event.registration_questions, event.attendee_fields), groupName)} />
          <div className="md:hidden">
            {/* No announcements yet: the banner's place holds the home-screen guide instead (D232). */}
            {banner ? <AnnouncementBanner a={banner} items={announcements} /> : <HomeScreenRow variant="banner" />}
          </div>
          <LauncherGrid items={launcher} layout="row" className="md:hidden" />
          <BreakoutCard breakouts={myBreakouts(categoryVisibleBreakoutItems(allAgenda, attendee.category), assignedItemIds)} />
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
                calendarHref={(sessionId) => {
                  const activityId = bookedActivity.get(sessionId);
                  return activityId ? `${basePath}/activities/${activityId}/calendar.ics?session=${sessionId}` : null;
                }}
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
          {/* The header covers Agenda (via Home's Today column, D223) and Info (D216) - only
              those two are dropped here. My group has no header link (F3), so it stays. */}
          <LauncherGrid items={launcher.filter((i) => i.id !== "builtin:agenda" && i.id !== "builtin:info")} />
        </div>

      </div>
    </>
  );
}
