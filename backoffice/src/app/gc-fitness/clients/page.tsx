// /gc-fitness/clients/page.tsx — Trainer roster (Server Component shell)
//
// Closes BO-07. Phase 11 Plan 11-05.
//
// Pattern C — page-level trainer auth gate; mirrors chat/page.tsx (P08-11).
// Auth: getCurrentTrainer() → Forbidden → redirect to /gc-fitness/login.
//
// Route placement note (Rule 4 inheritance from 11-03):
//   The plan frontmatter spelled the path as `(dashboard)/gc-fitness/clients/page.tsx`.
//   Plan 11-03 deferred the `git mv` into `(dashboard)/gc-fitness/` as a Rule 4
//   architectural deviation — the two auth chains (NextAuth in `(dashboard)/layout.tsx`
//   vs `next-firebase-auth-edge` for /gc-fitness) are incompatible. The existing
//   trainer routes (chat, habits, exercises, schedule, settings, templates) all
//   live at the flat `/gc-fitness/*` path. This plan inherits that decision.
//
// The page fetches the aggregated roster via `listClientsForRoster()` (50-cap;
// per-client fan-out budgeted; sorted by lastActivityAt DESC then displayName).
//
// The <RosterTable /> client component receives the rows as a prop and owns
// the interactive sort. The "Needs attention" filter chip is added in 11-06.

import { redirect } from "next/navigation";

import {
  getCurrentTrainer,
  type CurrentTrainer,
} from "@/lib/gc-fitness/auth-helpers";
import { listClientsForRoster } from "@/lib/gc-fitness/client-roster";
import { RosterTable } from "./_components/RosterTable";
import { RosterQueryProvider } from "./providers";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  let trainer: CurrentTrainer;
  try {
    trainer = await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  }

  const rows = await listClientsForRoster();

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Clients
        </h1>
        <p className="text-sm text-muted-foreground">
          {rows.length} client{rows.length === 1 ? "" : "s"} — sorted by most
          recent activity.
        </p>
      </div>
      <RosterQueryProvider>
        <RosterTable rows={rows} trainerUid={trainer.uid} />
      </RosterQueryProvider>
    </div>
  );
}
