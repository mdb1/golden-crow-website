// page.tsx — `/gc-fitness/exercises` list view (Server Component shell)
//
// Auth gate runs on the server BEFORE any client component mounts. Failure
// modes:
//   - missing/invalid cookie → redirect to `/gc-fitness/login`
//   - allowlist denial → redirect to `/gc-fitness/forbidden`
//   - misconfigured env vars → thrown error surfaces a Next.js 500 (the
//     existing proxy.ts already prevents this on Vercel; local-dev without
//     a service-account JSON throws here on purpose — operator sees a clear
//     message, BLOCKERS item 7 deferral path)
//
// Once the trainer is verified, render `<ExerciseLibraryClient />` inside the
// route group's local QueryClientProvider.
//
// Plan 13-03 — i18n via getTranslations('exercises'). Page-level heading is
// translated; deeper ExerciseLibraryClient retains English (same pattern as
// templates/habits — translations stop at the page shell for v1).

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { ExerciseLibraryClient } from "./client";
import { ExerciseQueryProvider } from "./providers";

export const dynamic = "force-dynamic";

export default async function ExercisesPage() {
  let trainer: Awaited<ReturnType<typeof getCurrentTrainer>>;
  try {
    trainer = await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    // Anything else (e.g. server misconfigured — missing env vars) is a
    // real deployment bug; let Next.js render its error boundary.
    throw err;
  }

  const t = await getTranslations("exercises");

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
      </div>
      <ExerciseQueryProvider>
        <ExerciseLibraryClient trainerUid={trainer.uid} />
      </ExerciseQueryProvider>
    </div>
  );
}
