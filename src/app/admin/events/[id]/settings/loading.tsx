import { Skeleton, SkeletonCard } from "@/components/ui/skeletons";

/**
 * Settings (D778): the header, the tab bar, then the Event tab it opens on - the Event card of
 * fields with its save bar, and Status beside Share links.
 */
export default function SettingsLoading() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading settings">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-8 w-full max-w-2xl rounded-lg" />
      <SkeletonCard className="space-y-3">
        <Skeleton className="h-4 w-20" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
        </div>
        <Skeleton className="h-20 w-full" />
      </SkeletonCard>
      <Skeleton className="h-9 w-20" />
      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonCard className="space-y-3"><Skeleton className="h-4 w-20" /><Skeleton className="h-11 w-56" /></SkeletonCard>
        <SkeletonCard className="space-y-3"><Skeleton className="h-4 w-28" /><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /></SkeletonCard>
      </div>
    </div>
  );
}
