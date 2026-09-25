import type { Attendee } from "@/lib/types";
import { pinScale, type ResolvedPin } from "@/lib/pinned-fields";
import { Icon } from "@/components/ui/icon";
import { displayName } from "@/lib/text";
import { BadgeQrDialog } from "./BadgeQrDialog";

/**
 * Am I in, who am I, and the handful of facts this event decided matter.
 *
 * The bottom of the card is whatever the event pinned, in the event's order, as equal tiles
 * (D224): the same box and the same size for every value, so a table number and a room
 * number line up instead of one towering over the other. They share a row whenever they fit
 * and wrap when they do not; a long value drops to smaller type. No Floor plan button: the
 * launcher has the floor plan (D226). The pins arrive already resolved, so a fact this
 * attendee has no value for never reaches the card - and when nothing survives, the section
 * and its rule disappear rather than sitting empty.
 *
 * Company used to print under the name unconditionally. It is a pin now like anything else:
 * an event whose badges should carry it pins it in Settings, and `pinnableFields` offers it
 * the moment the event defines the column.
 */
export function BadgeCard({ attendee, door, checkedInAt, pins, qr }: {
  attendee: Attendee;
  /** Whether the event checks people in at all (D159). Without a door there is no status to show. */
  door: boolean;
  checkedInAt: string | null; pins: ResolvedPin[];
  /** The attendee's QR as a data URL; the square button opens it in place (was a link to Me). */
  qr: string;
}) {
  return (
    <section className="@container flex flex-col gap-3 rounded-xl bg-foreground p-4 text-background">
      <div className="flex items-center gap-3.5">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
          {door && (checkedInAt
            ? <span className="inline-flex items-center gap-1.5 rounded-full bg-success/25 px-2.5 py-1 text-xs font-extrabold text-success-soft"><span aria-hidden="true" className="size-1.5 rounded-full bg-success-soft" />Checked in {checkedInAt}</span>
            : <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-xs font-extrabold text-background/70">Not checked in yet</span>)}
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
      {pins.length > 0 && (
        <>
          <div className="h-px bg-white/10" />
          {/* A wrapping row sized by the text itself: tiles share one line whenever their real
              widths fit the card, grow to fill it evenly, and the one that does not fit starts
              the next line and fills that. */}
          <dl className="flex flex-wrap gap-1.5">
            {pins.map((p) => {
              const long = pinScale(p.value) === "small";
              return (
                <div key={p.key} className="flex min-w-20 max-w-full flex-auto flex-col gap-0.5 rounded-md bg-white/10 px-2.5 py-1.5">
                  <dt className="truncate text-[10px] font-bold uppercase tracking-[0.06em] text-background/70">{p.label}</dt>
                  <dd className={long
                    ? "text-sm font-extrabold leading-tight break-words text-primary"
                    : "whitespace-nowrap text-lg font-extrabold leading-tight tabular-nums text-primary"}>{p.value}</dd>
                </div>
              );
            })}
          </dl>
        </>
      )}
    </section>
  );
}
