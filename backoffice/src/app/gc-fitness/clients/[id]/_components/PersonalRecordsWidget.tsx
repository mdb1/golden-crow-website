// PersonalRecordsWidget.tsx — issue #405 part (b). Async server component that
// loads a client's personal records and renders the filterable list.

import { Trophy } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { listClientPersonalRecords } from "@/lib/gc-fitness/personal-records-actions";
import { PersonalRecordsClient } from "./PersonalRecordsClient";
import type { WeightUnits } from "@/lib/gc-fitness/weight-units";

export async function PersonalRecordsWidget({
  clientId,
  weightUnits = "kg",
}: {
  clientId: string;
  /** gc-fitness #1646 — the client's weight units. */
  weightUnits?: WeightUnits;
}) {
  const t = await getTranslations("clients.detail.personalRecords");
  const { records } = await listClientPersonalRecords(clientId);

  return (
    <section
      id="personal-records"
      className="rounded-card border border-border bg-card p-5 shadow-sm"
    >
      <div className="mb-3">
        <h2 className="flex items-center gap-2 font-medium">
          <Trophy className="size-4" />
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <PersonalRecordsClient
        records={records}
        weightUnits={weightUnits}
        labels={{
          empty: t("empty"),
          muscleGroupLabel: t("muscleGroupLabel"),
          muscleGroupAll: t("muscleGroupAll"),
          sortLabel: t("sortLabel"),
          sortRecent: t("sortRecent"),
          sortMostCommon: t("sortMostCommon"),
          previousLabel: t.raw("previousLabel"),
          estOneRm: t.raw("estOneRm"),
          noDate: t("noDate"),
        }}
      />
    </section>
  );
}
