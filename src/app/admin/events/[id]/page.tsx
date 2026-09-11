import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { countAttendees, listAttendees } from "@/lib/db/attendees";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { listCheckinsForEvent } from "@/lib/db/checkins";
import { buttonClass } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SummaryCard } from "@/components/admin/SummaryCard";
import { RecentScans } from "@/components/admin/RecentScans";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { checkedInCount, recentScans } from "@/lib/checkins-stats";
import { checkpointsByDay } from "@/lib/checkpoints";
import { shortDate } from "@/lib/text";

export const metadata = { title: "Overview · Orange Lobby" };

export default async function Overview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cp?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const [total, cps, checkins, attendees] = await Promise.all([
    countAttendees(ev.id), listCheckpoints(ev.id), listCheckinsForEvent(ev.id), listAttendees(ev.id),
  ]);

  const cpNames = new Map(cps.map((c) => [c.id, c.name]));
  const scans = recentScans(checkins, attendees, 11);

  // A checkpoint id from a stale link counts nothing at all, which would read as an empty
  // room; fall back to counting everyone instead.
  const chosen = cps.find((c) => c.id === sp.cp) ?? null;
  const multiDay = checkpointsByDay(cps).length > 1;
  const options = cps.map((c) => ({ id: c.id, label: multiDay ? `${c.name} · ${shortDate(c.day)}` : c.name }));

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Overview"
        // The check-in figure belongs to the Summary card, which says which checkpoint it
        // is counting. Repeating it here would state it twice, and the two would disagree
        // for as long as a checkpoint change was in flight.
        subtitle={`${ev.name} · ${total} registered`}
        actions={<a href={`/scan/${ev.id}`} className={buttonClass("primary")}><Icon name="scan" size={18} />Open scanner</a>}
      />
      {/* Scans on the left because that is the column that keeps growing; the short
          cards go right, which is what stops the dead space this layout used to have. */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <RecentScans rows={scans} checkpointNames={cpNames} live={<AutoRefresh seconds={15} />} />
        <SummaryCard
          eventId={ev.id}
          options={options}
          checkpointId={chosen?.id ?? ""}
          checkedIn={checkedInCount(checkins, chosen?.id ?? null)}
          registered={total}
        />
      </div>
    </div>
  );
}
