import { Clock } from "lucide-react";
import { type Activity } from "@/lib/types";

export const block = "-mx-4 border-t-8 border-muted px-4 py-5 md:mx-0 md:px-0";
export const note = "text-sm text-muted-foreground";

/** "For VIP, Management" when only some groups may take part; nothing when everyone may. */
export function forGroups(activity: Pick<Activity, "categories">): string | null {
  return activity.categories?.length ? `For ${activity.categories.join(", ")}` : null;
}

export function InfoRows({ rows }: { rows: { icon: typeof Clock; text: string | null }[] }) {
  const shown = rows.filter((r) => r.text);
  if (shown.length === 0) return null;
  return (
    <div className="-mx-4 flex flex-col border-t border-border px-4 md:mx-0 md:px-0">
      {shown.map(({ icon: Icon, text }) => (
        <div key={text} className="flex items-center gap-3 border-b border-border py-3 text-sm">
          <Icon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
          {text}
        </div>
      ))}
    </div>
  );
}
