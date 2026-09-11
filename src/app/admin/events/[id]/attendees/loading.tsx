import { Skeleton, SkeletonCard, SkeletonRows } from "@/components/ui/Skeleton";

/** The attendee list: header with two actions, search, then a long table. */
export default function AttendeesLoading() {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-label="Loading attendees">
      <div className="flex flex-wrap items-center gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="ml-auto flex gap-3">
          <Skeleton className="h-11 w-36" />
          <Skeleton className="h-11 w-44" />
        </div>
      </div>
      <Skeleton className="h-11 w-full max-w-sm" />
      <SkeletonCard><SkeletonRows rows={12} /></SkeletonCard>
    </div>
  );
}
