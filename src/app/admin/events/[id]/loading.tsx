import { Skeleton, SkeletonCard, SkeletonRows } from "@/components/ui/Skeleton";
import { SummaryCardSkeleton } from "@/components/admin/SummaryCardSkeleton";

/**
 * The Overview's shape: scans on the left, summary and checkpoint progress stacked on
 * the right.
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
        <div className="flex flex-col gap-6">
          <SummaryCardSkeleton />
          <SkeletonCard className="space-y-3">
            <Skeleton className="h-4 w-20" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-1.5"><Skeleton className="h-3 w-32" /><Skeleton className="h-2.5 w-full" /></div>
            ))}
          </SkeletonCard>
        </div>
      </div>
    </div>
  );
}
