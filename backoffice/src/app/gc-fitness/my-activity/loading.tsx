// /gc-fitness/my-activity/loading.tsx
//
// Instant skeleton for the coach "My Activity" event log while the server
// streams Firestore. PageHeader + a card of timeline-row skeletons.

import { Skeleton } from "@/components/ui/skeleton";

export default function MyActivityLoading() {
  return (
    <div className="gc-page flex flex-col gap-6">
      {/* PageHeader */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Timeline rows */}
      <div className="flex flex-col gap-3 rounded-[1.25rem] border bg-card p-4 shadow-sm">
        {Array.from({ length: 8 }).map((_, idx) => (
          <div key={idx} className="flex items-center gap-3 py-2">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-3 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}
