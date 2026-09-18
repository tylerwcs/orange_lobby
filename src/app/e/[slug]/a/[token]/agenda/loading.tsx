import { Skeleton } from "@/components/ui/skeletons";

/** The agenda's body: heading, the day tabs, then the day's sessions. */
export default function PersonalAgendaLoading() {
  // Sessions vary in height because they carry a description or they do not, and a column of
  // identical blocks reads as a table rather than as an agenda.
  const heights = ["h-[132px]", "h-[116px]", "h-[132px]", "h-[76px]", "h-[124px]"];
  return (
    <div className="flex flex-col gap-4" role="status" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-7 w-32" />
      <div className="flex gap-4 border-b border-border pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="flex flex-col gap-3">
        {heights.map((h, i) => <Skeleton key={i} className={`${h} rounded-xl`} />)}
      </div>
    </div>
  );
}
