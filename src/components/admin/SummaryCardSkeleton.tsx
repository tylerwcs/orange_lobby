import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

/** The three figures and the meter — everything that changes with the checkpoint. */
export function SummaryStatsSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Counting" className="space-y-3">
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
      <Skeleton className="h-2.5 w-full" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

/** The whole card, for the page's own loading state. Matches `SummaryCard` block for block. */
export function SummaryCardSkeleton() {
  return (
    <SkeletonCard className="space-y-3">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-11 w-full" />
      <SummaryStatsSkeleton />
    </SkeletonCard>
  );
}
