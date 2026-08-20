import Link from "next/link";
import { Apple } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { gcFitnessFirestore } from "@/lib/firebase/gc-fitness-admin";
import { civilDateAddDays, formatCivilDateLabel } from "@/lib/gc-fitness/civil-date";
import { nutritionAdherenceByMeal } from "@/lib/gc-fitness/nutrition-adherence";
import {
  listNutritionLogsForClient,
  listNutritionPlansForClient,
} from "@/lib/gc-fitness/nutrition-actions";
import {
  buildNutritionWeekGrid,
  civilWeekStart,
} from "@/lib/gc-fitness/nutrition-compliance";
import { buildNutritionPhaseStrip } from "@/lib/gc-fitness/nutrition-plan-form";
import { loadNutritionRosterSummaries } from "@/lib/gc-fitness/nutrition-roster";

import { NutritionAdherenceCharts } from "../nutricion/_components/NutritionAdherenceCharts";
import { NutritionComplianceGrid } from "../nutricion/_components/NutritionComplianceGrid";
import { MacroTiles } from "../nutricion/_components/MacroTiles";

/**
 * #961 — cuántas semanas trae la grilla del perfil.
 *
 * Las mismas ocho que la pantalla de nutrición, para que la tira de barras no cuente una
 * historia más corta en un lado que en el otro. La VENTANA DE LECTURA, en cambio, es sólo la
 * que esas ocho semanas necesitan (~9 semanas de logs) y no el año que lee `/nutricion`: el
 * perfil no dibuja fases históricas ni la tabla de peso, así que pagar 365 días de logs acá
 * sería comprar datos que nadie mira.
 */
const PROFILE_GRID_WEEKS = 8;

/**
 * Nutrition on the client's profile (#949).
 *
 * ── WHY THIS IS A SECTION AND NOT A BUTTON ───────────────────────────────────────────
 *
 * It used to be one pill in the header next to Ajustes and Notas. Everything else a coach
 * needs to know about a client — what they train, what habits they are on, their weight,
 * their photos — is ON this page; nutrition was the one thing you had to navigate away to
 * see, which in practice means the coach who does not already suspect a problem never
 * looks. A phase that expired three weeks ago is invisible from here, and adherence
 * simply stops moving without anything going red.
 *
 * ── THE EMPTY STATE IS THE POINT, NOT AN EDGE CASE ───────────────────────────────────
 *
 * "Todavía no le asignaste un plan" renders as a first-class state with its own CTA. A
 * section that disappears when there is no plan makes the most actionable case — a client
 * nobody has fed a plan to — the one case the page says nothing about.
 *
 * ── READS ────────────────────────────────────────────────────────────────────────────
 *
 * Two: the phases (`listNutritionPlansForClient`) and the batched 7-day summary — the
 * SAME loader the roster column uses, so the profile and the roster can never print two
 * different adherence numbers for the same week. The summary read moved here from
 * `ClientSummaryCard`, which no longer carries a nutrition strip, so the page's read
 * budget grows by exactly one query.
 */
export async function NutritionProfileWidget({
  clientId,
  timezone,
}: {
  clientId: string;
  timezone: string;
}) {
  const t = await getTranslations("clients.detail.nutrition");

  const [{ plans, context }, summaries] = await Promise.all([
    listNutritionPlansForClient(clientId),
    loadNutritionRosterSummaries(
      gcFitnessFirestore(),
      [{ uid: clientId, timezone }],
      timezone,
    ),
  ]);
  const summary = summaries.get(clientId) ?? null;
  const phases = buildNutritionPhaseStrip(plans, context.todayCivil);
  const current = phases.find((phase) => phase.isActive) ?? null;
  const scheduled = phases.filter((phase) => phase.state === "scheduled");

  const manageHref = `/gc-fitness/clients/${clientId}/nutricion`;

  // #961 — la semana y la adherencia, acá.
  //
  // El pedido es literal: el coach quiere ver "esta semana" con sus controles de anterior /
  // siguiente y algún gráfico SIN salir del perfil. Todo lo que se dibuja abajo son los
  // componentes de `/nutricion` reusados tal cual — no una segunda versión que pueda contar
  // otra historia sobre el mismo día.
  //
  // Cuesta UNA lectura más, y sólo cuando hay fase: sin plan no hay nada que medir, así que
  // el caso más barato (un cliente sin plan) sigue costando lo que costaba.
  const gridWindowStart =
    civilDateAddDays(civilWeekStart(context.todayCivil), -(PROFILE_GRID_WEEKS - 1) * 7) ??
    context.todayCivil;
  const logs =
    phases.length > 0
      ? await listNutritionLogsForClient(clientId, gridWindowStart, context.todayCivil)
      : [];
  const weeks =
    phases.length > 0
      ? Array.from({ length: PROFILE_GRID_WEEKS }, (_, offset) => {
          const anchor =
            civilDateAddDays(
              civilWeekStart(context.todayCivil),
              -(PROFILE_GRID_WEEKS - 1 - offset) * 7,
            ) ?? context.todayCivil;
          return buildNutritionWeekGrid(plans, logs, anchor, context.todayCivil);
        })
      : [];
  // Recortado a la ventana leída, igual que en `/nutricion`: una fase que arrancó antes
  // contaría los días no leídos como sin marcar y reportaría un fracaso que nadie tuvo.
  const adherenceByMeal = current
    ? nutritionAdherenceByMeal(
        plans,
        logs,
        current.plan.startsOn > gridWindowStart ? current.plan.startsOn : gridWindowStart,
        context.todayCivil,
      )
    : [];

  return (
    <section className="rounded-xl border bg-card p-4" data-testid="client-nutrition-section">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-medium">
            <Apple className="size-4" aria-hidden />
            {t("profileTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("profileSubtitle")}</p>
        </div>
        <Button asChild size="sm" variant="outline" className="rounded-full">
          <Link href={manageHref}>{t("profileManage")}</Link>
        </Button>
      </div>

      {phases.length === 0 ? (
        <div
          className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6"
          data-testid="client-nutrition-empty"
        >
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
          <Button asChild size="sm">
            <Link href={`${manageHref}/asignar`}>{t("emptyCta")}</Link>
          </Button>
        </div>
      ) : current === null ? (
        // A phase that ENDED and was never followed by another. Painted as an alert
        // because nothing else on the page goes red for it: adherence just stops moving.
        <div
          className="flex flex-col items-start gap-3 rounded-lg border border-chart-4/40 bg-chart-4/5 p-4"
          data-testid="client-nutrition-expired"
        >
          <div>
            <p className="text-sm font-medium text-chart-4">{t("noCurrentPlan")}</p>
            <p className="text-xs text-muted-foreground">{t("profileExpiredHelp")}</p>
          </div>
          <Button asChild size="sm">
            <Link href={`${manageHref}/asignar`}>{t("addPhase")}</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3" data-testid="client-nutrition-current">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm font-semibold">
              {current.plan.name.es || current.plan.name.en}
            </span>
            <Badge>{t("stateCurrent")}</Badge>
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatCivilDateLabel(current.plan.startsOn, {
                day: "numeric",
                month: "short",
              })}
              {" → "}
              {current.plan.endsOn
                ? formatCivilDateLabel(current.plan.endsOn, {
                    day: "numeric",
                    month: "short",
                  })
                : t("openEnded")}
            </span>
            {summary?.percent7d !== null && summary?.percent7d !== undefined ? (
              <span className="ml-auto text-sm">
                <span className="font-semibold tabular-nums">{summary.percent7d}%</span>{" "}
                <span className="text-muted-foreground">{t("statAdherence7")}</span>
              </span>
            ) : null}
          </div>

          <MacroTiles
            targets={current.plan.targets}
            labels={{
              kcal: t("kcal"),
              protein: t("protein"),
              carbs: t("carbs"),
              fat: t("fat"),
              empty: t("noMacro"),
            }}
          />

          {current.plan.meals.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {[...current.plan.meals]
                .sort((a, b) => a.order - b.order)
                .map((meal) => (
                  <li
                    key={meal.mealId}
                    className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs"
                  >
                    {meal.name.es || meal.name.en}
                    {typeof meal.targets?.kcal === "number" ? (
                      <span className="ml-1 tabular-nums text-muted-foreground">
                        {meal.targets.kcal} kcal
                      </span>
                    ) : null}
                  </li>
                ))}
            </ul>
          ) : null}

          <NutritionComplianceGrid weeks={weeks} />

          <NutritionAdherenceCharts weeks={weeks} byMeal={adherenceByMeal} />

          {scheduled.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("stateScheduled")}:{" "}
              {scheduled
                .map(
                  (phase) =>
                    `${phase.plan.name.es || phase.plan.name.en} (${formatCivilDateLabel(
                      phase.plan.startsOn,
                      { day: "numeric", month: "short" },
                    )})`,
                )
                .join(" · ")}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
