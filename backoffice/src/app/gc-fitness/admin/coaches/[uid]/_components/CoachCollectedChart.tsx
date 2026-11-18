"use client";

// CoachCollectedChart — #534: what a coach collected per month (one currency, the one with
// most money in the window), last 12 months zero-filled by the server. One series ⇒ one
// color, no legend; the table view (rendered by the parent) carries every currency.

import { useLocale, useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { MonthTotal } from "@/lib/gc-fitness/admin-coach-overview-model";

import { langOf, money, monthLabel } from "./overview-format";

export function CoachCollectedChart({ monthly, currency }: { monthly: MonthTotal[]; currency: string }) {
  const t = useTranslations("admin.coachDetail.overview.billing");
  const lang = langOf(useLocale());
  const data = monthly
    .filter((m) => m.currency === currency)
    .map((m) => ({ label: monthLabel(lang, m.month), amount: m.amount, payments: m.payments }));

  return (
    <div data-testid="coach-collected-chart">
      <p className="mb-2 text-sm font-medium">{t("chartTitle", { currency })}</p>
      <div className="h-52 w-full rounded-md border bg-muted/20 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--muted-foreground)" strokeOpacity={0.16} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={64}
              tickFormatter={(v: number) => money(lang, v, currency)}
            />
            <Tooltip
              cursor={{ fill: "var(--muted-foreground)", fillOpacity: 0.1 }}
              formatter={(v) => money(lang, Number(v), currency)}
              contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)", fontSize: 12 }}
            />
            <Bar dataKey="amount" name={t("chartTitle", { currency })} fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
