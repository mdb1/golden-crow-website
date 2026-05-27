// /gc-fitness/templates/page.tsx — list view (Server Component shell)
//
// Auth gate runs on the server BEFORE any client component mounts. Failure
// modes mirror the exercises list page:
//   - missing/invalid cookie → redirect to `/gc-fitness/login`
//   - server-misconfigured env → throws, surfaces Next.js 500
//
// Once verified, render `<TemplatesLibraryClient />` inside this route's
// local QueryClientProvider.
//
// Plan 13-03 — i18n via getTranslations('templates'). The title is rendered
// at the page level; the deeper TemplatesLibraryClient renders English-only
// inner form/table content (out of scope for v1 — translations stop at the
// page shell + section heading, matching the schedule/exercises/habits
// pattern).

import { redirect } from "next/navigation";

import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { TemplatesLibraryClient } from "./client";
import { TemplatesQueryProvider } from "./providers";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  let trainerUid: string;
  try {
    const trainer = await getCurrentTrainer();
    trainerUid = trainer.uid;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  }

  return (
    <div className="gc-page flex flex-col gap-6">
      <TemplatesQueryProvider>
        <TemplatesLibraryClient trainerUid={trainerUid} />
      </TemplatesQueryProvider>
    </div>
  );
}
