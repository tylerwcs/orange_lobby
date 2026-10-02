import { PendingLink } from "@/components/PendingNav";
import type { TrackerTab } from "@/lib/tracker";

const TABS: { key: TrackerTab; label: string; query: string }[] = [
  { key: "info", label: "Info", query: "?tab=info" },
  { key: "stats", label: "My stats", query: "" },
  { key: "leaderboard", label: "Leaderboard", query: "?tab=leaderboard" },
];

/**
 * D385: a scored challenge's three tabs. The portal tab strip's look (PortalTabStrip: underline in
 * the primary colour, bold when chosen) but three equal columns across the page, since three
 * short names always fit on a phone, and 44 px tall to tap. Links, not state: a tab is a URL, so
 * Back works and the server draws it; switching drops `?day=`, and My stats has no param, so the
 * bare page a submit redirects to is My stats. Must sit inside a PendingScope.
 */
export function TrackerTabs({ path, tab }: { path: string; tab: TrackerTab }) {
  return (
    <nav aria-label="Challenge" className="-mx-4 grid grid-cols-3 border-b border-border px-4 md:mx-0 md:px-0">
      {TABS.map((t) => (
        <PendingLink
          key={t.key}
          href={`${path}${t.query}`}
          selected={t.key === tab}
          className="-mb-px flex min-h-11 items-center justify-center border-b-[3px] px-1 text-center text-sm"
          selectedClassName="border-primary font-extrabold text-primary"
          unselectedClassName="border-transparent font-semibold text-muted-foreground"
        >
          {t.label}
        </PendingLink>
      ))}
    </nav>
  );
}
