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

export const dynamic = "force-dynamic";

export default async function PersonalHome({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const basePath = `/e/${slug}/a/${token}`;
  const { tiles, banner, next, today } = await loadHomeData(event, attendee, basePath);
  const checkins = await listCheckinsForEvent(event.id);
  const state = checkinStatus(attendee.id, checkins);
  const checkedInAt = state.at ? isoToLocalInput(state.at).split("T")[1] : null;
  return (
    <PortalShell event={event} basePath={basePath} personal current="" hero>
      <h1 className="sr-only">{event.name}</h1>
      {/* Two columns from md: the badge is the identity half, the rest is the
          what-is-happening half. On a phone it is one column in the same order. */}
      <div className="flex flex-col gap-3.5 md:grid md:grid-cols-2 md:items-start md:gap-5">
        <BadgeCard attendee={attendee} basePath={basePath} checkedInAt={checkedInAt} floorPlan={Boolean(event.floor_plan_url)} />
        <div className="flex flex-col gap-3.5 md:gap-5">
          {banner && <AnnouncementBanner a={banner} href={`${basePath}/announcements`} />}
          <NowCard next={next} href={`${basePath}/agenda`} today={today} />
        </div>
        <div className="md:col-span-2"><TileGrid tiles={tiles} /></div>
      </div>
    </PortalShell>
  );
}
