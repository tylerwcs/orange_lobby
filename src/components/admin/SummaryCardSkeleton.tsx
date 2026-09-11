import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

/**
 * Matches `SummaryCard` block for block — heading, picker, scope caption, three rows and
 * the meter — so switching checkpoint does not resize the column under the reader.
 */
export function SummaryCardSkeleton() {
  return (
    <SkeletonCard className="space-y-3" >
      <div role="status" aria-busy="true" aria-label="Loading the summary" className="space-y-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-3 w-40" />
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
        <Skeleton className="h-2.5 w-full" />
        <Skeleton className="h-3 w-32" />
      </div>
    </SkeletonCard>
  );
}
