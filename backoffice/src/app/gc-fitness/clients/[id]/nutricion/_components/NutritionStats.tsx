// NutritionStats.tsx — the three numbers above the grid (#919).
//
// Rolling 7 days, current phase, streak. All three come out of the triple-twinned
// calculators, never from a local count: "N días seguidos" has to mean the same thing on
// the coach's screen and on the client's phone, or the coach congratulates somebody for a
// streak their app never showed them.
//
// "Sin fase vigente" is a first-class answer, not a 0%. A client with no plan in force is
// not failing — nobody asked them anything — and that distinction is the single most
// useful thing on this row for a coach with twenty clients.

import { getTranslations } from "next-intl/server";

import { Card, CardContent } from "@/components/ui/card";
import type { NutritionAdherenceBreakdown } from "@/lib/gc-fitness/nutrition-adherence";

export interface NutritionStatsProps {
  last7Days: NutritionAdherenceBreakdown;
  currentPhase: NutritionAdherenceBreakdown | null;
  streak: number;
}

export async function NutritionStats({
  last7Days,
  currentPhase,
  streak,
}: NutritionStatsProps) {
  const t = await getTranslations("clients.detail.nutrition");

  return (
    <div className="grid gap-3 sm:grid-cols-3" data-testid="nutrition-stats">
      <StatCard
        label={t("statAdherence7")}
        value={last7Days.isEmpty ? t("statNoPhase") : `${last7Days.percent}%`}
        muted={last7Days.isEmpty}
      />
      <StatCard
        label={t("statAdherencePhase")}
        value={
          currentPhase && !currentPhase.isEmpty
            ? `${currentPhase.percent}%`
            : t("statNoPhase")
        }
        muted={!currentPhase || currentPhase.isEmpty}
      />
      <StatCard label={t("statStreak")} value={t("statStreakValue", { count: streak })} />
    </div>
  );
}

function StatCard({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p
          className={
            muted
              ? "text-muted-foreground mt-1 text-sm"
              : "mt-1 text-2xl font-semibold tabular-nums"
          }
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
