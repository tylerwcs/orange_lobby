import { notFound } from "next/navigation";
import { getBoothByToken, countStampsByBooth } from "@/lib/db/booths";
import { getEvent } from "@/lib/db/events";
import { countAttendees } from "@/lib/db/attendees";
import { isValidToken } from "@/lib/tokens";
import { BoothScanner } from "./BoothScanner";

// Never cached: the booth's own count must be live, and a stale page would re-stamp against a
// booth that has since been renamed.
export const dynamic = "force-dynamic";

export default async function BoothPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isValidToken(token)) notFound();
  const booth = await getBoothByToken(token);
  if (!booth) notFound();
  const event = await getEvent(booth.event_id);
  if (!event) notFound();

  const [counts, total] = await Promise.all([
    countStampsByBooth(event.id),
    countAttendees(event.id),
  ]);

  return (
    <BoothScanner
      boothToken={token}
      booth={{ name: booth.name, location: booth.location }}
      archived={event.status === "archived"}
      initialCount={counts[booth.id] ?? 0}
      total={total}
    />
  );
}
