"use client";

// NutritionComplianceGrid.tsx — the weekly grid (#919): rows are meals, columns are days.
//
// Why a grid and not a bigger percentage: "78% de adherencia" tells a coach nothing they
// can act on. The grid shows the PATTERN — that dinner collapses on weekends and
// breakfast never fails — and that is a plan mis-set at dinner, not an undisciplined
// client. It is the difference between a number and a conversation.
//
// The weeks arrive PRE-COMPUTED from the server (`buildNutritionWeekGrid`), so switching
// weeks is instant and costs no Firestore read. This component only draws: it never
// counts cells to produce a percentage, because the percentage next to them comes from
// the adherence twin and two counts of one fact drift (#173).
//
// The cells are NOT interactive. `missed` and `unmarked` are drawn differently on purpose:
// one is the client declaring a failure, the other is silence. Both hurt the number, only
// one is information — and colour alone never carries that, so every cell also has a
// glyph and a screen-reader sentence.

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCivilDateLabel } from "@/lib/gc-fitness/civil-date";
import { localizedNamePair } from "@/lib/gc-fitness/localized-name";
import type {
  NutritionCellState,
  NutritionGridCell,
  NutritionWeekGrid,
} from "@/lib/gc-fitness/nutrition-compliance";

export interface NutritionComplianceGridProps {
  /** Oldest → newest. The LAST one is the current week and opens selected. */
  weeks: NutritionWeekGrid[];
}

/**
 * Glyph + colour per state. The glyph is what makes the grid readable in greyscale, for a
 * colour-blind coach, and in a screenshot pasted into a chat — which is how these get
 * shared.
 */
const CELL_STYLE: Record<NutritionCellState, { glyph: string; className: string }> = {
  done: { glyph: "✓", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  different: { glyph: "≈", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  missed: { glyph: "✕", className: "bg-rose-500/15 text-rose-700 dark:text-rose-400" },
  unmarked: { glyph: "·", className: "bg-muted text-muted-foreground" },
  future: { glyph: "", className: "bg-transparent text-muted-foreground/40" },
  noPlan: { glyph: "", className: "bg-transparent text-muted-foreground/40" },
};

const CELL_LABEL_KEY: Record<NutritionCellState, string> = {
  done: "cellDone",
  different: "cellDifferent",
  missed: "cellMissed",
  unmarked: "cellUnmarked",
  future: "cellFuture",
  noPlan: "cellNoPlan",
};

export function NutritionComplianceGrid({ weeks }: NutritionComplianceGridProps) {
  const t = useTranslations("clients.detail.nutrition");
  const locale = useLocale();
  const [index, setIndex] = useState(Math.max(weeks.length - 1, 0));

  const week = weeks[index];
  if (!week) return null;

  const isCurrentWeek = index === weeks.length - 1;

  const cellFor = (cell: NutritionGridCell, mealName: string) => {
    const style = CELL_STYLE[cell.state];
    const label = t(CELL_LABEL_KEY[cell.state], {
      meal: mealName,
      date: formatCivilDateLabel(cell.civilDate, { month: "short", day: "numeric" }, locale),
    });
    return (
      <td key={cell.civilDate} className="p-0.5">
        <div
          data-testid={`nutrition-cell-${cell.state}`}
          className={`flex h-8 items-center justify-center rounded text-sm font-semibold ${style.className}`}
        >
          <span aria-hidden>{style.glyph}</span>
          {/* The state has to survive without colour: this is what a screen reader reads,
              and what a coach hears when the cell is just a pale square. */}
          <span className="sr-only">{label}</span>
          {cell.hasNote ? (
            <span aria-hidden className="ml-0.5 text-[0.6rem] leading-none opacity-70">
              •
            </span>
          ) : null}
        </div>
      </td>
    );
  };

  return (
    <Card data-testid="nutrition-compliance-grid">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">{t("compliance")}</CardTitle>
          <p className="text-muted-foreground mt-1 text-xs">{t("complianceHelp")}</p>
        </div>
        <div className="flex items-center gap-2">
          {!week.isEmpty ? (
            <Badge variant="secondary" className="tabular-nums">
              {week.breakdown.percent}%
            </Badge>
          ) : null}
          <Button
            variant="outline"
            size="icon"
            aria-label={t("previousWeek")}
            disabled={index === 0}
            onClick={() => setIndex((value) => Math.max(value - 1, 0))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm font-medium tabular-nums" data-testid="nutrition-week-label">
            {isCurrentWeek
              ? t("thisWeek")
              : t("weekOf", {
                  date: formatCivilDateLabel(
                    week.weekStart,
                    { month: "short", day: "numeric" },
                    locale,
                  ),
                })}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label={t("nextWeek")}
            disabled={isCurrentWeek}
            onClick={() => setIndex((value) => Math.min(value + 1, weeks.length - 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {week.isEmpty ? (
          // NOT "0%". A week with no phase in force is a coach who did not assign one, and
          // printing a zero would read as a client who is failing.
          <div data-testid="nutrition-week-empty" className="py-6">
            <p className="text-sm">{t("emptyWeek")}</p>
            <p className="text-muted-foreground mt-1 text-xs">{t("emptyWeekHelp")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th scope="col" className="text-muted-foreground pb-2 text-left text-xs font-medium">
                    {t("mealColumn")}
                  </th>
                  {week.days.map((day) => (
                    <th
                      key={day}
                      scope="col"
                      className="text-muted-foreground w-10 pb-2 text-center text-xs font-medium"
                    >
                      <span className="block">
                        {formatCivilDateLabel(day, { weekday: "narrow" }, locale)}
                      </span>
                      <span className="block tabular-nums opacity-70">
                        {formatCivilDateLabel(day, { day: "numeric" }, locale)}
                      </span>
                    </th>
                  ))}
                  <th scope="col" className="text-muted-foreground w-12 pb-2 text-right text-xs font-medium">
                    %
                  </th>
                </tr>
              </thead>
              <tbody>
                {week.rows.map((row) => {
                  // Coach-language-first, like every other bilingual list in the portal.
                  const mealName =
                    localizedNamePair(row.name, locale).primary || row.mealId;
                  return (
                    <tr key={row.mealId}>
                      <th
                        scope="row"
                        className="max-w-[10rem] truncate pr-3 text-left text-sm font-normal"
                      >
                        {mealName}
                      </th>
                      {row.cells.map((cell) => cellFor(cell, mealName))}
                      <td className="text-muted-foreground pl-2 text-right text-xs tabular-nums">
                        {row.breakdown.isEmpty ? "—" : `${row.breakdown.percent}%`}
                      </td>
                    </tr>
                  );
                })}
                <tr data-testid="nutrition-day-row">
                  <th scope="row" className="pr-3 pt-1 text-left text-sm font-semibold">
                    {t("dayRow")}
                  </th>
                  {week.dayRow.map((cell) => cellFor(cell, t("dayRow")))}
                  <td className="pl-2 pt-1 text-right text-xs font-semibold tabular-nums">
                    {week.breakdown.percent}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <ul className="text-muted-foreground mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {(["done", "different", "missed", "unmarked", "noPlan"] as const).map((state) => (
            <li key={state} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={`inline-flex size-4 items-center justify-center rounded text-[0.65rem] font-semibold ${CELL_STYLE[state].className}`}
              >
                {CELL_STYLE[state].glyph}
              </span>
              {t(
                state === "done"
                  ? "legendDone"
                  : state === "different"
                    ? "legendDifferent"
                    : state === "missed"
                      ? "legendMissed"
                      : state === "unmarked"
                        ? "legendUnmarked"
                        : "legendNoPlan",
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
