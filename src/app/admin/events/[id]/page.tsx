import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { countAttendees, listAttendees } from "@/lib/db/attendees";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { listCheckinsForEvent } from "@/lib/db/checkins";
import { buttonClass } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SummaryCard } from "@/components/admin/SummaryCard";
import { SummaryCardSkeleton } from "@/components/admin/SummaryCardSkeleton";
import { CheckpointPicker } from "@/components/admin/CheckpointPicker";
import { CheckpointProgress } from "@/components/admin/CheckpointProgress";
import { RecentScans } from "@/components/admin/RecentScans";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { checkedInCount, recentScans, countByCheckpoint } from "@/lib/checkins-stats";
import { checkpointsByDay } from "@/lib/checkpoints";
import { shortDate } from "@/lib/text";

export const metadata = { title: "Overview · Orange Lobby" };

/**
 * The summary reads its own data inside its own boundary, so changing the checkpoint
 * shows a skeleton in that one card rather than blanking the dashboard. Both queries are
 * memoised per request, so reading them again here costs no round trip.
 */
async function Summary({ eventId, checkpointId, scope, picker }: {
  eventId: string;
  checkpointId: string | null;
  scope: string;
  picker: React.ReactNode;
}) {
  const [total, checkins] = await Promise.all([countAttendees(eventId), listCheckinsForEvent(eventId)]);
  return <SummaryCard checkedIn={checkedInCount(checkins, checkpointId)} registered={total} scope={scope} picker={picker} />;
}

export default async function Overview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cp?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const [total, cps, checkins, attendees] = await Promise.all([
    countAttendees(ev.id), listCheckpoints(ev.id), listCheckinsForEvent(ev.id), listAttendees(ev.id),
  ]);

  const counts = countByCheckpoint(checkins);
  const cpNames = new Map(cps.map((c) => [c.id, c.name]));
  const scans = recentScans(checkins, attendees, 11);
  const days = checkpointsByDay(cps).map(({ day, items }) => ({
    day,
    items: items.map((c) => ({ checkpoint: c, count: counts[c.id] ?? 0 })),
  }));

  // A checkpoint id from a stale link counts nothing at all, which would read as an empty
  // room; fall back to counting everyone instead.
  const chosen = cps.find((c) => c.id === sp.cp) ?? null;
  const multiDay = days.length > 1;
  const options = cps.map((c) => ({ id: c.id, label: multiDay ? `${c.name} · ${shortDate(c.day)}` : c.name }));
  const scope = chosen
    ? `At ${chosen.name}${multiDay ? ` · ${shortDate(chosen.day)}` : ""}`
    : "Across every checkpoint";
  // The heading counts whatever the summary counts. Two figures on one screen that
  // disagree because one of them silently ignores the filter is worse than no filter.
  const checkedIn = checkedInCount(checkins, chosen?.id ?? null);

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Overview"
        subtitle={`${ev.name} · ${checkedIn} of ${total} in${chosen ? ` at ${chosen.name}` : ""}`}
        actions={<a href={`/scan/${ev.id}`} className={buttonClass("primary")}><Icon name="scan" size={18} />Open scanner</a>}
      />
      {/* Scans on the left because that is the column that keeps growing; the short
          cards go right, which is what stops the dead space this layout used to have. */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <RecentScans rows={scans} checkpointNames={cpNames} live={<AutoRefresh seconds={15} />} />
        <div className="flex flex-col gap-6">
          {/* Keyed on the choice so switching checkpoint re-suspends and the skeleton shows. */}
          <Suspense key={chosen?.id ?? "all"} fallback={<SummaryCardSkeleton />}>
            <Summary
              eventId={ev.id}
              checkpointId={chosen?.id ?? null}
              scope={scope}
              picker={cps.length > 0 && <CheckpointPicker eventId={ev.id} options={options} value={chosen?.id ?? ""} />}
            />
          </Suspense>
          <CheckpointProgress days={days} registered={total} />
        </div>
      </div>
    </div>
  );
}
