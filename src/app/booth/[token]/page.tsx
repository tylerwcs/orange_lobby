import { notFound } from "next/navigation";
import { getBoothByToken, countStampsForBooth } from "@/lib/db/booths";
import { getEvent } from "@/lib/db/events";
import { getActivity } from "@/lib/db/activities";
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
  const [event, passport] = await Promise.all([getEvent(booth.event_id), getActivity(booth.activity_id, booth.event_id)]);
  if (!event || !passport) notFound();

  const [count, total] = await Promise.all([
    countStampsForBooth(booth.id),
    countAttendees(event.id),
  ]);

  return (
    <BoothScanner
      boothToken={token}
      booth={{ name: booth.name, location: booth.location, passport: passport.name }}
      archived={event.status === "archived"}
      closed={!passport.is_open}
      initialCount={count}
      total={total}
    />
  );
}
