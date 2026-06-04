// /gc-fitness/settings/loading.tsx
//
// Instant skeleton for the trainer settings screen while the server streams
// Firestore. PageHeader + profile card + grouped setting rows. Both themes.

import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="gc-page flex flex-col gap-6">
      {/* PageHeader */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Profile card */}
      <div className="flex flex-col gap-4 rounded-[1.25rem] border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:gap-5">
        <Skeleton className="size-16 shrink-0 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-56" />
          <div className="flex flex-wrap gap-2 pt-0.5">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        </div>
      </div>

      {/* Grouped setting rows */}
      {Array.from({ length: 2 }).map((_, idx) => (
        <div
          key={idx}
          className="flex flex-col rounded-[1.25rem] border bg-card p-5 shadow-sm"
        >
          <Skeleton className="mb-4 h-5 w-40" />
          <div className="flex flex-col divide-y divide-border">
            {Array.from({ length: 3 }).map((_, row) => (
              <div
                key={row}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
                <Skeleton className="h-6 w-12 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
