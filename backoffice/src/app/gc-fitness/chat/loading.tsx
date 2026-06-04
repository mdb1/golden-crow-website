// /gc-fitness/chat/loading.tsx — Plan 20-06.
//
// Two-pane skeleton mirroring ChatInboxClient's grid-cols-12 layout. Renders
// while the server awaits getCurrentTrainer() + listClients(). Pure static
// markup with shadcn <Skeleton> — no client logic.

import { Skeleton } from "@/components/ui/skeleton";

export default function ChatLoading() {
  return (
    <div className="gc-page flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-1 h-4 w-72" />
      </div>
      <div className="grid h-[calc(100vh-12rem)] min-h-0 grid-cols-12 gap-0 overflow-hidden rounded-[1.25rem] border bg-card shadow-sm">
        <div className="col-span-12 overflow-y-auto border-b md:col-span-4 md:border-b-0 md:border-r">
          <ul className="flex flex-col gap-1 p-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <li key={idx} className="flex items-start gap-3 rounded-md p-3">
                <Skeleton className="h-10 w-10 flex-shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-3 w-10" />
              </li>
            ))}
          </ul>
        </div>
        <div className="col-span-12 hidden min-h-0 flex-col items-center justify-center p-8 md:col-span-8 md:flex">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-3 h-3 w-72" />
        </div>
      </div>
    </div>
  );
}
