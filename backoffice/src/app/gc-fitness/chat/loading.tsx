// /gc-fitness/chat/loading.tsx — Plan 20-06.
//
// Two-pane skeleton mirroring ChatInboxClient's grid-cols-12 layout. Renders
// while the server awaits getCurrentTrainer() + listClients(). Pure static
// markup with shadcn <Skeleton> — no client logic.

import { Skeleton } from "@/components/ui/skeleton";

export default function ChatLoading() {
  // Full-bleed skeleton — mirrors ChatInboxClient's edge-to-edge two-pane
  // surface (no rounded outer card, no `.gc-page` padding). Fills the content
  // area minus the shell's mobile top bar (h-14 = 3.5rem); on desktop there's
  // no top bar so it uses the full viewport height.
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col md:h-screen">
      <div className="grid h-full min-h-0 grid-cols-1 gap-0 overflow-hidden bg-card md:grid-cols-[320px_1fr]">
        <div className="min-h-0 overflow-y-auto border-border md:border-r">
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
        <div className="hidden min-h-0 flex-col items-center justify-center p-8 md:flex">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-3 h-3 w-72" />
        </div>
      </div>
    </div>
  );
}
