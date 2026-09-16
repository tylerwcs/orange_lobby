import { notFound } from "next/navigation";
import { getEventByCrewToken } from "@/lib/db/events";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { activeCheckpoint, checkpointsByDay } from "@/lib/checkpoints";
import { countCheckinsByCheckpoint } from "@/lib/db/checkins";
import { countAttendees } from "@/lib/db/attendees";
import { crewLinkLive } from "@/lib/crew";
import { isValidToken } from "@/lib/tokens";
import { nowInKL } from "@/lib/time";
import { shortDate } from "@/lib/text";
import { Scanner } from "@/app/scan/[eventId]/Scanner";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ChevronRight, Flag } from "lucide-react";

// Never cached: the counts are live, and an expired link must stop working on the day it does.
export const dynamic = "force-dynamic";

export default async function CrewPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ cp?: string; pick?: string }> }) {
  const { token } = await params; const { cp, pick } = await searchParams;
  if (!isValidToken(token)) notFound();
  const ev = await getEventByCrewToken(token);
  if (!ev) notFound();

  const today = nowInKL().date;
  // An expired link says so rather than 404ing: the crew member holding it did nothing wrong,
  // and "ask the organiser for a new link" is the action they need.
  if (!crewLinkLive(ev, today)) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 p-6">
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Flag /></EmptyMedia>
            <EmptyTitle>This scanner link has expired</EmptyTitle>
            <EmptyDescription>{ev.name} has finished. Ask the organiser for a new link if you still need to scan.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    );
  }

  const [cps, counts, total] = await Promise.all([
    listCheckpoints(ev.id), countCheckinsByCheckpoint(ev.id), countAttendees(ev.id),
  ]);
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
          // Crew cannot reach Settings, so this says who to ask rather than where to click.
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Flag /></EmptyMedia>
              <EmptyTitle>No checkpoints yet</EmptyTitle>
              <EmptyDescription>Scanning needs at least one. Ask the organiser to add one.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-5">
            {grouped.map((g) => (
              <section key={g.day} className="flex flex-col gap-1.5">
                <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {shortDate(g.day)}
                  {g.day === today && <Badge variant="success">Today</Badge>}
                </h2>
                <ul className="flex flex-col gap-2">
                  {g.items.map((c) => (
                    <li key={c.id}>
                      <a href={`/crew/${token}?cp=${c.id}`}
                        className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card px-4 transition-colors hover:bg-muted active:bg-muted">
                        <Flag className="size-5 shrink-0 text-primary" />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-bold">{c.name}</span>
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

  return <Scanner eventId={ev.id} checkpoint={active} initialCount={counts[active.id] ?? 0} total={total} crewToken={token} />;
}
