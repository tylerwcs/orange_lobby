import { Skeleton } from "@/components/ui/skeletons";

/**
 * The booth scanner: the booth's name and count, the camera, then the result panel. The
 * camera keeps its dark ground for the reason the door scanner's skeleton gives - a pale
 * pulsing block where a feed is about to appear reads as a broken camera.
 */
export default function BoothLoading() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 p-3" role="status" aria-busy="true" aria-label="Loading the booth scanner">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-40" />
        </div>
        <Skeleton className="h-7 w-12" />
      </div>
      <div className="flex min-h-[240px] items-center justify-center rounded-xl bg-foreground">
        <span className="text-sm font-semibold text-background/70">Starting camera…</span>
      </div>
      <Skeleton className="min-h-44 rounded-xl" />
      <Skeleton className="h-12 rounded-lg" />
    </main>
  );
}
