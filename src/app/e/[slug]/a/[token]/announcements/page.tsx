import { loadPortalAttendee } from "@/lib/portal";
import { listAnnouncements } from "@/lib/db/announcements";
import { PortalShell } from "@/components/portal/PortalShell";
import { AnnouncementList } from "@/components/portal/AnnouncementList";

export default async function PersonalNews({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event } = await loadPortalAttendee(slug, token);
  return <PortalShell event={event} basePath={`/e/${slug}/a/${token}`} personal><AnnouncementList items={await listAnnouncements(event.id)} /></PortalShell>;
}
