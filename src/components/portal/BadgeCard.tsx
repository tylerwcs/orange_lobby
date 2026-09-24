import Link from "next/link";
import type { Attendee } from "@/lib/types";
import { pinGrid, type ResolvedPin } from "@/lib/pinned-fields";
import { Icon } from "@/components/ui/icon";
import { displayName } from "@/lib/text";
import { BadgeQrDialog } from "./BadgeQrDialog";

/**
 * Am I in, who am I, and the handful of facts this event decided matter.
 *
 * The bottom of the card is whatever the event pinned, in the event's order, as equal tiles
 * (D224): the same box and the same size for every value, so a table number and a room
 * number line up instead of one towering over the other. `pinGrid` decides three across or
 * two, and which long values take a row of their own. The Floor plan button sits under the
 * tiles at full width, when the event offers one (D225). The pins arrive already resolved,
 * so a fact this attendee has no value for never reaches the card - and when nothing survives
 * and there is no floor plan, the section and its rule disappear rather than sitting empty.
 *
 * Company used to print under the name unconditionally. It is a pin now like anything else:
 * an event whose badges should carry it pins it in Settings, and `pinnableFields` offers it
 * the moment the event defines the column.
 */
export function BadgeCard({ attendee, basePath, checkedInAt, floorPlan, pins, qr }: {
  attendee: Attendee; basePath: string; checkedInAt: string | null; floorPlan: boolean; pins: ResolvedPin[];
  /** The attendee's QR as a data URL; the square button opens it in place (was a link to Me). */
  qr: string;
}) {
  const grid = pinGrid(pins);
  return (
    <section className="@container flex flex-col gap-3 rounded-xl bg-foreground p-4 text-background">
      <div className="flex items-center gap-3.5">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
          {checkedInAt
            ? <span className="inline-flex items-center gap-1.5 rounded-full bg-success/25 px-2.5 py-1 text-xs font-extrabold text-success-soft"><span aria-hidden="true" className="size-1.5 rounded-full bg-success-soft" />Checked in {checkedInAt}</span>
            : <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-xs font-extrabold text-background/70">Not checked in yet</span>}
          <div className="text-lg font-extrabold leading-tight text-balance @2xs:text-xl">{displayName(attendee.name)}</div>
        </div>
        <BadgeQrDialog
          qr={qr}
          name={attendee.name}
          trigger={
            <button type="button" aria-label="Show my QR code" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-background text-foreground outline-none transition-transform focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95">
              <Icon name="qr" size={28} />
            </button>
          }
        />
      </div>
      {(pins.length > 0 || floorPlan) && (
        <>
          <div className="h-px bg-white/10" />
          {pins.length > 0 && (
            <dl className={`grid grid-flow-row-dense gap-2 ${grid.columns === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
              {pins.map((p, i) => (
                <div key={p.key} className={`flex min-w-0 flex-col gap-1 rounded-lg bg-white/10 px-3 py-2.5 ${grid.cells[i].full ? "col-span-full" : ""}`}>
                  <dt className="truncate text-xs font-bold uppercase tracking-[0.06em] text-background/70">{p.label}</dt>
                  <dd className={grid.cells[i].small
                    ? "text-base font-extrabold leading-tight break-words text-primary"
                    : "text-2xl font-extrabold leading-none tabular-nums text-primary"}>{p.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {floorPlan && (
            <Link href={`${basePath}/plan`} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-white/10 px-3.5 text-xs font-bold">
              <Icon name="map" size={16} />Floor plan
            </Link>
          )}
        </>
      )}
    </section>
  );
}
