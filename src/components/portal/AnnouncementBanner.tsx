import Link from "next/link";
import type { Announcement } from "@/lib/types";
import { Icon } from "@/components/ui/Icon";
import { MY_TZ } from "@/lib/time";

export function AnnouncementBanner({ a, href }: { a: Announcement; href: string }) {
  const when = new Date(a.created_at).toLocaleString("en-MY", { timeZone: MY_TZ, hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
  return (
    <Link href={href} className="flex items-center gap-3 rounded-[12px] border border-[#FED7AA] bg-brand-soft px-3.5 py-3">
      <Icon name="megaphone" size={20} className="shrink-0 text-brand-ink" />
      <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-[#7C2D12]">{a.title}</div><div className="text-xs text-[#9A3412]">{when}</div></div>
      <Icon name="chevron" size={18} className="text-brand-ink" />
    </Link>
  );
}
