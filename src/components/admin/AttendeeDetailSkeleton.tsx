import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Stands in for `AttendeeDetail` while it loads, block for block, so the panel fills in
 * where the real thing will be rather than growing under the reader. The check-in list is
 * the one guess — three rows, because most events run two or three doors.
 */
export function AttendeeDetailSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-label="Loading attendee">
      <div className="space-y-2.5">
        <Skeleton className="h-7 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-5 rounded-[14px] bg-canvas p-4">
        <Skeleton className="h-30 w-30 shrink-0" />
        <div className="min-w-56 flex-1 space-y-2.5">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-11 w-32" />
            <Skeleton className="h-11 w-36" />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <Skeleton className="h-3 w-20" />
        <div className="flex flex-col gap-3.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2.5">
        <Skeleton className="h-3 w-16" />
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      </div>
    </div>
  );
}
