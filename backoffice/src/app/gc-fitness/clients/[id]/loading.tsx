// /gc-fitness/clients/[id]/loading.tsx
//
// Instant skeleton for the client-detail screen while the server streams
// Firestore. Detail header + a stack/grid of card skeletons. Both themes.

import { Skeleton } from "@/components/ui/skeleton";

export default function ClientDetailLoading() {
  return (
    <div className="gc-page flex w-full flex-col gap-6">
      {/* Detail header */}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-32" />
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 shrink-0 rounded-2xl" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-44" />
          </div>
        </div>
      </div>

      {/* Preferences card */}
      <div className="rounded-[1.25rem] border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
      </div>

      {/* Summary + request-actions cards */}
      {Array.from({ length: 2 }).map((_, idx) => (
        <div
          key={idx}
          className="flex flex-col gap-3 rounded-[1.25rem] border bg-card p-5 shadow-sm"
        >
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ))}

      {/* 2-col detail grid */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, idx) => (
          <div
            key={idx}
            className="flex flex-col gap-3 rounded-[1.25rem] border bg-card p-5 shadow-sm"
          >
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
