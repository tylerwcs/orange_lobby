import type { Announcement } from "@/lib/types";
import { shortDateTime } from "@/lib/text";
import { Badge } from "@/components/ui/Badge";

export function AnnouncementList({ items }: { items: Announcement[] }) {
  if (items.length === 0) return <p className="text-sm text-muted">No announcements yet.</p>;
  return (
    <div className="flex flex-col gap-3">
      {items.map((a) => (
        <div key={a.id} className={`rounded-[14px] border bg-surface p-3.5 ${a.pinned ? "border-brand" : "border-line"}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-muted">{shortDateTime(a.created_at)}</div>
            {a.pinned && <Badge tone="brand">Pinned</Badge>}
          </div>
          <div className="mt-1 text-[15px] font-bold">{a.title}</div>
          <p className="mt-1 whitespace-pre-line text-sm text-muted">{a.body}</p>
        </div>
      ))}
    </div>
  );
}
