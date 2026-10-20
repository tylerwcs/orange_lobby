import { Skeleton } from "@/components/ui/skeletons";
import { LauncherSkeleton } from "@/components/portal/PortalShellSkeleton";

/**
 * The personal home's body: badge, announcement, launcher, activity cards (D215). The header
 * is the layout's and stays on screen, so this covers only what is being replaced.
 *
 * Also the fallback for every personal route without one of its own — plan, seat, stamps,
 * info, announcements — because a `loading.tsx` covers its own segment and all of the ones
 * nested under it.
 */
export default function PersonalPortalLoading() {
  return (
    <div className="flex flex-col gap-3.5" role="status" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-[132px] rounded-xl" />
      <Skeleton className="h-[60px] rounded-xl" />
      <LauncherSkeleton />
      <Skeleton className="h-[220px] rounded-2xl" />
    </div>
  );
}
