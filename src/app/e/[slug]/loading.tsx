import { Skeleton } from "@/components/ui/skeletons";

/** The attendee portal: header, badge card, now card, tile grid — reserved so nothing jumps. */
export default function PortalLoading() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background" role="status" aria-busy="true" aria-label="Loading">
      <div className="flex items-center gap-3 bg-card px-4 py-4 shadow-[0_-1px_0_rgba(17,24,39,.08)]">
        <Skeleton className="h-10 w-10 rounded-[12px]" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="flex flex-col gap-3.5 px-4 pt-4">
        <Skeleton className="h-[132px] rounded-[20px]" />
        <Skeleton className="h-[86px] rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[108px] rounded-xl" />)}
        </div>
      </div>
    </div>
  );
}
