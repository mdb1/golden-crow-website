"use client";

// NutritionPatterns.tsx — "Por qué falla" + "Más números": the per-meal analysis the client
// already sees in the app ("Ver mis números", gc-fitness#1148), now on the coach's side.
//
// Both halves come from triple-twinned pure functions computed on the server from the plans
// and logs the page ALREADY loaded — zero extra reads:
//   • `analyzeNutritionExcuses` (twin of iOS/Android `NutritionExcuseAnalyzer`)
//   • `nutritionHighlights` (twin of `NutritionWeekHeatmapBuilder.highlights`)
// so the coach and the client read the same history as the same sentence. This file only
// paints; it never counts.

import { useLocale, useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { localizedNamePair } from "@/lib/gc-fitness/localized-name";
import {
  MIN_FAILURES,
  nutritionFailureSlotId,
  type NutritionExcuseInsights,
  type NutritionExcuseReason,
  type NutritionFailureSlot,
} from "@/lib/gc-fitness/nutrition-excuses";
import type { NutritionHighlights } from "@/lib/gc-fitness/nutrition-highlights";

export interface NutritionPatternsProps {
  excuses: NutritionExcuseInsights;
  highlights: NutritionHighlights;
  rangeDays: number;
}

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function NutritionPatterns({ excuses, highlights, rangeDays }: NutritionPatternsProps) {
  const t = useTranslations("clients.detail.nutrition");
  const locale = useLocale();

  const mealName = (slot: NutritionFailureSlot) =>
    localizedNamePair(slot.name, locale).primary || slot.mealId;
  const weekdayName = (index: number) => t(`patternsWeekday.${WEEKDAY_KEYS[index] ?? "mon"}`);
  const reasonText = (reason: NutritionExcuseReason) => reason.text ?? t("patternsNoReason");
  const headline = excuses.byMealWeekday[0] ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2" data-testid="nutrition-patterns">
        <CardHeader>
          <CardTitle>{t("patternsTitle")}</CardTitle>
          <p className="text-muted-foreground text-sm">{t("patternsSubtitle", { days: rangeDays })}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {!excuses.hasEnoughData ? (
            <p className="text-muted-foreground text-sm" data-testid="nutrition-patterns-empty">
              {t("patternsNotEnough", { min: MIN_FAILURES })}
            </p>
          ) : (
            <>
              {headline && (
                <p className="text-base font-medium" data-testid="nutrition-patterns-headline">
                  {t("patternsHeadline", {
                    meal: mealName(headline),
                    weekday: weekdayName(headline.weekday ?? 0),
                    failures: headline.failures,
                    expected: headline.expected,
                    percent: headline.percent,
                  })}
                </p>
              )}

              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">{t("patternsReasonsTitle")}</h3>
                <ul className="flex flex-col gap-2">
                  {excuses.reasons.map((reason, rank) => (
                    <li
                      key={reason.key || "∅"}
                      data-testid={`nutrition-patterns-reason-${rank}`}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1"
                    >
                      <span className={`truncate text-sm ${reason.text === null ? "text-muted-foreground italic" : ""}`}>
                        {reasonText(reason)}
                      </span>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {t("patternsReasonValue", {
                          count: reason.count,
                          total: excuses.totalFailures,
                          percent: reason.percent,
                        })}
                      </span>
                      <span className="bg-muted col-span-2 h-1.5 overflow-hidden rounded-full">
                        <span
                          className="bg-destructive/70 block h-full rounded-full"
                          style={{ width: `${reason.percent}%` }}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              {excuses.byMealWeekday.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">{t("patternsByWeekdayTitle")}</h3>
                  <ul className="flex flex-col gap-2">
                    {excuses.byMealWeekday.map((slot) => (
                      <SlotRow
                        key={nutritionFailureSlotId(slot)}
                        testId={`nutrition-patterns-slot-${nutritionFailureSlotId(slot)}`}
                        title={t("patternsWeekdaySlot", {
                          meal: mealName(slot),
                          weekday: weekdayName(slot.weekday ?? 0),
                        })}
                        value={t("patternsSlotValue", {
                          failures: slot.failures,
                          expected: slot.expected,
                          percent: slot.percent,
                        })}
                        reasons={slot.reasons.map(reasonText)}
                      />
                    ))}
                  </ul>
                </section>
              )}

              {excuses.byMeal.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">{t("patternsByMealTitle")}</h3>
                  <ul className="flex flex-col gap-2">
                    {excuses.byMeal.map((slot) => (
                      <SlotRow
                        key={slot.mealId}
                        testId={`nutrition-patterns-meal-${slot.mealId}`}
                        title={mealName(slot)}
                        value={t("patternsSlotValue", {
                          failures: slot.failures,
                          expected: slot.expected,
                          percent: slot.percent,
                        })}
                        reasons={slot.reasons.map(reasonText)}
                      />
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card data-testid="nutrition-highlights">
        <CardHeader>
          <CardTitle>{t("highlightsTitle")}</CardTitle>
          <p className="text-muted-foreground text-sm">{t("patternsSubtitleShort", { days: rangeDays })}</p>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-3">
            <Highlight
              label={t("highlightsPerfectDays")}
              value={t("highlightsOf", { count: highlights.perfectDays, total: highlights.daysWithPlan })}
              testId="nutrition-highlight-perfect-days"
            />
            <Highlight
              label={t("highlightsBestStreak")}
              value={String(highlights.bestStreak)}
              testId="nutrition-highlight-best-streak"
            />
            <Highlight
              label={t("highlightsLogged")}
              value={highlights.loggedPercent === null ? "—" : `${highlights.loggedPercent}%`}
              testId="nutrition-highlight-logged"
            />
            <Highlight
              label={t("highlightsBestDay")}
              value={
                highlights.bestWeekday === null
                  ? "—"
                  : `${weekdayName(highlights.bestWeekday)} · ${highlights.bestWeekdayPercent}%`
              }
              testId="nutrition-highlight-best-day"
            />
            <Highlight
              label={t("highlightsWorstDay")}
              value={
                highlights.worstWeekday === null
                  ? "—"
                  : `${weekdayName(highlights.worstWeekday)} · ${highlights.worstWeekdayPercent}%`
              }
              testId="nutrition-highlight-worst-day"
            />
          </dl>
          <p className="text-muted-foreground mt-4 text-xs">{t("highlightsFooter")}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function SlotRow({
  title,
  value,
  reasons,
  testId,
}: {
  title: string;
  value: string;
  reasons: string[];
  testId: string;
}) {
  return (
    <li data-testid={testId} className="rounded-lg border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-muted-foreground text-xs tabular-nums">{value}</span>
      </div>
      {reasons.length > 0 && <p className="text-muted-foreground mt-1 text-xs">{reasons.join(" · ")}</p>}
    </li>
  );
}

function Highlight({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3" data-testid={testId}>
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
