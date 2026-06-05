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
import { Bell } from "lucide-react";
import { getTranslations } from "next-intl/server";

import {
  getCurrentTrainer,
  type CurrentTrainer,
} from "@/lib/gc-fitness/auth-helpers";
import { listClientsForRoster } from "@/lib/gc-fitness/client-roster";
import { AddClientPanel } from "./_components/AddClientPanel";
import { RosterTable } from "./_components/RosterTable";
import { RosterQueryProvider } from "./providers";

export const dynamic = "force-dynamic";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
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
  const params = await searchParams;
  const initialNeedsAttentionOnly = params.filter === "attention";

  const activeCount = rows.filter((row) => !row.pendingProvisioning).length;
  const pendingCount = rows.filter((row) => row.pendingProvisioning).length;
  const activeText =
    activeCount === 1
      ? t("subtitleOne", { count: activeCount })
      : t("subtitleOther", { count: activeCount });
  const pendingSuffix =
    pendingCount > 0 ? t("subtitlePendingSuffix", { count: pendingCount }) : "";

  const subtitle = `${activeText}${pendingSuffix}${t("subtitleSortNote")}`;

  // New clients that signed up WITHOUT a coach pre-assignment (no user_mirror)
  // and were auto-attached to this coach by the sign-up fallback. Surface them
  // as a notification so they get triaged (kept or transferred via admin).
  const newAutoAssigned = rows.filter((row) => row.autoAssignedCoach);

  return (
    <div className="gc-page flex flex-col gap-6">
      <AddClientPanel title={t("title")} subtitle={subtitle} />
      {newAutoAssigned.length > 0 ? (
        <div className="flex items-start gap-3 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
          <Bell className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <div className="flex flex-col gap-0.5">
            <p className="font-medium text-foreground">
              {newAutoAssigned.length === 1
                ? "1 cliente nuevo se registró sin coach y quedó asignado a vos"
                : `${newAutoAssigned.length} clientes nuevos se registraron sin coach y quedaron asignados a vos`}
            </p>
            <p className="text-muted-foreground">
              Están marcados con{" "}
              <span className="font-semibold text-foreground">NEW</span> abajo.
              Revisalos y, si corresponden a otro coach, transferilos desde el
              panel de admin.
            </p>
          </div>
        </div>
      ) : null}
      <RosterQueryProvider>
        <RosterTable
          rows={rows}
          trainerUid={trainer.uid}
          initialNeedsAttentionOnly={initialNeedsAttentionOnly}
        />
      </RosterQueryProvider>
    </div>
  );
}
