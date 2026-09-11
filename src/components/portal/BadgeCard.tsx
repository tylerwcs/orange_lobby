import Link from "next/link";
import type { Attendee } from "@/lib/types";
import { Icon } from "@/components/ui/Icon";
import { displayName } from "@/lib/text";

/** The two things an attendee opens the portal for: am I in, and where do I sit. */
export function BadgeCard({ attendee, basePath, checkedInAt, floorPlan }: {
  attendee: Attendee; basePath: string; checkedInAt: string | null; floorPlan: boolean;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-[20px] bg-ink p-4 text-white">
      <div className="flex items-center gap-3.5">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
          {checkedInAt
            ? <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/20 px-2.5 py-1 text-[11px] font-extrabold text-[#6EE7B7]"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#34D399]" />Checked in {checkedInAt}</span>
            : <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-extrabold text-gray-300">Not checked in yet</span>}
          <div className="truncate text-xl font-extrabold">{displayName(attendee.name)}</div>
          {attendee.company && <div className="truncate text-[13px] font-medium text-gray-300">{attendee.company}</div>}
        </div>
        <Link href={`${basePath}/me`} aria-label="My QR code" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] bg-white text-ink">
          <Icon name="qr" size={28} />
        </Link>
      </div>
      {attendee.table_no && (
        <>
          <div className="h-px bg-white/10" />
          <div className="flex items-end gap-5">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-300">Table</div>
              <div className="text-3xl font-extrabold leading-none text-brand tabular-nums">{attendee.table_no}</div>
            </div>
            {floorPlan && (
              <Link href={`${basePath}/plan`} className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-[13px] font-bold">
                <Icon name="map" size={16} />Floor plan
              </Link>
            )}
          </div>
        </>
      )}
    </section>
  );
}
