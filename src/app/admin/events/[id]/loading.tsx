import { Skeleton, SkeletonCard, SkeletonRows } from "@/components/ui/Skeleton";

/**
 * The Overview's shape: scans on the left, summary and arrivals stacked on the right.
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
          <SkeletonCard className="space-y-3">
            <Skeleton className="h-4 w-24" />
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            <Skeleton className="h-2.5 w-full" />
          </SkeletonCard>
          <SkeletonCard className="space-y-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-2.5 w-full" />
          </SkeletonCard>
        </div>
      </div>
    </div>
  );
}
