import type { Event } from "@/lib/types";
import { sanitizeHtml } from "@/lib/sanitize";
import type { PortalInfoTab } from "@/lib/info-tabs";
import { Skeleton } from "@/components/ui/skeletons";
import { PendingScope, PendingSwap, PendingSwipe } from "@/components/PendingNav";
import { PortalTabStrip } from "./PortalTabStrip";

/**
 * The Info page, for both portals (D206): the section's heading, the tab strip, and the
 * chosen tab.
 */
export function InfoPage({ event, tabs, selected, basePath }: {
  event: Pick<Event, "info_page_title">;
  tabs: PortalInfoTab[];
  selected: PortalInfoTab | null;
  basePath: string;
}) {
  const href = (key: string) => `${basePath}/info?tab=${key}`;
  // The tabs either side, for a swipe across the content (D234).
  const at = selected ? tabs.findIndex((t) => t.key === selected.key) : -1;
  const prevHref = at > 0 ? href(tabs[at - 1].key) : null;
  const nextHref = at >= 0 && at < tabs.length - 1 ? href(tabs[at + 1].key) : null;
  return (
    <>
      <h1 className="mb-3 text-xl font-extrabold">{event.info_page_title}</h1>
      {!selected ? (
        <p className="text-sm text-muted-foreground">More information will be published soon.</p>
      ) : (
        // `?tab=` changes no route segment, so no loading.tsx sees it; the scope moves the
        // underline at once and swaps the content for a skeleton until the tab arrives.
        <PendingScope>
          <div className="flex flex-col gap-4">
            <PortalTabStrip
              tabs={tabs.map((t) => ({ key: t.key, href: href(t.key), label: t.title }))}
              selected={selected.key}
            />
            <PendingSwipe prevHref={prevHref} nextHref={nextHref}>
              <PendingSwap fallback={<Skeleton className="h-40 rounded-[14px]" />}>
                <div className="rich-text prose prose-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(selected.html) }} />
              </PendingSwap>
            </PendingSwipe>
          </div>
        </PendingScope>
      )}
    </>
  );
}
