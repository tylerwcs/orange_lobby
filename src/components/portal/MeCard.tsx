import Link from "next/link";
import type { Attendee } from "@/lib/types";
import { Icon } from "@/components/ui/Icon";

export function MeCard({ attendee, basePath }: { attendee: Attendee; basePath: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-card)] bg-ink p-4 text-white">
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-extrabold">Hi {attendee.name.split(" ")[0]}</div>
        {attendee.company && <div className="truncate text-xs text-gray-400">{attendee.company}</div>}
      </div>
      {attendee.table_no && <span className="rounded-[8px] bg-brand px-2.5 py-1.5 text-sm font-extrabold text-ink">Table {attendee.table_no}</span>}
      <Link href={`${basePath}/me`} aria-label="My QR code" className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-white text-ink"><Icon name="qr" size={22} /></Link>
    </div>
  );
}
