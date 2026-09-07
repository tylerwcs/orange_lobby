import { loadPortalAttendee } from "@/lib/portal";
import { sanitizeHtml } from "@/lib/sanitize";
import { PortalShell } from "@/components/portal/PortalShell";

export default async function PersonalInfo({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event } = await loadPortalAttendee(slug, token);
  return (
    <PortalShell event={event} basePath={`/e/${slug}/a/${token}`} personal>
      <h1 className="mb-3 text-xl font-semibold">{event.info_page_title}</h1>
      <div className="prose prose-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(event.info_page_html ?? "") }} />
    </PortalShell>
  );
}
