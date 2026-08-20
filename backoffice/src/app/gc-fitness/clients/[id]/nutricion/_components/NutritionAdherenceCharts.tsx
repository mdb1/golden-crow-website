"use client";

// NutritionAdherenceCharts.tsx — los gráficos de adherencia (#961).
//
// La grilla de #919 muestra el PATRÓN de una semana (qué comida se cae, qué día). Lo que no
// contesta es la otra mitad de la conversación: "¿viene mejorando o empeorando?". Un coach que
// mira ocho semanas de grilla una por una no ve la tendencia; la ve en una sola tira de barras.
//
// ── CERO LECTURAS NUEVAS ─────────────────────────────────────────────────────────────
//
// Las dos series salen de datos que la página YA cargó: las semanas de la grilla traen su
// propio `breakdown`, y la lista por comida es la misma `nutritionAdherenceByMeal` que ya
// alimenta "las comidas que valen una conversación". Un segundo conteo del mismo hecho es una
// segunda oportunidad de discrepar (#173), así que acá no se cuenta nada: sólo se dibuja.
//
// ── UNA SEMANA VACÍA NO ES UNA SEMANA EN CERO ────────────────────────────────────────
//
// `breakdown.isEmpty` significa que esa semana no le pidió NADA al cliente —no había fase
// vigente—, y dibujarla como una barra en 0 % acusa a alguien de fallar algo que nadie le
// pidió. Esas semanas se dibujan como un hueco, con su etiqueta puesta para que el eje no
// mienta sobre el tiempo transcurrido.

import { useLocale, useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCivilDateLabel } from "@/lib/gc-fitness/civil-date";
import { localizedNamePair } from "@/lib/gc-fitness/localized-name";
import type { NutritionMealAdherence } from "@/lib/gc-fitness/nutrition-adherence";
import type { NutritionWeekGrid } from "@/lib/gc-fitness/nutrition-compliance";

export interface NutritionAdherenceChartsProps {
  /** Oldest → newest, exactly the array the grid renders. */
  weeks: NutritionWeekGrid[];
  /** Worst first, from `nutritionAdherenceByMeal`. Empty when there is no phase in force. */
  byMeal: NutritionMealAdherence[];
}

/**
 * Verde arriba de 80, ámbar entre 50 y 80, rojo abajo.
 *
 * Los cortes son los mismos que usa el coach al hablar, y el color NUNCA va solo: cada barra
 * tiene su porcentaje escrito en el tooltip y el eje está rotulado.
 */
function barColor(percent: number): string {
  if (percent >= 80) return "var(--color-chart-2)";
  if (percent >= 50) return "var(--color-chart-4)";
  return "var(--color-destructive)";
}

export function NutritionAdherenceCharts({ weeks, byMeal }: NutritionAdherenceChartsProps) {
  const t = useTranslations("clients.detail.nutrition");
  const locale = useLocale();

  const weekPoints = weeks.map((week) => ({
    key: week.weekStart,
    label: formatCivilDateLabel(week.weekStart, { day: "numeric", month: "short" }, locale),
    // `null` y no 0: recharts deja el hueco y el tooltip no inventa un fracaso.
    percent: week.breakdown.isEmpty ? null : week.breakdown.percent,
    expected: week.breakdown.expected,
    done: week.breakdown.done,
  }));
  const hasWeekData = weekPoints.some((point) => point.percent !== null);

  const mealPoints = byMeal.map((meal) => ({
    key: meal.mealId,
    label: localizedNamePair(meal.name, locale).primary,
    percent: meal.breakdown.percent,
    expected: meal.breakdown.expected,
    done: meal.breakdown.done,
  }));

  if (!hasWeekData && mealPoints.length === 0) return null;

  return (
    <Card data-testid="nutrition-adherence-charts">
      <CardHeader>
        <CardTitle className="text-base">{t("chartsTitle")}</CardTitle>
        <p className="text-muted-foreground text-sm">{t("chartsSubtitle")}</p>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-2" data-testid="nutrition-adherence-by-week">
          <h3 className="text-sm font-medium">{t("chartsByWeek")}</h3>
          {hasWeekData ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekPoints} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis
                    domain={[0, 100]}
                    ticks={[0, 50, 100]}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    unit="%"
                  />
                  <Tooltip
                    formatter={(value) => [`${value ?? 0}%`, t("chartsByWeek")]}
                  />
                  <Bar dataKey="percent" radius={[4, 4, 0, 0]}>
                    {weekPoints.map((point) => (
                      <Cell key={point.key} fill={barColor(point.percent ?? 0)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t("chartsEmpty")}</p>
          )}
        </section>

        <section className="flex flex-col gap-2" data-testid="nutrition-adherence-by-meal">
          <h3 className="text-sm font-medium">{t("chartsByMeal")}</h3>
          {mealPoints.length > 0 ? (
            // Barras horizontales y no verticales: los nombres de las comidas son palabras
            // ("Merienda"), y en vertical se pisan o se rotan hasta ser ilegibles.
            <ul className="flex flex-col gap-2">
              {mealPoints.map((meal) => (
                <li key={meal.key} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 truncate text-xs" title={meal.label}>
                    {meal.label}
                  </span>
                  <span className="bg-muted h-3 flex-1 overflow-hidden rounded-full">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${meal.percent}%`,
                        backgroundColor: barColor(meal.percent),
                      }}
                    />
                  </span>
                  <span className="w-20 shrink-0 text-right text-xs tabular-nums">
                    {meal.percent}%{" "}
                    <span className="text-muted-foreground">
                      ({meal.done}/{meal.expected})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">{t("chartsEmpty")}</p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
