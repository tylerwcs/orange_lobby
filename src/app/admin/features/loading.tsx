import { Skeleton, SkeletonCard } from "@/components/ui/skeletons";

/** The Features page: the header, the two tabs, then a stack of feature cards. */
export default function FeaturesLoading() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-busy="true" aria-label="Loading features">
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-8 w-56" />
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} className="flex flex-col gap-2">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </SkeletonCard>
        ))}
      </div>
    </div>
  );
}
