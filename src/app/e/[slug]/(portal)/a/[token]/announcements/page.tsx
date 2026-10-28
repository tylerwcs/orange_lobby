import { loadPortalAttendee, isUnpublished } from "@/lib/portal";
import { listAnnouncements } from "@/lib/db/announcements";
import { categoryMatches } from "@/lib/agenda";
import { AnnouncementList } from "@/components/portal/AnnouncementList";
import { TITLE_INK } from "@/lib/ink";
import { portalLang, t } from "@/features/language";

export default async function PersonalNews({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  // A draft shows only "Coming soon" (the layout's chrome); see isUnpublished.
  if (isUnpublished(event)) return null;
  const lang = await portalLang(event);
  return (
    <>
      <h1 className={`mb-3 text-xl font-extrabold ${TITLE_INK}`}>{t(lang).announcements.title}</h1>
      <AnnouncementList lang={lang} items={(await listAnnouncements(event.id)).filter((a) => categoryMatches(a.categories, attendee.category))} />
    </>
  );
}
