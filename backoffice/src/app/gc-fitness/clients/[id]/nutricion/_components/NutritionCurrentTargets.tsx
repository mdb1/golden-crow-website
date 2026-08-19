import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCivilDateLabel } from "@/lib/gc-fitness/civil-date";
import type { NutritionPhase } from "@/lib/gc-fitness/nutrition-plan-form";

import { MacroTiles } from "./MacroTiles";

/**
 * The targets in force TODAY, or the empty state.
 *
 * "Sin plan vigente" is a first-class state here, not an error and not a 0% — it is the
 * single thing a coach with twenty clients most needs to spot, and rendering it as a row
 * of zeros would read as a client who is failing rather than one nobody has assigned yet.
 */
export async function NutritionCurrentTargets({
  phase,
  todayCivil,
}: {
  phase: NutritionPhase | null;
  todayCivil: string;
}) {
  const t = await getTranslations("clients.detail.nutrition");

  if (!phase) {
    return (
      <Card data-testid="nutrition-no-current-plan">
        <CardHeader>
          <CardTitle className="text-base">{t("noCurrentPlan")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{t("noCurrentPlanHelp")}</p>
        </CardContent>
      </Card>
    );
  }

  const { plan } = phase;
  const until = plan.endsOn
    ? formatCivilDateLabel(plan.endsOn, { day: "numeric", month: "short" })
    : t("openEnded");

  return (
    <Card data-testid="nutrition-current-targets">
      <CardHeader className="flex flex-row items-baseline justify-between gap-3">
        <CardTitle className="text-base">{t("currentTargets")}</CardTitle>
        <span className="text-muted-foreground text-xs">
          {plan.name.es || plan.name.en} · {until}
        </span>
      </CardHeader>
      <CardContent>
        <MacroTiles
          targets={plan.targets}
          labels={{
            kcal: t("kcal"),
            protein: t("protein"),
            carbs: t("carbs"),
            fat: t("fat"),
            empty: t("noMacro"),
          }}
        />
        <p className="text-muted-foreground mt-3 text-xs">
          {t("mealsCount", { count: plan.meals.length })} · {todayCivil}
        </p>
      </CardContent>
    </Card>
  );
}
