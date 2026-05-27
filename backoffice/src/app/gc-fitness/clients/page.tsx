// /gc-fitness/clients/page.tsx — Trainer roster (Server Component shell)
//
// Closes BO-07. Phase 11 Plan 11-05.
//
// Pattern C — page-level trainer auth gate; mirrors chat/page.tsx (P08-11).
// Auth: getCurrentTrainer() → Forbidden → redirect to /gc-fitness/login.
//
// Plan 13-03 — i18n via getTranslations('clients'). The active/pending
// breakdown uses ICU pluralization on `subtitleOne`/`subtitleOther`.

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  getCurrentTrainer,
  type CurrentTrainer,
} from "@/lib/gc-fitness/auth-helpers";
import { listClientsForRoster } from "@/lib/gc-fitness/client-roster";
import { ProvisionClientForm } from "./_components/ProvisionClientForm";
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
  const t = await getTranslations("clients");

  const activeCount = rows.filter((row) => !row.pendingProvisioning).length;
  const pendingCount = rows.filter((row) => row.pendingProvisioning).length;
  const activeText =
    activeCount === 1
      ? t("subtitleOne", { count: activeCount })
      : t("subtitleOther", { count: activeCount });
  const pendingSuffix =
    pendingCount > 0 ? t("subtitlePendingSuffix", { count: pendingCount }) : "";

  return (
    <div className="gc-page flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {activeText}
          {pendingSuffix}
          {t("subtitleSortNote")}
        </p>
        <p className="text-xs text-muted-foreground">
          At-risk clients highlight low compliance or missed workouts in the last coaching window.
        </p>
      </div>
      <ProvisionClientForm />
      <RosterQueryProvider>
        <RosterTable rows={rows} trainerUid={trainer.uid} />
      </RosterQueryProvider>
    </div>
  );
}
