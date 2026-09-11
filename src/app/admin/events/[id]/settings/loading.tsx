import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

/** Settings: the two click-to-apply cards, checkpoints, then the long configuration form. */
export default function SettingsLoading() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading settings">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonCard className="space-y-3"><Skeleton className="h-4 w-20" /><Skeleton className="h-11 w-56" /></SkeletonCard>
        <SkeletonCard className="space-y-3"><Skeleton className="h-4 w-28" /><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /></SkeletonCard>
      </div>
      <SkeletonCard className="space-y-3">
        <Skeleton className="h-4 w-28" />
        {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </SkeletonCard>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }).map((__, j) => <Skeleton key={j} className="h-11 w-full" />)}
            </div>
          </SkeletonCard>
        ))}
      </div>
    </div>
  );
}
