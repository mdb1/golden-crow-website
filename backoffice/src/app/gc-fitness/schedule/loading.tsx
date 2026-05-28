// /gc-fitness/schedule/loading.tsx
//
// Skeleton for the unified month calendar surface while the server fetches.

import { Skeleton } from "@/components/ui/skeleton";

export default function ScheduleLoading() {
  return (
    <div className="gc-page flex flex-col gap-5">
      <div className="rounded-xl border bg-card p-4">
        <Skeleton className="mb-3 h-4 w-40" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 8 }).map((_, idx) => (
            <Skeleton key={idx} className="h-7 w-28 rounded-full" />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-16" />
      </div>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 42 }).map((_, idx) => (
          <Skeleton key={idx} className="h-28 w-full" />
        ))}
      </div>
    </div>
  );
}
