// /gc-fitness/schedule/loading.tsx — Plan 20-01.
//
// Skeleton for the schedule client-picker / week-grid while the server fetches.

import { Skeleton } from "@/components/ui/skeleton";

export default function ScheduleLoading() {
  return (
    <div className="gc-page flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid gap-2 rounded-md border bg-card p-4 md:grid-cols-7">
        {Array.from({ length: 7 }).map((_, idx) => (
          <Skeleton key={idx} className="h-36 w-full" />
        ))}
      </div>
    </div>
  );
}
