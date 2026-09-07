import { loadPortalAttendee } from "@/lib/portal";
import { PortalShell } from "@/components/portal/PortalShell";
import { EventInfoCard } from "@/components/portal/EventInfoCard";

export default async function PersonalHome({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  return <PortalShell event={event} basePath={`/e/${slug}/a/${token}`} personal><EventInfoCard event={event} greeting={attendee.name.split(" ")[0]} /></PortalShell>;
}
