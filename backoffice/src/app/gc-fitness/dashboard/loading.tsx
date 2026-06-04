// /gc-fitness/dashboard/loading.tsx
//
// Instant skeleton for the dashboard while the server streams Firestore data.
// Mirrors the real footprint: PageHeader + 4-up StatCard grid + two chart
// cards + a recent-activity list. Token-based (Skeleton uses bg-foreground/10),
// works in both themes. No data, no client hooks.

import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="gc-page flex flex-col gap-6">
      {/* PageHeader */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-40 rounded-full" />
      </div>

      {/* 4-up StatCard grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div
            key={idx}
            className="flex flex-col gap-3 rounded-[1.25rem] border bg-card p-5 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <Skeleton className="size-10 rounded-xl" />
              <Skeleton className="h-4 w-10" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        ))}
      </div>

      {/* Two chart cards */}
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, idx) => (
          <div
            key={idx}
            className="flex flex-col gap-4 rounded-[1.25rem] border bg-card p-5 shadow-sm"
          >
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        ))}
      </div>

      {/* Recent-activity list card */}
      <div className="flex flex-col gap-4 rounded-[1.25rem] border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
        <div className="flex flex-col divide-y divide-border">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="flex items-center gap-3 py-3">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
