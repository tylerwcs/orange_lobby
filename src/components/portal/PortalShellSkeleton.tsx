import { Skeleton } from "@/components/ui/skeletons";

/**
 * The portal's whole shell as a skeleton: header and body.
 *
 * Its geometry must match `PortalChrome`'s real shell — same `max-w-md md:max-w-4xl` widths,
 * same padding — or the first flush is a narrower, chrome-less block that then
 * jumps to the real header. Read `PortalChrome.tsx` before changing the classes
 * below; they are copied from there, not invented.
 *
 * Shared, not copied, because two routes wait on the same shell: `/e/<slug>` and its personal
 * routes below it, and the `/a/<token>` short link that resolves an event and redirects into
 * them. Two copies of this geometry would drift from PortalChrome one edit at a time.
 */
export function PortalShellSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-background" role="status" aria-busy="true" aria-label="Loading">
      <div className="bg-card shadow-[0_1px_0_rgba(17,24,39,.08)]">
        <div className="mx-auto w-full max-w-md md:max-w-4xl md:px-6">
          <div className="flex items-center gap-3 px-4 py-4">
            <Skeleton className="h-10 w-10 rounded-[12px]" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md flex-1 px-4 pb-10 pt-4 md:max-w-4xl md:px-6 md:pt-6">
        <div className="flex flex-col gap-3.5">
          <Skeleton className="h-[132px] rounded-[20px]" />
          <Skeleton className="h-[86px] rounded-xl" />
          <LauncherSkeleton />
        </div>
      </div>
    </div>
  );
}

/** The launcher's row of round buttons (see `LauncherGrid`), for the loading states. */
export function LauncherSkeleton() {
  return (
    <div className="-mx-4 flex overflow-hidden px-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex w-20 shrink-0 flex-col items-center gap-1.5 py-1">
          <Skeleton className="size-14 rounded-full" />
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  );
}
