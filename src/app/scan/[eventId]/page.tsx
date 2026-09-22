import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { activeCheckpoint, checkpointsByDay } from "@/lib/checkpoints";
import { countCheckinsByCheckpoint } from "@/lib/db/checkins";
import { countAttendees } from "@/lib/db/attendees";
import { nowInKL } from "@/lib/time";
import { shortDate } from "@/lib/text";
import { Scanner } from "./Scanner";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ChevronRight, Flag } from "lucide-react";

export default async function ScanPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ cp?: string; pick?: string }> }) {
  const { eventId } = await params; const { cp, pick } = await searchParams;
  const { orgId } = await requireAdmin(); const ev = await requireEvent(eventId, orgId);

  // Refused here, not merely hidden from the sidebar (D159). The scanner is reached by a
  // bookmark and a shared link as often as by the nav, and a stale one must not go on
  // writing checkins into an event that has switched its door off — rows nobody will ever
  // look at, which would reappear as history the day somebody switches it back on.
  if (!ev.check_in_enabled) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
        <header>
          <h1 className="text-lg font-extrabold leading-tight">{ev.name}</h1>
        </header>
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Flag /></EmptyMedia>
            <EmptyTitle>Check-in is off for this event</EmptyTitle>
            <EmptyDescription>Nobody is scanned here. An organiser can switch it on under Settings &rsaquo; Checkpoints.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <a href={`/admin/events/${ev.id}`} className={buttonVariants()}>Back to the event</a>
          </EmptyContent>
        </Empty>
      </main>
    );
  }

  const [cps, counts, total] = await Promise.all([listCheckpoints(ev.id), countCheckinsByCheckpoint(ev.id), countAttendees(ev.id)]);
  const today = nowInKL().date;
  // Crew open the scanner and start scanning: it lands on whatever Settings says the event
  // is running, and the chooser is one tap away for the second door. `?cp=` still wins, so
  // a link to a particular door keeps working.
  const active = cps.find((c) => c.id === cp)
    ?? (pick ? undefined : activeCheckpoint(ev.active_checkpoint_id, cps, today) ?? undefined);
  if (!active) {
    const grouped = checkpointsByDay(cps);
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
        <header>
          <h1 className="text-lg font-extrabold leading-tight">{ev.name}</h1>
          <p className="text-sm text-muted-foreground">Which door are you on?</p>
        </header>
        {grouped.length === 0 ? (
          // The old copy said "Add them in Settings" to crew who cannot leave this screen
          // to look for it. If the answer is a page, the page should be a tap away.
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Flag /></EmptyMedia>
              <EmptyTitle>No checkpoints yet</EmptyTitle>
              <EmptyDescription>A checkpoint is a door — registration, lunch, day two. Scanning needs at least one.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <a href={`/admin/events/${ev.id}/settings`} className={buttonVariants()}>Add one in Settings</a>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="flex flex-col gap-5">
            {grouped.map((g) => (
              <section key={g.day} className="flex flex-col gap-1.5">
                <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {shortDate(g.day)}
                  {/* The crew open this on the day; say which group is the one in front of them. */}
                  {g.day === today && <Badge variant="success">Today</Badge>}
                </h2>
                <ul className="flex flex-col gap-2">
                  {g.items.map((c) => (
                    <li key={c.id}>
                      <a href={`/scan/${ev.id}?cp=${c.id}`}
                        className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card px-4 transition-colors hover:bg-muted active:bg-muted">
                        <Flag className="size-5 shrink-0 text-primary" />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-bold">{c.name}</span>
                          {/* Settings decides which door the scanner opens on. Saying so here stops
                              a second crew member picking the one the first is already working. */}
                          {c.id === ev.active_checkpoint_id && <span className="text-xs font-semibold text-primary">Running now</span>}
                        </span>
                        <Badge variant="secondary" className="shrink-0 tabular-nums">{counts[c.id] ?? 0}/{total}</Badge>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    );
  }
  return <Scanner eventId={ev.id} checkpoint={active} initialCount={counts[active.id] ?? 0} total={total} />;
}
