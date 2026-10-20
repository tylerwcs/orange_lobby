import { Skeleton } from "@/components/ui/skeletons";

/** Games: the heading, the game's title, then the one big control a phone plays with. */
export default function PersonalPlayLoading() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-7 w-28" />
      <div className="flex flex-col items-center gap-5">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    </div>
  );
}
