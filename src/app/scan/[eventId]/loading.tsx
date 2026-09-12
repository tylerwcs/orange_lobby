import { Skeleton } from "@/components/ui/skeletons";

/**
 * The scanner. The camera area keeps its dark ground rather than a shimmer: it is
 * about to hold a camera feed, and a pale pulsing block there reads as a broken one.
 * The result panel is reserved at its real height for the same reason it is in the
 * scanner itself — nothing below it should move once the page settles.
 */
export default function ScanLoading() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 p-3" role="status" aria-busy="true" aria-label="Loading the scanner">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-7 w-24" />
        </div>
        <Skeleton className="h-1 w-full rounded-full" />
      </div>
      <div className="flex min-h-[240px] items-center justify-center rounded-xl bg-foreground">
        <span className="text-sm font-semibold text-background/70">Starting camera…</span>
      </div>
      <Skeleton className="min-h-44 rounded-xl" />
      <Skeleton className="h-12 rounded-lg" />
    </main>
  );
}
