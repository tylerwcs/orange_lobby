import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { eventFeatures, featureForActivityKind, has, NotInEvent } from "@/features/catalogue";
import { getActivity } from "../db/activities";
import { BookingDetail } from "../kinds/booking/BookingDetail";
import { SubmissionDetail } from "../kinds/submission/SubmissionDetail";
import { PassportDetail } from "../kinds/passport/PassportDetail";

export async function ActivityDetailPage({ params, searchParams }: {
  params: Promise<{ id: string; activityId: string }>;
  searchParams: Promise<{ day?: string; qr?: string; tab?: string; week?: string; team?: string }>;
}) {
  const { id, activityId } = await params;
  const { day: requestedDay, qr, tab, week, team } = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const activity = await getActivity(activityId, ev.id);
  if (!activity) notFound();
  const need = featureForActivityKind(activity.kind);
  if (!has(await eventFeatures(ev.id), need)) {
    return <NotInEvent eventId={ev.id} title={activity.name} keys={[need]} back={`/admin/events/${ev.id}/activities/${activity.id}`} />;
  }

  // Three entirely different screens share this route because they share everything ABOVE this
  // point — the event guard, the not-found check — and nothing below it (D178). A booking
  // activity has sessions, requests and an unbooked list; a submission activity has answers,
  // a chasing list and a participation strip; a passport has its booths and their scanner
  // links (D190). None of the three reads another's data.
  //
  // Each is a header, a tab strip and the current tab (D234): the page opens on Setup, which is
  // what the organiser comes back for, and what attendees have done is one tab away rather than
  // stacked above it.
  //
  // One case per kind (D414): a kind added to ActivityKind does not build until it has a screen.
  switch (activity.kind) {
    case "booking": return <BookingDetail ev={ev} activity={activity} tab={tab} />;
    case "submission": return <SubmissionDetail ev={ev} activity={activity} requestedDay={requestedDay} tab={tab} week={week} teamId={team} />;
    case "passport": return <PassportDetail ev={ev} activity={activity} qr={qr} />;
    default: {
      const exhaustive: never = activity.kind;
      throw new Error(`Unhandled activity kind: ${String(exhaustive)}`);
    }
  }
}
