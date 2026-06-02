// /gc-fitness/habits/page.tsx — list view (Server Component shell)
//
// Auth gate runs on the server BEFORE any client component mounts. Failure
// modes mirror the templates list page:
//   - missing/invalid cookie → redirect to `/gc-fitness/login`
//   - server-misconfigured env → throws, surfaces Next.js 500
//
// We pull the trainer's client roster here (Server-side `listClients()`
// from P04-05) and pass it to the client component. The roster powers
// both the columns' clientId→displayName resolution AND the client filter
// dropdown — no second roundtrip from the browser.
//
// Plan 13-03 — i18n via getTranslations('habits'). The title renders at the
// page shell; the deeper HabitsLibraryClient retains English content (out of
// scope for v1 like templates/exercises — translations stop at the heading).

import { redirect } from "next/navigation";
import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { listClients } from "@/lib/gc-fitness/client-roster";
import { HabitsLibraryClient } from "./client";
import { HabitsQueryProvider } from "./providers";

export const dynamic = "force-dynamic";

export default async function HabitsPage() {
  const trainer = await getCurrentTrainer().catch((err) => {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  });

  const clients = await listClients();
  const clientRoster = clients.map((c) => ({
    uid: c.uid,
    displayName: c.displayName,
    email: c.email,
    pendingProvisioning: c.pendingProvisioning,
  }));
  return (
    <div className="gc-page flex flex-col gap-6">
      <HabitsQueryProvider>
        <HabitsLibraryClient
          clientRoster={clientRoster}
          trainerUid={trainer.uid}
        />
      </HabitsQueryProvider>
    </div>
  );
}
