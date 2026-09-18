import { Skeleton } from "@/components/ui/skeletons";

/**
 * The attendee portal: header, badge card, now card, tile grid — reserved so nothing jumps.
 *
 * This is an ancestor boundary of the personal routes too (`a/[token]/layout.tsx` is async), so
 * its geometry must match `PortalChrome`'s real shell — same `max-w-md md:max-w-4xl` widths, same
 * bottom-bar footprint — or the first flush is a narrower, chrome-less block that then jumps to
 * the real header and bar. Read `PortalChrome.tsx` before changing the classes below; they are
 * copied from there, not invented.
 */
export default function PortalLoading() {
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

      <div className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-4 md:max-w-4xl md:px-6 md:pb-10 md:pt-6">
        <div className="flex flex-col gap-3.5">
          <Skeleton className="h-[132px] rounded-[20px]" />
          <Skeleton className="h-[86px] rounded-xl" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[108px] rounded-xl" />)}
          </div>
        </div>
      </div>

      {/* Matches PortalChrome's mobile bottom bar footprint so the handoff at ~0.40s does not shift layout. */}
      <div
        className="fixed bottom-0 left-1/2 flex w-full max-w-md -translate-x-1/2 justify-around bg-card px-2 py-2 shadow-[0_-1px_0_rgba(17,24,39,.08)] md:hidden"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex min-h-11 min-w-16 flex-col items-center justify-center gap-0.5">
            <Skeleton className="h-[22px] w-[22px] rounded-full" />
            <Skeleton className="h-2 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}
