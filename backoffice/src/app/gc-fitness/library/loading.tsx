// /gc-fitness/library/loading.tsx
//
// Instant skeleton for the Biblioteca hub while the server streams Firestore.
// PageHeader + pill-tabs strip + a card-grid of library items. Both themes.

import { Skeleton } from "@/components/ui/skeleton";

export default function LibraryLoading() {
  return (
    <div className="gc-page flex flex-col gap-6">
      {/* PageHeader */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Pill-tabs strip */}
      <div className="inline-flex w-fit max-w-full items-center gap-1 rounded-full bg-muted/70 p-1">
        {Array.from({ length: 3 }).map((_, idx) => (
          <Skeleton key={idx} className="h-8 w-32 rounded-full" />
        ))}
      </div>

      {/* Card grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div
            key={idx}
            className="flex flex-col gap-3 rounded-[1.25rem] border bg-card p-5 shadow-sm"
          >
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-28" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
