"use client";

// gc-fitness #1695 — «Facturación»: los pagos de la ventana del tablero (15 meses) filtrados
// por mes / cliente / plan / medio, el total por moneda (sin anulados, nunca mezcladas) y
// «Exportar CSV» de lo filtrado (el mismo `buildPaymentsCsv` del historial). Todo en memoria:
// la ventana ya vino con el tablero, filtrar no lee Firestore. El historial completo sigue en
// la pestaña Historial.

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Download } from "lucide-react";

import { FormSelect } from "@/components/gc-fitness/form-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/gc-fitness/billing";
import {
  billingMonthOptions,
  billingPlanOptions,
  filterBillingPayments,
} from "@/lib/gc-fitness/billing-dashboard";
import { buildPaymentsCsv, sumByCurrency, type ClientPaymentView } from "@/lib/gc-fitness/payments-model";
import { cn } from "@/lib/utils";

import { downloadCsv, money, monthLabel, type Lang } from "./dashboard-format";
import { usePaymentLabels } from "./payment-labels";
import type { ClientOption } from "./types";

interface Props {
  payments: ClientPaymentView[];
  clients: ClientOption[];
  todayCivil: string;
}

export function BillingLedger({ payments, clients, todayCivil }: Props) {
  const t = useTranslations("payments");
  const labels = usePaymentLabels();
  const lang: Lang = useLocale() === "en" ? "en" : "es";
  const [filter, setFilter] = useState<{ month: string; clientId: string; planName: string; method: string }>({ month: "", clientId: "", planName: "", method: "" });

  const names = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);
  const nameOf = (id: string) => names.get(id) ?? id;
  const rows = useMemo(() => filterBillingPayments(payments, filter), [payments, filter]);
  const totals = sumByCurrency(rows);
  const months = useMemo(() => billingMonthOptions(payments), [payments]);
  const plans = useMemo(() => billingPlanOptions(payments), [payments]);
  // Clientes del filtro: los actuales + los de pagos de ex clientes (con su id, sin nombre).
  const clientOptions = useMemo(() => {
    const ids = new Set(clients.map((c) => c.id));
    const former = [...new Set(payments.map((p) => p.clientId))].filter((id) => !ids.has(id)).sort();
    return [...clients.map((c) => ({ value: c.id, label: c.name })), ...former.map((id) => ({ value: id, label: id }))];
  }, [clients, payments]);
  const currentYm = todayCivil.slice(0, 7);

  function exportCsv() {
    const csv = buildPaymentsCsv(rows, {
      headers: [
        t("csv.date"),
        t("csv.client"),
        t("csv.amount"),
        t("csv.currency"),
        t("csv.method"),
        t("csv.methodNote"),
        t("csv.covers"),
        t("csv.plan"),
        t("csv.note"),
        t("csv.status"),
      ],
      clientName: nameOf,
      method: labels.method,
      covers: labels.covers,
      voided: t("voided"),
    });
    downloadCsv(csv, `cobros-${todayCivil}.csv`);
  }

  return (
    <section className="flex flex-col gap-3" data-testid="billing-ledger">
      <div>
        <h3 className="font-medium">{t("billing.title")}</h3>
        <p className="text-sm text-muted-foreground">{t("billing.windowNote")}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <FormSelect
          aria-label={t("billing.allMonths")}
          data-testid="billing-filter-month"
          className="w-40 data-[size=default]:h-9"
          value={filter.month}
          onValueChange={(v) => setFilter({ ...filter, month: v })}
          options={[
            { value: "", label: t("billing.allMonths") },
            ...months.map((m) => ({ value: m, label: monthLabel(lang, m, currentYm) })),
          ]}
        />
        <FormSelect
          aria-label={t("history.allClients")}
          data-testid="billing-filter-client"
          className="w-52 data-[size=default]:h-9"
          value={filter.clientId}
          onValueChange={(v) => setFilter({ ...filter, clientId: v })}
          options={[{ value: "", label: t("history.allClients") }, ...clientOptions]}
        />
        <FormSelect
          aria-label={t("billing.allPlans")}
          data-testid="billing-filter-plan"
          className="w-48 data-[size=default]:h-9"
          value={filter.planName}
          onValueChange={(v) => setFilter({ ...filter, planName: v })}
          options={[{ value: "", label: t("billing.allPlans") }, ...plans.map((p) => ({ value: p, label: p }))]}
        />
        <FormSelect
          aria-label={t("history.allMethods")}
          data-testid="billing-filter-method"
          className="w-44 data-[size=default]:h-9"
          value={filter.method}
          onValueChange={(v) => setFilter({ ...filter, method: v })}
          options={[
            { value: "", label: t("history.allMethods") },
            ...PAYMENT_METHODS.map((m) => ({ value: m, label: labels.method(m) })),
          ]}
        />
        <Button variant="outline" className="ml-auto" onClick={exportCsv} disabled={rows.length === 0} data-testid="billing-export-csv">
          <Download className="size-4" />
          {t("billing.export")}
        </Button>
      </div>

      <p className="text-sm" data-testid="billing-total">
        <span className="text-muted-foreground">{t("billing.total")}: </span>
        <span className="font-semibold tabular-nums">
          {totals.length === 0 ? "—" : totals.map((m) => money(lang, m.amount, m.currency)).join(" · ")}
        </span>
      </p>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground" data-testid="billing-empty">
              {t("billing.empty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("date")}</TableHead>
                  <TableHead>{t("client")}</TableHead>
                  <TableHead>{t("amount")}</TableHead>
                  <TableHead>{t("method.title")}</TableHead>
                  <TableHead>{t("plan")}</TableHead>
                  <TableHead className="text-right">{t("csv.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id} data-testid={`billing-row-${p.id}`} className={p.voidedAt ? "text-muted-foreground" : undefined}>
                    <TableCell>{labels.date(p.paidCivil)}</TableCell>
                    <TableCell>{nameOf(p.clientId)}</TableCell>
                    <TableCell className={cn("tabular-nums", p.voidedAt && "line-through")}>{money(lang, p.amount, p.currency)}</TableCell>
                    <TableCell>{labels.method(p.method as PaymentMethod)}</TableCell>
                    <TableCell>{p.planName ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {p.voidedAt ? <Badge variant="secondary">{t("voided")}</Badge> : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
