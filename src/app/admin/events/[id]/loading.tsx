import { Skeleton, SkeletonCard, SkeletonRows } from "@/components/ui/Skeleton";
import { SummaryCardSkeleton } from "@/components/admin/SummaryCardSkeleton";

/**
 * The Overview's shape: scans on the left, the summary on the right.
 * Reserving the real layout means the page does not reflow when the data lands.
 * Nested admin routes with a different shape carry their own `loading.tsx`.
 */
export default function AdminEventLoading() {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-label="Loading the overview">
      <div className="flex flex-wrap items-center gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="ml-auto h-11 w-36" />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <SkeletonCard><SkeletonRows rows={8} /></SkeletonCard>
        <SummaryCardSkeleton />
      </div>
    </div>
  );
}
