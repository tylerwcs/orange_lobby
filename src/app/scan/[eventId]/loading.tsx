import { Skeleton } from "@/components/ui/Skeleton";

/**
 * The scanner. The camera area keeps its dark ground rather than a shimmer: it is
 * about to hold a camera feed, and a pale pulsing block there reads as a broken one.
 */
export default function ScanLoading() {
  return (
    <main className="mx-auto max-w-md p-3" role="status" aria-busy="true" aria-label="Loading the scanner">
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-8 w-28 rounded-full" />
      </div>
      <div className="flex min-h-[240px] items-center justify-center rounded-[var(--radius-card)] bg-ink">
        <span className="text-sm font-semibold text-gray-300">Starting camera…</span>
      </div>
      <Skeleton className="mt-3 h-16 rounded-[var(--radius-card)]" />
      <Skeleton className="mt-3 h-12 rounded-[var(--radius-control)]" />
    </main>
  );
}
