import Link from "next/link";
import type { Attendee } from "@/lib/types";
import { pinScale, type ResolvedPin } from "@/lib/pinned-fields";
import { Icon } from "@/components/ui/icon";
import { displayName } from "@/lib/text";

/**
 * Am I in, who am I, and the handful of facts this event decided matter.
 *
 * The bottom row used to be the table number and nothing else. It is now whatever the
 * event pinned, in the event's order: the first fact takes the large treatment the table
 * number had, unless it is too long to hold it. The pins arrive already resolved, so a
 * fact this attendee has no value for never reaches the card - and when nothing survives
 * and there is no floor plan, the row and its rule disappear rather than sitting empty.
 *
 * Company used to print under the name unconditionally. It is a pin now like anything else:
 * an event whose badges should carry it pins it in Settings, and `pinnableFields` offers it
 * the moment the event defines the column.
 */
export function BadgeCard({ attendee, basePath, checkedInAt, floorPlan, pins }: {
  attendee: Attendee; basePath: string; checkedInAt: string | null; floorPlan: boolean; pins: ResolvedPin[];
}) {
  return (
    <section className="@container flex flex-col gap-3 rounded-xl bg-foreground p-4 text-background">
      <div className="flex items-center gap-3.5">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
          {checkedInAt
            ? <span className="inline-flex items-center gap-1.5 rounded-full bg-success/25 px-2.5 py-1 text-xs font-extrabold text-success-soft"><span aria-hidden="true" className="size-1.5 rounded-full bg-success-soft" />Checked in {checkedInAt}</span>
            : <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-xs font-extrabold text-background/70">Not checked in yet</span>}
          <div className="text-lg font-extrabold leading-tight text-balance @2xs:text-xl">{displayName(attendee.name)}</div>
        </div>
        <Link href={`${basePath}/me`} aria-label="My QR code" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-background text-foreground">
          <Icon name="qr" size={28} />
        </Link>
      </div>
      {(pins.length > 0 || floorPlan) && (
        <>
          <div className="h-px bg-white/10" />
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
            {pins.map((p, i) => {
              // Only the first pin can be large, and only if it is short enough to stay on
              // one line - the slot was built for a table number, not for a full name.
              const large = i === 0 && pinScale(p.value) === "large";
              return (
                <div key={p.key} className="min-w-0">
                  <div className="text-xs font-bold uppercase tracking-[0.06em] text-background/70">{p.label}</div>
                  <div className={large
                    ? "text-3xl font-extrabold leading-none tabular-nums text-primary"
                    : "text-base font-extrabold leading-tight break-words text-background"}>{p.value}</div>
                </div>
              );
            })}
            {floorPlan && (
              <Link href={`${basePath}/plan`} className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-xs font-bold">
                <Icon name="map" size={16} />Floor plan
              </Link>
            )}
          </div>
        </>
      )}
    </section>
  );
}
