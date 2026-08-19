import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCivilDateLabel } from "@/lib/gc-fitness/civil-date";
import type { NutritionPhase } from "@/lib/gc-fitness/nutrition-plan-form";
import { isSelfAuthoredPlan } from "@/lib/gc-fitness/nutrition-schema";

/**
 * The phase strip: pasada / vigente / programada, in date order, plus "+ Fase".
 *
 * The self-authored plan of a coach-less client shows up here as a phase like any other,
 * tagged "Del cliente". It is NOT hidden and NOT deleted when the coach takes over —
 * deleting somebody's history because they hired a trainer would be the wrong call, and
 * the adherence of those weeks is real data the coach can learn from.
 */
export async function NutritionPhaseStrip({
  clientId,
  phases,
  todayCivil,
}: {
  clientId: string;
  phases: NutritionPhase[];
  todayCivil: string;
}) {
  const t = await getTranslations("clients.detail.nutrition");

  if (phases.length === 0) {
    return (
      <Card data-testid="nutrition-phases-empty">
        <CardContent className="flex flex-col items-start gap-3 py-8">
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
          <Button asChild size="sm">
            <Link href={`/gc-fitness/clients/${clientId}/nutricion/asignar`}>
              {t("emptyCta")}
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="nutrition-phase-strip">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">{t("phases")}</CardTitle>
        <Button asChild size="sm" variant="outline">
          <Link href={`/gc-fitness/clients/${clientId}/nutricion/asignar`}>
            {t("addPhase")}
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-2">
          {phases.map((phase) => {
            const { plan, state } = phase;
            const from = formatCivilDateLabel(plan.startsOn, {
              day: "numeric",
              month: "short",
            });
            const to = plan.endsOn
              ? formatCivilDateLabel(plan.endsOn, { day: "numeric", month: "short" })
              : t("openEnded");
            const stateLabel =
              state === "current"
                ? t("stateCurrent")
                : state === "scheduled"
                  ? t("stateScheduled")
                  : t("statePast");

            return (
              <li
                key={plan.id}
                data-testid={`nutrition-phase-${state}`}
                className={
                  phase.isActive
                    ? "border-primary/50 bg-primary/5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-3"
                    : "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-3"
                }
              >
                <span className="text-sm font-semibold">{plan.name.es || plan.name.en}</span>
                <Badge variant={phase.isActive ? "default" : "secondary"}>{stateLabel}</Badge>
                {isSelfAuthoredPlan(plan) ? (
                  <Badge variant="outline">{t("selfAuthored")}</Badge>
                ) : null}
                <span className="text-muted-foreground text-xs tabular-nums">
                  {from} → {to}
                </span>
                <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                  {typeof plan.targets.kcal === "number"
                    ? `${plan.targets.kcal} kcal`
                    : t("noMacro")}
                  {" · "}
                  {t("mealsCount", { count: plan.meals.length })}
                </span>
                {/* #949 — every phase was read-only once written: the only way to change
                    2000 kcal to 2200 was to assign a whole new phase by hand and let the
                    overlap planner trim this one. A client-authored phase stays read-only
                    — it is the client's document and the rules deny the coach's write. */}
                {isSelfAuthoredPlan(plan) ? null : (
                  <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                    <Link
                      href={`/gc-fitness/clients/${clientId}/nutricion/${plan.id}/editar`}
                      data-testid={`nutrition-phase-edit-${plan.id}`}
                    >
                      {t("edit")}
                    </Link>
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
        <p className="text-muted-foreground mt-3 text-xs">
          {t("overlapWhy")} — {todayCivil}
        </p>
      </CardContent>
    </Card>
  );
}
