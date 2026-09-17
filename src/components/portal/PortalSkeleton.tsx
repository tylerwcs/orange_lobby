import { Skeleton } from "@/components/ui/skeletons";

/**
 * The portal's chrome, drawn grey, for the moment before a page has its data.
 *
 * It exists because `PortalShell` is rendered by each page rather than by the layout, so
 * the header and the bottom bar unmount on every navigation and a `loading.tsx` has to put
 * something in their place. Once the shell moves into the layout this component should be
 * deleted rather than maintained: the chrome would persist on its own and a skeleton would
 * only ever need to cover the body.
 *
 * The measurements are copied from PortalShell and PortalHeader on purpose — `size-10` mark,
 * `px-4 py-4` header, `px-4 pt-4 pb-24` main, a bottom bar `max-w-md` wide — so the real
 * content lands where the grey was and nothing jumps.
 */
export function PortalSkeleton({ nav = 3, children }: {
  /** How many bottom-bar slots to draw. Home and Agenda are always there; Info and Me depend on the event. */
  nav?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex min-h-screen flex-col bg-background"
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="bg-card shadow-[0_1px_0_rgba(17,24,39,.08)]">
        <div className="mx-auto w-full max-w-md md:max-w-4xl md:px-6">
          <div className="flex items-center gap-3 px-4 py-4 md:px-0">
            <Skeleton className="size-10 shrink-0 rounded-[10px]" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-4/5 max-w-56" />
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-4 md:max-w-4xl md:px-6 md:pb-10 md:pt-6">
        {children}
      </main>

      {/* Matches the real bar's footprint, including the safe-area padding, so the page does
          not grow by a few pixels when the real one arrives on a notched phone. */}
      <div
        className="fixed bottom-0 left-1/2 flex w-full max-w-md -translate-x-1/2 justify-around bg-card px-2 py-2 shadow-[0_-1px_0_rgba(17,24,39,.08)] md:hidden"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        {Array.from({ length: nav }).map((_, i) => (
          <div key={i} className="flex min-h-11 min-w-16 flex-col items-center justify-center gap-1">
            <Skeleton className="size-[22px] rounded-md" />
            <Skeleton className="h-2.5 w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A card the page draws before it knows what is in it. */
export function SkeletonCard({ className = "" }: { className?: string }) {
  return <Skeleton className={`rounded-xl ${className}`} />;
}
