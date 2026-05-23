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
import { getTranslations } from "next-intl/server";

import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { listClients } from "@/lib/gc-fitness/client-roster";
import { HabitsLibraryClient } from "./client";
import { HabitsQueryProvider } from "./providers";

export const dynamic = "force-dynamic";

export default async function HabitsPage() {
  try {
    await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  }

  const clients = await listClients();
  const clientRoster = clients.map((c) => ({
    uid: c.uid,
    displayName: c.displayName,
  }));
  const t = await getTranslations("habits");

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
      </div>
      <HabitsQueryProvider>
        <HabitsLibraryClient clientRoster={clientRoster} />
      </HabitsQueryProvider>
    </div>
  );
}
