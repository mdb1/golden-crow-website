// CoachActivityLogTable — #541: the real `coach_activity` log (every coach action the
// backoffice and the functions record: assignments, habits, nutrition, notes, photo and
// weight requests, clients added, edited rests…). Presentational; mounted in tests.

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminCoachActivityLogRow } from "@/lib/gc-fitness/admin-coach-activity-model";
import type { CoachActivityLogKind } from "@/lib/gc-fitness/coach-activity-log";

import { instantLabel, langOf } from "../../coaches/[uid]/_components/overview-format";

export function CoachActivityLogTable({ rows, timezone }: { rows: AdminCoachActivityLogRow[]; timezone: string }) {
  const t = useTranslations("admin.coachActivity.log");
  const lang = langOf(useLocale());
  // Literal keys (checked by i18n-literal-keys.test).
  const kindLabel: Record<CoachActivityLogKind, string> = {
    workout_template: t("kinds.workout_template"),
    exercise: t("kinds.exercise"),
    workout_assignment: t("kinds.workout_assignment"),
    workout_rest_edited: t("kinds.workout_rest_edited"),
    habit_assignment: t("kinds.habit_assignment"),
    note: t("kinds.note"),
    progress_photo_request: t("kinds.progress_photo_request"),
    weight_request: t("kinds.weight_request"),
    client_added: t("kinds.client_added"),
    nutrition_plan: t("kinds.nutrition_plan"),
    nutrition_library: t("kinds.nutrition_library"),
  };
  return (
    <div className="overflow-x-auto">
      <Table data-testid="coach-activity-log">
        <TableHeader>
          <TableRow>
            <TableHead>{t("col.when")}</TableHead>
            <TableHead>{t("col.coach")}</TableHead>
            <TableHead>{t("col.kind")}</TableHead>
            <TableHead>{t("col.what")}</TableHead>
            <TableHead>{t("col.client")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-sm text-muted-foreground">
                {t("empty")}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.id} data-testid={`coach-activity-log-${r.id}`}>
                <TableCell className="whitespace-nowrap text-xs">
                  {instantLabel(lang, r.occurredAtISO, timezone, true)}
                </TableCell>
                <TableCell>
                  <Link href={`/gc-fitness/admin/coaches/${r.trainerId}`} className="font-medium text-primary hover:underline">
                    {r.coachName ?? r.trainerId}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{r.kind ? kindLabel[r.kind] : r.rawKind}</Badge>{" "}
                  {r.deleted ? <Badge variant="destructive">{t("deleted")}</Badge> : null}
                </TableCell>
                <TableCell className="text-sm">
                  <div>{r.title}</div>
                  {r.detail ? <div className="text-xs text-muted-foreground">{r.detail}</div> : null}
                </TableCell>
                <TableCell className="text-sm">
                  {r.clientId ? (
                    <Link
                      href={`/gc-fitness/admin/coaches/${r.trainerId}/clients/${r.clientId}`}
                      className="text-primary hover:underline"
                    >
                      {r.clientName ?? r.clientId}
                    </Link>
                  ) : r.pendingEmail ? (
                    <span className="text-muted-foreground">{r.pendingEmail}</span>
                  ) : r.groupCount > 1 ? (
                    <span className="text-muted-foreground">{t("group", { count: r.groupCount })}</span>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
