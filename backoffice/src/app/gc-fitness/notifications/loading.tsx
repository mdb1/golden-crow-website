// /gc-fitness/notifications/loading.tsx
//
// Instant skeleton for the notifications screen while the server streams
// Firestore. PageHeader + hero banner + grouped list cards. Both themes.

import { Skeleton } from "@/components/ui/skeleton";

export default function NotificationsLoading() {
  return (
    <div className="gc-page flex flex-col gap-6">
      {/* PageHeader + actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>

      {/* Hero banner */}
      <Skeleton className="h-32 w-full rounded-[1.25rem]" />

      {/* Grouped list cards */}
      {Array.from({ length: 2 }).map((_, idx) => (
        <div
          key={idx}
          className="flex flex-col gap-3 rounded-[1.25rem] border bg-card p-5 shadow-sm"
        >
          <Skeleton className="h-5 w-44" />
          {Array.from({ length: 3 }).map((_, row) => (
            <div key={row} className="flex items-center gap-3 py-1">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
