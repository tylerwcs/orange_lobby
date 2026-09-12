import Link from "next/link";
import type { Announcement } from "@/lib/types";
import { Icon } from "@/components/ui/icon";
import { shortDateTime } from "@/lib/text";

export function AnnouncementBanner({ a, href }: { a: Announcement; href: string }) {
  const when = shortDateTime(a.created_at);
  return (
    <Link href={href} className="flex items-center gap-3 rounded-[12px] bg-accent px-3.5 py-3">
      <Icon name="megaphone" size={20} className="shrink-0 text-primary" />
      <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-primary">{a.title}</div><div className="text-xs text-primary">{when}</div></div>
      <Icon name="chevron" size={18} className="text-primary" />
    </Link>
  );
}
