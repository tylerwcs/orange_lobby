import { notFound } from "next/navigation";
import { getBoothByToken, countStampsForBooth } from "@/lib/db/booths";
import { getEvent } from "@/lib/db/events";
import { getActivity } from "@/lib/db/activities";
import { countAttendees, listAttendees } from "@/lib/db/attendees";
import { eligible } from "@/lib/activities";
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

  // Out of the passport's own audience, not the whole roster (D184) — same reasoning
  // PassportDetail's `audience` gives. This route is public and force-dynamic, though, so a
  // categoryless passport (the common case) keeps the cheap head-count instead of pulling every
  // attendee down just to filter none of them out.
  const [count, total] = await Promise.all([
    countStampsForBooth(booth.id),
    passport.categories && passport.categories.length > 0
      ? listAttendees(event.id).then((rows) => rows.filter((a) => eligible(passport, a.category)).length)
      : countAttendees(event.id),
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
