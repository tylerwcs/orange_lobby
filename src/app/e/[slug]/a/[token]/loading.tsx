import { Skeleton } from "@/components/ui/skeletons";

/**
 * The personal home's body. The header and the bottom bar are the layout's now and stay on
 * screen, so this covers only what is being replaced.
 *
 * Also the fallback for every personal route without one of its own — plan, seat, stamps,
 * info, announcements — because a `loading.tsx` covers its own segment and all of the ones
 * nested under it.
 */
export default function PersonalPortalLoading() {
  return (
    <div className="flex flex-col gap-3.5" role="status" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-[188px] rounded-[20px]" />
      <Skeleton className="h-[104px] rounded-xl" />
      <Skeleton className="h-[72px] rounded-xl" />
      <Skeleton className="h-[92px] rounded-xl" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[124px] rounded-xl" />)}
      </div>
    </div>
  );
}
