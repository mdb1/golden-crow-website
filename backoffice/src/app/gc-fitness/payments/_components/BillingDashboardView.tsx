"use client";

// gc-fitness #1695 — el Tablero de cobros (presentacional: recibe el tablero YA calculado por
// el gemelo `billing-dashboard.ts`). De arriba hacia abajo: 4 tarjetas (cobrado vs mes pasado,
// MRR, pagaron este mes + nuevos/bajas, ticket promedio) en la moneda principal + «También: …»
// para las otras (nunca se suman monedas); los dos gráficos; estado de los planes; este mes por
// medio de pago; la proyección a 3/6/12 meses con su explicación en una línea.

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import type { BillingDashboard } from "@/lib/gc-fitness/billing-dashboard";
import { cn } from "@/lib/utils";

import { ClientsFlowChart, CollectedChart } from "./BillingCharts";
import { amountIn, money, monthDelta, percent, signedPercent, type Lang } from "./dashboard-format";
import { usePaymentLabels } from "./payment-labels";

const HORIZONS = [3, 6, 12] as const;

export function BillingDashboardView({ dashboard }: { dashboard: BillingDashboard }) {
  const t = useTranslations("payments.dashboard");
  const tp = useTranslations("payments");
  const labels = usePaymentLabels();
  const lang: Lang = useLocale() === "en" ? "en" : "es";
  const [horizon, setHorizon] = useState<(typeof HORIZONS)[number]>(3);

  const primary = dashboard.primaryCurrency;
  const current = dashboard.series[dashboard.series.length - 1];
  const previous = dashboard.series[dashboard.series.length - 2];
  const collected = amountIn(current.collected, primary);
  const delta = monthDelta(collected, amountIn(previous.collected, primary));
  const others = current.collected.filter((m) => m.currency !== primary);
  const mrr = amountIn(dashboard.mrr, primary);
  const projection = dashboard.projections.find((p) => p.currency === primary) ?? null;
  const selected = projection?.horizons.find((h) => h.months === horizon) ?? null;
  const otherProjections = dashboard.projections.filter((p) => p.currency !== primary);

  const methods = [...current.byMethod].sort((a, b) =>
    a.currency === b.currency ? b.amount - a.amount : a.currency < b.currency ? -1 : 1,
  );
  const methodTotal = (currency: string) => amountIn(current.collected, currency) || 1;

  return (
    <div className="flex flex-col gap-4" data-testid="billing-dashboard">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          testId="billing-dashboard-collected"
          label={tp("collectedThisMonth")}
          value={money(lang, collected, primary)}
          detail={delta === null ? t("noLastMonth") : t("vsLastMonth", { value: signedPercent(lang, delta) })}
        />
        <Tile
          testId="billing-dashboard-mrr"
          label={t("mrr")}
          value={money(lang, mrr, primary)}
          detail={t("mrrClients", { count: dashboard.recurringClients })}
        />
        <Tile
          testId="billing-dashboard-paying"
          label={t("paying")}
          value={String(current.paying)}
          detail={t("newChurned", { new: current.newClients, churned: current.churned })}
        />
        <Tile
          testId="billing-dashboard-avg-ticket"
          label={t("avgTicket")}
          value={money(lang, amountIn(current.avgTicket, primary), primary)}
        />
      </div>
      {others.length > 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="billing-dashboard-other-currencies">
          {t("otherCurrencies", { value: others.map((m) => money(lang, m.amount, m.currency)).join(" · ") })}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CollectedChart series={dashboard.series} currency={primary} lang={lang} />
        <ClientsFlowChart series={dashboard.series} lang={lang} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-card border border-border bg-card p-5 shadow-sm" data-testid="billing-dashboard-status">
          <h3 className="mb-3 font-medium">{t("status")}</h3>
          <ul className="flex flex-col gap-2 text-sm">
            {(
              [
                ["overdue", dashboard.statusCounts.overdue, "bg-status-overdue"],
                ["due_soon", dashboard.statusCounts.dueSoon, "bg-status-due"],
                ["up_to_date", dashboard.statusCounts.upToDate, "bg-status-ok"],
              ] as const
            ).map(([state, count, dot]) => (
              <li key={state} className="flex items-center gap-2" data-testid={`billing-dashboard-status-${state}`}>
                <span className={cn("size-2.5 rounded-full", dot)} aria-hidden="true" />
                <span className="flex-1">{labels.status(state)}</span>
                <span className="font-semibold tabular-nums">{count}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-card border border-border bg-card p-5 shadow-sm" data-testid="billing-dashboard-by-method">
          <h3 className="mb-3 font-medium">{t("byMethod")}</h3>
          {methods.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("byMethodEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-2.5 text-sm">
              {methods.map((m) => (
                <li key={`${m.currency}-${m.method}`} data-testid={`billing-dashboard-method-${m.currency}-${m.method}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span>{labels.method(m.method as Parameters<typeof labels.method>[0])}</span>
                    <span className="tabular-nums">{money(lang, m.amount, m.currency)}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-muted" aria-hidden="true">
                    <div
                      className="h-1.5 rounded-full bg-chart-1"
                      style={{ width: `${Math.round((m.amount / methodTotal(m.currency)) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-card border border-border bg-card p-5 shadow-sm" data-testid="billing-dashboard-projection">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="font-medium">{t("projections")}</h3>
            <div className="flex rounded-lg border p-0.5" role="group" aria-label={t("projections")}>
              {HORIZONS.map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-pressed={horizon === h}
                  data-testid={`billing-dashboard-horizon-${h}`}
                  onClick={() => setHorizon(h)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    horizon === h ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {t("horizon", { months: h })}
                </button>
              ))}
            </div>
          </div>
          {!projection || !selected ? (
            <p className="text-sm text-muted-foreground">{t("projectionEmpty")}</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{t("projectionExpected", { months: horizon })}</p>
              <p className="text-2xl font-semibold tabular-nums" data-testid="billing-dashboard-projection-expected">
                {money(lang, selected.expected, primary)}
              </p>
              <p className="text-sm text-muted-foreground" data-testid="billing-dashboard-projection-range">
                {t("projectionRange", {
                  low: money(lang, selected.pessimistic, primary),
                  high: money(lang, selected.optimistic, primary),
                })}
              </p>
              {otherProjections.map((p) => {
                const h = p.horizons.find((x) => x.months === horizon);
                return h ? (
                  <p key={p.currency} className="text-sm text-muted-foreground">
                    {p.currency}: {money(lang, h.expected, p.currency)}
                  </p>
                ) : null;
              })}
              <p className="mt-3 text-sm" data-testid="billing-dashboard-projection-explainer">
                {dashboard.churnRate === null
                  ? t("projectionNoHistory", { mrr: money(lang, projection.mrr, primary) })
                  : t("projectionExplainer", {
                      mrr: money(lang, projection.mrr, primary),
                      rate: percent(lang, dashboard.rates.expected),
                    })}
              </p>
            </>
          )}
          <p className="mt-2 text-xs text-muted-foreground">{t("churnDefinition")}</p>
        </section>
      </div>

      <table className="sr-only" data-testid="billing-dashboard-table">
        <caption>{t("tableCaption")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("month")}</th>
            <th scope="col">{tp("collectedThisMonth")}</th>
            <th scope="col">{t("paying")}</th>
            <th scope="col">{t("legendNew")}</th>
            <th scope="col">{t("legendChurned")}</th>
          </tr>
        </thead>
        <tbody>
          {dashboard.series.map((m) => (
            <tr key={m.month}>
              <th scope="row">{m.month}</th>
              <td>{m.collected.map((c) => money(lang, c.amount, c.currency)).join(" · ") || money(lang, 0, primary)}</td>
              <td>{m.paying}</td>
              <td>{m.newClients}</td>
              <td>{m.churned}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tile({ label, value, detail, testId }: { label: string; value: string; detail?: string; testId: string }) {
  return (
    <div className="rounded-xl border bg-card p-4" data-testid={testId}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums" data-testid={`${testId}-value`}>
        {value}
      </div>
      {detail ? (
        <div className="mt-0.5 text-xs text-muted-foreground" data-testid={`${testId}-detail`}>
          {detail}
        </div>
      ) : null}
    </div>
  );
}
