import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { countAttendees, listAttendees } from "@/lib/db/attendees";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { listCheckinsForEvent } from "@/lib/db/checkins";
import { listActivities, listSessions, listBookings, countBookingsBySession } from "@/lib/db/activities";
import Link from "next/link";
import { ScanLine } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { OverviewStats } from "@/components/admin/OverviewStats";
import { ActivityOverview } from "@/components/admin/ActivityOverview";
import { RunningCheckpoint } from "@/components/admin/RunningCheckpoint";
import { RecentScans } from "@/components/admin/RecentScans";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { setActiveCheckpointAction } from "./actions";
import { checkedInCount, recentScans } from "@/lib/checkins-stats";
import { activitySummaries } from "@/lib/activities";
import { activeCheckpoint, checkpointOptions } from "@/lib/checkpoints";
import { nowInKL } from "@/lib/time";

export const metadata = { title: "Overview" };

/**
 * What an organiser watches all day — which is a different question depending on whether
 * the event has a door (D159).
 *
 * The two branches load different data on purpose. An event with check-in off never reads
 * `checkins` or `checkpoints` at all: those queries would be answering a question the page
 * is not asking, and the roster on a weeks-long wellness programme is not small.
 */
export default async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const basePath = `/admin/events/${ev.id}`;

  if (!ev.check_in_enabled) {
    const [total, attendees, activities, sessions, counts, bookings] = await Promise.all([
      countAttendees(ev.id), listAttendees(ev.id), listActivities(ev.id, "booking"),
      listSessions(ev.id), countBookingsBySession(ev.id), listBookings(ev.id),
    ]);
    const byId = new Map(attendees.map((a) => [a.id, a]));
    return (
      <div className="flex flex-col gap-6">
        <AdminHeader title="Overview" subtitle={`${ev.name} · ${total} registered`} />
        <ActivityOverview
          rows={activitySummaries(
            activities, sessions, counts, bookings, attendees.map((a) => a.id),
            (attendeeId) => byId.get(attendeeId)?.category ?? null,
          )}
          registered={total}
          basePath={basePath}
        />
      </div>
    );
  }

  const [total, cps, checkins, attendees] = await Promise.all([
    countAttendees(ev.id), listCheckpoints(ev.id), listCheckinsForEvent(ev.id), listAttendees(ev.id),
  ]);

  const cpNames = new Map(cps.map((c) => [c.id, c.name]));
  const scans = recentScans(checkins, attendees, 11);

  // One control, on the screen an organiser watches all day. The scanner and a bulk
  // check-in read the same value, so they cannot disagree about which door is being worked.
  const running = activeCheckpoint(ev.active_checkpoint_id, cps, nowInKL().date);

  return (
    <div className="flex flex-col gap-6">
      <AdminHeader
        title="Overview"
        subtitle={`${ev.name} · ${total} registered`}
        actions={
          <>
            <RunningCheckpoint
              options={checkpointOptions(cps)}
              value={running?.id ?? ""}
              setActive={setActiveCheckpointAction.bind(null, ev.id)}
            />
            {/* A link that looks like a button, not a Button pretending to be a link:
                rendering one through `Button` keeps Base UI's native-button semantics on an
                <a>, which it warns about. buttonVariants is the styling without the role. */}
            <Link href={`/scan/${ev.id}`} className={buttonVariants()}>
              <ScanLine data-icon="inline-start" />
              Open scanner
            </Link>
          </>
        }
      />
      {/* The numbers first, across the top: "is this event on track" is the question the
          page exists to answer, and it should not be read out of a side rail after the
          scan log. The log then gets the full width it kept outgrowing. */}
      <OverviewStats
        checkedIn={checkedInCount(checkins, running?.id ?? null)}
        registered={total}
        scope={running?.name ?? null}
      />
      <RecentScans rows={scans} checkpointNames={cpNames} live={<AutoRefresh seconds={15} />} />
    </div>
  );
}
