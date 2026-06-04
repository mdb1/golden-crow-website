// /gc-fitness/exercises/loading.tsx — Plan 20-01.
//
// Skeleton for the exercises library while the server fetches.

import { Skeleton } from "@/components/ui/skeleton";

export default function ExercisesLoading() {
  return (
    <div className="gc-page flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-10 w-64 rounded-full" />
        <Skeleton className="h-10 w-40 rounded-full" />
        <Skeleton className="h-10 w-40 rounded-full" />
        <Skeleton className="h-10 w-40 rounded-full" />
      </div>
      <div className="flex flex-col gap-2 rounded-[1.25rem] border bg-card p-4 shadow-sm">
        {Array.from({ length: 6 }).map((_, idx) => (
          <Skeleton key={idx} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
