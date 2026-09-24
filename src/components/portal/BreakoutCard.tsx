import { Clock } from "lucide-react";
import { breakoutRoom, roomLabel, ticketTitle, type MyBreakout } from "@/lib/breakouts";
import { shortDate } from "@/lib/text";
import { SwipeRow } from "./SwipeRow";

/**
 * Every breakout round this attendee has, across the whole event, as tickets that swipe
 * sideways one at a time on a phone (D218, D219) and are listed in full on a desktop (D223).
 *
 * Each ticket is one round: what and when on the left, the room on the right - large, the way
 * a boarding pass prints the gate, because the room is what somebody opens this to find.
 * All rounds rather than the next one: two in one afternoon is exactly when somebody wants to
 * look ahead.
 *
 * A round with no room still gets a ticket. This is where someone looks when they do not know
 * where to go, so it is the worst possible place to say nothing.
 */
export function BreakoutCard({ breakouts, contactPhone }: { breakouts: MyBreakout[]; contactPhone: string | null }) {
  if (breakouts.length === 0) return null;
  return (
    <section aria-labelledby="home-breakouts" className="flex flex-col gap-3">
      <h2 id="home-breakouts" className="px-0.5 text-base font-extrabold">Your breakouts</h2>
      <SwipeRow label="Your breakout rounds" stackOnDesktop>
        {breakouts.map((b) => <Ticket key={b.slot} b={b} contactPhone={contactPhone} />)}
      </SwipeRow>
    </section>
  );
}

function Ticket({ b, contactPhone }: { b: MyBreakout; contactPhone: string | null }) {
  const time = b.starts_at ? `${b.starts_at}${b.ends_at ? `–${b.ends_at}` : ""}` : null;
  const room = b.item ? roomLabel(breakoutRoom(b.item)) : null;
  return (
    <div className="flex w-full overflow-hidden rounded-2xl border border-foreground/10 bg-card">
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3.5">
        <div className="text-xs font-semibold text-muted-foreground">{b.slot} · {shortDate(b.day)}</div>
        {b.item && <div className="line-clamp-2 text-[15px] font-bold leading-snug">{ticketTitle(b.item.title)}</div>}
        {time && (
          <div className="mt-auto flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
            <Clock aria-hidden className="size-3.5 shrink-0" />
            <span className="tabular-nums">{time}</span>
          </div>
        )}
        {!b.item && contactPhone && (
          <a href={`tel:${contactPhone}`} className="text-xs font-semibold text-primary">Ask the desk: {contactPhone}</a>
        )}
      </div>
      {room ? (
        <div className="flex w-28 shrink-0 flex-col items-center justify-center gap-0.5 border-l-2 border-dashed border-primary/25 bg-accent px-2 py-3 text-center text-primary">
          {room.prefix && <span className="text-xs font-bold">{room.prefix}</span>}
          <span className={`break-words font-extrabold ${roomSize(room.main)}`}>{room.main}</span>
        </div>
      ) : (
        <div className="flex w-28 shrink-0 items-center justify-center border-l-2 border-dashed border-border bg-muted px-2 py-3 text-center text-xs font-semibold text-muted-foreground">
          Not assigned yet
        </div>
      )}
    </div>
  );
}

/** Big for a number or a code, smaller as the name grows, so "Nusantara" still fits on one line. */
function roomSize(main: string): string {
  if (main.length <= 4) return "text-3xl leading-none";
  if (main.length <= 9) return "text-lg leading-tight";
  return "text-base leading-tight";
}
