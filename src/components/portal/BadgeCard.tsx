import Link from "next/link";
import type { Attendee } from "@/lib/types";
import { Icon } from "@/components/ui/icon";
import { displayName } from "@/lib/text";

/** The two things an attendee opens the portal for: am I in, and where do I sit. */
export function BadgeCard({ attendee, basePath, checkedInAt, floorPlan }: {
  attendee: Attendee; basePath: string; checkedInAt: string | null; floorPlan: boolean;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl bg-foreground p-4 text-background">
      <div className="flex items-center gap-3.5">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
          {checkedInAt
            ? <span className="inline-flex items-center gap-1.5 rounded-full bg-success/25 px-2.5 py-1 text-xs font-extrabold text-success-soft"><span aria-hidden="true" className="size-1.5 rounded-full bg-success-soft" />Checked in {checkedInAt}</span>
            : <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-xs font-extrabold text-background/70">Not checked in yet</span>}
          <div className="truncate text-xl font-extrabold">{displayName(attendee.name)}</div>
          {attendee.company && <div className="truncate text-xs font-medium text-background/70">{attendee.company}</div>}
        </div>
        <Link href={`${basePath}/me`} aria-label="My QR code" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-background text-foreground">
          <Icon name="qr" size={28} />
        </Link>
      </div>
      {attendee.table_no && (
        <>
          <div className="h-px bg-white/10" />
          <div className="flex items-end gap-5">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.06em] text-background/70">Table</div>
              <div className="text-3xl font-extrabold leading-none tabular-nums text-primary">{attendee.table_no}</div>
            </div>
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
