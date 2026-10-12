"use client";

// CorvoUsageChart — messages per UTC day for /gc-fitness/admin/corvo (#1330).
// Stacked bars: turns the model answered + messages the quota or the pre-screen
// rejected (those never reached the model, so they cost nothing but they ARE
// demand). The server ships one zero-filled point per day; no reads here.

import { useLocale, useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatCivilDateLabel } from "@/lib/gc-fitness/civil-date";
import type { UsageChartPoint } from "@/lib/gc-fitness/ai-coach-admin-model";

export function CorvoUsageChart({ points }: { points: UsageChartPoint[] }) {
  const t = useTranslations("corvoAdmin.chart");
  const locale = useLocale();
  const hasData = points.some((p) => p.turns + p.quotaRejections + p.prescreenBlocked > 0);
  const data = points.map((p) => ({
    ...p,
    label: formatCivilDateLabel(p.date, { month: "short", day: "numeric" }, locale),
  }));

  return (
    <section className="rounded-[1.25rem] border border-border bg-card p-5 shadow-sm" data-testid="corvo-usage-chart">
      <div className="mb-3">
        <h2 className="font-medium">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      {!hasData ? (
        <div className="flex h-32 items-center justify-center rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <div className="h-60 w-full rounded-md border bg-muted/20 p-2 sm:p-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--muted-foreground)" strokeOpacity={0.16} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={34} />
              <Tooltip
                cursor={{ fill: "var(--muted-foreground)", fillOpacity: 0.1 }}
                contentStyle={{ borderRadius: 10, border: "1px solid hsl(var(--border))", background: "hsl(var(--background))" }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="turns" name={t("turns")} stackId="m" fill="var(--chart-1)" maxBarSize={28} />
              <Bar dataKey="quotaRejections" name={t("quotaRejections")} stackId="m" fill="var(--chart-2)" maxBarSize={28} />
              <Bar dataKey="prescreenBlocked" name={t("prescreenBlocked")} stackId="m" fill="var(--chart-3)" radius={[3, 3, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
