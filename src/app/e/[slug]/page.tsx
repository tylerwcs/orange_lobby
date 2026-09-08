import { loadPortalEvent } from "@/lib/portal";
import { loadHomeData } from "@/lib/portal-home";
import { PortalShell } from "@/components/portal/PortalShell";
import { AnnouncementBanner } from "@/components/portal/AnnouncementBanner";
import { TileGrid } from "@/components/portal/TileGrid";

export const dynamic = "force-dynamic";

export default async function GenericHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await loadPortalEvent(slug);
  const basePath = `/e/${slug}`;
  const { tiles, banner } = await loadHomeData(event, null, basePath);
  return (
    <PortalShell event={event} basePath={basePath} personal={false} current="">
      <div className="flex flex-col gap-3.5">
        {banner && <AnnouncementBanner a={banner} href={`${basePath}/announcements`} />}
        <TileGrid tiles={tiles} />
      </div>
    </PortalShell>
  );
}
