// /gc-fitness/admin/corvo — operator view of the AI Coach «Corvo» (gc-fitness #1330).
//
// Usage and cost come from the server's per-UTC-day aggregate `ai_coach_usage`
// (cost already estimated server-side; never re-priced here). Active users and
// near-quota users come from the per-user thread docs, acceptance from the
// proposals of the last 30 days, and the reports list from
// `ai_coach/{uid}/reports`. Conversations are readable ONLY from a report
// (reports/[uid]/[messageId]). Reader: `ai-coach-admin-actions.ts`; shaping:
// `ai-coach-admin-model.ts`.

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/gc-fitness/page-header";
import { loadCorvoDashboard, type CorvoDashboard, type Section } from "@/lib/gc-fitness/ai-coach-admin-actions";
import {
  AI_COACH_QUOTA,
  formatLatency,
  formatMicroUsd,
  formatPercent,
  usageChartPoints,
} from "@/lib/gc-fitness/ai-coach-admin-model";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";

import { CorvoAcceptanceTable, CorvoNearQuotaTable, CorvoReportsTable } from "./_components/CorvoTables";
import { CorvoUsageChart } from "./_components/CorvoUsageChart";

export const generateMetadata = () => sectionMetadata("adminPanel");

export const dynamic = "force-dynamic";

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums leading-tight">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

export default async function CorvoAdminPage() {
  try {
    await getCurrentAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") redirect("/gc-fitness/forbidden");
    throw err;
  }

  const t = await getTranslations("corvoAdmin");
  let dashboard: CorvoDashboard;
  try {
    dashboard = await loadCorvoDashboard();
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "Forbidden") redirect("/gc-fitness/forbidden");
    throw err;
  }

  function sectionBody<T>(s: Section<T>, render: (data: T) => ReactNode): ReactNode {
    if (!s.ok) {
      return <p className="px-6 py-4 text-sm text-destructive">{t("sectionError", { error: s.error })}</p>;
    }
    return render(s.data);
  }

  const usage = dashboard.usage.ok ? dashboard.usage.data : null;
  const summary = usage?.summary ?? null;
  const active = dashboard.activeUsers.ok ? dashboard.activeUsers.data : null;
  const dash = "—";

  return (
    <div className="gc-page flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link href="/gc-fitness/admin">
              <ArrowLeft className="h-4 w-4" />
              {t("back")}
            </Link>
          </Button>
        }
      />
      <p className="-mt-3 text-xs text-muted-foreground">
        {t("generatedAt", { time: dashboard.generatedAtISO.slice(0, 16).replace("T", " ") })}
      </p>

      {!dashboard.usage.ok ? (
        <p className="text-sm text-destructive">{t("sectionError", { error: dashboard.usage.error })}</p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("stats.turnsToday")} value={summary ? String(summary.today.turns) : dash} detail={summary ? `${t("stats.turns30d")}: ${summary.turns30d}` : undefined} />
        <Stat
          label={t("stats.activeUsers")}
          value={active ? String(active.last30d) : dash}
          detail={active ? t("stats.activeUsersDetail", { day: active.last24h, week: active.last7d }) : dashboard.activeUsers.ok ? undefined : dashboard.activeUsers.error}
        />
        <Stat
          label={t("stats.costToday")}
          value={summary ? formatMicroUsd(summary.costTodayMicroUsd) : dash}
          detail={summary ? `${t("stats.cost30d")}: ${formatMicroUsd(summary.cost30dMicroUsd)}` : undefined}
        />
        <Stat
          label={t("stats.cost30d")}
          value={summary ? formatMicroUsd(summary.cost30dMicroUsd) : dash}
          detail={summary && summary.avgCostPerTurnMicroUsd !== null ? t("stats.costPerTurn", { cost: formatMicroUsd(summary.avgCostPerTurnMicroUsd) }) : undefined}
        />
        <Stat label={t("stats.avgLatency")} value={summary ? formatLatency(summary.avgLatencyMs) : dash} detail={t("stats.avgLatencyHint")} />
        <Stat
          label={t("stats.errorRate")}
          value={summary ? formatPercent(summary.errorRate) : dash}
          detail={summary ? t("stats.errorRateDetail", { errors: summary.llmErrors30d }) : undefined}
        />
        <Stat label={t("stats.quotaRejections")} value={summary ? String(summary.quotaRejections30d) : dash} />
        <Stat
          label={t("stats.prescreenBlocked")}
          value={summary ? String(summary.prescreenBlocked30d) : dash}
          detail={summary ? `${t("stats.notEligible")}: ${summary.notEligible30d}` : undefined}
        />
        {/* gc-fitness #1347 — the coach's «Resumen de la semana (IA)», same day docs. */}
        <Stat
          label={t("stats.coachSummaries")}
          value={summary ? String(summary.coachSummaries.generated) : dash}
          detail={
            summary
              ? t("stats.coachSummariesDetail", {
                  today: summary.coachSummaries.generatedToday,
                  cached: summary.coachSummaries.cacheHits,
                  rejected: summary.coachSummaries.quotaRejections,
                  errors: summary.coachSummaries.errors,
                })
              : undefined
          }
        />
        <Stat
          label={t("stats.coachSummariesCost")}
          value={summary ? formatMicroUsd(summary.coachSummaries.estimatedMicroUsd) : dash}
          detail={
            summary
              ? t("stats.coachSummariesTokens", {
                  input: summary.coachSummaries.inputTokens,
                  output: summary.coachSummaries.outputTokens,
                })
              : undefined
          }
        />
      </section>

      {usage ? <CorvoUsageChart points={usageChartPoints(usage.series)} /> : null}

      {summary ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t("errors.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(summary.errorsByCode).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("errors.empty")}</p>
            ) : (
              <ul className="flex flex-wrap gap-2 text-sm" data-testid="corvo-errors-by-code">
                {Object.entries(summary.errorsByCode)
                  .sort((a, b) => b[1] - a[1])
                  .map(([code, count]) => (
                    <li key={code} className="rounded-full border px-3 py-1">
                      <span className="font-mono">{code}</span> · <span className="tabular-nums">{count}</span>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("acceptance.title")}</CardTitle>
          <CardDescription>{t("acceptance.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {sectionBody(dashboard.acceptance, (rows) => <CorvoAcceptanceTable rows={rows} />)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("nearQuota.title")}</CardTitle>
          <CardDescription>
            {t("nearQuota.subtitle", {
              free: AI_COACH_QUOTA.free.limit,
              premium: AI_COACH_QUOTA.premium.limit,
              coached: AI_COACH_QUOTA.coached.limit,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {sectionBody(dashboard.nearQuota, (rows) => <CorvoNearQuotaTable rows={rows} />)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("reports.title")}</CardTitle>
          <CardDescription>{t("reports.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {sectionBody(dashboard.reports, (rows) => <CorvoReportsTable rows={rows} />)}
        </CardContent>
      </Card>
    </div>
  );
}
