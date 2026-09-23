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
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-xl">Nutrition</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {nutrition === null ? (
          <p className="text-sm text-muted-foreground">Couldn&apos;t load nutrition.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              {nutrition.hasActivePlan ? (
                <Badge variant="success">active phase</Badge>
              ) : nutrition.neverHadPlan ? (
                <Badge variant="secondary">no plan yet</Badge>
              ) : (
                /* The state this card exists for: they HAD a phase and nobody loaded the
                   next one. Invisible on every other column. */
                <Badge variant="destructive">no active phase</Badge>
              )}
              {nutrition.activePlanName ? (
                <span className="text-sm">{nutrition.activePlanName}</span>
              ) : null}
              {nutrition.activePlanEndsOn ? (
                <span className="text-xs text-muted-foreground">
                  ends {nutrition.activePlanEndsOn}
                </span>
              ) : null}
              <span className="text-sm text-muted-foreground">
                {/* `null` is NOT 0. Null means nobody asked anything of this client in the
                    window; zero means they were asked and did not comply. Printing the first
                    as "0%" sends an operator to have the wrong conversation. */}
                7-day adherence:{" "}
                {nutrition.percent7d === null ? (
                  <span title="Nothing was asked in the last 7 days">n/a</span>
                ) : (
                  `${nutrition.percent7d}%`
                )}
              </span>
            </div>

            {nutrition.phases.length === 0 ? (
              <p className="text-sm text-muted-foreground">No nutrition phases yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Phase</TableHead>
                      <TableHead>By</TableHead>
                      <TableHead>Starts</TableHead>
                      <TableHead>Ends</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nutrition.phases.map((phase) => (
                      <TableRow key={phase.id}>
                        <TableCell>{phase.name || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {phase.source === "self" ? "client (self)" : "coach"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {phase.startsOn}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {/* Open-ended is a real, intentional shape — not missing data. */}
                          {phase.endsOn ?? "open-ended"}
                        </TableCell>
                        <TableCell>
                          {phase.deleted ? (
                            <Badge variant="secondary">deleted</Badge>
                          ) : phase.ended ? (
                            <Badge variant="secondary">ended</Badge>
                          ) : (
                            <Badge variant="success">active</Badge>
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
