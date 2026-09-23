import { loadPortalAttendee } from "@/lib/portal";
import { InfoPage } from "@/components/portal/InfoPage";

export default async function PersonalInfo({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event } = await loadPortalAttendee(slug, token);
  return <InfoPage event={event} basePath={`/e/${slug}/a/${token}`} />;
}
