import { Skeleton } from "@/components/ui/skeletons";

/**
 * The scanner. The camera area keeps its dark ground rather than a shimmer: it is
 * about to hold a camera feed, and a pale pulsing block there reads as a broken one.
 * The result panel is reserved at its real height for the same reason it is in the
 * scanner itself — nothing below it should move once the page settles.
 */
export default function ScanLoading() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-3 p-3 lg:max-w-5xl lg:gap-4 lg:p-6" role="status" aria-busy="true" aria-label="Loading the scanner">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-7 w-24" />
        </div>
        <Skeleton className="h-1 w-full rounded-full" />
      </div>
      {/* Same split as the scanner itself, so the page doesn't jump from a centred strip
          to two columns the moment this skeleton is replaced. */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-5">
        <div className="flex min-h-[240px] items-center justify-center rounded-xl bg-foreground lg:min-h-[460px]">
          <span className="text-sm font-semibold text-background/70">Starting camera…</span>
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="min-h-44 rounded-xl" />
          <Skeleton className="h-12 rounded-lg" />
        </div>
      </div>
    </main>
  );
}
