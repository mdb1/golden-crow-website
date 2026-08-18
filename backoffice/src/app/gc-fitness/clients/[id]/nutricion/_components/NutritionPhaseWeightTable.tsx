// NutritionPhaseWeightTable.tsx — the table under the weight chart (#919).
//
// The question a coach actually asks is *¿este plan le está funcionando?*, and answering
// it needs three facts side by side that live in three different collections: what was
// asked (kcal), whether it was followed (adherencia), and what the body did (Δ peso).
// Any two of them mislead on their own — weight dropping on 40% adherence is not evidence
// the plan works, it is evidence the client is eating something else entirely.
//
// Δ/semana is computed over the days BETWEEN THE TWO WEIGH-INS, not over the phase
// length: a 30-day phase whose only two weigh-ins are three days apart moved that weight
// in three days, and dividing by 30 would print a rate the client never had.
//
// Two "—" that do NOT mean the same thing, which is why they carry a title:
//   · "Faltan pesajes"  — fewer than two weigh-ins in the phase; nothing to subtract.
//   · adherencia "desde X" — the phase started before the loaded window, so the number
//     covers part of it. Real number, shorter range.

import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCivilDateLabel } from "@/lib/gc-fitness/civil-date";
import { localizedNamePair } from "@/lib/gc-fitness/localized-name";
import type { NutritionPhaseRow } from "@/lib/gc-fitness/nutrition-compliance";

export interface NutritionPhaseWeightTableProps {
  rows: NutritionPhaseRow[];
  locale: string;
}

export async function NutritionPhaseWeightTable({
  rows,
  locale,
}: NutritionPhaseWeightTableProps) {
  const t = await getTranslations("clients.detail.nutrition");

  return (
    <Card data-testid="nutrition-phase-weight-table">
      <CardHeader>
        <CardTitle className="text-base">{t("weightVsPhase")}</CardTitle>
        <p className="text-muted-foreground text-xs">{t("weightVsPhaseHelp")}</p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-4 text-sm">{t("phaseEmpty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-xs">
                  <th scope="col" className="py-2 pr-3 text-left font-medium">
                    {t("phaseColumn")}
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    {t("phaseKcal")}
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    {t("phaseAdherence")}
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    {t("phaseWeightDelta")}
                  </th>
                  <th scope="col" className="py-2 pl-2 text-right font-medium">
                    {t("phaseWeightRate")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const name = localizedNamePair(row.name, locale).primary || row.planId;
                  const from = formatCivilDateLabel(
                    row.startsOn,
                    { day: "numeric", month: "short" },
                    locale,
                  );
                  const to = row.endsOn
                    ? formatCivilDateLabel(row.endsOn, { day: "numeric", month: "short" }, locale)
                    : t("openEnded");
                  return (
                    <tr
                      key={row.planId}
                      data-testid="nutrition-phase-row"
                      className={row.isActive ? "bg-primary/5 border-b" : "border-b"}
                    >
                      <th scope="row" className="py-2 pr-3 text-left font-normal">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-medium">{name}</span>
                          {row.isActive ? (
                            <Badge variant="default" className="text-[0.7rem]">
                              {t("stateCurrent")}
                            </Badge>
                          ) : null}
                          {row.isSelfAuthored ? (
                            <Badge variant="outline" className="text-[0.7rem]">
                              {t("selfAuthored")}
                            </Badge>
                          ) : null}
                        </span>
                        <span className="text-muted-foreground block text-xs tabular-nums">
                          {from} → {to}
                        </span>
                      </th>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {row.kcalTarget === null ? t("noMacro") : `${row.kcalTarget}`}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {row.adherence.isEmpty ? (
                          t("noMacro")
                        ) : (
                          <>
                            {row.adherence.percent}%
                            {row.adherenceIsPartial ? (
                              <span className="text-muted-foreground block text-[0.7rem]">
                                {t("phasePartialFrom", {
                                  date: formatCivilDateLabel(
                                    row.adherenceFrom,
                                    { day: "numeric", month: "short" },
                                    locale,
                                  ),
                                })}
                              </span>
                            ) : null}
                          </>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {row.deltaKg === null ? (
                          <span title={t("phaseNoWeight")}>{t("noMacro")}</span>
                        ) : (
                          `${row.deltaKg > 0 ? "+" : ""}${row.deltaKg} ${t("kg")}`
                        )}
                      </td>
                      <td className="py-2 pl-2 text-right tabular-nums">
                        {row.deltaKgPerWeek === null
                          ? t("noMacro")
                          : `${row.deltaKgPerWeek > 0 ? "+" : ""}${row.deltaKgPerWeek} ${t("kg")}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
