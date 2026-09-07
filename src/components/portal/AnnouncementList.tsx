import type { Announcement } from "@/lib/types";
import { MY_TZ } from "@/lib/time";

export function AnnouncementList({ items }: { items: Announcement[] }) {
  if (items.length === 0) return <p className="text-gray-500">No announcements yet.</p>;
  return (
    <ul className="space-y-3">
      {items.map((a) => (
        <li key={a.id} className={`rounded-lg border p-3 ${a.pinned ? "border-[var(--brand)]" : ""}`}>
          <div className="text-xs text-gray-500">{new Date(a.created_at).toLocaleString("en-MY", { timeZone: MY_TZ })}</div>
          <div className="font-medium">{a.title}</div>
          <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{a.body}</p>
        </li>
      ))}
    </ul>
  );
}
