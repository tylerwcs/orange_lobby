import Link from "next/link";
import type { ActivityTab, TabItem } from "@/lib/activity-tabs";

/**
 * Links, not a client Tabs widget: the tab lives in the URL, so reload, Back and a shared link
 * all land on it (D234). One tab shows no strip. The strip's classes are the shadcn TabsList
 * default written out, because `tabs.tsx` is a client module and its variant helper cannot be
 * called from a server component.
 */
export function ActivityTabs({ tabs, current, href }: { tabs: TabItem[]; current: ActivityTab; href: (tab: ActivityTab) => string }) {
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Activity sections" className="inline-flex h-9 w-fit max-w-full items-center overflow-x-auto rounded-lg bg-muted p-[3px] text-muted-foreground">
      {tabs.map((t) => {
        const on = t.tab === current;
        return (
          <Link
            key={t.tab}
            href={href(t.tab)}
            aria-current={on ? "page" : undefined}
            className={`relative inline-flex h-full items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors ${on ? "bg-background text-foreground shadow-sm" : "text-foreground/60 hover:text-foreground"}`}
          >
            {t.label}
            {t.count !== null && <span className="text-xs tabular-nums text-muted-foreground">{t.count}</span>}
            {t.dot && <span className="size-1.5 rounded-full bg-primary" aria-label="needs attention" />}
          </Link>
        );
      })}
    </nav>
  );
}
