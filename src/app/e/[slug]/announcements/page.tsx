import { loadPortalEvent } from "@/lib/portal";
import { listAnnouncements } from "@/lib/db/announcements";
import { categoryMatches } from "@/lib/agenda";
import { PortalShell } from "@/components/portal/PortalShell";
import { AnnouncementList } from "@/components/portal/AnnouncementList";

export default async function GenericNews({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await loadPortalEvent(slug);
  return (
    <PortalShell event={event} basePath={`/e/${slug}`} personal={false}>
      <h1 className="mb-3 text-xl font-extrabold">Announcements</h1>
      {/* The public portal knows nobody, so it shows only announcements for everyone. */}
      <AnnouncementList items={(await listAnnouncements(event.id)).filter((a) => categoryMatches(a.categories, null))} />
    </PortalShell>
  );
}
