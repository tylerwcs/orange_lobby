import { loadPortalAttendee } from "@/lib/portal";
import { loadHomeData } from "@/lib/portal-home";
import { PortalShell } from "@/components/portal/PortalShell";
import { MeCard } from "@/components/portal/MeCard";
import { AnnouncementBanner } from "@/components/portal/AnnouncementBanner";
import { TileGrid } from "@/components/portal/TileGrid";

export const dynamic = "force-dynamic";

export default async function PersonalHome({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const basePath = `/e/${slug}/a/${token}`;
  const { tiles, banner } = await loadHomeData(event, attendee, basePath);
  return (
    <PortalShell event={event} basePath={basePath} personal current="">
      <div className="flex flex-col gap-3.5">
        <MeCard attendee={attendee} basePath={basePath} />
        {banner && <AnnouncementBanner a={banner} href={`${basePath}/announcements`} />}
        <TileGrid tiles={tiles} />
      </div>
    </PortalShell>
  );
}
