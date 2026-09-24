import { Clock } from "lucide-react";
import { breakoutRoom, roomLabel, type MyBreakout } from "@/lib/breakouts";
import { shortDate } from "@/lib/text";

/**
 * Every breakout round this attendee has, across the whole event, as a row of tickets that
 * swipes sideways like the launcher and the activity cards (D218).
 *
 * Each ticket is one round: what and when on the left, the room on the right - large, the way
 * a boarding pass prints the gate, because the room is what somebody opens this to find.
 * All rounds rather than the next one: two in one afternoon is exactly when somebody wants to
 * look ahead. A lone ticket takes the full width; cut off, it would look like there were more.
 *
 * A round with no room still gets a ticket. This is where someone looks when they do not know
 * where to go, so it is the worst possible place to say nothing.
 */
export function BreakoutCard({ breakouts, contactPhone }: { breakouts: MyBreakout[]; contactPhone: string | null }) {
  if (breakouts.length === 0) return null;
  const single = breakouts.length === 1;
  return (
    <section aria-labelledby="home-breakouts" className="flex flex-col gap-3">
      <h2 id="home-breakouts" className="px-0.5 text-base font-extrabold">Your breakouts</h2>
      <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0 md:scroll-px-0">
        {breakouts.map((b) => (
          <li key={b.slot} className={`flex shrink-0 snap-start ${single ? "w-full" : "w-[280px]"}`}>
            <Ticket b={b} contactPhone={contactPhone} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Ticket({ b, contactPhone }: { b: MyBreakout; contactPhone: string | null }) {
  const time = b.starts_at ? `${b.starts_at}${b.ends_at ? `–${b.ends_at}` : ""}` : null;
  const room = b.item ? roomLabel(breakoutRoom(b.item)) : null;
  return (
    <div className="flex w-full overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3.5">
        <div className="text-xs font-semibold text-muted-foreground">{b.slot} · {shortDate(b.day)}</div>
        {b.item && <div className="line-clamp-2 text-[15px] font-bold leading-snug">{b.item.title}</div>}
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
        <div className="flex w-24 shrink-0 flex-col items-center justify-center gap-0.5 border-l-2 border-dashed border-primary/25 bg-accent px-2 py-3 text-center text-primary">
          {room.prefix && <span className="text-xs font-bold">{room.prefix}</span>}
          <span className={`break-words font-extrabold ${room.main.length <= 4 ? "text-3xl leading-none" : "text-base leading-tight"}`}>{room.main}</span>
        </div>
      ) : (
        <div className="flex w-24 shrink-0 items-center justify-center border-l-2 border-dashed border-border bg-muted px-2 py-3 text-center text-xs font-semibold text-muted-foreground">
          Not assigned yet
        </div>
      )}
    </div>
  );
}
