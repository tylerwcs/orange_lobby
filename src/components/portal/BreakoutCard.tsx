import type { MyBreakout } from "@/lib/breakouts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const caption = "text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground";

/**
 * Every breakout round this attendee has, across the whole event.
 *
 * All of them rather than the next one: two rounds in one afternoon is exactly when somebody
 * wants to look ahead, and "what is next" is already the job of the card above this one.
 *
 * A round with no room still appears. This is the card someone opens when they do not know
 * where to go, so it is the worst possible place to say nothing.
 */
export function BreakoutCard({ breakouts, contactPhone }: { breakouts: MyBreakout[]; contactPhone: string | null }) {
  if (breakouts.length === 0) return null;
  return (
    <Card>
      <CardHeader><CardTitle className={caption}>Your breakouts</CardTitle></CardHeader>
      <CardContent>
        <dl className="divide-y text-sm">
          {breakouts.map((b) => (
            <div key={b.slot} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-0.5 py-2.5">
              <dt className="text-muted-foreground">
                {b.slot}
                <span className="ml-2 tabular-nums">{b.starts_at}{b.ends_at ? `–${b.ends_at}` : ""}</span>
              </dt>
              <dd className="ml-auto font-medium">
                {b.item
                  ? <span className="font-extrabold">{b.item.location ?? b.item.code ?? b.item.title}</span>
                  : <span className="text-muted-foreground">
                      Room not assigned yet{contactPhone ? <> · <a className="font-medium text-primary" href={`tel:${contactPhone}`}>{contactPhone}</a></> : null}
                    </span>}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
