import { Skeleton } from "@/components/ui/skeletons";

/** Me: the identity card with its badge button, the contact block, then the answers list. */
export default function PersonalMeLoading() {
  return (
    <div
      className="flex flex-col gap-3.5 md:mx-auto md:max-w-2xl md:gap-5"
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6">
        <Skeleton className="size-16 rounded-full" />
        <Skeleton className="h-6 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <Skeleton className="mt-1 h-11 w-full rounded-lg sm:w-64" />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-4 w-full" />
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
        <Skeleton className="h-3 w-36" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-6">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
