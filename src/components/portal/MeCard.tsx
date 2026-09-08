import Link from "next/link";
import type { Attendee } from "@/lib/types";
import { Icon } from "@/components/ui/Icon";
import { displayName } from "@/lib/text";

export function MeCard({ attendee, basePath }: { attendee: Attendee; basePath: string }) {
  const seat = attendee.table_no ? `Table ${attendee.table_no}${attendee.seat_no ? ` · Seat ${attendee.seat_no}` : ""}` : null;
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-card)] bg-ink p-4 text-white">
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-extrabold">Hi, {displayName(attendee.name)}</div>
        <div className="truncate text-xs text-gray-300">{[attendee.company, seat ?? "Seat to be confirmed"].filter(Boolean).join(" · ")}</div>
      </div>
      {attendee.table_no && <Link href={`${basePath}/seat`} className="rounded-[8px] bg-brand px-2.5 py-1.5 text-sm font-extrabold text-ink">Table {attendee.table_no}</Link>}
      <Link href={`${basePath}/me`} aria-label="My QR code" className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-white text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><Icon name="qr" size={22} /></Link>
    </div>
  );
}
