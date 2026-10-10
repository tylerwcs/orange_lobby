import { Skeleton } from "@/components/ui/skeletons";

/** The setup checklist's shape: the event header, a line of help, the section rows, and the phone preview beside them. */
export default function SetupLoading() {
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-8 p-4 md:p-8 lg:grid-cols-[minmax(0,1fr)_260px]" role="status" aria-busy="true" aria-label="Loading your event setup">
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-[10px]" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-border">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-none" />)}
        </div>
      </div>
      <Skeleton className="hidden h-[480px] w-[240px] rounded-[2.25rem] lg:block" />
    </main>
  );
}
