import { PendingLink } from "@/components/PendingNav";

export type StripTab = { key: string; href: string; label: string; sub?: string | null };

/**
 * The portal's tab strip - the agenda's days (D199) and the Info page's tabs (D206) - so the
 * two read as one kind of control. Scrolls sideways rather than wrapping: named tabs do not
 * fit three abreast on a phone, and a wrapped strip reads as two rows of tabs. Must sit inside
 * a PendingScope, which moves the underline at once while the next tab loads.
 */
export function PortalTabStrip({ tabs, selected }: { tabs: StripTab[]; selected: string }) {
  if (tabs.length < 2) return null;
  return (
    <div className="overflow-x-auto">
      <div className="flex w-max min-w-full gap-5 border-b border-border">
        {tabs.map((t) => (
          <PendingLink
            key={t.key}
            href={t.href}
            selected={t.key === selected}
            className="-mb-px shrink-0 border-b-[3px] pb-2 text-left text-[13px]"
            selectedClassName="border-primary font-extrabold text-primary"
            unselectedClassName="border-transparent font-semibold text-muted-foreground"
          >
            <span className="block whitespace-nowrap">{t.label}</span>
            {t.sub && <span className="block text-[11px] font-semibold text-muted-foreground">{t.sub}</span>}
          </PendingLink>
        ))}
      </div>
    </div>
  );
}
