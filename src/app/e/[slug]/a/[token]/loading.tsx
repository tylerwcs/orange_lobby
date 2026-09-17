import { Skeleton } from "@/components/ui/skeletons";
import { PortalSkeleton } from "@/components/portal/PortalSkeleton";

/**
 * The personal home: badge card, breakouts, the announcement banner, what is on next, and
 * the tile grid.
 *
 * This is also the fallback for every personal route that has no skeleton of its own — plan,
 * seat, stamps, info, announcements — because a `loading.tsx` covers its own segment and all
 * of the ones nested under it. Those pages are each a card or two under the same chrome, so a
 * home-shaped body is a fair stand-in; agenda and me override it because they are the two
 * reached from the bottom bar, where a wrong shape is most obvious.
 */
export default function PersonalPortalLoading() {
  return (
    <PortalSkeleton>
      <div className="flex flex-col gap-3.5">
        {/* Badge card: the dark block with the name, table and QR. */}
        <Skeleton className="h-[188px] rounded-[20px]" />
        {/* Breakouts, then the announcement banner, then "next". */}
        <Skeleton className="h-[104px] rounded-xl" />
        <Skeleton className="h-[72px] rounded-xl" />
        <Skeleton className="h-[92px] rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[124px] rounded-xl" />)}
        </div>
      </div>
    </PortalSkeleton>
  );
}
