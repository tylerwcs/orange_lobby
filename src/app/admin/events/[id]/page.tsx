import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { countAttendees, listAttendees } from "@/lib/db/attendees";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { listCheckinsForEvent } from "@/lib/db/checkins";
import Link from "next/link";
import { ScanLine } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { OverviewStats } from "@/components/admin/OverviewStats";
import { RunningCheckpoint } from "@/components/admin/RunningCheckpoint";
import { RecentScans } from "@/components/admin/RecentScans";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { setActiveCheckpointAction } from "./actions";
import { checkedInCount, recentScans } from "@/lib/checkins-stats";
import { activeCheckpoint, checkpointOptions } from "@/lib/checkpoints";
import { nowInKL } from "@/lib/time";

export const metadata = { title: "Overview · Orange Lobby" };

export default async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
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
