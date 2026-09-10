import { loadPortalEvent } from "@/lib/portal";
import { loadHomeData } from "@/lib/portal-home";
import { PortalShell } from "@/components/portal/PortalShell";
import { AnnouncementBanner } from "@/components/portal/AnnouncementBanner";
import { TileGrid } from "@/components/portal/TileGrid";
import { NowCard } from "@/components/portal/NowCard";

export const dynamic = "force-dynamic";

export default async function GenericHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await loadPortalEvent(slug);
  const basePath = `/e/${slug}`;
  const { tiles, banner, next, today } = await loadHomeData(event, null, basePath);
  return (
    <PortalShell event={event} basePath={basePath} personal={false} current="" hero>
      <h1 className="sr-only">{event.name}</h1>
      <div className="flex flex-col gap-3.5">
        <div className="rounded-[var(--radius-card)] bg-surface p-4 shadow-[var(--shadow-card)]">
          <div className="text-[15px] font-extrabold">Open your own badge link</div>
          <p className="mt-1 text-sm text-muted">Scan the QR code on your badge to see your table, seat and check-in status.</p>
        </div>
        {banner && <AnnouncementBanner a={banner} href={`${basePath}/announcements`} />}
        <NowCard next={next} href={`${basePath}/agenda`} today={today} />
        <TileGrid tiles={tiles} />
      </div>
    </PortalShell>
  );
}
