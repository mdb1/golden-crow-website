// /gc-fitness/clients/[id]/progress/loading.tsx
//
// Instant skeleton for the per-client per-exercise progress screen while the
// server aggregates the workout logs. Mirrors the page layout: back link +
// title block + a controls row + chart card. Both themes (tokens only).

import { Skeleton } from "@/components/ui/skeleton";

export default function ClientExerciseProgressLoading() {
  return (
    <div className="gc-page flex w-full flex-col gap-6">
      <Skeleton className="h-4 w-32" />

      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="flex flex-col gap-4 rounded-[1.25rem] border bg-card p-5 shadow-sm">
        <Skeleton className="h-9 w-full sm:max-w-sm rounded-md" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Skeleton className="h-8 w-48 rounded-full" />
          <Skeleton className="h-8 w-44 rounded-full" />
        </div>
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    </div>
  );
}
