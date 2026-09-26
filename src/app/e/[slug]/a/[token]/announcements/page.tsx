import { loadPortalAttendee, isUnpublished } from "@/lib/portal";
import { listAnnouncements } from "@/lib/db/announcements";
import { categoryMatches } from "@/lib/agenda";
import { AnnouncementList } from "@/components/portal/AnnouncementList";

export default async function PersonalNews({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  // A draft shows only "Coming soon" (the layout's chrome); see isUnpublished.
  if (isUnpublished(event)) return null;
  return (
    <>
      <h1 className="mb-3 text-xl font-extrabold">Announcements</h1>
      <AnnouncementList items={(await listAnnouncements(event.id)).filter((a) => categoryMatches(a.categories, attendee.category))} />
    </>
  );
}
