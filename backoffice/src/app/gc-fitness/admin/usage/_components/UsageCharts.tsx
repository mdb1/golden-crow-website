"use client";

// UsageCharts — the time-series charts of /gc-fitness/admin/usage (golden-crow-website#530).
// Recharts, like CorvoUsageChart. Colors are the validated `--viz-*` tokens (globals.css,
// `.usage-viz`) in FIXED slot order — a series keeps its color in every range. Every chart:
// legend (≥ 2 series), hover tooltip, recessive grid, one y-axis, and a table view
// (<details>) so nothing is color-only and the light-mode sub-3:1 slots have relief.

import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCivilDateLabel } from "@/lib/gc-fitness/civil-date";
import {
  FEATURE_FAMILIES,
  type ActivityPoint,
  type FamilyPoint,
} from "@/lib/gc-fitness/usage-model";

const AXIS_TICK = { fontSize: 11, fill: "var(--muted-foreground)" };
const TOOLTIP_STYLE = {
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  fontSize: 12,
};

function ChartFrame({
  testId,
  title,
  subtitle,
  empty,
  emptyText,
  chart,
  table,
  tableLabel,
}: {
  testId: string;
  title: string;
  subtitle?: string;
  empty: boolean;
  emptyText: string;
  chart: ReactNode;
  table: ReactNode;
  tableLabel: string;
}) {
  return (
    <section className="rounded-card border border-border bg-card p-5 shadow-sm" data-testid={testId}>
      <div className="mb-3">
        <h2 className="font-medium">{title}</h2>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {empty ? (
        <div className="flex h-32 items-center justify-center rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <>
          <div className="h-64 w-full">{chart}</div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted-foreground">{tableLabel}</summary>
            <div className="mt-2 max-h-72 overflow-auto">{table}</div>
          </details>
        </>
      )}
    </section>
  );
}

function DataTable({ head, rows, testId }: { head: string[]; rows: Array<Array<string | number>>; testId: string }) {
  return (
    <table className="w-full text-left text-xs tabular-nums" data-testid={testId}>
      <thead>
        <tr className="border-b">
          {head.map((h) => (
            <th key={h} scope="col" className="px-2 py-1 font-medium text-muted-foreground">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={String(r[0])} className="border-b border-border/50">
            {r.map((c, i) => (
              <td key={i} className="px-2 py-1">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function useDayLabel() {
  const locale = useLocale();
  return (day: string) => formatCivilDateLabel(day, { month: "short", day: "numeric" }, locale);
}

/** DAU / WAU / MAU — three lines, one unit (users), one axis. */
export function ActivityChart({ points }: { points: ActivityPoint[] }) {
  const t = useTranslations("usageAdmin.charts.activity");
  const label = useDayLabel();
  const data = points.map((p) => ({ ...p, label: label(p.day) }));
  const empty = !points.some((p) => p.dau + p.wau + p.mau > 0);
  const series = [
    { key: "dau", name: t("dau"), color: "var(--viz-1)" },
    { key: "wau", name: t("wau"), color: "var(--viz-2)" },
    { key: "mau", name: t("mau"), color: "var(--viz-3)" },
  ] as const;
  return (
    <ChartFrame
      testId="usage-activity-chart"
      title={t("title")}
      subtitle={t("subtitle")}
      empty={empty}
      emptyText={t("empty")}
      tableLabel={t("table")}
      chart={
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={36} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.4 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: "var(--viz-surface)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      }
      table={
        <DataTable
          testId="usage-activity-table"
          head={[t("day"), t("dau"), t("wau"), t("mau"), t("coached"), t("coachless"), t("guest"), t("coach")]}
          rows={points.map((p) => [p.day, p.dau, p.wau, p.mau, p.coached, p.coachless, p.guest, p.coach])}
        />
      }
    />
  );
}

/** Daily actives stacked by segment (4 slots). */
export function SegmentsChart({ points }: { points: ActivityPoint[] }) {
  const t = useTranslations("usageAdmin.charts.activity");
  const tc = useTranslations("usageAdmin.charts.segments");
  const label = useDayLabel();
  const data = points.map((p) => ({ ...p, label: label(p.day) }));
  const empty = !points.some((p) => p.dau > 0);
  const series = [
    { key: "coached", color: "var(--viz-1)" },
    { key: "coachless", color: "var(--viz-2)" },
    { key: "guest", color: "var(--viz-3)" },
    { key: "coach", color: "var(--viz-4)" },
  ] as const;
  return (
    <ChartFrame
      testId="usage-segments-chart"
      title={tc("title")}
      subtitle={tc("subtitle")}
      empty={empty}
      emptyText={t("empty")}
      tableLabel={t("table")}
      chart={
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={36} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted-foreground)", fillOpacity: 0.08 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={t(s.key)}
                stackId="seg"
                fill={s.color}
                stroke="var(--viz-surface)"
                strokeWidth={2}
                maxBarSize={28}
                radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      }
      table={
        <DataTable
          testId="usage-segments-table"
          head={[t("day"), t("coached"), t("coachless"), t("guest"), t("coach")]}
          rows={points.map((p) => [p.day, p.coached, p.coachless, p.guest, p.coach])}
        />
      }
    />
  );
}

/** Events per feature family per day — 8 families = the 8 categorical slots, fixed order. */
export function FamiliesChart({ points }: { points: FamilyPoint[] }) {
  const t = useTranslations("usageAdmin.charts.families");
  const tf = useTranslations("usageAdmin.families");
  const label = useDayLabel();
  const data = points.map((p) => ({ ...p, label: label(p.day) }));
  const empty = !points.some((p) => FEATURE_FAMILIES.some((f) => p[f] > 0));
  return (
    <ChartFrame
      testId="usage-families-chart"
      title={t("title")}
      subtitle={t("subtitle")}
      empty={empty}
      emptyText={t("empty")}
      tableLabel={t("table")}
      chart={
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted-foreground)", fillOpacity: 0.08 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {FEATURE_FAMILIES.map((fam, i) => (
              <Bar
                key={fam}
                dataKey={fam}
                name={tf(fam)}
                stackId="fam"
                fill={`var(--viz-${i + 1})`}
                stroke="var(--viz-surface)"
                strokeWidth={2}
                maxBarSize={28}
                radius={i === FEATURE_FAMILIES.length - 1 ? [4, 4, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      }
      table={
        <DataTable
          testId="usage-families-table"
          head={[t("day"), ...FEATURE_FAMILIES.map((f) => tf(f))]}
          rows={points.map((p) => [p.day, ...FEATURE_FAMILIES.map((f) => p[f])])}
        />
      }
    />
  );
}

/** Corvo messages per day (single series: no legend box, the title names it). */
export function CorvoDailyChart({ points }: { points: Array<{ day: string; messages: number; users: number }> }) {
  const t = useTranslations("usageAdmin.charts.corvo");
  const label = useDayLabel();
  const data = points.map((p) => ({ ...p, label: label(p.day) }));
  const empty = !points.some((p) => p.messages > 0);
  return (
    <ChartFrame
      testId="usage-corvo-chart"
      title={t("title")}
      subtitle={t("subtitle")}
      empty={empty}
      emptyText={t("empty")}
      tableLabel={t("table")}
      chart={
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={36} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted-foreground)", fillOpacity: 0.08 }} />
            <Bar dataKey="messages" name={t("messages")} fill="var(--viz-1)" maxBarSize={28} radius={[4, 4, 0, 0]} isAnimationActive={false} />          </BarChart>
        </ResponsiveContainer>
      }
      table={
        <DataTable
          testId="usage-corvo-table"
          head={[t("day"), t("messages"), t("users")]}
          rows={points.map((p) => [p.day, p.messages, p.users])}
        />
      }
    />
  );
}
