// Nutrition card of the admin's read-only client drill-downs.
//
// Shared by `/admin/coaches/{coachId}/clients/{clientId}` and
// `/admin/coach-less-users/{uid}`. It lived inline in the first one only, so the
// coach-less profile never showed nutrition at all — not even for a user who wrote
// their own plan in the app (#1133). One component, so the two pages can't drift
// again.
//
// The numbers come from `listClientNutritionForAdmin`, the same roster loader the
// coach's roster column and client profile use, so the surfaces cannot print
// different adherence figures for the same week.

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminClientNutrition } from "@/lib/gc-fitness/admin-actions";

export function AdminNutritionCard({
  nutrition,
}: {
  /** `null` when the loader failed — the card says so instead of claiming "no plan". */
  nutrition: AdminClientNutrition | null;
}) {
  const t = useTranslations("admin.nutrition");
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-xl">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {nutrition === null ? (
          <p className="text-sm text-muted-foreground">{t("loadFailed")}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              {nutrition.hasActivePlan ? (
                <Badge variant="success">{t("activePhase")}</Badge>
              ) : nutrition.neverHadPlan ? (
                <Badge variant="secondary">{t("noPlanYet")}</Badge>
              ) : (
                /* The state this card exists for: they HAD a phase and nobody loaded the
                   next one. Invisible on every other column. */
                <Badge variant="destructive">{t("noActivePhase")}</Badge>
              )}
              {nutrition.activePlanName ? (
                <span className="text-sm">{nutrition.activePlanName}</span>
              ) : null}
              {nutrition.activePlanEndsOn ? (
                <span className="text-xs text-muted-foreground">
                  {t("ends", { date: nutrition.activePlanEndsOn })}
                </span>
              ) : null}
              <span className="text-sm text-muted-foreground">
                {/* `null` is NOT 0. Null means nobody asked anything of this client in the
                    window; zero means they were asked and did not comply. Printing the first
                    as "0%" sends an operator to have the wrong conversation. */}
                {t("adherence")}{" "}
                {nutrition.percent7d === null ? (
                  <span title={t("notApplicableTitle")}>{t("notApplicable")}</span>
                ) : (
                  `${nutrition.percent7d}%`
                )}
              </span>
            </div>

            {nutrition.phases.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noPhases")}</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("phase")}</TableHead>
                      <TableHead>{t("by")}</TableHead>
                      <TableHead>{t("starts")}</TableHead>
                      <TableHead>{t("endsColumn")}</TableHead>
                      <TableHead>{t("status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nutrition.phases.map((phase) => (
                      <TableRow key={phase.id}>
                        <TableCell>{phase.name || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {phase.source === "self" ? t("bySelf") : t("byCoach")}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {phase.startsOn}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {/* Open-ended is a real, intentional shape — not missing data. */}
                          {phase.endsOn ?? t("openEnded")}
                        </TableCell>
                        <TableCell>
                          {phase.deleted ? (
                            <Badge variant="secondary">{t("deleted")}</Badge>
                          ) : phase.ended ? (
                            <Badge variant="secondary">{t("ended")}</Badge>
                          ) : (
                            <Badge variant="success">{t("active")}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
