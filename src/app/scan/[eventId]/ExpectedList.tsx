import type { ReactNode } from "react";
import type { Board, BoardSlot } from "@/features/activities/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { shortTime } from "@/lib/text";
import { cn } from "@/lib/utils";

const PHASE_LABEL: Record<BoardSlot["phase"], string | null> = { now: "Now", next: "Next", later: null, earlier: null };

/**
 * Who a booking door is waiting for (D324), in slot order. The slot running now and the next
 * one stay open; later and ended slots fold away so the list a thumb works stays short.
 * Ended slots name their no-shows but keep "Mark arrived": late arrivals happen.
 */
export function ExpectedList({ board, busy, onMark, live }: {
  board: Board;
  busy: boolean;
  onMark: (attendeeId: string) => void;
  /** The Live/Paused pill: this list is shared by every phone on the door and re-read (D332). */
  live: ReactNode;
}) {
  const open = board.slots.filter((s) => s.phase === "now" || s.phase === "next");
  // A door dated another day has no now or next: show every slot open, in order.
  const shownOpen = open.length > 0 ? open : board.slots;
  const later = open.length > 0 ? board.slots.filter((s) => s.phase === "later") : [];
  const earlier = open.length > 0 ? board.slots.filter((s) => s.phase === "earlier") : [];
  const earlierNoShows = earlier.reduce((n, s) => n + s.noShows, 0);

  const slot = (s: BoardSlot) => (
    <div key={s.id} className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border bg-muted px-3.5 py-2 text-xs font-bold">
        {PHASE_LABEL[s.phase] && <Badge variant={s.phase === "now" ? "success" : "secondary"}>{PHASE_LABEL[s.phase]}</Badge>}
        <span className="tabular-nums">{s.time}</span>
        {s.location && <span className="font-semibold text-muted-foreground">{s.location}</span>}
        <span className="ml-auto tabular-nums text-muted-foreground">
          {s.arrived} of {s.people.length}{s.noShows ? ` · ${s.noShows} no-show` : ""}
        </span>
      </div>
      {s.people.length === 0 ? (
        <p className="px-3.5 py-2.5 text-sm text-muted-foreground">Nobody booked</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {s.people.map((p) => (
            <li key={p.id} className="flex min-h-12 items-center gap-3 px-3.5 py-1.5">
              <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", p.arrivedAt ? "bg-success-strong" : "border-2 border-border")} />
              <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
              {p.arrivedAt ? (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">arrived {shortTime(p.arrivedAt)}</span>
              ) : (
                <>
                  {p.noShow && <Badge className="shrink-0 bg-destructive-soft text-destructive-strong">No-show</Badge>}
                  <Button type="button" size="sm" variant="outline" disabled={busy} className="h-11 shrink-0" onClick={() => onMark(p.id)}>
                    Mark arrived
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <section className="mt-2 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-muted-foreground">Expected</h2>
        {live}
      </div>
      {board.slots.length === 0 && (
        <p className="rounded-xl border border-dashed border-border px-3.5 py-3 text-sm text-muted-foreground">No sessions on this day any more.</p>
      )}
      {shownOpen.map(slot)}
      {later.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer py-1.5 text-sm font-bold text-muted-foreground">Later · {later.length} slot{later.length === 1 ? "" : "s"}</summary>
          <div className="mt-2 flex flex-col gap-2">{later.map(slot)}</div>
        </details>
      )}
      {earlier.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer py-1.5 text-sm font-bold text-muted-foreground">
            Earlier · {earlier.length} slot{earlier.length === 1 ? "" : "s"}{earlierNoShows ? ` · ${earlierNoShows} no-show` : ""}
          </summary>
          <div className="mt-2 flex flex-col gap-2">{earlier.map(slot)}</div>
        </details>
      )}
      {board.walkIns.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border bg-muted px-3.5 py-2 text-xs font-bold">Walk-ins · {board.walkIns.length}</div>
          <ul className="divide-y divide-border text-sm">
            {board.walkIns.map((w) => (
              <li key={w.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-warning" />
                <span className="min-w-0 flex-1 truncate font-semibold">{w.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{shortTime(w.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
