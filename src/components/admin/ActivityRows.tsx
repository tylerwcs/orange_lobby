import Link from "next/link";
import type { Activity } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

/**
 * The activity list. Follows BoothList's row shape (badges, tabular-nums counts) but carries
 * no reorder or delete controls here — those live on the per-activity page (Task 9), since
 * this list's job is to get the organiser to the right activity, not to edit one inline.
 */
export function ActivityRows({ items, counts, seats, basePath }: {
  items: Activity[];
  /** Bookings per activity id. */
  counts: Record<string, number>;
  /** Total capacity per activity id. */
  seats: Record<string, number>;
  basePath: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No activities yet. Add one to let attendees book a seat.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {items.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
          <Link href={`${basePath}/activities/${a.id}`} className="min-w-0 flex-1 font-medium hover:underline">
            {a.name}
          </Link>
          {a.required && <Badge variant="secondary">Pick one</Badge>}
          <Badge variant={a.booking_open ? "default" : "outline"}>
            {a.booking_open ? "Booking open" : "Closed"}
          </Badge>
          <span className="text-sm text-muted-foreground tabular-nums">
            {counts[a.id] ?? 0} / {seats[a.id] ?? 0} seats
          </span>
        </li>
      ))}
    </ul>
  );
}
