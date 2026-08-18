import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCivilDateLabel } from "@/lib/gc-fitness/civil-date";
import type { NutritionPhase } from "@/lib/gc-fitness/nutrition-plan-form";
import type { MacroTargets } from "@/lib/gc-fitness/nutrition-schema";

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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MacroTile label={t("kcal")} value={plan.targets.kcal} unit="kcal" empty={t("noMacro")} />
          <MacroTile label={t("protein")} value={plan.targets.proteinG} unit="g" empty={t("noMacro")} />
          <MacroTile label={t("carbs")} value={plan.targets.carbsG} unit="g" empty={t("noMacro")} />
          <MacroTile label={t("fat")} value={plan.targets.fatG} unit="g" empty={t("noMacro")} />
        </div>
        <p className="text-muted-foreground mt-3 text-xs">
          {t("mealsCount", { count: plan.meals.length })} · {todayCivil}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * One macro.
 *
 * An ABSENT macro renders as an em dash, never as `0`. A coach who set only calories did
 * not set a zero protein target, and showing one would be the app putting words in their
 * mouth — the whole reason every macro field is nullable in the wire shape.
 */
function MacroTile({
  label,
  value,
  unit,
  empty,
}: {
  label: string;
  value: MacroTargets["kcal"];
  unit: string;
  empty: string;
}) {
  const hasValue = typeof value === "number" && Number.isFinite(value);
  return (
    <div className="bg-muted/40 rounded-lg border p-3">
      <div className="text-muted-foreground text-[11px] uppercase tracking-wide">{label}</div>
      <div className="text-xl font-semibold tabular-nums">
        {hasValue ? (
          <>
            {value}
            <span className="text-muted-foreground ml-1 text-xs font-medium">{unit}</span>
          </>
        ) : (
          empty
        )}
      </div>
    </div>
  );
}
