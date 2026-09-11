import { Skeleton } from "@/components/ui/Skeleton";

/** The attendee portal: header, badge card, now card, tile grid — reserved so nothing jumps. */
export default function PortalLoading() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-canvas" role="status" aria-busy="true" aria-label="Loading">
      <div className="flex items-center gap-3 bg-surface px-4 py-4 shadow-[var(--shadow-bar)]">
        <Skeleton className="h-10 w-10 rounded-[12px]" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="flex flex-col gap-3.5 px-4 pt-4">
        <Skeleton className="h-[132px] rounded-[20px]" />
        <Skeleton className="h-[86px] rounded-[var(--radius-card)]" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[108px] rounded-[var(--radius-card)]" />)}
        </div>
      </div>
    </div>
  );
}
