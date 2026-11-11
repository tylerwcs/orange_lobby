import type { Event } from "@/lib/types";
import { sanitizeHtml } from "@/lib/sanitize";
import type { PortalInfoTab } from "@/lib/info-tabs";
import { Skeleton } from "@/components/ui/skeletons";
import { PendingLink, PendingScope, PendingSwap, PendingSwipe } from "@/components/PendingNav";
import { PortalTabStrip } from "./PortalTabStrip";
import { TITLE_INK } from "@/lib/ink";
import { portalLang, t } from "@/features/language";

/**
 * The Info page, for both portals (D206): the section's heading, the tab strip, and the
 * chosen tab.
 */
export async function InfoPage({ event, tabs, selected, basePath }: {
  event: Pick<Event, "info_page_title" | "language_switch">;
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
      <h1 className={`mb-3 text-xl font-extrabold ${TITLE_INK}`}>{event.info_page_title}</h1>
      {!selected ? (
        <p className="text-sm text-muted-foreground">{t(await portalLang(event)).info.soon}</p>
      ) : (
        // `?tab=` changes no route segment, so no loading.tsx sees it; the scope moves the
        // underline at once and swaps the content for a skeleton until the tab arrives.
        // D841: on a phone the tabs are a strip above the text; from md they are a list down the
        // left, so the text keeps a reading measure and the column it sits in is used, rather
        // than a 65ch block hugging the left of a strip that runs the full width.
        <PendingScope>
          <div className={`flex flex-col gap-4 ${tabs.length > 1 ? "md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:items-start md:gap-10" : ""}`}>
            <div className="md:hidden">
              <PortalTabStrip
                tabs={tabs.map((t) => ({ key: t.key, href: href(t.key), label: t.title }))}
                selected={selected.key}
              />
            </div>
            {tabs.length > 1 && (
              <nav aria-label={event.info_page_title} className="hidden md:sticky md:top-6 md:flex md:flex-col md:gap-0.5">
                {tabs.map((t) => (
                  <PendingLink
                    key={t.key}
                    href={href(t.key)}
                    selected={t.key === selected.key}
                    className="flex min-h-10 items-center rounded-md px-3 py-2 text-left text-sm leading-snug transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    selectedClassName="bg-accent font-bold text-primary"
                    unselectedClassName="font-semibold text-muted-foreground hover:bg-accent"
                  >
                    {t.title}
                  </PendingLink>
                ))}
              </nav>
            )}
            <PendingSwipe prevHref={prevHref} nextHref={nextHref}>
              <PendingSwap fallback={<Skeleton className="h-40 rounded-[14px]" />}>
                {/* D890: the column is the limit, not prose's 65ch, so images and tables fill it;
                    running text alone keeps a reading measure. */}
                <div className="rich-text prose prose-sm max-w-none md:prose-base md:[&>:is(p,ul,ol,h1,h2,h3,h4,blockquote)]:max-w-[68ch]" dangerouslySetInnerHTML={{ __html: sanitizeHtml(selected.html) }} />
              </PendingSwap>
            </PendingSwipe>
          </div>
        </PendingScope>
      )}
    </>
  );
}
