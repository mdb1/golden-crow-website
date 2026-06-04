// /gc-fitness/habits/loading.tsx — Plan 20-01.
//
// Skeleton for the habits library + assigner while the server fetches.

import { Skeleton } from "@/components/ui/skeleton";

export default function HabitsLoading() {
  return (
    <div className="gc-page flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48 w-full rounded-[1.25rem]" />
        <Skeleton className="h-48 w-full rounded-[1.25rem]" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-10 w-64 rounded-full" />
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
