"use client";

// gc-fitness #1695 — los dos gráficos del Tablero de cobros.
//
//   - «Cobrado por mes»: UNA serie (la moneda principal), barras con ÉNFASIS: el mes en curso
//     en el color de la serie y los otros 11 atenuados (dataviz: una serie es el punto, el resto
//     es contexto). Nunca se suman monedas distintas.
//   - «Altas y bajas»: barras divergentes sobre el cero — nuevos hacia arriba (`--chart-1`,
//     frío) y bajas hacia abajo (`--chart-2`, cálido), con leyenda. Validado con el
//     validador de dataviz (light pasa todo; dark: los tokens existentes salen apenas fuera de
//     la banda de luminosidad, por eso van la leyenda y la tabla de lectura).
//
// jsdom no mide nada y Recharts no monta el cuerpo del gráfico (README → «jsdom gaps»): cada
// gráfico lleva una TABLA de lectura (`sr-only`) armada del MISMO arreglo que recibe el
// gráfico — es la vista accesible y lo que leen los tests.

import { useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { MonthStats } from "@/lib/gc-fitness/billing-dashboard";

import { amountIn, money, monthLabel, type Lang } from "./dashboard-format";

const TOOLTIP_STYLE = {
  borderRadius: 10,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--background))",
};

function compactMoney(lang: Lang, value: number): string {
  return new Intl.NumberFormat(lang === "es" ? "es-AR" : "en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function CollectedChart({
  series,
  currency,
  lang,
}: {
  series: MonthStats[];
  currency: string;
  lang: Lang;
}) {
  const t = useTranslations("payments.dashboard");
  const current = series[series.length - 1]?.month ?? "";
  const data = series.map((m) => ({
    month: m.month,
    label: monthLabel(lang, m.month, current),
    amount: amountIn(m.collected, currency),
    isCurrent: m.month === current,
  }));

  return (
    <section className="rounded-card border border-border bg-card p-5 shadow-sm" data-testid="billing-dashboard-chart-collected">
      <h3 className="font-medium">{t("chartCollected")}</h3>
      <p className="mb-3 text-sm text-muted-foreground">{t("chartCollectedCaption", { currency })}</p>
      <div className="h-48 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--muted-foreground)" strokeOpacity={0.16} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => compactMoney(lang, v)} />
            <Tooltip
              cursor={{ fill: "var(--muted-foreground)", fillOpacity: 0.1 }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => [money(lang, Number(value), currency), t("chartCollected")]}
            />
            <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={32}>
              {data.map((d) => (
                <Cell key={d.month} fill="var(--chart-1)" fillOpacity={d.isCurrent ? 1 : 0.35} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only" data-testid="billing-dashboard-chart-collected-table">
        <caption>{t("chartCollectedCaption", { currency })}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.month} data-month={d.month}>
              <th scope="row">{d.label}</th>
              <td>{money(lang, d.amount, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function ClientsFlowChart({ series, lang }: { series: MonthStats[]; lang: Lang }) {
  const t = useTranslations("payments.dashboard");
  const current = series[series.length - 1]?.month ?? "";
  const newLabel = t("legendNew");
  const churnedLabel = t("legendChurned");
  const data = series.map((m) => ({
    month: m.month,
    label: monthLabel(lang, m.month, current),
    newClients: m.newClients,
    // Hacia abajo: una baja es la mitad negativa del mismo eje (un solo eje, nunca dos).
    churned: -m.churned,
  }));

  return (
    <section className="rounded-card border border-border bg-card p-5 shadow-sm" data-testid="billing-dashboard-chart-clients">
      <h3 className="mb-3 font-medium">{t("chartClients")}</h3>
      <div className="h-48 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} stackOffset="sign" margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--muted-foreground)" strokeOpacity={0.16} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={8} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} tickFormatter={(v: number) => String(Math.abs(v))} />
            <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
            <Tooltip
              cursor={{ fill: "var(--muted-foreground)", fillOpacity: 0.1 }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(value, name) => [String(Math.abs(Number(value))), name === "churned" ? churnedLabel : newLabel]}
            />
            <Legend
              verticalAlign="top"
              height={24}
              iconType="circle"
              formatter={(value) => <span className="text-xs text-muted-foreground">{value === "churned" ? churnedLabel : newLabel}</span>}
            />
            <Bar dataKey="newClients" stackId="flow" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="churned" stackId="flow" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only" data-testid="billing-dashboard-chart-clients-table">
        <caption>{t("chartClients")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("month")}</th>
            <th scope="col">{newLabel}</th>
            <th scope="col">{churnedLabel}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.month} data-month={d.month}>
              <th scope="row">{d.label}</th>
              <td>{d.newClients}</td>
              <td>{-d.churned}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
