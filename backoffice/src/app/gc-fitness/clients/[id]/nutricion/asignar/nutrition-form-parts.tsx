"use client";

// Presentational pieces of AssignNutritionForm (#507 — split out of the
// 1,400-line component): the macro box, the meal roll-up panel, the kcal
// estimate hint, the edit-scope radio and the overlap notice.

import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  estimateKcalFromMacros,
  macroKcalMismatch,
  rollupDeltaIsWorthShowing,
  rollupMealMacros,
} from "@/lib/gc-fitness/nutrition-macro-math";
import type { MacroRollupLine } from "@/lib/gc-fitness/nutrition-macro-math";
import type { NutritionOverlapNotice } from "@/lib/gc-fitness/nutrition-plan-form";

import { numberOrNull, type DraftMeal } from "./nutrition-form-model";

/**
 * One macro box.
 *
 * `unit` is the point of #949: four identical boxes labelled Calorías / Proteína / Carbos
 * / Grasas do not say whether the last three want grams or percentages, and a coach who
 * guesses percentages writes a plan asking for 40 g of carbs.
 */
export function MacroInput({
  label,
  unit,
  value,
  onChange,
  id,
}: {
  label: string;
  unit?: string;
  value: string;
  onChange: (value: string) => void;
  id: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
        {unit ? <span className="text-muted-foreground ml-1 font-normal">{unit}</span> : null}
      </Label>
      <Input
        id={id}
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/**
 * #961 — ¿lo que repartí entre las comidas llega al día?
 *
 * Es la pregunta que el coach hace en voz alta mientras carga el plan, y hasta ahora la
 * pantalla no la contestaba: el aviso de #949 compara CADA comida contra su propia línea de
 * calorías, así que cuatro comidas internamente coherentes podían sumar 1.760 de un objetivo
 * de 2.000 sin que nada lo dijera. Ochocientas calorías se van así, y el síntoma aparece
 * semanas después como "el cliente no baja".
 *
 * Va abajo de las comidas y no arriba con los objetivos a propósito: es el resultado de lo que
 * acabás de repartir, y leerlo antes de repartir no significa nada.
 *
 * ⚠️ Misma disciplina que el resto del editor: **no bloquea el guardado ni reescribe nada**.
 * Un coach puede repartir a propósito menos de lo que pide el día.
 *
 * ⚠️ Y cuando a alguna comida le falta el macro, se muestra el total pero NO la diferencia:
 * "faltan 69 g de proteína" porque tres comidas no la tienen cargada es un número falso que
 * manda a corregir un plan que está bien. Ver `rollupMealMacros`.
 */
export function MealRollupPanel({
  meals,
  targets,
}: {
  meals: DraftMeal[];
  targets: { kcal: string; proteinG: string; carbsG: string; fatG: string };
}) {
  const t = useTranslations("clients.detail.nutrition");
  const rollup = rollupMealMacros(
    meals.map((meal) => ({
      kcal: numberOrNull(meal.kcal),
      proteinG: numberOrNull(meal.proteinG),
      carbsG: numberOrNull(meal.carbsG),
      fatG: numberOrNull(meal.fatG),
    })),
    {
      kcal: numberOrNull(targets.kcal),
      proteinG: numberOrNull(targets.proteinG),
      carbsG: numberOrNull(targets.carbsG),
      fatG: numberOrNull(targets.fatG),
    },
  );

  if (meals.length === 0) return null;

  const lines: Array<{
    key: string;
    label: string;
    unit: string;
    metric: "kcal" | "grams";
    line: MacroRollupLine;
  }> = [
    { key: "kcal", label: t("kcal"), unit: "", metric: "kcal", line: rollup.kcal },
    { key: "protein", label: t("protein"), unit: " g", metric: "grams", line: rollup.proteinG },
    { key: "carbs", label: t("carbs"), unit: " g", metric: "grams", line: rollup.carbsG },
    { key: "fat", label: t("fat"), unit: " g", metric: "grams", line: rollup.fatG },
  ];

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3" data-testid="nutrition-meal-rollup">
      <div>
        <p className="text-sm font-medium">{t("rollupTitle")}</p>
        <p className="text-muted-foreground text-xs">{t("rollupHelp")}</p>
      </div>
      {rollup.isEmpty ? (
        <p className="text-muted-foreground text-xs" data-testid="nutrition-meal-rollup-empty">
          {t("rollupEmpty")}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {lines.map(({ key, label, unit, metric, line }) => (
            <div
              key={key}
              className="flex flex-col gap-0.5 rounded-md border bg-background p-2"
              data-testid={`nutrition-meal-rollup-${key}`}
            >
              <span className="text-muted-foreground text-[11px] uppercase tracking-wide">
                {label}
              </span>
              <span className="text-base font-semibold tabular-nums">
                {line.total}
                {unit}
              </span>
              <span className="text-muted-foreground text-[11px] tabular-nums">
                {line.target === null
                  ? t("rollupNoTarget")
                  : t("rollupOfTarget", { target: `${line.target}${unit}` })}
              </span>
              <MealRollupDelta line={line} metric={metric} unit={unit} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * La única línea que puede MENTIR, así que es la que más se calla.
 *
 * Tres estados y ninguno es "0": "faltan X", "X de más", y "cierra" cuando la diferencia
 * está adentro de la tolerancia. Cuando el total está incompleto no se dice nada del
 * objetivo — se dice CUÁNTAS comidas faltan cargar, que es lo accionable.
 */
function MealRollupDelta({
  line,
  metric,
  unit,
}: {
  line: MacroRollupLine;
  metric: "kcal" | "grams";
  unit: string;
}) {
  const t = useTranslations("clients.detail.nutrition");

  if (line.mealsMissing > 0) {
    return (
      <span className="text-muted-foreground text-[11px]">
        {t("rollupPartial", {
          missing: line.mealsMissing,
          total: line.mealsCounted + line.mealsMissing,
        })}
      </span>
    );
  }
  if (line.delta === null) return null;
  if (!rollupDeltaIsWorthShowing(line, metric)) {
    return <span className="text-[11px] font-medium text-success">{t("rollupOnTarget")}</span>;
  }
  return (
    <span className="text-chart-4 text-[11px] font-medium tabular-nums">
      {line.delta > 0
        ? t("rollupOver", { diff: `${line.delta}${unit}` })
        : t("rollupUnder", { diff: `${Math.abs(line.delta)}${unit}` })}
    </span>
  );
}

/**
 * "Los macros suman ≈1930 kcal" — and, when it disagrees with the typed calorie line by
 * more than the tolerance, by how much (#949).
 *
 * It never rewrites the coach's `kcal` field and never blocks the save. The 4/4/9 factors
 * are a convention, and a coach may legitimately prescribe a mismatch; what they should
 * not do is ship one they did not notice.
 */
export function MacroKcalHint({
  kcal,
  proteinG,
  carbsG,
  fatG,
  testId,
}: {
  kcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  testId: string;
}) {
  const t = useTranslations("clients.detail.nutrition");
  const estimate = estimateKcalFromMacros({
    proteinG: numberOrNull(proteinG),
    carbsG: numberOrNull(carbsG),
    fatG: numberOrNull(fatG),
  });
  if (!estimate) return null;
  const mismatch = macroKcalMismatch(numberOrNull(kcal), estimate);

  return (
    <p className="text-muted-foreground text-xs" data-testid={testId}>
      {estimate.isPartial
        ? t("macroKcalEstimatePartial", { kcal: estimate.kcal })
        : t("macroKcalEstimate", { kcal: estimate.kcal })}
      {mismatch !== null ? (
        <span className="text-chart-4 ml-1 font-medium" data-testid={`${testId}-mismatch`}>
          {mismatch > 0
            ? t("macroKcalOver", { diff: mismatch })
            : t("macroKcalUnder", { diff: Math.abs(mismatch) })}
        </span>
      ) : null}
    </p>
  );
}

/** One radio in the edit-scope card. A plain input — this is two choices, not a form. */
export function ScopeOption({
  checked,
  onSelect,
  label,
  help,
  testId,
}: {
  checked: boolean;
  onSelect: () => void;
  label: string;
  help: string;
  testId: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3">
      <input
        type="radio"
        name="nutrition-edit-scope"
        className="mt-0.5"
        checked={checked}
        onChange={onSelect}
        data-testid={testId}
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-muted-foreground text-xs">{help}</span>
      </span>
    </label>
  );
}

/**
 * What this assign will do to the phases that already exist.
 *
 * Rendered even when there is nothing to do ("no se solapa con ninguna fase"), because the
 * absence of a warning is ambiguous: it reads the same as a warning that failed to load.
 */
export function OverlapNotice({ notices }: { notices: NutritionOverlapNotice[] | null }) {
  const t = useTranslations("clients.detail.nutrition");
  if (notices === null) return null;

  if (notices.length === 0) {
    return (
      <p className="text-muted-foreground text-xs" data-testid="nutrition-overlap-none">
        {t("overlapNone")}
      </p>
    );
  }

  return (
    <div
      className="rounded-lg border border-warning/40 bg-warning/10 p-3"
      data-testid="nutrition-overlap-notice"
    >
      <p className="text-sm font-medium">{t("overlapTitle")}</p>
      <ul className="mt-1 flex flex-col gap-0.5 text-sm">
        {notices.map((notice) => (
          <li key={notice.planId}>
            {notice.kind === "trim"
              ? t("overlapTrim", { name: notice.planName, date: notice.date ?? "" })
              : notice.kind === "deferStart"
                ? t("overlapDefer", { name: notice.planName, date: notice.date ?? "" })
                : t("overlapSupersede", { name: notice.planName })}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-1 text-xs">{t("overlapWhy")}</p>
    </div>
  );
}
