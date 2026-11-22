import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/gc-fitness/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { listRecentCoachActivity, type CoachActivityRow } from "@/lib/gc-fitness/admin-actions";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";
import { listCoachOptionsForAdmin } from "@/lib/gc-fitness/admin-actions";
import { listCoachActivityLogForAdmin } from "@/lib/gc-fitness/admin-coach-activity-reader";
import { getTrainerTimezone } from "@/lib/gc-fitness/trainer-timezone";
import { CoachActivityLogTable } from "./_components/CoachActivityLogTable";

// Tab title: "Corvo - <adminPanel>" (issue #170).
export const generateMetadata = () => sectionMetadata("adminPanel");

export const dynamic = "force-dynamic";

export default async function CoachActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    await getCurrentAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/forbidden");
    }
    throw err;
  }

  const sp = await searchParams;
  const coachFilter = typeof sp.coach === "string" && sp.coach.trim() ? sp.coach.trim() : null;
  // #541 — the real `coach_activity` log first; the reconstructed stream (which also has
  // client first logins) stays below it. Each fails soft on its own.
  const [rows, logRows, coaches, timezone] = await Promise.all([
    listRecentCoachActivity(160),
    listCoachActivityLogForAdmin({ coachUid: coachFilter, limit: 150 }).catch(() => null),
    listCoachOptionsForAdmin().catch(() => []),
    getTrainerTimezone(),
  ]);
  const t = await getTranslations("admin.coachActivity");
  const tc = await getTranslations("admin.common");
  // #513 — the row's `summary` is an English sentence built in lib/; the page
  // renders it from the row's kind + subject in the viewer's language instead.
  const summaryFor = (row: CoachActivityRow): string => {
    const name = row.subject ?? "";
    switch (row.kind) {
      case "habit_assigned":
        return name ? t("summary.habitAssignedNamed", { name }) : t("summary.habitAssigned");
      case "workout_template_created":
        return name
          ? t("summary.templateCreatedNamed", { name })
          : t("summary.templateCreated");
      case "workout_assigned":
        return name
          ? t("summary.workoutAssignedNamed", { name })
          : t("summary.workoutAssigned");
      case "client_pre_provisioned":
        return t("summary.clientPreProvisioned");
      case "client_first_login":
        return t("summary.clientFirstLogin");
      default:
        return row.summary;
    }
  };

  return (
    <div className="gc-page flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link href="/gc-fitness/admin">
              <ArrowLeft className="h-4 w-4" />
              {tc("backToAdmin")}
            </Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("log.title")}</CardTitle>
          <CardDescription>{t("log.description")}</CardDescription>
          <form method="get" className="flex flex-wrap items-center gap-2 pt-2">
            <select
              name="coach"
              defaultValue={coachFilter ?? ""}
              aria-label={t("log.filter")}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">{t("log.allCoaches")}</option>
              {coaches.map((c) => (
                <option key={c.uid} value={c.uid}>
                  {c.displayName || c.email}
                </option>
              ))}
            </select>
            <button type="submit" className="h-9 rounded-md border px-3 text-sm hover:bg-muted">
              {t("log.apply")}
            </button>
          </form>
        </CardHeader>
        <CardContent className="p-0">
          {logRows ? (
            <CoachActivityLogTable rows={logRows} timezone={timezone} />
          ) : (
            <p className="px-6 pb-6 text-sm text-muted-foreground">{t("log.unavailable")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("streamTitle")}</CardTitle>
          <CardDescription>{t("streamDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.when")}</TableHead>
                  <TableHead>{t("columns.coach")}</TableHead>
                  <TableHead>{t("columns.event")}</TableHead>
                  <TableHead>{t("columns.client")}</TableHead>
                  <TableHead>{t("columns.recurrence")}</TableHead>
                  <TableHead>{t("columns.occurrences")}</TableHead>
                  <TableHead>{t("columns.source")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell className="text-xs text-muted-foreground" colSpan={7}>
                      {t("empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.occurredAtISO ?? "—"}</TableCell>
                      <TableCell>
                        <Link
                          href={`/gc-fitness/admin/coaches/${row.coachUid}`}
                          className="font-medium underline underline-offset-2"
                        >
                          {row.coachName}
                        </Link>
                        <div className="text-xs text-muted-foreground">{row.coachEmail}</div>
                      </TableCell>
                      <TableCell>{summaryFor(row)}</TableCell>
                      <TableCell>
                        {row.clientUid || row.clientEmail ? (
                          <div className="space-y-0.5">
                            <div className="font-mono text-xs">{row.clientUid ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">{row.clientEmail ?? "—"}</div>
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.recurrenceLabel ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.occurrences ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.kind}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
