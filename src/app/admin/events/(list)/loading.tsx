import { Skeleton, SkeletonCard } from "@/components/ui/skeletons";

/** The events list: the header with its New event button, then a grid of event cards. */
export default function EventsListLoading() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-busy="true" aria-label="Loading events">
      <div className="flex flex-wrap items-center gap-4">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="ml-auto h-9 w-28" />
      </div>
      <div className="@container"><div className="grid gap-4 @2xl:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} className="flex flex-col gap-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <div className="mt-2 flex items-center justify-between">
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-3 w-20" />
            </div>
          </SkeletonCard>
        ))}
      </div></div>
    </div>
  );
}
