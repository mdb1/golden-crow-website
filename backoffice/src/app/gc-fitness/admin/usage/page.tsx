// /gc-fitness/admin/usage — product usage per feature (golden-crow-website#530).
//
// Reads ONLY `usage_daily/{day}` (one rollup per Buenos Aires civil day, written at 03:30 by
// the gc-fitness function `computeUsageDaily`; contract gc-fitness
// .planning/schemas/usage_daily.md): ≤ 2 × range docs per view. `?range=7|30|90`.
// Reader: `usage-actions.ts`; shaping: `usage-model.ts`.

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/gc-fitness/page-header";
import { formatMicroUsd } from "@/lib/gc-fitness/ai-coach-admin-model";
import { getCurrentAdmin } from "@/lib/gc-fitness/auth-helpers";
import { formatCivilDateLabel } from "@/lib/gc-fitness/civil-date";
import { sectionMetadata } from "@/lib/gc-fitness/page-metadata";
import { loadUsageDashboard, type UsageDashboardData } from "@/lib/gc-fitness/usage-actions";
import {
  USAGE_RANGES,
  activitySeries,
  adoptionRanking,
  corvoSummary,
  dayKeys,
  delta,
  familySeries,
  latestRetention,
  parseUsageRange,
  periodTotals,
  zeroFill,
} from "@/lib/gc-fitness/usage-model";
import { cn } from "@/lib/utils";

import { ActivityChart, CorvoDailyChart, FamiliesChart, SegmentsChart } from "./_components/UsageCharts";
import { AdoptionPanel, CorvoPanel, KpiTiles, RetentionTable, type KpiTile } from "./_components/UsagePanels";

export const generateMetadata = () => sectionMetadata("adminPanel");

export const dynamic = "force-dynamic";

export default async function UsageAdminPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    await getCurrentAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") redirect("/gc-fitness/forbidden");
    throw err;
  }

  const t = await getTranslations("usageAdmin");
  const locale = await getLocale();
  const range = parseUsageRange(((await searchParams) ?? {}).range);
  let data: UsageDashboardData | null = null;
  let loadError: string | null = null;
  try {
    data = await loadUsageDashboard(range);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Forbidden") redirect("/gc-fitness/forbidden");
    loadError = message.slice(0, 300);
  }

  const current = data ? zeroFill(dayKeys(data.lastDay, range), data.current) : [];
  const previousKeys = data ? dayKeys(dayKeys(data.lastDay, range)[0], range + 1).slice(0, range) : [];
  const previous = data ? zeroFill(previousKeys, data.previous) : [];
  const now = periodTotals(current);
  const before = periodTotals(previous);
  const prevHas = before.daysWithData > 0;
  const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
  const corvo = corvoSummary(current);

  const tiles: KpiTile[] = [
    { id: "dau", label: t("kpi.dau"), value: fmt.format(now.avgDau), delta: delta(now.avgDau, before.avgDau, prevHas) },
    { id: "wau", label: t("kpi.wau"), value: fmt.format(now.wau), delta: delta(now.wau, before.wau, prevHas), detail: t("kpi.mauDetail", { mau: now.mau }) },
    { id: "signups", label: t("kpi.signups"), value: fmt.format(now.signups), delta: delta(now.signups, before.signups, prevHas) },
    { id: "workouts", label: t("kpi.workouts"), value: fmt.format(now.workouts), delta: delta(now.workouts, before.workouts, prevHas) },
    {
      id: "corvo",
      label: t("kpi.corvoMessages"),
      value: fmt.format(now.corvoMessages),
      delta: delta(now.corvoMessages, before.corvoMessages, prevHas),
      detail: t("kpi.corvoDetail", { userDays: now.corvoUserDays, cost: formatMicroUsd(corvo.estimatedMicroUsd) }),
    },
    {
      id: "acceptance",
      label: t("kpi.acceptance"),
      value: pct(now.acceptance),
      delta: delta(now.acceptance, before.acceptance, prevHas),
    },
    { id: "premium", label: t("kpi.premium"), value: fmt.format(now.premiumPurchases), delta: delta(now.premiumPurchases, before.premiumPurchases, prevHas) },
    { id: "reports", label: t("kpi.reports"), value: fmt.format(now.reports), delta: delta(now.reports, before.reports, prevHas) },
  ];

  const weekLabel = (week: string) => formatCivilDateLabel(week, { month: "short", day: "numeric" }, locale);

  return (
    <div className="usage-viz gc-page flex flex-col gap-6">
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

      <div className="-mt-3 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={t("rangeLabel")} className="flex gap-2" data-testid="usage-range">
          {USAGE_RANGES.map((r) => (
            <Link
              key={r}
              href={`/gc-fitness/admin/usage?range=${r}`}
              aria-current={r === range ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                r === range ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              {t("rangeDays", { days: r })}
            </Link>
          ))}
        </nav>
        {data ? (
          <p className="text-xs text-muted-foreground">
            {t("dataThrough", { day: data.lastDay, days: now.daysWithData, range })}
          </p>
        ) : null}
      </div>

      {loadError ? <p className="text-sm text-destructive">{t("loadError", { error: loadError })}</p> : null}
      {data && now.daysWithData === 0 ? (
        <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground" data-testid="usage-no-data">
          {t("noData")}
        </p>
      ) : null}

      <KpiTiles tiles={tiles} />

      <section className="grid gap-4 xl:grid-cols-2">
        <ActivityChart points={activitySeries(current)} />
        <SegmentsChart points={activitySeries(current)} />
      </section>

      <FamiliesChart points={familySeries(current)} />

      <AdoptionPanel rows={adoptionRanking(current)} />

      <CorvoDailyChart points={corvo.daily} />
      <CorvoPanel summary={corvo} />

      <RetentionTable data={latestRetention(current)} weekLabel={weekLabel} />

      <p className="text-xs text-muted-foreground">{t("footnote")}</p>
    </div>
  );
}
