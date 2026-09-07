import { loadPortalEvent } from "@/lib/portal";
import { listAnnouncements } from "@/lib/db/announcements";
import { PortalShell } from "@/components/portal/PortalShell";
import { AnnouncementList } from "@/components/portal/AnnouncementList";

export default async function GenericNews({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await loadPortalEvent(slug);
  return <PortalShell event={event} basePath={`/e/${slug}`} personal={false}><AnnouncementList items={await listAnnouncements(event.id)} /></PortalShell>;
}
