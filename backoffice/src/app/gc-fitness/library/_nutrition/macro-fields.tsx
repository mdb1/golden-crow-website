"use client";

// macro-fields.tsx
//
// The four macro inputs, shared by the meal dialog and the template dialog (#918).
//
// ⚠️ THE FIELDS ARE STRINGS, AND THAT IS THE POINT. A blank field means "no target", NOT
// zero: a zero is a statement the coach never made, and every surface renders a missing
// macro as "—". Holding them as `number` would force a decision on every keystroke and turn
// a half-typed "2." into a cleared field.

import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  estimateKcalFromMacros,
  macroKcalMismatch,
} from "@/lib/gc-fitness/nutrition-macro-math";

export interface MacroDraft {
  kcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
}

export const EMPTY_MACROS: MacroDraft = {
  kcal: "",
  proteinG: "",
  carbsG: "",
  fatG: "",
};

/** Wire macros → form strings. A missing or null field becomes "", never "0". */
export function toMacroDraft(
  targets:
    | {
        kcal?: number | null;
        proteinG?: number | null;
        carbsG?: number | null;
        fatG?: number | null;
      }
    | null
    | undefined,
): MacroDraft {
  const text = (raw: number | null | undefined) => (raw == null ? "" : String(raw));
  return {
    kcal: text(targets?.kcal),
    proteinG: text(targets?.proteinG),
    carbsG: text(targets?.carbsG),
    fatG: text(targets?.fatG),
  };
}

/**
 * Blank → `null`, so an unset macro stays unset instead of becoming a zero target.
 *
 * The comma is accepted as a decimal separator: a Spanish-locale keyboard offers it, and a
 * field that silently drops what the keyboard produced reads as broken.
 */
export function numberOrNull(raw: string): number | null {
  const trimmed = raw.replace(",", ".").trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function MacroFields({
  legend,
  help,
  value,
  onChange,
  testIdPrefix,
}: {
  legend: string;
  help?: string;
  value: MacroDraft;
  onChange: (next: MacroDraft) => void;
  testIdPrefix: string;
}) {
  const field = (key: keyof MacroDraft, label: string) => (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        inputMode="decimal"
        value={value[key]}
        onChange={(event) => onChange({ ...value, [key]: event.target.value })}
        placeholder="—"
        data-testid={`${testIdPrefix}-${key}`}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      <Label>{legend}</Label>
      <div className="grid grid-cols-4 gap-2">
        {/* #949 — the three macro boxes say GRAMS. Unlabelled, they are as readable as
            percentages, and a coach who guesses percentages ships a plan asking for
            40 g of carbs. */}
        {field("kcal", "kcal")}
        {field("proteinG", "P (g)")}
        {field("carbsG", "C (g)")}
        {field("fatG", "G (g)")}
      </div>
      <MacroKcalHint value={value} testId={`${testIdPrefix}-kcal-hint`} />
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
    </div>
  );
}

/**
 * "Los macros suman ≈1930 kcal" (#949) — the same hint the assign form prints, from the
 * same pure helper, so a plan built in the library and one typed for a client cannot
 * disagree about what 90/280/50 adds up to.
 */
function MacroKcalHint({ value, testId }: { value: MacroDraft; testId: string }) {
  const t = useTranslations("clients.detail.nutrition");
  const estimate = estimateKcalFromMacros({
    proteinG: numberOrNull(value.proteinG),
    carbsG: numberOrNull(value.carbsG),
    fatG: numberOrNull(value.fatG),
  });
  if (!estimate) return null;
  const mismatch = macroKcalMismatch(numberOrNull(value.kcal), estimate);

  return (
    <p className="text-xs text-muted-foreground" data-testid={testId}>
      {estimate.isPartial
        ? t("macroKcalEstimatePartial", { kcal: estimate.kcal })
        : t("macroKcalEstimate", { kcal: estimate.kcal })}
      {mismatch !== null ? (
        <span className="ml-1 font-medium text-chart-4">
          {mismatch > 0
            ? t("macroKcalOver", { diff: mismatch })
            : t("macroKcalUnder", { diff: Math.abs(mismatch) })}
        </span>
      ) : null}
    </p>
  );
}
