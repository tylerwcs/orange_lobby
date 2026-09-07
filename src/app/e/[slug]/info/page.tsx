import { loadPortalEvent } from "@/lib/portal";
import { sanitizeHtml } from "@/lib/sanitize";
import { PortalShell } from "@/components/portal/PortalShell";

export default async function GenericInfo({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await loadPortalEvent(slug);
  return (
    <PortalShell event={event} basePath={`/e/${slug}`} personal={false}>
      <h1 className="mb-3 text-xl font-semibold">{event.info_page_title}</h1>
      <div className="prose prose-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(event.info_page_html ?? "") }} />
    </PortalShell>
  );
}
