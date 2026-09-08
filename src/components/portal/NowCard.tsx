import Link from "next/link";
import type { AgendaItem } from "@/lib/types";
import { Icon } from "@/components/ui/Icon";
import { shortDate } from "@/lib/text";

/** The one thing an attendee wants at a glance: what is on now, or what comes next. */
export function NowCard({ next, href, today }: { next: { item: AgendaItem; status: "now" | "next" } | null; href: string; today: string }) {
  if (!next) return null;
  const { item, status } = next;
  const when = item.day === today ? item.starts_at : `${shortDate(item.day)}, ${item.starts_at}`;
  return (
    <Link href={`${href}?day=${item.day}${status === "now" ? "#now" : ""}`} className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 active:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-ink">
          {status === "now" && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-brand" />}
          {status === "now" ? "Happening now" : `Next · ${when}`}
        </div>
        <div className="mt-0.5 text-[17px] font-extrabold leading-tight">{item.title}</div>
        <div className="text-xs text-muted">{[status === "now" ? `until ${item.ends_at ?? "later"}` : null, item.location].filter(Boolean).join(" · ")}</div>
      </div>
      <Icon name="chevron" size={18} className="shrink-0 text-muted" />
    </Link>
  );
}
