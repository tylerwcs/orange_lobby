import { notFound } from "next/navigation";
import { loadPortalAttendee, isUnpublished } from "@/lib/portal";
import { groupTabs, pickGroupTab, GROUP_TAB_LABELS } from "@/lib/groups";
import { PortalTabStrip } from "@/components/portal/PortalTabStrip";
import { PendingScope, PendingSwap, PendingSwipe } from "@/components/PendingNav";
import { Skeleton } from "@/components/ui/skeletons";
import { MyGroup } from "./my-group";
import { AllGroups } from "./all-groups";

export const dynamic = "force-dynamic";

/**
 * D508/D509: the Groups page - My group (D348) and All groups (D511), as tabs in `?tab=`.
 * No tab for this attendee is a 404, the same answer that hides the home tile (D367, D514).
 * With My group alone, the page is exactly today's.
 */
export default async function GroupsPage({ params, searchParams }: {
  params: Promise<{ slug: string; token: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug, token } = await params;
  const { tab } = await searchParams;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  if (isUnpublished(event)) return null;
  const tabs = groupTabs({ tile: event.group_tile, inGroup: !!attendee.group_id, allGroups: event.all_groups });
  const selected = pickGroupTab(tabs, tab);
  if (!selected) notFound();
  const base = `/e/${slug}/a/${token}`;

  if (tabs.length === 1 && selected === "mine") return <MyGroup event={event} attendee={attendee} base={base} titled={false} />;

  const href = (t: string) => `${base}/group?tab=${t}`;
  const at = tabs.indexOf(selected);
  return (
    <>
      <h1 className="mb-3 text-xl font-extrabold">Groups</h1>
      {/* `?tab=` changes no route segment, so no loading.tsx sees it (as on Info, D206). */}
      <PendingScope>
        <div className="flex flex-col gap-4">
          <PortalTabStrip tabs={tabs.map((t) => ({ key: t, href: href(t), label: GROUP_TAB_LABELS[t] }))} selected={selected} />
          <PendingSwipe prevHref={at > 0 ? href(tabs[at - 1]) : null} nextHref={at < tabs.length - 1 ? href(tabs[at + 1]) : null}>
            <PendingSwap fallback={<Skeleton className="h-40 rounded-[14px]" />}>
              {selected === "mine"
                ? <MyGroup event={event} attendee={attendee} base={base} titled />
                : <AllGroups event={event} attendee={attendee} />}
            </PendingSwap>
          </PendingSwipe>
        </div>
      </PendingScope>
    </>
  );
}
