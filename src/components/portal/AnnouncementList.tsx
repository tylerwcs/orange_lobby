import type { Announcement } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { t } from "@/features/language/client";
import type { Lang } from "@/features/language/client";

/** Rendered on the server and inside the banner's dialog alike, so the language comes in as a prop (D739). */
export function AnnouncementList({ items, lang = "en" }: { items: Announcement[]; lang?: Lang }) {
  const d = t(lang);
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{d.announcements.none}</p>;
  return (
    <div className="flex flex-col gap-3">
      {items.map((a) => (
        <div key={a.id} className={`rounded-[14px] border bg-card p-3.5 ${a.pinned ? "border-primary" : "border-border"}`}>
          {/* No date or time (D249): the organiser's order says what matters now, and a
              timestamp on a notice written days ahead only read as stale. */}
          <div className="flex items-start justify-between gap-2">
            <div className="text-[15px] font-bold">{a.title}</div>
            {a.pinned && <Badge className="shrink-0">{d.announcements.pinned}</Badge>}
          </div>
          <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{a.body}</p>
        </div>
      ))}
    </div>
  );
}
