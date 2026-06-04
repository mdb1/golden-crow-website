// /gc-fitness/recent-logs/loading.tsx
//
// Instant skeleton for the recent workout logs timeline while the server
// streams Firestore. PageHeader + pill-tabs strip + ~8 timeline rows.

import { Skeleton } from "@/components/ui/skeleton";

export default function RecentLogsLoading() {
  return (
    <div className="gc-page flex flex-col gap-6">
      {/* PageHeader */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Pill-tabs filter strip */}
      <div className="inline-flex w-fit max-w-full items-center gap-1 rounded-full bg-muted/70 p-1">
        {Array.from({ length: 4 }).map((_, idx) => (
          <Skeleton key={idx} className="h-8 w-28 rounded-full" />
        ))}
      </div>

      {/* Timeline rows */}
      <div className="flex flex-col gap-3 rounded-[1.25rem] border bg-card p-4 shadow-sm">
        {Array.from({ length: 8 }).map((_, idx) => (
          <div key={idx} className="flex items-center gap-3 py-2">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-3 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}
